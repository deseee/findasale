// 1.0.77 (owner decision 2026-10-27): no Vinted drafts. The extension fills the listing, stops with Vinted's own form
// ready, and detects the organizer's own Upload: recorded with its Vinted id (markListed), then the queue advances at
// the usual pacing. No upload found -> the Continue / Not yet prompt, where Continue only advances (never marks listed).
// Vinted's form reset -> the same never-submitted listing is filled in again, 2 times per item, then the prompt.
// Duplicate guard (1.0.78: live only): an item already live on Vinted is skipped; a Vinted draft never blocks a fill.
// The popup marks live items, leaves them out of Select all, and keeps them selectable. Uploaded 1.0.63-1.0.76 drafts
// are still recorded.
// Pure helpers are tested directly; the content-script functions are extracted from fas-vinted.js and run against stubs.
// (Replaces the 1.0.76 draft-advance tests.)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const D = require('../fas-vinted-drafts.js');
const src = rd('fas-vinted.js');

const START = Date.UTC(2026, 9, 27, 15, 0, 0);
const row = (id, title, isDraft, extra) => Object.assign({ id: Number(id), title, is_draft: isDraft }, extra || {});

// ---- pure: the organizer's upload ---------------------------------------------------------------------------------
test('upload: a new same-title live listing absent from the snapshot is the upload; drafts and old listings are not', () => {
  const pending = { itemId: 'it1', title: 'Blue  Wool Scarf', altTitle: 'BLUE WOOL SCARF', startedAt: START, priorLiveIds: ['100'] };
  const items = [row(103, 'blue wool scarf', false), row(105, 'Blue Wool Scarf', true), row(100, 'Blue Wool Scarf', false), row(102, 'Blue Wool Scarf', false, { is_closed: true })];
  assert.deepStrictEqual(D.findOrganizerUpload(items, pending, []), { listingId: '103', createdAt: null });
  assert.strictEqual(D.findOrganizerUpload(items, pending, ['103']), null); // already recorded for another fill
  assert.strictEqual(D.findOrganizerUpload([row(105, 'Blue Wool Scarf', true)], pending, []), null); // a draft is not an upload
});

test('upload: a timestamped listing older than the fill is not it; no snapshot and no timestamp is no proof', () => {
  const pending = { itemId: 'it1', title: 'Lamp shade brass', startedAt: START, priorLiveIds: null };
  const old = row(7, 'Lamp shade brass', false, { created_at_ts: new Date(START - 60 * 60 * 1000).toISOString() });
  const fresh = row(8, 'Lamp shade brass', false, { photo: { high_resolution: { timestamp: Math.floor((START + 30000) / 1000) } } });
  assert.strictEqual(D.findOrganizerUpload([old], pending, []), null);
  assert.strictEqual(D.findOrganizerUpload([old, fresh], pending, []).listingId, '8');
  assert.strictEqual(D.findOrganizerUpload([row(9, 'Lamp shade brass', false)], pending, []), null);
  // The snapshot never counts a row created after the fill started as "already there".
  assert.deepStrictEqual(D.liveIdsWithTitle([old, fresh, row(9, 'Lamp shade brass', false)], pending, START), ['7', '9']);
});

test('decisions: found -> advance, not found -> prompt, other item -> none; refills capped at 2', () => {
  assert.strictEqual(D.decideAfterLeavingForm({ itemId: 'it1' }, 'it1', { listingId: '5' }), 'advance');
  assert.strictEqual(D.decideAfterLeavingForm({ itemId: 'it1' }, 'it1', null), 'prompt');
  assert.strictEqual(D.decideAfterLeavingForm({ itemId: 'it1' }, 'it2', { listingId: '5' }), 'none');
  assert.strictEqual(D.MAX_REFILLS, 2);
  assert.strictEqual(D.decideOnBlankForm({ itemId: 'it1', refills: 0 }, 'it1'), 'refill');
  assert.strictEqual(D.decideOnBlankForm({ itemId: 'it1', refills: 1 }, 'it1'), 'refill');
  assert.strictEqual(D.decideOnBlankForm({ itemId: 'it1', refills: 2 }, 'it1'), 'prompt');
  assert.strictEqual(D.decideOnBlankForm({ itemId: 'it1', refills: 0 }, 'it2'), 'none');
});

