// 1.0.91 (2026-11-08): four fixes from the live runs of 2026-11-08. DOM and chrome.* are STUBBED; nothing here ran against a live
// marketplace.
//   1. Mercari: a listing that is gone ("410 - Not Available | Mercari", m36344835016 had sold) is reported as already removed,
//      never "does not exactly match ... please remove it yourself".
//   2. Craigslist Renew All: after the page reloads, the result is read from the postings' dates ("renewed DD Mon YYYY").
//   3. Poshmark category: the commit check reads the control's VALUE, not its whole option panel; a label maker keeps its real
//      path Home > Office > Labels & Label Makers.
//   4. Craigslist price edit: "1950-C $50 *Minneapolis* Federal Reserve Star Note" matches its dashboard row.
// Run: node --test extension/tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { atLeast } = require('./_version');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const MERC = read('fas-mercari.js');
const CLR = read('fas-craigslist-removal-frame.js');
const POSH = read('fas-poshmark.js');
const BRIDGE = read('fas-poshmark-bridge.js');
const ENG = read('fas-edit-engine.js');
const C = require('../fas-edit-core.js');

function extract(src, name) {
  let i = src.indexOf('function ' + name + '(');
  let isConst = false;
  if (i < 0) { i = src.indexOf('const ' + name + ' = '); isConst = true; }
  assert.ok(i >= 0, 'not found: ' + name);
  if (isConst) {
    const line = src.slice(i, src.indexOf('\n', i));
    if (!/[[{]\s*$/.test(line.replace(/\/\/.*$/, '')) && /;/.test(line)) return line.slice(0, line.indexOf(';') + 1);
  }
  const open = isConst ? Math.min(...['[', '{'].map((c) => { const k = src.indexOf(c, i); return k < 0 ? Infinity : k; })) : src.indexOf('{', src.indexOf(')', i));
  const close = src[open] === '[' ? ']' : '}';
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === src[open]) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) return (src.slice(Math.max(0, i - 6), i) === 'async ' ? 'async ' : '') + src.slice(i, k + 1) + (isConst ? ';' : ''); }
  }
  throw new Error('unterminated ' + name);
}
function build(src, names, deps, ret, pre) {
  const body = names.map((n) => extract(src, n)).join('\n');
  const keys = Object.keys(deps || {});
  return new Function(...keys, (pre || '') + body + '\nreturn { ' + ret.join(', ') + ' };')(...keys.map((k) => deps[k]));
}

test('manifest is at least 1.0.91', () => {
  assert.ok(atLeast(JSON.parse(read('manifest.json')).version, '1.0.91'));
});

// ---------------------------------------------------------------------------------------------------- 1. Mercari gone listing
const GONE_ID = 'm36344835016';
const NOT_AVAILABLE_TITLE = '410 \u2014 Not Available | Mercari';
function mercHarness(opts) {
  opts = opts || {};
  const sent = [];
  const overlays = [];
  const warns = [];
  const store = {};
  const fetchCalls = [];
  const deps = {
    fetch: async (url) => { fetchCalls.push(url); return opts.fetchResp ? opts.fetchResp() : { status: 200, text: async () => '' }; },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    chrome: { runtime: { sendMessage: (m) => { sent.push(m); } } },
    overlay: (h) => overlays.push(h), overlayWarn: (h) => warns.push(h), button: () => '', escapeHtml: (s) => String(s),
    console: { log: () => {} },
    document: opts.doc || { title: '', getElementById: () => null },
  };
  const pre = "const MERCARI_REMOVAL_CONTINUE_URL = 'https://www.mercari.com/mypage/listings/'; const MERC_REM_EDIT_MARKER_KEY = 'fasMercDeleteEditMarker'; const MERC_REM_EDIT_MARKER_TTL_MS = 120000;\n";
  const names = ['mercRemovalListingId', 'mercParseNextData', 'mercClassifyItemLookup', 'mercLookupItemById', 'mercRemReadMarker', 'mercRemWriteMarker',
    'mercRemClearMarker', 'mercRemReportResult', 'mercRemFailureCopy', 'mercRemReportGone', 'mercDetailPageGoneVerdict'];
  const fns = build(MERC, names, deps, names, pre);
  return { fns, sent, overlays, warns, store, fetchCalls };
}
const mercItem = (over) => Object.assign({ id: 'cm1', title: 'Vintage Pyrex Bowl', reason: 'SOLD_ELSEWHERE', listingRefs: { MERCARI: GONE_ID } }, over || {});

