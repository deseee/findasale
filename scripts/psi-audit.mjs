#!/usr/bin/env node
/**
 * psi-audit.mjs — on-demand PageSpeed Insights audit (Google's consistent infra).
 *
 * Why: ad-hoc local/sandbox Lighthouse runs are noisy (network variance swings LCP
 * wildly). PSI runs Lighthouse on Google's servers and also returns real-user field
 * data (CrUX), giving a trustworthy single number any time. The API is free
 * (25,000 queries/day, no billing required); it rate-limits past quota, never charges.
 *
 * Usage:
 *   node scripts/psi-audit.mjs https://finda.sale            # mobile (default)
 *   node scripts/psi-audit.mjs https://finda.sale desktop
 *   node scripts/psi-audit.mjs https://finda.sale/pricing mobile
 *
 * API key (optional but recommended to avoid the shared anonymous rate limit):
 *   - Create a free key: https://developers.google.com/speed/docs/insights/v5/get-started
 *     (no billing required). Then set it before running:
 *   PowerShell:  $env:PSI_API_KEY="yourkey"; node scripts/psi-audit.mjs https://finda.sale
 *   bash:        PSI_API_KEY=yourkey node scripts/psi-audit.mjs https://finda.sale
 */

const url = process.argv[2] || 'https://finda.sale';
const strategy = (process.argv[3] || 'mobile').toLowerCase();
const key = process.env.PSI_API_KEY || '';

const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
endpoint.searchParams.set('url', url);
endpoint.searchParams.set('strategy', strategy);
for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) {
  endpoint.searchParams.append('category', c);
}
if (key) endpoint.searchParams.set('key', key);

const pct = (s) => (s == null ? '—' : Math.round(s * 100));

function bar(score) {
  if (score == null) return '';
  const n = Math.round(score * 100);
  return n >= 90 ? '🟢' : n >= 50 ? '🟠' : '🔴';
}

try {
  const res = await fetch(endpoint);
  if (!res.ok) {
    const body = await res.text();
    console.error(`PSI request failed: HTTP ${res.status}`);
    if (res.status === 429) {
      console.error('Rate limited. Set a free PSI_API_KEY (no billing) to avoid the shared anonymous quota.');
    }
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const data = await res.json();
  const lr = data.lighthouseResult;
  const cats = lr.categories;
  const a = lr.audits;

  console.log(`\nPageSpeed Insights — ${data.id}`);
  console.log(`Strategy: ${strategy} | Lighthouse ${lr.lighthouseVersion} | ${key ? 'keyed' : 'anonymous (rate-limited)'}\n`);

  console.log('Lab scores (Google infra):');
  for (const k of ['performance', 'accessibility', 'best-practices', 'seo']) {
    if (cats[k]) console.log(`  ${bar(cats[k].score)} ${k.padEnd(15)} ${pct(cats[k].score)}`);
  }

  console.log('\nLab Core Web Vitals:');
  console.log(`  LCP ${a['largest-contentful-paint']?.displayValue ?? '—'} | TBT ${a['total-blocking-time']?.displayValue ?? '—'} | CLS ${a['cumulative-layout-shift']?.displayValue ?? '—'} | FCP ${a['first-contentful-paint']?.displayValue ?? '—'} | SI ${a['speed-index']?.displayValue ?? '—'}`);

  // Real-user field data (CrUX), when available for this URL/origin
  const le = data.loadingExperience;
  if (le && le.metrics && Object.keys(le.metrics).length) {
    console.log(`\nReal-user field data (CrUX, ${le.overall_category || 'n/a'}):`);
    const m = le.metrics;
    const fmt = (x) => (x ? `${x.percentile} [${x.category}]` : '—');
    console.log(`  LCP ${fmt(m.LARGEST_CONTENTFUL_PAINT_MS)} | INP ${fmt(m.INTERACTION_TO_NEXT_PAINT)} | CLS ${fmt(m.CUMULATIVE_LAYOUT_SHIFT_SCORE)}`);
  } else {
    console.log('\nReal-user field data: not enough CrUX samples for this URL yet.');
  }
  console.log('');
} catch (err) {
  console.error('PSI audit failed:', err.message);
  process.exit(1);
}
