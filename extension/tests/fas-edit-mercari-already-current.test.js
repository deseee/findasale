const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');
test('Mercari price edit finishes without Save when the live price already matches', () => {
  assert.ok(/var mercChanged = false;/.test(src));
  assert.ok(/if \(!mercChanged\) return done\(\{ readBack: \{ price: price\.value \}/.test(src));
  assert.ok(src.indexOf('if (!mercChanged) return done') < src.indexOf("button[data-testid=\"ListButton\"]');   // verified-in-DOM"));
});