test('Mercari classifier: the "Not Available" page with a 404/410 is gone; a bare 410 is still not trusted', () => {
  const h = mercHarness();
  assert.strictEqual(h.fns.mercClassifyItemLookup(410, null, GONE_ID, NOT_AVAILABLE_TITLE).kind, 'removed');
  assert.strictEqual(h.fns.mercClassifyItemLookup(404, null, GONE_ID, 'Not Available | Mercari').kind, 'removed');
  assert.strictEqual(h.fns.mercClassifyItemLookup(410, null, GONE_ID).kind, 'unknown');
  assert.strictEqual(h.fns.mercClassifyItemLookup(200, null, GONE_ID, 'Vintage Pyrex Bowl | Mercari').kind, 'unknown');
  // statusCode from the page's own __NEXT_DATA__ counts as the HTTP status
  assert.strictEqual(h.fns.mercClassifyItemLookup(200, { props: { pageProps: { statusCode: 410 } } }, GONE_ID, NOT_AVAILABLE_TITLE).kind, 'removed');
});

test('Mercari id lookup reads the <title> so the id-first path sees the gone page too', async () => {
  const html = '<html><head><title>' + NOT_AVAILABLE_TITLE + '</title></head><body></body></html>';
  const h = mercHarness({ fetchResp: () => ({ status: 410, text: async () => html }) });
  const look = await h.fns.mercLookupItemById(GONE_ID);
  assert.strictEqual(look.pageTitle, NOT_AVAILABLE_TITLE);
  assert.strictEqual(h.fns.mercClassifyItemLookup(look.status, look.nextData, GONE_ID, look.pageTitle).kind, 'removed');
});

test('Mercari detail page that is gone: reported as already removed (no "remove it yourself" warning, no fetch needed)', async () => {
  const doc = { title: NOT_AVAILABLE_TITLE, getElementById: () => null };
  const h = mercHarness({ doc });
  const v = await h.fns.mercDetailPageGoneVerdict(mercItem(), GONE_ID, null, doc);
  assert.strictEqual(v.kind, 'removed');
  assert.strictEqual(h.fetchCalls.length, 0);
  h.fns.mercRemReportGone(mercItem(), v);
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.platform, m.itemId]), [['crossPlatformRemovalDeleted', 'MERCARI', 'cm1']]);
  assert.ok(/already removed on Mercari/.test(h.sent[0].note));
  assert.strictEqual(h.warns.length, 0);
  assert.ok(/already removed on Mercari/.test(h.overlays[0]));
});

test('Mercari detail page: the page is unreadable -> the id lookup decides; sold -> the permanent sold skip; verify runs never delete', async () => {
  const ss = {};
  ss['ItemDetail:' + GONE_ID] = { id: GONE_ID, status: 'trading', seller: { __ref: 'PrivateUser:7' }, buyer: { __ref: 'User:9' }, me: { userId: 7 } };
  const nd = { props: { pageProps: { statusCode: 200, gqlErrorCode: null, serverState: ss } } };
  const html = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(nd) + '</script>';
  const h = mercHarness({ fetchResp: () => ({ status: 200, text: async () => html }) });
  const v = await h.fns.mercDetailPageGoneVerdict(mercItem(), GONE_ID, null, { title: 'Mercari', getElementById: () => null });
  assert.strictEqual(v.kind, 'sold');
  assert.deepStrictEqual(h.fetchCalls, ['/us/item/' + GONE_ID + '/']);
  h.fns.mercRemReportGone(mercItem(), v);
  assert.strictEqual(h.sent[0].type, 'crossPlatformRemovalSkipped');
  assert.strictEqual(h.sent[0].reason, 'already_sold_on_mercari_archive_only');

  const h2 = mercHarness();
  h2.fns.mercRemReportGone(mercItem({ reason: 'RESYNC_VERIFY' }), { kind: 'removed' });
  assert.deepStrictEqual([h2.sent[0].type, h2.sent[0].reason, h2.sent[0].verifyOnly], ['crossPlatformRemovalSkipped', 'listing_not_found', true]);
});

