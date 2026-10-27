// 1.0.75 (2026-10-27): Mercari removal checks the stored listing id first, the same way 1.0.74 did for Poshmark. Before this a
// retitled or already-gone Mercari listing always ended as detail_page_title_mismatch -> delete_unconfirmed_after_3_attempts.
// Shapes below were read live 2026-10-27 in Patrick's signed-in Chrome (GET /us/item/<id>/, its __NEXT_DATA__):
//   m78972337538 live/own (status on_sale, seller PrivateUser:846481943, me.userId 846481943)
//   m40220988747 sold (status trading, buyer set) -- m22452982737 gone (HTTP 410, gqlErrorCode ItemNotAvailableException)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const merc = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');

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
const ASYNC = new Set(['mercLookupItemById', 'mercRemoveByListingId', 'mercRemResumeAfterDeleteClick']);
const NAMES = ['mercRemovalListingId', 'mercParseNextData', 'mercClassifyItemLookup', 'mercLookupItemById', 'mercRemoveByListingId',
  'mercRemReadMarker', 'mercRemWriteMarker', 'mercRemClearMarker', 'mercRemReportResult', 'mercRemFailureCopy', 'mercRemResumeAfterDeleteClick'];
const body = NAMES.map((n) => (ASYNC.has(n) ? 'async ' : '') + extract(merc, n)).join('\n');

const LIVE = 'm78972337538';
const SOLD = 'm40220988747';
const GONE = 'm22452982737';
const ME = 846481943;
function itemPage(id, it) {
  const ss = {};
  ss['PrivateUser:' + ME] = { __typename: 'PrivateUser', id: ME, name: 'artifactm' };
  ss['ItemDetail:' + id] = Object.assign({ __typename: 'ItemDetail', id: id, status: 'on_sale', seller: { __ref: 'PrivateUser:' + ME }, buyer: null, lastSoldAt: null, me: { __typename: 'ItemMe', userId: ME } }, it || {});
  const nd = { props: { pageProps: { statusCode: 200, gqlErrorCode: null, serverState: ss }, __N_SSP: true }, page: '/us/item/[id]' };
  return '<html><body><script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(nd) + '</script></body></html>';
}
function errorPage(status, gql) {
  const nd = { props: { pageProps: { statusCode: status, gqlErrorCode: gql, serverState: {} } }, page: '/us/item/[id]' };
  return '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(nd) + '</script>';
}
const htmlResp = (status, html) => async () => ({ status, text: async () => html });

function harness(fetchImpl, startPath) {
  const sent = [];
  const store = {};
  const loc = { href: 'https://www.mercari.com' + (startPath || '/mypage/listings/'), pathname: startPath || '/mypage/listings/' };
  const fetchCalls = [];
  const deps = {
    fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return fetchImpl(url, opts); },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: loc,
    chrome: { runtime: { sendMessage: (m) => { sent.push(m); } } },
    overlay: () => {}, overlayWarn: () => {}, button: () => '', escapeHtml: (s) => String(s),
    console: { log: () => {} },
  };
  const pre = "const MERCARI_REMOVAL_CONTINUE_URL = 'https://www.mercari.com/mypage/listings/'; const MERC_REM_EDIT_MARKER_KEY = 'fasMercDeleteEditMarker'; const MERC_REM_EDIT_MARKER_TTL_MS = 120000;\n";
  const fns = new Function('deps', 'const { fetch, sessionStorage, location, chrome, overlay, overlayWarn, button, escapeHtml, console } = deps;\n' + pre + body + '\nreturn { ' + NAMES.join(', ') + ' };')(deps);
  return { fns, sent, store, loc, fetchCalls };
}
const item = (over) => Object.assign({ id: 'cmitem1', title: 'Hydrologic stealthRO 200 (FindA.Sale title)', reason: 'POLICY_INELIGIBLE', listingRefs: { MERCARI: LIVE } }, over || {});

