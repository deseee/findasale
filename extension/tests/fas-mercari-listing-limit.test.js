const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
test('mercari run stops cleanly on the 100-listing limit notice', () => {
  assert.ok(/mercari_listing_limit/.test(src));
  const m = /limited to \(\\d\+\) listings\?/i.test(src);
  assert.ok(m);
  const re = /limited to (\d+) listings?/i;
  assert.strictEqual('Currently you are limited to 100 listings. This will be increased'.match(re)[1], '100');
});
