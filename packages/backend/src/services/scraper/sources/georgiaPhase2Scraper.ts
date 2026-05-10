/**
 * Georgia — Secondary Sale License Scraper (Phase 2)
 *
 * Previous source (ecorp.sos.ga.gov) returns HTTP 403 on all keyword searches
 * from GitHub Actions runners. Replaced with two sources that are accessible
 * from standard server/CI environments:
 *
 *   1. NMLS Consumer Access API — Georgia pawnbroker licenses.
 *      Public JSON API, no authentication required. Same endpoint pattern
 *      confirmed working in Kentucky Phase 2 scraper.
 *      https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch
 *
 *   2. GA SOS Auctioneers Commission public roster page.
 *      https://sos.ga.gov/page/auctioneers-and-auction-firms
 *      Plain CMS HTML page — separate from the blocked verify.sos.ga.gov
 *      Cloudflare-protected portal. Falls back gracefully if blocked.
 *
 * Phase 1 (georgiaLicensingScraper.ts) targets verify.sos.ga.gov for
 * individual auctioneer licenses. This Phase 2 adds pawnbrokers (NMLS) and
 * any additional auction firm data from the SOS board roster page.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

// ---------------------------------------------------------------------------
// Source 1: NMLS Consumer Access — GA pawnbrokers
// ---------------------------------------------------------------------------

const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';
const NMLS_DOMAIN = 'api.nmlsconsumeraccess.org';

// ---------------------------------------------------------------------------
// Source 2: GA SOS Auctioneers Commission public board page
// ---------------------------------------------------------------------------

const GA_SOS_AUCTIONEERS_URL = 'https://sos.ga.gov/page/auctioneers-and-auction-firms';
const GA_SOS_DOMAIN = 'sos.ga.gov';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(businessName: string, licenseType?: string): string {
  const lower = businessName.toLowerCase();
  const licLower = (licenseType || '').toLowerCase();
  if (licLower.includes('pawn') || lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('estate')) return 'ESTATE_SALE_CO';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('auction') || licLower.includes('auction')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// ---------------------------------------------------------------------------
// Source 1 implementation: NMLS pawnbrokers
// ---------------------------------------------------------------------------

interface NmlsCompany {
  EntityName?: string;
  City?: string;
  NMLSId?: number | string;
  LicenseNumber?: string;
}

async function scrapeNmlsGeorgiaPawnbrokers(
  seenKeys: Set<string>
): Promise<{ fetched: number; matched: number; upserted: number }> {
  let fetched = 0;
  let matched = 0;
  let upserted = 0;
  const pageSize = 100;
  let pageIndex = 0;
  let hasMore = true;

  console.log('[GeorgiaPhase2] Source 1: NMLS Consumer Access — Georgia pawnbrokers');

  while (hasMore) {
    await defaultRateLimiter.waitBeforeRequest(NMLS_DOMAIN);

    const url = `${NMLS_API_BASE}?StateRegulator=GA&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.nmlsconsumeraccess.org',
          Referer: 'https://www.nmlsconsumeraccess.org/',
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.warn('[GeorgiaPhase2] NMLS fetch error:', err);
      break;
    }

    if (!response.ok) {
      console.warn(`[GeorgiaPhase2] NMLS returned HTTP ${response.status} — stopping pawnbroker fetch`);
      break;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn('[GeorgiaPhase2] NMLS did not return JSON — portal may require browser session');
      break;
    }

    let data: { Companies?: NmlsCompany[]; TotalRecordCount?: number };
    try {
      data = await response.json() as typeof data;
    } catch (parseErr) {
      console.warn('[GeorgiaPhase2] NMLS JSON parse error:', parseErr);
      break;
    }

    const companies = data.Companies || [];
    console.log(`[GeorgiaPhase2] NMLS page ${pageIndex}: ${companies.length} results`);
    fetched += companies.length;

    for (const company of companies) {
      const businessName = company.EntityName?.trim();
      const city = company.City?.trim() || 'Georgia';
      const licenseNumber =
        company.LicenseNumber?.toString().trim() ||
        company.NMLSId?.toString().trim() ||
        '';

      if (!businessName || !licenseNumber) continue;

      const dedupKey = `NMLS-${licenseNumber}`;
      if (seenKeys.has(dedupKey)) continue;
      if (nameIsExcluded(businessName)) continue;

      seenKeys.add(dedupKey);
      matched++;

      console.log(`[GeorgiaPhase2] NMLS Matched [Pawnbroker]: ${licenseNumber} — ${businessName} (${city})`);

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          businessName,
          'GeorgiaPhase2',
          city,
          'GA',
          undefined,
          undefined,
          undefined,
          undefined,
          'PAWN_SHOP',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          'GA',
          licenseNumber,
          'Pawnbroker'
        );
        if (orgId) upserted++;
      } catch (upsertErr) {
        console.error(`[GeorgiaPhase2] Upsert error for "${businessName}":`, upsertErr);
      }
    }

    const totalCount = data.TotalRecordCount || 0;
    pageIndex++;
    hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;
  }

  return { fetched, matched, upserted };
}

// ---------------------------------------------------------------------------
// Source 2 implementation: GA SOS Auctioneers Commission board page
// ---------------------------------------------------------------------------

interface ParsedAuctioneer {
  name: string;
  licenseNumber: string;
  city: string;
  licenseType: string;
}

/**
 * Parse auctioneer/firm names from the GA SOS board page HTML.
 * The page may contain a table or an unordered list of licensees.
 * Tries both patterns and returns whatever is found.
 */
