/**
 * Diagnostic: Test if archive.org's Save Page Now can capture estatesales.net
 * with rendered sale data, bypassing the WAF that blocks datacenter IPs.
 *
 * Run from project root: node scripts/test-archive-scrape.mjs
 * No dependencies. Uses Node 20+ built-in fetch.
 *
 * What this proves (or disproves):
 *   - Whether archive.org can fetch estatesales.net at all
 *   - Whether the snapshot contains real sale data or a JS-empty shell
 *   - Whether snapshots are fresh enough to be useful
 */

const TARGET_URL = 'https://www.estatesales.net/MI/Grand-Rapids';
const SPN_URL = `https://web.archive.org/save/${TARGET_URL}`;

// Sale URL pattern from packages/backend/src/services/scraper/sources/estatesalesnet.ts
const SALE_LINK_PATTERN = /\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\/?$/;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FindASale-Test/1.0';

async function main() {
  console.log('=== archive.org Save Page Now diagnostic ===');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`SPN endpoint: ${SPN_URL}`);
  console.log('');

  // STEP 1 — trigger Save Page Now
  console.log('[1/3] Triggering Save Page Now (this can take 30–90 seconds)...');
  const t0 = Date.now();
  let snapshotUrl = null;

  try {
    const res = await fetch(SPN_URL, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });

    const finalUrl = res.url;
    const contentType = res.headers.get('content-type') ?? '';
    const status = res.status;
    console.log(`    HTTP ${status} | content-type: ${contentType}`);
    console.log(`    Final URL after redirects: ${finalUrl}`);

    if (finalUrl.includes('/web/') && finalUrl.includes('estatesales.net')) {
      snapshotUrl = finalUrl;
      console.log(`    ✅ Got snapshot URL`);
    } else {
      console.log(`    ⚠️  Did not redirect to a snapshot URL — SPN may have failed`);
      const body = await res.text();
      console.log(`    Response body preview (first 500 chars):`);
      console.log('    ' + body.slice(0, 500).replace(/\n/g, '\n    '));
      console.log('');
      console.log('VERDICT: SPN did not produce a snapshot. archive.org route is NOT viable.');
      process.exit(2);
    }
  } catch (err) {
    console.log(`    ❌ SPN request failed: ${err?.message || err}`);
    console.log('');
    console.log('VERDICT: SPN unreachable or timed out. Cannot use archive.org route.');
    process.exit(3);
  }

  console.log(`    Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('');

  // STEP 2 — fetch the snapshot
  console.log('[2/3] Fetching snapshot HTML...');
  let html = '';
  try {
    const res = await fetch(snapshotUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30_000),
    });
    html = await res.text();
    console.log(`    HTTP ${res.status} | ${html.length.toLocaleString()} bytes received`);
  } catch (err) {
    console.log(`    ❌ Snapshot fetch failed: ${err?.message || err}`);
    process.exit(4);
  }
  console.log('');

  // STEP 3 — analyze the snapshot for real sale data
  console.log('[3/3] Analyzing snapshot for sale data...');

  // Extract all anchor hrefs from the snapshot. Note: archive.org rewrites links
  // to be relative to /web/[timestamp]/, so we look for the underlying URL.
  const anchorRegex = /href="([^"]+)"/g;
  const matches = [...html.matchAll(anchorRegex)].map((m) => m[1]);
  console.log(`    Total <a href> count: ${matches.length}`);

  // Find anchors that match the EstateSalesNet sale pattern
  const saleLinks = matches
    .map((href) => {
      // archive.org wraps URLs as /web/TIMESTAMP/https://www.estatesales.net/...
      const m = href.match(/https?:\/\/www\.estatesales\.net(\/[^"'?#]+)/);
      return m ? m[1] : null;
    })
    .filter((path) => path && SALE_LINK_PATTERN.test(path));

  const uniqueSaleLinks = [...new Set(saleLinks)];
  console.log(`    Sale-link-pattern matches: ${uniqueSaleLinks.length} unique`);

  // Sample of what we found
  if (uniqueSaleLinks.length > 0) {
    console.log(`    Sample sale paths:`);
    uniqueSaleLinks.slice(0, 5).forEach((p) => console.log(`      ${p}`));
  }

  // Quick text-based sanity checks
  const hasSaleWord = /estate sale|garage sale|moving sale/i.test(html);
  const hasGrandRapids = html.includes('Grand-Rapids') || html.includes('Grand Rapids');
  const hasBlocked = /your request has been blocked/i.test(html) || /Error ID/.test(html);
  const hasMonthYear = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(html);

  console.log('');
  console.log('    Heuristic checks:');
  console.log(`      "Grand Rapids" present:   ${hasGrandRapids}`);
  console.log(`      "estate sale" present:     ${hasSaleWord}`);
  console.log(`      Month name present:        ${hasMonthYear}`);
  console.log(`      "Request Blocked" page:    ${hasBlocked}`);
  console.log('');

  // Verdict
  if (hasBlocked) {
    console.log('VERDICT: ❌ The snapshot itself is the WAF block page.');
    console.log('         estatesales.net blocked archive.org\'s crawler too.');
    console.log('         archive.org route is NOT viable.');
    process.exit(5);
  } else if (uniqueSaleLinks.length === 0) {
    console.log('VERDICT: ⚠️  Snapshot loaded but contains NO sale links.');
    console.log('         Likely cause: SPN did not execute JS to render the React app.');
    console.log('         Fallback to try: archive.ph (handles SPAs better).');
    process.exit(6);
  } else {
    console.log(`VERDICT: ✅ archive.org route is viable.`);
    console.log(`         Snapshot contains ${uniqueSaleLinks.length} sale links to ingest.`);
    console.log(`         Snapshot URL: ${snapshotUrl}`);
    console.log('');
    console.log('Next step: rewrite the scraper to route all metro fetches through SPN.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
