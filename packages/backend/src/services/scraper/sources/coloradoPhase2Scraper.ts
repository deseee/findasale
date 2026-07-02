/**
 * Colorado Secretary of State — Secondary Sale Business Scraper (Phase 2)
 *
 * ADR-073: Directory Scraper Phase 2 — State business entity registry data
 *
 * DATA SOURCE (live):
 *   Colorado SOS Entity Registry — Socrata JSON API
 *   https://data.colorado.gov/resource/4ykn-tg5h.json
 *   Dataset: ~1.4M registered entities with entityname, entitystatus, principalcity.
 *   Strategy: keyword-match entityname against secondary-sale terms (pawn, auction, consign,
 *   thrift, antique, vintage, resale, liquidat, estate sale, secondhand) filtered to
 *   "Good Standing" entities only.
 *
 * NOTE on pawnbroker licensing:
 *   CO DORA DFS licenses pawnbrokers under CRS §12-56-101+. Their portal
 *   (apps2.colorado.gov/dfs) returns HTTP 403 (WAF blocked). No Socrata dataset exists
 *   for CO pawnbroker licensees specifically. SOS entity data is the best available
 *   open source for Colorado — entity names reliably identify pawn shop operators.
 *   If CO DORA publishes a licensee list, add it as a second source here.
 *
 * Uses Socrata $where with OR keyword clauses and $limit/$offset pagination.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const CO_SOS_URL = 'https://data.colorado.gov/resource/4ykn-tg5h.json';
const CO_DOMAIN = 'data.colorado.gov';
const PAGE_SIZE = 5000;

// Keywords that always indicate an in-scope business (matched against lower(entityname))
const SALE_TYPE_KEYWORDS = [
  'pawn',
  'auction',
  'consign',
  'thrift',
  'estate sale',
  'antique',
  'vintage',
  'resale',
  'liquidat',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus store',
  'rummage',
  'used goods',
  'flea market',
  'swap meet',
  'collectible',
];

// False-positive name fragments — exclude if entityname contains any of these
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
  'construction',
  'landscaping',
  'plumbing',
  'electrical',
  'roofing',
  'automotive',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
  'pawnee',   // geographic name (Pawnee Fire Protection District, etc.)
  'ditch',    // irrigation/water districts
  'canal',
  'lateral',
  'grazing',
  'historical society',
  'fire protection',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function mapCategory(entityName: string): string {
  const lower = entityName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('antique')) return 'ANTIQUE_MALL';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  return 'RESALE_SHOP';
}

/**
 * Build a Socrata $where clause that matches any of the sale-type keywords
 * against lower(entityname). Socrata does not support OR across multiple LIKE clauses
 * natively in a single param, so we build a compound OR expression.
 */
function buildWhereClause(): string {
  const conditions = SALE_TYPE_KEYWORDS.map(
    (kw) => `lower(entityname) like '%${kw}%'`
  );
  return `(${conditions.join(' OR ')}) AND entitystatus='Good Standing'`;
}

export async function runColoradoPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;
  const batchRows: ScrapedOrganizerRow[] = [];

  console.log('[ColoradoPhase2] Starting — CO SOS entity registry via Socrata JSON API');
  console.log(`[ColoradoPhase2] Source: ${CO_SOS_URL}`);

  const whereClause = buildWhereClause();

  try {
    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(CO_DOMAIN);

      const params = new URLSearchParams({
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
        $where: whereClause,
      });
      const url = `${CO_SOS_URL}?${params.toString()}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(`[ColoradoPhase2] HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const rows = (await response.json()) as Record<string, string>[];
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`[ColoradoPhase2] No more records at offset ${offset}`);
        break;
      }

      if (!columnsLogged) {
        console.log('[ColoradoPhase2] Columns:', Object.keys(rows[0]).join(', '));
        columnsLogged = true;
      }

      totalFetched += rows.length;

      for (const row of rows) {
        try {
          const entityName = (row['entityname'] ?? '').trim();
          if (!entityName) continue;
          if (!nameMatchesKeyword(entityName)) continue;
          if (nameIsExcluded(entityName)) continue;

          totalMatched++;

          const city = (row['principalcity'] ?? 'Colorado').trim();
          const entityId = (row['entityid'] ?? '').trim();

          const slugifiedName = entityName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const dedupeKey = `CO-SECONDARY-${entityId || slugifiedName}`;
          const businessCategory = mapCategory(entityName);

          console.log(`[ColoradoPhase2] Matched: ${dedupeKey} — ${entityName} (${city})`);

          batchRows.push({
            businessName: entityName,
            sourceName: 'ColoradoPhase2',
            city,
            state: 'CO',
            businessCategory,
          });
        } catch (rowErr) {
          console.error('[ColoradoPhase2] Row error:', rowErr);
        }
      }

      offset += rows.length;
      if (rows.length < PAGE_SIZE) hasMore = false;
    }

    // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[ColoradoPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[ColoradoPhase2] Scraper error:', error);
    throw error;
  }
}