test('Mercari detail page that is NOT this item\'s listing is never reported gone (no lookup)', async () => {
  const doc = { title: NOT_AVAILABLE_TITLE, getElementById: () => null };
  const h = mercHarness({ doc });
  assert.strictEqual(await h.fns.mercDetailPageGoneVerdict(mercItem({ listingRefs: {} }), 'm99999999999', null, doc), null);
  assert.strictEqual(await h.fns.mercDetailPageGoneVerdict(mercItem(), 'm99999999999', null, doc), null);
  assert.strictEqual(h.fetchCalls.length, 0);
  // the id the listings-page scan picked counts as this item's listing
  const v = await h.fns.mercDetailPageGoneVerdict(mercItem({ listingRefs: {} }), 'm99999999999', 'm99999999999', doc);
  assert.strictEqual(v.kind, 'removed');
});

test('Mercari wiring: the gone check runs before the "does not exactly match" warning on a detail page', () => {
  const run = extract(MERC, 'runMercariRemovalQueue');
  const gone = run.indexOf('await mercDetailPageGoneVerdict(item, hereItemId, pickedId)');
  const warn = run.indexOf('does not exactly match');
  assert.ok(gone > 0 && warn > gone);
  assert.ok(/if \(gone\) \{ mercRemReportGone\(item, gone\); return; \}/.test(run));
  assert.ok(/if \(verdict\.kind === 'removed'\) \{\s*mercRemReportGone\(item, verdict\);/.test(extract(MERC, 'mercRemoveByListingId')));
});

// ---------------------------------------------------------------------------------------------------- 2. Craigslist Renew All
const CL_NAMES = ['CR_MONTHS', 'crParseDayMonYear', 'crLastRefreshFromDates', 'crDayIndex', 'crFmtDay', 'crRenewDatesSummary', 'crRenewAllDatesVerdict'];
function clPure() { return build(CLR, CL_NAMES, {}, CL_NAMES.slice(1)); }
const NOW = new Date(2026, 10, 8, 10, 30); // 8 Nov 2026, local time

test('Craigslist dates: "renewed DD Mon YYYY" is read; the posted date is used when a posting was never renewed', () => {
  const c = clPure();
  const r = c.crLastRefreshFromDates('posted 02 Oct 2026 14:10 renewed 08 Nov 2026');
  assert.strictEqual(r.renewed, true);
  assert.strictEqual(c.crFmtDay(r.date), '8 Nov 2026');
  const p = c.crLastRefreshFromDates('02 Oct 2026 14:10');
  assert.strictEqual(p.renewed, false);
  assert.strictEqual(c.crFmtDay(p.date), '2 Oct 2026');
  assert.strictEqual(c.crFmtDay(c.crLastRefreshFromDates('renewed: Nov 7, 2026').date), '7 Nov 2026');
  assert.strictEqual(c.crLastRefreshFromDates('no date here').date, null);
});

test('Craigslist Renew All after a reload: success with the count of postings renewed today', () => {
  const c = clPure();
  const sum = c.crRenewDatesSummary(['posted 01 Oct 2026 renewed 08 Nov 2026', 'posted 03 Oct 2026 renewed 08 Nov 2026', 'posted 07 Nov 2026 09:00'], NOW);
  assert.deepStrictEqual([sum.active, sum.renewedToday, sum.recent, sum.stale], [3, 2, 3, 0]);
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(sum), { ok: true, verified: 'renewed_dates_today', renewedCount: 2 });
});

test('Craigslist Renew All after a reload: nothing due when every posting was renewed in the last 48 hours', () => {
  const c = clPure();
  const sum = c.crRenewDatesSummary(['renewed 07 Nov 2026', 'renewed 06 Nov 2026'], NOW);
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(sum), { ok: true, verified: 'nothing_due_recently_renewed', renewedOn: '7 Nov 2026' });
});

