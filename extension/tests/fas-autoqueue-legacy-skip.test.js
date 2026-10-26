// 1.0.66 (2026-10-26 live auto queue retest): (1) a queue written before 1.0.65 gets a real "last touched" clock on
// install/update, (2) the abandonment check runs on every poll, also when the server has nothing new for that
// marketplace (an abandoned queue is then cleared and logged, never marked listed), (3) the Mercari and Poshmark
// overlays offer "Skip this item", which advances the queue WITHOUT marking listed and records the reason.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');
const merc = rd('fas-mercari.js');
const posh = rd('fas-poshmark.js');

function extract(src, name, prefix) {
  const i = src.indexOf((prefix || 'function ') + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
const cfgSrc = bg.slice(bg.indexOf('const FAS_AUTOLIST_QUEUE_CFG = {'), bg.indexOf('};', bg.indexOf('const FAS_AUTOLIST_QUEUE_CFG = {')) + 2);
const H = 3600 * 1000;

// eslint-disable-next-line no-new-func
const stamps = new Function(cfgSrc + "\nconst FAS_QUEUE_TOUCHED_KEY = 'fasQueueTouchedAt';\n" + extract(bg, 'fasLegacyQueueStamps') + '\nreturn fasLegacyQueueStamps;')();

test('legacy queues: an unfinished non-Facebook queue without a touched time is stamped on install/update', () => {
  const now = 100 * H;
  const st = {
    fasMercariQueue: [{ id: 'cmo3etb6i003hjqsue02qim86', title: 'Cecil Fielder card' }], fasMercariIndex: 0,
    fasPoshmarkQueue: [{ id: 'p1' }, { id: 'p2' }], fasPoshmarkIndex: 2, // finished: not stamped
    fasQueue: [{ id: 'fb1' }], fasIndex: 0, // Facebook: own clock, not stamped
    fasGrailedQueue: [{ id: 'g1' }], fasGrailedIndex: 0,
    fasQueueTouchedAt: { GRAILED: now - 2 * H }, // already has a clock: kept as is
  };
  assert.deepStrictEqual(stamps(st, now), { GRAILED: now - 2 * H, MERCARI: now });
});

test('legacy queues: the time the auto queue loaded that same queue is used when known', () => {
  const now = 100 * H;
  const st = { fasMercariQueue: [{ id: 'm1' }], fasMercariIndex: 0, fasAutoQueued: { MERCARI: { firstId: 'm1', at: now - 30 * H } } };
  assert.deepStrictEqual(stamps(st, now), { MERCARI: now - 30 * H });
  const other = { fasMercariQueue: [{ id: 'm1' }], fasMercariIndex: 0, fasAutoQueued: { MERCARI: { firstId: 'zzz', at: now - 30 * H } } };
  assert.deepStrictEqual(stamps(other, now), { MERCARI: now });
  assert.strictEqual(stamps({}, now), null);
});

test('the stamp runs on chrome.runtime.onInstalled', () => {
  assert.ok(/chrome\.runtime\.onInstalled\.addListener\(fasStampLegacyQueues\)/.test(bg));
});

function makeSweep(store, now) {
  const logs = [];
  const traces = [];
  const chrome = {
    storage: { local: {
      get: async (keys) => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = JSON.parse(JSON.stringify(store[k])); return o; },
      set: async (o) => { Object.assign(store, o); },
    } },
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('chrome', 'fasLog', 'fasT', 'Date',
    cfgSrc + "\nconst FAS_QUEUE_TOUCHED_KEY = 'fasQueueTouchedAt';\nconst FAS_AUTOLIST_ABANDON_MS = 6 * 60 * 60 * 1000;\n" +
    extract(bg, 'fasAutoQueueRunState') + '\n' + extract(bg, 'fasAutoQueueSweepStale', 'async function ') + '\nreturn fasAutoQueueSweepStale;')(
    chrome, (...a) => logs.push(a), (...a) => traces.push(a), { now: () => now });
  return { fn, logs, traces };
}

test('empty server queue: the stale Mercari leftover is cleared and logged as abandoned, not marked listed', async () => {
  const now = 200 * H;
  const store = { fasMercariQueue: [{ id: 'cmo3etb6i003hjqsue02qim86', title: 'Cecil Fielder card' }], fasMercariIndex: 0, fasQueueTouchedAt: { MERCARI: now - 30 * H } };
  const { fn, logs } = makeSweep(store, now);
  assert.strictEqual(await fn('MERCARI', 'empty'), 'MERCARI:abandoned_cleared_1');
  assert.deepStrictEqual(store.fasMercariQueue, []);
  assert.strictEqual(store.fasMercariIndex, 0);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0][1], 'FAS_AUTOQUEUE_ABANDONED');
  assert.strictEqual(logs[0][3].replaced, false);
  assert.deepStrictEqual(logs[0][3].leftoverIds, ['cmo3etb6i003hjqsue02qim86']);
  assert.ok(/nothing new to replace it/.test(logs[0][2]));
});

