// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-sale-seeker.ts
 * Hits TheSaleSeker.com exactly as saleSeeker.ts would (before the DISABLED guard).
 * Tests the WP REST API endpoint + the homepage + the search URL pattern.
 * Prints: response status, sample data, record count.
 *
 * NOTE: The real scraper (saleSeeker.ts) is DISABLED because thesaleseeker.com
 * is a pre-launch site as of 2026-05. This diagnostic confirms that status and
 * will detect if the site has launched since then.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-sale-seeker.ts
 */

import * as cheerio from 'cheerio';

const SALE_SEEKER_BASE_URL = 'https://thesaleseeker.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

interface SiteStatus {
  url: string;
  status: number | string;
  bodyLength: number;
  isPreLaunch: boolean;
  hasListings: boolean;
  blockSignals: string[];
  preview: string;
}

async function fetchAndAnalyze(url: string, label: string): Promise<SiteStatus> {
  console.log(`\nFetching [${label}]: ${url}`);
  const result: SiteStatus = {
    url,
    status: 'error',
    bodyLength: 0,
    isPreLaunch: false,
    hasListings: false,
    blockSignals: [],
    preview: '',
  };

  try {
    const start = Date.now();
    const response = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - start;

    result.status = response.status;
    console.log(`  Status   : ${response.status} ${response.statusText} (${elapsed}ms)`);
    console.log(`  Content  : ${response.headers.get('content-type') ?? 'unknown'}`);

    const body = await response.text();
    result.bodyLength = body.length;
    result.preview = body.slice(0, 300).replace(/\s+/g, ' ');

    const lower = body.toLowerCase();

    const preLaunchSignals = [
      'coming soon', 'pre-launch', 'waitlist', 'in development',
      "we're currently in development", "getting closer every day",
      'launching soon', 'notify me', 'be the first',
    ];
    result.isPreLaunch = preLaunchSignals.some(s => lower.includes(s));

    const blockKeywords = ['captcha', 'cloudflare', 'access denied', 'bot detection', '403 forbidden'];
    result.blockSignals = blockKeywords.filter(s => lower.includes(s));

    const listingSelectors = [
      '[data-listing]', '.listing-card', '.business-listing',
      'article.listing', '.listing', 'post_type=listing',
    ];
    const $ = cheerio.load(body);
    const hasListingElements = listingSelectors.some(sel => $(sel).length > 0);
    const hasWpRestListings = lower.includes('"post_type":"listing"') || lower.includes('type=listing');
    result.hasListings = hasListingElements || hasWpRestListings;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Error    : ${msg}`);
    result.status = `ERROR: ${msg}`;
  }

  return result;
}

async function main() {
  console.log('=== diagnose-sale-seeker.ts — DRY RUN ===');
  console.log('NOTE: Real scraper is DISABLED (pre-launch site as of 2026-05)');
  console.log('This diagnostic checks if the site has launched since that determination.');
  console.log('');

  const homepage = await fetchAndAnalyze(SALE_SEEKER_BASE_URL, 'Homepage');
  const wpRestApi = await fetchAndAnalyze(`${SALE_SEEKER_BASE_URL}/wp-json/wp/v2/posts?per_page=5`, 'WP REST API /posts');
  const searchPage = await fetchAndAnalyze(`${SALE_SEEKER_BASE_URL}/?s=grand+rapids&post_type=listing`, 'Search (post_type=listing)');
  const wpListings = await fetchAndAnalyze(`${SALE_SEEKER_BASE_URL}/wp-json/wp/v2/listing?per_page=5`, 'WP REST API /listing CPT');

  console.log('\n=== SUMMARY ===');
  console.log(`Homepage status      : ${homepage.status}`);
  console.log(`Homepage pre-launch  : ${homepage.isPreLaunch}`);
  console.log(`Homepage has listings: ${homepage.hasListings}`);
  console.log(`Homepage block sigs  : ${homepage.blockSignals.join(', ') || 'none'}`);
  console.log('');
  console.log(`WP REST /posts       : ${wpRestApi.status}`);
  console.log(`WP REST /listing CPT : ${wpListings.status}`);
  console.log(`Search page status   : ${searchPage.status}`);
  console.log(`Search has listings  : ${searchPage.hasListings}`);

  console.log(`\nHomepage preview (300 chars): ${homepage.preview}`);

  const siteIsLive = !homepage.isPreLaunch && homepage.hasListings;
  const siteIsBlocked = homepage.blockSignals.length > 0;
  const siteIsDown = typeof homepage.status === 'string' || (typeof homepage.status === 'number' && (homepage.status as number) >= 500);

  if (siteIsDown) {
    console.log('\nRESULT: BROKEN — Site unreachable or returning 5xx');
  } else if (siteIsBlocked) {
    console.log(`\nRESULT: BROKEN — Blocking signals detected: ${homepage.blockSignals.join(', ')}`);
  } else if (homepage.isPreLaunch) {
    console.log('\nRESULT: EMPTY — Site is still pre-launch (no listings). Scraper correctly disabled.');
  } else if (siteIsLive) {
    console.log('\nRESULT: WORKING — Site appears to have launched! Re-enable scraper and identify live selectors.');
  } else {
    console.log('\nRESULT: EMPTY — Site loads but no listing structure found. Still pre-launch or restructured.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