test('Craigslist Renew All after a reload: old dates and none today is a verified failure; unreadable stays unverified', () => {
  const c = clPure();
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(c.crRenewDatesSummary(['renewed 01 Nov 2026', 'renewed 07 Nov 2026'], NOW)), { ok: false, reason: 'reloaded_not_renewed:1' });
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(null), { ok: false, reason: 'reloaded_after_click_unverified' });
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(c.crRenewDatesSummary(['?', '-'], NOW)), { ok: false, reason: 'reloaded_after_click_unverified' });
  assert.deepStrictEqual(c.crRenewAllDatesVerdict(c.crRenewDatesSummary([], NOW)), { ok: false, reason: 'reloaded_after_click_unverified' });
});

function fakeRow(id, active, dates) {
  return { postingId: id, active, tr: { querySelector: (sel) => (sel === 'td.dates' && dates != null ? { textContent: dates } : null) } };
}
function clReader(pages) {
  const deps = {
    sleep: async () => {},
    crRemFetchPage: async (n) => { const p = pages[n - 1]; if (!p) throw new Error('page_fetch_404'); return { doc: { body: { innerText: p.total ? 'of ' + p.total + ' total' : '' } }, rows: p.rows }; },
    crParseTotal: (t) => { const m = /of (\d+) total/.exec(t); return m ? +m[1] : null; },
  };
  return build(CLR, ['crReadActiveRenewDates'], deps, ['crReadActiveRenewDates'], 'const CR_MAX_PAGES = 80; const CR_PAGE_SIZE = 50;\n').crReadActiveRenewDates;
}

test('Craigslist dashboard read: only active rows, every page; a missing dates cell or a failed page means unreadable', async () => {
  const cells = await clReader([{ total: 3, rows: [fakeRow('7001', true, 'renewed 08 Nov 2026'), fakeRow('7002', false, 'renewed 01 Jan 2026'), fakeRow('7003', true, 'posted 07 Nov 2026')] }])();
  assert.deepStrictEqual(cells, ['renewed 08 Nov 2026', 'posted 07 Nov 2026']);
  assert.strictEqual(await clReader([{ rows: [fakeRow('7001', true, null)] }])(), null);
  const fifty = Array.from({ length: 50 }, (_, i) => fakeRow(String(8000 + i), true, 'renewed 08 Nov 2026'));
  assert.strictEqual(await clReader([{ rows: fifty }])(), null); // page 2 failed to load
});

test('Craigslist wiring: the resumed run reads the dates (never clicks), the new reason has owner text, no em dash', () => {
  const resumed = extract(CLR, 'runCraigslistRenewAllResumed');
  assert.ok(/crReadActiveRenewDates\(\)/.test(resumed) && /crRenewAllDatesVerdict\(sum\)/.test(resumed) && /return verdict;/.test(resumed));
  assert.ok(!/\.click\(\)/.test(resumed));
  assert.ok(!/return \{ ok: false, reason: 'reloaded_after_click_unverified' \};/.test(resumed), 'no unconditional unverified result');
  const reasonText = build(CLR, ['crReasonText'], {}, ['crReasonText']).crReasonText;
  assert.ok(/none renewed today/.test(reasonText('reloaded_not_renewed:3').why));
  assert.ok(/3 active posting/.test(reasonText('reloaded_not_renewed:3').why));
  const main = extract(CLR, 'runCraigslistRenewAll');
  assert.ok(/_unverified\$\/\.test/.test(main) && /crReadActiveRenewDates\(\)/.test(main));
  for (const fn of ['runCraigslistRenewAllResumed', 'crRenewAllDatesVerdict', 'crReadActiveRenewDates']) assert.ok(extract(CLR, fn).indexOf('\u2014') === -1);
});

