// 1.0.63 (Patrick, 2026-10-23): Vinted is drafts only. Automation may press Vinted's "Save draft", never Upload, and a
// saved draft is not recorded as a live listing. Vinted has no auto queue. Source-level checks plus the button finder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = rd('fas-vinted.js');

test('the only button code ever clicks for posting is an exact "Save draft" match', () => {
  const i = src.indexOf('function fasVintedFindSaveDraftButton()');
  assert.ok(i > 0);
  const body = src.slice(i, i + 400);
  assert.ok(/\^save \(as \)\?draft\$/.test(body));
  assert.ok(/=== 'upload'\) return null/.test(body));
  // No code path clicks a button whose text is Upload.
  assert.ok(!/=== 'upload'[^\n]*\.click\(\)/.test(src));
  assert.ok(!/upload[^\n]{0,80}\.click\(\)/i.test(src.replace(/\/\/[^\n]*/g, '')));
});

test('saving a draft advances the queue without marking the item listed', () => {
  const i = src.indexOf('fasVintedSaveDraftNow = async (why)');
  assert.ok(i > 0);
  const body = src.slice(i, i + 3200);
  assert.ok(/advanceVintedQueue/.test(body));
  assert.ok(!/markListed/.test(body));
  assert.ok(/btn\.click\(\)/.test(body));
});

test('both fill paths save the draft, and the UI says drafts only', () => {
  assert.ok(/fasVintedSaveDraftNow\('fill_done'\)/.test(src));
  assert.ok(/fasVintedSaveDraftNow\('deferred_fill_done'\)/.test(src));
  assert.ok(/Vinted: saves a draft for you to post\./.test(src));
  assert.ok(/Vinted \(saves a draft for you to post\)/.test(rd('popup.html')));
  assert.ok(/Vinted: saves a draft for you to post\./.test(rd('popup.html')));
});

test('Vinted has no auto queue in the extension', () => {
  const bg = rd('background.js');
  const m = bg.match(/const FAS_AUTOLIST_QUEUE_CFG = \{([\s\S]*?)\n\};/);
  assert.ok(m);
  assert.ok(!/VINTED/.test(m[1].replace(/\/\/[^\n]*/g, '')));
});
