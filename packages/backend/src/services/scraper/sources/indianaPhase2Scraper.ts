/**
 * Indiana PLA (Professional Licensing Agency) — Auctioneer License Scraper (Phase 2)
 *
 * Source: https://secure.in.gov/apps/pla/search
 * Strategy: POST search with license number prefix "AU" (individual auctioneers)
 *   and "AC" (auction companies). The endpoint returns ALL matches in a single
 *   HTML page (no pagination). We parse the HTML table for name, license number,
 *   license type, status, city, and state.
 *
 * Only Active licenses with state=IN are ingested. Excludes real estate, financial,
 * legal, medical, and hospitality businesses by name fragment.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';

const PLA_SEARCH_URL = 'https://secure.in.gov/apps/pla/search/';
const PLA_FORM_URL = 'https://secure.in.gov/apps/pla/search';

/** License prefixes to search — AU = individual auctioneer, AC = auction company */
const LICENSE_PREFIXES = ['AU', 'AC'];

/** Fragments that disqualify a business name from ingestion */
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage',
  'bank', 'credit union', 'financial', 'insurance',
  'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

/**
 * Extract the __RequestVerificationToken from the PLA search form HTML.
 */
function extractVerificationToken(html: string): string {
  const match = html.match(/name="__RequestVerificationToken"\s+(?:type="hidden"\s+)?value="([^"]+)"/);
  if (!match) {
    const alt = html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/);
    if (!alt) throw new Error('Could not extract __RequestVerificationToken from PLA form');
    return alt[1];
  }
  return match[1];
}

/**
 * Strip HTML tags and decode common entities from a cell value.
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
 * Fetch all results for a given license prefix from Indiana PLA.
 * Returns parsed rows: { name, licenseNumber, licenseType, status, city, state }.
 */
async function fetchPrefixResults(
  prefix: string
): Promise<Array<{ name: string; licenseNumber: string; licenseType: string; status: string; city: string; state: string }>> {
  // Step 1: GET the search form to obtain the anti-forgery token
  const formResp = await fetch(PLA_FORM_URL, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!formResp.ok) {
    throw new Error(`[IndianaPhase2] Failed to fetch PLA form: HTTP ${formResp.status}`);
  }

  const formHtml = await formResp.text();
  const token = extractVerificationToken(formHtml);

  // Step 2: POST the search with the license number prefix
  const body = new URLSearchParams();
  body.append('__RequestVerificationToken', token);
  body.append('PaymentType', '0');
  body.append('LicenseNumber', prefix);
  body.append('FirstName', '');
  body.append('LastName', '');
  body.append('FacilityName', '');

  const searchResp = await fetch(PLA_SEARCH_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: PLA_FORM_URL,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(120000), // 2 min — large result sets
  });

  if (!searchResp.ok) {
    throw new Error(`[IndianaPhase2] PLA search failed for prefix ${prefix}: HTTP ${searchResp.status}`);
  }

  const html = await searchResp.text();

  // Check match count
  const countMatch = html.match(/There were (\d+) matches/);
  const matchCount = countMatch ? parseInt(countMatch[1], 10) : 0;
  console.log(`[IndianaPhase2] Prefix ${prefix}: ${matchCount} total matches returned`);

  if (matchCount === 0) return [];

  // Step 3: Parse the HTML table rows
  // Table structure: Full Name | License # | License Type | License Status | City | State
  const results: Array<{ name: string; licenseNumber: string; licenseType: string; status: string; city: string; state: string }> = [];

  // Match data rows (skip header row which uses <th>)
  const rowRegex = /<tr>\s*<td[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/td>\s*<td[^>]*>\s*(?:<a[^>]*>)?([^<]+)(?:<\/a>)?\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const name = stripHtml(rowMatch[1]);
    const licenseNumber = stripHtml(rowMatch[2]);
    const licenseType = stripHtml(rowMatch[3]);
    const status = stripHtml(rowMatch[4]);
    const city = stripHtml(rowMatch[5]);
    const state = stripHtml(rowMatch[6]);

    if (name && licenseNumber) {
      results.push({ name, licenseNumber, licenseType, status, city, state });
    }
  }

  // Fallback: if regex didn't match (HTML whitespace variations), use a simpler approach
  if (results.length === 0 && matchCount > 0) {
    console.log(`[IndianaPhase2] Primary regex missed rows for prefix ${prefix}, trying fallback parser`);

    // Split by </tr> and parse each chunk
    const trChunks = html.split('</tr>');
    for (const chunk of trChunks) {
      const cells = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
      if (!cells || cells.length < 6) continue;

      const name = stripHtml(cells[0]);
      const licenseNumber = stripHtml(cells[1]);
      const licenseType = stripHtml(cells[2]);
      const status = stripHtml(cells[3]);
      const city = stripHtml(cells[4]);
      const state = stripHtml(cells[5]);

      // Skip header-like rows
      if (name === 'Full Name' || !name || !licenseNumber) continue;

      results.push({ name, licenseNumber, licenseType, status, city, state });
    }
  }

  console.log(`[IndianaPhase2] Prefix ${prefix}: parsed ${results.length} rows from HTML`);
  return results;
}

