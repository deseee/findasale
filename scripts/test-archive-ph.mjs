/**
 * Diagnostic v2: Test archive.ph (archive.today) as a free proxy to estatesales.net.
 * Different infrastructure than archive.org, explicitly handles JS-rendered SPAs.
 *
 * Run: node scripts/test-archive-ph.mjs
 * No deps. Node 20+ built-in fetch.
 *
 * Strategy:
 *   1. Check if archive.ph already has a recent snapshot (fast, read-only)
 *   2. If yes, fetch it and analyze for sale data
 *   3. If no, report that we'd need to trigger a fresh capture (separate test)
 */

const TARGET_URL = 'https://www.estatesales.net/MI/Grand-Rapids';

// archive.ph mirror domains — they round-robin and any can serve
const MIRRORS = ['archive.ph', 'archive.today', 'archive.is', 'archive.li'];

const SALE_LINK_PATTERN = /\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\/?$/;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function tryMirror(mirror) {
  // archive.ph "newest" endpoint redirects to the most recent snapshot,
  // or returns the calendar page if no snapshots exist
  const url = `https://${mirror}/newest/${TARGET_URL}`;
  console.log(`[probe] ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });

    const finalUrl = res.url;
    const status = res.status;
    const html = await res.text();
    console.log(`        HTTP ${status} | ${html.length.toLocaleString()} bytes | final: ${finalUrl}`);

    // archive.ph snapshot URLs look like https://archive.ph/[shortcode]
    // Calendar/no-capture pages contain "No results" or similar
    const isSnapshot = /archive\.(ph|today|is|li)\/[a-zA-Z0-9]{4,7}(\/|$)/.test(finalUrl);
    const isCalendar = /archive\.(ph|today|is|li)\/(newest\/)?https?:\/\//.test(finalUrl);
    const noCaptures = /No\s+(results|captures)/i.test(html) || html.length < 5_000;

    return { mirror, status, finalUrl, html, isSnapshot, isCalendar, noCaptures };
  } catch (err) {
    console.log(`        ❌ ${err?.message || err}`);
    return { mirror, error: err?.message || String(err) };
  }
}

async function main() {
  console.log('=== archive.ph diagnostic ===');
  console.log(`Target: ${TARGET_URL}`);
  console.log('');

  // STEP 1 — try each mirror until one returns a snapshot
  console.log('[1/2] Probing archive.ph mirrors for existing snapshots...');
  let result = null;
  for (const mirror of MIRRORS) {
    const r = await tryMirror(mirror);
    if (r.error) continue;
    if (r.isSnapshot) {
      result = r;
      console.log(`        ✅ ${mirror} returned a snapshot URL`);
      break;
    }
    if (r.noCaptures) {
      console.log(`        ⚠️  ${mirror}: no captures yet`);
      continue;
    }
    // Possibly served the calendar/landing page
    console.log(`        ⚠️  ${mirror}: ambiguous response, continuing`);
  }
  console.log('');

  if (!result) {
    console.log('VERDICT: ⚠️  No existing snapshot found on archive.ph for this URL.');
    console.log('         Options:');
    console.log('         1. Trigger a fresh capture via POST submit (next test)');
    console.log('         2. Check if Bing Cache or Yandex Cache has the page');
    console.log('         3. Accept that no free archive route works for this site');
    process.exit(2);
  }

  // STEP 2 — analyze the snapshot
  console.log('[2/2] Analyzing snapshot HTML for sale data...');
  const html = result.html;

  const anchorRegex = /href="([^"]+)"/g;
  const matches = [...html.matchAll(anchorRegex)].map((m) => m[1]);
  console.log(`    Total <a href> count: ${matches.length}`);

  const saleLinks = matches
    .map((href) => {
      const m = href.match(/https?:\/\/(?:www\.)?estatesales\.net(\/[^"'?#]+)/);
      return m ? m[1] : null;
    })
    .filter((path) => path && SALE_LINK_PATTERN.test(path));

  const uniqueSaleLinks = [...new Set(saleLinks)];
  console.log(`    Sale-link-pattern matches: ${uniqueSaleLinks.length} unique`);

  if (uniqueSaleLinks.length > 0) {
    console.log(`    Sample sale paths:`);
    uniqueSaleLinks.slice(0, 5).forEach((p) => console.log(`      ${p}`));
  }

  const hasSaleWord = /estate sale|garage sale|moving sale/i.test(html);
  const hasGrandRapids = html.includes('Grand-Rapids') || html.includes('Grand Rapids');
  const hasBlocked = /your request has been blocked/i.test(html);
  const hasMonthYear = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(html);

  console.log('');
  console.log('    Heuristic checks:');
  console.log(`      "Grand Rapids" present:   ${hasGrandRapids}`);
  console.log(`      "estate sale" present:     ${hasSaleWord}`);
  console.log(`      Month name present:        ${hasMonthYear}`);
  console.log(`      "Request Blocked" page:    ${hasBlocked}`);
  console.log('');

  // Pull capture date from the snapshot URL/HTML if possible
  const dateMatch = html.match(/<input[^>]*id="DATE"[^>]*value="([^"]+)"/) ||
                    html.match(/Saved on (\w+ \d+, \d{4})/);
  if (dateMatch) {
    console.log(`    Snapshot date: ${dateMatch[1]}`);
  }

  console.log('');
  if (hasBlocked) {
    console.log('VERDICT: ❌ archive.ph captured the WAF block page. archive.ph crawler also blocked.');
    process.exit(5);
  } else if (uniqueSaleLinks.length === 0) {
    console.log('VERDICT: ⚠️  Snapshot loaded but contains zero sale links.');
    console.log('         Could be: empty shell, stale capture, or selector mismatch.');
    process.exit(6);
  } else {
    console.log(`VERDICT: ✅ archive.ph route is viable — ${uniqueSaleLinks.length} sale links found.`);
    console.log(`         Snapshot URL: ${result.finalUrl}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
