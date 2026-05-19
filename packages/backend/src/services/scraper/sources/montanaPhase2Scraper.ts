/**
 * Montana DLI (Department of Labor and Industry) — Auctioneer License Scraper (Phase 2)
 * Scrapes licensed auctioneers from Montana DLI eBiz public license lookup.
 * Primary: https://ebiz.mt.gov/Public/ — eBiz Montana public license search
 * Fallback: https://app.mt.gov/cgi-bin/oefi/licensing/ — OEFI licensing CGI
 *
 * Montana auctioneers are licensed under MCA § 30-11-101 et seq., regulated by DLI.
 * The eBiz portal provides a searchable HTML interface for active licensees.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const EBIZ_SEARCH_URL = 'https://ebiz.mt.gov/Public/LicenseSearch';
const EBIZ_DOMAIN = 'ebiz.mt.gov';
const OEFI_CGI_URL = 'https://app.mt.gov/cgi-bin/oefi/licensing/';
const OEFI_DOMAIN = 'app.mt.gov';
const SOURCE_NAME = 'MontanaPhase2';
const SOURCE_LABEL = 'MT-DLI-Auctioneer';

// Search terms to try against Montana DLI — auctioneer license types
const SEARCH_TERMS = [
  'auctioneer',
  'auction',
  'livestock auction',
  'auto auction',
];

// False-positive business name fragments — exclude rows matching these
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text content from an HTML cell, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse license records from HTML table rows.
 * Expects rows with cells: [Name/Business], [License #], [City], [Status], ...
 * Adapts to various column orders by scanning header row.
 */
function parseHtmlTable(html: string): Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
  status: string;
}> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
    status: string;
  }> = [];

  // Find all tables in the HTML
  const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];

  for (const tableHtml of tableMatches) {
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;

    // Try to detect column positions from header row
    const headerCells = (rows[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(c => extractText(c).toLowerCase());

    let nameCol = -1;
    let licenseCol = -1;
    let cityCol = -1;
    let statusCol = -1;

    for (let ci = 0; ci < headerCells.length; ci++) {
      const h = headerCells[ci];
      if (h.includes('name') || h.includes('business') || h.includes('licensee') || h.includes('entity')) nameCol = ci;
      if (h.includes('license') && (h.includes('number') || h.includes('#') || h.includes('no'))) licenseCol = ci;
      if (h.includes('city') || h.includes('location') || h.includes('address')) cityCol = ci;
      if (h.includes('status') || h.includes('active') || h.includes('state')) statusCol = ci;
    }

    // If we couldn't find columns from headers, use positional defaults
    if (nameCol === -1) nameCol = 0;
    if (licenseCol === -1) licenseCol = 1;
    if (cityCol === -1 && headerCells.length > 2) cityCol = 2;
    if (statusCol === -1 && headerCells.length > 3) statusCol = 3;

    // Parse data rows (skip header)
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = (rows[ri].match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(c => extractText(c));
      if (cells.length < 2) continue;

      const businessName = cells[nameCol] || '';
      const licenseNumber = cells[licenseCol] || '';
      const city = cityCol >= 0 && cityCol < cells.length ? cells[cityCol] : '';
      const status = statusCol >= 0 && statusCol < cells.length ? cells[statusCol] : 'Active';

      if (businessName && businessName.length > 1) {
        results.push({ businessName, licenseNumber, city, status });
      }
    }
  }

  return results;
}

/**
 * Try fetching auctioneer data from eBiz Montana public license search.
 * eBiz exposes a search form — we POST search criteria or GET with query params.
 */
async function fetchFromEbiz(): Promise<Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
}>> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
  }> = [];

  for (const term of SEARCH_TERMS) {
    await defaultRateLimiter.waitBeforeRequest(EBIZ_DOMAIN);

    // Try GET search with query parameters
    const searchUrl = `${EBIZ_SEARCH_URL}?searchType=LicenseType&searchTerm=${encodeURIComponent(term)}&state=MT`;

    try {
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.warn(`[${SOURCE_NAME}] eBiz search returned ${response.status} for term "${term}"`);
        continue;
      }

      const html = await response.text();
      const parsed = parseHtmlTable(html);

      for (const row of parsed) {
        // Only include active licenses
        if (row.status.toLowerCase() !== 'active' && row.status.toLowerCase() !== '') continue;
        if (nameIsExcluded(row.businessName)) continue;

        results.push({
          businessName: row.businessName,
          licenseNumber: row.licenseNumber,
          city: row.city,
        });
      }

      console.log(`[${SOURCE_NAME}] eBiz term "${term}": ${parsed.length} rows, ${results.length} matched so far`);
    } catch (err) {
      console.warn(`[${SOURCE_NAME}] eBiz fetch error for term "${term}":`, err);
    }
  }

  return results;
}

