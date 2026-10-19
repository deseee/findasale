// Node tests for extension 1.0.26: Mercari condition radios after Mercari's Sell-form re-skin (2026-10-19).
// New shape: <label data-testid="ConditionGood"><input type="radio" value="3" name="_r_0_"></label>. Old shape: input[name=sellCondition][id=3].
// Run: node --test extension/tests/fas-mercari-condition.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'fas-mercari.js'), 'utf8');
const ID = src.slice(src.indexOf('const MERCARI_CONDITION_RADIO_ID'), src.indexOf('};', src.indexOf('const MERCARI_CONDITION_RADIO_ID')) + 2);
const TID = src.slice(src.indexOf('const MERCARI_CONDITION_TESTID'), src.indexOf('};', src.indexOf('const MERCARI_CONDITION_TESTID')) + 2);
const m = /function mercariConditionTargets\(/.exec(src); assert.ok(m, 'mercariConditionTargets missing');
let depth = 0, end = -1;
for (let j = src.indexOf('{', m.index); j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) { end = j + 1; break; } } }
const sb = {}; vm.createContext(sb);
vm.runInContext(ID + '\n' + TID + '\n' + src.slice(m.index, end) + '\nthis.find = mercariConditionTargets;', sb);

function fakeRoot(map) { return { querySelector: (sel) => { for (const k of Object.keys(map)) if (sel.split(',').some((p) => p.trim() === k)) return map[k]; return null; } }; }

test('new Mercari shape: finds the testid label and its radio, clicks the label', () => {
  const radio = { checked: false };
  const label = { querySelector: (s) => (s === 'input[type="radio"]' ? radio : null) };
  const t = sb.find(fakeRoot({ '[data-testid="ConditionGood"]': label }), 'Good');
  assert.strictEqual(t.radio, radio); assert.strictEqual(t.clickTarget, label);
});
test('old Mercari shape still works', () => {
  const radio = { checked: false };
  const t = sb.find(fakeRoot({ 'input[name="sellCondition"][id="2"]': radio }), 'Like New');
  assert.strictEqual(t.radio, radio); assert.strictEqual(t.clickTarget, radio);
});
test('nothing on the page returns null; unknown label returns null', () => {
  assert.strictEqual(sb.find(fakeRoot({}), 'Good'), null);
  assert.strictEqual(sb.find(fakeRoot({}), 'Mint'), null);
});
test('all five condition names map to a testid', () => {
  for (const [name, tid] of [['New', 'ConditionNew'], ['Like New', 'ConditionLikeNew'], ['Good', 'ConditionGood'], ['Fair', 'ConditionFair'], ['Poor', 'ConditionPoor']]) {
    const label = { querySelector: () => ({}) };
    const seen = []; const root = { querySelector: (s) => { seen.push(s); return s === '[data-testid="' + tid + '"]' ? label : null; } };
    assert.ok(sb.find(root, name), name); assert.ok(seen.includes('[data-testid="' + tid + '"]'));
  }
});
