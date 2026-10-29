// 1.0.75 (2026-10-27): Grailed removal checks the stored listing id first. Before this it matched by title only and never read
// listingRefs. Shapes read live 2026-10-27 in Patrick's signed-in Chrome: GET /api/listings/105000124 -> 200 { data: { seller: { id:
// 19099637 }, sold: false, deleted: false, hidden: false } } (retitled on Grailed: "REBECCA STONE Graphic T-Shirt, ..."), 104003051 is
// hidden: true (moderation), GET /api/listings/1 -> 404 { error: { error_id: 'not_found' } }, GET /api/users/me -> { data: { id } }.
// 2026-10-29: live+owned is no longer handed to the organizer: the tab goes to /listings/<id> (a sessionStorage mark says why) and
// grDeleteOnListingPage deletes it there (tests: fas-grailed-auto-delete.test.js). Only "already gone" resolves without a page visit.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const gr = fs.readFileSync(path.join(__dirname, '..', 'fas-grailed.js'), 'utf8');

function extract(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
const ASYNC = new Set(['grLookupListingById', 'grRemoveByListingId', 'grGoToListingForDelete']);
const NAMES = ['grRemovalListingId', 'grClassifyListingLookup', 'grLookupListingById', 'grRemoveByListingId', 'grWriteMark', 'grGoToListingForDelete'];
const body = NAMES.map((n) => (ASYNC.has(n) ? 'async ' : '') + extract(gr, n)).join('\n');

const LIVE = '105000124';
const HIDDEN = '104003051';
const ME = 19099637;
const listing = (over) => ({ data: Object.assign({ id: Number(LIVE), title: 'REBECCA STONE Graphic T-Shirt, Black Cotton wash Patterned', seller: { id: ME, username: 'artifact7283' }, sold: false, sold_at: null, deleted: false, hidden: false }, over || {}) });
const NOT_FOUND = { error: { code: 3, error_id: 'not_found', internal_message: 'ApiWrapper', message: 'Listing not found', meta: null } };

function harness(listingResp, opts) {
  opts = opts || {};
  const sent = [];
  const warns = [];
  const loc = { href: 'https://www.grailed.com/sell/for-sale', pathname: '/sell/for-sale' };
  const fetchCalls = [];
  const deps = {
    fetch: async (url, o) => {
      fetchCalls.push({ url, o });
      if (opts.throwAll) throw new TypeError('Failed to fetch');
      if (url === '/api/users/me') return opts.signedOut ? { ok: false, status: 401, json: async () => ({ error: { error_id: 'unauthorized' } }) } : { ok: true, status: 200, json: async () => ({ data: { id: ME, username: 'artifact7283' } }) };
      return { ok: listingResp.status < 300, status: listingResp.status, json: async () => { if (listingResp.json === undefined) throw new Error('not json'); return listingResp.json; } };
    },
    location: loc,
    chrome: { runtime: { sendMessage: (m) => { sent.push(m); } } },
    overlay: () => {}, overlayWarn: (t) => { warns.push(t); }, button: () => '', escapeHtml: (s) => String(s),
    console: { log: () => {} },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    humanPause: async () => {},
  };
  const store = {};
  const pre = 'const GRAILED_REMOVAL_CONTINUE_URL = null;\nconst GR_DEL_NAV_KEY = \'fasGrDeleteNav\';\n';
  const fns = new Function('deps', 'const { fetch, location, chrome, overlay, overlayWarn, button, escapeHtml, console, sessionStorage, humanPause } = deps;\n' + pre + body + '\nreturn { ' + NAMES.join(', ') + ' };')(deps);
  return { fns, sent, warns, loc, fetchCalls, store };
}
const item = (over) => Object.assign({ id: 'cmg1', title: 'Graphic T-Shirt, Rebecca Stone, Black Cotton', reason: 'POLICY_INELIGIBLE', listingRefs: { GRAILED: LIVE } }, over || {});

test('gone (404 not_found) -> reported REMOVED via the normal delete message with a note', async () => {
  const h = harness({ status: 404, json: NOT_FOUND });
  assert.strictEqual(await h.fns.grRemoveByListingId(item()), true);
  assert.ok(h.fetchCalls.some((c) => c.url === '/api/listings/' + LIVE && c.o.credentials === 'include'));
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.platform, m.itemId]), [['crossPlatformRemovalDeleted', 'GRAILED', 'cmg1']]);
  assert.ok(/already removed on Grailed/.test(h.sent[0].note));
  assert.strictEqual(h.loc.href, 'https://www.grailed.com/sell/for-sale');
});

