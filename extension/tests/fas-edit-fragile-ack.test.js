// Poshmark's edit form ends in "List This Item" then a fragile-item packing acknowledgement (two dialogs). The engine must click only those.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');
const i = src.indexOf("S.phase === 'posh_verify_only'");
const w = src.slice(i, i + 3800);
test('verify_only phase clicks the Share Listing and both fragile dialogs before checking for a certify block', () => {
  assert.ok(/posh_fragile_ack/.test(w));
  assert.ok(/potential breakable item/.test(w) && /not be compensating/.test(w));
  assert.ok(/lb === 'publish'/.test(w) && /lb === 'publish listing'/.test(w));
  assert.ok(/list this item/.test(w));
  assert.ok(w.indexOf('posh_fragile_ack') < w.indexOf("poshmark_flagged"));
});
test('certify / suspicious prompts still stop the run', () => {
  assert.ok(/suspicious\|certify/.test(w) && /blocked\('poshmark_flagged'/.test(w));
});
