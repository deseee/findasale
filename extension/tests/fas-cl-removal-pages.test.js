// 1.0.82 (2026-10-29): Craigslist removal + Renew All on a large account.
// Live evidence (organizer diagnostic, 1.0.80/1.0.81): item cmtd2rf2i000gguhvqsnwl8wj ("Jefferson Airplane Thirty Seconds Over
// Winterland Vinyl LP Record, 1970s", 72 chars) failed removal with too_many_pages (~164 active postings, 30 "full" pages read
// without filter_active=all), while the reconcile scan, which always sends filter_active=all, read all 347 postings in 7 pages.
// Renew All timed out at 45 s with the button still "renewing. please wait..." (~164 postings due).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-craigslist-removal-frame.js'), 'utf8');

function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  const start = src.lastIndexOf('\n', i) + 1;
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
function constLine(name) {
  const m = new RegExp('const ' + name + ' = [^\\n]*;').exec(src);
  assert.ok(m, name);
  return m[0];
}
const FNS = ['fasFoldTitle', 'crRemTitleFromCell', 'crTitleMatches', 'crPostingIdFromRef', 'crParseTotal', 'crRemParseRows', 'crRemPageUrl',
  'crRemOnScanView', 'crRemCurrentPage', 'crRemFetchPage', 'crRemAllRows', 'crRenewAllWaitMs', 'crRowRenewables', 'crCountRenewables', 'crRenewAllVerdict'];
const CONSTS = ['CR_MIN_SAFE_TITLE_LEN', 'CR_MAX_PAGES', 'CR_PAGE_SIZE', 'CR_RENEWALL_MIN_WAIT_MS', 'CR_RENEWALL_PER_POSTING_MS', 'CR_RENEWALL_MAX_WAIT_MS'];
const body = CONSTS.map(constLine).join('\n') + '\n' + FNS.map(extract).join('\n');

// ---- fake dashboard ----
function row(id, opts) {
  opts = opts || {};
  const status = opts.status || 'active';
  const controls = (opts.controls || ['display', 'delete', 'edit']).map((v) => ({ value: v, textContent: v }));
  return {
    querySelector(sel) {
      if (sel === 'td.status[data-postingid]') return { getAttribute: () => String(id), classList: { contains: (c) => c === status } };
      if (sel === 'td.title a') return { textContent: (opts.title || 'Posting number ' + id) + ' - $' + (opts.price || 5) };
      return null;
    },
    querySelectorAll() { return controls; },
  };
}
function docOf(rows, totalText) {
  const table = { querySelectorAll: () => rows };
  return { querySelector: (s) => (s === 'table.accthp_postings' ? table : null), body: { textContent: totalText || '' } };
}
// A server holding `n` postings (ids 7000000001...), 50 per page, in the all-statuses view.
function server(n, opts) {
  opts = opts || {};
  const all = [];
  for (let i = 1; i <= n; i++) all.push(row(7000000000 + i, (opts.rowOpts && opts.rowOpts(i)) || {}));
  const totalText = opts.noTotal ? '' : 'showing 1 - 50 of ' + (opts.claimTotal || n) + ' total';
  return (url) => {
    const u = new URL(url);
    let page = parseInt(u.searchParams.get('filter_page') || '1', 10);
    if (opts.ignorePaging || u.searchParams.get('filter_active') !== 'all') page = 1;   // the pre-1.0.82 failure mode
    const slice = all.slice((page - 1) * 50, page * 50);
    return docOf(slice, totalText);
  };
}
function harness(serve, opts) {
  opts = opts || {};
  const fetches = [];
  const sleeps = [];
  let fail429 = opts.fail429 || 0;
  const deps = {
    fetch: async (url) => {
      fetches.push(url);
      if (fail429 > 0 && /filter_page=2&/.test(url)) { fail429--; return { ok: false, status: 429, text: async () => '' }; }
      return { ok: true, status: 200, text: async () => url };
    },
    DOMParser: function () { this.parseFromString = (t) => serve(t); },
    sleep: async (ms) => { sleeps.push(ms); },
    location: { search: opts.search || '' },
    document: opts.document || docOf([], ''),
  };
  const fns = new Function('deps', 'const { fetch, DOMParser, sleep, location, document } = deps;\n' + body + '\nreturn { ' + FNS.join(', ') + ' };')(deps);
  return { fns, fetches, sleeps };
}

test('every page read uses the all-statuses view (filter_active=all), so filter_page is honoured', () => {
  const h = harness(server(10));
  assert.strictEqual(h.fns.crRemPageUrl(3), 'https://accounts.craigslist.org/login/home?filter_page=3&show_tab=postings&filter_active=all');
});

