// 1.0.80 (2026-10-28, owner-approved): Vinted condition matching. Vinted's live options are exactly New with tags,
// New without tags, Very good, Good, Satisfactory, Not fully functional. Used grade A / refurbished used to map to
// 'Like new' (not an option) and the word scorer then picked "New with tags", labelling used items as new.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cond = require('../fas-condition.js');
const src = rd('fas-vinted.js');

const v = (conditionRaw, conditionGrade = null) => cond.platformValue('vinted', { conditionRaw, conditionGrade });

test('fas-condition maps every Vinted case to one of the six live labels', () => {
  assert.deepStrictEqual(cond.VINTED_LABELS, ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory', 'Not fully functional']);
  assert.strictEqual(v('NEW', 'A'), 'New with tags');
  assert.strictEqual(v('NEW_OTHER'), 'New without tags');
  assert.strictEqual(v('new without tags'), 'New without tags');
  assert.strictEqual(v('NEW_WITH_TAGS'), 'New with tags');
  assert.strictEqual(v('USED', 'A'), 'Very good');
  assert.strictEqual(v('USED', 'S'), 'Very good');
  assert.strictEqual(v('LIKE_NEW'), 'Very good');
  assert.strictEqual(v('USED', 'B'), 'Very good');
  assert.strictEqual(v('USED', 'C'), 'Good');
  assert.strictEqual(v('USED', 'D'), 'Satisfactory');
  assert.strictEqual(v('USED'), 'Good');
  assert.strictEqual(v('REFURBISHED', 'A'), 'Very good');
  assert.strictEqual(v('PARTS_OR_REPAIR', 'D'), 'Not fully functional');
  assert.strictEqual(v('for parts'), 'Not fully functional');
  assert.strictEqual(v('FOR_PARTS_OR_NOT_WORKING'), 'Not fully functional');
  for (const g of [null, 'A', 'B', 'C', 'D']) {
    for (const c of ['USED', 'REFURBISHED', 'PARTS_OR_REPAIR']) {
      const out = v(c, g);
      assert.ok(cond.VINTED_LABELS.indexOf(out) !== -1, c + '/' + g + ' -> ' + out);
      assert.ok(!/^new/i.test(out), 'used item must never map to a New label: ' + c + '/' + g + ' -> ' + out);
    }
  }
});

test('other marketplaces keep their condition outputs', () => {
  const p = (pl, c, g = null) => cond.platformValue(pl, { conditionRaw: c, conditionGrade: g });
  assert.strictEqual(p('mercari', 'USED', 'A'), 'Like New');
  assert.strictEqual(p('mercari', 'NEW_OTHER'), 'New');
  assert.strictEqual(p('poshmark', 'NEW_OTHER'), 'New With Tags (NWT)');
  assert.strictEqual(p('poshmark', 'REFURBISHED'), 'Like New');
  assert.strictEqual(p('grailed', 'PARTS_OR_REPAIR'), 'Very Worn');
  assert.strictEqual(p('craigslist', 'USED', 'A'), '20');
});

// Extract the strict condition block from fas-vinted.js and run it against stubs.
function loadStrict(stubs) {
  const start = src.indexOf('  const VINTED_CONDITION_LABELS');
  const end = src.indexOf('  function vintedConditionUnmappedWarn');
  assert.ok(start !== -1 && end > start, 'strict condition block present');
  const block = src.slice(start, end);
  const fn = new Function('window', 'norm', 'fieldByLabel', 'pickFromPanel', 'Event',
    block + '\nreturn { VINTED_CONDITION_LABELS, vintedConditionLabel, mapVintedCondition, vintedStrictConditionChooser, fillVintedCondition };');
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return fn({ __FAS_COND__: cond }, norm, stubs.fieldByLabel || (() => null), stubs.pickFromPanel || (async () => false), function E(t) { this.type = t; });
}

test('mapVintedCondition is an exact map, never fuzzy, and returns null when nothing matches', () => {
  const m = loadStrict({});
  assert.strictEqual(m.mapVintedCondition('New'), 'New with tags');
  assert.strictEqual(m.mapVintedCondition('Used - Like New'), 'Very good');
  assert.strictEqual(m.mapVintedCondition('Used - Good'), 'Good');
  assert.strictEqual(m.mapVintedCondition('Used - Fair'), 'Satisfactory');
  assert.strictEqual(m.mapVintedCondition('Not fully functional'), 'Not fully functional');
  for (const junk of ['', null, undefined, 'Like new', 'brand new', 'new, never used', 'excellent', 'broken', 'Needs repair (electronics only)']) {
    assert.strictEqual(m.mapVintedCondition(junk), null, String(junk));
  }
  assert.strictEqual(m.vintedConditionLabel('like new'), null);
  assert.strictEqual(m.vintedConditionLabel('very GOOD'), 'Very good');
});

test('the chooser only accepts a whole-text match, so "Very good" can never land on "Good" or a New label', () => {
  const m = loadStrict({});
  const leaves = ['New with tags', 'New without tags', 'Very good', 'Good', 'Satisfactory', 'Not fully functional'].map((t) => ({ textContent: t }));
  assert.strictEqual(m.vintedStrictConditionChooser(leaves, 'Very good').textContent, 'Very good');
  assert.strictEqual(m.vintedStrictConditionChooser(leaves, 'Good').textContent, 'Good');
  assert.strictEqual(m.vintedStrictConditionChooser(leaves, 'Like new'), null);
  assert.strictEqual(m.vintedStrictConditionChooser(leaves, 'New'), null);
  assert.strictEqual(m.vintedStrictConditionChooser([{ textContent: 'Good' }], 'Very good'), null);
});

test('fillVintedCondition passes the exact label and the strict chooser to pickFromPanel, and refuses unknown labels', async () => {
  const calls = [];
  const m = loadStrict({ pickFromPanel: async (...a) => { calls.push(a); return true; } });
  assert.strictEqual(await m.fillVintedCondition('Like new'), false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(await m.fillVintedCondition('Very good'), true);
  assert.deepStrictEqual(calls[0].slice(0, 3), ['condition', 'Condition', 'Very good']);
  assert.strictEqual(calls[0][3], m.vintedStrictConditionChooser);
});

test('fillVintedCondition on a native select matches exact option text only', async () => {
  const sel = { tagName: 'SELECT', value: '', options: [{ textContent: 'New with tags', value: '1' }, { textContent: 'Good', value: '4' }], dispatchEvent() {} };
  const m = loadStrict({ fieldByLabel: () => sel });
  assert.strictEqual(await m.fillVintedCondition('Very good'), false);
  assert.strictEqual(sel.value, '');
  assert.strictEqual(await m.fillVintedCondition('Good'), true);
  assert.strictEqual(sel.value, '4');
});

test('the fill flow uses the strict path and warns instead of guessing when unmapped', () => {
  assert.ok(!/fillSelectLike\('Condition'/.test(src));
  assert.ok(/if \(conditionLabel\) await tryFill\('Condition', conditionLabel, fillVintedCondition, warnings\);\s*else vintedConditionUnmappedWarn\(item, warnings\);/.test(src));
  assert.ok(src.indexOf("'Like new'") === -1 || /no such option/.test(src));
  assert.ok(!/Needs repair \(electronics only\)'/.test(src));
});

test('manifest is 1.0.83 and loads fas-condition.js before fas-vinted.js', () => {
  const man = JSON.parse(rd('manifest.json'));
  assert.strictEqual(man.version, '1.0.83');
  const vs = man.content_scripts.find((c) => c.js.indexOf('fas-vinted.js') !== -1).js;
  assert.ok(vs.indexOf('fas-condition.js') !== -1 && vs.indexOf('fas-condition.js') < vs.indexOf('fas-vinted.js'));
});
