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
  assert.ok(/decision === 'skip'/.test(seg) && /fasPoshAdvance\(item\.id, flagKind === 'prohibited' \? 'flag_prohibited' : 'flag_oversized'\)/.test(seg) && /navigateToPoshmarkCreateListing\(\)/.test(seg));
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

test('getPoshmarkQueueItem never refuses a hand-reopened tab, only edit surfaces', () => {
  const i = bg.indexOf("msg.type === 'getPoshmarkQueueItem'");
  const seg = bg.slice(i, i + 3400);
  assert.ok(/poshNotQueueTab = poshOnEditSurface;/.test(seg) && !/sender\.tab\.id !== fasPoshmarkQueueTabId/.test(seg));
});

test('the fill-loop skip does not carry the certify wording', () => {
  const i = src.indexOf("code: 'poshmark_fill_loop'");
  const seg = src.slice(i, i + 900);
  assert.ok(!/Certify Listing/.test(seg));
});

test('getPoshmarkQueueItem also refuses edit pump / removal tabs and edit-listing pages', () => {
  const i = bg.indexOf("msg.type === 'getPoshmarkQueueItem'");
  const seg = bg.slice(i, i + 2600);
  assert.ok(/poshOnEditSurface/.test(seg) && /edit-listing/.test(seg) && /fasEditRun/.test(seg) && /fasPoshmarkRemovalTabId/.test(seg));
});

test('first flag retries once with a short description; second flag holds; a pass is logged as wording-was-the-trigger', () => {
  assert.ok(/POSH_FLAG_RETRY_KEY/.test(src) && /function poshShortDescription/.test(src));
  const i = src.indexOf("tInfo('flag_retry'");
  assert.ok(i > 0);
  const seg = src.slice(i, i + 900);
  assert.ok(/navigateToPoshmarkCreateListing\(\)/.test(seg));
  assert.ok(/flag_retry_failed/.test(src));
  assert.ok(/if \(poshFlagRetryState\(item\)\) \{ poshDescription = poshShortDescription\(item\)/.test(src));
  assert.ok(/Published after retrying/.test(src) && /with only the first photo/.test(src) && /flag_retry_photos/.test(src));
  assert.ok(src.indexOf("tInfo('flag_retry'") < src.indexOf("code: 'poshmark_oversized'"));
});