test('empty server queue: an active run is left alone; an unknown-age queue starts its clock', async () => {
  const now = 200 * H;
  const active = { fasMercariQueue: [{ id: 'm1' }], fasMercariIndex: 0, fasQueueTouchedAt: { MERCARI: now - 1 * H } };
  let r = makeSweep(active, now);
  assert.strictEqual(await r.fn('MERCARI', 'empty'), 'MERCARI:empty');
  assert.strictEqual(active.fasMercariQueue.length, 1);
  assert.strictEqual(r.logs.length, 0);
  const legacy = { fasMercariQueue: [{ id: 'm1' }], fasMercariIndex: 0 };
  r = makeSweep(legacy, now);
  assert.strictEqual(await r.fn('MERCARI', 'limit_reached'), 'MERCARI:limit_reached');
  assert.strictEqual(legacy.fasQueueTouchedAt.MERCARI, now);
  assert.strictEqual(legacy.fasMercariQueue.length, 1);
});

test('empty server queue: Facebook and idle queues are not touched', async () => {
  const now = 200 * H;
  const store = { fasQueue: [{ id: 'f1' }], fasIndex: 0, fasQueueSetAt: now - 99 * H, fasPoshmarkQueue: [{ id: 'p' }], fasPoshmarkIndex: 1 };
  const { fn, logs } = makeSweep(store, now);
  assert.strictEqual(await fn('FACEBOOK', 'empty'), 'FACEBOOK:empty');
  assert.strictEqual(await fn('POSHMARK', 'empty'), 'POSHMARK:empty');
  assert.strictEqual(store.fasQueue.length, 1);
  assert.strictEqual(logs.length, 0);
});

test('the poll runs the sweep for an empty server queue and a used-up limit (not only when something replaces it)', () => {
  assert.ok(/if \(!Array\.isArray\(items\) \|\| !items\.length\) \{ outcomes\.push\(await fasAutoQueueSweepStale\(platform, 'empty'\)\); continue; \}/.test(bg));
  assert.ok(/if \(limitPlan\.budget <= 0\) \{ outcomes\.push\(await fasAutoQueueSweepStale\(platform, 'limit_reached'\)\); continue; \}/.test(bg));
  const sweep = extract(bg, 'fasAutoQueueSweepStale', 'async function ');
  assert.ok(!/markListed|\/listed|sendMessage/.test(sweep));
});

// eslint-disable-next-line no-new-func
const skipReason = new Function(extract(bg, 'fasSkipReason') + '\nreturn fasSkipReason;')();
test('skip reasons: a short fixed vocabulary only', () => {
  assert.strictEqual(skipReason('form_not_found'), 'form_not_found');
  assert.strictEqual(skipReason('review_skipped'), 'review_skipped');
  assert.strictEqual(skipReason(true), null);
  assert.strictEqual(skipReason('<b>x</b>'), null);
  assert.strictEqual(skipReason(undefined), null);
});

test('advancing on a skip logs the reason and is not counted as a post (Mercari and Poshmark)', () => {
  for (const p of ['MERCARI', 'POSHMARK']) {
    const re = new RegExp("if \\(fasSkipReason\\(msg\\.skipped\\)\\) fasLogQueueSkip\\('" + p + "', curItem, fasSkipReason\\(msg\\.skipped\\)\\);\\s*else await fasRecordPostTime\\('" + p + "'\\);");
    assert.ok(re.test(bg), p);
  }
  const log = extract(bg, 'fasLogQueueSkip');
  assert.ok(/FAS_AUTOQUEUE_ITEM_SKIPPED/.test(log));
  assert.ok(/not marked listed/.test(log));
});

