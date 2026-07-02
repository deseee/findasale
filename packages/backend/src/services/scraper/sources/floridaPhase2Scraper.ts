/**
 * Florida Secondary Sale Business Scraper (Phase 2)
 *
 * Source 1 — DBPR Board 48 Auctioneer Licenses (unchanged)
 *   https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv
 *   Static CSV, no header row, positional columns.
 *
 * Source 2 — FDACS Pawnshop Licenses (PN)
 *   https://csapp.fdacs.gov/CSPublicApp/BusinessSearch/BusinessSearch.aspx
 *   Florida Chapter 538 (Pawnbroking) designates FDACS as the licensing agency.
 *   Data is served via a stateful ASP.NET form (3-step: GET → POST search → POST ALL).
 *   Returns ~1,130 active pawnshops statewide.
 *
 * Note on secondhand dealers (FL Chapter 539):
 *   Secondhand dealer licensing is administered at the county/municipality level
 *   (sheriff or police chief per FS 538.03). There is no statewide downloadable
 *   registry. FDACS does not list a secondhand dealer license type. Skipped.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line, handling quoted fields with embedded commas.
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

// ---------------------------------------------------------------------------
// SOURCE 1: DBPR Board 48 Auctioneers
// ---------------------------------------------------------------------------

const DBPR_CSV_URL =
  'https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv';
const DBPR_CSV_DOMAIN = 'www2.myfloridalicense.com';

// Positional column indices (CSV has no header row)
const DBPR_COL = {
  LICENSE_TYPE:   1,
  LICENSEE_NAME:  2,
  CITY:           8,
  STATE:          9,
  STATUS_CODE:    13,  // "C" = Current/Active
  SUB_STATUS:     14,  // "A" = Active
  LICENSE_NUMBER: 20,
} as const;

const SALE_TYPE_KEYWORDS = [
  'auction', 'estate sale', 'estate auction', 'consign', 'thrift', 'resale',
  'antique', 'vintage', 'collectible', 'flea market', 'swap meet', 'liquidat',
  'salvage', 'junk dealer', 'used goods', 'secondhand', 'second hand',
  'pre-owned', 'preowned', 'surplus', 'rummage', 'pawn',
];

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'restaurant', 'petroleum', 'dental',
  'medical', 'pharmacy', 'funeral', 'insurance', 'tax service', 'accounting',
  'attorney', 'law office', 'landscaping', 'construction', 'plumbing',
  'electrical', 'roofing', 'automotive repair', 'car wash', 'dry clean',
  'laundry', 'hair salon', 'nail salon', 'tattoo', 'massage', 'yoga', 'daycare',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

async function fetchDbprCsv(): Promise<string | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(DBPR_CSV_DOMAIN);
    const response = await fetch(DBPR_CSV_URL, {
      method: 'GET',
      headers: { Accept: 'text/csv,text/plain,*/*' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      console.warn(`[Florida Phase2] DBPR CSV HTTP ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.warn('[Florida Phase2] DBPR CSV fetch failed:', err);
    return null;
  }
}

/**
 * Florida DBPR Board 48 Auctioneer license scraper.
 * Unchanged from original implementation.
 */
