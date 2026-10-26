// 1.0.65 (2026-10-26 live auto queue test): (1) a stale non-Facebook queue no longer blocks the auto queue forever,
// (2) the Mercari Sell form wait is 30s with DOM-change wakeups and one reload, (3) a signed-out extension says so,
// (4) Poshmark-flagged holds are reported to the server so the web page can list them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');
const merc = rd('fas-mercari.js');

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
const constOf = (src, name) => {
  const m = src.match(new RegExp('const ' + name + ' = ([^;]+);'));
  assert.ok(m, name);
  return m[1];
};

// eslint-disable-next-line no-new-func
const runState = new Function(extract(bg, 'fasAutoQueueRunState') + '\nreturn fasAutoQueueRunState;')();
const H = 3600 * 1000;

test('abandon window is 6 hours for non-Facebook queues; Facebook keeps its 30 minute rule', () => {
  assert.strictEqual(constOf(bg, 'FAS_AUTOLIST_ABANDON_MS'), '6 * 60 * 60 * 1000');
  assert.strictEqual(constOf(bg, 'FAS_FB_QUEUE_STALE_MS'), '30 * 60 * 1000');
  assert.ok(/cfg\.setAt \? FAS_FB_QUEUE_STALE_MS : FAS_AUTOLIST_ABANDON_MS/.test(bg));
});

test('run state: idle, active, abandoned, unknown age', () => {
  const now = 100 * H;
  assert.strictEqual(runState(0, 0, undefined, now, 6 * H), 'idle');
  assert.strictEqual(runState(3, 3, now - 1, now, 6 * H), 'idle');
  assert.strictEqual(runState(1, 0, now - 1 * H, now, 6 * H), 'active');
  assert.strictEqual(runState(1, 0, now - 7 * H, now, 6 * H), 'abandoned');
  assert.strictEqual(runState(1, 0, undefined, now, 6 * H), 'unknown_age');
  assert.strictEqual(runState(1, 0, 0, now, 6 * H), 'unknown_age');
});

test('the stale Mercari leftover from the live test (one item, index 0, untouched for a day) is abandoned', () => {
  const now = Date.parse('2026-10-26T18:00:00Z');
  const touched = Date.parse('2026-10-25T12:00:00Z');
  assert.strictEqual(runState(1, 0, touched, now, 6 * H), 'abandoned');
});

test('every queue write is timestamped by a storage listener, and an unknown-age queue starts the clock instead of being dropped', () => {
  assert.ok(/chrome\.storage\.onChanged\.addListener/.test(bg));
  assert.ok(/changes\[cfg\.queue\] \|\| changes\[cfg\.index\]/.test(bg));
  const i = bg.indexOf("if (runState === 'unknown_age')");
  assert.ok(i > 0);
  const block = bg.slice(i, i + 400);
  assert.ok(/touchedMap\[platform\] = Date\.now\(\)/.test(block));
  assert.ok(/skipped_active/.test(block));
});

test('abandoning logs a diagnostic and never marks the leftover items listed', () => {
  const i = bg.indexOf("if (runState === 'abandoned')");
  assert.ok(i > 0);
  const end = bg.indexOf('outcomes.push(platform + \':queued_\'', i);
  const block = bg.slice(i, end);
  assert.ok(/FAS_AUTOQUEUE_ABANDONED/.test(block));
  assert.ok(!/markListed|\/listed/.test(block));
  assert.ok(!/sendMessage/.test(block));
});

// eslint-disable-next-line no-new-func
const heldParam = new Function(extract(bg, 'fasPoshHeldParam') + '\nreturn fasPoshHeldParam;')();
test('Poshmark-flagged holds within 30 days are reported with the poll, older or malformed ones are not', () => {
  const now = Date.parse('2026-10-26T00:00:00Z');
  const out = heldParam({
    cmo3etb6i003hjqsue02qim86: { kind: 'oversized', at: now - 2 * 24 * H },
    cmo3etb6i003hjqsue02qim87: { kind: 'prohibited', at: now - 40 * 24 * H },
    'bad id!': { kind: 'oversized', at: now },
    cmo3etb6i003hjqsue02qim88: { kind: 'other', at: now },
  }, now);
  assert.strictEqual(out, 'cmo3etb6i003hjqsue02qim86~oversized~' + (now - 2 * 24 * H));
  assert.ok(/'\/extension\/autolist-queue'/.test(bg));
  assert.ok(/'&held=' \+ encodeURIComponent\(held\)/.test(bg));
});

test('the Poshmark flagged exclusion itself is unchanged (30 days, by design)', () => {
  assert.ok(/items = items\.filter\(\(q\) => !\(q && flagged\[q\.id\] && flagged\[q\.id\]\.at > cutoff\)\)/.test(bg));
});

