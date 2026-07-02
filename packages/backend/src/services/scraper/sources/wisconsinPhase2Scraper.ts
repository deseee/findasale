/**
 * Wisconsin Secondary Sale Business Scraper (Phase 2)
 * Sources:
 *   1. Wisconsin DSPS (Dept of Safety & Professional Services) auctioneer credential page
 *      https://dsps.wi.gov/Pages/Professions/Auctioneer/Default.aspx
 * ADR-073: Directory Scraper Phase 2 — State licensing data
 *
 * Note: NMLS Consumer Access (api.nmlsconsumeraccess.org) is DNS-blocked from GitHub Actions
 * runners (ENOTFOUND). NMLS calls have been removed. DSPS auctioneer data is the active source.
 *
 * Wisconsin does not publish a Socrata open data portal with business license records.
 * DSPS covers auctioneers under state credential.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';
import { getRandomUserAgent } from '../userAgents';

const DSPS_AUCTIONEER_URL =
  'https://dsps.wi.gov/Pages/Professions/Auctioneer/Default.aspx';
const DSPS_DOMAIN = 'dsps.wi.gov';

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

      const licenseNumber = extractText(cells[0] ?? '');
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
 * Source: Wisconsin DSPS auctioneer credential page.
 * (NMLS Consumer Access removed — DNS-blocked from GitHub Actions runners.)
 */
export async function runWisconsinPhase2Scraper(): Promise<void> {
  console.log('[WisconsinPhase2] Starting secondary sale scraper');

  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    // --- Source: DSPS auctioneers ---
    console.log('[WisconsinPhase2] Fetching DSPS auctioneer records...');
    const auctioneers = await fetchDspsAuctioneers();
    const batchRows: ScrapedOrganizerRow[] = [];

    for (const rec of auctioneers) {
      if (nameIsExcluded(rec.businessName)) continue;
      totalMatched++;

      batchRows.push({
        businessName: rec.businessName,
        sourceName: 'WisconsinPhase2',
        city: rec.city || 'Wisconsin',
        state: 'WI',
        businessCategory: 'AUCTION_HOUSE',
        isStateLicensed: true,
        licenseState: 'WI',
        licenseNumber: rec.licenseNumber || undefined,
      });
    }

    // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(`[WisconsinPhase2] DSPS auctioneers done — ${auctioneers.length} records`);
    console.log(`[WisconsinPhase2] Complete — total matched: ${totalMatched}, total upserted: ${totalUpserted}`);
  } catch (err) {
    console.error('[WisconsinPhase2] Fatal error:', err);
    throw err;
  }
}
