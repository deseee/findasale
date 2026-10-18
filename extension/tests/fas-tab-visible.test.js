// Node tests for fas-tab-visible.js (extension 1.0.22) and its wiring: a hidden Vinted removal tab must never get a delete/mark-sold click.
// Run: node --test extension/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TV = require('../fas-tab-visible.js');

function fakeClock() { let t = 0; return { now: () => t, sleep: (ms) => { t += ms; return Promise.resolve(); } }; }

test('visible document returns at once and never asks for focus', async () => {
  let asked = 0;
  const r = await TV.ensure({ hidden: false, visibilityState: 'visible' }, () => { asked++; }, fakeClock());
  assert.strictEqual(r.visible, true); assert.strictEqual(asked, 0);
});
test('hidden then visible: asks the background to focus the tab, then proceeds', async () => {
  const clk = fakeClock(); const doc = { hidden: true, visibilityState: 'hidden' }; let asked = 0;
  const r = await TV.ensure(doc, () => { asked++; doc.hidden = false; doc.visibilityState = 'visible'; }, Object.assign({ timeoutMs: 10000 }, clk));
  assert.strictEqual(r.visible, true); assert.strictEqual(asked, 1);
});
test('hidden forever: gives up after ~10s with visible:false, having asked repeatedly, and never touches the page', async () => {
  const clk = fakeClock(); let asked = 0, touched = 0;
  const doc = { hidden: true, visibilityState: 'hidden', querySelector: () => { touched++; return null; } };
  const r = await TV.ensure(doc, () => { asked++; }, Object.assign({ timeoutMs: 10000 }, clk));
  assert.strictEqual(r.visible, false);
  assert.ok(r.waitedMs >= 10000 && r.waitedMs < 11000);
  assert.ok(asked >= 3);
  assert.strictEqual(touched, 0);
  assert.strictEqual(TV.REASON, 'tab_not_visible');
});
test('visibilityState alone also counts as hidden (prerender / minimised)', () => {
  assert.strictEqual(TV.isVisible({ hidden: false, visibilityState: 'prerender' }), false);
  assert.strictEqual(TV.isVisible({ hidden: false }), true);
});

test('wiring: the visibility gate runs before the mark-as-sold and delete clicks; tab_not_visible costs no attempt and never reaches removal-skipped', () => {
  const root = path.join(__dirname, '..');
  const v = fs.readFileSync(path.join(root, 'fas-vinted.js'), 'utf8');
  const fn = v.slice(v.indexOf('async function deleteVintedListingOnDetailPage'));
  const gate = fn.indexOf('FAS_TV.ensure'), sold = fn.indexOf('vintRemSyntheticClick(soldBtn)'), del = fn.indexOf('vintRemSyntheticClick(deleteBtn)');
  assert.ok(gate > 0 && gate < sold && sold < del, 'gate before both clicks');
  assert.ok(/if \(!vis\.visible\) return FAS_TV\.REASON/.test(fn));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const vs = man.content_scripts.find((c) => c.js.indexOf('fas-vinted.js') !== -1).js;
  assert.ok(vs.indexOf('fas-tab-visible.js') !== -1 && vs.indexOf('fas-tab-visible.js') < vs.indexOf('fas-vinted.js'));
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const h = bg.slice(bg.indexOf("msg.type === 'crossPlatformRemovalAttemptFailed'"));
  const branch = h.slice(h.indexOf("msg.reason === 'tab_not_visible'"), h.indexOf('const attempts = await bumpRemovalAttempt'));
  assert.ok(branch.length > 50 && !/removal-skipped|bumpRemovalAttempt|apiFetch/.test(branch), 'deferral branch makes no attempt count and no backend call');
  assert.ok(/fasRemovalDeferred/.test(branch) && /advanceAndContinueCrossPlatformRemoval/.test(branch));
  assert.ok(/!\(deferredMap\[platform \+ ':' \+ i\.id\] > Date\.now\(\)\)/.test(bg), 'deferred items are left out of the next poll queue');
});