test('duplicate guard (pure, 1.0.78 live only): recorded listing, uploaded draft, same-title live; drafts never count', () => {
  const it = { itemId: 'it1', title: 'Blue Wool Scarf' };
  assert.deepStrictEqual(D.findAlreadyPresent(null, it, [], { listed: true }), { kind: 'live', remoteId: null, source: 'recorded_listing' });
  assert.strictEqual(D.findAlreadyPresent(null, it, [{ itemId: 'it1', draftId: '50' }], {}), null); // unread wardrobe: a recorded draft is not proof
  assert.strictEqual(D.findAlreadyPresent([row(50, 'Renamed', true)], it, [{ itemId: 'it1', draftId: '50' }], {}), null, 'a recorded draft still a draft does not block');
  assert.deepStrictEqual(D.findAlreadyPresent([row(50, 'Renamed', false)], it, [{ itemId: 'it1', draftId: '50' }], {}), { kind: 'live', remoteId: '50', source: 'recorded_draft_uploaded' });
  assert.strictEqual(D.findAlreadyPresent([row(61, 'blue wool  scarf', true)], it, [], {}), null, 'a same-title draft does not block');
  assert.deepStrictEqual(D.findAlreadyPresent([row(62, 'blue wool  scarf', false)], it, [], {}), { kind: 'live', remoteId: '62', source: 'wardrobe_title' });
  assert.deepStrictEqual(D.findAlreadyPresent([row(61, 'Blue Wool Scarf', true), row(62, 'Blue Wool Scarf', false)], it, [], {}).kind, 'live');
  assert.strictEqual(D.findAlreadyPresent([row(63, 'Blue Wool Scarf', false, { is_closed: true }), row(64, 'Other', false)], it, [], {}), null);
  assert.strictEqual(D.findAlreadyPresent([row(50, 'x', true)], it, [{ itemId: 'other', draftId: '50' }], {}), null);
});

test('popup marks (1.0.78): recorded live and live guard results only; drafts and old draft results are never marked', () => {
  const now = START;
  assert.strictEqual(D.popupPresence({ id: 'a', marketplaceListedVinted: true }, [], {}, now), 'live');
  assert.strictEqual(D.popupPresence({ id: 'b' }, [], { b: { kind: 'draft', at: now - 1000 } }, now), null);
  assert.strictEqual(D.popupPresence({ id: 'b' }, [], { b: { kind: 'live', remoteId: '7001', at: now - 1000 } }, now), 'live');
  assert.strictEqual(D.popupPresence({ id: 'b' }, [], { b: { kind: 'live', remoteId: '7001', at: now - 31 * 24 * 3600 * 1000 } }, now), null);
  assert.strictEqual(D.popupPresence({ id: 'c' }, [{ itemId: 'c', draftId: '9', at: now }], {}, now), null);
  assert.deepStrictEqual(D.prunePresent({ b: { kind: 'draft', at: now }, l: { kind: 'live', remoteId: '7002', at: now } }, now), { l: { kind: 'live', remoteId: '7002', at: now } });
  assert.strictEqual(D.popupPresence({ id: 'c' }, [{ itemId: 'c', draftId: '9', at: now, listedAt: now }], {}, now), null);
  assert.strictEqual(D.popupPresence({ id: 'd' }, [], {}, now), null);
});

// ---- the content-script functions, extracted and run against stubs ------------------------------------------------
function extract(name) {
  let i = src.indexOf('  async function ' + name + '(');
  if (i < 0) i = src.indexOf('  function ' + name + '(');
  assert.ok(i > 0, name + ' not found');
  const end = src.indexOf('\n  }\n', i);
  return src.slice(i, end + 4);
}

