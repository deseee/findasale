/**
 * Diagnostic v3: Test free proxy rotation against estatesales.net's WAF.
 * Zero deps — uses Node built-in http/https with manual CONNECT tunneling.
 *
 * Run: node scripts/test-proxy-rotation.mjs
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const TARGET_URL = 'https://www.estatesales.net/MI/Grand-Rapids';
const SALE_LINK_PATTERN = /\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\/?$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=us&format=textplain',
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=ca&format=textplain',
  'https://www.proxy-list.download/api/v1/get?type=https&country=US',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
];

const MAX_PROXIES_TO_TEST = 40;
const TEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 8;

/**
 * Fetch HTTPS URL through an HTTP CONNECT proxy. Returns { status, body, ms }.
 * No external deps. Works for any HTTP proxy that accepts CONNECT (most do).
 */
function fetchViaProxy(targetUrl, proxy, headers = {}) {
  const [proxyHost, proxyPortStr] = proxy.split(':');
  const proxyPort = parseInt(proxyPortStr, 10);
  const target = new URL(targetUrl);
  const start = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      reject(new Error(msg));
    };
    const ok = (val) => {
      if (settled) return;
      settled = true;
      resolve({ ...val, ms: Date.now() - start });
    };

    const tunnel = http.request({
      host: proxyHost,
      port: proxyPort,
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      timeout: TEST_TIMEOUT_MS,
    });

    tunnel.setTimeout(TEST_TIMEOUT_MS, () => {
      tunnel.destroy();
      fail('tunnel-timeout');
    });
    tunnel.on('error', (e) => fail('tunnel-' + (e.code || e.message).slice(0, 30)));

    tunnel.on('connect', (connectRes, socket) => {
      if (connectRes.statusCode !== 200) {
        socket.destroy();
        return fail('connect-http-' + connectRes.statusCode);
      }

      const req = https.request({
        host: target.hostname,
        port: 443,
        path: target.pathname + target.search,
        method: 'GET',
        socket,
        agent: false,
        timeout: TEST_TIMEOUT_MS,
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Host': target.hostname,
          ...headers,
        },
      });

      req.setTimeout(TEST_TIMEOUT_MS, () => {
        req.destroy();
        fail('request-timeout');
      });
      req.on('error', (e) => fail('request-' + (e.code || e.message).slice(0, 30)));

      req.on('response', (res) => {
        const chunks = [];
        let total = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          chunks.push(chunk);
          total += chunk.length;
          if (total > 2_000_000) {
            res.destroy();
            ok({ status: res.statusCode, body: chunks.join(''), truncated: true });
          }
        });
        res.on('end', () => {
          ok({ status: res.statusCode, body: chunks.join(''), truncated: false });
        });
        res.on('error', (e) => fail('response-' + (e.code || e.message).slice(0, 30)));
      });

      req.end();
    });

    tunnel.end();
  });
}

function classify(html, status) {
  if (!html || html.length < 500) return 'tiny';
  if (/your request has been blocked/i.test(html)) return 'waf-blocked';
  if (/error id/i.test(html) && html.length < 5000) return 'waf-blocked';
  if (/grand[\s-]rapids/i.test(html) && /estate sale/i.test(html)) {
    const matches = [...html.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => SALE_LINK_PATTERN.test(href));
    if (matches.length >= 1) return 'success-with-data';
    return 'success-no-listings';
  }
  if (status >= 200 && status < 400) return 'unknown-200';
  return 'http-' + status;
}

async function loadProxies() {
  const all = new Set();
  for (const src of PROXY_SOURCES) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) {
        console.log(`  [skip] ${src.split('?')[0].split('/').slice(-2).join('/')}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter((l) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l.trim()));
      lines.forEach((l) => all.add(l.trim()));
      console.log(`  [ok] ${src.split('?')[0].split('/').slice(-2).join('/')}: +${lines.length}`);
    } catch (err) {
      console.log(`  [err] ${src.split('?')[0].split('/').slice(-2).join('/')}: ${err?.message || err}`);
    }
  }
  return [...all];
}

async function tryProxy(proxy) {
  try {
    const r = await fetchViaProxy(TARGET_URL, proxy);
    return {
      proxy,
      status: r.status,
      bytes: r.body.length,
      verdict: classify(r.body, r.status),
      ms: r.ms,
      bodySample: r.body.slice(0, 200),
    };
  } catch (err) {
    return { proxy, verdict: 'connect-error', error: (err?.message || String(err)).slice(0, 60), ms: 0 };
  }
}

async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

async function main() {
  console.log('=== Free proxy rotation diagnostic ===');
  console.log(`Target: ${TARGET_URL}`);
  console.log('');

  console.log('[1/3] Pulling free proxy lists...');
  const all = await loadProxies();
  console.log(`        Total unique proxies: ${all.length}`);
  if (all.length === 0) {
    console.log('VERDICT: ❌ No proxies. Try again later.');
    process.exit(2);
  }

  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const sample = all.slice(0, MAX_PROXIES_TO_TEST);
  console.log(`        Testing ${sample.length} (shuffled, ${CONCURRENCY} concurrent, ${TEST_TIMEOUT_MS / 1000}s timeout)`);
  console.log('');

  console.log('[2/3] Testing proxies...');
  const results = await pool(sample, CONCURRENCY, async (proxy, i) => {
    const r = await tryProxy(proxy);
    const tag = {
      'success-with-data': '✅',
      'success-no-listings': '🟡',
      'waf-blocked': '🚫',
      'connect-error': '⚫',
      'tiny': '◽',
      'unknown-200': '❓',
    }[r.verdict] || '·';
    const detail = r.bytes ? `${r.bytes.toLocaleString()}b` : (r.error || '');
    console.log(`  ${tag} [${(i + 1).toString().padStart(3)}/${sample.length}] ${proxy.padEnd(22)} ${r.verdict.padEnd(20)} ${detail.padEnd(15)} ${r.ms}ms`);
    return r;
  });
  console.log('');

  const counts = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

  console.log('[3/3] Summary:');
  for (const [v, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`        ${v.padEnd(22)} ${n}`);
  }
  console.log('');

  const winners = results.filter((r) => r.verdict === 'success-with-data');
  if (winners.length > 0) {
    console.log(`VERDICT: ✅ ${winners.length} of ${sample.length} proxies returned real sale data.`);
    console.log('         Working proxies:');
    winners.slice(0, 10).forEach((r) => console.log(`           ${r.proxy}  (${r.bytes.toLocaleString()}b in ${r.ms}ms)`));
    console.log('');
    console.log('         Free proxy rotation is viable. Next: integrate into scraper.');
    process.exit(0);
  }

  const noListings = results.filter((r) => r.verdict === 'success-no-listings');
  if (noListings.length > 0) {
    console.log(`VERDICT: 🟡 ${noListings.length} proxies got past WAF but page had no listings.`);
    console.log('         Sample body from one:');
    console.log('         ' + (noListings[0].bodySample || '').replace(/\n/g, ' '));
    process.exit(0);
  }

  console.log('VERDICT: ⚠️  No working proxies in this batch.');
  console.log('         Options: bigger sample, different sources, or pivot.');
  process.exit(7);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