// eslint-disable-next-line no-new-func
const shouldNotify = new Function('const FAS_SIGNIN_NOTIFY_AFTER_MS = ' + constOf(bg, 'FAS_SIGNIN_NOTIFY_AFTER_MS') + '; const FAS_SIGNIN_RENOTIFY_MS = ' + constOf(bg, 'FAS_SIGNIN_RENOTIFY_MS') + ';\n' + extract(bg, 'fasSignedOutShouldNotify') + '\nreturn fasSignedOutShouldNotify;')();
test('signed out: badge at once, desktop notification after 30 minutes, repeated at most every 12 hours', () => {
  const now = 10 * 24 * H;
  assert.strictEqual(shouldNotify({ since: now - 5 * 60 * 1000, notifiedAt: 0 }, now), false);
  assert.strictEqual(shouldNotify({ since: now - 31 * 60 * 1000, notifiedAt: 0 }, now), true);
  assert.strictEqual(shouldNotify({ since: now - 5 * H, notifiedAt: now - 1 * H }, now), false);
  assert.strictEqual(shouldNotify({ since: now - 20 * H, notifiedAt: now - 13 * H }, now), true);
  assert.strictEqual(shouldNotify(null, now), false);
});

test('apiFetch reports signed-out and signed-in, and the badge and notification are wired', () => {
  const api = bg.slice(bg.indexOf('async function apiFetch('), bg.indexOf('// ---- Signed-out warning'));
  assert.ok(api.length > 100);
  assert.ok(/fasNoteAuthState\(false\);\s*return \{ ok: false, status: 401, error: 'not_signed_in'/.test(api));
  assert.ok(/if \(res\.ok\) fasNoteAuthState\(true\)/.test(api));
  const note = extract(bg, 'fasNoteAuthState');
  assert.ok(/setBadgeText\(\{ text: '!' \}\)/.test(note));
  assert.ok(/Sign in to FindA\.Sale/.test(note));
  assert.ok(/setBadgeText\(\{ text: '' \}\)/.test(note));
  assert.ok(/notifId === FAS_SIGNED_OUT_NOTIF/.test(bg));
  assert.ok(/FAS_SIGNIN_URL = 'https:\/\/finda\.sale\/login'/.test(bg));
});

test('no em dashes in the new user-facing text', () => {
  const note = extract(bg, 'fasNoteAuthState');
  assert.ok(!/—/.test(note));
});

// ---- Mercari Sell form wait ----
function makeWait(seq) {
  // seq: array of readings per poll: 'blank' | 'ready' | 'interstitial'
  let i = 0, clock = 0;
  const realNow = Date.now;
  const env = {
    looksLikeSellForm: () => seq[Math.min(i, seq.length - 1)] === 'ready',
    looksLikeInterstitial: () => seq[Math.min(i, seq.length - 1)] === 'interstitial',
    waitForDomChange: async (ms) => { i++; clock += ms || 1; },
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('looksLikeSellForm', 'looksLikeInterstitial', 'waitForDomChange', 'Date', 'async ' + extract(merc, 'waitForFormReady') + '\nreturn waitForFormReady;')(
    env.looksLikeSellForm, env.looksLikeInterstitial, env.waitForDomChange, { now: () => clock });
  return fn;
}

test('Mercari form wait is 30 seconds (was 8) and run() uses the constant', () => {
  assert.strictEqual(constOf(merc, 'MERC_FORM_WAIT_MS'), '30000');
  assert.ok(/await waitForFormReady\(MERC_FORM_WAIT_MS\)/.test(merc));
  assert.ok(!/waitForFormReady\(8000\)/.test(merc));
});

test('a form that appears after 8 seconds is now found (live case)', async () => {
  const seq = Array(25).fill('blank').concat(['ready']); // 25 polls x 400ms = 10s
  assert.strictEqual(await makeWait(seq)(30000), 'ready');
});

test('a form that never appears times out instead of hanging', async () => {
  assert.strictEqual(await makeWait(['blank'])(30000), 'timeout');
});

test('a persistent verification screen is still caught; a brief one is not', async () => {
  assert.strictEqual(await makeWait(['interstitial'])(30000), 'interstitial');
  assert.strictEqual(await makeWait(['interstitial', 'interstitial', 'blank', 'ready'])(30000), 'ready');
});

test('waitForDomChange always resolves on its timer (no hang) and uses a MutationObserver', () => {
  const f = extract(merc, 'waitForDomChange');
  assert.ok(/new MutationObserver\(finish\)/.test(f));
  assert.ok(/setTimeout\(finish, ms\)/.test(f));
});

// eslint-disable-next-line no-new-func
const reloadDecision = new Function('const MERC_FORM_RELOAD_WINDOW_MS = 10 * 60 * 1000;\n' + extract(merc, 'mercFormReloadDecision') + '\nreturn mercFormReloadDecision;')();
test('Mercari timeout: one automatic reload per item, then the normal stop', () => {
  const now = 1e12;
  const first = reloadDecision(null, 'itemA', now);
  assert.strictEqual(first.reload, true);
  assert.deepStrictEqual(first.marker, { itemId: 'itemA', at: now });
  assert.strictEqual(reloadDecision(first.marker, 'itemA', now + 40000).reload, false);
  assert.strictEqual(reloadDecision(first.marker, 'itemB', now + 40000).reload, true);
  assert.strictEqual(reloadDecision(first.marker, 'itemA', now + 11 * 60 * 1000).reload, true);
  const i = merc.indexOf("if (formState === 'timeout')");
  const block = merc.slice(i, i + 1200);
  assert.ok(/location\.reload\(\)/.test(block));
  assert.ok(/mercari_form_not_found/.test(block));
});
