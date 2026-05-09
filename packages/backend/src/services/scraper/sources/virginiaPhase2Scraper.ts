/**
 * Virginia DPOR Regulant Lists — Secondary Sale Business Scraper (Phase 2)
 * Source: Virginia Department of Professional and Occupational Regulation (DPOR)
 * Bulk download: https://www.dpor.virginia.gov/RegulantLists
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Attempts three data sources in order:
 *   1. DPOR Auctioneer bulk download (tab-delimited .txt)
 *   2. Dynamic link discovery from the DPOR RegulantLists page
 *   3. VA Open Data portal (may 404 — handled gracefully)
 *
 * If all sources fail: logs clearly and returns without throwing.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const DPOR_DOMAIN = 'www.dpor.virginia.gov';
const VA_OPEN_DATA_DOMAIN = 'data.virginia.gov';

// Known direct download URLs for DPOR Auctioneer Board regulant lists
// Confirmed from https://www.dpor.virginia.gov/RegulantLists (2026-05-09)
// These are ALL processed — not short-circuited on first success
const DPOR_AUCTIONEER_URLS = [
  'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2905__crnt.txt', // Auctioneer Individual
  'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2906__crnt.txt', // Auctioneer Firm
  'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2907__crnt.txt', // Auctioneer Individual
  'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2908__crnt.txt', // Auctioneer Firm
];

const DPOR_REGULANT_LIST_PAGE = 'https://www.dpor.virginia.gov/RegulantLists';

// VA Open Data portal business licenses (may 404 — handled gracefully)
const VA_OPEN_DATA_URL =
  'https://data.virginia.gov/api/views/business-licenses/rows.csv?accessType=DOWNLOAD';

// Profession/license types that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_TYPES = new Set([
  'AUCTIONEER',
  'AUCTION FIRM',
  'AUCTION HOUSE',
  'SECONDHAND DEALER',
  'SECOND HAND DEALER',
  'PAWNBROKER',
]);

// Case-insensitive keywords — any match includes the row when type is broader
const SALE_TYPE_KEYWORDS = [
  'pawn',
  'estate sale',
  'consign',
  'thrift',
  'resale',
  'antique',
  'vintage',
  'collectible',
  'flea market',
  'swap meet',
  'liquidat',
  'salvage',
  'junk dealer',
  'used goods',
  'auction',
  'used furniture',
  'used appliance',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'treasure',
  'rummage',
];

// False-positive name fragments — exclude row if business name contains any of these
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
  'heating',
  'air condition',
  'roofing',
  'automotive repair',
  'body shop',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'barbershop',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
  'preschool',
];

/**
 * Parse a single CSV line respecting quoted fields (commas inside quotes are ignored).
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
 * Return true if the business name matches at least one keyword (case-insensitive).
 */
function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map a VA profession/license type to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Determine whether a profession/type string qualifies as always-include.
 */
function isAlwaysInclude(typeRaw: string): boolean {
  const upper = typeRaw.toUpperCase();
  return [...ALWAYS_INCLUDE_TYPES].some((t) => upper.includes(t));
}

/**
 * Attempt to fetch a URL; return null on failure (no throw).
 */
async function tryFetch(
  url: string,
  domain: string,
  acceptHeader: string
): Promise<string | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(domain);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: acceptHeader },
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.log(`[Virginia Phase2] ${url} -> HTTP ${response.status} (skipping)`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.log(`[Virginia Phase2] ${url} -> fetch error (skipping):`, err);
    return null;
  }
}

/**
 * Discover auction-related .txt/.csv download links from the DPOR RegulantLists page.
 */
function discoverAuctionLinks(html: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href="([^"]*(?:auction)[^"]*\.(?:txt|csv)[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('http')) {
      links.push(href);
    } else if (href.startsWith('/')) {
      links.push(`https://www.dpor.virginia.gov${href}`);
    }
  }
  return [...new Set(links)];
}

/**
 * Process a tab-delimited DPOR regulant list text.
 */
