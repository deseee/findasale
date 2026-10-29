// 1.0.67 (2026-10-26, Patrick: "samurai shodown II already sold on mercari, the rest are all things that aren't oversized"):
// (1) the server tells the extension to drop Poshmark-flag holds for items that sold / were deleted / are already on
// Poshmark (dropHolds), and (2) the organizer can release holds from the web card (releaseHolds), acked on the next poll.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');
const posh = rd('fas-poshmark.js');

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
const apply = new Function(extract(bg, 'fasPoshApplyHoldChanges') + '\nreturn fasPoshApplyHoldChanges;')();
const heldParam = new Function(extract(bg, 'fasPoshHeldParam') + '\nreturn fasPoshHeldParam;')();

const NOW = Date.now();
const SOLD = 'cmu5oob4s001rrd9bl67f2nt9'; // Samurai Shodown II, sold on Mercari 2026-10-24
const STRAP = 'cmuobqqyg00g1qcr4e3qyxnk3';
const FURY = 'cmu5stawt0071rd9bwrntc9ok';
const flagged = {
  [SOLD]: { kind: 'prohibited', at: NOW - 3600e3 },
  [STRAP]: { kind: 'oversized', at: NOW - 3600e3 },
  [FURY]: { kind: 'prohibited', at: NOW - 3600e3 },
};

test('dropHolds removes a sold item from the holds; nothing to ack', () => {
  const r = apply(flagged, [], [SOLD]);
  assert.deepStrictEqual(Object.keys(r.flagged).sort(), [STRAP, FURY].sort());
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.removed, [SOLD]);
  assert.deepStrictEqual(r.ack, []);
  assert.ok(flagged[SOLD], 'input not mutated');
});

test('releaseHolds removes the released holds and acks every released id (even one not held any more)', () => {
  const r = apply(flagged, [STRAP, FURY, 'abcdefgh12'], []);
  assert.deepStrictEqual(Object.keys(r.flagged), [SOLD]);
  assert.deepStrictEqual(r.ack, [STRAP, FURY, 'abcdefgh12']);
  assert.deepStrictEqual(r.removed, [STRAP, FURY]);
  // the next poll's held report no longer carries them
  assert.ok(!heldParam(r.flagged, NOW, {}).includes(STRAP));
});

test('malformed ids are ignored; no change reads as unchanged', () => {
  const r = apply(flagged, ['x', 5, null, '../etc'], 'nope');
  assert.strictEqual(r.changed, false);
  assert.deepStrictEqual(r.ack, []);
  assert.strictEqual(Object.keys(r.flagged).length, 3);
});

test('wiring: ack is sent as ?released=, changes are applied before the Poshmark flag filter, ack stored each poll', () => {
  const fn = bg.slice(bg.indexOf('async function checkAutoListQueue'), bg.indexOf('async function checkAutoListQueue') + 9000);
  assert.ok(/'&released=' \+ encodeURIComponent\(ack\.slice\(0, 50\)\.join\(','\)\)/.test(fn));
  const applyAt = fn.indexOf('fasPoshApplyHoldChanges(cur, rel, drp)');
  const filterAt = fn.indexOf("platform === 'POSHMARK' && Array.isArray(items)");
  const pollAt = fn.indexOf('await apiFetch(pollPath)');
  assert.ok(pollAt > 0 && applyAt > pollAt && filterAt > applyAt);
  assert.ok(/fasPoshReleaseAck: r\.ack/.test(fn));
  assert.ok(/resp\.data\.releaseHolds/.test(fn) && /resp\.data\.dropHolds/.test(fn));
});

test('a re-flag on retry of an item the organizer did not confirm follows the 2026-10-22 rule: record the flag, hold the tab, never click inside the Poshmark box (1.0.71: no auto-certify for anyone, see fas-posh-certify-oversized.test.js)', () => {
  assert.ok(/advancePoshmarkQueue', itemId: item\.id, flagged: flagKind, flagOnly: true/.test(posh));
  assert.ok(/holdForPoshmarkFlagDecision\(item, flagKind, index, total\)/.test(posh));
  assert.ok(!/Certify Listing['"]?\)?\s*\.click|realClick\([^)]*[Cc]ertify/.test(posh));
});

test('manifest is 1.0.81', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.81');
});
