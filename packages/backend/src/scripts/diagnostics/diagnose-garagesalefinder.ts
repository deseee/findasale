// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-garagesalefinder.ts
 * Fetches 1 metro page from GarageSaleFinder exactly as garageSaleFinder.ts does.
 * Prints: response status, HTML snippet around sale links, matched link count,
 * raw text of first matched element.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-garagesalefinder.ts
 */

import * as cheerio from 'cheerio';

const GARAGE_SALES_BASE_URL = 'https://www.garagesalefinder.com';
const TEST_METRO = 'grand-rapids-mi';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
];
function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function main() {
  const metroUrl = `${GARAGE_SALES_BASE_URL}/yard-sales/${TEST_METRO}/`;

  console.log('=== diagnose-garagesalefinder.ts — DRY RUN ===');
  console.log(`Target: ${metroUrl}`);
  console.log('');

  let html = '';

  try {
    const start = Date.now();
    const response = await fetch(metroUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - start;

    console.log(`Response status  : ${response.status} ${response.statusText}`);
    console.log(`Response time    : ${elapsed}ms`);
    console.log(`Content-Type     : ${response.headers.get('content-type') ?? 'unknown'}`);
    console.log(`Content-Encoding : ${response.headers.get('content-encoding') ?? 'none'}`);

    html = await response.text();
    console.log(`HTML body length : ${html.length} chars`);

    if (!response.ok) {
      const lowerHtml = html.toLowerCase();
      const isBlocked = lowerHtml.includes('captcha') ||
        lowerHtml.includes('cloudflare') ||
        lowerHtml.includes('access denied') ||
        lowerHtml.includes('bot detection');

      console.log(`\nBlocking signals:`);
      console.log(`  Rate limit (429) : ${response.status === 429}`);
      console.log(`  Forbidden (403)  : ${response.status === 403}`);
      console.log(`  CAPTCHA/Bot wall : ${isBlocked}`);
      console.log(`\nFirst 500 chars of response:\n${html.slice(0, 500)}`);
      console.log(`\nRESULT: BROKEN — HTTP ${response.status} from GarageSaleFinder`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFetch threw: ${msg}`);
    console.log('\nRESULT: BROKEN — Network error or timeout reaching GarageSaleFinder');
    process.exit(1);
  }

  // Parse with cheerio — same approach as real scraper
  const $ = cheerio.load(html);

  // Real scraper pattern: /s/[alphanumeric]/ links, exclude /gallery
  const saleLinks: string[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const fullUrl = href.startsWith('http') ? href : `${GARAGE_SALES_BASE_URL}${href}`;
    if (
      /\/s\/[A-Za-z0-9]+\//.test(fullUrl) &&
      !fullUrl.includes('/gallery') &&
      !seen.has(fullUrl)
    ) {
      seen.add(fullUrl);
      saleLinks.push(fullUrl);
    }
  });

  console.log(`\nMatched sale links (pattern /s/[A-Za-z0-9]+/): ${saleLinks.length}`);

  if (saleLinks.length > 0) {
    console.log('\nFirst 5 sale links:');
    saleLinks.slice(0, 5).forEach((link, i) => console.log(`  [${i + 1}] ${link}`));

    // Show raw text surrounding the first link in the HTML
    const firstLinkPath = saleLinks[0].replace(GARAGE_SALES_BASE_URL, '');
    const linkIdx = html.indexOf(firstLinkPath);
    if (linkIdx !== -1) {
      const snippetStart = Math.max(0, linkIdx - 200);
      const snippetEnd = Math.min(html.length, linkIdx + 400);
      console.log('\n--- Raw HTML snippet around first matched link ---');
      console.log(html.slice(snippetStart, snippetEnd));
    }

    console.log(`\nInsertable: YES — ${saleLinks.length} detail pages found`);
    console.log('\nRESULT: WORKING — Metro page loaded, sale links found, real run would parse detail pages');
  } else {
    // Fallback diagnosis
    console.log('\nNo sale links matched. Inspecting page structure...');

    const allLinks: string[] = [];
    $('a[href]').each((_, el) => { allLinks.push($(el).attr('href') ?? ''); });
    console.log(`Total <a href> elements in page: ${allLinks.length}`);

    const saleLikeLinks = allLinks.filter(h => h.includes('/sale') || h.includes('/s/') || h.includes('yard'));
    console.log(`Links containing /sale/, /s/, or "yard": ${saleLikeLinks.length}`);
    saleLikeLinks.slice(0, 10).forEach((l, i) => console.log(`  [${i + 1}] ${l}`));

    const botSignals = ['captcha', 'cloudflare', 'bot', 'access denied', 'challenge'];
    const foundSignals = botSignals.filter(s => html.toLowerCase().includes(s));
    if (foundSignals.length > 0) {
      console.log(`\nBot/blocking signals found in page: ${foundSignals.join(', ')}`);
    }

    const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 300);
    console.log(`\nPage text preview (300 chars): ${pageText}`);

    console.log('\nRESULT: EMPTY — Page loaded but no sale links matched /s/[A-Za-z0-9]+/ pattern (possible selector drift or no current listings)');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
