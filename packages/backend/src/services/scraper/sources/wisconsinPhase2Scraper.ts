/**
 * Wisconsin Pawnbroker & Secondary Sale Business Scraper (Phase 2)
 * Sources:
 *   1. NMLS Consumer Access — WI-licensed pawnbrokers
 *      https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch (StateID=WI, keyword=pawnbroker)
 *   2. Wisconsin DSPS (Dept of Safety & Professional Services) auctioneer credential page
 *      https://dsps.wi.gov/Pages/Professions/Auctioneer/Default.aspx
 *   3. Keyword-matched business name scan via NMLS for consignment/estate/auction keywords
 * ADR-073: Directory Scraper Phase 2 — State licensing data
 *
 * Note: Wisconsin does not publish a Socrata open data portal with business license records.
 * NMLS Consumer Access provides federally-registered pawnbrokers licensed in WI.
 * DSPS covers auctioneers under state credential.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';
const NMLS_DOMAIN = 'api.nmlsconsumeraccess.org';

const DSPS_AUCTIONEER_URL =
  'https://dsps.wi.gov/Pages/Professions/Auctioneer/Default.aspx';
const DSPS_DOMAIN = 'dsps.wi.gov';

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
  'used goods',
  'auction',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
];

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

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(businessName: string, licenseType?: string): string {
  const lower = businessName.toLowerCase();
  const typeUpper = (licenseType || '').toUpperCase();
  if (lower.includes('auction') || typeUpper.includes('AUCTION')) return 'AUCTION_HOUSE';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('flea') || lower.includes('swap meet')) return 'FLEA_MARKET';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

/**
 * Fetch Wisconsin pawnbrokers from NMLS Consumer Access API.
 * Returns array of {businessName, city, state, licenseNumber, licenseType}.
 */
async function fetchNmlsRecords(
  keyword: string
): Promise<Array<{ businessName: string; city: string; state: string; licenseNumber: string; licenseType: string }>> {
  const results: Array<{ businessName: string; city: string; state: string; licenseNumber: string; licenseType: string }> = [];

  try {
    await defaultRateLimiter.waitBeforeRequest(NMLS_DOMAIN);

    const url = `${NMLS_API_BASE}?StateID=WI&ScopeID=1&Keywords=${encodeURIComponent(keyword)}&StartIndex=0&PageSize=1000`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/json',
        Referer: 'https://www.nmlsconsumeraccess.org/',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.warn(`[WisconsinPhase2] NMLS API returned ${response.status} for keyword="${keyword}"`);
      return results;
    }

    const data = await response.json();
    const records = data?.Records ?? data?.records ?? data?.Results ?? data?.results ?? [];

    if (!Array.isArray(records)) {
      console.warn('[WisconsinPhase2] NMLS response did not contain a recognizable records array');
      return results;
    }

    for (const rec of records) {
      const businessName =
        rec.CompanyName ?? rec.BusinessName ?? rec.Name ?? rec.LicenseeName ?? '';
      const city = rec.City ?? rec.BusinessCity ?? '';
      const state = rec.StateCode ?? rec.State ?? 'WI';
      const licenseNumber = String(rec.NMLSId ?? rec.LicenseNumber ?? rec.NMLSID ?? '');
      const licenseType = rec.LicenseType ?? rec.LicenseName ?? keyword;

      if (!businessName) continue;
      results.push({ businessName: String(businessName).trim(), city: String(city).trim(), state: String(state).trim(), licenseNumber, licenseType });
    }

    console.log(`[WisconsinPhase2] NMLS keyword="${keyword}": ${results.length} records`);
  } catch (err) {
    console.warn(`[WisconsinPhase2] NMLS fetch error for keyword="${keyword}":`, err);
  }

  return results;
}

/**
 * Scrape Wisconsin DSPS auctioneer credential page.
 * Falls back gracefully if content is JS-rendered.
 */
