// Run: node --test extension/tests/fas-posh-electronics.test.js
const test = require('node:test');
const assert = require('node:assert');
const E = require('../fas-posh-electronics.js');

test('powered electronics get the factory-reset hint', () => {
  assert.ok(E.factoryResetHint({ title: 'Vivitar 2500 Zoom Thyristor Electronic Flash with Original Box', category: 'Cameras & Photo', tags: ['Vivitar', 'Electronic Flash', 'Vintage Camera'] }));
  assert.ok(E.factoryResetHint({ title: 'JBL Flip bluetooth speaker', category: 'Consumer Electronics' }));
  assert.ok(E.factoryResetHint({ title: 'Dell Latitude laptop', category: 'Computers' }));
  assert.ok(E.factoryResetHint({ title: 'Boss DS-1 distortion pedal', category: 'Musical Instruments' }));
});
test('non-electronics and passive photo gear get no hint', () => {
  assert.strictEqual(E.factoryResetHint({ title: 'Wool sweater', category: 'Women' }), '');
  assert.strictEqual(E.factoryResetHint({ title: 'Nikon 50mm f1.8 lens', category: 'Cameras & Photo' }), '');
  assert.strictEqual(E.factoryResetHint({ title: 'Camera bag', category: 'Cameras & Photo' }), '');
  assert.strictEqual(E.factoryResetHint({}), '');
});
test('hint is a plain note, never a claim about the item', () => {
  assert.ok(!/\u2014|estate sale|\bAI\b/i.test(E.HINT));
});
test('manifest loads the helper before fas-poshmark.js and version is at least 1.0.17', () => {
  const m = require('../manifest.json');
  const cs = m.content_scripts.find((c) => c.js.includes('fas-poshmark.js'));
  assert.ok(cs.js.indexOf('fas-posh-electronics.js') >= 0 && cs.js.indexOf('fas-posh-electronics.js') < cs.js.indexOf('fas-poshmark.js'));
  const [a, b, c] = m.version.split('.').map(Number);
  assert.ok(a > 1 || (a === 1 && (b > 0 || c >= 17)), 'version ' + m.version);
});
