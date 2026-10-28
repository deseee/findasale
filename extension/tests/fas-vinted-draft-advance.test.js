// 1.0.76 (2026-10-27): Vinted drafts-only queue auto-advance. Live: after Save draft Vinted leaves the form for the member
// profile and the queue stalled on a "Finished with <next item>?" prompt. Now the draft is confirmed in the organizer's own
// wardrobe (is_draft: true, same title, new since the fill started) before the queue moves on, paced like the other queues;
// otherwise the Continue / Not yet prompt shows. Later uploads of recorded drafts are recorded through markListed with the
// Vinted id. Upload is never pressed. Pure helpers are tested directly; the content-script functions are extracted from
// fas-vinted.js and run against stubs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const D = require('../fas-vinted-drafts.js');
const src = rd('fas-vinted.js');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const START = Date.UTC(2026, 9, 27, 15, 0, 0);
const row = (id, title, isDraft, extra) => Object.assign({ id: Number(id), title, is_draft: isDraft }, extra || {});

// ---- pure: confirming the draft ----------------------------------------------------------------------------------
test('a new same-title draft absent from the pre-save snapshot is confirmed; the newest wins', () => {
  const pending = { itemId: 'it1', title: 'Blue  Wool Scarf', altTitle: 'BLUE WOOL SCARF', startedAt: START, priorDraftIds: ['100'] };
  const items = [row(103, 'blue wool scarf', true), row(102, 'Blue Wool Scarf', true), row(100, 'Blue Wool Scarf', true), row(101, 'Blue Wool Scarf', false)];
  assert.deepStrictEqual(D.findConfirmedDraft(items, pending, []), { draftId: '103', createdAt: null });
  // A draft id already recorded for an earlier fill is never reused.
  assert.strictEqual(D.findConfirmedDraft(items, pending, ['103']).draftId, '102');
});

test('only drafts count: a live listing with the same title is not a saved draft', () => {
  const pending = { itemId: 'it1', title: 'Lamp shade brass', startedAt: START, priorDraftIds: [] };
  assert.strictEqual(D.findConfirmedDraft([row(5, 'Lamp shade brass', false)], pending, []), null);
  assert.strictEqual(D.findConfirmedDraft([row(5, 'Other title here', true)], pending, []), null);
});

test('a timestamped draft older than the fill start is an old draft, not this one', () => {
  const pending = { itemId: 'it1', title: 'Lamp shade brass', startedAt: START, priorDraftIds: null };
  const old = row(7, 'Lamp shade brass', true, { created_at_ts: new Date(START - 60 * 60 * 1000).toISOString() });
  const fresh = row(8, 'Lamp shade brass', true, { photo: { high_resolution: { timestamp: Math.floor((START + 30000) / 1000) } } });
  assert.strictEqual(D.findConfirmedDraft([old], pending, []), null);
  assert.strictEqual(D.findConfirmedDraft([old, fresh], pending, []).draftId, '8');
});

test('with no snapshot and no timestamp there is no proof the draft is new: not confirmed', () => {
  const pending = { itemId: 'it1', title: 'Lamp shade brass', startedAt: START, priorDraftIds: null };
  assert.strictEqual(D.findConfirmedDraft([row(9, 'Lamp shade brass', true)], pending, []), null);
});

test('decision after leaving review: confirmed -> advance, unconfirmed -> prompt, another item -> none', () => {
  const pending = { itemId: 'it1' };
  assert.strictEqual(D.decideAfterLeavingReview(pending, 'it1', { draftId: '5' }), 'advance');
  assert.strictEqual(D.decideAfterLeavingReview(pending, 'it1', null), 'prompt');
  assert.strictEqual(D.decideAfterLeavingReview(pending, 'it2', { draftId: '5' }), 'none');
  assert.strictEqual(D.decideAfterLeavingReview(null, 'it1', { draftId: '5' }), 'none');
});

// ---- pure: recording uploads --------------------------------------------------------------------------------------
test('upload matcher: a recorded draft id now live (is_draft false) is reported with that id as the remote listing id', () => {
  const drafts = [
    { itemId: 'a', draftId: '11', at: START },
    { itemId: 'b', draftId: '12', at: START },
    { itemId: 'c', draftId: '13', at: START, listedAt: START + 5 },
    { itemId: 'd', draftId: '14', at: START },
  ];
  const items = [row(11, 'x', false), row(12, 'y', true), row(13, 'z', false), row(99, 'w', false)];
  assert.deepStrictEqual(D.findUploadedDrafts(items, drafts), [{ itemId: 'a', remoteListingId: '11' }]);
  assert.deepStrictEqual(D.findUploadedDrafts([], drafts), []);
});

