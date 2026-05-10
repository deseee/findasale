/**
 * Ohio Department of Commerce — Secondary Sale License Scraper (Phase 2)
 * Targets license types NOT covered by Phase 1 (Auctioneer):
 *   - Secondhand Dealer (ORC 4737)
 *   - Pawnbroker (ORC 4727)
 *
 * Source: https://license.ohio.gov/Lookup/LicenseLookup.aspx
 * Same ASP.NET form as Phase 1 — POST with different ddlLicenseType values.
 * Cross-dedup by license number to prevent double upserts across license types.
 *
 * ADR-073: Directory Scraper Phase 2 — State licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const SEARCH_URL = 'https://license.ohio.gov/Lookup/LicenseLookup.aspx';
const OHIO_DOMAIN = 'license.ohio.gov';

// License types to query (Phase 2 — non-auctioneer resale types)
const LICENSE_TYPES = ['Secondhand Dealer', 'Pawnbroker'];

// False-positive name fragments — exclude if business name contains any of these
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

function mapCategory(businessName: string, licenseType: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (licenseType === 'Pawnbroker') return 'PAWN_SHOP';
  return 'RESALE_SHOP';
}

/**
 * Parse an address string into city component.
 * Expected format: "City, OH 12345" or "City"
 */
function parseCity(address: string): string {
  const parts = address.split(',').map((s) => s.trim());
  return parts[0] || 'Ohio';
}

/**
 * Extract text content from an HTML cell string (strips tags, decodes entities).
 */
function extractText(cellHtml: string): string {
  return cellHtml
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

interface OhioFormState {
  viewState: string;
  eventValidation: string;
  viewStateGenerator: string;
}

/**
 * Fetch the search form page and extract ASP.NET hidden field values.
 */
async function fetchFormState(): Promise<OhioFormState | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(OHIO_DOMAIN);
    const response = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[Ohio Phase2] Form fetch HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    const viewStateMatch = html.match(/name="__VIEWSTATE"\s+value="([^"]*)"/);
    const eventValidationMatch = html.match(/name="__EVENTVALIDATION"\s+value="([^"]*)"/);
    const viewStateGeneratorMatch = html.match(/name="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/);

    return {
      viewState: viewStateMatch ? viewStateMatch[1] : '',
      eventValidation: eventValidationMatch ? eventValidationMatch[1] : '',
      viewStateGenerator: viewStateGeneratorMatch ? viewStateGeneratorMatch[1] : '',
    };
  } catch (err) {
    console.warn('[Ohio Phase2] Form fetch failed:', err);
    return null;
  }
}

/**
 * Submit a search for a given license type and return the parsed results HTML.
 */
