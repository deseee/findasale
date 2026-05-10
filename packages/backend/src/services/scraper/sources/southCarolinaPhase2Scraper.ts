/**
 * South Carolina LLR Online — Additional Division Codes Secondary Sale Scraper (Phase 2)
 * Source: https://verify.llronline.com/LicLookup/
 *
 * Phase 1 (southCarolinaLicensingScraper.ts) covers auctioneers via div=29.
 * Phase 2 adds secondhand dealers and pawnbrokers via additional division codes.
 *
 * Division codes targeted:
 *   - div=29  Auctioneers (already covered in Phase 1 — skipped here)
 *   - div=26  Pawnbrokers (SC pawnbroker license, DPPS)
 *   - div=65  Secondhand Dealers (SC Secondhand Dealer registration)
 *
 * If a division code returns no results or isn't accessible, the scraper logs and continues.
 * The ASP.NET form POST pattern mirrors Phase 1 — extract __VIEWSTATE, submit blank search
 * to retrieve all licensees in that division.
 *
 * ADR-073: Directory Scraper Phase 2 — State licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const SC_LLR_BASE = 'https://verify.llronline.com/LicLookup';
const SC_LLR_DOMAIN = 'verify.llronline.com';

// Division codes to query in Phase 2 (excluding div=29, which is Phase 1 auctioneers)
// Each entry: [divCode, businessCategory, displayName, aspxPage]
// aspxPage is the .aspx filename for the division (derived from URL pattern used in Phase 1)
const DIVISION_TARGETS: Array<{
  divCode: string;
  category: string;
  label: string;
  aspxPage: string;
}> = [
  {
    divCode: '26',
    category: 'PAWN_SHOP',
    label: 'Pawnbroker',
    aspxPage: 'Pawnbroker',
  },
  {
    divCode: '65',
    category: 'RESALE_SHOP',
    label: 'Secondhand Dealer',
    aspxPage: 'SecondhandDealer',
  },
];

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

/**
 * Extract plain text from an HTML string.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Parse address into city.
 */
function parseCity(address: string): string {
  const parts = address.split(',').map((s) => s.trim());
  return parts[0] || 'South Carolina';
}

interface LicenseRecord {
  name: string;
  licenseNumber: string;
  city: string;
  status: string;
}

/**
 * Parse license rows from the SC LLR search results HTML.
 * Columns: Name | License Number | Address | Status (or similar layout)
 */
function parseLicenseTable(html: string): LicenseRecord[] {
  const results: LicenseRecord[] = [];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(extractText(cellMatch[1]));
    }

    if (cells.length < 2) continue;

    const name = cells[0];
    const licenseNumber = cells[1] || '';
    const addressFull = cells[2] || '';
    const status = cells[3] || 'Active';

    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'licensee') continue;

    const city = parseCity(addressFull);

    results.push({ name, licenseNumber, city, status });
  }

  return results;
}

/**
 * Scrape one SC LLR division code.
 * Pattern: GET form page (extract VIEWSTATE), POST blank search to retrieve all licensees.
 * Falls back to alternate URL patterns if the primary aspxPage isn't found.
 */
