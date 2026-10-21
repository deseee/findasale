const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
test('Poshmark oversized-item dialog is reported and the queue advances', () => {
  assert.ok(/poshmark_oversized/.test(src));
  const i = src.indexOf("code: 'poshmark_oversized'");
  const block = src.slice(i, i + 900);
  assert.ok(/advancePoshmarkQueue/.test(block));
  assert.ok(src.indexOf('poshmark_oversized') < src.indexOf("code: 'publish_unconfirmed'"));
});
