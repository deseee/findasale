// 1.0.70 (2026-10-27, Patrick: the flagged pick holders / tuners / straps are not oversized, post them): when the organizer
// uses "Not oversized, certify and post" on the web card, the server returns the item id in certifyOversizedIds; the
// extension stores it (fasPoshCertifyOk) and clicks Poshmark's Certify Listing only for an OVERSIZED flag on that item.
// A prohibited flag is never certified. Items not on the list behave exactly as before.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const bg = rd('background.js');
const posh = rd('fas-poshmark.js');

function extract(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
const should = new Function('const POSH_CERTIFY_TTL_MS = 30 * 24 * 3600 * 1000;\n' + extract(posh, 'poshShouldAutoCertify') + '\nreturn poshShouldAutoCertify;')();
const isCertifyText = new Function(extract(posh, 'poshIsCertifyButtonText') + '\nreturn poshIsCertifyButtonText;')();
const store = new Function(extract(bg, 'fasPoshCertifyStore') + '\nreturn fasPoshCertifyStore;')();

const NOW = Date.parse('2026-10-27T12:00:00Z');
const STRAP = 'cmuobqqyg00g1qcr4e3qyxnk3';
const PICKS = 'cmu5stawt0071rd9bwrntc9ok';
const OTHER = 'cmtk2knjk0egs3bwwrde12qwr';
const st = { ids: [STRAP, PICKS], at: NOW - 60e3 };

test('an oversized flag on a confirmed item is certified', () => {
  assert.strictEqual(should('oversized', STRAP, st, NOW), true);
  assert.strictEqual(should('oversized', PICKS, st, NOW), true);
});

test('a prohibited flag is NEVER certified, even for a confirmed id', () => {
  assert.strictEqual(should('prohibited', STRAP, st, NOW), false);
  assert.strictEqual(should('prohibited', PICKS, { ids: [PICKS], at: NOW }, NOW), false);
  assert.strictEqual(should('', STRAP, st, NOW), false);
  assert.strictEqual(should('edit', STRAP, st, NOW), false);
});

test('items not on the list, a missing / malformed store, or a store older than 30 days are not certified', () => {
  assert.strictEqual(should('oversized', OTHER, st, NOW), false);
  assert.strictEqual(should('oversized', STRAP, null, NOW), false);
  assert.strictEqual(should('oversized', STRAP, { ids: STRAP, at: NOW }, NOW), false);
  assert.strictEqual(should('oversized', STRAP, { ids: [STRAP] }, NOW), false);
  assert.strictEqual(should('oversized', STRAP, { ids: [STRAP], at: NOW - 31 * 24 * 3600e3 }, NOW), false);
  assert.strictEqual(should('oversized', undefined, st, NOW), false);
});

test('the Certify button is found by its text, tolerant of case and spacing, and nothing else matches', () => {
  for (const t of ['Certify Listing', '  certify   listing ', 'CERTIFY LISTING', 'Certify', 'Certify this listing', 'Certify Item']) assert.strictEqual(isCertifyText(t), true, t);
  for (const t of ['Cancel', 'Edit Listing', 'List this item', 'I certify that this is not oversized and agree', 'Certify Listing later', '', null]) assert.strictEqual(isCertifyText(t), false, String(t));
});

test('the Certify button is looked up inside the oversized dialog only, and must be visible and enabled', () => {
  const fn = extract(posh, 'findPoshmarkCertifyButton');
  assert.ok(/potential oversized item/.test(fn));
  assert.ok(/d\.querySelectorAll\(/.test(fn), 'searched within the dialog element, not the whole page');
  assert.ok(/offsetParent !== null && !b\.disabled && poshIsCertifyButtonText/.test(fn));
});

test('fasPoshCertifyStore keeps valid unique ids and stamps the poll time', () => {
  assert.deepStrictEqual(store([STRAP, STRAP, '../x', 5, PICKS], NOW), { ids: [STRAP, PICKS], at: NOW });
  assert.deepStrictEqual(store(undefined, NOW), { ids: [], at: NOW });
});

test('wiring: the poll stores certifyOversizedIds next to the hold changes, before the Poshmark queue filter', () => {
  const fn = bg.slice(bg.indexOf('async function checkAutoListQueue'), bg.indexOf('async function checkAutoListQueue') + 12000);
  const applyAt = fn.indexOf('fasPoshApplyHoldChanges(cur, rel, drp)');
  const certAt = fn.indexOf('fasPoshCertifyStore(resp.data.certifyOversizedIds, Date.now())');
  const filterAt = fn.indexOf("platform === 'POSHMARK' && Array.isArray(items)");
  assert.ok(applyAt > 0 && certAt > applyAt && filterAt > certAt);
  assert.ok(/Array\.isArray\(resp\.data\.certifyOversizedIds\)/.test(fn), 'an older server that sends nothing leaves the store alone');
  assert.ok(/fasPoshCertifyOk: cs/.test(fn));
});

test('wiring: certify runs only for an oversized flag on a confirmed item, verifies the publish, logs certified_oversized, else holds as before', () => {
  const i = posh.indexOf('let certifyTried = false;');
  assert.ok(i > 0);
  const block = posh.slice(i, i + 2600);
  assert.ok(/flagText && flagKind === 'oversized' && poshShouldAutoCertify\(flagKind, item\.id, await poshReadCertifyStore\(\), Date\.now\(\)\)/.test(block));
  assert.ok(/certified_oversized/.test(block));
  assert.ok(/if \(flagText && !certified\) \{/.test(block), 'a failed or skipped certify falls through to the existing hold path');
  assert.ok(/if \(certifyTried\) nextStage = 0;/.test(posh), 'no cut-down retry for a confirmed item');
  const run = extract(posh, 'poshCertifyOversizedListing');
  assert.ok(/realClick\(btn\)/.test(run));
  assert.ok(/await waitForPoshmarkPublishConfirmation\(15000\)/.test(run), 'same publish verification as a normal publish');
  assert.ok(/unconfirmedPublishVerdict\(seen\)/.test(run), 'closet re-check when the form does not go away');
  // The prohibited branch still never certifies and still holds.
  const pIdx = posh.indexOf("code: 'poshmark_prohibited_flag'");
  assert.ok(pIdx > i, 'prohibited reporting stays on the hold path after the certify block');
  assert.ok(/holdForPoshmarkFlagDecision\(item, flagKind, index, total\)/.test(posh));
});

test('manifest is 1.0.70', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.70');
});

test('1.0.70: the oversized dialog confirm button "Publish Listing" counts as the certify control; Delete Listing never does', () => {
  assert.strictEqual(isCertifyText('Publish Listing'), true);
  assert.strictEqual(isCertifyText('  publish   listing '), true);
  assert.strictEqual(isCertifyText('Delete Listing'), false);
  assert.strictEqual(isCertifyText('Certify Listing'), true);
});
