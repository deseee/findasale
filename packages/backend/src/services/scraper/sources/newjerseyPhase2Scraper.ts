/**
 * New Jersey Consumer Affairs MyLicense — Secondary Sale Business Scraper (Phase 2)
 * Primary: https://newjersey.mylicense.com/Verification_Bulk/ (bulk CSV/Excel export)
 * Fallback: https://www-dobi.nj.gov/DOBI_LicSearch/ (DOBI pawnbroker HTML search)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * NJ has formal licensing for: AUCTIONEER, PAWNBROKER, SECONDHAND DEALER,
 * JUNK DEALER, CONSIGNMENT — covered by NJ Consumer Affairs MyLicense portal.
 *
 * Strategy:
 *   1. Fetch https://newjersey.mylicense.com/Verification_Bulk/ to find a
 *      CSV/Excel download link for bulk license data.
 *   2. If a CSV download URL is found, download and parse it with keyword filter.
 *   3. If primary fails, fall back to DOBI pawnbroker HTML search.
 *   4. If both fail, log gracefully and return.
 *
 * Both sources may have bot protection — graceful fallback chain is implemented.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const NJ_BULK_URL = 'https://newjersey.mylicense.com/Verification_Bulk/';
const NJ_DOBI_URL = 'https://www-dobi.nj.gov/DOBI_LicSearch/';
const NJ_BULK_DOMAIN = 'newjersey.mylicense.com';
const NJ_DOBI_DOMAIN = 'www-dobi.nj.gov';

// License types that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_TYPES = new Set([
  'AUCTIONEER',
  'PAWNBROKER',
  'SECONDHAND DEALER',
  'JUNK DEALER',
  'CONSIGNMENT',
  'AUCTION',
  'SECONDHAND',
  'PAWN',
]);

// Keywords — used for broader/keyword-only filtering
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
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
];

// False-positive name fragments
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

function licenseTypeMatches(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return Array.from(ALWAYS_INCLUDE_TYPES).some((t) => upper.includes(t));
}

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Strip HTML tags and decode common entities.
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
 * Attempt to parse and ingest a CSV text body from the NJ bulk export.
 * Returns number of records upserted.
 */
async function parseBulkCsv(csvText: string): Promise<number> {
  const lines = csvText.split('\n');
  if (lines.length < 2) return 0;

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, ' ').trim()
  );
  const col = (name: string) => headers.indexOf(name);

  const iName = col('business name') !== -1 ? col('business name')
    : col('licensee name') !== -1 ? col('licensee name')
    : col('name');
  const iType = col('license type') !== -1 ? col('license type')
    : col('license_type') !== -1 ? col('license_type')
    : col('type');
  const iStatus = col('status') !== -1 ? col('status')
    : col('license status');
  const iCity = col('city');
  const iZip = col('zip') !== -1 ? col('zip') : col('zip code');
  const iAddress = col('address') !== -1 ? col('address') : col('address 1');
  const iLicense = col('license number') !== -1 ? col('license number')
    : col('license_number') !== -1 ? col('license_number')
    : col('license no');

  let upserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const status = iStatus >= 0 ? (fields[iStatus] || '').trim().toUpperCase() : '';
      if (status && status !== 'ACTIVE' && status !== 'ISSUED' && status !== 'CURRENT') continue;

      const businessName = iName >= 0 ? (fields[iName] || '').trim() : '';
      if (!businessName) continue;

      const licenseType = iType >= 0 ? (fields[iType] || '').trim() : '';

      const isAlways = licenseTypeMatches(licenseType);
      const isKeyword = !isAlways && nameMatchesKeyword(businessName);

      if (!isAlways && !isKeyword) continue;
      if (nameIsExcluded(businessName)) continue;

      const licenseNumber = iLicense >= 0 ? (fields[iLicense] || '').trim() : '';
      const city = iCity >= 0 ? (fields[iCity] || '').trim() : '';
      const zip = iZip >= 0 ? (fields[iZip] || '').trim() : '';
      const address = iAddress >= 0 ? (fields[iAddress] || '').trim() : '';

      const dedupeKey = `NJ-SECONDARY-${licenseNumber || businessName.toLowerCase().replace(/\s+/g, '-')}`;
      const businessCategory = mapCategory(licenseType);

      const orgId = await getOrCreateScrapedOrganizer(
        businessName,
        'NewJerseyPhase2',
        city || 'New Jersey',
        'NJ',
        undefined,
        undefined,
        undefined,
        undefined,
        businessCategory,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'NJ',
        licenseNumber || undefined
      );

      if (orgId) upserted++;
    } catch (rowErr) {
      console.error(`[NewJerseyPhase2] Error on CSV row ${i}:`, rowErr);
    }
  }

  return upserted;
}

/**
 * Fallback: attempt DOBI pawnbroker HTML search and parse the results table.
 * Returns number of records upserted.
 */
