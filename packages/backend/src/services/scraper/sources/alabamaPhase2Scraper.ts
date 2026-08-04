/**
 * Alabama State Board of Auctioneers — Auctioneer License Scraper (Phase 2)
 *
 * === CURRENT SOURCE (as of 2026-08-04) ===
 * Source: Alabama State Board of Auctioneers public licensee roster (static HTML)
 *   https://auctioneer.alabama.gov/licensee-search/auctioneer-licensee-search/
 *
 * WHY THIS CHANGED (2026-08-04): the prior implementation (see "PRIOR
 * IMPLEMENTATION HISTORY" below) drove a stealth Playwright/Chromium browser
 * against https://alauc-search.kalmservices.net/, looping A–Z over lastName
 * prefixes, to work around a Cloudflare Turnstile challenge that blocks that
 * site's JSON search API. That approach was confirmed BROKEN IN PRODUCTION
 * today (live Railway logs, 2026-08-04): every single letter in the A–Z loop
 * hit the Turnstile challenge on both GitHub Actions and Railway, so the
 * scraper was returning 0 results on every run.
 *
 * THE FIX (verified live via `curl` on 2026-08-04, see below): the Alabama
 * Board of Auctioneers also publishes its entire individual-licensee roster
 * as a single static WordPress "Ninja Tables" HTML page — one plain HTTP GET,
 * no JavaScript rendering, no browser, no Turnstile, no bot-detection headers
 * observed. A `curl` test with a normal-browser User-Agent (no cookies, no
 * special headers) returned HTTP 200 with 596 data rows (1 header row + 596
 * licensee rows) in a single response — confirmed independently in this
 * session, not just taken on faith from the task brief. Response carries
 * `cache-control: public, max-age=604800` (Varnish/Fastly CDN, 7-day cache),
 * so the data here can be up to ~1 week stale — acceptable for this periodic
 * batch scraper.
 *
 * Table structure (confirmed live 2026-08-04): a single
 * `<table id="footable_2559" class="... ninja_footable ...">` with a
 * `<thead><tr class="footable-header">` whose `<th>` cells carry
 * `ninja_clmn_nm_*` classes identifying each column — licensenumber,
 * lastname, firstname, middlename, suffix, licenseexpirationdate,
 * licensetype, email, prefaddress, prefcity, prefstate, prefzipcode, in that
 * left-to-right order — and a `<tbody>` of 596 `<tr data-row_id="...">` rows,
 * each with exactly 12 plain `<td>` cells (no per-cell classes) in that same
 * order. This scraper matches columns by the `th` header class first (see
 * NINJA_COLUMN_CLASSES / parseRosterTable below) and falls back to the
 * confirmed positional order only if that class-based match fails.
 *
 * All 596 rows observed live share the identical "License Expiration Date"
 * value (9/30/2024), which was already in the past at verification time —
 * this reads as the board's shared annual renewal-cycle date, not a
 * per-licensee active/inactive signal. There is no separate "status" column
 * on this page at all, so — same as this file's own prior default whenever
 * no status column was found — every row from this roster is treated as
 * Active. See OPEN QUESTIONS below.
 *
 * SCOPE: this page covers INDIVIDUAL Auctioneer/Apprentice licenses only —
 * the same scope as the prior per-letter loop (confirmed by that code's own
 * log line "Fetching licensees for lastName prefix"). Alabama auction
 * COMPANY licenses are a separate, AJAX-loaded page that has NOT been
 * verified and is OUT OF SCOPE for this change — do not conflate the two.
 *
 * THE OLD A–Z LETTER LOOP IS NOW MOOT: it existed only to work around the
 * kalmservices.net JSON API's per-query search mechanics (one lastName value
 * per request, presumably because that API capped or required a query per
 * request). This new static page returns the FULL roster (596 rows) in a
 * single response with no pagination controls found anywhere in the raw
 * HTML — so the per-letter loop's original reason for existing no longer
 * applies to this source. No evidence was found of any other reason for the
 * loop (e.g. a result cap specific to this new page) — it was purely a
 * workaround for the old site's query-by-lastName mechanics.
 *
 * OPEN QUESTIONS (flagged, not resolved):
 *   1. No "status" column exists on this roster page — every row is treated
 *      as Active (matches this file's prior default whenever no status
 *      column was found). Not verified over repeated observations whether
 *      lapsed licenses ever get removed from this roster or just sit with a
 *      stale expiration date; `totalSkippedInactive` is kept in the
 *      progress-log shape for parity but will always read 0 against this
 *      source until/unless a real status signal is found.
 *   2. The identical "9/30/2024" expiration date across all 596 rows is
 *      unexplained — possibly a stale/un-updated display value on the
 *      board's side, or a shared annual blanket renewal deadline. Not used
 *      as a filter signal here; flagging for awareness.
 *   3. `contactEmail` on the upserted row is now populated from this
 *      source's Email column (the old kalmservices.net site never reliably
 *      exposed licensee email in this file's parsing). This is new data
 *      richness enabled by the new source, not a change to the
 *      matching/filtering/dedup rules themselves —
 *      `batchUpsertScrapedOrganizers` already runs its own
 *      `isValidExternalEmail` gate before persisting any email, so this is
 *      safe to pass through. Flagging explicitly for sign-off since it is
 *      new behavior beyond a strict data-acquisition-layer swap.
 *
 * === PRIOR IMPLEMENTATION HISTORY (superseded 2026-08-04, kept for record) ===
 * Source: Alabama Auctioneers Board licensee search tool (public web UI)
 *   https://alauc-search.kalmservices.net/
 *   (linked from https://auctioneer.alabama.gov/licensee-search/)
 *
 * ROOT CAUSE (confirmed via this file's own prior implementation + task
 * evidence, 2026-08): the version of this scraper before the Playwright
 * rewrite called the site's backing JSON API directly — POST
 * https://alauc-search.kalmservices.net/api/search/licenses with body
 * { parameters: { lastName }, turnstileToken: '' }. That endpoint hard-
 * rejected every request with "CAPTCHA verification failed" — Cloudflare
 * Turnstile is backend-enforced (siteverify validated) as of 2026-08. A
 * plain fetch() call can never produce a valid Turnstile token because it
 * never executes Cloudflare's JS challenge — no amount of URL/endpoint
 * guessing fixes that against a non-JS HTTP client.
 *
 * PLAYWRIGHT ATTEMPT: the next version drove the public search page with a
 * real, stealth-patched headless Chromium browser via Playwright, looping
 * A–Z as a lastName prefix and reading the rendered results table. This was
 * never confirmed working live (written from a network-isolated
 * environment) and, once it did run against production traffic, was blocked
 * by Turnstile on every single letter on both GitHub Actions and Railway —
 * 0 results every run. That is the direct cause of the 2026-08-04 rewrite
 * documented above.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import * as cheerio from 'cheerio';
import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';
import { getRandomUserAgent } from '../userAgents';

const ROSTER_URL = 'https://auctioneer.alabama.gov/licensee-search/auctioneer-licensee-search/';
const DOMAIN = 'auctioneer.alabama.gov';

// False-positive name fragments — exclude row if the licensee name contains any of these.
// (Kept identical to the prior implementation — matching rules are unchanged by this fix.)
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

interface AlabamaLicensee {
  licenseNumber: string;
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  licenseType: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Build a display name from the roster's separate name columns, e.g.
 * "William E. Abernathy" or "Albert H. Adams, Jr." Mirrors the licensee-name
 * shape the prior implementation produced from a single combined name field.
 */