test('gone (410 ItemNotAvailableException) -> reported REMOVED via the normal delete message with a note; no navigation', async () => {
  const h = harness(htmlResp(410, errorPage(410, 'ItemNotAvailableException')));
  assert.strictEqual(await h.fns.mercRemoveByListingId(item({ listingRefs: { MERCARI: GONE } })), true);
  assert.strictEqual(h.fetchCalls.length, 1);
  assert.strictEqual(h.fetchCalls[0].url, '/us/item/' + GONE + '/');
  assert.strictEqual(h.fetchCalls[0].opts.credentials, 'include');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.platform, m.itemId]), [['crossPlatformRemovalDeleted', 'MERCARI', 'cmitem1']]);
  assert.ok(/already removed on Mercari/.test(h.sent[0].note));
  assert.strictEqual(h.loc.href, 'https://www.mercari.com/mypage/listings/');
});

test('live and owned by the signed-in seller -> id-verified marker, straight to /sell/edit/<id>/ (no title match needed)', async () => {
  const h = harness(htmlResp(200, itemPage(LIVE)));
  assert.strictEqual(await h.fns.mercRemoveByListingId(item()), true);
  assert.strictEqual(h.loc.href, 'https://www.mercari.com/sell/edit/' + LIVE + '/');
  const marker = JSON.parse(h.store.fasMercDeleteEditMarker);
  assert.strictEqual(marker.mercId, LIVE);
  assert.strictEqual(marker.fasItemId, 'cmitem1');
  assert.strictEqual(marker.phase, 'navigated');
  assert.strictEqual(marker.idVerified, true);
  assert.strictEqual(h.sent.length, 0);
});

test('loop guard: back off the edit page with the navigated marker -> bounded edit_page_unreachable, no second navigation', async () => {
  const h = harness(htmlResp(200, itemPage(LIVE)));
  await h.fns.mercRemoveByListingId(item());
  h.loc.href = 'https://www.mercari.com/us/item/' + LIVE + '/';
  assert.strictEqual(await h.fns.mercRemoveByListingId(item()), true);
  assert.strictEqual(h.loc.href, 'https://www.mercari.com/us/item/' + LIVE + '/');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalAttemptFailed', 'edit_page_unreachable']]);
  assert.strictEqual(h.store.fasMercDeleteEditMarker, undefined);
});

test('sold (status trading) -> the existing permanent already_sold_on_mercari_archive_only skip', async () => {
  const h = harness(htmlResp(200, itemPage(SOLD, { status: 'trading', buyer: { __ref: 'PublicUser:542724304' }, lastSoldAt: 1792809892 })));
  assert.strictEqual(await h.fns.mercRemoveByListingId(item({ reason: 'SOLD_ELSEWHERE', listingRefs: { MERCARI: SOLD } })), true);
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalSkipped', 'already_sold_on_mercari_archive_only']]);
  assert.strictEqual(h.store.fasMercDeleteEditMarker, undefined);
});

test('a live listing of another seller is never touched: falls back (also when the owner cannot be verified)', async () => {
  const other = harness(htmlResp(200, itemPage(LIVE, { seller: { __ref: 'PublicUser:707512213' } })));
  assert.strictEqual(await other.fns.mercRemoveByListingId(item()), false);
  assert.strictEqual(other.sent.length, 0);
  assert.strictEqual(other.store.fasMercDeleteEditMarker, undefined);
  const signedOut = harness(htmlResp(200, itemPage(LIVE, { seller: { __ref: 'PublicUser:' + ME }, me: null })));
  assert.strictEqual(await signedOut.fns.mercRemoveByListingId(item()), false);
  assert.strictEqual(signedOut.sent.length, 0);
});

test('fetch error / unparseable page -> falls back (nothing sent, no navigation)', async () => {
  const h = harness(async () => { throw new TypeError('Failed to fetch'); });
  assert.strictEqual(await h.fns.mercRemoveByListingId(item()), false);
  assert.strictEqual(h.sent.length, 0);
  assert.strictEqual(h.loc.href, 'https://www.mercari.com/mypage/listings/');
  const h2 = harness(htmlResp(503, '<html>Service Unavailable</html>'));
  assert.strictEqual(await h2.fns.mercRemoveByListingId(item()), false);
  assert.strictEqual(h2.sent.length, 0);
  const h3 = harness(htmlResp(200, itemPage(LIVE, { status: 'inactive' })));
  assert.strictEqual(await h3.fns.mercRemoveByListingId(item()), false);
});

