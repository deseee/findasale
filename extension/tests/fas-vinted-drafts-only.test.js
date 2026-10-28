// 1.0.77 (owner decision 2026-10-27): Vinted listings are no longer saved as drafts. The extension fills the listing and
// stops with Vinted's own form ready; the organizer clicks Upload. Source-level guarantees: no code clicks Upload or Save
// draft (the 1.0.63 Save draft finder and its callers are gone), the legal header and the no-relist rule stay, and the
// queue / popup wiring is in place. (Replaces the 1.0.63 drafts-only checks.)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = rd('fas-vinted.js');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const code = codeOnly(src);

function fnBody(name) {
  let i = src.indexOf('  async function ' + name + '(');
  if (i < 0) i = src.indexOf('  function ' + name + '(');
  assert.ok(i > 0, name + ' not found');
  return src.slice(i, src.indexOf('\n  }\n', i) + 4);
}

test('no Save draft click and no Upload click anywhere in extension code', () => {
  // The 1.0.63 automatic Save draft is gone: no finder, no caller, no button-text matcher for it.
  assert.ok(!/fasVintedSaveDraftNow|fasVintedFindSaveDraftButton/.test(src));
  assert.ok(!/save \(as \)\?draft/.test(src));
  assert.ok(!/fasVintedConfirmPendingDraft|fasVintedHasPendingDraftFor/.test(src));
  for (const f of ['fas-vinted.js', 'fas-vinted-drafts.js', 'fas-vinted-bridge.js', 'popup.js', 'background.js']) {
    const c = codeOnly(rd(f));
    // Nothing clicks a control whose text/handle mentions Upload or draft.
    assert.ok(!/(upload|draft)[^\n]{0,80}\.click\(\)/i.test(c), f + ' clicks an Upload/draft control');
    assert.ok(!/=== 'upload'[^\n]*\.click\(/.test(c), f);
    assert.ok(!/=== 'save draft'/.test(c), f);
  }
  // Every comparison against Vinted's Upload button text in fas-vinted.js only observes or scrolls to it.
  const uploadLines = code.split('\n').filter((l) => /=== 'upload'/.test(l));
  assert.ok(uploadLines.length >= 2);
  uploadLines.forEach((l) => assert.ok(!/\.click\(|dispatchEvent/.test(l), l));
  // The pure helper never clicks, fetches or touches chrome.
  assert.ok(!/\.click\(|fetch\(|chrome\./.test(codeOnly(rd('fas-vinted-drafts.js'))));
});

test('legal header kept: the no-relist rule stands, and it says drafts are no longer created by code', () => {
  const head = src.slice(0, 4000);
  assert.ok(/CRITICAL, NON-NEGOTIABLE LEGAL\/PRODUCT BOUNDARY/.test(head));
  assert.ok(/ABSOLUTELY NO relist, bump, refresh, scheduled-repost/.test(head));
  assert.ok(/Vinted must never be wired into\n \* autoRenewDueItems\(\)/.test(head));
  assert.ok(/1\.0\.77 \(2026-10-27\): drafts are no longer created by code/.test(head));
  assert.ok(/No code clicks Upload or Save\n \* draft\./.test(head));
  assert.ok(/NEVER auto-click the final "Upload"\/"Publish" action, and \(1\.0\.77\) never "Save draft"/.test(head));
});

test('the fill stops at Vinted\'s own form: the review screen arms upload detection, nothing is clicked after the fill', () => {
  const ov = fnBody('showReviewOverlay');
  assert.ok(/fasVintedArmPendingUpload\(item\)/.test(ov));
  assert.ok(!/setTimeout\([^\n]*(Draft|draft)/.test(ov));
  assert.ok(/Vinted: you click Upload\./.test(ov));
  assert.ok(/fasVintedNoteUploadClick\(\)/.test(ov));
  const deferredFill = src.slice(src.indexOf('    const runFill = async () => {'), src.indexOf('    const tick = () => {'));
  assert.ok(!/\.click\(|Draft/.test(codeOnly(deferredFill)));
  // run() watches for Vinted's reset after showing the review screen.
  const r = fnBody('run');
  assert.ok(r.indexOf('showReviewOverlay(') < r.indexOf('fasVintedWatchForReset(item, index, total)'));
});

test('the organizer\'s "I clicked Upload" button looks for the upload; it never marks listed on its own', () => {
  const ov = fnBody('showReviewOverlay');
  const i = ov.indexOf('if (next) next.onclick = async () => {');
  const handler = ov.slice(i, ov.indexOf('\n    };\n', i));
  assert.ok(/fasVintedConfirmPendingUpload\('posted_button', true\)/.test(handler));
  assert.ok(!/markListed/.test(handler));
  assert.ok(/maybeShowVintedContinuePrompt\('not_found'\)/.test(handler));
});

test('Continue / Not yet prompt: Continue only advances the queue; it never sends markListed', () => {
  const p = fnBody('maybeShowVintedContinuePrompt');
  assert.ok(/button\('fas-vin-continue', 'Continue to next item &#9654;', true\)/.test(p));
  assert.ok(/button\('fas-vin-close', 'Not yet', false\)/.test(p));
  assert.ok(!/markListed/.test(codeOnly(p)));
  assert.ok(/advanceVintedQueue/.test(p));
  assert.ok(p.indexOf('fasVintedConfirmPendingUpload(') < p.indexOf("'fas-vin-continue'"));
});

test('start(): a waiting fill is refilled or prompted before anything else; the duplicate guard runs before the attempt counter', () => {
  const s = fnBody('start');
  const iWait = s.indexOf('const waitingFill = await fasVintedGetPendingUpload();');
  const iDup = s.indexOf('if (await fasVintedSkipIfAlreadyPresent(queued.item)) return;');
  const iAttempts = s.indexOf("const FAS_VINTED_ATTEMPTS_KEY = 'fasVintedItemAttempts';");
  const iRun = s.indexOf('await run(queued.item, queued.index, queued.total);');
  assert.ok(iWait > 0 && iDup > iWait && iAttempts > iDup && iRun > iAttempts);
  assert.ok(/fasVintedHandleFormReset\(queued\.item, queued\.index, queued\.total, 'page_load'\)/.test(s));
  // Pickup-only is still refused first.
  assert.ok(s.indexOf('vintedSkipPickupOnlyItem(queued.item)') < iDup);
});

test('kept: uploaded 1.0.63-1.0.76 drafts are still recorded on page load, and the old pending-draft key is cleaned up', () => {
  assert.ok(/setTimeout\(\(\) => \{ fasVintedRecordUploadedDrafts\(\); \}/.test(src));
  assert.ok(/chrome\.storage\.local\.remove\(FAS_VINTED_LEGACY_PENDING_DRAFT_KEY\)/.test(src));
});

test('Vinted has no auto queue in the extension', () => {
  const bg = rd('background.js');
  const m = bg.match(/const FAS_AUTOLIST_QUEUE_CFG = \{([\s\S]*?)\n\};/);
  assert.ok(m);
  assert.ok(!/VINTED/.test(m[1].replace(/\/\/[^\n]*/g, '')));
});

test('popup copy: you click Upload (no more "saves a draft"), and the helper loads before popup.js', () => {
  const html = rd('popup.html');
  assert.ok(/Vinted \(you click Upload\)/.test(html));
  assert.ok(/<b>Vinted: you click Upload\.<\/b>/.test(html));
  assert.ok(!/saves a draft/.test(html));
  assert.ok(html.indexOf('<script src="fas-vinted-drafts.js"></script>') > 0 && html.indexOf('<script src="fas-vinted-drafts.js"></script>') < html.indexOf('<script src="popup.js"></script>'));
  assert.ok(/id="hiddenSummary"/.test(html), '1.0.78: one compact hidden-items line replaces the separate notes');
  assert.ok(!/id="vintedPresentNote"/.test(html) && !/id="eligibilityNote"/.test(html) && !/id="pickupOnlyNote"/.test(html));
});

test('manifest is 1.0.80 and loads the helper before fas-vinted.js', () => {
  const man = JSON.parse(rd('manifest.json'));
  assert.strictEqual(man.version, '1.0.80');
  const vs = man.content_scripts.find((c) => c.js.indexOf('fas-vinted.js') !== -1).js;
  assert.ok(vs.indexOf('fas-vinted-drafts.js') !== -1 && vs.indexOf('fas-vinted-drafts.js') < vs.indexOf('fas-vinted.js'));
});
