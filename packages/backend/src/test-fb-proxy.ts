/**
 * Standalone test script for the Cloudflare FB-events proxy.
 *
 * Usage:
 *   cd packages/backend
 *   FB_EVENTS_PROXY_URL=https://findasale-fb-proxy.findas-6eb.workers.dev \
 *   FB_EVENTS_PROXY_TOKEN=<token> \
 *   npx ts-node src/test-fb-proxy.ts
 *
 * Tests 5 real FB event URLs: fetches each through the proxy, extracts
 * og:title / og:description via regex, then tries Pattern 0 date parsing.
 * Prints a pass/fail summary at the end.
 *
 * NOT part of the main app — safe to run standalone at any time.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROXY_BASE  = process.env.FB_EVENTS_PROXY_URL;
const PROXY_TOKEN = process.env.FB_EVENTS_PROXY_TOKEN;

if (!PROXY_BASE || !PROXY_TOKEN) {
  console.error('[test-fb-proxy] ERROR: FB_EVENTS_PROXY_URL and FB_EVENTS_PROXY_TOKEN must be set.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test URLs — recurring community/city-wide events seen in scraper logs
// ---------------------------------------------------------------------------

const TEST_URLS: string[] = [
  'https://www.facebook.com/events/fairlamb-lavender-farm-741-georgetown-road-sandy-lake/georgetown-rd-20-mile-garage-sale/527516221888741/',
  'https://www.facebook.com/events/city-of-collinsville-parks-and-recreation/collinsville-city-wide-garage-sale/330448771423957/',
  'https://www.facebook.com/events/oldsmar-flea-market/trade-day-retro-video-game-swap-meet/364397407359237/',
  'https://www.facebook.com/events/vfw-post-7389-westminster-ma/antique-car-swap-meet-flea-market/427490537819548/',
  'https://www.facebook.com/events/galt-flea-market/galt-auto-swap-meet-car-show/780988013030938/',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractOgTag(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  let m = html.match(re);
  if (m) return m[1];
  // Try content-before-property order
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  m = html.match(re2);
  return m ? m[1] : null;
}

/**
 * Pattern 0 from parseDateFromOgDescription:
 * "on [Weekday], [Month] [Day] [Year]"
 */
function tryPattern0(text: string): Date | null {
  const p0 = /on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})/i;
  const m = text.match(p0);
  if (!m) return null;
  const [, month, day, year] = m;
  const d = new Date(`${month} ${day}, ${year}`);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Result {
  url: string;
  httpStatus: number | null;
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  ogDescriptionSnippet: string | null;
  patternMatched: string | null;
  parsedDate: Date | null;
  error: string | null;
}

async function testUrl(url: string): Promise<Result> {
  const result: Result = {
    url,
    httpStatus: null,
    hasOgTitle: false,
    hasOgDescription: false,
    ogDescriptionSnippet: null,
    patternMatched: null,
    parsedDate: null,
    error: null,
  };

  try {
    const proxyUrl = `${PROXY_BASE}/fb-event-page?url=${encodeURIComponent(url)}`;
    console.log(`\n[FETCH] ${url}`);
    console.log(`        -> ${proxyUrl}`);

    const resp = await fetch(proxyUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });

    result.httpStatus = resp.status;
    console.log(`        HTTP ${resp.status}`);

    if (!resp.ok) {
      result.error = `HTTP ${resp.status}`;
      return result;
    }

    const html = await resp.text();
    console.log(`        HTML length: ${html.length} chars`);

    const title = extractOgTag(html, 'og:title');
    const description = extractOgTag(html, 'og:description');

    result.hasOgTitle = Boolean(title);
    result.hasOgDescription = Boolean(description);

    if (title) {
      console.log(`        og:title: ${title}`);
    } else {
      console.log(`        og:title: (not found)`);
    }

    if (description) {
      result.ogDescriptionSnippet = description.substring(0, 300);
      console.log(`        og:description: ${result.ogDescriptionSnippet}`);

      // Try Pattern 0
      const p0date = tryPattern0(description);
      if (p0date) {
        result.patternMatched = 'Pattern0';
        result.parsedDate = p0date;
        console.log(`        [MATCH] Pattern0 matched: ${p0date.toISOString()}`);
      } else {
        console.log(`        [MISS]  Pattern0: no match`);
        // Hint if time-bearing patterns might apply
        const withTime = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun).*\bat\b.*(?:AM|PM)/i.test(description);
        if (withTime) {
          console.log(`        [INFO]  Description contains time-bearing date -- Pattern 1/2/3 may match in production parser`);
        }
      }
    } else {
      console.log(`        og:description: (not found)`);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.log(`        ERROR: ${result.error}`);
  }

  return result;
}

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('FB Events Proxy Test');
  console.log(`Proxy: ${PROXY_BASE}`);
  console.log(`URLs:  ${TEST_URLS.length}`);
  console.log('='.repeat(70));

  const results: Result[] = [];
  for (const url of TEST_URLS) {
    results.push(await testUrl(url));
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const got200    = results.filter(r => r.httpStatus === 200).length;
  const hadOgDesc = results.filter(r => r.hasOgDescription).length;
  const parsedDate = results.filter(r => r.parsedDate !== null).length;

  console.log(`HTTP 200:            ${got200}/${results.length}`);
  console.log(`Had og:description:  ${hadOgDesc}/${results.length}`);
  console.log(`Pattern0 date found: ${parsedDate}/${results.length}`);

  console.log('\nPer-URL:');
  for (const r of results) {
    const short = r.url.replace('https://www.facebook.com/events/', '').substring(0, 60);
    const status = r.error
      ? `ERROR: ${r.error}`
      : `HTTP ${r.httpStatus} | og:desc=${r.hasOgDescription ? 'YES' : 'NO'} | date=${r.parsedDate ? r.parsedDate.toISOString().split('T')[0] : 'none'} (${r.patternMatched ?? 'no pattern'})`;
    console.log(`  ${short}: ${status}`);
  }

  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