test('347 postings (live account size) read completely in 7 pages, no too_many_pages', async () => {
  const h = harness(server(347));
  const r = await h.fns.crRemAllRows();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rows.length, 347);
  assert.strictEqual(r.pages, 7);
  assert.strictEqual(r.total, 347);
  assert.ok(h.fetches.every((u) => /filter_active=all/.test(u)));
});

test('several hundred to thousands of postings: 1,620 postings (33 pages) are read, past the old 30-page cap', async () => {
  const h = harness(server(1620));
  const r = await h.fns.crRemAllRows();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rows.length, 1620);
  assert.strictEqual(r.pages, 33);
});

test('rate-aware: every fetch after the first is paced, with a longer pause every 10 pages', async () => {
  const h = harness(server(1620));
  await h.fns.crRemAllRows();
  assert.ok(h.sleeps.length >= 32);
  assert.ok(h.sleeps.every((ms) => ms >= 400));
  assert.ok(h.sleeps.filter((ms) => ms >= 2500).length >= 3);
});

test('HTTP 429 on a page waits and retries the same page instead of failing the read', async () => {
  const h = harness(server(120), { fail429: 1 });
  const r = await h.fns.crRemAllRows();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rows.length, 120);
  assert.ok(h.sleeps.includes(5000));
});

test('Craigslist ignoring filter_page (the same 50 rows every page) is refused, never treated as a complete read', async () => {
  const h = harness(server(347, { ignorePaging: true }));
  const r = await h.fns.crRemAllRows();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'pagination_stalled');
  assert.ok(h.fetches.length <= 2, 'stops at the first repeated page, does not hammer 30+ pages');
  const h2 = harness(server(347, { ignorePaging: true, noTotal: true }));
  const r2 = await h2.fns.crRemAllRows();
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, 'pagination_stalled');
});

test('a read that ends short of the dashboard total is refused (incomplete_read), so nothing is deleted on a partial picture', async () => {
  const h = harness(server(310, { claimTotal: 347 }));
  const r = await h.fns.crRemAllRows();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'incomplete_read:310/347');
});

