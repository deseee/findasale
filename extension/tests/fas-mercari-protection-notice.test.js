const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// 1.0.37: the "Max delivery protection is $20" notice is dismissed with its Got it button; Poshmark "suspicious" saves stop the run.
test('mercari shipping dismisses the delivery-protection notice after picking and after saving a carrier', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
  assert.ok(src.indexOf('const dismissProtectionNotice = async') !== -1);
  assert.strictEqual((src.match(/await dismissProtectionNotice\(\);/g) || []).length, 2);
  assert.ok(/max delivery protection/.test(src));
});
test('poshmark edit engine returns blocked on a suspicious/certify response before any form fallback', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');
  const i = src.indexOf("blocked('poshmark_flagged'"); const j = src.indexOf('return poshFormFallback(ctx, id, W, \'api_post_failed');
  assert.ok(i !== -1 && j !== -1 && i < j);
});
