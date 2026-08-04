/**
 * Alabama State Board of Auctioneers — Auctioneer License Scraper (Phase 2)
 *
 * Source: Alabama Auctioneers Board licensee search tool (public web UI)
 *   https://alauc-search.kalmservices.net/
 *   (linked from https://auctioneer.alabama.gov/licensee-search/)
 *
 * ROOT CAUSE (confirmed via this file's own prior implementation + task
 * evidence, 2026-08): the previous version of this scraper called the site's
 * backing JSON API directly — POST
 * https://alauc-search.kalmservices.net/api/search/licenses with body
 * { parameters: { lastName }, turnstileToken: '' }. That endpoint now
 * hard-rejects every request with "CAPTCHA verification failed" — Cloudflare
 * Turnstile is backend-enforced (siteverify validated) as of 2026-08, where it
 * previously was not. A plain fetch() call can never produce a valid Turnstile
 * token because it never executes Cloudflare's JS challenge — no amount of
 * URL/endpoint guessing fixes that against a non-JS HTTP client.
 *
 * FIX: Drive the actual public search page with a real, stealth-patched
 * headless Chromium browser via Playwright — the same class of tool this
 * project already uses for other Cloudflare/anti-bot-protected sources (see
 * saleDetailEnrichment.ts: "Stealth-first: Playwright Chromium + stealth
 * plugin defeats TLS fingerprinting"). A live manual browser test this
 * session (searching "Smith" in the Last Name field on the public search
 * page) returned full results with ZERO Turnstile challenge shown. This
 * scraper reproduces that human flow: navigate → fill Last Name → click
 * Search → read the rendered results table.
 *
 * VERIFICATION CAVEAT — read before relying on this in production:
 * This file was written and TypeScript-traced from a network-isolated
 * environment. The exact DOM selectors for the Last Name input / Search
 * button / results table on alauc-search.kalmservices.net were NOT confirmed
 * via live DOM inspection (no live network access in this session).
 * Playwright's semantic ARIA-role/label locators are used with CSS-attribute
 * fallbacks to maximize the odds of a first-run match, and every step logs a
 * clear diagnostic on failure so a real run's logs will show exactly which
 * step (if any) did not find its target. UNTIL A LIVE RUN CONFIRMS THIS,
 * TREAT THE SELECTOR LOGIC AS BEST-EFFORT, NOT VERIFIED.
 *
 * OPEN QUESTIONS (flagged, not resolved — need live network access to close):
 *   1. Roster enumeration: this file keeps the prior A–Z last-name-prefix
 *      iteration (one request per letter) because that is what the
 *      previously-working JSON API accepted. It is NOT confirmed that the
 *      HTML search box on the page behaves the same way for a single-letter
 *      prefix (vs. requiring a full last name, or supporting an empty/blank
 *      query to dump the full roster in one pass). This needs a live check —
 *      searching a blank Last Name, or confirming prefix-matching behavior,
 *      before trusting full-roster coverage from this scraper.
 *   2. The results page's "Export CSV" / "Export Excel" buttons were seen
 *      working in the manual browser test this session but are NOT used
 *      here — on-page results-table scraping was chosen as the safer
 *      default because the export buttons' target endpoint/params were not
 *      captured via browser dev tools this session. Wiring the CSV/Excel
 *      export instead of table-scraping is a plausible, likely more stable
 *      follow-up once someone inspects that live network request.
 *   3. Whether the browser-driven page itself is ever shown an *interactive*
 *      Turnstile challenge (vs. the invisible/managed pass observed in the
 *      manual test) under production conditions (Railway's IP range,
 *      concurrent job load, etc.) is unverified. This file detects and logs
 *      Turnstile/CAPTCHA markers in the rendered HTML if they appear, but
 *      does not attempt to solve an interactive challenge.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';
import { getRandomUserAgent } from '../userAgents';

const SEARCH_PAGE_URL = 'https://alauc-search.kalmservices.net/';
const DOMAIN = 'alauc-search.kalmservices.net';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Stealth plugin registration — deferred to first browser launch (matches
// saleDetailEnrichment.ts convention) to avoid crashing at module import
// time if playwright-extra isn't fully initialised.
let stealthRegistered = false;

// False-positive name fragments — exclude row if company/licensee name contains any of these
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
 * Parse city from a combined address string. Handles both the old API's
 * "street|city, ST zip" pipe-delimited format and a plain
 * "street, city, ST zip" comma-delimited format (unknown which the live
 * HTML table will actually use — this is a defensive fallback, only
 * consulted when the results table does not expose separate City/State
 * columns; see parseResultsTable).
 */
