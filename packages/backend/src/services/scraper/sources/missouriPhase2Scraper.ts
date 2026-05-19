/**
 * Missouri Division of Professional Registration — Auctioneer License Scraper (Phase 2)
 * Source: https://pr.mo.gov/listings.asp (bulk license roster downloads by board)
 *
 * The MO DPR listings page provides downloadable tab-delimited/CSV roster files
 * organized by licensing board. This scraper targets the Auctioneers board roster.
 *
 * Candidate download URLs (tried in order):
 *   1. https://pr.mo.gov/listings-auctioneers.csv
 *   2. https://pr.mo.gov/listings-auctioneers.txt (tab-delimited)
 *   3. https://pr.mo.gov/listings/auctioneers.csv
 *   4. https://pr.mo.gov/listings/auctioneers.txt
 *   5. HTML scrape of https://pr.mo.gov/listings.asp to find actual download link
 *
 * All records are auctioneers — businessCategory = 'AUCTION_HOUSE'.
 * isStateLicensed = true, licenseState = 'Missouri'.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import https from 'https';
import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const DOMAIN = 'pr.mo.gov';
const SOURCE_NAME = 'MissouriPhase2';

// MO DPR cert chain may be incomplete — same issue as Phase 1 scraper
const moHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Candidate download URLs for the auctioneers board roster
const CANDIDATE_DOWNLOAD_URLS = [
  'https://pr.mo.gov/listings-auctioneers.csv',
  'https://pr.mo.gov/listings-auctioneers.txt',
  'https://pr.mo.gov/listings/auctioneers.csv',
  'https://pr.mo.gov/listings/auctioneers.txt',
  'https://pr.mo.gov/auctioneers-listings.csv',
  'https://pr.mo.gov/auctioneers-listings.txt',
];

// Listings index page — fallback to scrape for actual download link
const LISTINGS_INDEX_URL = 'https://pr.mo.gov/listings.asp';

// Alternative: auctioneer licensee search page
const LICENSEE_SEARCH_URL = 'https://pr.mo.gov/auctioneers-licensee-search.asp';

// False-positive business name fragments — exclude these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'mortgage',
  'bank',
  'credit union',
  'financial',
  'insurance',
];

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse a tab-delimited line.
 */
function parseTsvLine(line: string): string[] {
  return line.split('\t').map((f) => f.trim().replace(/^"|"$/g, ''));
}

/**
 * Detect whether content is tab-delimited or comma-delimited.
 */
function detectDelimiter(firstLine: string): 'tab' | 'comma' {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? 'tab' : 'comma';
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Attempt to fetch a URL and return the response text, or null on failure.
 */
async function tryFetch(url: string): Promise<string | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(DOMAIN);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/csv, text/plain, text/html, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log(`[${SOURCE_NAME}] ${url} returned HTTP ${response.status}`);
      return null;
    }

    const text = await response.text();
    if (!text || text.trim().length < 50) {
      console.log(`[${SOURCE_NAME}] ${url} returned empty/minimal content`);
      return null;
    }
    return text;
  } catch (err) {
    console.log(`[${SOURCE_NAME}] ${url} fetch error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Scrape the listings index page for actual download links containing "auction".
 * Returns array of discovered download URLs.
 */
async function discoverDownloadUrls(): Promise<string[]> {
  const html = await tryFetch(LISTINGS_INDEX_URL);
  if (!html) return [];

  const urls: string[] = [];
  // Match href attributes pointing to downloadable files mentioning auction
  const linkRegex = /href=["']([^"']*auction[^"']*\.(?:csv|txt|tsv|xls|xlsx|zip))["']/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    if (!url.startsWith('http')) {
      url = `https://${DOMAIN}/${url.replace(/^\//, '')}`;
    }
    urls.push(url);
  }

  // Also look for generic download links on the page
  const genericRegex = /href=["']([^"']*listings[^"']*\.(?:csv|txt|tsv))["']/gi;
  while ((match = genericRegex.exec(html)) !== null) {
    let url = match[1];
    if (!url.startsWith('http')) {
      url = `https://${DOMAIN}/${url.replace(/^\//, '')}`;
    }
    if (!urls.includes(url)) urls.push(url);
  }

  if (urls.length > 0) {
    console.log(`[${SOURCE_NAME}] Discovered ${urls.length} download link(s) from listings page`);
  }

  return urls;
}

/**
 * Try to scrape licensee data from the auctioneer licensee search HTML page.
 * This is a fallback if bulk CSV/TSV files aren't available.
 */