// ---------------------------------------------------------------------------------------------------- 3. Poshmark category
// Tiny DOM stand-in: enough for cloneNode / querySelectorAll / textContent.
function el(tag, attrs, children) {
  const node = { tagName: tag.toUpperCase(), attrs: attrs || {}, children: [], parentNode: null };
  (children || []).forEach((c) => { const ch = typeof c === 'string' ? { text: c, parentNode: node } : c; ch.parentNode = node; node.children.push(ch); });
  node.getAttribute = (k) => (k in node.attrs ? node.attrs[k] : null);
  Object.defineProperty(node, 'textContent', { get() { return node.children.map((c) => (c.text != null ? c.text : c.textContent)).join(' '); } });
  node.removeChild = (c) => { node.children = node.children.filter((x) => x !== c); };
  node.cloneNode = () => {
    const copy = el(tag, Object.assign({}, node.attrs), node.children.map((c) => (c.text != null ? c.text : c.cloneNode(true))));
    return copy;
  };
  const matchOne = (n, sel) => {
    sel = sel.trim();
    let m = /^\[([\w-]+)(\*?)="([^"]*)"\]$/.exec(sel);
    if (m) { const v = n.getAttribute(m[1]); return v != null && (m[2] ? v.indexOf(m[3]) !== -1 : v === m[3]); }
    return n.tagName === sel.toUpperCase();
  };
  node.querySelectorAll = (sel) => {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { if (c.text == null) { if (sel.split(',').some((s) => matchOne(c, s))) out.push(c); walk(c); } });
    walk(node);
    return out;
  };
  return node;
}
function poshPure() {
  return build(POSH, ['norm', 'poshmarkControlValueText', 'poshmarkLeafShownIn'], {}, ['poshmarkControlValueText', 'poshmarkLeafShownIn']);
}

test('Poshmark: the Category value is read without its option panel (live: "home office all categories home accents art ...")', () => {
  const p = poshPure();
  const panelRows = ['All Categories', 'Home', 'Accents', 'Art', 'Bath', 'Bedding', 'Design', 'Dining', 'Games', 'Holiday'].map((t) => el('li', {}, [t]));
  const control = el('div', { 'data-test': 'dropdown' }, [el('div', {}, ['Home']), el('div', {}, ['Office']), el('div', { 'data-test': 'dropdown-content' }, [el('ul', {}, panelRows)])]);
  assert.ok(/all categories/.test(String(control.textContent).toLowerCase()));
  assert.strictEqual(p.poshmarkControlValueText(control), 'home office');
  assert.strictEqual(p.poshmarkControlValueText(null), '');
});

test('Poshmark: the leaf is confirmed from the Category value, the Subcategory value or the catalog state; never from the panel', () => {
  const p = poshPure();
  const leaf = 'Labels & Label Makers';
  assert.strictEqual(p.poshmarkLeafShownIn(leaf, [{ name: 'category-control', value: 'home office labels & label makers' }]), 'category-control');
  assert.strictEqual(p.poshmarkLeafShownIn(leaf, [{ name: 'category-control', value: 'home office' }, { name: 'subcategory-control', value: 'labels & label makers' }]), 'subcategory-control');
  assert.strictEqual(p.poshmarkLeafShownIn(leaf, [{ name: 'category-control', value: 'home office' }, { name: 'subcategory-control', value: '' }, { name: 'catalog-state', values: ['Home', 'Office', 'Labels & Label Makers'] }]), 'catalog-state');
  assert.strictEqual(p.poshmarkLeafShownIn(leaf, [{ name: 'category-control', value: 'home office' }, { name: 'catalog-state', values: [] }]), null);
});

test('Poshmark wiring: the mapped path picks the sub-category in the Subcategory dropdown when only department + category show', () => {
  const fn = extract(POSH, 'pickMappedPoshmarkCategory');
  assert.ok(fn.indexOf('norm(opener.textContent)') === -1, 'the whole control text (with its panel) is no longer the check');
  assert.ok(/if \(!where && parts\.length === 3 && await pickPoshmarkSubcategoryLeaf\(leaf\)\)/.test(fn));
  const sub = extract(POSH, 'pickPoshmarkSubcategoryLeaf');
  assert.ok(/openerByLabel\('Subcategory'\)/.test(sub) && /waitForPoshmarkExactRow\(leaf, 1500\)/.test(sub) && /closeDropdown/.test(sub));
  assert.ok(/selectedNames: catalogSelectedNames\(vm\)/.test(BRIDGE));
});

