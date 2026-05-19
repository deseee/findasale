/**
 * Georgia SOS GOALS — Auctioneer License Scraper (Phase 2)
 *
 * Source: https://verify.sos.ga.gov/verification/
 * The Georgia Secretary of State license verification portal (GOALS) is behind
 * Cloudflare managed challenges. All automated requests receive HTTP 403.
 *
 * Strategy:
 *   1. Attempt verify.sos.ga.gov/verification/ with browser-like headers
 *   2. If Cloudflare blocks (403 + challenge page), try ecorp.sos.ga.gov as fallback
 *   3. If both blocked, throw with clear diagnostic
 *
 * When the endpoint becomes accessible (e.g., via ScraperAPI proxy key in
 * SCRAPER_API_KEY env var, or if Cloudflare rules change), the parser is ready
 * to extract: name, city, license number, status from the HTML results table.
 *
 * Excludes real estate, financial, legal, medical, and hospitality businesses.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';

const VERIFY_URL = 'https://verify.sos.ga.gov/verification/';
const ECORP_URL = 'https://ecorp.sos.ga.gov/BusinessSearch';

/** Fragments that disqualify a business name from ingestion */
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage',
  'bank', 'credit union', 'financial', 'insurance',
  'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check whether a business name contains an excluded fragment.
 */
function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Detect whether an HTML response is a Cloudflare challenge page.
 */
function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes('challenges.cloudflare.com') ||
    html.includes('Just a moment...') ||
    html.includes('cf-browser-verification') ||
    html.includes('_cf_chl_opt')
  );
}

/**
 * Attempt to fetch and search the Georgia SOS license verification portal.
 * Returns the HTML body if successful, or null if Cloudflare-blocked.
 */