async function processDporTabDelimited(
  text: string,
  sourceName: string
): Promise<{ matched: number; upserted: number }> {
  const lines = text.split('\n');
  if (lines.length < 2) {
    console.warn(`[Virginia Phase2] ${sourceName}: file appears empty or has no data rows`);
    return { matched: 0, upserted: 0 };
  }

  const headers = lines[0].split('\t').map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  console.log(`[Virginia Phase2] ${sourceName} headers: ${headers.join(' | ')}`);

  const col = (name: string): number => headers.indexOf(name);

  const iName = col('business name') !== -1 ? col('business name')
    : col('name') !== -1 ? col('name')
    : col('regulant name') !== -1 ? col('regulant name')
    : col('licensee name');

  const iCity = col('city') !== -1 ? col('city')
    : col('business city');

  const iLicense = col('license number') !== -1 ? col('license number')
    : col('license no') !== -1 ? col('license no')
    : col('credential number');

  const iType = col('credential type') !== -1 ? col('credential type')
    : col('license type') !== -1 ? col('license type')
    : col('profession') !== -1 ? col('profession')
    : col('type');

  let matched = 0;
  let upserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = line.split('\t');

      const businessName = (iName >= 0 ? fields[iName] || '' : '').trim();
      if (!businessName) continue;

      const licenseTypeRaw = (iType >= 0 ? fields[iType] || '' : '').trim();
      const qualifies = isAlwaysInclude(licenseTypeRaw) || nameMatchesKeyword(businessName);

      if (!qualifies) continue;
      if (nameIsExcluded(businessName)) continue;

      matched++;

      const city = (iCity >= 0 ? fields[iCity] || '' : '').trim();
      const businessCategory = mapCategory(licenseTypeRaw);

      const orgId = await getOrCreateScrapedOrganizer(
        businessName,             // businessName
        sourceName,               // sourceName
        city || 'Virginia',       // city
        'VA',                     // state
        undefined,                // esnOrgId
        undefined,                // googlePlaceId
        undefined,                // foursquareVenueId
        undefined,                // hereBusinessId
        businessCategory,         // businessCategory
        undefined,                // contactEmail
        undefined,                // phone
        undefined                 // website
      );

      if (orgId) {
        upserted++;
      }
    } catch (rowErr) {
      console.error(`[Virginia Phase2] ${sourceName}: Error on row ${i}:`, rowErr);
    }
  }

  return { matched, upserted };
}

/**
 * Process a CSV business license file from VA Open Data portal.
 */
async function processVaOpenDataCsv(
  csvText: string
): Promise<{ matched: number; upserted: number }> {
  const lines = csvText.split('\n');
  if (lines.length < 2) {
    console.warn('[Virginia Phase2] VA Open Data CSV: file appears empty or has no data rows');
    return { matched: 0, upserted: 0 };
  }

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, ' ').trim()
  );
  console.log('[Virginia Phase2] VA Open Data headers:', headers.join(', '));

  const col = (name: string): number => headers.indexOf(name);

  const iName = col('business name') !== -1 ? col('business name') : col('name');
  const iType = col('license type') !== -1 ? col('license type') : col('business type');
  const iCity = col('city');
  const iStatus = col('status') !== -1 ? col('status') : col('license status');

  let matched = 0;
  let upserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const businessName = (iName >= 0 ? fields[iName] || '' : '').trim();
      if (!businessName) continue;

      const statusRaw = (iStatus >= 0 ? fields[iStatus] || '' : '').trim().toUpperCase();
      if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'CURRENT' && statusRaw !== 'OPEN') {
        continue;
      }

      const licenseTypeRaw = (iType >= 0 ? fields[iType] || '' : '').trim();
      const qualifies = isAlwaysInclude(licenseTypeRaw) || nameMatchesKeyword(businessName);

      if (!qualifies) continue;
      if (nameIsExcluded(businessName)) continue;

      matched++;

      const city = (iCity >= 0 ? fields[iCity] || '' : '').trim();
      const businessCategory = mapCategory(licenseTypeRaw);

      const orgId = await getOrCreateScrapedOrganizer(
        businessName,             // businessName
        'VirginiaOpenData',       // sourceName
        city || 'Virginia',       // city
        'VA',                     // state
        undefined,                // esnOrgId
        undefined,                // googlePlaceId
        undefined,                // foursquareVenueId
        undefined,                // hereBusinessId
        businessCategory,         // businessCategory
        undefined,                // contactEmail
        undefined,                // phone
        undefined                 // website
      );

      if (orgId) {
        upserted++;
      }
    } catch (rowErr) {
      console.error(`[Virginia Phase2] VA Open Data: Error on row ${i}:`, rowErr);
    }
  }

  return { matched, upserted };
}

