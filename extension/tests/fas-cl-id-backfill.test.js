// Node tests for the 2026-11-01 Craigslist posting-id backfill: during a complete reconcile scan, an item that has NO saved posting id and
// exactly ONE active posting with its title gets that posting reported to POST /extension/items/:id/remote-listing-id (which only fills an
// empty id on the latest POSTED row). Ambiguous titles, postings already saved on another item and refused pairs report nothing.
// DOM-free; nothing here talks to Craigslist. Run: node --test extension/tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const Core = require('../fas-edit-core.js');

const LONG = 'Glenn Robinson 1995 SkyBox Premium rookie basketball card Milwaukee Bucks near mint';   // > 70 chars, Craigslist truncates it
const row = (postingId, titleRaw, status, href) => ({ postingId, titleRaw, status: status || 'active', href: href === undefined ? 'https://kalamazoo.craigslist.org/clt/d/paw-paw-x/' + postingId + '.html' : href });

test('public posting URL: only https://<site>.craigslist.org/.../<id>.html with the same id', () => {
  assert.strictEqual(Core.clPublicPostingUrl('https://kalamazoo.craigslist.org/msg/d/paw-paw-tuner/7987135515.html', '7987135515'), 'https://kalamazoo.craigslist.org/msg/d/paw-paw-tuner/7987135515.html');
  assert.strictEqual(Core.clPublicPostingUrl('https://kalamazoo.craigslist.org/msg/d/paw-paw-tuner/7987135515.html', '7987135516'), '', 'different id');
  assert.strictEqual(Core.clPublicPostingUrl('https://accounts.craigslist.org/manage/7987135515.html', '7987135515'), '', 'account/manage link');
  assert.strictEqual(Core.clPublicPostingUrl('https://post.craigslist.org/manage/7987135515', '7987135515'), '');
  assert.strictEqual(Core.clPublicPostingUrl('https://evil.example.com/7987135515.html', '7987135515'), '');
  assert.strictEqual(Core.clPublicPostingUrl('http://kalamazoo.craigslist.org/a/7987135515.html', '7987135515'), '', 'https only');
  assert.strictEqual(Core.clPublicPostingUrl('', '7987135515'), '');
});