function parseGaSosAuctioneers(html: string): ParsedAuctioneer[] {
  const results: ParsedAuctioneer[] = [];

  // Pattern 1: HTML table rows
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (tbodyMatch) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(extractText(cellMatch[1]));
      }
      if (cells.length < 2) continue;
      const name = cells[0];
      const licenseNumber = cells[1] || '';
      const city = cells[2] || 'Georgia';
      const licenseType = cells[3] || 'Auctioneer';
      if (!name || name.toLowerCase().includes('name')) continue; // skip header row
      results.push({ name, licenseNumber, city, licenseType });
    }
  }

  // Pattern 2: List items (some GA SOS pages list licensees in <li> tags)
  if (results.length === 0) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(html)) !== null) {
      const text = extractText(liMatch[1]);
      if (!text || text.length < 3) continue;
      // Attempt to split "Name — LicNum" or "Name (LicNum)"
      const dashMatch = text.match(/^(.+?)\s*[—–-]\s*([A-Z0-9-]+)\s*$/);
      const parenMatch = text.match(/^(.+?)\s*\(([A-Z0-9-]+)\)\s*$/);
      if (dashMatch) {
        results.push({
          name: dashMatch[1].trim(),
          licenseNumber: dashMatch[2].trim(),
          city: 'Georgia',
          licenseType: 'Auctioneer',
        });
      } else if (parenMatch) {
        results.push({
          name: parenMatch[1].trim(),
          licenseNumber: parenMatch[2].trim(),
          city: 'Georgia',
          licenseType: 'Auctioneer',
        });
      }
      // Name-only list items without a parseable license number are skipped
    }
  }

  return results;
}

