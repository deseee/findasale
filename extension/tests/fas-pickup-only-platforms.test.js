const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('popup keeps pickup-only items off Vinted, Mercari and Poshmark', () => {
  const m = rd('popup.js').match(/const PICKUP_INCOMPATIBLE_PLATFORMS = (\[[^\]]*\]);/);
  assert.ok(m);
  const list = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepStrictEqual(list.sort(), ['MERCARI', 'POSHMARK', 'VINTED']);
});
test('mercari and poshmark content scripts refuse a pickup-only item', () => {
  assert.ok(/queued\.item\.localPickupOnly === true/.test(rd('fas-mercari.js')));
  assert.ok(/queued\.item\.localPickupOnly === true/.test(rd('fas-poshmark.js')));
});
