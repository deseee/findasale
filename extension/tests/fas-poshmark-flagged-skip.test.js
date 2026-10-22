const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const ps = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
test('a Poshmark-flagged item is remembered and kept out of the auto queue', () => {
  assert.ok(/flagged: flagKind/.test(ps));
  assert.ok(/fasPoshFlagged/.test(bg));
  assert.ok(/msg\.flagged === 'oversized' \|\| msg\.flagged === 'prohibited'/.test(bg));
  const i = bg.indexOf("platform === 'POSHMARK' && Array.isArray(items)");
  assert.ok(i > bg.indexOf('async function checkAutoListQueue') && i < bg.indexOf('pausedForQueue.indexOf(platform)'));
});