test('own listing flagged deleted: true -> reported REMOVED', async () => {
  const h = harness({ status: 200, json: listing({ deleted: true }) });
  assert.strictEqual(await h.fns.grRemoveByListingId(item()), true);
  assert.deepStrictEqual(h.sent.map((m) => m.type), ['crossPlatformRemovalDeleted']);
});

test('live and owned (retitled, or hidden by moderation) -> the tab goes to the listing page to delete it; nothing reported yet', async () => {
  for (const [id, over] of [[LIVE, {}], [HIDDEN, { id: Number(HIDDEN), hidden: true }]]) {
    const h = harness({ status: 200, json: listing(over) });
    assert.strictEqual(await h.fns.grRemoveByListingId(item({ listingRefs: { GRAILED: id } })), true);
    assert.deepStrictEqual(h.sent, []);
    assert.strictEqual(h.loc.href, 'https://www.grailed.com/listings/' + id);
    const mark = JSON.parse(h.store.fasGrDeleteNav);
    assert.deepStrictEqual([mark.id, mark.itemId, mark.source], [id, 'cmg1', 'id']);
  }
});

test('sold (no Grailed sold path exists) -> falls back to the title flow', async () => {
  const h = harness({ status: 200, json: listing({ sold: true, sold_at: '2026-10-01T00:00:00Z' }) });
  assert.strictEqual(await h.fns.grRemoveByListingId(item()), false);
  assert.strictEqual(h.sent.length, 0);
});

test('another seller -> falls back; not signed in -> a 404 is not trusted; fetch errors fall back', async () => {
  const other = harness({ status: 200, json: listing({ seller: { id: 1234 } }) });
  assert.strictEqual(await other.fns.grRemoveByListingId(item()), false);
  assert.strictEqual(other.sent.length, 0);
  const out = harness({ status: 404, json: NOT_FOUND }, { signedOut: true });
  assert.strictEqual(await out.fns.grRemoveByListingId(item()), false);
  assert.strictEqual(out.sent.length, 0);
  const e = harness({ status: 200, json: listing() }, { throwAll: true });
  assert.strictEqual(await e.fns.grRemoveByListingId(item()), false);
  const nj = harness({ status: 500 });
  assert.strictEqual(await nj.fns.grRemoveByListingId(item()), false);
});

test('RESYNC_VERIFY never deletes: live -> verify_still_live, gone -> listing_not_found (verifyOnly)', async () => {
  const live = harness({ status: 200, json: listing() });
  assert.strictEqual(await live.fns.grRemoveByListingId(item({ reason: 'RESYNC_VERIFY' })), true);
  assert.deepStrictEqual(live.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'verify_still_live', true]]);
  const gone = harness({ status: 404, json: NOT_FOUND });
  assert.strictEqual(await gone.fns.grRemoveByListingId(item({ reason: 'RESYNC_VERIFY' })), true);
  assert.deepStrictEqual(gone.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'listing_not_found', true]]);
});

test('no stored id -> no fetch; ids and Grailed URLs resolve, foreign URLs do not', async () => {
  const h = harness({ status: 200, json: listing() });
  assert.strictEqual(await h.fns.grRemoveByListingId(item({ listingRefs: {} })), false);
  assert.strictEqual(h.fetchCalls.length, 0);
  const id = h.fns.grRemovalListingId;
  assert.strictEqual(id({ listingRefs: { GRAILED: 105000124 } }), LIVE);
  assert.strictEqual(id({ listingRefs: { GRAILED: 'https://www.grailed.com/listings/' + LIVE + '-other-rebecca-stone' } }), LIVE);
  assert.strictEqual(id({ listingRefs: { GRAILED: 'https://evil.example/listings/' + LIVE } }), null);
});

test('wiring: id-first runs before the title flow, and a verify run never reaches the title flow', () => {
  const run = gr.slice(gr.indexOf('async function runGrailedRemovalQueue('));
  assert.strictEqual(gr.indexOf('grailed_delete_control_unconfirmed\''), -1, 'the hand-off-to-organizer reason is gone');
  const idFirst = run.indexOf('if (await grRemoveByListingId(item)) return;');
  assert.ok(idFirst > 0);
  const verifyGuard = run.indexOf("reason: 'verify_unresolved', verifyOnly: true");
  assert.ok(verifyGuard > idFirst);
  assert.ok(verifyGuard < run.indexOf('const pageTitleEl = grRemFindListingTitleEl();'));
});
