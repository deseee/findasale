// Node tests for automatic failure diagnostics (buildDiag / scrubText / diagThrottle). Run: node --test extension/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../fas-edit-core.js');

const rec = () => ({
  t: 1, platform: 'POSHMARK', itemId: 'cm123item', title: 'Vintage brass candle holder '.repeat(4), outcome: 'fail', code: 'verify_mismatch', step: 'verify', selector: '/vm-rest/posts/<id>',
  reason: 'Re-GET: HTTP 422 PostValidationError for jane@example.com see https://poshmark.com/edit-listing/abc?csrf=SECRETVALUE&x=1',
  trail: Array.from({ length: 40 }, (_, i) => 'phase' + i + ':continue'),
  snapshots: [
    { note: 'old', url: 'https://poshmark.com/a?token=zzz', buttons: [{ text: 'Save' }], inputs: [], requests: [] },
    { note: 'posh_post_failed', url: 'https://poshmark.com/edit-listing/abc?csrf=SECRETVALUE', title: 'Edit', dialogs: 0,
      buttons: [{ text: 'Update Listing' }, { text: 'Cancel' }], inputs: [{ name: 'price', type: 'text', vis: true, value: '19' }, { name: 'csrf_token', type: 'hidden', vis: false }],
      requests: [{ url: '/vm-rest/posts/abc?jwt=AAA' }], resp: { error: { errorType: 'PostValidationError', message: 'bad', csrfToken: 'abcdef', email: 'bob@x.io' } }, textSample: 'Call 555-123-4567 or bob@x.io', status: 422, keys: ['a'] },
    { note: 'last', url: 'https://poshmark.com/closet?x=1', buttons: [], inputs: [] }
  ],
  details: { status: 422, resp: { message: 'nope', authorization: 'Bearer abc.def.ghi' } }
});

test('buildDiag keeps the useful fields and drops secrets', () => {
  const d = C.buildDiag(rec(), { version: '1.0.15', suppressed: 3, firstSinceStart: true });
  assert.strictEqual(d.platform, 'POSHMARK');
  assert.strictEqual(d.code, 'verify_mismatch');
  assert.strictEqual(d.title.length, 60);
  assert.strictEqual(d.trail.length, 25);
  assert.strictEqual(d.counts.trail, 40);
  assert.strictEqual(d.snapshots.length, 2);
  assert.strictEqual(d.suppressedSinceLast, 3);
  assert.strictEqual(d.http.status, 422);
  const j = JSON.stringify(d);
  for (const bad of ['SECRETVALUE', 'jane@example.com', 'bob@x.io', 'abcdef', 'Bearer abc', '555-123-4567', 'token=zzz', 'jwt=AAA', '?']) assert.ok(j.indexOf(bad) === -1, 'leaked ' + bad);
  assert.ok(j.indexOf('Update Listing') > -1 && j.indexOf('price:text:vis') > -1 && j.indexOf('PostValidationError') > -1);
  assert.ok(!/https?:\/\//.test(j));
});

test('buildDiag is capped in size even for huge input', () => {
  const r = rec();
  r.snapshots = [0, 1].map(() => ({ url: '/x', buttons: Array.from({ length: 300 }, (_, i) => ({ text: 'Button number ' + i })), inputs: Array.from({ length: 300 }, (_, i) => ({ name: 'field' + i, type: 'text', vis: true })), textSample: 'z'.repeat(5000) }));
  r.details = { big: Array.from({ length: 500 }, (_, i) => ({ k: 'v'.repeat(300) + i })) };
  assert.ok(JSON.stringify(C.buildDiag(r, {})).length <= C.DIAG_MAX_CHARS);
});

test('buildDiag tolerates missing parts', () => {
  const d = C.buildDiag({ platform: 'CRAIGSLIST', code: 'edit_flow_stuck' }, {});
  assert.deepStrictEqual(d.trail, []);
  assert.deepStrictEqual(d.snapshots, []);
});

test('throttle: first goes, repeats are counted, next window carries the count, restart (empty store) goes again', () => {
  let store = {}, t = 1000;
  let g = C.diagThrottle(store, 'CRAIGSLIST', 'edit_flow_stuck', t); assert.strictEqual(g.send, true); store = g.store;
  for (let i = 0; i < 199; i++) { g = C.diagThrottle(store, 'CRAIGSLIST', 'edit_flow_stuck', t + 1000 + i); assert.strictEqual(g.send, false); store = g.store; }
  g = C.diagThrottle(store, 'CRAIGSLIST', 'other_code', t + 5000); assert.strictEqual(g.send, true); store = g.store;
  g = C.diagThrottle(store, 'POSHMARK', 'edit_flow_stuck', t + 5000); assert.strictEqual(g.send, true); store = g.store;
  g = C.diagThrottle(store, 'CRAIGSLIST', 'edit_flow_stuck', t + C.DIAG_WINDOW_MS + 1);
  assert.strictEqual(g.send, true); assert.strictEqual(g.suppressed, 199);
  assert.strictEqual(C.diagThrottle({}, 'CRAIGSLIST', 'edit_flow_stuck', t + 10).send, true);
});
