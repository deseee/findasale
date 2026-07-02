/**
 * California — Secondary Sale Business Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — City/municipal business license data
 *
 * DATA SOURCES (both live):
 *
 * Source A — Los Angeles City Business Licenses (Socrata)
 *   https://data.lacity.org/resource/6rrh-rzua.json
 *   Dataset: ~619k active business licenses with NAICS codes.
 *   Strategy: filter by NAICS codes for used merchandise (453310), antique dealers (453920),
 *   jewelry/pawn wholesale (423940, 423930), then keyword-match business name for pawn/auction.
 *   Note: CA DOJ secondhand dealer / pawnbroker licensing data has no public API
 *   (DOJ portal requires Public Records Act request). LA municipal data is the best
 *   available open source for this state.
 *
 * Source B — San Francisco Business Registrations (Socrata)
 *   https://data.sfgov.org/resource/g8m3-pdis.json
 *   Dataset: ~90k active business registrations with NAICS and lic_code_description.
 *   Strategy: lic_code_description = 'PAWNBROKER' (always include) plus NAICS 453310
 *   (used merchandise) and keyword-match on business name.
 *
 * CA DOJ path (if a statewide dataset becomes available):
 *   Public Records Act request to oag.ca.gov for secondhand dealer licensee list (CSV/XLSX).
 *   CA BreEZe (breeze.ca.gov) covers DCA boards but NOT DOJ pawn licensing.
 *
 * Uses Socrata $limit/$offset pagination (PAGE_SIZE=5000 for LA, 1000 for SF).
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

// ─── Los Angeles ────────────────────────────────────────────────────────────
const LA_SOCRATA_URL = 'https://data.lacity.org/resource/6rrh-rzua.json';
const LA_DOMAIN = 'data.lacity.org';

// ─── San Francisco ───────────────────────────────────────────────────────────
const SF_SOCRATA_URL = 'https://data.sfgov.org/resource/g8m3-pdis.json';
const SF_DOMAIN = 'data.sfgov.org';

const PAGE_SIZE = 5000;

// LA NAICS codes covering our target categories
// 453310 = Used merchandise stores (thrift, resale, used goods)
// 453920 = Art dealers (antiques, galleries — keyword filtered)
// 423940 = Jewelry/watch/precious metals wholesale (pawn adjacent — keyword filtered)
// 423930 = Recyclable materials merchant (some pawn shops classify here — keyword filtered)
const LA_ALWAYS_INCLUDE_NAICS = new Set(['453310']);
const LA_KEYWORD_NAICS = new Set(['453920', '423940', '423930']);

// SF lic_code_description values that always indicate our target category
const SF_ALWAYS_INCLUDE_LIC = new Set(['PAWNBROKER']);
// SF NAICS for broader match requiring keyword filter
const SF_KEYWORD_NAICS = new Set(['453310', '453920']);

// Keywords that confirm a business is in-scope (case-insensitive substring match)
const SALE_TYPE_KEYWORDS = [
  'pawn',
  'estate sale',
  'consign',
  'thrift',
  'resale',
  'antique',
  'vintage',
  'collectible',
  'flea market',
  'swap meet',
  'liquidat',
  'salvage',
  'auction',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
  'used goods',
  'junk dealer',
  'used merchandise',
];

// False-positive fragments — exclude row if business name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'restaurant',
  'petroleum',
  'dental',
  'medical',
  'pharmacy',
  'funeral',
  'insurance',
  'tax service',
  'accounting',
  'attorney',
  'law office',
  'landscaping',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'automotive repair',
  'auto repair',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
  'pawnee', // geographic name, not pawn shop
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(naics: string, licCode?: string): string {
  if (licCode && licCode.toUpperCase().includes('PAWN')) return 'PAWN_SHOP';
  if (naics === '423940' || naics === '423930') return 'PAWN_SHOP';
  if (naics === '453920') return 'ANTIQUE_MALL';
  return 'RESALE_SHOP';
}

// ─── Los Angeles scraper ─────────────────────────────────────────────────────

async function runLASection(): Promise<{ fetched: number; matched: number; upserted: number }> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  const batchRows: ScrapedOrganizerRow[] = [];
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;

  console.log('[CaliforniaPhase2/LA] Starting — source:', LA_SOCRATA_URL);

  while (hasMore) {
    await defaultRateLimiter.waitBeforeRequest(LA_DOMAIN);

    // Server-side NAICS filter: only fetch used merchandise, antiques, pawn-adjacent categories.
    // Client-side keyword filtering remains as a secondary safety net.
    const LA_NAICS_WHERE = `naics IN ('453310','453920','423940','423930')`;
    const params = new URLSearchParams({
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
      $where: LA_NAICS_WHERE,
    });
    const url = `${LA_SOCRATA_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(`[CaliforniaPhase2/LA] HTTP ${response.status} at offset ${offset}`);
      break;
    }

    const rows = (await response.json()) as Record<string, string>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[CaliforniaPhase2/LA] No more records at offset ${offset}`);
      break;
    }

    if (!columnsLogged) {
      console.log('[CaliforniaPhase2/LA] Columns:', Object.keys(rows[0]).join(', '));
      columnsLogged = true;
    }

    totalFetched += rows.length;

    for (const row of rows) {
      try {
        const naics = (row['naics'] ?? '').trim();
        const businessName = (row['business_name'] ?? '').trim();
        if (!businessName) continue;

        const alwaysInclude = LA_ALWAYS_INCLUDE_NAICS.has(naics);
        const broaderMatch = LA_KEYWORD_NAICS.has(naics) && nameMatchesKeyword(businessName);

        if (!alwaysInclude && !broaderMatch) continue;
        if (nameIsExcluded(businessName)) continue;

        totalMatched++;

        const city = (row['city'] ?? 'Los Angeles').trim();
        const address = (row['street_address'] ?? '').trim();
        const locationAccount = (row['location_account'] ?? '').trim();

        const slugifiedName = businessName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        const dedupeKey = `CA-SECONDARY-${locationAccount || slugifiedName}`;
        const businessCategory = mapCategory(naics);

        console.log(`[CaliforniaPhase2/LA] Matched: ${dedupeKey} — ${businessName} (NAICS ${naics})`);

        batchRows.push({
          businessName,
          sourceName: 'CaliforniaPhase2',
          city,
          state: 'CA',
          businessCategory,
        });
      } catch (rowErr) {
        console.error('[CaliforniaPhase2/LA] Row error:', rowErr);
      }
    }

    offset += rows.length;
    if (rows.length < PAGE_SIZE) hasMore = false;
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  totalUpserted = ids.filter((id) => id !== null).length;

  return { fetched: totalFetched, matched: totalMatched, upserted: totalUpserted };
}

// ─── San Francisco scraper ───────────────────────────────────────────────────

async function runSFSection(): Promise<{ fetched: number; matched: number; upserted: number }> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  const batchRows: ScrapedOrganizerRow[] = [];
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;

  console.log('[CaliforniaPhase2/SF] Starting — source:', SF_SOCRATA_URL);

  while (hasMore) {
    await defaultRateLimiter.waitBeforeRequest(SF_DOMAIN);

    // Server-side filter: only fetch pawnbrokers (lic_code_description) and used-merchandise NAICS.
    // Client-side keyword filtering remains as a secondary safety net.
    const SF_WHERE = `lic_code_description='PAWNBROKER' OR naic_code IN ('453310','453920')`;
    const params = new URLSearchParams({
      $limit: String(1000),
      $offset: String(offset),
      $where: SF_WHERE,
    });
    const url = `${SF_SOCRATA_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(`[CaliforniaPhase2/SF] HTTP ${response.status} at offset ${offset}`);
      break;
    }

    const rows = (await response.json()) as Record<string, string>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[CaliforniaPhase2/SF] No more records at offset ${offset}`);
      break;
    }

    if (!columnsLogged) {
      console.log('[CaliforniaPhase2/SF] Columns:', Object.keys(rows[0]).join(', '));
      columnsLogged = true;
    }

    totalFetched += rows.length;

    for (const row of rows) {
      try {
        const licCode = (row['lic_code_description'] ?? '').trim().toUpperCase();
        const naics = (row['naic_code'] ?? '').trim();
        const dbaName = (row['dba_name'] ?? '').trim();
        const ownerName = (row['ownership_name'] ?? '').trim();
        const businessName = dbaName || ownerName;
        if (!businessName) continue;

        const alwaysInclude = SF_ALWAYS_INCLUDE_LIC.has(licCode);
        const broaderMatch = SF_KEYWORD_NAICS.has(naics) && nameMatchesKeyword(businessName);

        if (!alwaysInclude && !broaderMatch) continue;
        if (nameIsExcluded(businessName)) continue;

        totalMatched++;

        const address = (row['full_business_address'] ?? '').trim();
        const certNum = (row['certificate_number'] ?? '').trim();

        const slugifiedName = businessName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        const dedupeKey = `CA-SECONDARY-SF-${certNum || slugifiedName}`;
        const businessCategory = mapCategory(naics, licCode);

        console.log(`[CaliforniaPhase2/SF] Matched: ${dedupeKey} — ${businessName} (${licCode || 'NAICS ' + naics})`);

        batchRows.push({
          businessName,
          sourceName: 'CaliforniaPhase2',
          city: 'San Francisco',
          state: 'CA',
          businessCategory,
        });
      } catch (rowErr) {
        console.error('[CaliforniaPhase2/SF] Row error:', rowErr);
      }
    }

    offset += rows.length;
    if (rows.length < 1000) hasMore = false;
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  totalUpserted = ids.filter((id) => id !== null).length;

  return { fetched: totalFetched, matched: totalMatched, upserted: totalUpserted };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runCaliforniaPhase2Scraper(): Promise<void> {
  console.log('[CaliforniaPhase2] Starting — LA city licenses + SF business registrations');

  try {
    const la = await runLASection();
    console.log(`[CaliforniaPhase2/LA] Done — fetched: ${la.fetched}, matched: ${la.matched}, upserted: ${la.upserted}`);

    const sf = await runSFSection();
    console.log(`[CaliforniaPhase2/SF] Done — fetched: ${sf.fetched}, matched: ${sf.matched}, upserted: ${sf.upserted}`);

    console.log(
      `[CaliforniaPhase2] Complete — total fetched: ${la.fetched + sf.fetched}, matched: ${la.matched + sf.matched}, upserted: ${la.upserted + sf.upserted}`
    );
  } catch (error) {
    console.error('[CaliforniaPhase2] Scraper error:', error);
    throw error;
  }
}