function buildLicenseeName(lic: Pick<AlabamaLicensee, 'firstName' | 'middleName' | 'lastName' | 'suffix'>): string {
  const parts = [lic.firstName, lic.middleName, lic.lastName]
    .map((p) => p.trim())
    .filter(Boolean);
  let name = parts.join(' ');
  const suffix = lic.suffix.trim();
  if (suffix) {
    name = name ? `${name}, ${suffix}` : suffix;
  }
  return name;
}

// Maps our field names to the `ninja_clmn_nm_*` class fragment on each <th>
// (confirmed live 2026-08-04 — see file header). Matching by header class is
// more robust to a column reorder than raw positional <td> indexing.
const NINJA_COLUMN_CLASSES: Record<keyof AlabamaLicensee, string> = {
  licenseNumber: 'ninja_clmn_nm_licensenumber',
  lastName: 'ninja_clmn_nm_lastname',
  firstName: 'ninja_clmn_nm_firstname',
  middleName: 'ninja_clmn_nm_middlename',
  suffix: 'ninja_clmn_nm_suffix',
  licenseType: 'ninja_clmn_nm_licensetype',
  email: 'ninja_clmn_nm_email',
  address: 'ninja_clmn_nm_prefaddress',
  city: 'ninja_clmn_nm_prefcity',
  state: 'ninja_clmn_nm_prefstate',
  zip: 'ninja_clmn_nm_prefzipcode',
};