/**
 * Virginia DPOR Regulant Lists secondary sale scraper.
 *
 * Source priority:
 *   1. Known DPOR Auctioneer.txt direct URLs
 *   2. Discovered links from DPOR RegulantLists page
 *   3. VA Open Data portal CSV (may 404)
 *
 * If all sources fail, logs clearly and returns without throwing.
 */
export async function runVirginiaPhase2Scraper(): Promise<void> {
  let totalMatched = 0;
  let totalUpserted = 0;
  let anySourceSucceeded = false;

  console.log('[Virginia Phase2] Starting secondary sale scraper via DPOR Regulant Lists');

  // Source 1: Fetch all 4 DPOR Auctioneer Board files (each is a distinct license type)
  for (const url of DPOR_AUCTIONEER_URLS) {
    console.log(`[Virginia Phase2] Trying direct DPOR URL: ${url}`);
    const text = await tryFetch(url, DPOR_DOMAIN, 'text/plain,*/*');
    if (text && text.trim().length > 0) {
      console.log(`[Virginia Phase2] DPOR direct download succeeded: ${url}`);
      const { matched, upserted } = await processDporTabDelimited(text, 'VirginiaDPOR');
      totalMatched += matched;
      totalUpserted += upserted;
      anySourceSucceeded = true;
      console.log(`[Virginia Phase2] DPOR direct: matched ${matched}, upserted ${upserted}`);
      // NOTE: no break — process all 4 files (different license types)
    }
  }

  // Source 2: Discover auction links from the DPOR RegulantLists page
  if (!anySourceSucceeded) {
    console.log('[Virginia Phase2] Attempting DPOR RegulantLists page link discovery...');
    const html = await tryFetch(DPOR_REGULANT_LIST_PAGE, DPOR_DOMAIN, 'text/html,*/*');
    if (html) {
      const links = discoverAuctionLinks(html);
      console.log(`[Virginia Phase2] Discovered ${links.length} auction-related link(s) from DPOR page`);

      for (const link of links) {
        console.log(`[Virginia Phase2] Trying discovered link: ${link}`);
        const text = await tryFetch(link, DPOR_DOMAIN, 'text/plain,*/*');
        if (text && text.trim().length > 0) {
          const { matched, upserted } = await processDporTabDelimited(text, 'VirginiaDPORDiscovered');
          totalMatched += matched;
          totalUpserted += upserted;
          anySourceSucceeded = true;
          console.log(`[Virginia Phase2] Discovered link: matched ${matched}, upserted ${upserted}`);
        }
      }
    } else {
      console.log('[Virginia Phase2] DPOR RegulantLists page not accessible — DPOR needs investigation');
    }
  }

  // Source 3: VA Open Data portal CSV
  if (!anySourceSucceeded) {
    console.log('[Virginia Phase2] Attempting VA Open Data portal CSV...');
    const csvText = await tryFetch(VA_OPEN_DATA_URL, VA_OPEN_DATA_DOMAIN, 'text/csv,*/*');
    if (csvText && csvText.trim().length > 0) {
      console.log('[Virginia Phase2] VA Open Data CSV accessible');
      const { matched, upserted } = await processVaOpenDataCsv(csvText);
      totalMatched += matched;
      totalUpserted += upserted;
      anySourceSucceeded = true;
      console.log(`[Virginia Phase2] VA Open Data: matched ${matched}, upserted ${upserted}`);
    } else {
      console.log('[Virginia Phase2] VA Open Data portal CSV not accessible (expected — may 404)');
    }
  }

  if (!anySourceSucceeded) {
    console.log(
      '[Virginia Phase2] All Virginia data sources failed to return data. ' +
      'DPOR site may have changed structure. Manual investigation needed: ' +
      DPOR_REGULANT_LIST_PAGE
    );
    return;
  }

  console.log(
    `[Virginia Phase2] Done — matched: ${totalMatched}, upserted: ${totalUpserted}`
  );
}
