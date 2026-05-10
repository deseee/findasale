/**
 * Maryland — Secondary Sale License Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * SOURCE: Maryland Judiciary Business Licenses Online
 *   https://jportal.mdcourts.gov/license/
 *
 * Coverage: Auctioneer, Secondhand Dealer, Pawnbroker licenses across all 24 MD jurisdictions.
 * The portal requires selecting a jurisdiction (county/Baltimore City) and license type.
 *
 * APPROACH: Query the public search endpoint across key jurisdictions for auction and
 * secondhand dealer license types. The portal is HTML-based; we parse table rows.
 *
 * NOTE: The MD Judiciary portal is an ASP.NET application. Direct HTTP GET of the
 * results page may require ViewState; if blocked, this scraper falls through gracefully
 * to zero results and logs the diagnostic. DLLR precious metal dealers at
 * https://labor.maryland.gov/pq/ are an additional source for future enhancement.
 *
 * If the HTML scrape is blocked, a FOIA request to the MD Judiciary Circuit Court
 * Clerk's offices or DLLR is the recommended fallback.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const MD_LICENSE_BASE = 'https://jportal.mdcourts.gov/license';
const MD_LICENSE_DOMAIN = 'jportal.mdcourts.gov';

// MD jurisdiction codes used in the portal
const MD_JURISDICTIONS = [
  { code: '01', name: 'Allegany' },
  { code: '02', name: 'Anne Arundel' },
  { code: '03', name: 'Baltimore City' },
  { code: '04', name: 'Baltimore County' },
  { code: '05', name: 'Calvert' },
  { code: '06', name: 'Caroline' },
  { code: '07', name: 'Carroll' },
  { code: '08', name: 'Cecil' },
  { code: '09', name: 'Charles' },
  { code: '10', name: 'Dorchester' },
  { code: '11', name: 'Frederick' },
  { code: '12', name: 'Garrett' },
  { code: '13', name: 'Harford' },
  { code: '14', name: 'Howard' },
  { code: '15', name: 'Kent' },
  { code: '16', name: 'Montgomery' },
  { code: '17', name: "Prince George's" },
  { code: '18', name: "Queen Anne's" },
  { code: '19', name: "St. Mary's" },
  { code: '20', name: 'Somerset' },
  { code: '21', name: 'Talbot' },
  { code: '22', name: 'Washington' },
  { code: '23', name: 'Wicomico' },
  { code: '24', name: 'Worcester' },
];

// License type codes for the MD portal
const MD_LICENSE_TYPES = [
  { code: 'A', label: 'Auctioneer' },
  { code: 'S', label: 'Secondhand Dealer' },
  { code: 'P', label: 'Pawnbroker' },
];

interface MdLicenseRecord {
  businessName: string;
  city: string;
  licenseNumber: string;
  licenseType: string;
  county: string;
}

/**
 * Extract text from an HTML fragment, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Parse HTML table rows from MD Judiciary license results page.
 * Returns array of license records found.
 */
function parseResultsHtml(html: string, countyName: string, licenseLabel: string): MdLicenseRecord[] {
  const records: MdLicenseRecord[] = [];

  // Match data rows in results table
  const rows = html.match(/<tr[^>]*class="[^"]*(?:odd|even|row)[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  // Fallback: match any tr with td content if class-based match fails
  const allRows = rows.length > 0 ? rows : (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []);

  for (const row of allRows) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    if (cells.length < 2) continue;

    const licenseNumber = extractText(cells[0]);
    const businessName = extractText(cells[1]);
    const city = cells.length > 2 ? extractText(cells[2]) : countyName;

    if (!businessName || businessName.length < 3) continue;
    // Skip header-like rows
    if (businessName.toLowerCase().includes('business name') || licenseNumber.toLowerCase().includes('license')) continue;

    records.push({
      businessName,
      city: city || countyName,
      licenseNumber,
      licenseType: licenseLabel,
      county: countyName,
    });
  }

  return records;
}

/**
 * Attempt to fetch license results for a given jurisdiction and license type.
 * The MD Judiciary portal uses a GET-based search at /license/index_search.jsp.
 * Falls through gracefully if the response is not parseable HTML with tabular data.
 */
