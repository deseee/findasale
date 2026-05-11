// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-canada411.ts
 * Fetches one page from Canada411.ca exactly as canada411Scraper.ts does.
 * Tests keyword "estate sale" in province ON, offset 0.
 * Prints: response status, matched element count, sample parsed record.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-canada411.ts
 */

const CANADA411_DOMAIN = 'www.canada411.ca';
const TEST_KEYWORD = 'estate sale';
const TEST_PROVINCE = 'ON';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'dental', 'medical',
  'restaurant', 'hotel', 'automotive', 'construction', 'landscaping',
];
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some(f => lower.includes(f));
}

function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Canada411Listing {
  name: string;
  city: string;
  phone?: string;
}

function parseListings(html: string, province: string): Canada411Listing[] {
  const results: Canada411Listing[] = [];
  const seenNames = new Set<string>();

  // Strategy 1: structured listing blocks
  const blockRegex =
    /class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)(?=class="[^"]*listing[^"]*"|<\/ul>|<\/div>\s*<\/div>\s*<\/div>|$)/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];
    const namePatterns = [
      /<a[^>]+class="[^"]*listing-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /<span[^>]+class="[^"]*business-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      /<h[23][^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i,
      /<strong[^>]*>([\s\S]*?)<\/strong>/i,
      /<a[^>]+href="[^"]*\/bus\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    ];
    let name = '';
    for (const pattern of namePatterns) {
      const m = block.match(pattern);
      if (m) { name = extractText(m[1]); if (name.length > 2) break; }
    }
    if (!name || name.length < 2 || seenNames.has(name.toLowerCase())) continue;

    const cityPatterns = [
      /<span[^>]+class="[^"]*[Cc]ity[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      /([A-Z][a-zA-Z\s\-']{2,30}),\s*(?:ON|BC|AB)/,
    ];
    let city = '';
    for (const pattern of cityPatterns) {
      const m = block.match(pattern);
      if (m) { city = extractText(m[1]).replace(/,\s*(ON|BC|AB).*$/, '').trim(); if (city.length > 1) break; }
    }
    if (!city) city = 'Ontario';

    const phoneMatch = block.match(/(\(?\d{3}\)?[\s\-]\d{3}[\s\-]\d{4})/);
    const phone = phoneMatch ? phoneMatch[1].trim() : undefined;
    seenNames.add(name.toLowerCase());
    results.push({ name, city, phone });
  }

  // Strategy 2: fallback /bus/ link scan
  if (results.length === 0) {
    const busLinkRegex = /<a[^>]+href="\/bus\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = busLinkRegex.exec(html)) !== null) {
      const name = extractText(linkMatch[2]);
      if (!name || name.length < 2 || seenNames.has(name.toLowerCase())) continue;
      const surroundStart = Math.max(0, linkMatch.index - 100);
      const surroundEnd = Math.min(html.length, linkMatch.index + linkMatch[0].length + 400);
      const surround = html.slice(surroundStart, surroundEnd);
      const cityMatch = surround.match(/([A-Z][a-zA-Z\s\-']{2,30}),\s*(?:ON|BC|AB)/);
      const city = cityMatch ? cityMatch[1].trim() : 'Ontario';
      seenNames.add(name.toLowerCase());
      results.push({ name, city });
    }
  }
  return results;
}

async function main() {
  const encodedKeyword = encodeURIComponent(TEST_KEYWORD).replace(/%20/g, '+');
  const url = `https://www.canada411.ca/search/si/0/kw/${encodedKeyword}/prov/${TEST_PROVINCE}/`;

  console.log('=== diagnose-canada411.ts — DRY RUN ===');
  console.log(`Target: ${url}`);
  console.log(`Keyword: "${TEST_KEYWORD}" | Province: ${TEST_PROVINCE} | Offset: 0`);
  console.log('');

  let html = '';

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': randomUA(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: 'https://www.canada411.ca/',
      },
      signal: AbortSignal.timeout(30000),
    });
    const elapsed = Date.now() - start;

    console.log(`Response status  : ${response.status} ${response.statusText}`);
    console.log(`Response time    : ${elapsed}ms`);
    console.log(`Content-Type     : ${response.headers.get('content-type') ?? 'unknown'}`);

    html = await response.text();
    console.log(`Body length      : ${html.length} chars`);

    if (!response.ok) {
      const blockSignals: string[] = [];
      const lower = html.toLowerCase();
      if (lower.includes('captcha')) blockSignals.push('captcha');
      if (lower.includes('cloudflare')) blockSignals.push('cloudflare');
      if (lower.includes('access denied')) blockSignals.push('access denied');
      if (blockSignals.length) console.log(`Blocking signals : ${blockSignals.join(', ')}`);
      console.log(`\nFirst 300 chars:\n${html.slice(0, 300)}`);
      console.log(`\nRESULT: BROKEN — HTTP ${response.status} from Canada411`);
      process.exit(1);
    }

    const noResults =
      html.includes('No results found') ||
      html.includes('no results') ||
      html.includes('0 results') ||
      html.includes("couldn't find any") ||
      html.includes('Aucun résultat');

    if (noResults) {
      console.log('\nNo-results signal found in page content.');
      console.log('\nRESULT: EMPTY — Canada411 returned "no results" for estate sale / ON');
      process.exit(0);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFetch threw: ${msg}`);
    console.log('\nRESULT: BROKEN — Network error or timeout reaching Canada411');
    process.exit(1);
  }

  const listings = parseListings(html, TEST_PROVINCE);
  console.log(`\nListings parsed (Strategy 1+2): ${listings.length}`);

  if (listings.length > 0) {
    const excluded = listings.filter((l: Canada411Listing) => nameIsExcluded(l.name));
    const passing = listings.filter((l: Canada411Listing) => !nameIsExcluded(l.name));

    console.log(`  Excluded by name filter : ${excluded.length}`);
    console.log(`  Passing filter          : ${passing.length}`);

    console.log('\nSample parsed records (first 5):');
    passing.slice(0, 5).forEach((l: Canada411Listing, i: number) => {
      console.log(`  [${i + 1}] "${l.name}" — ${l.city}, ${TEST_PROVINCE}${l.phone ? ' | ' + l.phone : ''}`);
    });

    console.log(`\nInsertable: YES — ${passing.length} records would be upserted`);
    console.log('\nRESULT: WORKING — Canada411 returned listings, filter passes, insertable');
  } else {
    const hasListingClass = html.includes('class="listing');
    const hasBusLinks = html.includes('/bus/');
    console.log(`\nDiagnostic: page contains class="listing... : ${hasListingClass}`);
    console.log(`Diagnostic: page contains /bus/ links       : ${hasBusLinks}`);
    console.log(`\nFirst 300 chars of body:\n${html.slice(0, 300)}`);

    if (!hasListingClass && !hasBusLinks) {
      console.log('\nRESULT: BROKEN — No listing HTML structure found (possible site redesign or bot block)');
    } else {
      console.log('\nRESULT: EMPTY — Page structure present but parser matched 0 listings (possible selector drift)');
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