test('decide: exactly one active match (truncation-aware) -> reported with its public URL', () => {
  const items = [{ id: 'a', title: LONG, remoteId: null, idKnown: true }];
  const rows = [row('7986006834', LONG.slice(0, 70) + ' - $4 (Paw Paw)'), row('7900000001', LONG, 'deleted')];
  const d = Core.clBackfillDecide(items, rows, {}, Date.now());
  assert.deepStrictEqual(d.report, [{ id: 'a', title: LONG, postingId: '7986006834', postingUrl: 'https://kalamazoo.craigslist.org/clt/d/paw-paw-x/7986006834.html' }]);
});
test('decide: two active postings with the title -> nothing for that item', () => {
  const items = [{ id: 'a', title: 'Brass table lamp with shade', remoteId: null, idKnown: true }];
  const rows = [row('7986006834', 'Brass table lamp with shade - $20'), row('7986006835', 'Brass table lamp with shade - $25')];
  const d = Core.clBackfillDecide(items, rows, {}, Date.now());
  assert.deepStrictEqual(d.report, []); assert.strictEqual(d.skipped.ambiguous, 1);
});
test('decide: never for an item that has an id, or whose id status is unknown (older backend), or with no match', () => {
  const rows = [row('7986006834', 'Brass table lamp with shade - $20')];
  const d = Core.clBackfillDecide([
    { id: 'has', title: 'Brass table lamp with shade', remoteId: '7111111111', idKnown: true },
    { id: 'old', title: 'Brass table lamp with shade', remoteId: null, idKnown: false },
    { id: 'none', title: 'Cast iron skillet number eight', remoteId: null, idKnown: true }
  ], rows, {}, Date.now());
  assert.deepStrictEqual(d.report, []); assert.strictEqual(d.skipped.none, 1);
});
test('decide: a posting already saved on another item, or matching two id-less items, is never reported', () => {
  const rows = [row('7986006834', 'Brass table lamp with shade - $20'), row('7986006999', 'Vintage Pyrex mixing bowl set - $15')];
  const d1 = Core.clBackfillDecide([
    { id: 'owner', title: 'Something else entirely here', remoteId: '7986006834', idKnown: true },
    { id: 'a', title: 'Brass table lamp with shade', remoteId: null, idKnown: true }
  ], rows, {}, Date.now());
  assert.deepStrictEqual(d1.report, []); assert.strictEqual(d1.skipped.claimed, 1);
  const d2 = Core.clBackfillDecide([
    { id: 'a', title: 'Vintage Pyrex mixing bowl set', remoteId: null, idKnown: true },
    { id: 'b', title: 'Vintage Pyrex mixing bowl set', remoteId: null, idKnown: true }
  ], rows, {}, Date.now());
  assert.deepStrictEqual(d2.report, []); assert.strictEqual(d2.skipped.shared, 2);
});
test('decide: a refused pair is not re-sent for 7 days; a different posting or an expired memo is; cap respected', () => {
  const now = Date.now();
  const items = [{ id: 'a', title: 'Brass table lamp with shade', remoteId: null, idKnown: true }];
  const rows = [row('7986006834', 'Brass table lamp with shade - $20')];
  assert.strictEqual(Core.clBackfillDecide(items, rows, { a: { postingId: '7986006834', at: now - 3600e3 } }, now).report.length, 0);
  assert.strictEqual(Core.clBackfillDecide(items, rows, { a: { postingId: '7986006834', at: now - 8 * 864e5 } }, now).report.length, 1);
  assert.strictEqual(Core.clBackfillDecide(items, rows, { a: { postingId: '7000000000', at: now } }, now).report.length, 1);
  const many = Array.from({ length: 5 }, (_, i) => ({ id: 'i' + i, title: 'Unique collectible item number ' + i, remoteId: null, idKnown: true }));
  const mrows = many.map((it, i) => row(String(7986000000 + i), it.title + ' - $3'));
  const d = Core.clBackfillDecide(many, mrows, {}, now, 3);
  assert.strictEqual(d.report.length, 3); assert.strictEqual(d.capped, true);
  assert.strictEqual(Core.CL_BACKFILL_CAP, 50);
});
test('decide: a row without a public link is still reported, by id only', () => {
  const d = Core.clBackfillDecide([{ id: 'a', title: 'Brass table lamp with shade', remoteId: null, idKnown: true }], [row('7986006834', 'Brass table lamp with shade - $20', 'active', '')], {}, Date.now());
  assert.strictEqual(d.report[0].postingUrl, '');
});