/**
 * Run the Indiana PLA auctioneer license scraper.
 * Searches for AU (auctioneer) and AC (auction company) license prefixes.
 * Only ingests Active licenses located in Indiana.
 */
export async function runIndianaPhase2Scraper(): Promise<void> {
  // INTENTIONAL_BREAK: Indiana PLA search (secure.in.gov/apps/pla/search) blocks GitHub
  // Actions cloud IPs — requests return empty results or HTTP errors from cloud runners.
  // Parked 2026-06 until a residential proxy or FOIA bulk export path is available.
  // Exits 0 so the workflow does not show as "failed".
  console.log('[IndianaPhase2] PARKED: PLA search blocked from cloud IPs (GitHub Actions). Exiting cleanly.');
  return;

  // --- ORIGINAL CODE BELOW (unreachable, preserved for reference) ---
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let totalSkippedExcluded = 0;
  let totalSkippedInactive = 0;
  let totalSkippedOutOfState = 0;

  console.log('[IndianaPhase2] Starting Indiana PLA auctioneer license scraper');
  console.log(`[IndianaPhase2] Source: ${PLA_FORM_URL}`);

  for (const prefix of LICENSE_PREFIXES) {
    console.log(`[IndianaPhase2] Fetching prefix: ${prefix}`);

    const rows = await fetchPrefixResults(prefix);
    totalFetched += rows.length;

    for (const row of rows) {
      // Only ingest Active licenses
      if (row.status !== 'Active') {
        totalSkippedInactive++;
        continue;
      }

      // Only ingest Indiana-based licensees
      if (row.state !== 'IN') {
        totalSkippedOutOfState++;
        continue;
      }

      // Exclude irrelevant business types
      if (isExcluded(row.name)) {
        totalSkippedExcluded++;
        continue;
      }

      totalMatched++;

      try {
        const organizerId = await getOrCreateScrapedOrganizer(
          row.name,
          'IndianaPLA',
          row.city || 'Indiana',
          'IN',
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
          'Indiana', // licenseState
          row.licenseNumber, // licenseNumber
          `Indiana PLA – ${row.licenseType}` // sourceLabel
        );

        if (organizerId) {
          // Update licensing fields directly for richer data
          await prisma.organizer.update({
            where: { id: organizerId },
            data: {
              licenseNumber: row.licenseNumber,
              licenseState: 'IN',
              isStateLicensed: true,
              directoryMostRecentSource: 'IndianaPLA',
            },
          });
          totalUpserted++;
        }

        if (totalMatched % 100 === 0) {
          console.log(`[IndianaPhase2] Progress: ${totalMatched} matched, ${totalUpserted} upserted`);
        }
      } catch (err) {
        console.error(`[IndianaPhase2] Error processing ${row.name} (${row.licenseNumber}):`, err);
      }
    }

    // Brief pause between prefix searches to be respectful
    if (LICENSE_PREFIXES.indexOf(prefix) < LICENSE_PREFIXES.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`[IndianaPhase2] Completed.`);
  console.log(`[IndianaPhase2] Fetched: ${totalFetched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`);
  console.log(`[IndianaPhase2] Skipped — inactive: ${totalSkippedInactive}, out-of-state: ${totalSkippedOutOfState}, excluded: ${totalSkippedExcluded}`);

  if (totalMatched === 0) {
    console.log('[IndianaPhase2] Zero matching records — PLA search may have changed or be blocked');
  }
}
