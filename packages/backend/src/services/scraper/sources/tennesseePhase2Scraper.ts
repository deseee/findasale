/**
 * Tennessee — Secondary Sale License Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * SOURCE: Tennessee Department of Commerce & Insurance (TDCI) — verify.tn.gov
 *   https://verify.tn.gov/
 *
 * Coverage: TDCI licenses auctioneers statewide under TCA Title 62 Chapter 19.
 * The verify.tn.gov portal provides a public license verification search.
 *
 * APPROACH: Query the verify.tn.gov JSON API for auctioneer license type.
 * The portal exposes a search endpoint that returns JSON results.
 *
 * NOTE: Pawnbroker licenses in TN are issued at the county level (not state).
 * Per scraper-data-sources-50-states.md: "verify.tn.gov for auctioneers; pawn county-level".
 * This scraper covers auctioneers only via the state portal.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const TN_VERIFY_DOMAIN = 'verify.tn.gov';
const TN_VERIFY_SEARCH_URL = 'https://verify.tn.gov/api/v1/licenses/search';

// License type ID for auctioneer in TN verify.tn.gov
// This is the standard TDCI license type code for auctioneers
const TN_AUCTIONEER_TYPE = 'AUCT';

const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'insurance',
  'broker',
  'tax',
  'accounting',
  'financial',
  'mortgage',
  'attorney',
  'law',
  'medical',
  'dental',
  'pharmacy',
  'funeral',
  'restaurant',
  'construction',
  'hvac',
  'plumbing',
  'electrical',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

interface TnLicenseResult {
  licenseName?: string;
  businessName?: string;
  name?: string;
  city?: string;
  licenseNumber?: string;
  license?: string;
  licenseType?: string;
  status?: string;
}

/**
 * Fetch Tennessee auctioneer licenses from verify.tn.gov API.
 * Falls through gracefully if the API structure differs from expected.
 */
async function fetchTnAuctioneers(): Promise<Array<{ businessName: string; city: string; licenseNumber: string }>> {
  const results: Array<{ businessName: string; city: string; licenseNumber: string }> = [];

  try {
    await defaultRateLimiter.waitBeforeRequest(TN_VERIFY_DOMAIN);

    // Try the JSON search API with auctioneer license type
    const searchPayload = {
      licenseType: TN_AUCTIONEER_TYPE,
      state: 'TN',
      pageSize: 500,
      pageNumber: 1,
    };

    const response = await fetch(TN_VERIFY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[TennesseePhase2] API returned HTTP ${response.status} — falling back to HTML scrape`);
      return results;
    }

    const data = await response.json() as { results?: TnLicenseResult[]; licenses?: TnLicenseResult[]; data?: TnLicenseResult[] };
    const records: TnLicenseResult[] = data.results ?? data.licenses ?? data.data ?? [];

    for (const rec of records) {
      const businessName = (rec.businessName ?? rec.licenseName ?? rec.name ?? '').trim();
      const city = (rec.city ?? '').trim();
      const licenseNumber = (rec.licenseNumber ?? rec.license ?? '').trim();

      if (!businessName || businessName.length < 3) continue;
      if (nameIsExcluded(businessName)) continue;

      results.push({ businessName, city, licenseNumber });
    }

    console.log(`[TennesseePhase2] API returned ${results.length} auctioneer records`);
  } catch (err) {
    console.warn('[TennesseePhase2] API fetch error:', err);
  }

  return results;
}

/**
 * Fallback: Try HTML scrape of verify.tn.gov auctioneer search page.
 * Used when the JSON API is unavailable or returns no results.
 */
async function fetchTnAuctioneersHtml(): Promise<Array<{ businessName: string; city: string; licenseNumber: string }>> {
  const results: Array<{ businessName: string; city: string; licenseNumber: string }> = [];

  const htmlUrl = 'https://verify.tn.gov/Lookup/LicenseLookup?licenseType=auctioneer';

  try {
    await defaultRateLimiter.waitBeforeRequest(TN_VERIFY_DOMAIN);

    const response = await fetch(htmlUrl, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[TennesseePhase2] HTML fallback returned HTTP ${response.status}`);
      return results;
    }

    const html = await response.text();

    const extractText = (cellHtml: string): string =>
      cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .trim();

    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
      if (cells.length < 2) continue;

      const licenseNumber = extractText(cells[0]);
      const businessName = extractText(cells[1]);
      const city = cells.length > 2 ? extractText(cells[2]) : '';

      if (!businessName || businessName.length < 3) continue;
      if (nameIsExcluded(businessName)) continue;

      results.push({ businessName, city, licenseNumber });
    }

    console.log(`[TennesseePhase2] HTML fallback parsed ${results.length} records`);
  } catch (err) {
    console.warn('[TennesseePhase2] HTML fallback error:', err);
  }

  return results;
}

/**
 * Tennessee secondary sale scraper — Phase 2.
 *
 * Source: TDCI verify.tn.gov — auctioneer licenses statewide.
 * Pawnbroker licenses are county-level only; not included in this scraper.
 */
export async function runTennesseePhase2Scraper(): Promise<void> {
  console.log('[TennesseePhase2] Starting Tennessee secondary sale license scraper');
  console.log('[TennesseePhase2] Source: TDCI verify.tn.gov — auctioneer licenses');
  console.log('[TennesseePhase2] Note: Pawnbroker licenses are county-issued in TN — not included');

  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    // Try JSON API first, fall back to HTML scrape
    let records = await fetchTnAuctioneers();

    if (records.length === 0) {
      console.log('[TennesseePhase2] JSON API returned 0 results — trying HTML fallback');
      records = await fetchTnAuctioneersHtml();
    }

    if (records.length === 0) {
      console.warn(
        '[TennesseePhase2] Both JSON API and HTML fallback returned 0 records.'
      );
      console.warn(
        '[TennesseePhase2] verify.tn.gov may require session cookies or have changed structure.'
      );
      console.warn(
        '[TennesseePhase2] Fallback: TDCI public records request for auctioneer licensee CSV.'
      );
      console.log('[TennesseePhase2] Completed — Fetched: 0, Matched: 0, Upserted: 0');
      return;
    }

    totalMatched = records.length;

    for (const rec of records) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          rec.businessName,
          'TennesseePhase2',
          rec.city || 'Tennessee',
          'TN',
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
          'TN',
          rec.licenseNumber || undefined
        );
        if (orgId) totalUpserted++;
      } catch (err) {
        console.error(`[TennesseePhase2] Error upserting ${rec.businessName}:`, err);
      }
    }

    console.log(
      `[TennesseePhase2] Completed — Fetched: ${totalMatched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[TennesseePhase2] Fatal error:', err);
  }
}
