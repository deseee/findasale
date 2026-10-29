// 1.0.74 (2026-10-27 live): the pickup-only sweep handed Poshmark three removals carrying listingRefs.POSHMARK and all three came
// back listing_not_found, because runPoshmarkRemovalQueue only searched the closet by title. The Celestion speaker cabinet
// (6a982ae87789ea7d11785248) is live under a different Poshmark title; both Brass Table Lamps were already gone
// (GET /vm-rest/posts/<id> -> { error: { errorType: 'PostRemovedError', statusCode: 404 } }). The stored id now decides first.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const posh = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');

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
const NAMES = ['poshRemovalListingId', 'poshClosetUsername', 'poshClassifyPostLookup', 'poshLookupPostById', 'poshRemoveByListingId'];
const body = NAMES.map((n) => (n === 'poshLookupPostById' || n === 'poshRemoveByListingId' ? 'async ' : '') + extract(posh, n)).join('\n');

const CELESTION = '6a982ae87789ea7d11785248';
const LAMP = '6a96052d1b7e504ae611bffb';
const CLOSET = 'https://poshmark.com/closet/artifactm';
const livePost = (over) => Object.assign({ id: CELESTION, status: 'published', inventory: { status: 'available' }, creator_id: 'c1', creator_username: 'artifactm', creator_display_handle: 'artifactm' }, over || {});

function harness(fetchImpl) {
  const sent = [];
  const store = {};
  const loc = { href: 'https://poshmark.com/closet/artifactm', pathname: '/closet/artifactm', search: '' };
  const fetchCalls = [];
  const deps = {
    fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return fetchImpl(url, opts); },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: loc,
    chrome: { runtime: { sendMessage: (m) => { sent.push(m); } } },
    overlay: () => {}, overlayWarn: () => {}, button: () => '', escapeHtml: (s) => String(s), humanPause: async () => {},
    console: { log: () => {} },
  };
  const fns = new Function('deps', 'const { fetch, sessionStorage, location, chrome, overlay, overlayWarn, button, escapeHtml, humanPause, console } = deps;\n' + body + '\nreturn { ' + NAMES.join(', ') + ' };')(deps);
  return { fns, sent, store, loc, fetchCalls };
}
const jsonResp = (status, obj) => async () => ({ status, json: async () => obj });

test('removed (PostRemovedError) -> reports the item REMOVED via the normal delete message, with a note; no navigation', async () => {
  const h = harness(jsonResp(200, { error: { errorType: 'PostRemovedError', statusCode: 404 } }));
  const item = { id: 'cmrw99uuj001httrx6pq1x54y', title: 'Brass Table Lamp', reason: 'POLICY_INELIGIBLE', listingRefs: { POSHMARK: LAMP } };
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.strictEqual(h.fetchCalls.length, 1);
  assert.ok(h.fetchCalls[0].url.indexOf('/vm-rest/posts/' + LAMP) === 0);
  assert.strictEqual(h.fetchCalls[0].opts.credentials, 'include');
  assert.strictEqual(h.sent.length, 1);
  assert.strictEqual(h.sent[0].type, 'crossPlatformRemovalDeleted');
  assert.strictEqual(h.sent[0].platform, 'POSHMARK');
  assert.strictEqual(h.sent[0].itemId, item.id);
  assert.ok(/already removed on Poshmark/.test(h.sent[0].note));
  assert.strictEqual(h.loc.href, 'https://poshmark.com/closet/artifactm');
});

test('live and created by the signed-in seller -> sets fasPoshDeleteTargetId and navigates to edit-listing/<id>', async () => {
  const h = harness(jsonResp(200, livePost()));
  const item = { id: 'cmnzf780a0009pf19ru5qppqn', title: 'Celestion G12 Vintage 30 Guitar Speaker Cabinet with Stage Right', reason: 'POLICY_INELIGIBLE', listingRefs: { POSHMARK: CELESTION } };
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.strictEqual(h.store.fasPoshDeleteTargetId, CELESTION);
  assert.strictEqual(h.loc.href, 'https://poshmark.com/edit-listing/' + CELESTION);
  assert.strictEqual(h.sent.length, 0);
});

