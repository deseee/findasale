// 2026-10-29 (owner-approved): Poshmark's own validator flags "Cartridge" in a title as a "potential prohibited item" (vape
// cartridges): FAS_FLOW_DIAG poshmark_prohibited_flag fired on Neo Geo MVS arcade cartridges while Neo Geo mini marquees in the
// same category posted fine. Only the title sent to Poshmark says "Cart"; the removal, sold and duplicate-guard title checks must
// still treat a listing posted either way as this item's.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const posh = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '..', 'fas-edit-engine.js'), 'utf8');
const C = require('../fas-edit-core.js');

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
function constLine(src, name) {
  const m = new RegExp('^\\s*const ' + name + ' = .*;$', 'm').exec(src);
  assert.ok(m, name);
  return m[0];
}
const NAMES = ['truncatePoshmarkTitle', 'poshmarkCartTitle', 'poshmarkListingTitle', 'fasFoldTitle', 'poshRemNorm',
  'poshRemStripTrailingEllipsis', 'poshRemCleanCardText', 'poshRemTitleMatches', 'poshRemSearchQuery'];
const P = new Function(constLine(posh, 'POSH_CART_VAPE_RE') + '\n' + constLine(posh, 'POSH_REM_SEARCH_STOPWORDS') + '\n' +
  NAMES.map((n) => extract(posh, n)).join('\n') + '\nreturn { ' + NAMES.join(', ') + ' };')();

const FATAL = 'Fatal Fury Neo Geo MVS Arcade Cartridge Cartridge, SNK 1991';
const SAMURAI = 'Samurai Shodown, SNK Arcade Game Cartridge with Box & Accessories NEGEO MVS';
const WORLD = 'World Heroes Neo Geo MVS Arcade Cartridge';

const CASES = [
  [FATAL, 'Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991'],
  [SAMURAI, 'Samurai Shodown, SNK Arcade Game Cart with Box & Accessories NEGEO MVS'],
  [WORLD, 'World Heroes Neo Geo MVS Arcade Cart'],
  ['Neo Geo MVS Cartridges Lot of 3', 'Neo Geo MVS Carts Lot of 3'],
  ['NINTENDO GAME CARTRIDGE', 'NINTENDO GAME CART'],
  ['sega genesis cartridge only', 'sega genesis cart only'],
  ['Game Cart Cartridge', 'Game Cart'],
  ['Cartridge Carts bundle', 'Carts bundle'],
  // whole word only
  ['Cartridgeless Pen Holder', 'Cartridgeless Pen Holder'],
  ['Shopping Cart Toy', 'Shopping Cart Toy'],
  // vape-related titles are left exactly as they are
  ['510 Thread Vape Cartridge Battery', '510 Thread Vape Cartridge Battery'],
  ['Empty THC Cartridges 1ml', 'Empty THC Cartridges 1ml'],
  ['E-Cig Cartridge Refill', 'E-Cig Cartridge Refill'],
  ['Oil Filter Cartridge', 'Oil Filter Cartridge'],
  ['', ''],
];

test('poshmarkCartTitle: Cartridge(s) -> Cart(s), whole word, case kept, doubled word collapsed, vape titles untouched', () => {
  for (const [input, want] of CASES) assert.strictEqual(P.poshmarkCartTitle(input), want, input);
  assert.strictEqual(P.poshmarkCartTitle(null), '');
});

test('fas-edit-core poshmarkCartTitle is identical to fas-poshmark.js', () => {
  for (const [input] of CASES) assert.strictEqual(C.poshmarkCartTitle(input), P.poshmarkCartTitle(input), input);
});