async function fetchJurisdictionLicenses(
  jurisdictionCode: string,
  jurisdictionName: string,
  licenseTypeCode: string,
  licenseTypeLabel: string
): Promise<MdLicenseRecord[]> {
  const url = `${MD_LICENSE_BASE}/index_search.jsp?countyCode=${jurisdictionCode}&licenseType=${licenseTypeCode}&action=search`;

  try {
    await defaultRateLimiter.waitBeforeRequest(MD_LICENSE_DOMAIN);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${MD_LICENSE_BASE}/index_disclaimer.jsp`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(
        `[MarylandPhase2] HTTP ${response.status} for ${jurisdictionName} / ${licenseTypeLabel}`
      );
      return [];
    }

    const html = await response.text();

    // Check for disclaimer/redirect page (ASP.NET session not established)
    if (html.includes('disclaimer') || html.includes('ViewState') || !html.includes('<table')) {
      console.warn(
        `[MarylandPhase2] Portal returned disclaimer/ViewState page for ${jurisdictionName} / ${licenseTypeLabel} — ASP.NET session required`
      );
      return [];
    }

    return parseResultsHtml(html, jurisdictionName, licenseTypeLabel);
  } catch (err) {
    console.warn(
      `[MarylandPhase2] Fetch error for ${jurisdictionName} / ${licenseTypeLabel}:`,
      err
    );
    return [];
  }
}

/**
 * Maryland secondary sale scraper — Phase 2.
 *
 * Attempts to scrape Maryland Judiciary Business Licenses Online portal
 * across all 24 jurisdictions for Auctioneer, Secondhand Dealer, and Pawnbroker licenses.
 *
 * Falls through cleanly to zero results if the portal requires ASP.NET ViewState session.
 * In that case, a FOIA request to MD Circuit Court Clerks is the recommended path.
 */
export async function runMarylandPhase2Scraper(): Promise<void> {
  console.log('[MarylandPhase2] Starting Maryland secondary sale license scraper');
  console.log(
    '[MarylandPhase2] Source: MD Judiciary Business Licenses Online (jportal.mdcourts.gov/license/)'
  );

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let viewStateBlocked = false;

  try {
    for (const jurisdiction of MD_JURISDICTIONS) {
      if (viewStateBlocked) break;

      for (const licenseType of MD_LICENSE_TYPES) {
        const records = await fetchJurisdictionLicenses(
          jurisdiction.code,
          jurisdiction.name,
          licenseType.code,
          licenseType.label
        );

        // If first jurisdiction returns zero on first type, likely ViewState-blocked
        if (
          records.length === 0 &&
          jurisdiction.code === '01' &&
          licenseType.code === 'A'
        ) {
          console.warn(
            '[MarylandPhase2] First jurisdiction returned 0 records — portal likely requires ASP.NET ViewState session.'
          );
          console.warn(
            '[MarylandPhase2] Fallback: File FOIA with MD Circuit Court Clerk offices or DLLR for bulk licensee data.'
          );
          viewStateBlocked = true;
          break;
        }

        totalFetched += records.length;
        totalMatched += records.length;

        for (const rec of records) {
          const orgType =
            licenseType.label === 'Auctioneer'
              ? 'AUCTION_HOUSE'
              : licenseType.label === 'Pawnbroker'
              ? 'PAWN_SHOP'
              : 'SECONDHAND_SHOP';

          try {
            const orgId = await getOrCreateScrapedOrganizer(
              rec.businessName,
              'MarylandPhase2',
              rec.city || rec.county || 'Maryland',
              'MD',
              undefined,
              undefined,
              undefined,
              undefined,
              orgType as 'AUCTION_HOUSE' | 'PAWN_SHOP' | 'SECONDHAND_SHOP',
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              true,
              'MD',
              rec.licenseNumber || undefined
            );
            if (orgId) totalUpserted++;
          } catch (err) {
            console.error(`[MarylandPhase2] Error upserting ${rec.businessName}:`, err);
          }
        }

        if (records.length > 0) {
          console.log(
            `[MarylandPhase2] ${jurisdiction.name} / ${licenseType.label}: ${records.length} records`
          );
        }
      }
    }

    if (viewStateBlocked) {
      console.log(
        '[MarylandPhase2] Completed (portal blocked) — Fetched: 0, Matched: 0, Upserted: 0'
      );
      console.log(
        '[MarylandPhase2] NEXT STEP: FOIA to MD Circuit Court Clerk offices or DLLR for bulk secondhand dealer / auctioneer / pawnbroker lists.'
      );
    } else {
      console.log(
        `[MarylandPhase2] Completed — Fetched: ${totalFetched}, Matched: ${totalMatched}, Upserted: ${totalUpserted}`
      );
    }
  } catch (err) {
    console.error('[MarylandPhase2] Fatal error:', err);
  }
}