// Fallback fixed column order (confirmed live 2026-08-04) — only used if the
// header row's ninja_clmn_nm_* classes can't be matched. Fragile: breaks if
// the source ever reorders columns without also updating the header classes.
const POSITIONAL_FALLBACK: Record<keyof AlabamaLicensee, number> = {
  licenseNumber: 0,
  lastName: 1,
  firstName: 2,
  middleName: 3,
  suffix: 4,
  // column 5 = License Expiration Date — not mapped, unused downstream (see OPEN QUESTIONS)
  licenseType: 6,
  email: 7,
  address: 8,
  city: 9,
  state: 10,
  zip: 11,
};

interface ParsedRoster {
  records: AlabamaLicensee[];
  malformedRowCount: number;
  usedFallbackParsing: boolean;
}

/**
 * Parse the full licensee roster table into rows.
 * Defensive by design: a single malformed <tr> (missing license#/last name,
 * unexpected cell count, etc.) is logged and skipped — it must never crash
 * the whole job or throw away the rest of the roster.
 */
function parseRosterTable(html: string): ParsedRoster {
  const $ = cheerio.load(html);
  const records: AlabamaLicensee[] = [];
  let malformedRowCount = 0;

  const tableSelectors = [
    'table.ninja_footable',
    'table[data-footable_id]',
    '.ninja_table_wrapper table',
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
    console.warn('[Alabama Phase2] No roster table found on page — markup may have changed');
    return { records, malformedRowCount, usedFallbackParsing: false };
  }

  const $headerRow = $table.find('thead tr').first().length
    ? $table.find('thead tr').first()
    : $table.find('tr').first();

  const colIndex: Partial<Record<keyof AlabamaLicensee, number>> = {};
  $headerRow.find('th').each((i, el) => {
    const cls = $(el).attr('class') || '';
    for (const key of Object.keys(NINJA_COLUMN_CLASSES) as (keyof AlabamaLicensee)[]) {
      if (cls.includes(NINJA_COLUMN_CLASSES[key])) {
        colIndex[key] = i;
      }
    }
  });

  let usedFallbackParsing = false;
  const requiredKeys: (keyof AlabamaLicensee)[] = ['licenseNumber', 'lastName', 'firstName'];
  if (requiredKeys.some((k) => colIndex[k] === undefined)) {
    console.warn(
      '[Alabama Phase2] Could not match required columns by ninja_clmn_nm_* header class — ' +
      'falling back to the confirmed fixed positional column order (fragile if the source table is reordered).'
    );
    Object.assign(colIndex, POSITIONAL_FALLBACK);
    usedFallbackParsing = true;
  }

  const get = (cells: string[], key: keyof AlabamaLicensee): string => {
    const idx = colIndex[key];
    return idx !== undefined && idx < cells.length ? cells[idx] : '';
  };

  const $dataRows = $table.find('tbody tr').length > 0
    ? $table.find('tbody tr')
    : $table.find('tr').slice(1); // no <tbody> — skip the first (header) row

  $dataRows.each((_i, el) => {
    const $tds = $(el).find('td');
    if ($tds.length === 0) return; // e.g. a stray non-data row — skip silently

    const cells = $tds.map((_j, td) => $(td).text().trim()).get();

    const licenseNumber = get(cells, 'licenseNumber');
    const lastName = get(cells, 'lastName');
    const firstName = get(cells, 'firstName');

    if (!licenseNumber || !lastName) {
      malformedRowCount++;
      console.warn(
        `[Alabama Phase2] Skipping malformed row (missing license# or last name): ${JSON.stringify(cells)}`
      );
      return;
    }

    records.push({
      licenseNumber,
      lastName,
      firstName,
      middleName: get(cells, 'middleName'),
      suffix: get(cells, 'suffix'),
      licenseType: get(cells, 'licenseType'),
      email: get(cells, 'email'),
      address: get(cells, 'address'),
      city: get(cells, 'city'),
      state: get(cells, 'state'),
      zip: get(cells, 'zip'),
    });
  });

  return { records, malformedRowCount, usedFallbackParsing };
}

/**
 * Fetch the roster page HTML with a single plain GET. No browser, no
 * Turnstile handling needed — see file header for why. Returns null (rather
 * than throwing) on any fetch failure so the caller can log a clear error
 * and fail the job cleanly instead of an unhandled rejection.
 */
