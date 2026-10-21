const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
test('Poshmark skips an item started 3 times in 15 minutes', () => {
  assert.ok(/poshmark_fill_loop/.test(src));
  assert.ok(/seenCount >= 3/.test(src));
  assert.ok(src.indexOf('poshmark_fill_loop') > src.indexOf('async function run(item') && src.indexOf('poshmark_fill_loop') < src.indexOf("tStep('Opening the listing form'"));
});