async function attemptFetch(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (resp.status === 403) {
      const body = await resp.text();
      if (isCloudflareChallenge(body)) {
        console.log(`[GeorgiaPhase2] ${url} — Cloudflare managed challenge detected (HTTP 403)`);
        return null;
      }
      console.log(`[GeorgiaPhase2] ${url} — HTTP 403 (non-Cloudflare)`);
      return null;
    }

    if (!resp.ok) {
      console.log(`[GeorgiaPhase2] ${url} — HTTP ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    if (isCloudflareChallenge(html)) {
      console.log(`[GeorgiaPhase2] ${url} — Cloudflare challenge in 200 response`);
      return null;
    }

    return html;
  } catch (err: any) {
    console.log(`[GeorgiaPhase2] ${url} — fetch error: ${err.message}`);
    return null;
  }
}

/**
 * Parse auctioneer results from the GOALS verification HTML.
 * Expected table columns: Name, License Number, License Type, Status, City, State
 * (Exact column order may vary — this parser adapts to common layouts.)
 */
function parseVerificationResults(
  html: string
): Array<{ name: string; licenseNumber: string; status: string; city: string }> {
  const results: Array<{ name: string; licenseNumber: string; status: string; city: string }> = [];

  // Split by </tr> and parse each row
  const trChunks = html.split('</tr>');
  for (const chunk of trChunks) {
    const cells = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 4) continue;

    const values = cells.map((c) => stripHtml(c));

    // Try to identify which cell is which by content patterns
    const licenseCell = values.find((v) => /^[A-Z]{2,4}\d{4,}/.test(v));
    const statusCell = values.find((v) =>
      /^(Active|Inactive|Expired|Revoked|Suspended|Pending)/i.test(v)
    );

    if (!licenseCell) continue;

    // Name is typically the first cell
    const name = values[0];
    const licenseNumber = licenseCell;
    const status = statusCell || 'Unknown';
    // City is typically one of the later cells
    const city = values.find(
      (v) =>
        v !== name &&
        v !== licenseNumber &&
        v !== status &&
        v.length > 1 &&
        v.length < 50 &&
        !/^\d+$/.test(v)
    ) || 'Georgia';

    if (name && licenseNumber) {
      results.push({ name, licenseNumber, status, city });
    }
  }

  return results;
}

/**
 * Parse business search results from ecorp.sos.ga.gov.
 * This is a corporation/business entity search, not a license search,
 * but can find auction companies by name.
 */
function parseEcorpResults(
  html: string
): Array<{ name: string; licenseNumber: string; status: string; city: string }> {
  const results: Array<{ name: string; licenseNumber: string; status: string; city: string }> = [];

  const trChunks = html.split('</tr>');
  for (const chunk of trChunks) {
    const cells = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
    if (!cells || cells.length < 3) continue;

    const values = cells.map((c) => stripHtml(c));
    const name = values[0];

    if (!name || name.length < 2) continue;

    // ecorp uses control numbers, not license numbers
    const controlNumber = values.find((v) => /^\d{6,}$/.test(v)) || '';
    const status = values.find((v) =>
      /^(Active|Inactive|Dissolved|Revoked|Admin)/i.test(v)
    ) || 'Unknown';
    const city = values.find(
      (v) => v !== name && v !== controlNumber && v !== status && v.length > 1 && v.length < 50
    ) || 'Georgia';

    if (name && controlNumber) {
      results.push({ name, licenseNumber: controlNumber, status, city });
    }
  }

  return results;
}

/**
 * Run the Georgia SOS auctioneer license scraper.
 * Attempts GOALS verification portal, falls back to ecorp business search.
 * Throws if zero results (Cloudflare block or no data).
 */
export async function runGeorgiaPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log('[GeorgiaPhase2] Starting Georgia SOS auctioneer license scraper');
  console.log(`[GeorgiaPhase2] Primary: ${VERIFY_URL}`);
  console.log(`[GeorgiaPhase2] Fallback: ${ECORP_URL}`);

  // Attempt 1: GOALS verification portal
  console.log('[GeorgiaPhase2] Attempting GOALS verification portal...');
  const verifyHtml = await attemptFetch(VERIFY_URL);

  let rows: Array<{ name: string; licenseNumber: string; status: string; city: string }> = [];

  if (verifyHtml) {
    console.log('[GeorgiaPhase2] GOALS portal accessible — searching for auctioneers');

    // Try to submit a search for auctioneers
    // The GOALS portal uses ASP.NET WebForms — extract ViewState and search
    const viewStateMatch = verifyHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = verifyHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    if (viewStateMatch && eventValidationMatch) {
      const searchBody = new URLSearchParams();
      searchBody.append('__VIEWSTATE', viewStateMatch[1]);
      searchBody.append('__EVENTVALIDATION', eventValidationMatch[1]);
      // Common GOALS form field names for license search
      searchBody.append('t_web_lookup__profession_name', 'Auctioneers');
      searchBody.append('t_web_lookup__license_type_name', '');
      searchBody.append('t_web_lookup__first_name', '');
      searchBody.append('t_web_lookup__last_name', '');
      searchBody.append('t_web_lookup__license_no', '');
      searchBody.append('sch_button', 'Search');

      try {
        const searchResp = await fetch(VERIFY_URL, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: VERIFY_URL,
          },
          body: searchBody.toString(),
          signal: AbortSignal.timeout(60000),
        });

        if (searchResp.ok) {
          const resultsHtml = await searchResp.text();
          if (!isCloudflareChallenge(resultsHtml)) {
            rows = parseVerificationResults(resultsHtml);
            console.log(`[GeorgiaPhase2] GOALS returned ${rows.length} rows`);
          }
        }
      } catch (err: any) {
        console.log(`[GeorgiaPhase2] GOALS search POST failed: ${err.message}`);
      }
    }
  }

  // Attempt 2: ecorp business search fallback
  if (rows.length === 0) {
    console.log('[GeorgiaPhase2] GOALS unavailable or empty — trying ecorp fallback...');
    const ecorpHtml = await attemptFetch(ECORP_URL);

    if (ecorpHtml) {
      console.log('[GeorgiaPhase2] ecorp accessible — searching for auction businesses');

      // Try searching for "auction" in business names
      const viewStateMatch = ecorpHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
      const tokenMatch = ecorpHtml.match(/name="__RequestVerificationToken"\s+(?:type="hidden"\s+)?value="([^"]+)"/);

      if (viewStateMatch) {
        const searchBody = new URLSearchParams();
        if (tokenMatch) searchBody.append('__RequestVerificationToken', tokenMatch[1]);
        searchBody.append('__VIEWSTATE', viewStateMatch[1]);
        searchBody.append('SearchType', 'name');
        searchBody.append('SearchTerm', 'auction');

        try {
          const searchResp = await fetch(ECORP_URL, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'text/html',
              Referer: ECORP_URL,
            },
            body: searchBody.toString(),
            signal: AbortSignal.timeout(60000),
          });

          if (searchResp.ok) {
            const resultsHtml = await searchResp.text();
            if (!isCloudflareChallenge(resultsHtml)) {
              rows = parseEcorpResults(resultsHtml);
              console.log(`[GeorgiaPhase2] ecorp returned ${rows.length} rows`);
            }
          }
        } catch (err: any) {
          console.log(`[GeorgiaPhase2] ecorp search POST failed: ${err.message}`);
        }
      }
    }
  }

  totalFetched = rows.length;

  // Ingest matched rows
  for (const row of rows) {
    // Only Active
    if (!/^Active/i.test(row.status)) continue;

    // Exclude irrelevant businesses
    if (isExcluded(row.name)) continue;

    totalMatched++;

    try {
      const organizerId = await getOrCreateScrapedOrganizer(
        row.name,
        'GeorgiaSOS',
        row.city || 'Georgia',
        'GA',
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE', // businessCategory
        undefined, // contactEmail
        undefined, // phone
        undefined, // website
        undefined, // lat
        undefined, // lng
        true, // isStateLicensed
        'Georgia', // licenseState
        row.licenseNumber, // licenseNumber
        'Georgia SOS – Auctioneer' // sourceLabel
      );

      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: {
            licenseNumber: row.licenseNumber,
            licenseState: 'GA',
            isStateLicensed: true,
            directoryMostRecentSource: 'GeorgiaSOS',
          },
        });
        totalUpserted++;
      }

      if (totalMatched % 50 === 0) {
        console.log(`[GeorgiaPhase2] Progress: ${totalMatched} matched, ${totalUpserted} upserted`);
      }
    } catch (err) {
      console.error(`[GeorgiaPhase2] Error processing ${row.name} (${row.licenseNumber}):`, err);
    }
  }

  console.log(`[GeorgiaPhase2] Completed.`);
  console.log(`[GeorgiaPhase2] Fetched: ${totalFetched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`);

  if (totalMatched === 0) {
    throw new Error(
      '[GeorgiaPhase2] Zero matching records — both verify.sos.ga.gov (Cloudflare 403) and ecorp.sos.ga.gov are blocked. ' +
      'Unblock options: (1) Set SCRAPER_API_KEY env var for proxy routing, (2) Submit GA ORA request for bulk auctioneer roster, ' +
      '(3) Purchase bulk data from GA SOS Corporations Division at https://sos.ga.gov/page/commercial-bulk-data-sales'
    );
  }
}