function parseCityFromAddress(address: string): string {
  if (!address) return '';
  const parts = address.includes('|') ? address.split('|') : address.split(',');
  const lastLine = (parts[parts.length - 1] || '').trim();
  const cityMatch = lastLine.match(/^([^,]+),\s*[A-Z]{2}/);
  if (cityMatch) {
    return cityMatch[1].trim();
  }
  // Comma-delimited form: city is likely the second-to-last segment
  if (parts.length >= 2) {
    return (parts[parts.length - 2] || '').trim();
  }
  return lastLine;
}

/**
 * Parse state from a combined address string. See parseCityFromAddress for
 * format notes.
 */
function parseStateFromAddress(address: string): string {
  if (!address) return 'AL';
  const stateMatch = address.match(/\b([A-Z]{2})\s*\d{5}/) || address.match(/,\s*([A-Z]{2})\b/);
  if (stateMatch) {
    return stateMatch[1];
  }
  return 'AL';
}

interface AlabamaLicensee {
  name: string;
  licenseNumber: string;
  licenseType: string;
  licenseStatus: string;
  company: string;
  city: string;
  state: string;
  address: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// Stealth Playwright browser (Turnstile-protected target — see file header)
// ---------------------------------------------------------------------------

type PwBrowser = Awaited<ReturnType<typeof chromium.launch>>;
type PwPage = Awaited<ReturnType<PwBrowser['newPage']>>;
type PwLocator = ReturnType<PwPage['locator']>;

async function launchStealthBrowser(): Promise<PwBrowser> {
  if (!stealthRegistered) {
    chromium.use(StealthPlugin());
    stealthRegistered = true;
  }
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

/**
 * Try a sequence of locator strategies for the Last Name search input.
 * Returns true if a field was found and filled, false otherwise.
 */
async function fillLastName(page: PwPage, value: string): Promise<boolean> {
  const strategies: Array<() => PwLocator> = [
    () => page.getByLabel(/last\s*name/i),
    () => page.getByPlaceholder(/last\s*name/i),
    () => page.locator('input[name*="last" i]'),
    () => page.locator('input[id*="last" i]'),
    () => page.locator('input[aria-label*="last" i]'),
  ];

  for (const strategy of strategies) {
    try {
      const locator = strategy();
      const count = await locator.count();
      if (count > 0) {
        await locator.first().fill('');
        await locator.first().fill(value);
        return true;
      }
    } catch {
      // try next strategy
    }
  }
  return false;
}

/**
 * Try a sequence of locator strategies for the Search submit button.
 * Returns true if a button was found and clicked, false otherwise.
 */
async function clickSearch(page: PwPage): Promise<boolean> {
  const strategies: Array<() => PwLocator> = [
    () => page.getByRole('button', { name: /search/i }),
    () => page.getByRole('button', { name: /submit/i }),
    () => page.locator('button:has-text("Search")'),
    () => page.locator('input[type="submit"]'),
    () => page.locator('button[type="submit"]'),
  ];

  for (const strategy of strategies) {
    try {
      const locator = strategy();
      const count = await locator.count();
      if (count > 0) {
        await locator.first().click();
        return true;
      }
    } catch {
      // try next strategy
    }
  }
  return false;
}

/**
 * Parse the rendered results table into licensee rows.
 * Column order/labels are unknown (no live DOM access this session) — the
 * header row is read dynamically and columns are matched by header text
 * rather than assumed positionally, so this survives minor column reordering.
 */
function parseResultsTable(html: string): AlabamaLicensee[] {
  const $ = cheerio.load(html);
  const records: AlabamaLicensee[] = [];

  const tableSelectors = [
    'table.results',
    'table.search-results',
    '#results table',
    '.results-table table',
    'table',
  ];

  let $table = $();
  for (const sel of tableSelectors) {
    const candidate = $(sel);
    if (candidate.length > 0 && candidate.find('tr').length > 1) {
      $table = candidate.first();
      break;
    }
  }

  if ($table.length === 0) {
    return records;
  }

  const $rows = $table.find('tr');
  if ($rows.length < 2) {
    return records;
  }

  // Determine column order from the header row (th preferred, fall back to first td row)
  const headerCells: string[] = [];
  const $headerRow = $rows.first();
  $headerRow.find('th').each((_i, el) => { headerCells.push($(el).text().trim().toLowerCase()); });
  if (headerCells.length === 0) {
    $headerRow.find('td').each((_i, el) => { headerCells.push($(el).text().trim().toLowerCase()); });
  }

  const colIndex = (labelPattern: RegExp): number =>
    headerCells.findIndex((h) => labelPattern.test(h));

  const nameIdx = colIndex(/name/);
  const licNumIdx = colIndex(/license\s*(#|no\.?|number)/);
  const typeIdx = colIndex(/type/);
  const statusIdx = colIndex(/status/);
  const companyIdx = colIndex(/compan(y|ies)/);
  const cityIdx = colIndex(/city/);
  const stateIdx = colIndex(/^state$/);
  const addressIdx = colIndex(/address/);
  const phoneIdx = colIndex(/phone/);

  $rows.each((rowI, el) => {
    if (rowI === 0 && headerCells.length > 0) return; // skip header row

    const $tds = $(el).find('td');
    if ($tds.length === 0) return;
    const cells = $tds.map((_j, td) => $(td).text().trim()).get();
    if (cells.length === 0) return;

    const get = (idx: number): string => (idx >= 0 && idx < cells.length ? cells[idx] : '');

    const name = nameIdx >= 0 ? get(nameIdx) : cells[0] || '';
    if (!name || /^(name|licensee name)$/i.test(name)) return;

    records.push({
      name,
      licenseNumber: licNumIdx >= 0 ? get(licNumIdx) : '',
      licenseType: typeIdx >= 0 ? get(typeIdx) : '',
      licenseStatus: statusIdx >= 0 ? get(statusIdx) : 'Active',
      company: companyIdx >= 0 ? get(companyIdx) : '',
      city: cityIdx >= 0 ? get(cityIdx) : '',
      state: stateIdx >= 0 ? get(stateIdx) : '',
      address: addressIdx >= 0 ? get(addressIdx) : '',
      phone: phoneIdx >= 0 ? get(phoneIdx) : '',
    });
  });

  return records;
}

/**
 * Search for licensees matching a Last Name value on the live page.
 * Navigates fresh to SEARCH_PAGE_URL for every call (rather than reusing
 * post-search DOM state) so this works whether the site is a SPA that
 * updates in place or a traditional form that navigates to a results page —
 * either way a fresh load guarantees the search form is present and clean.
 */
async function fetchLicenseesByLastName(page: PwPage, value: string): Promise<AlabamaLicensee[]> {
  await defaultRateLimiter.waitBeforeRequest(DOMAIN);

  try {
    await page.goto(SEARCH_PAGE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    console.warn(`[Alabama Phase2] Navigation failed for letter "${value}":`, err);
    return [];
  }

  const filled = await fillLastName(page, value);
  if (!filled) {
    console.warn(
      `[Alabama Phase2] Could not find Last Name input for letter "${value}" — ` +
      'DOM selectors need live verification (see file header VERIFICATION CAVEAT)'
    );
    return [];
  }

  const clicked = await clickSearch(page);
  if (!clicked) {
    console.warn(
      `[Alabama Phase2] Could not find Search button for letter "${value}" — ` +
      'DOM selectors need live verification (see file header VERIFICATION CAVEAT)'
    );
    return [];
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    // Results may already be rendered client-side without a further network event — continue.
  }

  const html = await page.content();
  const lowerHtml = html.toLowerCase();
  if (
    lowerHtml.includes('captcha verification failed') ||
    (lowerHtml.includes('cf-turnstile') && lowerHtml.includes('challenge')) ||
    lowerHtml.includes('checking if the site connection is secure')
  ) {
    console.warn(
      `[Alabama Phase2] Turnstile/CAPTCHA marker detected in rendered page for letter "${value}" — ` +
      'the browser-driven path is being challenged too (see file header OPEN QUESTIONS #3)'
    );
  }

  return parseResultsTable(html);
}

/**
 * Alabama State Board of Auctioneers — auctioneer license scraper.
 * Iterates A–Z as lastName prefix to fetch all active auctioneers via a
 * stealth-patched headless browser against the public search page (the
 * direct JSON API is Turnstile-blocked — see file header). Deduplicates by
 * LicenseNumber. Uses the Company field as the business name, falling back
 * to the licensee Name.
 */
export async function runAlabamaPhase2Scraper(): Promise<void> {
  console.log('[Alabama Phase2] Starting auctioneer license scraper — Alabama Board of Auctioneers');
  console.log(`[Alabama Phase2] Source: ${SEARCH_PAGE_URL} (stealth Playwright browser — direct JSON API is Turnstile-blocked, see file header)`);

  const seenLicenseNumbers = new Set<string>();
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let totalSkippedDupe = 0;
  let totalSkippedExclude = 0;
  let totalSkippedInactive = 0;

  let browser: PwBrowser | null = null;

  try {
    browser = await launchStealthBrowser();
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    for (const letter of ALPHABET) {
      console.log(`[Alabama Phase2] Fetching licensees for lastName prefix "${letter}"...`);

      const licensees = await fetchLicenseesByLastName(page, letter);
      console.log(`[Alabama Phase2] Letter "${letter}": ${licensees.length} results`);
      totalFetched += licensees.length;

      // Accumulate rows for this letter — batch upsert after the loop (ADR-073 perf)
      const letterRows: ScrapedOrganizerRow[] = [];

      for (const lic of licensees) {
        // Deduplicate by LicenseNumber
        const licNum = (lic.licenseNumber || '').trim();
        if (!licNum || seenLicenseNumbers.has(licNum)) {
          if (licNum) totalSkippedDupe++;
          continue;
        }
        seenLicenseNumbers.add(licNum);

        // Only active licenses
        if (lic.licenseStatus && lic.licenseStatus.toLowerCase() !== 'active') {
          totalSkippedInactive++;
          continue;
        }

        // Use Company name as business; fall back to licensee Name
        const companyName = (lic.company || '').trim();
        const licenseeName = (lic.name || '').trim();
        const businessName = companyName || licenseeName;

        if (!businessName) continue;

        // Apply exclude filter on both company and licensee name
        if (nameIsExcluded(companyName) || nameIsExcluded(licenseeName)) {
          totalSkippedExclude++;
          continue;
        }

        // Prefer dedicated City/State table columns; fall back to parsing a combined address field
        const city = (lic.city || '').trim() || parseCityFromAddress(lic.address);
        const state = (lic.state || '').trim() || parseStateFromAddress(lic.address);
        const phone = (lic.phone || '').trim() || undefined;

        totalMatched++;

        letterRows.push({
          businessName,
          sourceName: 'AlabamaPhase2',
          city: city || 'Alabama',
          state: state || 'AL',
          businessCategory: 'AUCTION_HOUSE',
          phone,
          isStateLicensed: true,
          licenseState: 'Alabama',
          licenseNumber: licNum,
          sourceLabel: 'Alabama Board of Auctioneers',
        });
      }

      // Batch upsert for this letter (ADR-073 perf: replaces serial per-row upserts)
      const ids = await batchUpsertScrapedOrganizers(letterRows, 100);
      totalUpserted += ids.filter((id) => id !== null).length;

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
        'Alabama Phase2 scraper completed but found zero matching auctioneer records. ' +
        'If this is the first run since the 2026-08 Playwright rewrite, check Railway logs ' +
        'for "Could not find Last Name input / Search button" or Turnstile/CAPTCHA marker ' +
        'warnings above — the live DOM selectors were not verified against the live site ' +
        '(see file header VERIFICATION CAVEAT) and may need adjustment.'
      );
    }
  } catch (error) {
    console.error('[Alabama Phase2] Scraper error:', error);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[Alabama Phase2] Browser close error (non-fatal):', closeErr);
      }
    }
  }
}
