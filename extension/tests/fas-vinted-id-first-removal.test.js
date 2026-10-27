// 1.0.75 (2026-10-27): Vinted removal checks the stored listing id first (before the title_too_short refusal), the same way 1.0.74
// did for Poshmark. Shapes read live 2026-10-27 in Patrick's signed-in Chrome:
//   GET /api/v2/items/<id>/details: 10402940029 live/own (is_closed false, can_delete true, item.user.id == me);
//   10310708293 sold (is_closed true, item_closing_action 'sold'); 10192050693 gone (404 { code: 104, message_code: 'not_found' });
//   another seller's item: item.user.id != me, can_delete false. GET /api/v2/users/current -> { user: { id } }.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vint = fs.readFileSync(path.join(__dirname, '..', 'fas-vinted.js'), 'utf8');

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
const ASYNC = new Set(['vintLookupItemById', 'vintRemoveByListingId']);
const NAMES = ['vintRemovalListingId', 'vintClassifyItemLookup', 'vintLookupItemById', 'vintRemSendVerify', 'vintRemoveByListingId', 'vintRemSignalBackground', 'vintRemItemIdFromHref'];
const body = NAMES.map((n) => (ASYNC.has(n) ? 'async ' : '') + extract(vint, n)).join('\n');

const LIVE = '10402940029';
const SOLD = '10310708293';
const GONE = '10192050693';
const ME = 98765;
const liveItem = (over) => ({ code: 0, item: Object.assign({ id: Number(LIVE), title: 'Qwik Tune Automatic Guitar & Bass Tuner, Vintage', user: { id: ME, login: 'x' }, is_closed: false, is_hidden: false, is_draft: false, item_closing_action: null, can_delete: true, can_edit: true }, over || {}) });
const NOT_FOUND = { code: 104, message_code: 'not_found', message: 'Content not found' };

function harness(detailsResp, opts) {
  opts = opts || {};
  const sent = [];
  const storage = {};
  if (opts.target) storage.fasVintedRemovalTarget = opts.target;
  const loc = { origin: 'https://www.vinted.com', pathname: opts.path || '/member/123', href: 'https://www.vinted.com' + (opts.path || '/member/123') };
  const fetchCalls = [];
  const deps = {
    fetch: async (url, o) => {
      fetchCalls.push({ url, o });
      if (opts.throwAll) throw new TypeError('Failed to fetch');
      if (/\/api\/v2\/users\/current$/.test(url)) return opts.signedOut ? { ok: false, status: 401, json: async () => ({ code: 100 }) } : { ok: true, status: 200, json: async () => ({ code: 0, user: { id: ME } }) };
      return { ok: detailsResp.status < 300, status: detailsResp.status, json: async () => { if (detailsResp.json === undefined) throw new Error('not json'); return detailsResp.json; } };
    },
    location: loc,
    chrome: { runtime: { sendMessage: (m) => { sent.push(m); }, lastError: null } },
    overlay: () => {}, overlayWarn: () => {}, button: () => '', escapeHtml: (s) => String(s), closeBtnHandler: () => {},
    vintRemStorageGet: async (k) => (k in storage ? storage[k] : null),
    vintRemStorageSet: async (k, v) => { storage[k] = v; },
    console: { log: () => {} },
  };
  const pre = "const VINTED_REMOVAL_TARGET_STORAGE_KEY = 'fasVintedRemovalTarget'; const VINT_REM_ID_NAV_MS = 600000;\n";
  const fns = new Function('deps', 'const { fetch, location, chrome, overlay, overlayWarn, button, escapeHtml, closeBtnHandler, vintRemStorageGet, vintRemStorageSet, console } = deps;\n' + pre + body + '\nreturn { ' + NAMES.join(', ') + ' };')(deps);
  return { fns, sent, storage, loc, fetchCalls };
}
const item = (over) => Object.assign({ id: 'cmv1', title: 'Qwik Tune', reason: 'POLICY_INELIGIBLE', listingRefs: { VINTED: LIVE } }, over || {});

test('gone (404 code 104) -> reported REMOVED with a note, even for a title too short for the title flow', async () => {
  const h = harness({ status: 404, json: NOT_FOUND }, { target: { itemId: 'cmv1', vintedId: GONE, at: Date.now(), source: 'ref' } });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item({ title: 'Tube', listingRefs: { VINTED: GONE } })), 'handled');
  assert.ok(h.fetchCalls.some((c) => c.url === 'https://www.vinted.com/api/v2/items/' + GONE + '/details' && c.o.credentials === 'include'));
  assert.ok(h.fetchCalls.every((c) => !c.o.headers || !Object.keys(c.o.headers).some((k) => /csrf/i.test(k))), 'GETs need no CSRF header');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.platform, m.itemId]), [['crossPlatformRemovalDeleted', 'VINTED', 'cmv1']]);
  assert.ok(/already removed on Vinted/.test(h.sent[0].note));
  assert.strictEqual(h.storage.fasVintedRemovalTarget, null);
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/member/123');
});

test('live and owned, not on its page -> stores the id target and opens /items/<id>', async () => {
  const h = harness({ status: 200, json: liveItem() });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item()), 'handled');
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/items/' + LIVE);
  assert.strictEqual(h.storage.fasVintedRemovalTarget.vintedId, LIVE);
  assert.strictEqual(h.storage.fasVintedRemovalTarget.source, 'id');
  assert.strictEqual(h.sent.length, 0);
});

