const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
test('smart pricing: absent section is reported, present-but-unfindable logs the nearby buttons', () => {
  assert.ok(/smart_pricing_absent/.test(src));
  assert.ok(/Buttons near it: /.test(src));
});
test('weight box rejection logs readable values, not [object Object]', () => {
  assert.ok(!/weight boxes: ' \+ wf\.reason, wf\)/.test(src));
  assert.ok(/ozBoxValue: ozEl \? ozEl\.value : null/.test(src));
});
