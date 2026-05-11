// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-auctionzip.ts
 * Hits AuctionZip /Auctioneer-Directory/[letter].html exactly as auctionZipScraper.ts does.
 * Tests letter "A" only to keep runtime fast.
 * Prints: response status, response headers, first 500 chars of body (CAPTCHA detection),
 * number of entries parsed.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-auctionzip.ts
 */

const BASE_URL = 'https://www.auctionzip.com';
const USER_AGENT = 'FindASale-Bot/1.0 (+https://finda.sale)';
const TEST_LETTER = 'A';

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]);

interface AuctionZipEntry {
  auctioneerId: string;
  companyName: string;
  city: string;
  state: string;
  profileUrl: string;
}

// Same regex parser as real scraper
function parseDirectoryPage(html: string): AuctionZipEntry[] {
  const entries: AuctionZipEntry[] = [];
  const rowPattern =
    /auc-directory__table--table-row[\s\S]*?auc-directory__table--header--auc--company[^>]*>\s*<a[^>]+href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>[\s\S]*?auc-directory__table--header--auc--city-state[^>]*>([^<]+)</g;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const href = match[1].trim();
    const companyName = match[2].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    const cityStateRaw = match[3].trim();

    const csMatch = cityStateRaw.match(/^(.+),\s*([A-Z]{2})\s*$/);
    if (!csMatch) continue;

    const city = csMatch[1].trim();
    const state = csMatch[2].trim();

    if (!US_STATES.has(state)) continue;
    if (companyName.toLowerCase().includes('(closed)')) continue;

    const idMatch = href.match(/\/(\d+)\.html$/);
    if (!idMatch) continue;
    const auctioneerId = idMatch[1];

    const profileUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    entries.push({ auctioneerId, companyName, city, state, profileUrl });
  }
  return entries;
}

async function main() {
  const url = `${BASE_URL}/Auctioneer-Directory/${TEST_LETTER}.html`;

  console.log('=== diagnose-auctionzip.ts — DRY RUN ===');
  console.log(`Target: ${url}`);
  console.log(`User-Agent: ${USER_AGENT}`);
  console.log('');

  let html = '';

  try {
    const start = Date.now();
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    const elapsed = Date.now() - start;

    console.log(`Response status  : ${response.status} ${response.statusText}`);
    console.log(`Response time    : ${elapsed}ms`);

    // Print relevant response headers
    const headersToPrint = [
      'content-type', 'content-encoding', 'server', 'cf-ray',
      'set-cookie', 'retry-after', 'x-robots-tag', 'location',
    ];
    console.log('\nResponse headers (selected):');
    for (const h of headersToPrint) {
      const val = response.headers.get(h);
      if (val) console.log(`  ${h}: ${val.slice(0, 120)}`);
    }

    html = await response.text();
    console.log(`\nBody length: ${html.length} chars`);

    // Auth / bot wall detection
    const bodyPreview = html.slice(0, 500);
    console.log('\n--- First 500 chars of body ---');
    console.log(bodyPreview);
    console.log('--- end preview ---');

    const lowerHtml = html.toLowerCase();
    const blockSignals: string[] = [];
    if (lowerHtml.includes('captcha')) blockSignals.push('captcha');
    if (lowerHtml.includes('cloudflare')) blockSignals.push('cloudflare');
    if (lowerHtml.includes('access denied')) blockSignals.push('access denied');
    if (lowerHtml.includes('bot detection')) blockSignals.push('bot detection');
    if (lowerHtml.includes('sign in') || lowerHtml.includes('log in') || lowerHtml.includes('login')) blockSignals.push('login wall');
    if (lowerHtml.includes('subscribe') && lowerHtml.includes('premium')) blockSignals.push('subscription wall');
    if (response.status === 403) blockSignals.push('403 Forbidden');
    if (response.status === 401) blockSignals.push('401 Unauthorized');

    if (blockSignals.length > 0) {
      console.log(`\nBlocking signals detected: ${blockSignals.join(', ')}`);
    } else {
      console.log('\nNo blocking signals detected in body.');
    }

    if (!response.ok) {
      console.log(`\nRESULT: BROKEN — HTTP ${response.status} from AuctionZip`);
      process.exit(1);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFetch threw: ${msg}`);
    console.log('\nRESULT: BROKEN — Network error or timeout reaching AuctionZip');
    process.exit(1);
  }

  // Parse with same regex as real scraper
  const entries = parseDirectoryPage(html);
  console.log(`\nEntries parsed (letter "${TEST_LETTER}", US only): ${entries.length}`);

  if (entries.length > 0) {
    console.log('\nFirst 5 entries:');
    entries.slice(0, 5).forEach((e, i) => {
      console.log(`  [${i + 1}] "${e.companyName}" — ${e.city}, ${e.state} (ID: ${e.auctioneerId})`);
    });
    console.log(`\nInsertable: YES — ${entries.length} records would be upserted (letter A only)`);
    console.log('\nRESULT: WORKING — Directory page loaded, regex matched entries, insertable');
  } else {
    const hasRowClass = html.includes('auc-directory__table--table-row');
    const hasAnyLinks = html.includes('/Auctioneers/');
    console.log(`\nDiagnostic: page contains 'auc-directory__table--table-row': ${hasRowClass}`);
    console.log(`Diagnostic: page contains '/Auctioneers/' links: ${hasAnyLinks}`);

    if (!hasRowClass && !hasAnyLinks) {
      console.log('\nRESULT: BROKEN — Page loaded but directory HTML structure is missing (site redesign or bot block)');
    } else {
      console.log('\nRESULT: EMPTY — Directory structure present but regex matched 0 entries (possible HTML structure change)');
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
