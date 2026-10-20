const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// 1.0.38: the envelope carrier row is skipped unless the item is flat; function is extracted from source and run.
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
const m = src.match(/function itemFitsFlatEnvelope\(item\) \{[\s\S]*?\n  \}\n/);
test('itemFitsFlatEnvelope exists', () => assert.ok(m));
const fits = new Function(m[0] + '; return itemFitsFlatEnvelope;')();
test('flat items fit, rigid or unknown do not', () => {
  assert.strictEqual(fits({ packageLengthIn: 9, packageWidthIn: 6, packageHeightIn: 0.5 }), true);
  assert.strictEqual(fits({ packageLengthIn: 5, packageWidthIn: 3, packageHeightIn: 1.5 }), false);
  assert.strictEqual(fits({ packageLengthIn: 14, packageWidthIn: 6, packageHeightIn: 0.5 }), false);
  assert.strictEqual(fits({ packageLengthIn: null, packageWidthIn: null, packageHeightIn: null }), false);
});
test('carrier loop skips envelope rows for non-flat items', () => {
  assert.ok(/!envelopeOk && \/envelope\/i\.test\(rowText/.test(src));
});
