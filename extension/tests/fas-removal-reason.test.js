// Node tests for fas-removal-reason.js. Run: node --test extension/tests/fas-removal-reason.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('../fas-removal-reason.js');

const flash = { id: 'i1', reason: 'POLICY_INELIGIBLE', policyReasons: { POSHMARK: 'Cameras and electronics   are not allowed on Poshmark.' } };

test('labels follow the real reason; a missing reason keeps the legacy sold-elsewhere meaning', () => {
  assert.strictEqual(R.label({ reason: 'SOLD_ELSEWHERE' }), 'sold elsewhere');
  assert.strictEqual(R.label({}), 'sold elsewhere');
  assert.strictEqual(R.label(flash), 'no longer allowed by policy');
  assert.strictEqual(R.label({ reason: 'UNPUBLISHED' }), 'unpublished');
  assert.strictEqual(R.label({ reason: 'ITEM_DELETED' }), 'deleted from FindA.Sale');
  assert.strictEqual(R.label({ reason: 'RESYNC_VERIFY' }), 're-check only');
  assert.match(R.label({ reason: 'SOMETHING_NEW' }), /^ended \(SOMETHING_NEW\)/);
});

test('a policy-only batch never says sold', () => {
  const h = R.headline([flash], 'POSHMARK');
  assert.strictEqual(h, 'Removing 1 item(s) from POSHMARK (1 no longer allowed by policy)');
  assert.ok(!/sold/i.test(h));
});

test('mixed batches are grouped with counts', () => {
  const items = [{ reason: 'SOLD_ELSEWHERE' }, { id: 'x' }, flash, { reason: 'UNPUBLISHED' }, { reason: 'ITEM_DELETED' }, { reason: 'RESYNC_VERIFY' }];
  assert.strictEqual(R.summary(items), '2 sold elsewhere, 1 no longer allowed by policy, 1 unpublished, 1 deleted from FindA.Sale, 1 re-check only');
  assert.deepStrictEqual(R.counts(items), { SOLD_ELSEWHERE: 2, POLICY_INELIGIBLE: 1, UNPUBLISHED: 1, ITEM_DELETED: 1, RESYNC_VERIFY: 1, OTHER: 0 });
});

test('a re-check-only batch says re-checking, not removing', () => {
  assert.match(R.headline([{ reason: 'RESYNC_VERIFY' }], 'MERCARI'), /^Re-checking 1 item\(s\) on MERCARI/);
  assert.strictEqual(R.checkOnly([]), false);
});

test('itemsCtx carries reason and, for policy takedowns, the cleaned rule text for that platform only', () => {
  const ctx = R.itemsCtx([flash, { id: 'i2' }], 'POSHMARK', 10);
  assert.deepStrictEqual(ctx[0], { id: 'i1', reason: 'POLICY_INELIGIBLE', policyReason: 'Cameras and electronics are not allowed on Poshmark.' });
  assert.deepStrictEqual(ctx[1], { id: 'i2', reason: 'SOLD_ELSEWHERE' });
  assert.strictEqual(R.itemsCtx([flash], 'MERCARI', 10)[0].policyReason, undefined);
  assert.strictEqual(R.itemsCtx(new Array(30).fill({ id: 'a' }), 'POSHMARK', 10).length, 10);
});

test('overlay line names the reason', () => {
  assert.strictEqual(R.overlayLine(flash, 0, 3), 'removing item 1 of 3 (no longer allowed by policy)');
  assert.strictEqual(R.overlayLine({ reason: 'RESYNC_VERIFY' }, 1, 2), 'checking item 2 of 2 (re-check only)');
});

test('source pins: no removal log or overlay still hard-codes "sold" for every batch', () => {
  const dir = path.join(__dirname, '..');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const bg = strip(fs.readFileSync(path.join(dir, 'background.js'), 'utf8'));
  assert.ok(!/sold\/ended/.test(bg));
  assert.ok(/FAS_REMOVAL_REASON/.test(bg) && /rr\.headline\(itemsForPlatform, platform\)/.test(bg));
  assert.ok(/policyReason/.test(bg));
  for (const f of ['fas-poshmark.js', 'fas-mercari.js', 'fas-grailed.js', 'fas-remove.js', 'fas-vinted.js']) {
    const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(!/removing sold item/.test(src), f);
    assert.ok(/FAS_REMOVAL_REASON/.test(src), f);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const f of ['fas-poshmark.js', 'fas-mercari.js', 'fas-grailed.js', 'fas-remove.js', 'fas-vinted.js']) {
    const cs = manifest.content_scripts.find((c) => c.js.includes(f));
    assert.ok(cs.js.includes('fas-removal-reason.js') && cs.js.indexOf('fas-removal-reason.js') < cs.js.indexOf(f), f);
  }
  assert.ok(/importScripts\([^)]*fas-removal-reason\.js/.test(fs.readFileSync(path.join(dir, 'background.js'), 'utf8')));
});