function harness(opts) {
  const store = Object.assign({}, opts.store || {});
  const sent = [];
  const sleeps = [];
  const events = [];
  const overlays = [];
  const runs = [];
  const els = {};
  const sess = {};
  const loc = { origin: 'https://www.vinted.com', pathname: opts.pathname || '/member/555', search: opts.search || '', href: '' };
  const fetches = [];
  const form = Object.assign({ title: '', description: '', present: true }, opts.form || {});
  const ev = (kind) => (code, msg, ctx) => events.push({ kind, code, msg, ctx });
  const env = {
    FVD: D,
    T: { info: ev('info'), warn: ev('warn'), step: () => {}, end: () => {}, begin: () => {}, ok: () => {}, problem: ev('problem') },
    console: { log: () => {}, warn: () => {} },
    location: loc,
    document: { getElementById: (id) => (els[id] = els[id] || { id, disabled: false, textContent: '' }) },
    sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); } },
    LISTING_URL_HINT: 'https://www.vinted.com/items/new',
    VINT_REM_API_PER_PAGE: 20,
    VINT_REM_API_MAX_PAGES: 25,
    VINTED_OWN_PROFILE_URL_STORAGE_KEY: 'fasVintedOwnProfileUrl',
    FAS_VINTED_PENDING_UPLOAD_KEY: 'fasVintedPendingUpload',
    FAS_VINTED_DRAFTS_KEY: 'fasVintedDrafts',
    FAS_VINTED_AWAITING_KEY: 'fasVintedAwaitingUpload',
    FAS_VINTED_PRESENT_KEY: 'fasVintedPresent',
    FAS_VINTED_DRAFT_UPLOAD_CHECK_KEY: 'fasVintedDraftUploadCheckAt',
    FAS_VINTED_DRAFT_UPLOAD_CHECK_MS: 15 * 60 * 1000,
    FAS_VINTED_PENDING_UPLOAD_TTL_MS: 2 * 60 * 60 * 1000,
    FAS_VINTED_PRESENCE_MAX_PAGES: 10,
    FAS_VINTED_REFILL_NOTE: 'Vinted reset the form, so it was filled in again.',
    FAS_VINTED_DETAIL_PATH_RE: /^\/items\/(\d{1,20})(?:-[^/]*)?\/?$/,
    vintRemRunning: false,
    fasContextAlive: () => true,
    fasContextGone: () => false,
    vintRemMemberIdFromLocation: () => { const m = /^\/member\/(\d+)/.exec(loc.pathname); return m ? m[1] : null; },
    vintRemStorageGet: async (k) => (k in store ? store[k] : null),
    vintRemStorageSet: async (k, v) => { store[k] = v; },
    vintRemNorm: D.fold,
    vintRemDetailPageTitleMatches: (w) => w === D.fold(opts.pageTitle || ''),
    vintCapHasOwnerControls: () => opts.ownerControls === true,
    vintCapForgetFill: () => {},
    vintCapOwnMemberId: async () => null,
    // Resolves on the next macrotask, so a bounded wait (Promise.race with sleep) never beats the stubbed work.
    sleep: (ms) => { sleeps.push(ms); return new Promise((r) => setImmediate(r)); },
    humanPause: async () => {},
    guessedQueueDelayMs: () => 17000,
    startQueueDelayCountdown: () => {},
    clearQueueDelayCountdown: () => {},
    fasVintedRecordPost: async () => {},
    escapeHtml: (s) => String(s),
    overlay: (h) => overlays.push(h),
    button: (id, label) => '[' + id + ':' + label + ']',
    closeBtnHandler: () => {},
    fasArmButton: () => {},
    fieldByLabel: (l) => (form.present ? { value: l === 'Title' ? form.title : form.description } : null),
    looksLikeListingForm: () => form.present,
    vintedCategoryValue: () => form.category || '', // 1.0.79: a chosen category means the form was not reset
    run: async (item, index, total) => { runs.push({ id: item.id, index, total }); },
    fetch: async (url) => {
      fetches.push(url);
      const page = Number(/[?&]page=(\d+)/.exec(url)[1]);
      const items = opts.wardrobe ? opts.wardrobe(page, fetches.length) : [];
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
  const names = ['fasVintedOwnMemberId', 'fasVintedWardrobePage', 'fasVintedGetDrafts', 'fasVintedGetPendingUpload',
    'fasVintedClearPendingUpload', 'fasVintedItemPageUploadId', 'fasVintedConfirmPendingUpload', 'fasVintedRecordUploadAndAdvance',
    'fasVintedRememberAwaiting', 'fasVintedFormLooksBlank', 'fasVintedHandleFormReset', 'fasVintedFindPresence',
    'fasVintedSkipIfAlreadyPresent', 'fasVintedRecordUploadedDrafts', 'maybeShowVintedContinuePrompt', 'fasVintedNoteUploadClick'];
  const body = 'let fasVintedFillStartedAt = 0, fasVintedConfirmBusy = false, fasVintedConfirmTriedFor = "", fasVintedAdvancing = false,' +
    ' fasVintedRefilling = false, fasVintedRefillNote = "", fasVintedLastUploadClickAt = 0, fasVintedPreFillLiveIds = null,' +
    ' fasVintedResetWatchToken = 0, fasVintedDisarmReview = () => { disarms.n++; };\n' +
    names.map(extract).join('\n') +
    '\nreturn { confirm: fasVintedConfirmPendingUpload, prompt: maybeShowVintedContinuePrompt, reset: fasVintedHandleFormReset,' +
    ' skip: fasVintedSkipIfAlreadyPresent, uploads: fasVintedRecordUploadedDrafts, blank: fasVintedFormLooksBlank, noteClick: fasVintedNoteUploadClick,' +
    ' state: () => ({ advancing: fasVintedAdvancing, refillNote: fasVintedRefillNote, preFill: fasVintedPreFillLiveIds }) };';
  const disarms = { n: 0 };
  const api = new Function('disarms', ...Object.keys(env), body)(disarms, ...Object.values(env));
  return { api, store, sent, sleeps, events, overlays, runs, els, loc, fetches, form, disarms };
}