async function scrapeSearchPage(): Promise<string[][]> {
  const html = await tryFetch(LICENSEE_SEARCH_URL);
  if (!html) return [];

  const rows: string[][] = [];

  // Look for table rows with licensee data
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex) || [];

  for (const table of tables) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(table)) !== null) {
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        // Strip HTML tags and decode entities
        const text = cellMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .trim();
        cells.push(text);
      }
      if (cells.length >= 2) {
        rows.push(cells);
      }
    }
  }

  return rows;
}

/**
 * Process delimited data (CSV or TSV) into organizer records.
 */
async function processDelimitedData(text: string): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;

  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { matched, upserted };

  const delimiter = detectDelimiter(lines[0]);
  const parseLine = delimiter === 'tab' ? parseTsvLine : parseCsvLine;

  console.log(`[${SOURCE_NAME}] Detected ${delimiter}-delimited format, ${lines.length - 1} data rows`);

  const rawHeaders = parseLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').trim()
  );

  // Column probe — try multiple name variants
  const probe = (...names: string[]): number => {
    for (const name of names) {
      const idx = rawHeaders.findIndex((h) => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName = probe('business_name', 'businessname', 'name', 'dba', 'licensee', 'company');
  const iFirstName = probe('first_name', 'firstname', 'first');
  const iLastName = probe('last_name', 'lastname', 'last');
  const iCity = probe('city', 'business_city', 'mailing_city');
  const iState = probe('state', 'business_state', 'mailing_state', 'st');
  const iZip = probe('zip', 'zipcode', 'zip_code', 'postal');
  const iLicenseNum = probe('license_number', 'license_no', 'lic_no', 'licensenumber', 'license', 'number');
  const iPhone = probe('phone', 'telephone', 'business_phone', 'phone_number');
  const iEmail = probe('email', 'e_mail', 'contact_email', 'business_email');
  const iStatus = probe('status', 'license_status', 'lic_status');

  console.log(`[${SOURCE_NAME}] Column mapping — name:${iName}, first:${iFirstName}, last:${iLastName}, city:${iCity}, state:${iState}, license:${iLicenseNum}, phone:${iPhone}, email:${iEmail}, status:${iStatus}`);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseLine(line);

      // Skip inactive/expired/revoked licenses if status column exists
      if (iStatus >= 0) {
        const status = (fields[iStatus] || '').toUpperCase();
        if (status.includes('EXPIRED') || status.includes('REVOKED') || status.includes('INACTIVE') || status.includes('SURRENDERED')) {
          continue;
        }
      }

      // Build display name — prefer business name, fall back to first+last
      const businessNameRaw = iName >= 0 ? (fields[iName] || '').trim() : '';
      const firstName = iFirstName >= 0 ? (fields[iFirstName] || '').trim() : '';
      const lastName = iLastName >= 0 ? (fields[iLastName] || '').trim() : '';
      const displayName = businessNameRaw || [firstName, lastName].filter(Boolean).join(' ');

      if (!displayName) continue;
      if (nameIsExcluded(displayName)) continue;

      matched++;

      const city = iCity >= 0 ? (fields[iCity] || '').trim() : '';
      const state = iState >= 0 ? (fields[iState] || '').trim() || 'MO' : 'MO';
      const licenseNumber = iLicenseNum >= 0 ? (fields[iLicenseNum] || '').trim() : '';
      const phone = iPhone >= 0 ? (fields[iPhone] || '').trim() : '';
      const email = iEmail >= 0 ? (fields[iEmail] || '').trim() : '';

      const orgId = await getOrCreateScrapedOrganizer(
        displayName,              // businessName
        SOURCE_NAME,              // sourceName
        city || 'Missouri',       // city
        state,                    // state
        undefined,                // esnOrgId
        undefined,                // googlePlaceId
        undefined,                // foursquareVenueId
        undefined,                // hereBusinessId
        'AUCTION_HOUSE',          // businessCategory — all are licensed auctioneers
        email || undefined,       // contactEmail
        phone || undefined,       // phone
        undefined,                // website
        undefined,                // lat
        undefined,                // lng
        true,                     // isStateLicensed
        'Missouri',               // licenseState
        licenseNumber || undefined // licenseNumber
      );

      if (orgId) upserted++;
    } catch (rowErr) {
      console.error(`[${SOURCE_NAME}] Row ${i} error:`, rowErr);
    }
  }

  return { matched, upserted };
}

/**
 * Process HTML table rows from the licensee search page (fallback).
 */
