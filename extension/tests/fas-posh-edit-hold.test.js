// 1.0.66: Poshmark certify flag on a price/stock EDIT (certify_reason fragile/oversized/prohibited). The API save is refused, the engine tries
// Poshmark's own Edit Listing form once; if that fails too the item+change is HELD (no automatic retry, never certified), reported to the
// web page as kind "edit", and released when the wanted price changes, the item leaves the queue, or 30 days pass.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../fas-edit-core.js');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const eng = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');

function extract(src, name) {
  const i = src.indexOf('function ' + name);
  assert.ok(i >= 0, name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('unbalanced');
}
const NOW = 1_800_000_000_000;
const D = 24 * 3600 * 1000;
const entry = (o) => C.normalizeEntry(Object.assign({ id: 'cmt784rdn01liti46bymoomg8', title: 'Oberon Ale Lamp', newPrice: 34.49 }, o), 'POSHMARK');
const flaggedFail = (o) => Object.assign({ state: 'fail', code: 'verify_mismatch', scratch: { apiFlagged: 'fragile', formFallback: true } }, o);

test('certify reason is read from the PostValidationError text', () => {
  assert.strictEqual(C.poshCertifyReason('poshmark_error:400:PostValidationError:{"params":{"certify_action":true,"certify_reason":"fragile","origin_domain":"us"}}'), 'fragile');
  assert.strictEqual(C.poshCertifyReason('{"certify_reason":"Oversized"}'), 'oversized');
  assert.strictEqual(C.poshCertifyReason('We have detected that this item is suspicious'), '');
});

test('only a failed form fallback after an API certify flag is held; infrastructure failures and unflagged failures are not', () => {
  assert.ok(C.poshHoldEligible('POSHMARK', flaggedFail()));
  assert.ok(C.poshHoldEligible('POSHMARK', { state: 'blocked', code: 'poshmark_flagged', scratch: { apiFlagged: 'fragile' } }));
  assert.ok(!C.poshHoldEligible('POSHMARK', { state: 'blocked', code: 'login_required', scratch: { apiFlagged: 'fragile' } }));
  assert.ok(!C.poshHoldEligible('POSHMARK', flaggedFail({ code: 'tab_closed' })));
  assert.ok(!C.poshHoldEligible('POSHMARK', flaggedFail({ code: 'inject_failed' })));
  assert.ok(!C.poshHoldEligible('POSHMARK', { state: 'fail', code: 'verify_mismatch', scratch: { formFallback: true } }));   // never flagged: normal backoff
  assert.ok(!C.poshHoldEligible('POSHMARK', { state: 'done', scratch: { apiFlagged: 'fragile' } }));
  assert.ok(!C.poshHoldEligible('MERCARI', flaggedFail()));
});

test('a hold blocks the same wanted price and releases when the price changes, the item leaves the queue, or 30 days pass', () => {
  const e = entry();
  const hold = C.poshHoldFor(e, flaggedFail(), NOW);
  assert.deepStrictEqual([hold.price, hold.qty, hold.reason], [3449, null, 'fragile']);
  assert.ok(C.isPoshEditHeld(hold, e, NOW + 1));
  assert.ok(C.isPoshEditHeld(hold, entry({ newPrice: 34.49 }), NOW + 29 * D));
  assert.ok(!C.isPoshEditHeld(hold, entry({ newPrice: 30.49 }), NOW + 1), 'price changed again -> try again');
  assert.ok(!C.isPoshEditHeld(hold, e, NOW + 30 * D), 'expired');
  const holds = { [e.id]: hold, gone0000001: hold };
  const p = C.prunePoshHolds(holds, [e], NOW + 1);
  assert.deepStrictEqual(p.heldIds, [e.id]);
  assert.strictEqual(p.changed, true);
  assert.deepStrictEqual(Object.keys(p.holds), [e.id]);
  const p2 = C.prunePoshHolds(holds, [entry({ newPrice: 20 })], NOW + 1);
  assert.deepStrictEqual(p2.heldIds, []);
});

test('quantity is part of the held change', () => {
  const e = entry({ quantity: 2, quantityDrift: true });
  const hold = C.poshHoldFor(e, flaggedFail(), NOW);
  assert.strictEqual(hold.qty, 2);
  assert.ok(!C.isPoshEditHeld(hold, entry({ quantity: 3, quantityDrift: true }), NOW + 1));
});

test('engine: the API certify flag goes through the Edit Listing form once, tagged apiFlagged; a second flag still stops', () => {
  assert.ok(/return poshFormFallback\(ctx, id, W, 'api_flagged:' \+ String\(errP\)\.slice\(0, 60\), diagKeys, C\.poshCertifyReason\(/.test(eng));
  assert.ok(/if \(flagReason\) sc\.apiFlagged = /.test(eng));
  assert.ok(/blocked\('poshmark_flagged', 'Poshmark flagged this price change even through its own edit form/.test(eng));
  assert.ok(!/certify listing/i.test(eng.replace(/never certif[^\n]*/gi, '')) || !/realClick\([^)]*certify/i.test(eng), 'never clicks Certify');
});

test('background: held items are skipped, never given the retry ladder, cleared on success, notified once', () => {
  const run = bg.slice(bg.indexOf('async function fasEditRunPlatform'));
  assert.ok(/fasPoshEditHoldSync\(all, now\)/.test(run));
  assert.ok(/filter\(\(e\) => !poshHeldIds\.has\(e\.id\)\)/.test(run));
  assert.ok(/FAS_EDIT_CORE\.poshHoldEligible\(platform, res\)/.test(run));
  const heldBranch = run.indexOf('} else if (poshHeld && res.state === \'fail\')');
  const failBranch = run.indexOf('Core.recordFailure(prev');
  assert.ok(heldBranch > 0 && heldBranch < failBranch, 'hold branch comes before the retry-ladder branch');
  assert.ok(/poshmark_needs_confirm/.test(run) && /Poshmark needs you to confirm this edit/.test(run));
  assert.ok(/if \(poshHoldNew\)/.test(run));
  assert.ok(/fasPoshEditHoldClear\(entry\.id\)/.test(run));
});

test('held parameter carries edit holds as kind "edit" and still carries listing flags', () => {
  const heldParam = new Function(extract(bg, 'fasPoshHeldParam') + '\nreturn fasPoshHeldParam;')();
  const out = heldParam({ other0000001: { kind: 'oversized', at: NOW - D } }, NOW, { cmt784rdn01liti46bymoomg8: { at: NOW - 1000 }, old000000001: { at: NOW - 31 * D }, 'bad id': { at: NOW } });
  assert.strictEqual(out, 'cmt784rdn01liti46bymoomg8~edit~' + (NOW - 1000) + ',other0000001~oversized~' + (NOW - D));
  assert.strictEqual(heldParam({}, NOW), '');   // two-argument callers unchanged
});

test('the poll prunes holds against the pending queue and reports the rest', () => {
  assert.ok(/fasPoshHeldParam\(flagged, Date\.now\(\), editHolds\)/.test(bg));
  assert.ok(/prunePoshHolds\(editHolds, pend\.POSHMARK/.test(bg));
});

test('manifest is 1.0.69', () => {
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version, '1.0.69');
});