const ME = 'https://www.vinted.com/member/555-me';
const pendingFor = (over) => Object.assign({
  itemId: 'it1', title: 'Blue Wool Scarf', altTitle: 'Blue Wool Scarf', startedAt: Date.now() - 60000, armedAt: Date.now() - 5000,
  refills: 0, priorLiveIds: ['100'], uploadClickedAt: 0,
}, over || {});
const queueOn = (current, next, extra) => (msg) => {
  if (msg.type === 'getVintedQueueItem') return { ok: true, item: { id: current, title: 'Blue Wool Scarf' }, index: 0, total: 3 };
  if (msg.type === 'advanceVintedQueue') return { ok: true, item: next ? { id: next, title: 'Next Thing' } : null, index: 1, total: 3 };
  if (extra) return extra(msg);
  return { ok: true };
};
const types = (h) => h.sent.map((m) => m.type);

test('organizer upload (wardrobe): recorded with its Vinted id, then the queue advances at the usual pacing', async () => {
  const h = harness({
    store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME, fasVintedReachedReview: { it1: 1 } },
    wardrobe: () => [row(104, 'Blue Wool Scarf', false), row(100, 'Blue Wool Scarf', false), row(101, 'Blue Wool Scarf', true)],
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_form'), 'advanced');
  assert.deepStrictEqual(types(h), ['getVintedQueueItem', 'markListed', 'advanceVintedQueue']);
  assert.deepStrictEqual(h.sent[1], { type: 'markListed', itemId: 'it1', remoteListingId: '104', platform: 'VINTED' });
  assert.ok(h.events.some((e) => e.code === 'vinted_upload_recorded' && e.ctx.remoteListingId === '104'));
  assert.ok(!('fasVintedPendingUpload' in h.store));
  assert.deepStrictEqual(h.store.fasVintedReachedReview, {});
  assert.ok(h.sleeps.includes(17000), 'waited the same 10-25s pacing before opening the next item');
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/items/new');
  assert.ok(/order=newest_first/.test(h.fetches[0]) && /\/api\/v2\/wardrobe\/555\/items/.test(h.fetches[0]));
  assert.strictEqual(h.api.state().advancing, true);
  assert.ok(h.disarms.n >= 1, 'the review leave-guard is taken down before navigating');
});

test('organizer upload (URL changed to /items/<id>): own listing with the filled title is recorded with that id, no wardrobe read', async () => {
  const h = harness({
    pathname: '/items/7788-blue-wool-scarf', ownerControls: true, pageTitle: 'Blue Wool Scarf',
    store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME },
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_form'), 'advanced');
  assert.deepStrictEqual(h.sent.find((m) => m.type === 'markListed'), { type: 'markListed', itemId: 'it1', remoteListingId: '7788', platform: 'VINTED' });
  assert.strictEqual(h.fetches.length, 0);
});

test('an older same-title listing page is not taken for the upload', async () => {
  const h = harness({
    pathname: '/items/100-blue-wool-scarf', ownerControls: true, pageTitle: 'Blue Wool Scarf',
    store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME },
    wardrobe: () => [row(100, 'Blue Wool Scarf', false)],
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_form'), 'unconfirmed');
  assert.ok(!types(h).includes('markListed'));
});

test('last item: the upload is recorded and the queue finishes without navigating', async () => {
  const h = harness({
    store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME },
    wardrobe: () => [row(104, 'Blue Wool Scarf', false)],
    onMessage: queueOn('it1', null),
  });
  assert.strictEqual(await h.api.confirm('left_form'), 'finished');
  assert.ok(types(h).includes('markListed'));
  assert.strictEqual(h.loc.href, '');
});

test('the post-Upload landing (?promo_shown) is trusted for the member id when none is cached', async () => {
  const h = harness({
    pathname: '/member/555', search: '?promo_shown=true',
    store: { fasVintedPendingUpload: pendingFor() },
    wardrobe: () => [row(104, 'Blue Wool Scarf', false)],
    onMessage: queueOn('it1', 'it2'),
  });
  assert.strictEqual(await h.api.confirm('left_form'), 'advanced');
  // Without the landing marker or an Upload click, a /member page is not assumed to be the organizer's own.
  const h2 = harness({ pathname: '/member/777', store: { fasVintedPendingUpload: pendingFor() }, wardrobe: () => [row(104, 'Blue Wool Scarf', false)], onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h2.api.confirm('left_form'), 'unconfirmed');
  assert.strictEqual(h2.fetches.length, 0);
});

test('left without uploading: the prompt shows; Continue only advances and never marks the item listed', async () => {
  const h = harness({
    store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME },
    wardrobe: () => [row(100, 'Blue Wool Scarf', false)],
    onMessage: queueOn('it1', 'it2'),
  });
  await h.api.prompt('left_form');
  assert.strictEqual(h.fetches.length, 3, 'three wardrobe reads before asking');
  const shown = h.overlays[h.overlays.length - 1];
  assert.ok(/Did you click Upload for <b>Blue Wool Scarf<\/b>\?/.test(shown));
  assert.ok(/\[fas-vin-continue:Continue to next item/.test(shown) && /\[fas-vin-close:Not yet\]/.test(shown));
  assert.ok(!types(h).includes('markListed'));
  assert.strictEqual(h.loc.href, '');
  await h.els['fas-vin-continue'].onclick();
  assert.ok(!types(h).includes('markListed'), 'Continue never marks listed');
  assert.ok(types(h).includes('advanceVintedQueue'));
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/items/new');
  assert.ok(!('fasVintedPendingUpload' in h.store));
  assert.deepStrictEqual(h.store.fasVintedAwaitingUpload.map((a) => a.itemId), ['it1'], 'watched for a late upload');
  assert.ok(h.events.some((e) => e.code === 'vinted_continue_without_upload'));
});

test('"Not yet" leaves everything as is: no advance, no mark', async () => {
  const h = harness({ store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME }, wardrobe: () => [], onMessage: queueOn('it1', 'it2') });
  await h.api.prompt('left_form');
  assert.deepStrictEqual(types(h).filter((t) => t === 'advanceVintedQueue' || t === 'markListed'), []);
  assert.ok('fasVintedPendingUpload' in h.store);
});

test('a late upload of a fill moved on from is recorded later (with its id); without it nothing is marked', async () => {
  const now = Date.now();
  const aw = { itemId: 'it1', title: 'Blue Wool Scarf', altTitle: 'Blue Wool Scarf', startedAt: now - 60000, priorLiveIds: [], at: now - 1000 };
  const h = harness({ store: { fasVintedOwnProfileUrl: ME, fasVintedAwaitingUpload: [aw] }, wardrobe: () => [row(300, 'Blue Wool Scarf', false)] });
  await h.api.uploads();
  assert.deepStrictEqual(h.sent.filter((m) => m.type === 'markListed'), [{ type: 'markListed', itemId: 'it1', remoteListingId: '300', platform: 'VINTED' }]);
  assert.deepStrictEqual(h.store.fasVintedAwaitingUpload, []);
  const h2 = harness({ store: { fasVintedOwnProfileUrl: ME, fasVintedAwaitingUpload: [aw] }, wardrobe: () => [row(301, 'Blue Wool Scarf', true)] });
  await h2.api.uploads();
  assert.strictEqual(h2.sent.filter((m) => m.type === 'markListed').length, 0);
});

test('kept: a 1.0.63-1.0.76 draft the organizer has since uploaded is recorded with its Vinted id, once, and throttled', async () => {
  const now = Date.now();
  const h = harness({
    store: { fasVintedOwnProfileUrl: ME, fasVintedDrafts: [{ itemId: 'it1', draftId: '104', at: now - 1000 }, { itemId: 'it2', draftId: '105', at: now - 1000 }] },
    wardrobe: () => [row(104, 'Blue Wool Scarf', false), row(105, 'Other', true)],
  });
  await h.api.uploads();
  assert.deepStrictEqual(h.sent.filter((m) => m.type === 'markListed'), [{ type: 'markListed', itemId: 'it1', remoteListingId: '104', platform: 'VINTED' }]);
  assert.ok(h.store.fasVintedDrafts.find((d) => d.draftId === '104').listedAt > 0);
  await h.api.uploads();
  assert.strictEqual(h.fetches.length, 1);
  const h3 = harness({ store: { fasVintedOwnProfileUrl: ME }, wardrobe: () => [] });
  await h3.api.uploads();
  assert.strictEqual(h3.fetches.length, 0);
});

// ---- form reset -> refill ------------------------------------------------------------------------------------------
const ITEM = { id: 'it1', title: 'Blue Wool Scarf' };

test('blank-form check: the form is on the page with an empty Title and Description', () => {
  assert.strictEqual(harness({ form: { title: '', description: '' } }).api.blank(), true);
  assert.strictEqual(harness({ form: { title: 'Blue Wool Scarf', description: '' } }).api.blank(), false);
  assert.strictEqual(harness({ form: { present: false } }).api.blank(), false);
});

test('a Vinted reset refills the same item and says so; the refill count is kept', async () => {
  const h = harness({ store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME }, pathname: '/items/new', wardrobe: () => [], onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h.api.reset(ITEM, 0, 3, 'in_page'), 'refilled');
  assert.deepStrictEqual(h.runs, [{ id: 'it1', index: 0, total: 3 }]);
  assert.strictEqual(h.store.fasVintedPendingUpload.refills, 1);
  assert.strictEqual(h.api.state().refillNote, 'Vinted reset the form, so it was filled in again.');
  assert.ok(h.overlays.some((o) => /Vinted reset the form, so it was filled in again\./.test(o)));
  assert.ok(h.events.some((e) => e.code === 'vinted_form_reset_refill'));
  assert.ok(!types(h).includes('markListed') && !types(h).includes('advanceVintedQueue'));
});

test('the refill cap is respected: after 2 refills the prompt shows and nothing is filled again', async () => {
  const h = harness({ store: { fasVintedPendingUpload: pendingFor({ refills: 1 }), fasVintedOwnProfileUrl: ME }, pathname: '/items/new', wardrobe: () => [], onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h.api.reset(ITEM, 0, 3, 'page_load'), 'refilled');
  assert.strictEqual(h.store.fasVintedPendingUpload.refills, 2);
  assert.strictEqual(await h.api.reset(ITEM, 0, 3, 'in_page'), 'prompt');
  assert.strictEqual(h.runs.length, 1, 'no third fill');
  assert.ok(h.events.some((e) => e.code === 'vinted_refill_cap'));
  assert.ok(/Vinted reset the form for <b>Blue Wool Scarf<\/b> again\./.test(h.overlays[h.overlays.length - 1]));
  assert.ok(!types(h).includes('markListed'));
});

test('a blank form right after an Upload click is never refilled; an upload already there is recorded instead', async () => {
  const h = harness({ store: { fasVintedPendingUpload: pendingFor({ uploadClickedAt: Date.now() - 10000 }), fasVintedOwnProfileUrl: ME }, pathname: '/items/new', wardrobe: () => [], onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h.api.reset(ITEM, 0, 3, 'in_page'), 'prompt');
  assert.strictEqual(h.runs.length, 0);
  const h2 = harness({ store: { fasVintedPendingUpload: pendingFor(), fasVintedOwnProfileUrl: ME }, pathname: '/items/new', wardrobe: () => [row(104, 'Blue Wool Scarf', false)], onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h2.api.reset(ITEM, 0, 3, 'in_page'), 'advanced');
  assert.strictEqual(h2.runs.length, 0);
  assert.strictEqual(h2.sent.find((m) => m.type === 'markListed').remoteListingId, '104');
});

test('a reset for an item the queue has moved past is ignored', async () => {
  const h = harness({ store: { fasVintedPendingUpload: pendingFor({ itemId: 'old' }), fasVintedOwnProfileUrl: ME }, pathname: '/items/new', onMessage: queueOn('it1', 'it2') });
  assert.strictEqual(await h.api.reset(ITEM, 0, 3, 'in_page'), 'none');
  assert.strictEqual(h.runs.length, 0);
});

// ---- duplicate guard -----------------------------------------------------------------------------------------------
const MSG = '<b>Blue Wool Scarf</b> is already live on Vinted, so it was skipped to avoid listing it twice. To post it again anyway, tick it yourself in the FindA.Sale popup.';
const listedReply = (listed) => (msg) => (msg.type === 'checkItemListedStatus' ? { ok: true, found: true, listed } : { ok: true });

test('1.0.78: an open Vinted draft with the same title no longer blocks the fill (no skip, no advance, no mark)', async () => {
  const h = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME }, wardrobe: () => [row(61, 'Blue Wool Scarf', true)], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h.api.skip(ITEM), false);
  assert.ok(!h.events.some((x) => x.code === 'vinted_already_present'));
  assert.ok(!types(h).includes('advanceVintedQueue'));
  assert.ok(!h.store.fasVintedPresent || !h.store.fasVintedPresent.it1);
});

test('duplicate guard: a same-title live listing is skipped and the queue advances (no fill, no mark)', async () => {
  const h = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME }, wardrobe: () => [row(61, 'Blue Wool Scarf', false)], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h.api.skip(ITEM), true);
  assert.ok(h.overlays.some((o) => o.indexOf(MSG) !== -1));
  const e = h.events.find((x) => x.code === 'vinted_already_present');
  assert.ok(e && e.ctx.kind === 'live' && e.ctx.remoteId === '61');
  assert.ok(types(h).includes('advanceVintedQueue'));
  assert.ok(!types(h).includes('markListed'));
  assert.strictEqual(h.store.fasVintedPresent.it1.kind, 'live');
  assert.strictEqual(h.loc.href, '');
  h.els['fas-vin-skip-next'].onclick();
  assert.strictEqual(h.loc.href, 'https://www.vinted.com/items/new');
});

test('duplicate guard: a live listing (recorded by FindA.Sale, or same title in the wardrobe) is skipped', async () => {
  const h = harness({ pathname: '/items/new', store: {}, onMessage: queueOn('it1', 'it2', listedReply(true)) });
  assert.strictEqual(await h.api.skip(ITEM), true);
  assert.strictEqual(h.events.find((x) => x.code === 'vinted_already_present').ctx.kind, 'live');
  // 2026-10-29: a hit from FindA.Sale's own record is not stored for the popup (it reads the record fresh; a copy went stale).
  assert.strictEqual(h.store.fasVintedPresent.it1, undefined);
  const h2 = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME }, wardrobe: () => [row(62, 'blue wool scarf', false)], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h2.api.skip(ITEM), true);
  assert.strictEqual(h2.events.find((x) => x.code === 'vinted_already_present').ctx.remoteId, '62');
  assert.deepStrictEqual([h2.store.fasVintedPresent.it1.kind, h2.store.fasVintedPresent.it1.remoteId], ['live', '62'], 'a listing seen on Vinted is remembered');
  const h3 = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME, fasVintedDrafts: [{ itemId: 'it1', draftId: '50', at: Date.now() }] }, wardrobe: () => [row(50, 'Edited title', true)], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h3.api.skip(ITEM), false, '1.0.78: a recorded draft still a draft does not block');
  const h4 = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME, fasVintedDrafts: [{ itemId: 'it1', draftId: '50', at: Date.now() }] }, wardrobe: () => [row(50, 'Edited title', false)], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h4.api.skip(ITEM), true, 'a recorded draft the organizer uploaded is live');
  assert.strictEqual(h4.events.find((x) => x.code === 'vinted_already_present').ctx.source, 'recorded_draft_uploaded');
});