async function scrapeGaSosAuctioneers(
  seenKeys: Set<string>
): Promise<{ fetched: number; matched: number; upserted: number }> {
  let fetched = 0;
  let matched = 0;
  let upserted = 0;

  console.log(`[GeorgiaPhase2] Source 2: GA SOS Auctioneers Commission — ${GA_SOS_AUCTIONEERS_URL}`);

  await defaultRateLimiter.waitBeforeRequest(GA_SOS_DOMAIN);

  let response: Response;
  try {
    response = await fetch(GA_SOS_AUCTIONEERS_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    console.warn('[GeorgiaPhase2] GA SOS auctioneers fetch error:', err);
    return { fetched, matched, upserted };
  }

  if (!response.ok) {
    console.warn(
      `[GeorgiaPhase2] GA SOS auctioneers page returned HTTP ${response.status} — skipping`
    );
    return { fetched, matched, upserted };
  }

  const html = await response.text();

  // Check for Cloudflare / JS challenge
  if (
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_opt') ||
    html.includes('Just a moment') ||
    html.trim().length < 500
  ) {
    console.warn('[GeorgiaPhase2] GA SOS auctioneers page is Cloudflare-protected — skipping');
    return { fetched, matched, upserted };
  }

  const auctioneers = parseGaSosAuctioneers(html);
  fetched += auctioneers.length;
  console.log(`[GeorgiaPhase2] GA SOS board page yielded ${auctioneers.length} parseable records`);

  for (const auc of auctioneers) {
    const name = auc.name.trim();
    if (!name) continue;
    if (nameIsExcluded(name)) continue;

    const dedupKey = auc.licenseNumber
      ? `GA-AUC-${auc.licenseNumber}`
      : `GA-AUC-NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}`;

    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    matched++;

    const category = mapCategory(name, auc.licenseType);
    const city = auc.city.trim() || 'Georgia';

    console.log(`[GeorgiaPhase2] GA SOS Matched [${auc.licenseType}]: ${auc.licenseNumber} — ${name} (${city})`);

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        name,
        'GeorgiaPhase2',
        city,
        'GA',
        undefined,
        undefined,
        undefined,
        undefined,
        category,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'GA',
        auc.licenseNumber || undefined,
        auc.licenseType || 'Auctioneer'
      );
      if (orgId) upserted++;
    } catch (upsertErr) {
      console.error(`[GeorgiaPhase2] Upsert error for "${name}":`, upsertErr);
    }
  }

  return { fetched, matched, upserted };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Georgia secondary sale license scraper — Phase 2.
 *
 * Previous source (ecorp.sos.ga.gov) returned HTTP 403 from GitHub Actions.
 * Replaced with two accessible sources:
 *
 *   1. NMLS Consumer Access API — Georgia pawnbroker company licenses.
 *      Public JSON API, no auth required.
 *
 *   2. GA SOS Auctioneers Commission board page (sos.ga.gov/page/auctioneers-and-auction-firms).
 *      Plain CMS page separate from the Cloudflare-blocked verify.sos.ga.gov portal.
 *      Falls back gracefully on 403/challenge without failing the run.
 *
 * Cross-deduplicates by license number across both sources.
 */
export async function runGeorgiaPhase2Scraper(): Promise<void> {
  console.log('[GeorgiaPhase2] Starting secondary sale scraper — NMLS + GA SOS Auctioneers');

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  const seenKeys = new Set<string>();

  try {
    // Source 1: NMLS pawnbrokers
    const nmls = await scrapeNmlsGeorgiaPawnbrokers(seenKeys);
    totalFetched += nmls.fetched;
    totalMatched += nmls.matched;
    totalUpserted += nmls.upserted;
    console.log(
      `[GeorgiaPhase2] NMLS complete — fetched: ${nmls.fetched}, matched: ${nmls.matched}, upserted: ${nmls.upserted}`
    );

    // Source 2: GA SOS Auctioneers board page
    const sos = await scrapeGaSosAuctioneers(seenKeys);
    totalFetched += sos.fetched;
    totalMatched += sos.matched;
    totalUpserted += sos.upserted;
    console.log(
      `[GeorgiaPhase2] GA SOS complete — fetched: ${sos.fetched}, matched: ${sos.matched}, upserted: ${sos.upserted}`
    );

    console.log(
      `[GeorgiaPhase2] Complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[GeorgiaPhase2] Fatal error:', err);
    throw err;
  }
}
