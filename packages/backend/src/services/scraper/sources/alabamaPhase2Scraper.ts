/**
 * Alabama State Board of Auctioneers — Auctioneer License Scraper (Phase 2)
 * Source: Alabama Auctioneer Board licensee search API
 *   https://alauc-search.kalmservices.net/api/search/licenses
 *   (linked from https://auctioneer.alabama.gov/licensee-search/)
 *
 * The API accepts POST requests with JSON body: { parameters: { lastName: "X" }, turnstileToken: "" }
 * Turnstile is frontend-only — the backend does not enforce token validation.
 *
 * Response: { jsonColumns: string, jsonContent: string } where jsonContent is a JSON array of licensee objects.
 * Each record has: Name, LicenseNumber, LicenseType, Company, Address, Phone, IssueDate, ExpirationDate, LicenseStatus
 *
 * Strategy: iterate A–Z as lastName prefix to fetch all active auctioneers.
 * Deduplicate by LicenseNumber (same licensee may appear in multiple letter queries).
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const SEARCH_API_URL = 'https://alauc-search.kalmservices.net/api/search/licenses';
const API_DOMAIN = 'alauc-search.kalmservices.net';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// False-positive name fragments — exclude row if company name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'mortgage',
  'bank',
  'credit union',
  'financial',
  'insurance',
  'law office',
  'attorney',
  'lawyer',
  'dental',
  'dentist',
  'medical',
  'clinic',
  'pharmacy',
  'hospital',
  'restaurant',
  'hotel',
  'motel',
];

/**
 * Return true if the name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Parse city from Address field. Address format: "street|city, ST zip" or "street|city, ST"
 */
function parseCityFromAddress(address: string): string {
  if (!address) return '';
  // Address uses | as line separator
  const parts = address.split('|');
  const lastLine = (parts[parts.length - 1] || '').trim();
  // Extract city from "City, ST ZIP" pattern
  const cityMatch = lastLine.match(/^([^,]+),\s*[A-Z]{2}/);
  if (cityMatch) {
    return cityMatch[1].trim();
  }
  return lastLine;
}

/**
 * Parse state from Address field.
 */
function parseStateFromAddress(address: string): string {
  if (!address) return 'AL';
  const parts = address.split('|');
  const lastLine = (parts[parts.length - 1] || '').trim();
  const stateMatch = lastLine.match(/,\s*([A-Z]{2})\s/);
  if (stateMatch) {
    return stateMatch[1];
  }
  return 'AL';
}

interface AlabamaLicensee {
  WorkerId: number;
  Name: string;
  LicenseNumber: string;
  LicenseType: string;
  LicenseStatus: string;
  Company: string;
  Address: string;
  Phone: string;
  IssueDate: string;
  ExpirationDate: string;
  LicenseId: number;
  CeuCompleted: string;
  CeuModal: string;
}

interface SearchResponse {
  jsonColumns: string;
  jsonContent: string;
  error?: string;
}

/**
 * Fetch licensees for a given lastName prefix from the Alabama auctioneer API.
 */