async function fetchRosterHtml(): Promise<string | null> {
  await defaultRateLimiter.waitBeforeRequest(DOMAIN);

  try {
    const response = await fetch(ROSTER_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[Alabama Phase2] Roster fetch failed: HTTP ${response.status} from ${ROSTER_URL}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.error('[Alabama Phase2] Roster fetch failed (network error):', err);
    return null;
  }
}

/**
 * Alabama State Board of Auctioneers — auctioneer license scraper.
 * Single static-HTML GET of the full licensee roster (see file header — the
 * old A–Z per-letter Playwright loop against the Turnstile-protected
 * kalmservices.net site is retired as of 2026-08-04). Deduplicates by
 * LicenseNumber. This roster is individual-licensee only, so the licensee's
 * own name is used as the business name (no separate company field exists
 * on this page — see file header SCOPE note).
 */
export async function runAlabamaPhase2Scraper(): Promise<void> {
  console.log('[Alabama Phase2] Starting auctioneer license scraper — Alabama Board of Auctioneers');
  console.log(`[Alabama Phase2] Source: ${ROSTER_URL} (single static HTML GET — no browser needed; see file header for why this changed 2026-08-04)`);

  const seenLicenseNumbers = new Set<string>();
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let totalSkippedDupe = 0;
  let totalSkippedExclude = 0;
  const totalSkippedInactive = 0; // this source has no status column — see file header OPEN QUESTIONS #1
  let totalSkippedMalformed = 0;

  try {
    const html = await fetchRosterHtml();
    if (!html) {
      throw new Error(
        `Alabama Phase2 scraper could not fetch the roster page (${ROSTER_URL}). ` +
        'See the HTTP status / network error logged above.'
      );
    }

    const { records, malformedRowCount, usedFallbackParsing } = parseRosterTable(html);
    totalSkippedMalformed = malformedRowCount;
    totalFetched = records.length;

    console.log(
      `[Alabama Phase2] Parsed ${totalFetched} licensee row(s) from roster page` +
      (usedFallbackParsing ? ' (used positional fallback parsing — header column classes not matched)' : '') +
      (malformedRowCount > 0 ? `; skipped ${malformedRowCount} malformed row(s)` : '')
    );

    const rows: ScrapedOrganizerRow[] = [];

    for (const lic of records) {
      // Deduplicate by LicenseNumber (unchanged rule from the prior implementation)
      const licNum = lic.licenseNumber.trim();
      if (!licNum || seenLicenseNumbers.has(licNum)) {
        if (licNum) totalSkippedDupe++;
        continue;
      }
      seenLicenseNumbers.add(licNum);

      // No separate company field on this page — use the licensee's own name
      // as the business name (same fallback behavior the prior implementation
      // used whenever a row had no company name).
      const businessName = buildLicenseeName(lic);
      if (!businessName) continue;

      if (nameIsExcluded(businessName)) {
        totalSkippedExclude++;
        continue;
      }

      const city = lic.city.trim();
      const state = lic.state.trim();
      const email = lic.email.trim();

      totalMatched++;

      rows.push({
        businessName,
        sourceName: 'AlabamaPhase2',
        city: city || 'Alabama',
        state: state || 'AL',
        businessCategory: 'AUCTION_HOUSE',
        contactEmail: email || undefined,
        isStateLicensed: true,
        licenseState: 'AL',
        licenseNumber: licNum,
        sourceLabel: 'Alabama Board of Auctioneers',
      });
    }

    // Single batch upsert — this is now a one-shot fetch, so there is no
    // per-letter batching left to do (ADR-073 perf still applies via
    // batchUpsertScrapedOrganizers' own internal chunking).
    const ids = await batchUpsertScrapedOrganizers(rows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[Alabama Phase2] Done — fetched: ${totalFetched}, unique: ${seenLicenseNumbers.size}, matched: ${totalMatched}, upserted: ${totalUpserted}, dupes: ${totalSkippedDupe}, excluded: ${totalSkippedExclude}, inactive: ${totalSkippedInactive}, malformed: ${totalSkippedMalformed}`
    );

    if (totalMatched === 0) {
      throw new Error(
        'Alabama Phase2 scraper completed but found zero matching auctioneer records. ' +
        `Check Railway logs above for a fetch failure, a 0-row parse, or a markup change on ${ROSTER_URL} ` +
        '(see file header for the confirmed 2026-08-04 table structure).'
      );
    }
  } catch (error) {
    console.error('[Alabama Phase2] Scraper error:', error);
    throw error;
  }
}