/**
 * Try fetching auctioneer data from OEFI CGI licensing portal (fallback).
 * The CGI endpoint may accept GET params for license type.
 */
async function fetchFromOefi(): Promise<Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
}>> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
  }> = [];

  await defaultRateLimiter.waitBeforeRequest(OEFI_DOMAIN);

  try {
    // Try the CGI endpoint with auctioneer license type parameter
    const response = await fetch(`${OEFI_CGI_URL}?type=auctioneer`, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[${SOURCE_NAME}] OEFI CGI returned ${response.status}`);
      return results;
    }

    const html = await response.text();
    const parsed = parseHtmlTable(html);

    for (const row of parsed) {
      if (nameIsExcluded(row.businessName)) continue;
      results.push({
        businessName: row.businessName,
        licenseNumber: row.licenseNumber,
        city: row.city,
      });
    }

    console.log(`[${SOURCE_NAME}] OEFI CGI: ${parsed.length} rows, ${results.length} matched`);
  } catch (err) {
    console.warn(`[${SOURCE_NAME}] OEFI CGI fetch error:`, err);
  }

  return results;
}

/**
 * Deduplicate records by license number or business name.
 */
function deduplicateRecords(
  records: Array<{ businessName: string; licenseNumber: string; city: string }>
): Array<{ businessName: string; licenseNumber: string; city: string }> {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = r.licenseNumber
      ? `LIC:${r.licenseNumber}`
      : `NAME:${r.businessName.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Montana DLI auctioneer license scraper.
 * Queries eBiz Montana public license search for auctioneer licenses.
 * Falls back to OEFI CGI licensing portal.
 * Throws if zero results (prevents silent failure).
 */
export async function runMontanaPhase2Scraper(): Promise<void> {
  console.log(`[${SOURCE_NAME}] Starting auctioneer license scraper — Montana DLI`);
  console.log(`[${SOURCE_NAME}] Primary source: ${EBIZ_SEARCH_URL}`);
  console.log(`[${SOURCE_NAME}] Fallback source: ${OEFI_CGI_URL}`);

  let totalUpserted = 0;

  try {
    // Step 1: Try eBiz Montana
    let records = await fetchFromEbiz();
    console.log(`[${SOURCE_NAME}] eBiz returned ${records.length} records`);

    // Step 2: Fallback to OEFI if eBiz returned nothing
    if (records.length === 0) {
      console.log(`[${SOURCE_NAME}] eBiz returned 0 — trying OEFI CGI fallback`);
      records = await fetchFromOefi();
      console.log(`[${SOURCE_NAME}] OEFI returned ${records.length} records`);
    }

    // Deduplicate across sources
    const unique = deduplicateRecords(records);
    console.log(`[${SOURCE_NAME}] ${unique.length} unique records after dedup`);

    // Step 3: Upsert via getOrCreateScrapedOrganizer
    for (const record of unique) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          record.businessName,       // businessName
          SOURCE_NAME,               // sourceName
          record.city || 'Montana',  // city
          'MT',                      // state
          undefined,                 // esnOrgId
          undefined,                 // googlePlaceId
          undefined,                 // foursquareVenueId
          undefined,                 // hereBusinessId
          'AUCTION_HOUSE',           // businessCategory — all are auctioneers
          undefined,                 // contactEmail
          undefined,                 // phone
          undefined,                 // website
          undefined,                 // lat
          undefined,                 // lng
          true,                      // isStateLicensed
          'Montana',                 // licenseState
          record.licenseNumber || undefined, // licenseNumber
          SOURCE_LABEL               // sourceLabel
        );
        if (orgId) totalUpserted++;
      } catch (upsertErr) {
        console.error(`[${SOURCE_NAME}] Upsert error for "${record.businessName}":`, upsertErr);
      }
    }

    console.log(
      `[${SOURCE_NAME}] Done — fetched: ${records.length}, unique: ${unique.length}, upserted: ${totalUpserted}`
    );

    if (unique.length === 0) {
      throw new Error(
        `[${SOURCE_NAME}] Zero results from all sources (eBiz + OEFI). ` +
        `Both endpoints may be blocking automated requests or have changed structure. ` +
        `Verify endpoints manually: ${EBIZ_SEARCH_URL} and ${OEFI_CGI_URL}`
      );
    }
  } catch (error) {
    console.error(`[${SOURCE_NAME}] Scraper error:`, error);
    throw error;
  }
}