test('id-first: with a saved posting id the read stops at the page that holds it', async () => {
  const h = harness(server(347));
  const r = await h.fns.crRemAllRows({ stopAtId: '7000000123' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.stoppedAtId, true);
  assert.strictEqual(r.pages, 3);
  assert.ok(r.rows.some((x) => x.postingId === '7000000123' && x.page === 3));
});

test('a saved id that is on no page still reads everything (then the title rule applies)', async () => {
  const h = harness(server(347));
  const r = await h.fns.crRemAllRows({ stopAtId: '7999999999' });
  assert.strictEqual(r.ok, true);
  assert.ok(!r.stoppedAtId);
  assert.strictEqual(r.rows.length, 347);
});

test('the frame page is only reused when it is the all-statuses view (page numbers must match the scan)', () => {
  assert.strictEqual(harness(server(1), { search: '' }).fns.crRemCurrentPage(), 0);
  assert.strictEqual(harness(server(1), { search: '?filter_page=3&show_tab=postings' }).fns.crRemCurrentPage(), 0);
  assert.strictEqual(harness(server(1), { search: '?filter_page=3&show_tab=postings&filter_active=all' }).fns.crRemCurrentPage(), 3);
  assert.strictEqual(harness(server(1), { search: '?show_tab=postings&filter_active=all' }).fns.crRemCurrentPage(), 1);
});

test('saved Craigslist reference: posting URL or bare id -> posting id', () => {
  const f = harness(server(1)).fns.crPostingIdFromRef;
  assert.strictEqual(f('https://kalamazoo.craigslist.org/clo/d/paw-paw-jefferson-airplane/7986095940.html'), '7986095940');
  assert.strictEqual(f('7986095940'), '7986095940');
  assert.strictEqual(f('https://accounts.craigslist.org/manage/7986095940'), '7986095940');
  assert.strictEqual(f('https://www.facebook.com/marketplace/you/selling'), '');
  assert.strictEqual(f(''), '');
});

test('title match tolerates Craigslist cutting a 72-character title at 70, but stays strict otherwise', () => {
  const f = harness(server(1)).fns;
  const wanted = f.fasFoldTitle('Jefferson Airplane Thirty Seconds Over Winterland Vinyl LP Record, 1970s');
  const cut = f.crRemTitleFromCell('Jefferson Airplane Thirty Seconds Over Winterland Vinyl LP Record, 197 - $25');
  assert.strictEqual(f.crTitleMatches({ title: cut, rawTitle: cut }, wanted), true);
  const exact = f.crRemTitleFromCell('Seawind Window of a Child Vinyl LP Record - $8');
  assert.strictEqual(f.crTitleMatches({ title: exact, rawTitle: exact }, f.fasFoldTitle('Seawind Window of a Child Vinyl LP Record')), true);
  const shortPrefix = f.crRemTitleFromCell('Jefferson Airplane Vinyl - $8');
  assert.strictEqual(f.crTitleMatches({ title: shortPrefix, rawTitle: shortPrefix }, wanted), false, 'a short prefix is not enough');
  const other = f.crRemTitleFromCell('Jefferson Airplane Thirty Seconds Over Winterland Vinyl LP Record, 2nd - $9');
  assert.strictEqual(f.crTitleMatches({ title: other, rawTitle: other }, wanted), false);
});

test('removal keeps the exactly-one rule and passes the saved id to the read; the delete is clicked once', () => {
  assert.ok(/const all = await crRemAllRows\(\{ stopAtId: savedId \}\);/.test(src));
  assert.ok(/if \(ids\.length !== 1 && !\(ids\.length > 1 && item\.deleteAllMatches === true\)\)/.test(src));
  assert.ok(/matches = all\.rows\.filter\(\(r\) => r\.active && crTitleMatches\(r, wanted\)\);/.test(src));
  assert.strictEqual((src.match(/submit\[0\]\.click\(\)/g) || []).length, 1);
  assert.ok(/!\(target\.viaId \|\| crTitleMatches\(row, wanted\)\)/.test(src), 'live row re-check before delete');
});

// ---- Renew All ----
test('Renew All wait scales with the number of postings, 45 s minimum, 6 minutes maximum', () => {
  const w = harness(server(1)).fns.crRenewAllWaitMs;
  assert.strictEqual(w(164), 45000 + 164 * 1500);   // 4 min 51 s for the live account
  assert.strictEqual(w(5), 52500);
  assert.strictEqual(w(0), 45000 + 100 * 1500);     // unknown count: assume 100
  assert.strictEqual(w(1000), 360000);
  assert.ok(w(164) < 10 * 60 * 1000, 'stays inside background FAS_REMOVAL_MAX_MS (10 min)');
});

test('renewable count reads every page and counts only rows offering "renew"', async () => {
  const h = harness(server(164, { rowOpts: (i) => ({ controls: i % 2 ? ['display', 'delete', 'edit', 'renew'] : ['display', 'delete', 'edit'] }) }));
  const c = await h.fns.crCountRenewables();
  assert.deepStrictEqual(c, { renewable: 82, rows: 164, total: 164 });
  const bad = harness(() => { throw new Error('boom'); });
  assert.strictEqual(await bad.fns.crCountRenewables(), null);
});

test('Renew All verdict: success only when the result is visible; never assumed', () => {
  const v = harness(server(1)).fns.crRenewAllVerdict;
  const B = (n) => ({ renewable: n, rows: 164 });
  assert.deepStrictEqual(v({ reverted: true, before: B(164), after: B(0) }), { ok: true, verified: 'renew_buttons_cleared' });
  assert.deepStrictEqual(v({ reverted: true, before: null, after: null }), { ok: true, verified: 'button_returned' });
  assert.deepStrictEqual(v({ reverted: true, before: B(164), after: B(164) }), { ok: false, reason: 'renew_all_finished_still_renewable:164/164' });
  // Button still "renewing, please wait" at the end of the wait, but the fresh read shows everything renewed.
  assert.deepStrictEqual(v({ reverted: false, before: B(164), after: B(0) }), { ok: true, verified: 'renew_buttons_cleared' });
  assert.deepStrictEqual(v({ reverted: false, before: B(164), after: B(40) }), { ok: false, reason: 'renew_all_timed_out_partial:164/40' });
  assert.deepStrictEqual(v({ reverted: false, before: B(164), after: null }), { ok: false, reason: 'renew_all_timed_out_unverified' });
  assert.deepStrictEqual(v({ reverted: false, before: B(0), after: B(0) }), { ok: false, reason: 'renew_all_timed_out_unverified' });
  assert.deepStrictEqual(v({ reverted: false, formGone: true, before: B(10), after: B(3) }), { ok: false, reason: 'renew_all_form_disappeared_unverified' });
});

test('Renew All is clicked exactly once and waits with the scaled timeout', () => {
  const fn = src.slice(src.indexOf('async function runCraigslistRenewAll()'), src.indexOf('async function maybeRunCraigslistRenewAll()'));
  assert.strictEqual((fn.match(/\.btn\.click\(\)/g) || []).length, 1);
  assert.ok(/const completionDeadline = Date\.now\(\) \+ waitMs;/.test(fn));
  assert.ok(/const after = await crCountRenewables\(\);/.test(fn));
  assert.ok(!/CR_RENEWALL_COMPLETION_TIMEOUT_MS/.test(src));
});