test('a second pass that never reached the edit page reports a bounded transient failure instead of navigating again', async () => {
  const h = harness(jsonResp(200, livePost()));
  const item = { id: 'cmnzf780a0009pf19ru5qppqn', title: 'x', reason: 'POLICY_INELIGIBLE', listingRefs: { POSHMARK: CELESTION } };
  await h.fns.poshRemoveByListingId(item, CLOSET);
  h.loc.href = 'https://poshmark.com/feed';
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.strictEqual(h.loc.href, 'https://poshmark.com/feed');
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalAttemptFailed', 'edit_page_not_reached']]);
});

test('the edit-page branch clears the loop guard when it arrives on the target listing', () => {
  const run = posh.slice(posh.indexOf('async function runPoshmarkRemovalQueue('));
  const arrive = run.indexOf('if (pageId && targetId && pageId === targetId) {');
  assert.ok(arrive > 0);
  assert.ok(/sessionStorage\.removeItem\('fasPoshIdNav'\)/.test(run.slice(arrive, arrive + 300)));
});

test('a live post by another seller is never touched: falls back to the title search', async () => {
  const h = harness(jsonResp(200, livePost({ creator_username: 'someoneelse' })));
  const item = { id: 'i', title: 't', reason: 'POLICY_INELIGIBLE', listingRefs: { POSHMARK: CELESTION } };
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), false);
  assert.strictEqual(h.store.fasPoshDeleteTargetId, undefined);
  assert.strictEqual(h.sent.length, 0);
  // Unknown signed-in seller (no closet URL) is also not enough to delete.
  const h2 = harness(jsonResp(200, livePost()));
  assert.strictEqual(await h2.fns.poshRemoveByListingId(item, null), false);
  assert.strictEqual(h2.store.fasPoshDeleteTargetId, undefined);
});

test('fetch error -> falls back to the title search (nothing sent, no navigation)', async () => {
  const h = harness(async () => { throw new TypeError('Failed to fetch'); });
  const item = { id: 'i', title: 't', reason: 'POLICY_INELIGIBLE', listingRefs: { POSHMARK: CELESTION } };
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), false);
  assert.strictEqual(h.sent.length, 0);
  assert.strictEqual(h.loc.href, 'https://poshmark.com/closet/artifactm');
  // Non-JSON / server error answers also fall back.
  const h2 = harness(async () => ({ status: 503, json: async () => { throw new Error('not json'); } }));
  assert.strictEqual(await h2.fns.poshRemoveByListingId(item, CLOSET), false);
  assert.strictEqual(h2.sent.length, 0);
});

test('sold -> the existing permanent already_sold_on_poshmark_permanent skip', async () => {
  const h = harness(jsonResp(200, livePost({ inventory: { status: 'sold_out' } })));
  const item = { id: 'i', title: 't', reason: 'SOLD_ELSEWHERE', listingRefs: { POSHMARK: CELESTION } };
  assert.strictEqual(await h.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.deepStrictEqual(h.sent.map((m) => [m.type, m.reason]), [['crossPlatformRemovalSkipped', 'already_sold_on_poshmark_permanent']]);
  assert.strictEqual(h.store.fasPoshDeleteTargetId, undefined);
});

test('RESYNC_VERIFY never deletes: live -> verify_still_live, removed -> listing_not_found (verifyOnly)', async () => {
  const live = harness(jsonResp(200, livePost()));
  const item = { id: 'i', title: 't', reason: 'RESYNC_VERIFY', listingRefs: { POSHMARK: CELESTION } };
  assert.strictEqual(await live.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.deepStrictEqual(live.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'verify_still_live', true]]);
  assert.strictEqual(live.store.fasPoshDeleteTargetId, undefined);
  assert.strictEqual(live.loc.href, 'https://poshmark.com/closet/artifactm');
  const gone = harness(jsonResp(200, { error: { errorType: 'PostRemovedError', statusCode: 404 } }));
  assert.strictEqual(await gone.fns.poshRemoveByListingId(item, CLOSET), true);
  assert.deepStrictEqual(gone.sent.map((m) => [m.type, m.reason, m.verifyOnly]), [['crossPlatformRemovalSkipped', 'listing_not_found', true]]);
});

