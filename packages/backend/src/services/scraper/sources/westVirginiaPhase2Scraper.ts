/**
 * West Virginia — Secondary Sale License Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * SOURCE: West Virginia Department of Agriculture (WVDA) — Auctioneer directory
 *   https://agriculture.wv.gov/divisions/regulatory-and-environmental-affairs/auctioneer-licensing/
 *
 * Coverage: WVDA licenses auctioneers statewide under WV Code §19-2A.
 * WV is a small state — the auctioneer directory is relatively compact.
 *
 * APPROACH: Attempt HTML scrape of the WVDA auctioneer licensee page.
 * WVDA may publish a list as a plain HTML table or PDF.
 * If the page is PDF-only or requires form submission, falls through gracefully
 * with a FOIA recommendation.
 *
 * NOTE: Per scraper-data-sources-50-states.md: "WVDA auctioneer directory — HTML or FOIA; small state"
 * Secondhand dealer and pawnbroker licenses in WV are managed by the WV State Tax Department
 * and issued locally; no statewide public registry exists for those categories.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const WVDA_DOMAIN = 'agriculture.wv.gov';
const WVDA_AUCTIONEER_URL =
  'https://agriculture.wv.gov/divisions/regulatory-and-environmental-affairs/auctioneer-licensing/';

// Also try the direct licensee list page if the above is a landing page
const WVDA_LICENSEE_LIST_URL =
  'https://agriculture.wv.gov/wp-content/uploads/Auctioneer-Licensee-List.pdf';

const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'insurance',
  'attorney',
  'law office',
  'medical',
  'dental',
  'funeral',
  'restaurant',
  'construction',
  'hvac',
  'plumbing',
  'electrical',
  'roofing',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text from HTML cell, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Attempt to fetch and parse the WVDA auctioneer licensee page.
 * Returns parsed records if the page contains a parseable HTML table.
 */
async function fetchWvdaAuctioneers(): Promise<Array<{ businessName: string; city: string; licenseNumber: string }>> {
  const results: Array<{ businessName: string; city: string; licenseNumber: string }> = [];

  try {
    await defaultRateLimiter.waitBeforeRequest(WVDA_DOMAIN);

    const response = await fetch(WVDA_AUCTIONEER_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[WestVirginiaPhase2] WVDA page returned HTTP ${response.status}`);
      return results;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('pdf') || contentType.includes('application/octet-stream')) {
      console.warn(
        '[WestVirginiaPhase2] WVDA returned PDF content — PDF parsing not supported. See FOIA option in file header.'
      );
      return results;
    }

    const html = await response.text();

    // Check if this is a landing page with links to PDF or list
    if (!html.includes('<table') && !html.includes('<tr')) {
      console.warn(
        '[WestVirginiaPhase2] WVDA page contains no HTML table — may be a landing page or PDF link only.'
      );
      // Look for any linked PDF or list page
      const pdfMatch = html.match(/href="([^"]*auctioneer[^"]*\.pdf[^"]*)"/i);
      if (pdfMatch) {
        console.warn(`[WestVirginiaPhase2] Found PDF link: ${pdfMatch[1]} — PDF parsing not supported.`);
      }
      return results;
    }

    // Parse HTML table rows
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    console.log(`[WestVirginiaPhase2] WVDA: found ${rows.length} table rows`);

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
      if (cells.length < 2) continue;

      const licenseNumber = extractText(cells[0]);
      const businessName = extractText(cells[1]);
      const city = cells.length > 2 ? extractText(cells[2]) : '';

      if (!businessName || businessName.length < 3) continue;
      // Skip header rows
      if (
        businessName.toLowerCase().includes('business name') ||
        businessName.toLowerCase().includes('licensee name') ||
        licenseNumber.toLowerCase().includes('license')
      )
        continue;
      if (nameIsExcluded(businessName)) continue;

      results.push({ businessName, city, licenseNumber });
    }

    console.log(`[WestVirginiaPhase2] Parsed ${results.length} auctioneer records from WVDA page`);
  } catch (err) {
    console.warn('[WestVirginiaPhase2] WVDA fetch error:', err);
  }

  return results;
}

/**
 * West Virginia secondary sale scraper — Phase 2.
 *
 * Source: WVDA auctioneer licensing directory (agriculture.wv.gov).
 * Secondhand dealer / pawnbroker are not covered — locally issued in WV.
 *
 * Falls through to zero results cleanly if the WVDA page is PDF-only.
 * Recommended fallback: FOIA request to WVDA Regulatory & Environmental Affairs.
 */
export async function runWestVirginiaPhase2Scraper(): Promise<void> {
  console.log('[WestVirginiaPhase2] Starting West Virginia secondary sale license scraper');
  console.log('[WestVirginiaPhase2] Source: WVDA auctioneer licensing directory');
  console.log('[WestVirginiaPhase2] Note: WV pawnbroker/secondhand dealer licenses are locally issued — not included');

  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    const records = await fetchWvdaAuctioneers();

    if (records.length === 0) {
      console.warn(
        '[WestVirginiaPhase2] No records parsed — WVDA page may be PDF-only or have changed structure.'
      );
      console.warn(
        '[WestVirginiaPhase2] Recommended fallback: FOIA to WVDA Regulatory & Environmental Affairs for auctioneer licensee list.'
      );
      console.warn(
        '[WestVirginiaPhase2] WVDA contact: https://agriculture.wv.gov | Phone: (304) 558-2209'
      );
      console.log('[WestVirginiaPhase2] Completed — Fetched: 0, Matched: 0, Upserted: 0');
      return;
    }

    totalMatched = records.length;

    for (const rec of records) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          rec.businessName,
          'WestVirginiaPhase2',
          rec.city || 'West Virginia',
          'WV',
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
          'WV',
          rec.licenseNumber || undefined
        );
        if (orgId) totalUpserted++;
      } catch (err) {
        console.error(`[WestVirginiaPhase2] Error upserting ${rec.businessName}:`, err);
      }
    }

    console.log(
      `[WestVirginiaPhase2] Completed — Fetched: ${totalMatched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[WestVirginiaPhase2] Fatal error:', err);
  }
}
