const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
test('edit pump waits while a posting queue is running in its tab', () => {
  assert.ok(/async function fasPostQueueActive\(platform\)/.test(src));
  const pump = src.slice(src.indexOf('async function fasEditPump()'));
  assert.ok(pump.indexOf('fasPostQueueActive(platform)') > 0);
  assert.ok(pump.indexOf('fasPostQueueActive(platform)') < pump.indexOf('delete pending[platform]'));
});
