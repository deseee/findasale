// 1.0.69 (2026-10-27, live-verified in Patrick's Chrome on poshmark.com/create-listing): unknown brands ("Mugig",
// "D'Addario") show no suggestions and Poshmark has no "add custom brand" control; the typed text stays after blur and
// Poshmark publishes it as a custom brand. fillAutocomplete must count that as set, click only an EXACT suggestion
// (never "Dunlop" for "Jim Dunlop"), and report not-set only when the typed value did not stick.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const posh = fs.readFileSync(path.join(__dirname, '..', 'fas-poshmark.js'), 'utf8');

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
const pure = extract(posh, 'poshBrandNorm') + '\n' + extract(posh, 'poshBrandExactIndex') + '\n' + extract(posh, 'poshBrandValueStuck') + '\n';
const exactIndex = new Function(pure + 'return poshBrandExactIndex;')();
const stuck = new Function(pure + 'return poshBrandValueStuck;')();

// fillAutocomplete with its DOM collaborators injected.
function makeFill(env) {
  const f = new Function('waitForBrandInput', 'setNativeValue', 'waitForBrandSuggestion', 'realClick', 'sleep', 'blurBrandInput', 'tOk', 'tWarn', 'console',
    pure + 'async ' + extract(posh, 'fillAutocomplete') + '\nreturn fillAutocomplete;');
  return f(env.waitForBrandInput, env.setNativeValue, env.waitForBrandSuggestion, env.realClick, async () => {}, env.blurBrandInput, env.tOk, env.tWarn, { warn() {} });
}
function harness({ suggestions, keepsValue, noInput }) {
  const log = { clicked: null, ok: [], warn: [], blurred: 0 };
  const input = { value: '', focus() {} };
  const env = {
    waitForBrandInput: async () => (noInput ? null : input),
    setNativeValue: (el, v) => { el.value = v; },
    waitForBrandSuggestion: async (v) => { const i = exactIndex(suggestions.map((s) => s.text), v); return i >= 0 ? suggestions[i] : null; },
    realClick: (el) => { log.clicked = el.text; },
    blurBrandInput: (el) => { log.blurred++; if (!keepsValue) el.value = ''; },
    tOk: (m) => log.ok.push(m),
    tWarn: (c) => log.warn.push(c),
  };
  return { fill: makeFill(env), log, input };
}

test('exact match only: case and spacing ignored, partial suggestions never picked', () => {
  assert.strictEqual(exactIndex(['Dunlop', 'Jim Dunlop'], 'jim  dunlop'), 1);
  assert.strictEqual(exactIndex(['Dunlop'], 'Jim Dunlop'), -1);
  assert.strictEqual(exactIndex(['Jim Dunlop'], 'Dunlop'), -1);
  assert.strictEqual(exactIndex(['NIKE'], 'Nike'), 0);
  assert.strictEqual(exactIndex([], 'Nike'), -1);
  assert.strictEqual(exactIndex(['x'], ''), -1);
});

test('stuck: the typed value survived the blur', () => {
  assert.strictEqual(stuck("D'Addario", "D'Addario"), true);
  assert.strictEqual(stuck(' mugig ', 'Mugig'), true);
  assert.strictEqual(stuck('', 'Mugig'), false);
  assert.strictEqual(stuck('Dunlop', 'Jim Dunlop'), false);
});

test('an unknown brand with no suggestions is kept as a custom brand and counts as set', async () => {
  const h = harness({ suggestions: [], keepsValue: true });
  assert.strictEqual(await h.fill('Brand', 'Mugig'), true);
  assert.strictEqual(h.log.blurred, 1);
  assert.strictEqual(h.log.clicked, null);
  assert.ok(h.log.ok.some((m) => /custom brand/.test(m)));
  assert.deepStrictEqual(h.log.warn, []);
});

test('only a partial suggestion ("Dunlop" for "Jim Dunlop"): nothing is clicked, the typed text stays as custom', async () => {
  const h = harness({ suggestions: [{ text: 'Dunlop' }], keepsValue: true });
  assert.strictEqual(await h.fill('Brand', 'Jim Dunlop'), true);
  assert.strictEqual(h.log.clicked, null);
  assert.strictEqual(h.input.value, 'Jim Dunlop');
});

test('an exact suggestion is clicked', async () => {
  const h = harness({ suggestions: [{ text: 'Dunlop' }, { text: 'Jim Dunlop' }], keepsValue: true });
  assert.strictEqual(await h.fill('Brand', 'jim dunlop'), true);
  assert.strictEqual(h.log.clicked, 'Jim Dunlop');
  assert.strictEqual(h.log.blurred, 0);
});

test('a value that did not stick returns false with a warning', async () => {
  const h = harness({ suggestions: [], keepsValue: false });
  assert.strictEqual(await h.fill('Brand', "D'Addario"), false);
  assert.deepStrictEqual(h.log.warn, ['brand_not_kept']);
  assert.deepStrictEqual(h.log.ok, []);
});

test('no Brand input found returns false', async () => {
  const h = harness({ suggestions: [], keepsValue: true, noInput: true });
  assert.strictEqual(await h.fill('Brand', 'Mugig'), false);
});

test('the live Brand input and suggestion selectors are used, with fieldByLabel as the fallback', () => {
  assert.ok(posh.includes(`'[data-et-name="listingEditorBrandSection"] input[placeholder="Enter the Brand/Designer"]'`));
  assert.ok(posh.includes(`'ul[data-test="dropdown_menu_list"] li.dropdown__menu__item a.dropdown__link'`));
  const w = extract(posh, 'waitForBrandInput');
  assert.ok(/POSH_BRAND_INPUT_SEL/.test(w) && /fieldByLabel\(labelText\)/.test(w));
  assert.ok(!/add\\s\+\.\*brand/.test(extract(posh, 'fillAutocomplete')), 'no guessed "add custom brand" click');
});