test('duplicate guard: nothing on Vinted -> filled as normal, the snapshot is empty, a stale popup mark is cleared', async () => {
  const h = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME, fasVintedPresent: { it1: { kind: 'draft', at: Date.now() } } }, wardrobe: () => [row(70, 'Other', false), row(71, 'Blue Wool Scarf', false, { is_closed: true })], onMessage: queueOn('it1', 'it2', listedReply(false)) });
  assert.strictEqual(await h.api.skip(ITEM), false);
  assert.deepStrictEqual(h.api.state().preFill, []);
  assert.deepStrictEqual(h.store.fasVintedPresent, {});
  assert.ok(!types(h).includes('advanceVintedQueue'));
  assert.ok(!h.events.some((x) => x.code === 'vinted_already_present'));
});

// ---- post again (1.0.78) ------------------------------------------------------------------------------------------
test('1.0.78: an item ticked in the popup while live on Vinted (vintedPostAgain) is filled as asked, not skipped', async () => {
  const h = harness({ pathname: '/items/new', store: { fasVintedOwnProfileUrl: ME }, wardrobe: () => [row(62, 'Blue Wool Scarf', false)], onMessage: queueOn('it1', 'it2', listedReply(true)) });
  assert.strictEqual(await h.api.skip(Object.assign({}, ITEM, { vintedPostAgain: true })), false);
  assert.ok(h.events.some((x) => x.code === 'vinted_post_again'));
  assert.ok(!h.events.some((x) => x.code === 'vinted_already_present'));
  assert.ok(!types(h).includes('advanceVintedQueue'));
  assert.strictEqual(h.api.state().preFill, null, 'the upload snapshot is read when the fill is armed');
});

