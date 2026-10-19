// Node tests for extension 1.0.25: a Mercari listing can never silently land in the wrong category.
// Real case: signed golf HAT (eBay category text just "Balls"), mapped to Sports & outdoors > Golf > Golf apparel, ended up in Golf balls
// while the trail only said "Category set". Run: node --test extension/tests/fas-mercari-category-guard.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');

function extractFn(name) {
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(src); assert.ok(m, name + ' not found');
  const i = src.indexOf('{', m.index); let depth = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(m.index, j + 1); } }
  throw new Error('unbalanced ' + name);
}
const sb = {};
vm.createContext(sb);
vm.runInContext(['norm', 'mercariMappedPathParts', 'fasMercariCategoryGuard'].map(extractFn).join('\n') + '\nthis.guard = fasMercariCategoryGuard;', sb);
const guard = sb.guard;
const hat = { id: 'cmrme7g91000m1mldxea0f6fi', title: 'Titleist Pro 98 Plus Golf Hat, Signed by Chi Chi Rodriguez and Billy Casper', category: 'Balls', mercariCategoryId: 736, mercariCategoryPath: 'Sports & outdoors > Golf > Golf apparel' };

test('golf hat that landed in Golf balls is flagged, with expected path, shown text and the give-up reason', () => {
  const r = guard(hat, ['sports & outdoors > golf > golf balls', 'category sports & outdoors > golf > golf balls'], { result: 'no-match', why: 'no result row shows the mapped breadcrumb', query: 'Golf apparel' });
  assert.ok(r);
  assert.strictEqual(r.expectedPath, 'Sports & outdoors > Golf > Golf apparel');
  assert.strictEqual(r.expectedLeaf, 'Golf apparel');
  assert.strictEqual(r.shown, 'sports & outdoors > golf > golf balls');
  assert.strictEqual(r.mappedResult, 'no-match');
  assert.ok(r.reason.indexOf('no-match') !== -1 && r.reason.indexOf('no result row') !== -1);
});
test('correct category shown (any case / extra wrapper text) is NOT flagged', () => {
  assert.strictEqual(guard(hat, ['Sports & outdoors > Golf > Golf apparel'], { result: 'selected' }), null);
  assert.strictEqual(guard(hat, ['x', '  Category   SPORTS & OUTDOORS > GOLF >  Golf Apparel '], { result: 'selected' }), null);
});
test('item without mercariCategoryPath: behaviour unchanged, never flagged', () => {
  const plain = { id: 'a', title: 'Hat', category: 'Balls' };
  assert.strictEqual(guard(plain, ['golf balls'], null), null);
  assert.strictEqual(guard({ id: 'a', mercariCategoryPath: '' }, [''], null), null);
  assert.strictEqual(guard({ id: 'a', mercariCategoryPath: 'Golf apparel' }, ['golf balls'], null), null); // one-segment path is never attempted by the picker either
});
test('empty control and every give-up reason are reported, error text included', () => {
  const r = guard(hat, ['', null], { result: 'error', error: 'boom' });
  assert.strictEqual(r.shown, '(nothing)');
  assert.ok(r.reason.indexOf('error: boom') !== -1);
  for (const why of ['ambiguous', 'no-match', 'no-search-input', 'no-opener', 'modal-still-open', 'did-not-stick']) {
    assert.strictEqual(guard(hat, ['golf balls'], { result: why }).mappedResult, why);
  }
  assert.ok(guard(hat, ['golf balls'], null).reason.indexOf('never attempted') !== -1);
});
test('selected-format-mismatch whose control text lacks the leaf is flagged too (never silent)', () => {
  assert.ok(guard(hat, ['sports & outdoors > golf > gol...'], { result: 'selected-format-mismatch' }));
});

// ---- wiring pins on the real source ----
test('wiring: mapped attempt result/why/error are captured, pickCategory resets it, giveUp stores the reason', () => {
  assert.ok(src.indexOf('lastMappedCategoryAttempt = outcome;') !== -1);
  assert.ok(src.indexOf('outcome.why = why;') !== -1);
  assert.ok(src.indexOf('outcome.error = String(') !== -1);
  const pc = extractFn('pickCategory');
  assert.ok(pc.indexOf('lastMappedCategoryAttempt = null;') !== -1);
});
test('wiring: Category guardedFill passes a verify hook that runs the guard and puts the attempt + shown text in the step_ok ctx', () => {
  const i = src.indexOf("await guardedFill('Category'");
  const seg = src.slice(i, i + 1800);
  assert.ok(seg.indexOf('pickCategory(v, item.categoryBreadcrumb, item)') !== -1);
  assert.ok(seg.indexOf('fasMercariCategoryGuard(item, texts, att)') !== -1);
  assert.ok(seg.indexOf('mappedResult') !== -1 && seg.indexOf('shown:') !== -1 && seg.indexOf('mappedWhy') !== -1);
  assert.ok(seg.indexOf('if (!item.mercariCategoryPath) return null;') !== -1);
  assert.ok(seg.indexOf('if (categoryMismatch) return { photosOk') !== -1);
  const g = src.slice(src.indexOf('async function guardedFill'), src.indexOf("await guardedFill('Title'"));
  assert.ok(g.indexOf('if (vres && vres.blocked) categoryMismatch = vres.blocked;') !== -1);
  assert.ok(g.indexOf("else if (hasVal && ok) T.ok(label + ' set', vres && vres.ctx ? vres.ctx : undefined);") !== -1);
  assert.ok(g.indexOf('|| categoryMismatch) return false') !== -1);
});
test('wiring: run() stops with the mercari_category_mismatch problem, names item/expected/shown/why, and never auto-clicks', () => {
  const run = src.slice(src.indexOf('async function run(item, index, total)'), src.indexOf('function isNewListingPage'));
  const i = run.indexOf('if (fillResult.categoryMismatch)');
  assert.ok(i !== -1);
  const blk = run.slice(i, run.indexOf('showReviewOverlay(item, index, total, photosOk)'));
  for (const k of ["code: 'mercari_category_mismatch'", 'title:', 'what:', 'why:', 'next:', 'cm.expectedPath', 'cm.shown', 'cm.reason', 'cm.itemId', 'T.end(', 'return;']) assert.ok(blk.indexOf(k) !== -1, k);
  assert.ok(blk.indexOf('realClick') === -1 && blk.indexOf('.click(') === -1);
  assert.ok(i > run.indexOf('fillResult.interstitialAt') && i < run.indexOf("code: 'mercari_shipping_incomplete'")); // after nav/interstitial, before shipping/review
});