test('Poshmark bridge: catalog selected names are strings from selected* data only', () => {
  const names = build(BRIDGE, ['catalogSelectedNames'], {}, ['catalogSelectedNames']).catalogSelectedNames;
  const vm = { $data: { selectedDepartment: null, other: 'x' }, selectedDepartment: { display: 'Home' }, selectedGroup: { name: 'Office' }, lastSelectedCategoryData: { display: 'Labels & Label Makers', id: 'abc' } };
  assert.deepStrictEqual(names(vm), ['Home', 'Office', 'Labels & Label Makers']);
  assert.deepStrictEqual(names(null), []);
});

test('Poshmark: the label maker path in the taxonomy exists (Home > Office > Labels & Label Makers)', () => {
  const tree = fs.readFileSync(path.join(root, '..', 'packages', 'backend', 'src', 'config', 'poshmarkCategoryTree.ts'), 'utf8');
  assert.ok(tree.indexOf('Home-Office-Labels_&_Label_Makers|Home-Office|Labels & Label Makers') !== -1);
  const map = fs.readFileSync(path.join(root, '..', 'packages', 'backend', 'src', 'config', 'poshmarkCategoryMap.ts'), 'utf8');
  assert.ok(/const LABELS = L\('Home', 'Office', 'Labels & Label Makers'\);/.test(map));
});

// ---------------------------------------------------------------------------------------------------- 4. Craigslist price-edit title
test('Craigslist title with a dollar amount and asterisks matches its dashboard row "<title> - $price"', () => {
  const wanted = '1950-C $50 *Minneapolis* Federal Reserve Star Note';
  assert.ok(C.titleEquals(wanted + ' - $85', wanted));
  assert.ok(C.titleEquals(wanted + ' - $1,250.00', wanted));
  assert.ok(C.titleEquals('1950-C $50 Minneapolis Federal Reserve Star Note - $85', wanted)); // asterisks dropped on the dashboard
  // still exact on the words
  assert.ok(!C.titleEquals('1950-C $5 *Minneapolis* Federal Reserve Star Note - $85', wanted));
  assert.ok(!C.titleEquals('1950-C $50 *Minneapolis* Federal Reserve Star Note Lot - $85', wanted));
  assert.ok(!C.titleEquals('1950-C - $85', wanted));
});

test('Craigslist matcher in the edit engine (lookup + page scan) finds posting 7963221699 and its cut rule keeps "$" titles', () => {
  const clTitleMatches = build(ENG, ['clTitleMatches'], { C }, ['clTitleMatches']).clTitleMatches;
  const wanted = '1950-C $50 *Minneapolis* Federal Reserve Star Note';
  assert.ok(clTitleMatches(wanted + ' - $85', wanted, false));
  assert.ok(clTitleMatches(wanted + ' - $85', wanted, true));
  const long = '1950-C $50 *Minneapolis* Federal Reserve Star Note, Crisp Uncirculated, Low Serial, With Sleeve';
  assert.ok(long.length > 70);
  assert.ok(clTitleMatches(long.slice(0, 70).trim() + ' - $85', long, false));
  assert.ok(!clTitleMatches(long.slice(0, 70).trim() + ' - $85', long, true));
  // classifyLookup with the engine's matcher returns the one active row
  const CLG = require('../fas-cl-guard.js');
  const rows = [
    { postingId: '7963221699', status: 'active', titleRaw: wanted + ' - $85' },
    { postingId: '7963221700', status: 'active', titleRaw: '1950-C $5 *Minneapolis* Federal Reserve Star Note - $20' },
  ];
  const c = CLG.classifyLookup(rows, { title: wanted, matcher: clTitleMatches });
  assert.strictEqual(c.kind, 'found');
  assert.strictEqual(c.row.postingId, '7963221699');
});

test('changed files: no NUL bytes and no em dash on any line marked 1.0.91', () => {
  for (const f of ['fas-mercari.js', 'fas-craigslist-removal-frame.js', 'fas-poshmark.js', 'fas-poshmark-bridge.js', 'fas-edit-core.js', 'fas-edit-engine.js', 'manifest.json']) {
    const s = read(f);
    assert.ok(s.indexOf('\u0000') === -1, f + ' has a NUL byte');
    s.split('\n').filter((l) => /1\.0\.91/.test(l)).forEach((l) => assert.ok(l.indexOf('\u2014') === -1, f + ': ' + l.slice(0, 80)));
  }
});