test('RESYNC_VERIFY never deletes: live -> verify_still_live, gone -> listing_not_found (verifyOnly)', async () => {
  const live = harness(htmlResp(200, itemPage(LIVE)));
  assert.strictEqual(await live.fns.mercRemoveByListingId(item({ reason: 'RESYNC_VERIFY' })), true);
  assert.deepStrictEqual(live.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'verify_still_live', true]]);
  assert.strictEqual(live.store.fasMercDeleteEditMarker, undefined);
  assert.strictEqual(live.loc.href, 'https://www.mercari.com/mypage/listings/');
  const gone = harness(htmlResp(410, errorPage(410, 'ItemNotAvailableException')));
  assert.strictEqual(await gone.fns.mercRemoveByListingId(item({ reason: 'RESYNC_VERIFY', listingRefs: { MERCARI: GONE } })), true);
  assert.deepStrictEqual(gone.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'listing_not_found', true]]);
  const sold = harness(htmlResp(200, itemPage(SOLD, { status: 'trading' })));
  assert.strictEqual(await sold.fns.mercRemoveByListingId(item({ reason: 'RESYNC_VERIFY', listingRefs: { MERCARI: SOLD } })), false);
  assert.strictEqual(sold.sent.length, 0);
});

test('no stored id -> no fetch; ids and Mercari URLs both resolve, foreign URLs do not', async () => {
  const h = harness(htmlResp(200, itemPage(LIVE)));
  assert.strictEqual(await h.fns.mercRemoveByListingId(item({ listingRefs: {} })), false);
  assert.strictEqual(h.fetchCalls.length, 0);
  const id = h.fns.mercRemovalListingId;
  assert.strictEqual(id({ listingRefs: { MERCARI: 'M78972337538' } }), LIVE);
  assert.strictEqual(id({ listingRefs: { MERCARI: 'https://www.mercari.com/us/item/' + LIVE + '/' } }), LIVE);
  assert.strictEqual(id({ listingRefs: { MERCARI: 'https://evil.example/us/item/' + LIVE + '/' } }), null);
  assert.strictEqual(id({ listingRefs: { MERCARI: '12345' } }), null);
});

test('classifier: 404 RecordNotFoundException is gone; a 410 without the Mercari error code is not trusted', () => {
  const c = harness(htmlResp(200, '')).fns;
  assert.strictEqual(c.mercClassifyItemLookup(404, c.mercParseNextData(errorPage(404, 'RecordNotFoundException')), 'm1').kind, 'removed');
  assert.strictEqual(c.mercClassifyItemLookup(410, null, 'm1').kind, 'unknown');
  assert.strictEqual(c.mercClassifyItemLookup(200, c.mercParseNextData(itemPage(LIVE)), LIVE).kind, 'live_own');
});

test('post-delete resume: an id-verified delete is confirmed by the id, not by a title scan', async () => {
  const marker = { mercId: LIVE, fasItemId: 'cmitem1', title: 't', at: Date.now(), phase: 'delete_clicked', idVerified: true };
  const gone = harness(htmlResp(410, errorPage(410, 'ItemNotAvailableException')), '/mypage/listings/');
  assert.strictEqual(await gone.fns.mercRemResumeAfterDeleteClick(item(), marker), 'deleted');
  const still = harness(htmlResp(200, itemPage(LIVE)), '/mypage/listings/');
  assert.strictEqual(await still.fns.mercRemResumeAfterDeleteClick(item(), marker), 'delete_not_confirmed');
});

test('wiring: id-first runs before the detail-page title check; the edit page skips the title match only for an id-verified marker', () => {
  const run = merc.slice(merc.indexOf('async function runMercariRemovalQueue('));
  const idFirst = run.indexOf('if (await mercRemoveByListingId(item)) return;');
  assert.ok(idFirst > 0);
  assert.ok(idFirst < run.indexOf('const hereItemId = mercRemItemIdFromHref(location.pathname);'));
  assert.ok(run.indexOf('mercRemResumeAfterDeleteClick(item, pendingMarker)') > 0);
  const edit = extract(merc, 'deleteMercariListingOnEditPage');
  assert.ok(/if \(!\(marker\.idVerified === true && marker\.mercId === editId\) && !mercRemTitleMatches\(titleEl\.value, item\.title\)\) return 'edit_page_title_mismatch';/.test(edit));
  assert.ok(/phase: 'delete_clicked', idVerified: marker\.idVerified === true/.test(edit));
  assert.ok(/item\.reason === 'RESYNC_VERIFY' \|\| !marker/.test(edit), 'a verify run never deletes on the edit page');
});