async function searchLicenseType(
  licenseType: string,
  formState: OhioFormState
): Promise<string | null> {
  const formData = new URLSearchParams();
  if (formState.viewState) formData.append('__VIEWSTATE', formState.viewState);
  if (formState.eventValidation) formData.append('__EVENTVALIDATION', formState.eventValidation);
  if (formState.viewStateGenerator)
    formData.append('__VIEWSTATEGENERATOR', formState.viewStateGenerator);
  formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', licenseType);
  formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'Active');
  formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

  try {
    await defaultRateLimiter.waitBeforeRequest(OHIO_DOMAIN);
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[Ohio Phase2] Search POST HTTP ${response.status} for type="${licenseType}"`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.warn(`[Ohio Phase2] Search POST failed for type="${licenseType}":`, err);
    return null;
  }
}

/**
 * Parse table rows from Ohio license search HTML results.
 * Returns array of { name, licenseNumber, status, address } objects.
 */
function parseResultRows(
  html: string
): Array<{ name: string; licenseNumber: string; status: string; address: string }> {
  const results: Array<{ name: string; licenseNumber: string; status: string; address: string }> =
    [];

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
    const cells = row.match(cellRegex) || [];
    if (cells.length < 4) continue;

    const name = extractText(cells[0]);
    const licenseNumber = extractText(cells[1]);
    const status = extractText(cells[2]);
    const address = extractText(cells[3]);

    if (!name || !licenseNumber) continue;

    results.push({ name, licenseNumber, status, address });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Ohio secondary sale license scraper — Phase 2.
 * Queries Ohio license.ohio.gov for Secondhand Dealer and Pawnbroker license types.
 * Cross-deduplicates by license number across license type queries.
 */
export async function runOhioPhase2Scraper(): Promise<void> {
  console.log('[Ohio Phase2] Starting secondary sale scraper — Ohio license.ohio.gov');
  console.log(`[Ohio Phase2] Source: ${SEARCH_URL}`);
  console.log(`[Ohio Phase2] License types: ${LICENSE_TYPES.join(', ')}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Cross-dedup set: track license numbers already processed across all license types
  const seenLicenseNumbers = new Set<string>();

  try {
    // Fetch form state once — reused across license type queries
    console.log('[Ohio Phase2] Fetching ASP.NET form state...');
    const formState = await fetchFormState();
    if (!formState) {
      console.error('[Ohio Phase2] Could not retrieve form state — aborting');
      return;
    }
    console.log('[Ohio Phase2] Form state retrieved');

    for (const licenseType of LICENSE_TYPES) {
      console.log(`[Ohio Phase2] Querying license type: "${licenseType}"`);

      const html = await searchLicenseType(licenseType, formState);
      if (!html) {
        console.warn(`[Ohio Phase2] No HTML returned for type="${licenseType}" — skipping`);
        continue;
      }

      const rows = parseResultRows(html);
      console.log(`[Ohio Phase2] Found ${rows.length} rows for type="${licenseType}"`);

      for (const row of rows) {
        totalFetched++;

        // Only Active licenses
        if (row.status !== 'Active') {
          console.log(
            `[Ohio Phase2] Skipping ${row.name} (${row.licenseNumber}): status=${row.status}`
          );
          continue;
        }

        // Cross-dedup by license number
        if (seenLicenseNumbers.has(row.licenseNumber)) {
          console.log(
            `[Ohio Phase2] Dedup skip: ${row.licenseNumber} already processed`
          );
          continue;
        }
        seenLicenseNumbers.add(row.licenseNumber);

        // Name exclusion filter
        if (nameIsExcluded(row.name)) {
          console.log(`[Ohio Phase2] Excluded by fragment filter: "${row.name}"`);
          continue;
        }

        totalMatched++;
        const city = parseCity(row.address);
        const category = mapCategory(row.name, licenseType);

        console.log(
          `[Ohio Phase2] Matched [${licenseType}]: ${row.licenseNumber} — ${row.name} (${city})`
        );

        try {
          const orgId = await getOrCreateScrapedOrganizer(
            row.name,            // businessName
            'OhioPhase2',        // sourceName
            city,                // city
            'OH',                // state
            undefined,           // esnOrgId
            undefined,           // googlePlaceId
            undefined,           // foursquareVenueId
            undefined,           // hereBusinessId
            category,            // businessCategory
            undefined,           // contactEmail
            undefined,           // phone
            undefined,           // website
            undefined,           // lat
            undefined,           // lng
            true,                // isStateLicensed
            'OH',                // licenseState
            row.licenseNumber,   // licenseNumber
            licenseType          // sourceLabel
          );
          if (orgId) totalUpserted++;
        } catch (upsertErr) {
          console.error(`[Ohio Phase2] Upsert error for "${row.name}":`, upsertErr);
        }
      }

      console.log(
        `[Ohio Phase2] Completed type="${licenseType}": fetched=${rows.length}, matched so far=${totalMatched}`
      );
    }

    console.log(
      `[Ohio Phase2] Scraper completed: fetched=${totalFetched}, matched=${totalMatched}, upserted=${totalUpserted}`
    );
  } catch (error) {
    console.error('[Ohio Phase2] Scraper error:', error);
    throw error;
  }
}
