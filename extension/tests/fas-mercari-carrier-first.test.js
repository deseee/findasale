const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 1.0.34: Mercari can open on the carrier list without the shoebox question; the shipping step must go on to pick the carrier, not stop.
test('the shipping label step continues when the carrier list is already showing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
  const a = src.indexOf('const r2 = await answerShoeboxAndAdvance(4000);');
  assert.ok(a > 0);
  const block = src.slice(a, a + 1800);
  assert.ok(block.includes('SelectCarrierSaveButton'));
  assert.ok(block.includes('which label would you like to use'));
  assert.ok(block.includes('shipping_carrier_screen_first'));
  assert.ok(block.indexOf('if (!carrierScreenShowing)') > 0 && block.includes('never appeared'));
  assert.ok(src.indexOf('const carrierRadios = await waitForSelector') > a);
});