async function runFloridaAuctioneerSource(): Promise<void> {
  console.log('[Florida Phase2] Starting DBPR Board 48 Auctioneer source');
  console.log(`[Florida Phase2] Source: ${DBPR_CSV_URL}`);

  const csvText = await fetchDbprCsv();
  if (!csvText) {
    console.error('[Florida Phase2] Failed to download DBPR CSV — skipping auctioneer source');
    return;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.error('[Florida Phase2] DBPR CSV is empty — skipping');
    return;
  }

  console.log(`[Florida Phase2] DBPR total rows: ${lines.length}`);

  let totalProcessed = 0;
  let totalActive = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  const batchRows: ScrapedOrganizerRow[] = [];

  for (const line of lines) {
    const fields = parseCsvLine(line);
    if (fields.length < 15) continue;

    totalProcessed++;

    const licenseType   = (fields[DBPR_COL.LICENSE_TYPE]   ?? '').trim().toUpperCase();
    const statusCode    = (fields[DBPR_COL.STATUS_CODE]     ?? '').trim().toUpperCase();
    const subStatus     = (fields[DBPR_COL.SUB_STATUS]      ?? '').trim().toUpperCase();
    const name          = (fields[DBPR_COL.LICENSEE_NAME]   ?? '').trim();
    const city          = (fields[DBPR_COL.CITY]            ?? '').trim() || 'Florida';
    const licenseNumber = (fields[DBPR_COL.LICENSE_NUMBER]  ?? '').trim();

    if (licenseType === 'OR') continue;
    if (statusCode !== 'C' || subStatus !== 'A') continue;
    totalActive++;
    if (!name) continue;

    if (licenseType === 'AB') {
      if (nameIsExcluded(name)) continue;
    } else if (licenseType === 'AU' || licenseType === 'AE') {
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    } else {
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    }

    totalMatched++;

    const slugifiedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    const dedupeKey = `FL-SECONDARY-${licenseNumber || slugifiedName}`;
    const category = mapCategory(name);

    console.log(`[Florida Phase2] DBPR matched: ${dedupeKey} — ${name} (${licenseType})`);

    batchRows.push({
      businessName: name,
      sourceName: 'FloridaPhase2',
      city,
      state: 'FL',
      businessCategory: category,
      isStateLicensed: true,
      licenseState: 'FL',
      licenseNumber: licenseNumber || undefined,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  totalUpserted = ids.filter((id) => id !== null).length;

  console.log('[Florida Phase2] DBPR Board 48 summary ─────────────────────');
  console.log(`[Florida Phase2]  Rows processed : ${totalProcessed}`);
  console.log(`[Florida Phase2]  Active licenses: ${totalActive}`);
  console.log(`[Florida Phase2]  Keyword matched: ${totalMatched}`);
  console.log(`[Florida Phase2]  Upserted       : ${totalUpserted}`);
  console.log('[Florida Phase2] ─────────────────────────────────────────────');
}

// ---------------------------------------------------------------------------
// SOURCE 2: FDACS Pawnshop Licenses
// ---------------------------------------------------------------------------

const FDACS_DOMAIN = 'csapp.fdacs.gov';
const FDACS_SEARCH_URL =
  'https://csapp.fdacs.gov/CSPublicApp/BusinessSearch/BusinessSearch.aspx';

/**
 * Parse the ASP.NET hidden field value from an HTML page.
 */
function extractHiddenField(html: string, fieldId: string): string {
  const match = html.match(
    new RegExp(`id="${fieldId}"\\s+value="([^"]*)"`, 's'),
  );
  return match ? match[1] : '';
}

/**
 * Parse the __VIEWSTATE from a page that may have it split across multiple
 * chunks (ASP.NET ScriptManager compression).
 * Falls back to a direct id= match.
 */
function extractViewState(html: string): string {
  return extractHiddenField(html, '__VIEWSTATE');
}

/**
 * Build a URL-encoded form body for the FDACS BusinessSearch.
 */
function buildFdacsFormBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

interface FdacsPawnshop {
  name: string;
  city: string;
  phone: string;
  licenseNumber: string;
}

/**
 * Parse all pawnshop records from the FDACS "display ALL" HTML page.
 *
 * Structure per record (cpMainContent_MasterGv_dataTab_N):
 *   <strong>BUSINESS NAME</strong>
 *   <td>STREET, CITY, FL ZIP<br/><b>Phone:</b> XXX ...</td>
 *
 * PN license# is in the adjacent license subtable:
 *   <td>Pawnshop</td><td>PN####</td>
 */
function parseFdacsPawnshops(html: string): FdacsPawnshop[] {
  const results: FdacsPawnshop[] = [];

  // Each record starts at cpMainContent_MasterGv_dataTab_N
  // We'll split by the dataTab id pattern and process each block
  const blocks = html.split(/id="cpMainContent_MasterGv_dataTab_\d+"/);

  // blocks[0] is pre-first-record; blocks[1..N] each start with the record content
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Business name: in <strong> tag
    const nameMatch = block.match(/<strong>\s*([\s\S]*?)\s*<\/strong>/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/\s+/g, ' ').trim();
    if (!name) continue;

    // Address/phone td (second <td> in the inner table)
    const tds = block.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
    let city = '';
    let phone = '';
    if (tds.length >= 2) {
      const addrRaw = tds[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const phoneMatch = addrRaw.match(/Phone:\s*([\d\-\(\) ]+)/i);
      phone = phoneMatch ? phoneMatch[1].trim() : '';

      const cityMatch = addrRaw.match(/,\s*([A-Z][A-Z\s]+),\s*FL\s+\d{5}/);
      city = cityMatch ? cityMatch[1].trim() : '';
    }

    // PN license number: look in the block up to the next dataTab boundary
    const pnMatch = block.match(/>Pawnshop<\/td>\s*<td[^>]*>(PN\d+)<\/td>/i);
    const licenseNumber = pnMatch ? pnMatch[1] : '';

    results.push({ name, city, phone, licenseNumber });
  }

  return results;
}

/**
 * Fetch the FDACS BusinessSearch page (GET) to obtain a session cookie
 * and the initial ASP.NET form state.
 */
async function fetchFdacsInitialPage(): Promise<{
  html: string;
  cookies: string;
} | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(FDACS_DOMAIN);
    const response = await fetch(FDACS_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FindASale-Scraper/1.0; +https://finda.sale)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn(`[Florida Phase2] FDACS GET HTTP ${response.status}`);
      return null;
    }
    const html = await response.text();
    // Capture Set-Cookie headers (Node fetch gives a Headers object)
    const cookies = response.headers.get('set-cookie') ?? '';
    return { html, cookies };
  } catch (err) {
    console.warn('[Florida Phase2] FDACS initial GET failed:', err);
    return null;
  }
}

/**
 * POST to the FDACS BusinessSearch with session cookie.
 * Returns the response HTML.
 */
async function postFdacsForm(
  body: string,
  cookies: string,
): Promise<{ html: string; cookies: string } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(FDACS_DOMAIN);
    const response = await fetch(FDACS_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (compatible; FindASale-Scraper/1.0; +https://finda.sale)',
        Accept: 'text/html,application/xhtml+xml',
        Referer: FDACS_SEARCH_URL,
        Cookie: cookies,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      console.warn(`[Florida Phase2] FDACS POST HTTP ${response.status}`);
      return null;
    }
    const html = await response.text();
    const newCookies = response.headers.get('set-cookie') ?? cookies;
    return { html, cookies: newCookies };
  } catch (err) {
    console.warn('[Florida Phase2] FDACS POST failed:', err);
    return null;
  }
}