test('no stored id -> no fetch, title search as before; listing URLs and ids both resolve', async () => {
  const h = harness(jsonResp(200, livePost()));
  assert.strictEqual(await h.fns.poshRemoveByListingId({ id: 'i', title: 't', listingRefs: {} }, CLOSET), false);
  assert.strictEqual(h.fetchCalls.length, 0);
  const id = h.fns.poshRemovalListingId;
  assert.strictEqual(id({ listingRefs: { POSHMARK: CELESTION.toUpperCase() } }), CELESTION);
  assert.strictEqual(id({ listingRefs: { POSHMARK: 'https://poshmark.com/listing/Celestion-Vintage-30-' + CELESTION } }), CELESTION);
  assert.strictEqual(id({ listingRefs: { POSHMARK: 'https://evil.example/listing/x-' + CELESTION } }), null);
  assert.strictEqual(id({ listingRefs: { POSHMARK: 'not-an-id' } }), null);
  assert.strictEqual(h.fns.poshClosetUsername('https://poshmark.com/closet/ArtifactM?x=1'), 'artifactm');
});

test('classifier: shapes read live 2026-10-27', () => {
  const h = harness(jsonResp(200, {}));
  const c = h.fns.poshClassifyPostLookup;
  assert.strictEqual(c(200, { error: { errorType: 'PostRemovedError', statusCode: 404 } }, 'artifactm').kind, 'removed');
  assert.strictEqual(c(404, null, 'artifactm').kind, 'removed');
  assert.strictEqual(c(200, livePost(), 'artifactm').kind, 'live_own');
  assert.strictEqual(c(200, { data: livePost() }, 'ArtifactM').kind, 'live_own');
  assert.strictEqual(c(200, livePost({ status: 'draft' }), 'artifactm').kind, 'unknown');
  assert.strictEqual(c(403, { error: { errorType: 'Forbidden', statusCode: 403 } }, 'artifactm').kind, 'unknown');
  assert.strictEqual(c(200, livePost({ creator_username: undefined }), 'artifactm').kind, 'unknown');
});

test('runPoshmarkRemovalQueue checks the id after the edit-page branch and before the listing-detail hop and every title search', () => {
  const run = posh.slice(posh.indexOf('async function runPoshmarkRemovalQueue('), posh.indexOf('async function maybeRunPoshmarkRemoval('));
  const idAt = run.indexOf('if (await poshRemoveByListingId(item, closetUrl)) return;');
  assert.ok(idAt > 0);
  assert.ok(idAt > run.indexOf("location.pathname.indexOf('/edit-listing/') !== -1"));
  assert.ok(idAt < run.indexOf("location.pathname.indexOf('/listing/') === 0"));
  assert.ok(idAt < run.indexOf('findPoshmarkClosetMatchByTitle(item.title)'));
  assert.ok(idAt < run.indexOf('poshRemSearchQuery(item.title, 5)'));
});

test('background logs the delete note and still posts /removed (REMOVE/REMOVED)', () => {
  const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const h = bg.slice(bg.indexOf("msg.type === 'crossPlatformRemovalDeleted'"), bg.indexOf("msg.type === 'crossPlatformRemovalSkipped'"));
  assert.ok(/\/removed'/.test(h));
  assert.ok(/if \(msg\.note\) fasLog\(/.test(h));
});

test('manifest is 1.0.81', () => {
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version, '1.0.81');
});
