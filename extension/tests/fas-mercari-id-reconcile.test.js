const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
test('Mercari listings page reconciles missing listing ids by unique title', () => {
  assert.ok(/async function mercReconcileIds\(/.test(src));
  assert.ok(/marketplaceListedMercari === true && !\(it\.listingRefs && it\.listingRefs\.MERCARI\)/.test(src));
  assert.ok(/list\.length !== 1 \|\| !ids \|\| ids\.size !== 1/.test(src));
  assert.ok(/mercReconcileIds\(\);\n\s+const ranPricePush/.test(src));
});
