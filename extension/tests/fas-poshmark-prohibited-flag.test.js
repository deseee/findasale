const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
test('Poshmark prohibited-item certify modal is reported, never certified, and the queue advances', () => {
  assert.ok(/poshmark_prohibited_flag/.test(src));
  assert.ok(/potential \(oversized\|prohibited\) item\|certify this listing/.test(src));
  const i = src.indexOf("code: 'poshmark_prohibited_flag'");
  assert.ok(src.indexOf('advancePoshmarkQueue', i) > i && src.indexOf('advancePoshmarkQueue', i) - i < 1600);
  assert.ok(src.indexOf('poshmark_prohibited_flag') < src.indexOf("code: 'publish_unconfirmed'"));
  assert.ok(!/findPoshmarkVisibleButtonByText\('certify/.test(src));
});
test('flag kind is classified on the full dialog text, from the smallest matching element', () => {
  assert.ok(!/\/prohibited\|certify\/i\.test\(flagText\)/.test(src));
  assert.ok(/\.sort\(\(a, b\) => a\.length - b\.length\)\[0\]/.test(src));
  assert.ok(/potential prohibited item\|prohibited items\? policy\|certify this listing/.test(src));
});
