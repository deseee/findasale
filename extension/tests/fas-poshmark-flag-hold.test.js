const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('flagged listing holds for the person: skip button, never certifies, publishes if they certify', () => {
  const fn = src.indexOf('async function holdForPoshmarkFlagDecision');
  assert.ok(fn > 0);
  const body = src.slice(fn, fn + 3200);
  assert.ok(/Skip this item and continue the queue/.test(body));
  assert.ok(/never clicks it for you/.test(body));
  assert.ok(/fasPoshClosetDupCheck/.test(body));
  assert.ok(/10 \* 60 \* 1000/.test(body));
  assert.ok(!/Certify Listing['"]?\)?\s*\.click|realClick\([^)]*[Cc]ertify/.test(src));
});

test('flag branch records the flag without advancing, then skips with advance + next navigation', () => {
  const i = src.indexOf('flagOnly: true');
  assert.ok(i > 0);
  const seg = src.slice(i, i + 1800);
  assert.ok(/holdForPoshmarkFlagDecision\(item, flagKind, index, total\)/.test(seg));
  assert.ok(/decision === 'published'/.test(seg) && /published = true/.test(seg));
  assert.ok(/decision === 'skip'/.test(seg) && /fasPoshAdvance\(item\.id\)/.test(seg) && /navigateToPoshmarkCreateListing\(\)/.test(seg));
});

test('background: flagOnly records the refusal and does not advance the queue index', () => {
  const i = bg.indexOf("msg.type === 'advancePoshmarkQueue'");
  const j = bg.indexOf('msg.flagOnly === true', i);
  assert.ok(j > i);
  const k = bg.indexOf("fasPoshmarkIndex: next", j);
  assert.ok(k > j);
  assert.ok(bg.slice(j, k).includes('sendResponse({ ok: true, flagOnly: true })'));
  assert.ok(bg.indexOf('fasPoshFlagged: f', i) < j);
});

test('getPoshmarkQueueItem only hands the item to the tab driving the queue', () => {
  const i = bg.indexOf("msg.type === 'getPoshmarkQueueItem'");
  const seg = bg.slice(i, i + 1800);
  assert.ok(/fasPoshmarkQueueTabId/.test(seg) && /poshNotQueueTab/.test(seg) && /sender\.tab\.id !== fasPoshmarkQueueTabId/.test(seg));
});

test('the fill-loop skip does not carry the certify wording', () => {
  const i = src.indexOf("code: 'poshmark_fill_loop'");
  const seg = src.slice(i, i + 900);
  assert.ok(!/Certify Listing/.test(seg));
});