// ------------------------------------------------------------------ wiring: the real background.js reconcile in a vm ------------------
function loadBackground(api) {
  const store = {};
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : deep()), apply: () => undefined });
  const calls = { api: [], fasLog: [], log: [] };
  const own = {
    storage: { local: {
      get: async (k) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
      remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); } }, session: undefined },
    runtime: { getManifest: () => ({ version: 'test' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } }
  };
  const sb = { console, setTimeout: () => 0, clearTimeout() {}, Math, Date, JSON, URL, Promise, Set, Map };
  sb.self = sb; sb.window = sb;
  sb.chrome = new Proxy(function () {}, { get: (t, k) => (k in own ? own[k] : deep()) });
  sb.importScripts = (...files) => files.forEach((f) => vm.runInContext(read(f), sb));
  vm.createContext(sb);
  vm.runInContext(read('background.js'), sb);
  sb.apiFetch = async (u, o) => { calls.api.push({ u, body: o && o.body }); return api(u, o); };
  sb.fasLog = (lvl, source, msg, ctx) => { calls.fasLog.push({ lvl, source, msg, ctx }); };
  sb.fasT = (lvl, code, msg) => { calls.log.push({ lvl, code, msg }); };
  sb.fasFlowForwardDiag = () => {};
  return { sb, store, calls };
}
const EMAIL = 'organizer@example.com';
function scanMsg(rows, extra) { return Object.assign({ loggedIn: true, accountText: 'Logged in as ' + EMAIL, complete: true, total: rows.length, rows: rows }, extra || {}); }
const REQ_ITEMS = [
  { id: 'a', title: 'Brass table lamp with shade', remoteId: null, idKnown: true },             // unique -> reported
  { id: 'b', title: 'Vintage Pyrex mixing bowl set', remoteId: null, idKnown: true },           // two postings -> nothing
  { id: 'c', title: 'Cast iron skillet number eight', remoteId: '7986007777', idKnown: true }   // already has an id
];
const ROWS = [
  row('7986006834', 'Brass table lamp with shade - $20 (Paw Paw)'),
  row('7986006998', 'Vintage Pyrex mixing bowl set - $15'), row('7986006999', 'Vintage Pyrex mixing bowl set - $16'),
  row('7986007777', 'Cast iron skillet number eight - $30')
];
test('reconcile: a complete scan reports only the unique id-less match to remote-listing-id with id + public URL; summary logged', async () => {
  const h = loadBackground(async (u) => ({ ok: true, status: 200, data: {} }));
  await h.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS));
  const reports = h.calls.api.filter((c) => /remote-listing-id/.test(c.u));
  assert.deepStrictEqual(reports.map((c) => c.u), ['/extension/items/a/remote-listing-id']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reports[0].body)), { platform: 'CRAIGSLIST', remoteListingId: '7986006834', remoteListingUrl: 'https://kalamazoo.craigslist.org/clt/d/paw-paw-x/7986006834.html' });
  assert.ok(!h.calls.api.some((c) => /\/removed$/.test(c.u)), 'nothing cleared: every item is present');
  const sum = h.calls.fasLog.find((l) => l.source === 'cl_id_backfill');
  assert.ok(sum && /1 filled in/.test(sum.msg) && /1 with 2\+ matching postings/.test(sum.msg), sum && sum.msg);
});
test('reconcile: an incomplete or unverified scan backfills nothing', async () => {
  for (const extra of [{ complete: false }, { total: 99 }, { accountText: 'someone else' }, { loggedIn: false }]) {
    const h = loadBackground(async () => ({ ok: true, status: 200, data: {} }));
    await h.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS, extra));
    assert.ok(!h.calls.api.some((c) => /remote-listing-id/.test(c.u)), JSON.stringify(extra));
  }
});
test('reconcile: a 409 from the backend is remembered and not re-sent on the next scan; a 5xx is retried', async () => {
  const h = loadBackground(async (u) => ({ ok: false, status: 409, data: { reason: 'already_set' } }));
  await h.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS));
  assert.strictEqual(h.store.fasClIdBackfill.a.postingId, '7986006834');
  h.calls.api.length = 0;
  await h.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS));
  assert.ok(!h.calls.api.some((c) => /remote-listing-id/.test(c.u)), 'not re-sent');
  const h2 = loadBackground(async () => ({ ok: false, status: 503, data: {} }));
  await h2.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS));
  h2.calls.api.length = 0;
  await h2.sb.fasClApplyReconcile({ expectedEmail: EMAIL, items: REQ_ITEMS }, scanMsg(ROWS));
  assert.ok(h2.calls.api.some((c) => /remote-listing-id/.test(c.u)), 'retried after a server error');
});
test('wiring: reconcile request carries craigslistRemoteListingId + idKnown; the scan rows carry the posting link; the edit row keeps it too', () => {
  const bg = read('background.js');
  assert.ok(/remoteId: \(it\.craigslistRemoteListingId \|\| it\.remoteListingId/.test(bg));
  assert.ok(/idKnown: Object\.prototype\.hasOwnProperty\.call\(it, 'craigslistRemoteListingId'\)/.test(bg));
  assert.ok(/href: String\(r\.href \|\| ''\)\.slice\(0, 400\)/.test(bg));
  const fr = read('fas-craigslist-removal-frame.js');
  assert.ok(/new URL\(a\.getAttribute\('href'\), 'https:\/\/accounts\.craigslist\.org\/login\/home'\)\.href/.test(fr));
  assert.ok(/postingUrl: C\.clPublicPostingUrl\(chosen\.href, chosen\.postingId\)/.test(read('fas-edit-engine.js')));
  for (const f of ['background.js', 'config.js', 'fas-edit-core.js', 'fas-edit-engine.js', 'fas-craigslist-removal-frame.js', 'tests/fas-cl-id-backfill.test.js']) assert.ok(!fs.readFileSync(path.join(root, f)).includes(0), f + ' has NUL bytes');
});