// ---- popup ---------------------------------------------------------------------------------------------------------
test('popup (1.0.78): live Vinted items are marked, left out of Select all, but stay selectable and are queued with vintedPostAgain', () => {
  const p = rd('popup.js');
  assert.ok(/function vintedPresenceOf\(it\) \{\n  if \(currentChannel\(\) !== 'vinted' \|\| !self\.FAS_VINTED_DRAFTS\) return null;/.test(p));
  assert.ok(/function vintedLiveOnVinted\(it\) \{ return vintedPresenceOf\(it\) === 'live'; \}/.test(p));
  assert.ok(!/vintedPresenceExcluded|vPresenceBlocked|Draft waiting on Vinted|waiting there as a draft/.test(p), 'no draft concept left in the popup');
  assert.ok(/\|\| vintedLiveOnVinted\(it\);\n/.test(p), 'not in the visible select-all set');
  assert.ok(/vintedPostAgain: ch === 'vinted' && vintedLiveOnVinted\(it\),/.test(p));
  assert.ok(/chrome\.storage\.local\.get\(\['fasVintedPresent'\]\)/.test(p));
  const i = p.indexOf('async function loadVintedPresence()');
  const j = p.indexOf('const VINTED_POST_AGAIN_NOTE');
  let ch = 'vinted';
  const fn = new Function('self', 'currentChannel', 'chrome', 'VINTED_PRESENT',
    p.slice(i, j) + '\nreturn { vintedPresenceOf, vintedLiveOnVinted };');
  const api = fn({ FAS_VINTED_DRAFTS: D }, () => ch, {}, { g1: { kind: 'live', remoteId: '7003', at: Date.now() }, d1: { kind: 'draft', at: Date.now() }, r1: { kind: 'live', remoteId: null, at: Date.now() } });
  assert.strictEqual(api.vintedPresenceOf({ id: 'd1' }), null, 'a 1.0.77 draft guard result is not a mark');
  assert.strictEqual(api.vintedPresenceOf({ id: 'g1' }), 'live');
  assert.strictEqual(api.vintedPresenceOf({ id: 'r1', marketplaceListedVinted: false }), null, '2026-10-29: a record-only mark never outlives the record');
  assert.strictEqual(api.vintedPresenceOf({ id: 'x', marketplaceListedVinted: true }), 'live');
  assert.strictEqual(api.vintedLiveOnVinted({ id: 'n1' }), false);
  ch = 'poshmark';
  assert.strictEqual(api.vintedLiveOnVinted({ id: 'g1' }), false, 'other channels unaffected');
});