test('pruneDrafts drops malformed, expired, long-listed and duplicate rows', () => {
  const now = START;
  const out = D.pruneDrafts([
    { itemId: 'a', draftId: '1', at: now - 1000 },
    { itemId: 'a', draftId: '1', at: now - 500 },
    { itemId: 'b', draftId: 'x1', at: now },
    { itemId: 'c', draftId: '3', at: now - 61 * 24 * 3600 * 1000 },
    { itemId: 'd', draftId: '4', at: now - 9 * 24 * 3600 * 1000, listedAt: now - 8 * 24 * 3600 * 1000 },
    { itemId: 'e', draftId: '5', at: now - 2 * 24 * 3600 * 1000, listedAt: now - 24 * 3600 * 1000 },
  ], now);
  assert.deepStrictEqual(out.map((d) => d.draftId), ['1', '5']);
});

test('the pure module never clicks, fetches or touches chrome', () => {
  const m = codeOnly(rd('fas-vinted-drafts.js'));
  assert.ok(!/\.click\(|fetch\(|chrome\./.test(m));
});

// ---- the content-script functions, extracted and run against stubs ------------------------------------------------
function extract(name) {
  const i = src.indexOf('  async function ' + name + '(');
  assert.ok(i > 0, name + ' not found');
  const end = src.indexOf('\n  }\n', i);
  return src.slice(i, end + 4);
}

function harness(opts) {
  const store = Object.assign({}, opts.store || {});
  const sent = [];
  const sleeps = [];
  const loc = { origin: 'https://www.vinted.com', pathname: opts.pathname || '/member/555', href: '' };
  const fetches = [];
  const env = {
    FVD: D,
    T: { info: () => {}, warn: () => {}, step: () => {}, end: () => {} },
    console: { log: () => {}, warn: () => {} },
    location: loc,
    LISTING_URL_HINT: 'https://www.vinted.com/items/new',
    VINT_REM_API_PER_PAGE: 20,
    VINT_REM_API_MAX_PAGES: 25,
    VINTED_OWN_PROFILE_URL_STORAGE_KEY: 'fasVintedOwnProfileUrl',
    FAS_VINTED_PENDING_DRAFT_KEY: 'fasVintedPendingDraft',
    FAS_VINTED_DRAFTS_KEY: 'fasVintedDrafts',
    FAS_VINTED_DRAFT_UPLOAD_CHECK_KEY: 'fasVintedDraftUploadCheckAt',
    FAS_VINTED_DRAFT_UPLOAD_CHECK_MS: 15 * 60 * 1000,
    FAS_VINTED_PENDING_DRAFT_TTL_MS: 2 * 60 * 60 * 1000,
    vintRemRunning: false,
    fasContextAlive: () => true,
    vintRemMemberIdFromLocation: () => { const m = /^\/member\/(\d+)/.exec(loc.pathname); return m ? m[1] : null; },
    vintRemStorageGet: async (k) => (k in store ? store[k] : null),
    vintRemStorageSet: async (k, v) => { store[k] = v; },
    sleep: async (ms) => { sleeps.push(ms); },
    guessedQueueDelayMs: () => 17000,
    startQueueDelayCountdown: () => {},
    fasVintedRecordPost: async () => {},
    escapeHtml: (s) => String(s),
    overlay: () => {},
    button: () => '',
    closeBtnHandler: () => {},
    fetch: async (url) => {
      fetches.push(url);
      const page = Number(/[?&]page=(\d+)/.exec(url)[1]);
      const items = opts.wardrobe(page, fetches.length);
      return { ok: true, json: async () => ({ items, pagination: { total_pages: opts.totalPages || 1 } }) };
    },
    chrome: {
      storage: { local: {
        get: async (keys) => { const o = {}; keys.forEach((k) => { if (k in store) o[k] = store[k]; }); return o; },
        set: async (o) => { Object.assign(store, o); },
        remove: async (k) => { delete store[k]; },
      } },
      runtime: { sendMessage: async (msg) => { sent.push(msg); return opts.onMessage ? opts.onMessage(msg) : { ok: true }; } },
    },
  };
  const names = ['fasVintedOwnMemberIdForDrafts', 'fasVintedWardrobePage', 'fasVintedGetDrafts', 'fasVintedGetPendingDraft',
    'fasVintedClearPendingDraft', 'fasVintedConfirmPendingDraft', 'fasVintedRecordUploadedDrafts'];
  const body = 'let fasVintedAdvancing = false, fasVintedConfirmBusy = false, fasVintedConfirmTriedFor = "";\n' +
    names.map(extract).join('\n') +
    '\nreturn { confirm: fasVintedConfirmPendingDraft, uploads: fasVintedRecordUploadedDrafts, advancing: () => fasVintedAdvancing };';
  const api = new Function(...Object.keys(env), body)(...Object.values(env));
  return { api, store, sent, sleeps, loc, fetches };
}

const pendingFor = (over) => Object.assign({
  itemId: 'it1', title: 'Blue Wool Scarf', altTitle: 'Blue Wool Scarf', startedAt: Date.now() - 60000, clickedAt: Date.now() - 5000, priorDraftIds: ['100'],
}, over || {});
const queueOn = (current, next) => (msg) => {
  if (msg.type === 'getVintedQueueItem') return { ok: true, item: { id: current, title: 'Blue Wool Scarf' }, index: 0, total: 3 };
  if (msg.type === 'advanceVintedQueue') return { ok: true, item: next ? { id: next, title: 'Next Thing' } : null, index: 1, total: 3 };
  return { ok: true };
};

test('confirmed draft: recorded, trace saved, queue advanced, next item opened after the paced delay; no markListed', async () => {
  const h = harness({
    store: { fasVintedPendingDraft: pendingFor(), fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me', fasVintedReachedReview: { it1: 1 } },
    wardrobe: () => [row(104, 'Blue Wool Scarf', true), row(100, 'Blue Wool Scarf', true)],
    onMessage: queueOn('it1', 'it2'),
  });
  const r = await h.api.confirm('left_review');
  assert.strictEqual(r, 'advanced');
  assert.deepStrictEqual(h.store.fasVintedDrafts.map((d) => [d.itemId, d.draftId]), [['it1', '104']]);
  assert.ok(!('fasVintedPendingDraft' in h.store));
  assert.deepStrictEqual(h.store.fasVintedReachedReview, {});
  const types = h.sent.map((m) => m.type);
  assert.deepStrictEqual(types, ['getVintedQueueItem', 'advanceVintedQueue']);
  assert.ok(!types.includes('markListed'));
  assert.ok(h.sleeps.includes(17000), 'waited the same 10-25s pacing before opening the next item');
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/items/new');
  assert.ok(/order=newest_first/.test(h.fetches[0]) && /\/api\/v2\/wardrobe\/555\/items/.test(h.fetches[0]));
  assert.strictEqual(h.api.advancing(), true);
});

test('unconfirmed draft: three wardrobe reads, then the prompt path; the queue does not move and nothing is marked', async () => {
  const h = harness({
    store: { fasVintedPendingDraft: pendingFor(), fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me' },
    wardrobe: () => [row(100, 'Blue Wool Scarf', true)],
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_review'), 'unconfirmed');
  assert.strictEqual(h.fetches.length, 3);
  assert.deepStrictEqual(h.sent.map((m) => m.type), ['getVintedQueueItem']);
  assert.ok('fasVintedPendingDraft' in h.store);
  assert.strictEqual(h.loc.href, '');
  // Same page again (the 800ms watcher): no second burst of wardrobe reads.
  assert.strictEqual(await h.api.confirm('left_review'), 'unconfirmed');
  assert.strictEqual(h.fetches.length, 3);
});

test('a pending draft for a different queued item is stale: cleared, today\'s behavior applies', async () => {
  const h = harness({
    store: { fasVintedPendingDraft: pendingFor(), fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me' },
    wardrobe: () => [row(104, 'Blue Wool Scarf', true)],
    onMessage: queueOn('other', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_review'), 'none');
  assert.ok(!('fasVintedPendingDraft' in h.store));
  assert.strictEqual(h.fetches.length, 0);
});

test('no own member id (no cache, not right after our own Save draft) -> unconfirmed, nothing read', async () => {
  const h = harness({
    store: { fasVintedPendingDraft: pendingFor({ clickedAt: Date.now() - 10 * 60 * 1000 }) },
    pathname: '/member/777',
    wardrobe: () => [row(104, 'Blue Wool Scarf', true)],
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_review'), 'unconfirmed');
  assert.strictEqual(h.fetches.length, 0);
});

test('last item: confirmed draft finishes the queue without navigating', async () => {
  const h = harness({
    store: { fasVintedPendingDraft: pendingFor(), fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me' },
    wardrobe: () => [row(104, 'Blue Wool Scarf', true)],
    onMessage: queueOn('it1', null),
  });
  assert.strictEqual(await h.api.confirm('left_review'), 'finished');
  assert.strictEqual(h.loc.href, '');
});

test('upload check: a recorded draft now posted is marked listed with its Vinted id, once, and throttled', async () => {
  const now = Date.now();
  const h = harness({
    store: {
      fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me',
      fasVintedDrafts: [{ itemId: 'it1', draftId: '104', at: now - 1000 }, { itemId: 'it2', draftId: '105', at: now - 1000 }],
    },
    wardrobe: () => [row(104, 'Blue Wool Scarf', false), row(105, 'Other', true)],
  });
  await h.api.uploads();
  const marks = h.sent.filter((m) => m.type === 'markListed');
  assert.deepStrictEqual(marks, [{ type: 'markListed', itemId: 'it1', remoteListingId: '104', platform: 'VINTED' }]);
  assert.ok(h.store.fasVintedDrafts.find((d) => d.draftId === '104').listedAt > 0);
  assert.ok(!h.store.fasVintedDrafts.find((d) => d.draftId === '105').listedAt);
  await h.api.uploads(); // within 15 minutes: no second read
  assert.strictEqual(h.fetches.length, 1);
});

test('upload check does nothing without recorded drafts', async () => {
  const h = harness({ store: { fasVintedOwnProfileUrl: 'https://www.vinted.com/member/555-me' }, wardrobe: () => [] });
  await h.api.uploads();
  assert.strictEqual(h.fetches.length, 0);
  assert.strictEqual(h.sent.length, 0);
});

// ---- wiring in fas-vinted.js --------------------------------------------------------------------------------------
test('Save draft no longer advances the queue before the click; it records a pending draft instead', () => {
  const i = src.indexOf('fasVintedSaveDraftNow = async (why)');
  const body = src.slice(i, src.indexOf('\n    };\n', i));
  assert.ok(/FAS_VINTED_PENDING_DRAFT_KEY/.test(body));
  assert.ok(!/advanceVintedQueue/.test(body));
  assert.ok(!/markListed/.test(body));
  assert.ok(/fasVintedConfirmPendingDraft\('after_save_click'\)/.test(body));
});

test('leaving the review screen confirms first; an unconfirmed draft keeps the Continue / Not yet prompt and never marks listed', () => {
  const i = src.indexOf('async function maybeShowVintedContinuePrompt()');
  const body = src.slice(i, src.indexOf('\n  }\n', i));
  assert.ok(body.indexOf("fasVintedConfirmPendingDraft('left_review')") < body.indexOf("'Continue to next item &#9654;'"));
  assert.ok(/draftOutcome === 'advanced'/.test(body));
  assert.ok(/button\('fas-vin-close', 'Not yet', false\)/.test(body));
  assert.ok(/if \(!draftPending\) try \{ const mr = await chrome\.runtime\.sendMessage\(\{ type: 'markListed'/.test(body));
});

test('start() does not fill an item twice while its draft is pending, and the upload check runs on page load', () => {
  assert.ok(/if \(await fasVintedHasPendingDraftFor\(queued\.item\.id\)\) \{ await maybeShowVintedContinuePrompt\(\); return; \}/.test(src));
  assert.ok(/setTimeout\(\(\) => \{ fasVintedRecordUploadedDrafts\(\); \}/.test(src));
});

test('never Upload: the only new click is the Save draft button, and the manifest loads the helper first', () => {
  const code = codeOnly(src);
  assert.ok(!/upload[^\n]{0,80}\.click\(\)/i.test(code));
  const clicks = code.match(/[A-Za-z_$][\w$]*\.click\(\)/g) || [];
  assert.ok(clicks.includes('sbtn.click()'));
  const confirmFn = extract('fasVintedConfirmPendingDraft') + extract('fasVintedRecordUploadedDrafts');
  assert.ok(!/\.click\(/.test(confirmFn));
  const man = JSON.parse(rd('manifest.json'));
  const vs = man.content_scripts.find((c) => c.js.indexOf('fas-vinted.js') !== -1).js;
  assert.ok(vs.indexOf('fas-vinted-drafts.js') !== -1 && vs.indexOf('fas-vinted-drafts.js') < vs.indexOf('fas-vinted.js'));
  assert.strictEqual(man.version, '1.0.76');
});