async function scrapeOneDivision(div: {
  divCode: string;
  category: string;
  label: string;
  aspxPage: string;
}): Promise<LicenseRecord[]> {
  // Primary URL: e.g. https://verify.llronline.com/LicLookup/Pawnbroker/Pawnbroker.aspx?div=26
  const primaryUrl = `${SC_LLR_BASE}/${div.aspxPage}/${div.aspxPage}.aspx?div=${div.divCode}`;
  // Fallback: generic lookup URL
  const fallbackUrl = `${SC_LLR_BASE}/LicLookup.aspx?div=${div.divCode}`;

  let formUrl = primaryUrl;

  console.log(`[SouthCarolinaPhase2] Fetching form page for ${div.label} (div=${div.divCode})`);

  await defaultRateLimiter.waitBeforeRequest(SC_LLR_DOMAIN);

  // Step 1: GET the form page to extract ASP.NET hidden fields
  let formHtml = '';
  let formResponse = await fetch(formUrl, {
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!formResponse.ok || formResponse.url.includes('Error')) {
    // Try fallback URL
    console.warn(
      `[SouthCarolinaPhase2] Primary URL returned ${formResponse.status} for div=${div.divCode} — trying fallback`
    );
    await defaultRateLimiter.waitBeforeRequest(SC_LLR_DOMAIN);
    formResponse = await fetch(fallbackUrl, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });
    formUrl = fallbackUrl;
  }

  if (!formResponse.ok) {
    console.warn(
      `[SouthCarolinaPhase2] Could not load form for ${div.label} (div=${div.divCode}): HTTP ${formResponse.status}`
    );
    return [];
  }

  formHtml = await formResponse.text();

  // Check for "division not found" / no results page
  if (
    formHtml.includes('Page Not Found') ||
    formHtml.includes('404') ||
    formHtml.includes('Division not found')
  ) {
    console.log(
      `[SouthCarolinaPhase2] Division ${div.divCode} (${div.label}) not available — skipping`
    );
    return [];
  }

  // Extract ASP.NET form state
  const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
  const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);
  const viewStateGeneratorMatch = formHtml.match(/name="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);

  const viewState = viewStateMatch ? viewStateMatch[1] : '';
  const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';
  const viewStateGenerator = viewStateGeneratorMatch ? viewStateGeneratorMatch[1] : '';

  console.log(`[SouthCarolinaPhase2] Submitting search for ${div.label} (div=${div.divCode})`);

  // Step 2: POST blank search to retrieve all active licensees
  await defaultRateLimiter.waitBeforeRequest(SC_LLR_DOMAIN);

  const formData = new URLSearchParams();
  if (viewState) formData.append('__VIEWSTATE', viewState);
  if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
  if (viewStateGenerator) formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
  // Submit blank search — returns all active licensees for this division
  formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

  const searchResponse = await fetch(formUrl, {
    method: 'POST',
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
      Referer: formUrl,
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(45000),
  });

  if (!searchResponse.ok) {
    console.warn(
      `[SouthCarolinaPhase2] Search POST returned ${searchResponse.status} for ${div.label}`
    );
    return [];
  }

  const html = await searchResponse.text();
  const records = parseLicenseTable(html);

  console.log(
    `[SouthCarolinaPhase2] Found ${records.length} records for ${div.label} (div=${div.divCode})`
  );

  return records;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * South Carolina LLR Phase 2 scraper.
 * Queries additional division codes (pawnbrokers, secondhand dealers) not covered by Phase 1.
 * Uses the same ASP.NET form POST pattern as Phase 1 (div=29 auctioneers).
 * isStateLicensed: true — LLR data represents genuine state professional licenses.
 */
export async function runSouthCarolinaPhase2Scraper(): Promise<void> {
  console.log('[SouthCarolinaPhase2] Starting SC LLR Phase 2 scraper — additional division codes');

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Deduplicate across divisions by license number
  const seenLicenses = new Set<string>();

  try {
    for (const div of DIVISION_TARGETS) {
      let records: LicenseRecord[] = [];

      try {
        records = await scrapeOneDivision(div);
      } catch (divErr) {
        console.error(
          `[SouthCarolinaPhase2] Error scraping division ${div.divCode} (${div.label}):`,
          divErr
        );
        continue;
      }

      totalFetched += records.length;

      for (const record of records) {
        const name = record.name.trim();
        if (!name) continue;

        // Skip non-active licenses
        if (
          record.status &&
          record.status.toLowerCase() !== '' &&
          !record.status.toLowerCase().includes('active')
        ) {
          continue;
        }

        if (nameIsExcluded(name)) continue;

        // Deduplicate by license number
        const dedupKey = record.licenseNumber
          ? `LIC-${record.licenseNumber}`
          : `NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        if (seenLicenses.has(dedupKey)) continue;
        seenLicenses.add(dedupKey);

        totalMatched++;

        const city = record.city || 'South Carolina';

        console.log(
          `[SouthCarolinaPhase2] Matched: ${div.label} — ${name} (${record.licenseNumber}) in ${city}`
        );

        try {
          const orgId = await getOrCreateScrapedOrganizer(
            name,                             // businessName
            'SouthCarolinaPhase2',            // sourceName
            city,                             // city
            'SC',                             // state
            undefined,                        // esnOrgId
            undefined,                        // googlePlaceId
            undefined,                        // foursquareVenueId
            undefined,                        // hereBusinessId
            div.category,                     // businessCategory
            undefined,                        // contactEmail
            undefined,                        // phone
            undefined,                        // website
            undefined,                        // lat
            undefined,                        // lng
            true,                             // isStateLicensed (LLR = genuine state license)
            'SC',                             // licenseState
            record.licenseNumber || undefined // licenseNumber
          );
          if (orgId) totalUpserted++;
        } catch (upsertErr) {
          console.error(
            `[SouthCarolinaPhase2] Upsert error for "${name}":`,
            upsertErr
          );
        }
      }
    }

    console.log(
      `[SouthCarolinaPhase2] Complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[SouthCarolinaPhase2] Fatal error:', err);
    throw err;
  }
}