/**
 * Florida FDACS Pawnshop license scraper.
 *
 * Uses a 3-step ASP.NET session flow:
 *   Step 1 — GET page to acquire session cookie + initial viewstate
 *   Step 2 — POST search (LicenseType=PN, Active=on) → paginated results
 *   Step 3 — POST with PagesizeDl=ALL to retrieve all ~1,130 records at once
 *
 * Pawnshops are relevant as secondary sale venues (they resell unredeemed
 * pledged goods) and are state-licensed under FL Chapter 538 via FDACS.
 *
 * Note: Secondhand dealers (FL Chapter 539) are locally licensed by each
 * county/municipality — no statewide downloadable registry exists.
 */
async function runFloridaPawnbrokerSource(): Promise<void> {
  console.log('[Florida Phase2] Starting FDACS Pawnshop source');
  console.log(`[Florida Phase2] Source: ${FDACS_SEARCH_URL}`);

  // Step 1 — GET initial page
  const initial = await fetchFdacsInitialPage();
  if (!initial) {
    console.error('[Florida Phase2] FDACS initial GET failed — skipping pawnshop source');
    return;
  }

  const viewstate1    = extractViewState(initial.html);
  const viewstateGen  = extractHiddenField(initial.html, '__VIEWSTATEGENERATOR');
  const eventVal1     = extractHiddenField(initial.html, '__EVENTVALIDATION');

  if (!viewstate1) {
    console.error('[Florida Phase2] FDACS: could not extract __VIEWSTATE — skipping');
    return;
  }

  // Step 2 — POST search for PN (Pawnshop), active only, all counties
  const searchBody = buildFdacsFormBody({
    __EVENTTARGET:   '',
    __EVENTARGUMENT: '',
    __VIEWSTATE:               viewstate1,
    __VIEWSTATEGENERATOR:      viewstateGen,
    __EVENTVALIDATION:         eventVal1,
    'ctl00$cpMainContent$BusinessNameTb': '',
    'ctl00$cpMainContent$LicenseTb':      '',
    'ctl00$cpMainContent$txtPhone':        '',
    'ctl00$cpMainContent$txtCity':         '',
    'ctl00$cpMainContent$CountyDl':        ' X',
    'ctl00$cpMainContent$LicenseTypeDl':   'PN',
    'ctl00$cpMainContent$chkActive':       'on',
    'ctl00$cpMainContent$SingleSearchBt':  'Search',
  });

  const searchResult = await postFdacsForm(searchBody, initial.cookies);
  if (!searchResult) {
    console.error('[Florida Phase2] FDACS search POST failed — skipping pawnshop source');
    return;
  }

  // Confirm we got results
  const countMatch = searchResult.html.match(/Records Found\s*:\s*(\d+)/i);
  const recordCount = countMatch ? parseInt(countMatch[1], 10) : 0;
  console.log(`[Florida Phase2] FDACS search returned ${recordCount} records`);

  if (recordCount === 0) {
    console.warn('[Florida Phase2] FDACS: 0 records returned — skipping');
    return;
  }

  // Step 3 — Re-POST with PagesizeDl=ALL to get all records on one page
  const viewstate2 = extractViewState(searchResult.html);
  const viewstateGen2 = extractHiddenField(searchResult.html, '__VIEWSTATEGENERATOR');
  const eventVal2  = extractHiddenField(searchResult.html, '__EVENTVALIDATION');

  const allBody = buildFdacsFormBody({
    __EVENTTARGET:   'ctl00$cpMainContent$PagesizeDl',
    __EVENTARGUMENT: '',
    __VIEWSTATE:               viewstate2,
    __VIEWSTATEGENERATOR:      viewstateGen2,
    __EVENTVALIDATION:         eventVal2,
    'ctl00$cpMainContent$BusinessNameTb': '',
    'ctl00$cpMainContent$LicenseTb':      '',
    'ctl00$cpMainContent$txtPhone':        '',
    'ctl00$cpMainContent$txtCity':         '',
    'ctl00$cpMainContent$CountyDl':        ' X',
    'ctl00$cpMainContent$LicenseTypeDl':   'PN',
    'ctl00$cpMainContent$chkActive':       'on',
    'ctl00$cpMainContent$SortDl':          'NAME_1',
    'ctl00$cpMainContent$FilterDl':        '00',
    'ctl00$cpMainContent$PagesizeDl':      'ALL',
  });

  const allResult = await postFdacsForm(allBody, searchResult.cookies);
  if (!allResult) {
    console.error('[Florida Phase2] FDACS ALL-records POST failed — skipping pawnshop source');
    return;
  }

  console.log(`[Florida Phase2] FDACS full-page HTML size: ${allResult.html.length} bytes`);

  // Parse all records from the HTML
  const pawnshops = parseFdacsPawnshops(allResult.html);
  console.log(`[Florida Phase2] FDACS parsed ${pawnshops.length} pawnshop records`);

  if (pawnshops.length === 0) {
    console.warn('[Florida Phase2] FDACS: parsed 0 records — HTML structure may have changed');
    return;
  }

  let totalUpserted = 0;
  const fdacsRows: ScrapedOrganizerRow[] = [];

  for (const shop of pawnshops) {
    const dedupeKey = shop.licenseNumber
      ? `FL-PAWNSHOP-${shop.licenseNumber}`
      : `FL-PAWNSHOP-${shop.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}`;

    console.log(`[Florida Phase2] Pawnshop: ${dedupeKey} — ${shop.name} (${shop.city})`);

    fdacsRows.push({
      businessName: shop.name,
      sourceName: 'FloridaPhase2',
      city: shop.city || 'Florida',
      state: 'FL',
      businessCategory: 'RESALE_SHOP',
      phone: shop.phone || undefined,
      isStateLicensed: true,
      licenseState: 'FL',
      licenseNumber: shop.licenseNumber || undefined,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const fdacsIds = await batchUpsertScrapedOrganizers(fdacsRows, 100);
  totalUpserted = fdacsIds.filter((id) => id !== null).length;

  console.log('[Florida Phase2] FDACS Pawnshop summary ────────────────────');
  console.log(`[Florida Phase2]  Records found  : ${recordCount}`);
  console.log(`[Florida Phase2]  Records parsed : ${pawnshops.length}`);
  console.log(`[Florida Phase2]  Upserted       : ${totalUpserted}`);
  console.log('[Florida Phase2] ─────────────────────────────────────────────');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Florida Phase 2 secondary sale scraper — runs both sources sequentially:
 *   1. DBPR Board 48 Auctioneers (static CSV)
 *   2. FDACS Pawnshop licenses (ASP.NET form, ~1,130 active records)
 *
 * Secondhand dealers (FL Chapter 539) are locally licensed per county/municipality
 * and have no statewide downloadable registry — not included.
 */
export async function runFloridaPhase2Scraper(): Promise<void> {
  console.log('[Florida Phase2] ═══ Florida Phase 2 scraper starting ═══════');
  await runFloridaAuctioneerSource();
  await runFloridaPawnbrokerSource();
  console.log('[Florida Phase2] ═══ Florida Phase 2 scraper complete ═══════');
}