async function processHtmlRows(rows: string[][]): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;

  if (rows.length < 2) return { matched, upserted };

  // First row is likely headers
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '_').trim());

  const probe = (...names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName = probe('name', 'licensee', 'business', 'company', 'dba');
  const iCity = probe('city');
  const iState = probe('state', 'st');
  const iLicenseNum = probe('license', 'number', 'lic');
  const iPhone = probe('phone', 'telephone');
  const iStatus = probe('status');

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];

    if (iStatus >= 0) {
      const status = (cells[iStatus] || '').toUpperCase();
      if (status.includes('EXPIRED') || status.includes('REVOKED') || status.includes('INACTIVE')) {
        continue;
      }
    }

    const displayName = iName >= 0 ? (cells[iName] || '').trim() : cells[0]?.trim() || '';
    if (!displayName) continue;
    if (nameIsExcluded(displayName)) continue;

    matched++;

    const city = iCity >= 0 ? (cells[iCity] || '').trim() : '';
    const state = iState >= 0 ? (cells[iState] || '').trim() || 'MO' : 'MO';
    const licenseNumber = iLicenseNum >= 0 ? (cells[iLicenseNum] || '').trim() : '';
    const phone = iPhone >= 0 ? (cells[iPhone] || '').trim() : '';

    const orgId = await getOrCreateScrapedOrganizer(
      displayName,
      SOURCE_NAME,
      city || 'Missouri',
      state,
      undefined,
      undefined,
      undefined,
      undefined,
      'AUCTION_HOUSE',
      undefined,
      phone || undefined,
      undefined,
      undefined,
      undefined,
      true,
      'Missouri',
      licenseNumber || undefined
    );

    if (orgId) upserted++;
  }

  return { matched, upserted };
}

/**
 * Missouri Division of Professional Registration — Auctioneer license scraper (Phase 2).
 *
 * Strategy:
 *   1. Try candidate bulk download URLs (CSV/TSV) for auctioneers board
 *   2. Scrape listings.asp index page to discover actual download links
 *   3. Fall back to HTML scraping of licensee search page
 *   4. Throw if zero results from all approaches
 */
export async function runMissouriPhase2Scraper(): Promise<void> {
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log(`[${SOURCE_NAME}] Starting MO DPR auctioneer license scraper`);

  // Strategy 1: Try candidate download URLs directly
  for (const url of CANDIDATE_DOWNLOAD_URLS) {
    const text = await tryFetch(url);
    if (text) {
      console.log(`[${SOURCE_NAME}] Found data at ${url}`);
      const { matched, upserted } = await processDelimitedData(text);
      totalMatched += matched;
      totalUpserted += upserted;
      if (matched > 0) break; // Got data, stop trying URLs
    }
  }

  // Strategy 2: Discover download links from the listings index page
  if (totalMatched === 0) {
    console.log(`[${SOURCE_NAME}] Candidate URLs failed — scanning listings.asp for download links`);
    const discoveredUrls = await discoverDownloadUrls();

    for (const url of discoveredUrls) {
      const text = await tryFetch(url);
      if (text) {
        console.log(`[${SOURCE_NAME}] Found data via discovered link: ${url}`);
        const { matched, upserted } = await processDelimitedData(text);
        totalMatched += matched;
        totalUpserted += upserted;
        if (matched > 0) break;
      }
    }
  }

  // Strategy 3: Fall back to HTML scraping of licensee search page
  if (totalMatched === 0) {
    console.log(`[${SOURCE_NAME}] No bulk download found — trying licensee search page HTML scrape`);
    const rows = await scrapeSearchPage();
    if (rows.length > 1) {
      console.log(`[${SOURCE_NAME}] Found ${rows.length - 1} rows from search page HTML`);
      const { matched, upserted } = await processHtmlRows(rows);
      totalMatched += matched;
      totalUpserted += upserted;
    }
  }

  console.log(`[${SOURCE_NAME}] Complete — Matched: ${totalMatched}, Upserted: ${totalUpserted}`);

  if (totalMatched === 0) {
    throw new Error(
      `[${SOURCE_NAME}] Zero results from all strategies. ` +
      `Tried ${CANDIDATE_DOWNLOAD_URLS.length} direct URLs, listings.asp discovery, and HTML search page scrape. ` +
      `The MO DPR site may have changed structure. Check https://pr.mo.gov/listings.asp manually ` +
      `and update CANDIDATE_DOWNLOAD_URLS or parsing logic.`
    );
  }
}
