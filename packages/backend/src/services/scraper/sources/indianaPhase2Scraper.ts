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

import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

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

  // Check match count — numbers may be comma-formatted (e.g. "1,560")
  const countMatch = html.match(/There were ([\d,]+) match/);
  const matchCount = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0;
  console.log(`[IndianaPhase2] Prefix ${prefix}: ${matchCount} total matches returned`);

  if (matchCount === 0) return [];

  // Step 3: Parse the HTML table rows.
  // Table structure: Full Name | License # | License Type | License Status | City | State
  //
  // The PLA response contains multi-line <tr> elements — each <td> may span several
  // lines. Splitting on </tr> and then extracting <td>...</td> with [\s\S]*? (dotAll
  // equivalent) correctly handles all whitespace inside cells.
  const results: Array<{ name: string; licenseNumber: string; licenseType: string; status: string; city: string; state: string }> = [];

  const trChunks = html.split(/<\/tr>/i);
  for (const chunk of trChunks) {
    // Skip header rows (contain <th> elements)
    if (/<th[\s>]/i.test(chunk)) continue;

    // Extract all <td>...</td> contents; [\s\S]*? spans newlines inside cells
    const cellMatches = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cellMatches || cellMatches.length < 6) continue;

    // Strip the <td>...</td> wrapper from each cell and clean the inner HTML
    const cells = cellMatches.map((cell) => {
      const inner = cell.replace(/^<td[^>]*>/i, '').replace(/<\/td>$/i, '');
      return stripHtml(inner);
    });

    const name         = cells[0];
    const licenseNumber = cells[1];
    const licenseType  = cells[2];
    const status       = cells[3];
    const city         = cells[4];
    const state        = cells[5];

    // Skip header-like or empty rows
    if (!name || !licenseNumber || name === 'Full Name') continue;

    results.push({ name, licenseNumber, licenseType, status, city, state });
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

    // Accumulate matched rows for this prefix (batch upsert after filtering)
    const prefixRows: ScrapedOrganizerRow[] = [];

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

      // licenseState passed as 'IN' (not 'Indiana') — consistent with schema string usage
      prefixRows.push({
        businessName:     row.name,
        sourceName:       'IndianaPLA',
        city:             row.city || 'Indiana',
        state:            'IN',
        businessCategory: 'AUCTION_HOUSE',
        isStateLicensed:  true,
        licenseState:     'IN',
        licenseNumber:    row.licenseNumber,
        sourceLabel:      `Indiana PLA – ${row.licenseType}`,
      });
    }

    // Batch upsert for this prefix: replaces serial getOrCreateScrapedOrganizer +
    // prisma.organizer.update calls with a single chunked findMany+create+update pass.
    // licenseNumber, licenseState, isStateLicensed are included in the row so
    // batchUpsertScrapedOrganizers writes them directly — no second update needed.
    console.log(`[IndianaPhase2] Prefix ${prefix}: ${prefixRows.length} rows to batch upsert`);
    const ids = await batchUpsertScrapedOrganizers(prefixRows, 100);
    const prefixUpserted = ids.filter((id) => id !== null).length;
    totalUpserted += prefixUpserted;
    console.log(`[IndianaPhase2] Prefix ${prefix}: ${prefixUpserted} upserted`);

    // Brief pause between prefix searches to be respectful
    if (LICENSE_PREFIXES.indexOf(prefix) < LICENSE_PREFIXES.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log('[IndianaPhase2] Completed.');
  console.log(`[IndianaPhase2] Fetched: ${totalFetched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`);
  console.log(`[IndianaPhase2] Skipped — inactive: ${totalSkippedInactive}, out-of-state: ${totalSkippedOutOfState}, excluded: ${totalSkippedExcluded}`);

  if (totalMatched === 0) {
    console.log('[IndianaPhase2] Zero matching records — PLA search may have changed or be blocked');
  }
}