async function scrapeDobiPawnbrokers(): Promise<number> {
  console.log('[NewJerseyPhase2] Attempting DOBI pawnbroker fallback search');
  let upserted = 0;

  try {
    await defaultRateLimiter.waitBeforeRequest(NJ_DOBI_DOMAIN);

    const pageResp = await fetch(NJ_DOBI_URL, {
      method: 'GET',
      headers: { Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(30000),
    });

    if (!pageResp.ok) {
      console.warn(`[NewJerseyPhase2] DOBI page fetch failed: ${pageResp.status}`);
      return 0;
    }

    const pageHtml = await pageResp.text();

    if (
      pageHtml.includes('captcha') ||
      pageHtml.includes('CAPTCHA') ||
      pageHtml.includes('Cloudflare') ||
      pageHtml.length < 200
    ) {
      console.warn('[NewJerseyPhase2] DOBI page appears bot-protected or empty');
      return 0;
    }

    const viewstateMatch = pageHtml.match(/name="__VIEWSTATE"\s+value="([^"]*)"/);
    const viewstate = viewstateMatch ? viewstateMatch[1] : '';
    const eventMatch = pageHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]*)"/);
    const eventValidation = eventMatch ? eventMatch[1] : '';

    await defaultRateLimiter.waitBeforeRequest(NJ_DOBI_DOMAIN);

    const formBody = new URLSearchParams({
      __VIEWSTATE: viewstate,
      __EVENTVALIDATION: eventValidation,
      LicenseType: 'Pawnbroker',
      btnSearch: 'Search',
    });

    const searchResp = await fetch(NJ_DOBI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,*/*',
        Referer: NJ_DOBI_URL,
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResp.ok) {
      console.warn(`[NewJerseyPhase2] DOBI search POST failed: ${searchResp.status}`);
      return 0;
    }

    const resultsHtml = await searchResp.text();

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(resultsHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      if (cells.length < 2) continue;

      const businessName = cells.find((c) => c && c.length > 2 && !/^\d+$/.test(c)) || '';
      if (!businessName || nameIsExcluded(businessName)) continue;

      const city = cells.length > 3 ? cells[3] : 'New Jersey';

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          businessName,
          'NewJerseyPhase2',
          city || 'New Jersey',
          'NJ',
          undefined,
          undefined,
          undefined,
          undefined,
          'RESALE_SHOP',
          undefined,
          undefined,
          undefined
        );
        if (orgId) upserted++;
      } catch (err) {
        console.error('[NewJerseyPhase2] DOBI row error:', err);
      }
    }

    console.log(`[NewJerseyPhase2] DOBI fallback upserted: ${upserted}`);
  } catch (err) {
    console.warn('[NewJerseyPhase2] DOBI fallback failed:', err);
  }

  return upserted;
}

/**
 * New Jersey secondary sale scraper.
 * Attempts MyLicense bulk export -> DOBI pawnbroker search -> graceful exit.
 */
export async function runNewJerseyPhase2Scraper(): Promise<void> {
  let totalUpserted = 0;

  console.log('[NewJerseyPhase2] Starting secondary sale scraper');
  console.log(`[NewJerseyPhase2] Primary: ${NJ_BULK_URL}`);

  try {
    let primarySucceeded = false;

    try {
      console.log(`[NewJerseyPhase2] Fetching bulk page: ${NJ_BULK_URL}`);
      await defaultRateLimiter.waitBeforeRequest(NJ_BULK_DOMAIN);

      const bulkPageResp = await fetch(NJ_BULK_URL, {
        method: 'GET',
        headers: { Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(30000),
      });

      if (bulkPageResp.ok) {
        const bulkHtml = await bulkPageResp.text();

        if (
          !bulkHtml.includes('captcha') &&
          !bulkHtml.includes('CAPTCHA') &&
          !bulkHtml.includes('Cloudflare') &&
          bulkHtml.length > 200
        ) {
          const csvLinkMatch = bulkHtml.match(/href="([^"]*\.(csv|xlsx|xls)[^"]*)"/i);

          if (csvLinkMatch) {
            const csvUrl = csvLinkMatch[1].startsWith('http')
              ? csvLinkMatch[1]
              : `https://${NJ_BULK_DOMAIN}${csvLinkMatch[1]}`;

            console.log(`[NewJerseyPhase2] Found bulk download link: ${csvUrl}`);
            await defaultRateLimiter.waitBeforeRequest(NJ_BULK_DOMAIN);

            const csvResp = await fetch(csvUrl, {
              method: 'GET',
              headers: { Accept: 'text/csv,application/vnd.ms-excel,*/*' },
              signal: AbortSignal.timeout(120000),
            });

            if (csvResp.ok) {
              const csvText = await csvResp.text();
              if (csvText.trim().length > 0) {
                console.log('[NewJerseyPhase2] Bulk CSV downloaded — parsing');
                totalUpserted += await parseBulkCsv(csvText);
                primarySucceeded = true;
              }
            } else {
              console.warn(`[NewJerseyPhase2] CSV download failed: ${csvResp.status}`);
            }
          } else {
            console.warn('[NewJerseyPhase2] No CSV/Excel download link found on bulk page');
          }
        } else {
          console.warn('[NewJerseyPhase2] MyLicense bulk page appears bot-protected');
        }
      } else {
        console.warn(`[NewJerseyPhase2] MyLicense bulk page HTTP ${bulkPageResp.status}`);
      }
    } catch (primaryErr) {
      console.warn('[NewJerseyPhase2] Primary source failed:', primaryErr);
    }

    if (!primarySucceeded) {
      console.log('[NewJerseyPhase2] Primary failed — trying DOBI fallback');
      totalUpserted += await scrapeDobiPawnbrokers();
    }

    if (totalUpserted === 0) {
      console.warn(
        '[NewJerseyPhase2] Both sources returned 0 records. ' +
        'NJ MyLicense and DOBI may require JS rendering or are bot-protected. ' +
        'TODO: Request bulk license file from NJ Consumer Affairs or implement Playwright headless browser.'
      );
    }

    console.log(`[NewJerseyPhase2] Done — total upserted: ${totalUpserted}`);
  } catch (error) {
    console.error('[NewJerseyPhase2] Scraper fatal error:', error);
    throw error;
  }
}
