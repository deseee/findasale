'use strict';
// 1.0.87: after "List this item" the tab can land on the closet. It must settle that click there (not reopen the form),
// and a fresh form is only "ambiguous" when the closet does not show the listing live.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');

test('a tab that just clicked List this item does not auto-open the create-listing form', () => {
  const i = src.indexOf('const justClicked =');
  const j = src.indexOf('poshShouldAutoNavToCreate(location.pathname');
  assert.ok(i > 0 && j > i, 'justClicked is computed before the auto-nav decision');
  assert.ok(/if \(!justClicked && poshShouldAutoNavToCreate\(/.test(src));
});

test('a fresh form after the click checks the live closet before calling it ambiguous', () => {
  const ready = src.indexOf("if (outcomeState === 'ready') {");
  const dup = src.indexOf('fasPoshClosetDupCheck(queued.item)', ready);
  const timeoutBranch = src.indexOf("if (outcomeState === 'timeout') {", ready);
  const ambiguous = src.indexOf("code: 'publish_click_ambiguous'");
  assert.ok(ready > 0 && dup > ready && timeoutBranch > dup && ambiguous > timeoutBranch);
  assert.ok(/r\.state === 'dup'[^\n]*outcomeState = 'timeout'/.test(src), 'a live closet match is treated as published');
});

test('manifest is at least 1.0.87', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version;
  assert.ok(require('./_version').atLeast(v, '1.0.87'));
});