test('Mercari: Skip is on the review screen and every item-level stop, and never marks listed', () => {
  const wire = extract(merc, 'wireSkip');
  assert.ok(/type: 'advanceMercariQueue', itemId: item\.id, skipped: reason/.test(wire));
  assert.ok(!/markListed/.test(wire));
  for (const reason of ['review_skipped', 'form_not_found', 'navigated_away', 'category_mismatch', 'shipping_incomplete', 'fill_error']) {
    assert.ok(merc.indexOf("'" + reason + "')") > 0, reason);
    assert.ok(skipReason(reason), reason);
  }
  const review = extract(merc, 'showReviewOverlay');
  assert.ok(/skipButton\(index, total\)/.test(review));
  assert.ok(/wireSkip\(item, index, total, 'review_skipped'\)/.test(review));
});

test('Mercari: clicking Skip advances with the reason and loads the next item', async () => {
  const sent = [];
  let href = null;
  const el = { onclick: null, disabled: false };
  const env = {
    document: { getElementById: (id) => (id === 'fas-merc-skip' ? el : null) },
    chrome: { runtime: { sendMessage: async (m) => { sent.push(m); return { ok: true }; } } },
    T: { info() {}, warn() {} },
    location: { set href(v) { href = v; } },
  };
  // eslint-disable-next-line no-new-func
  const wireSkip = new Function('document', 'chrome', 'T', 'location', 'SELL_URL_HINT', 'overlayInfo', 'button', 'escapeHtml', 'closeBtnHandler',
    extract(merc, 'wireSkip') + '\nreturn wireSkip;')(env.document, env.chrome, env.T, env.location, 'https://www.mercari.com/sell/', () => {}, () => '', (x) => x, () => {});
  wireSkip({ id: 'cmo3etb6i003hjqsue02qim86', title: 'Cecil Fielder card' }, 0, 2, 'form_not_found');
  await el.onclick();
  assert.deepStrictEqual(sent, [{ type: 'advanceMercariQueue', itemId: 'cmo3etb6i003hjqsue02qim86', skipped: 'form_not_found' }]);
  assert.strictEqual(href, 'https://www.mercari.com/sell/');
});

test('Poshmark: the review screen has Skip (advance with a reason, no markListed); flagged-item skip records its kind', () => {
  const review = extract(posh, 'showReviewOverlay');
  assert.ok(/fas-posh-review-skip/.test(review));
  const skipHandler = review.slice(review.indexOf("getElementById('fas-posh-review-skip')"));
  assert.ok(/await fasPoshAdvance\(item\.id, 'review_skipped'\)/.test(skipHandler));
  assert.ok(!/fasPoshMarkListed/.test(skipHandler));
  assert.ok(/fasPoshAdvance\(item\.id, flagKind === 'prohibited' \? 'flag_prohibited' : 'flag_oversized'\)/.test(posh));
  assert.ok(/if \(skipped\) msg\.skipped = skipped;/.test(extract(posh, 'fasPoshAdvance', 'async function ')));
  assert.ok(skipReason('flag_oversized') && skipReason('flag_prohibited'));
});

test('no em dashes in the new user-facing Skip text', () => {
  assert.ok(!/—/.test(extract(merc, 'wireSkip')));
  assert.ok(!/—/.test(extract(merc, 'skipButton')));
});

test('an item Poshmark flagged earlier is un-held once it is listed on Poshmark', async () => {
  const store = { fasPoshFlagged: { cmuqxmtnv076zsm41yeq1u3pe: { kind: 'prohibited', at: 1 }, other0000001: { kind: 'oversized', at: 2 } } };
  const chrome = { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async (o) => Object.assign(store, o) } } };
  // eslint-disable-next-line no-new-func
  const unflag = new Function('chrome', extract(bg, 'fasPoshUnflag', 'async function ') + '\nreturn fasPoshUnflag;')(chrome);
  await unflag('cmuqxmtnv076zsm41yeq1u3pe');
  assert.deepStrictEqual(Object.keys(store.fasPoshFlagged), ['other0000001']);
  assert.ok(/if \(msg\.platform === 'POSHMARK' && \(markListedResp\.ok \|\| markListedResp\.deduped\)\) await fasPoshUnflag\(msg\.itemId\);/.test(bg));
});