test('the fill types the Cart title (then the 80-char trim) and leaves item.title alone', () => {
  assert.ok(/const poshCartTitle = poshmarkCartTitle\(item\.title\);/.test(posh));
  assert.ok(/const poshTitle = truncatePoshmarkTitle\(poshCartTitle\);/.test(posh));
  assert.ok(/tryFill\('Title', poshTitle,/.test(posh));
  assert.ok(!/item\.title\s*=\s*poshmarkCartTitle/.test(posh));
  const long = 'Neo Geo MVS Arcade Cartridge, Metal Slug 3, SNK 2000, Tested Working Original Label Great';
  const posted = P.poshmarkListingTitle(long);
  assert.ok(posted.length <= 80);
  assert.ok(/Arcade Cart,/.test(posted));
});

test('removal / duplicate-guard matcher treats the Cart and Cartridge titles as the same listing', () => {
  // listing posted with the new Cart title
  assert.strictEqual(P.poshRemTitleMatches('Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991\n$45\nOS', FATAL), true);
  assert.strictEqual(P.poshRemTitleMatches('World Heroes Neo Geo MVS Arcade Cart', WORLD), true);
  // listing posted earlier with the original title (certified by hand)
  assert.strictEqual(P.poshRemTitleMatches(FATAL, FATAL), true);
  // a long title: Cart form, then the 80-char trim
  const long = 'Neo Geo MVS Arcade Cartridge, Metal Slug 3, SNK 2000, Tested Working Original Label Great';
  assert.strictEqual(P.poshRemTitleMatches(P.poshmarkListingTitle(long), long), true);
  // still never a loose match
  assert.strictEqual(P.poshRemTitleMatches('World Heroes Neo Geo MVS Arcade', WORLD), false);
  assert.strictEqual(P.poshRemTitleMatches('World Heroes 2 Neo Geo MVS Arcade Cart', WORLD), false);
  // vape title: only the exact title matches, no Cart form
  assert.strictEqual(P.poshRemTitleMatches('510 Thread Vape Cart Battery', '510 Thread Vape Cartridge Battery'), false);
});

test('closet search query leaves out the Cart/Cartridge word so either posted title is found', () => {
  assert.strictEqual(P.poshRemSearchQuery(WORLD, 5), 'World Heroes Neo Geo MVS');
  assert.strictEqual(P.poshRemSearchQuery('Cartridge Cleaner Kit for Neo Geo', 5), 'Cleaner Kit Neo Geo');
  // unchanged for every other title
  assert.strictEqual(P.poshRemSearchQuery('Shopping Cart Toy Metal', 5), 'Shopping Cart Toy Metal');
  assert.strictEqual(P.poshRemSearchQuery('510 Thread Vape Cartridge Battery', 5), '510 Thread Vape Cartridge Battery');
});

test('edit engine: closet lookup by title recognises the Cart listing', () => {
  const cards = [{ key: 'a'.repeat(24), texts: ['Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991\n$45\nOS'] }, { key: 'b'.repeat(24), texts: ['Fatal Fury 2 Neo Geo MVS Arcade Cart'] }];
  const r = C.pickUniquePoshmark(cards, FATAL);
  assert.strictEqual(r.reason, 'ok');
  assert.strictEqual(r.match.key, 'a'.repeat(24));
  // original-title listing still found first
  const r2 = C.pickUniquePoshmark([{ key: 'c'.repeat(24), texts: [FATAL] }], FATAL);
  assert.strictEqual(r2.match.key, 'c'.repeat(24));
  // both forms live -> each is still found on its own pass, never merged into a guess
  assert.strictEqual(C.titleEqualsPoshmark('Fatal Fury Neo Geo MVS Arcade Cart, SNK 1991', FATAL), true);
  assert.strictEqual(C.titleEqualsPoshmark('Fatal Fury Neo Geo MVS Arcade', FATAL), false);
  assert.strictEqual(C.pickUniquePoshmark([{ key: 'd'.repeat(24), texts: ['Unrelated Lamp'] }], FATAL).reason, 'none');
  assert.strictEqual(C.poshmarkSearchTitle(WORLD), 'World Heroes Neo Geo MVS Arcade');
  assert.strictEqual(C.poshmarkSearchTitle('Shopping Cart Toy'), 'Shopping Cart Toy');
  assert.strictEqual(C.poshmarkSearchTitle('Cartridge'), 'Cartridge');
  assert.ok(engine.indexOf('C.titleEqualsPoshmark(t, it.title)') !== -1);
  assert.strictEqual((engine.match(/C\.poshmarkSearchTitle\(it\.title\)/g) || []).length, 2);
});