test('live and owned, already on /items/<id>-slug -> delete_here (the existing delete flow runs without a title match)', async () => {
  const h = harness({ status: 200, json: liveItem() }, { path: '/items/' + LIVE + '-qwik-tune-automatic-guitar-bass-tuner-vintage' });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item({ title: 'Totally different title' })), 'delete_here');
  assert.strictEqual(h.sent.length, 0);
});

test('loop guard: sent to /items/<id> a moment ago and not there -> bounded detail_page_not_reached', async () => {
  const h = harness({ status: 200, json: liveItem() }, { target: { itemId: 'cmv1', vintedId: LIVE, at: Date.now() - 1000, source: 'id' }, path: '/' });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item()), 'handled');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalAttemptFailed', 'detail_page_not_reached']]);
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/');
});

test('sold on Vinted -> permanent already_sold_on_vinted_permanent skip, nothing deleted', async () => {
  const h = harness({ status: 200, json: liveItem({ id: Number(SOLD), is_closed: true, item_closing_action: 'sold', can_edit: false }) });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item({ reason: 'SOLD_ELSEWHERE', listingRefs: { VINTED: SOLD } })), 'handled');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalSkipped', 'already_sold_on_vinted_permanent']]);
});

test('another seller, closed-not-sold, or draft -> falls back to the existing flow', async () => {
  for (const over of [{ user: { id: 55555 }, can_delete: false, can_edit: false }, { is_closed: true, item_closing_action: null }, { is_draft: true }]) {
    const h = harness({ status: 200, json: liveItem(over) });
    assert.strictEqual(await h.fns.vintRemoveByListingId(item()), false);
    assert.strictEqual(h.sent.length, 0);
    assert.strictEqual(h.loc.href, 'https://www.vinted.com/member/123');
  }
});

test('not signed in (users/current 401): a 404 is not trusted as gone; fetch errors fall back', async () => {
  const h = harness({ status: 404, json: NOT_FOUND }, { signedOut: true });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item()), false);
  assert.strictEqual(h.sent.length, 0);
  const e = harness({ status: 200, json: liveItem() }, { throwAll: true });
  assert.strictEqual(await e.fns.vintRemoveByListingId(item()), false);
  assert.strictEqual(e.sent.length, 0);
  const nj = harness({ status: 502 });
  assert.strictEqual(await nj.fns.vintRemoveByListingId(item()), false);
});

test('RESYNC_VERIFY never deletes: live -> verify_still_live (even on its own page), gone -> listing_not_found', async () => {
  const live = harness({ status: 200, json: liveItem() }, { path: '/items/' + LIVE });
  assert.strictEqual(await live.fns.vintRemoveByListingId(item({ reason: 'RESYNC_VERIFY' })), 'handled');
  assert.deepStrictEqual(live.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'verify_still_live', true]]);
  const gone = harness({ status: 404, json: NOT_FOUND });
  assert.strictEqual(await gone.fns.vintRemoveByListingId(item({ reason: 'RESYNC_VERIFY' })), 'handled');
  assert.deepStrictEqual(gone.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'listing_not_found', true]]);
});

test('no stored id -> no fetch; numeric ids, numbers and Vinted URLs resolve, foreign URLs do not', async () => {
  const h = harness({ status: 200, json: liveItem() });
  assert.strictEqual(await h.fns.vintRemoveByListingId(item({ listingRefs: {} })), false);
  assert.strictEqual(h.fetchCalls.length, 0);
  const id = h.fns.vintRemovalListingId;
  assert.strictEqual(id({ listingRefs: { VINTED: 10402940029 } }), LIVE);
  assert.strictEqual(id({ listingRefs: { VINTED: 'https://www.vinted.com/items/' + LIVE + '-qwik-tune' } }), LIVE);
  assert.strictEqual(id({ listingRefs: { VINTED: 'https://evil.example/items/' + LIVE } }), null);
  assert.strictEqual(id({ listingRefs: { VINTED: 'abc' } }), null);
});

test('wiring: id-first runs before the title_too_short refusal, a verify run never reaches the title flow, delete_here skips the title match', () => {
  const run = vint.slice(vint.indexOf('async function runVintedRemovalQueue('));
  const idFirst = run.indexOf('const idFirst = await vintRemoveByListingId(item);');
  assert.ok(idFirst > 0);
  assert.ok(idFirst < run.indexOf("'title_too_short_for_safe_match'"));
  assert.ok(run.indexOf("vintRemSendVerify(item, 'verify_unresolved');") > idFirst);
  assert.ok(run.indexOf("vintRemSendVerify(item, 'verify_unresolved');") < run.indexOf("'title_too_short_for_safe_match'"));
  assert.ok(/if \(!idFirstDeleteHere && wantedTitle\.length < VINT_REM_MIN_SAFE_TITLE_LEN\)/.test(run));
  assert.ok(/let onDetailAlready = idFirstDeleteHere \|\| \(onItemDetailPage && vintRemDetailPageTitleMatches\(wantedTitle\)\);/.test(run));
  // The pending delete-verification (post-delete check via the wardrobe API) still runs first.
  assert.ok(run.indexOf('pendingTarget.deleteSubmittedAt') < idFirst);
});
