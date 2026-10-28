// 1.0.80 (2026-10-28): Vinted uploads were recorded POSTED with remoteListingId NULL (prod: Samsung CDR 12:14:54 UTC,
// Quarter tubes 12:22:56, Penny tubes 12:25:51). fas-vinted.js sent markListed WITH the Vinted id, but background.js
// passes every markListed through fasListedBody() -> FAS_LISTING_REF.sanitizeListedRef(), which had no VINTED id format,
// so the id became null before the POST. Also: a later report that carries the id was swallowed by the 2-minute
// client dedup when an earlier report had none.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = require('../fas-listing-ref.js');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('sanitizeListedRef keeps a Vinted id (bare or from a vinted.com /items/ URL) and rejects junk or foreign hosts', () => {
  assert.deepStrictEqual(R.sanitizeListedRef('VINTED', '10569089853', null), { remoteListingId: '10569089853', remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('VINTED', '10569190386', undefined), { remoteListingId: '10569190386', remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('VINTED', null, 'https://www.vinted.com/items/10569209573-penny-tubes'),
    { remoteListingId: '10569209573', remoteListingUrl: 'https://www.vinted.com/items/10569209573-penny-tubes' });
  assert.deepStrictEqual(R.sanitizeListedRef('VINTED', 'abc', null), { remoteListingId: null, remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('VINTED', null, 'https://evil.example/items/10569209573'), { remoteListingId: null, remoteListingUrl: null });
  assert.strictEqual(R.normalizeRemoteId('VINTED', 10569089853), '10569089853');
});

test('other platforms are unchanged', () => {
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', '98400943', null), { remoteListingId: '98400943', remoteListingUrl: null });
  assert.strictEqual(R.normalizeRemoteId('POSHMARK', '10569089853'), '');
});

function loadReporter() {
  const start = bg.indexOf('function fasListedBody(');
  const end = bg.indexOf('// FIX 2026-10-02: durable retry queue');
  assert.ok(start !== -1 && end > start);
  const store = {};
  const calls = [];
  const chrome = { storage: { local: {
    get: async (keys) => { const o = {}; for (const k of keys) if (k in store) o[k] = JSON.parse(JSON.stringify(store[k])); return o; },
    set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
  } } };
  const apiFetch = async (url, opts) => { calls.push({ url, body: opts.body }); return { ok: true }; };
  const fn = new Function('chrome', 'apiFetch', 'FAS_LISTING_REF', 'queuePendingListedReport', 'flushPendingListedReports',
    'const FAS_LISTED_REPORT_DEDUP_TTL_MS = 120000;\n' + bg.slice(start, end) + '\nreturn { fasListedBody, reportItemListedOnce };');
  return Object.assign(fn(chrome, apiFetch, R, async () => {}, () => {}), { calls });
}

test('markListed for Vinted posts the id to /listed', async () => {
  const r = loadReporter();
  await r.reportItemListedOnce('item1', 'VINTED', '10569089853', undefined);
  assert.strictEqual(r.calls.length, 1);
  assert.deepStrictEqual(r.calls[0].body, { remoteListingId: '10569089853', remoteListingUrl: null, platform: 'VINTED' });
});

test('a later report carrying the id inside the dedup window is still sent (backend fills the empty id, no new row)', async () => {
  const r = loadReporter();
  await r.reportItemListedOnce('item2', 'VINTED', null, null);
  const second = await r.reportItemListedOnce('item2', 'VINTED', '10569190386', null);
  assert.deepStrictEqual(second, { ok: true, deduped: true });
  assert.strictEqual(r.calls.length, 2);
  assert.strictEqual(r.calls[1].body.remoteListingId, '10569190386');
  // A duplicate WITHOUT an id is still a pure no-op.
  await r.reportItemListedOnce('item2', 'VINTED', null, null);
  assert.strictEqual(r.calls.length, 2);
});

test('every fas-vinted.js markListed sends the Vinted id', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'fas-vinted.js'), 'utf8');
  const sends = src.match(/sendMessage\(\{ type: 'markListed'[^}]*\}/g) || [];
  assert.ok(sends.length >= 3);
  for (const s of sends) assert.ok(/remoteListingId: (?!null)/.test(s) && /platform: 'VINTED'/.test(s), s);
});