async function fetchLicenseesByLastName(letter: string): Promise<AlabamaLicensee[]> {
  await defaultRateLimiter.waitBeforeRequest(API_DOMAIN);

  const response = await fetch(SEARCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': getRandomUserAgent(),
      Accept: 'application/json',
    },
    body: JSON.stringify({
      parameters: { lastName: letter },
      turnstileToken: '',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    console.warn(`[Alabama Phase2] API returned HTTP ${response.status} for letter "${letter}"`);
    return [];
  }

  const data = (await response.json()) as SearchResponse;

  if (data.error) {
    console.warn(`[Alabama Phase2] API error for letter "${letter}": ${data.error}`);
    return [];
  }

  if (!data.jsonContent) {
    return [];
  }

  try {
    return JSON.parse(data.jsonContent) as AlabamaLicensee[];
  } catch {
    console.warn(`[Alabama Phase2] Failed to parse jsonContent for letter "${letter}"`);
    return [];
  }
}

/**
 * Alabama State Board of Auctioneers — auctioneer license scraper.
 * Iterates A–Z as lastName prefix to fetch all active auctioneers from the
 * kalmservices.net API. Deduplicates by LicenseNumber. Uses the Company field
 * as the business name for getOrCreateScrapedOrganizer.
 */
export async function runAlabamaPhase2Scraper(): Promise<void> {
  console.log('[Alabama Phase2] Starting auctioneer license scraper — Alabama Board of Auctioneers');
  console.log(`[Alabama Phase2] Source: ${SEARCH_API_URL}`);

  const seenLicenseNumbers = new Set<string>();
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let totalSkippedDupe = 0;
  let totalSkippedExclude = 0;
  let totalSkippedInactive = 0;

  try {
    for (const letter of ALPHABET) {
      console.log(`[Alabama Phase2] Fetching licensees for lastName prefix "${letter}"...`);

      const licensees = await fetchLicenseesByLastName(letter);
      console.log(`[Alabama Phase2] Letter "${letter}": ${licensees.length} results`);
      totalFetched += licensees.length;

      for (const lic of licensees) {
        // Deduplicate by LicenseNumber
        const licNum = (lic.LicenseNumber || '').trim();
        if (!licNum || seenLicenseNumbers.has(licNum)) {
          if (licNum) totalSkippedDupe++;
          continue;
        }
        seenLicenseNumbers.add(licNum);

        // Only active licenses
        if (lic.LicenseStatus && lic.LicenseStatus.toLowerCase() !== 'active') {
          totalSkippedInactive++;
          continue;
        }

        // Use Company name as business; fall back to licensee Name
        const companyName = (lic.Company || '').trim();
        const licenseeName = (lic.Name || '').trim();
        const businessName = companyName || licenseeName;

        if (!businessName) continue;

        // Apply exclude filter on both company and licensee name
        if (nameIsExcluded(companyName) || nameIsExcluded(licenseeName)) {
          totalSkippedExclude++;
          continue;
        }

        const city = parseCityFromAddress(lic.Address);
        const state = parseStateFromAddress(lic.Address);
        const phone = (lic.Phone || '').trim() || undefined;

        totalMatched++;

        try {
          const orgId = await getOrCreateScrapedOrganizer(
            businessName,               // businessName
            'AlabamaPhase2',            // sourceName
            city || 'Alabama',          // city
            state,                      // state
            undefined,                  // esnOrgId
            undefined,                  // googlePlaceId
            undefined,                  // foursquareVenueId
            undefined,                  // hereBusinessId
            'AUCTION_HOUSE',            // businessCategory
            undefined,                  // contactEmail
            phone,                      // phone
            undefined,                  // website
            undefined,                  // lat
            undefined,                  // lng
            true,                       // isStateLicensed
            'Alabama',                  // licenseState
            licNum,                     // licenseNumber
            'Alabama Board of Auctioneers' // sourceLabel
          );
          if (orgId) totalUpserted++;
        } catch (upsertErr) {
          console.error(
            `[Alabama Phase2] Upsert error for "${businessName}" (License ${licNum}):`,
            upsertErr
          );
        }
      }

      // Progress logging every 5 letters
      if ((ALPHABET.indexOf(letter) + 1) % 5 === 0) {
        console.log(
          `[Alabama Phase2] Progress: ${totalFetched} fetched, ${totalMatched} matched, ${totalUpserted} upserted, ${totalSkippedDupe} dupes, ${totalSkippedExclude} excluded, ${totalSkippedInactive} inactive`
        );
      }
    }

    console.log(
      `[Alabama Phase2] Done — fetched: ${totalFetched}, unique: ${seenLicenseNumbers.size}, matched: ${totalMatched}, upserted: ${totalUpserted}, dupes: ${totalSkippedDupe}, excluded: ${totalSkippedExclude}, inactive: ${totalSkippedInactive}`
    );

    if (totalMatched === 0) {
      throw new Error(
        'Alabama Phase2 scraper completed but found zero matching auctioneer records'
      );
    }
  } catch (error) {
    console.error('[Alabama Phase2] Scraper error:', error);
    throw error;
  }
}