async function fetchDspsAuctioneers(): Promise<Array<{ businessName: string; city: string; licenseNumber: string }>> {
  const results: Array<{ businessName: string; city: string; licenseNumber: string }> = [];

  try {
    await defaultRateLimiter.waitBeforeRequest(DSPS_DOMAIN);

    const response = await fetch(DSPS_AUCTIONEER_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[WisconsinPhase2] DSPS page returned ${response.status}`);
      return results;
    }

    const html = await response.text();

    const extractText = (cellHtml: string): string =>
      cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim();

    // Parse HTML table rows
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    console.log(`[WisconsinPhase2] DSPS: found ${rows.length} table rows`);

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
      if (cells.length < 2) continue;

      const licenseNumber = extractText(cells[0]);
      const businessName = extractText(cells[1]);
      const city = cells.length > 2 ? extractText(cells[2]) : '';

      if (!businessName || businessName.length < 3) continue;

      results.push({ businessName, city, licenseNumber });
    }

    console.log(`[WisconsinPhase2] DSPS parsed ${results.length} auctioneer records`);
  } catch (err) {
    console.warn('[WisconsinPhase2] DSPS scrape error:', err);
  }

  return results;
}

/**
 * Wisconsin secondary sale scraper — Phase 2.
 * Source 1: NMLS Consumer Access (WI pawnbrokers + secondary sale keyword matches)
 * Source 2: Wisconsin DSPS auctioneer credential page
 */
export async function runWisconsinPhase2Scraper(): Promise<void> {
  console.log('[WisconsinPhase2] Starting secondary sale scraper');

  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    // --- Source 1: NMLS pawnbrokers ---
    console.log('[WisconsinPhase2] Fetching NMLS pawnbroker records for WI...');
    const pawnRecords = await fetchNmlsRecords('pawnbroker');

    for (const rec of pawnRecords) {
      if (nameIsExcluded(rec.businessName)) continue;
      totalMatched++;

      const orgId = await getOrCreateScrapedOrganizer(
        rec.businessName,
        'WisconsinPhase2',
        rec.city || 'Wisconsin',
        rec.state || 'WI',
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
        'WI',
        rec.licenseNumber || undefined
      );
      if (orgId) totalUpserted++;
    }

    console.log(`[WisconsinPhase2] NMLS pawnbrokers done — matched: ${pawnRecords.length}, upserted: ${totalUpserted}`);

    // --- NMLS secondary keywords ---
    const secondaryKeywords = ['secondhand dealer', 'consignment', 'auction'];
    for (const kw of secondaryKeywords) {
      await defaultRateLimiter.waitBeforeRequest(NMLS_DOMAIN);
      const kwRecords = await fetchNmlsRecords(kw);

      for (const rec of kwRecords) {
        if (!nameMatchesKeyword(rec.businessName) && !nameMatchesKeyword(rec.licenseType)) continue;
        if (nameIsExcluded(rec.businessName)) continue;
        totalMatched++;

        const orgId = await getOrCreateScrapedOrganizer(
          rec.businessName,
          'WisconsinPhase2',
          rec.city || 'Wisconsin',
          rec.state || 'WI',
          undefined,
          undefined,
          undefined,
          undefined,
          mapCategory(rec.businessName, rec.licenseType),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          'WI',
          rec.licenseNumber || undefined
        );
        if (orgId) totalUpserted++;
      }

      console.log(`[WisconsinPhase2] NMLS keyword="${kw}": ${kwRecords.length} records processed`);
    }

    // --- Source 2: DSPS auctioneers ---
    console.log('[WisconsinPhase2] Fetching DSPS auctioneer records...');
    const auctioneers = await fetchDspsAuctioneers();

    for (const rec of auctioneers) {
      if (nameIsExcluded(rec.businessName)) continue;
      totalMatched++;

      const orgId = await getOrCreateScrapedOrganizer(
        rec.businessName,
        'WisconsinPhase2',
        rec.city || 'Wisconsin',
        'WI',
        undefined,
        undefined,
        undefined,
        undefined,
        'AUCTION_HOUSE',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'WI',
        rec.licenseNumber || undefined
      );
      if (orgId) totalUpserted++;
    }

    console.log(`[WisconsinPhase2] DSPS auctioneers done — ${auctioneers.length} records`);
    console.log(`[WisconsinPhase2] Complete — total matched: ${totalMatched}, total upserted: ${totalUpserted}`);
  } catch (err) {
    console.error('[WisconsinPhase2] Fatal error:', err);
    throw err;
  }
}
