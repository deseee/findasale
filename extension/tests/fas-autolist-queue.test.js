// Auto queue (extension 1.0.46): pickup-only items never fill Mercari/Poshmark queues, and the popup says how many items were queued.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('background auto queue holds pickup-only items back from Mercari and Poshmark', () => {
  const m = rd('background.js').match(/const FAS_AUTOLIST_PICKUP_BLOCKED = (\[[^\]]*\]);/);
  assert.ok(m);
  assert.deepStrictEqual(JSON.parse(m[1].replace(/'/g, '"')).sort(), ['MERCARI', 'POSHMARK']);
  assert.ok(/q\.localPickupOnly === true/.test(rd('background.js')));
});

test('background records what the auto queue loaded and the popup shows it', () => {
  assert.ok(/fasAutoQueued/.test(rd('background.js')));
  const popup = rd('popup.js');
  assert.ok(/fasAutoQueued/.test(popup));
  assert.ok(/by your auto queue/.test(popup));
});

test('manifest is 1.0.56', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.56');
});
