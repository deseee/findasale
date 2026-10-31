// 1.0.84 (owner report 2026-10-29): a Mugig instrument cable (Vinted category 4957 "Instrument cables", posted fine as
// 10585529359) produced a cluttered fill log: "field_empty Size has no value ..." and the same for Material three times
// each, "please set it manually before publishing" review warnings for both, and the Color / Brand fallback notes on
// every redraw. That category has no Size field and Material is "Material (recommended)". These tests pin:
//  - tryFill only raises field_empty + the review warning for a field the live form shows and does not mark optional;
//  - a missing field gets at most one quiet info line, an optional one a single soft info line, no review warning;
//  - each notice and each review_warning line is logged once per item fill across refills / the post-Language sweep;
//  - the Color and Brand fallback wording is unchanged.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = rd('fas-vinted.js');

// ---- a tiny fake DOM ------------------------------------------------------------------------------------------------
function mk(tag, o, kids) {
  const opts = o || {};
  const el = {
    tagName: tag.toUpperCase(), id: opts.id || '', className: opts.cls || '', attrs: Object.assign({}, opts.attrs || {}),
    children: kids || [], parentElement: null, ownText: opts.text || '',
    getAttribute(k) { if (k === 'id') return this.id || null; if (k === 'class') return this.className || null; return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    get textContent() { return [this.ownText].concat(this.children.map((c) => c.textContent)).join(' ').trim(); },
    descendants() { const out = []; this.children.forEach((c) => { out.push(c); out.push(...c.descendants()); }); return out; },
    querySelectorAll(sel) {
      if (sel === 'label, legend, h2, h3, h4, p, span, [class*="label" i], [class*="title" i], [data-testid*="label" i], [data-testid*="title" i]') {
        return this.descendants().filter((d) => ['LABEL', 'LEGEND', 'H2', 'H3', 'H4', 'P', 'SPAN'].indexOf(d.tagName) !== -1 || /label|title/i.test(d.className) || /label|title/i.test(d.attrs['data-testid'] || ''));
      }
      throw new Error('unsupported selector ' + sel);
    },
  };
  el.children.forEach((c) => { c.parentElement = el; });
  return el;
}
function makeDocument(root) {
  const all = () => [root].concat(root.descendants());
  return {
    getElementById: (id) => all().find((e) => e.id === id) || null,
    querySelector: (sel) => {
      let m = /^label\[for="(.+)"\]$/.exec(sel);
      if (m) return all().find((e) => e.tagName === 'LABEL' && e.attrs.for === m[1]) || null;
      m = /^\[data-testid="(.+)"\]$/.exec(sel);
      if (m) return all().find((e) => e.attrs['data-testid'] === m[1]) || null;
      throw new Error('unsupported selector ' + sel);
    },
    querySelectorAll: (sel) => {
      if (sel === 'label') return all().filter((e) => e.tagName === 'LABEL');
      throw new Error('unsupported selector ' + sel);
    },
  };
}
// The new "bloom" trigger: <button aria-haspopup="menu" data-testid="...-input"> inside a field wrapper whose
// label is a sibling element (no for=).
function bloomField(labelText, testid, valueText) {
  const trigger = mk('button', { id: '_r_' + testid.slice(0, 3) + '_', attrs: { 'aria-haspopup': 'menu', 'data-state': 'closed', 'data-testid': testid } },
    [mk('span', { attrs: { 'data-testid': testid + '--value' }, text: valueText || 'Select' })]);
  return mk('div', { cls: 'web_ui__Cell__cell' }, [mk('div', { cls: 'web_ui__Cell__title', text: labelText }), mk('div', {}, [trigger])]);
}
// Instrument cables form: no Size, Material is "(recommended)", shipping has a "Package size" label.
function cableForm() {
  return mk('form', {}, [
    bloomField('Brand', 'brand-select-dropdown-input'),
    bloomField('Condition', 'category-condition-single-list-input'),
    bloomField('Colors', 'color-select-dropdown-input'),
    bloomField('Material (recommended)', 'category-material-multi-list-input'),
    mk('div', {}, [mk('label', { text: 'Package size' }), mk('input', { attrs: { type: 'radio' } })]),
  ]);
}
// Older clothing form: input#size with <label for="size">Size</label>.
function clothingForm() {
  return mk('form', {}, [
    mk('div', {}, [mk('label', { text: 'Size', attrs: { for: 'size' } }), mk('input', { id: 'size' })]),
    bloomField('Material (optional)', 'category-material-multi-list-input'),
  ]);
}

function harness(root, opts) {
  const o = opts || {};
  const trace = [];
  const document = makeDocument(root);
  const env = {
    document,
    T: {
      info: (code, msg, ctx) => trace.push({ lvl: 'info', code, msg, ctx }),
      warn: (code, msg, ctx) => trace.push({ lvl: 'warn', code, msg, ctx }),
      ok: () => {}, step: () => {}, error: (code, msg) => trace.push({ lvl: 'error', code, msg }),
    },
    console: { log: () => {}, warn: () => {} },
    fasMarkStep: () => {},
    VIN_FIELD_NARR: {},
    norm: (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    qa: (sel) => document.querySelectorAll(sel),
  };
  // vintedPickerControl + its testid map are taken verbatim from the shipped file.
  const pickerSrc = src.slice(src.indexOf('  const VINTED_PICKER_INPUT_TESTIDS = {'), src.indexOf('  // The value a control shows:'));
  const start = src.indexOf('  const VINTED_FIELD_PRESENCE_SPEC = {');
  const tf = src.indexOf('  async function tryFill(fieldLabel, value, fillFn, warnings) {');
  const end = src.indexOf('\n  }\n', tf) + 4;
  assert.ok(start > 0 && tf > start && end > tf, 'presence helpers + tryFill not found');
  const reviewLine = src.split('\n').find((l) => l.indexOf("T.warn('review_warning'") !== -1);
  assert.ok(reviewLine, 'review_warning line not found');
  const body = 'let fasCurrentDiagItem = null; let fasVintedFillStartedAt = 1;\n' + pickerSrc + src.slice(start, end) +
    '\nfunction logReview(item, warnings) {\n' + reviewLine + '\n}\n' +
    'return { vintedFieldState, tryFill, fasVintedNoticeOnce, logReview, setItem: (it, startedAt) => { fasCurrentDiagItem = it; if (startedAt) fasVintedFillStartedAt = startedAt; } };';
  const api = new Function(...Object.keys(env), body)(...Object.values(env));
  api.setItem({ id: o.itemId || 'mugig-1' });
  return { api, trace };
}

test('cable form: Size absent, Material optional, Condition / Brand / Colors required, text fields untouched', () => {
  const { api } = harness(cableForm());
  assert.strictEqual(api.vintedFieldState('Size'), 'absent');
  assert.strictEqual(api.vintedFieldState('Material'), 'optional');
  assert.strictEqual(api.vintedFieldState('Condition'), 'required');
  assert.strictEqual(api.vintedFieldState('Brand'), 'required');
  assert.strictEqual(api.vintedFieldState('Color'), 'required');
  assert.strictEqual(api.vintedFieldState('Title'), 'n/a');
  assert.strictEqual(api.vintedFieldState('Price'), 'n/a');
});

test('a "Package size" label never counts as the Size field', () => {
  const { api } = harness(mk('form', {}, [mk('label', { text: 'Package size' }), mk('label', { text: 'Size chart' })]));
  assert.strictEqual(api.vintedFieldState('Size'), 'absent');
});

test('old form: label[for=size] makes Size present and required; "(optional)" Material is optional', () => {
  const { api } = harness(clothingForm());
  assert.strictEqual(api.vintedFieldState('Size'), 'required');
  assert.strictEqual(api.vintedFieldState('Material'), 'optional');
});

test('cable: empty Size / Material over the first pass, the post-Language sweep and a refill give no warning, one info each', async () => {
  const { api, trace } = harness(cableForm());
  const allWarnings = [];
  for (let pass = 0; pass < 3; pass++) {
    const warnings = [];
    assert.strictEqual(await api.tryFill('Size', null, async () => true, warnings), false);
    assert.strictEqual(await api.tryFill('Material', '', async () => true, warnings), false);
    allWarnings.push(...warnings);
  }
  assert.deepStrictEqual(allWarnings, []);
  assert.strictEqual(trace.filter((t) => t.code === 'field_empty').length, 0);
  assert.strictEqual(trace.filter((t) => t.lvl === 'warn').length, 0);
  assert.deepStrictEqual(trace.map((t) => t.code).sort(), ['field_absent', 'field_empty_optional']);
  assert.ok(!trace.some((t) => /set it manually|please set/i.test(t.msg)));
});

test('a required empty field still warns, but field_empty is logged once per item fill', async () => {
  const { api, trace } = harness(clothingForm());
  for (let pass = 0; pass < 3; pass++) {
    const warnings = [];
    await api.tryFill('Size', undefined, async () => true, warnings);
    // the review screen still lists it on every redraw (each pass builds its own warnings array)
    assert.deepStrictEqual(warnings, ['Size has no value set on this item -- please set it manually before publishing.']);
  }
  assert.strictEqual(trace.filter((t) => t.code === 'field_empty').length, 1);
});

test('a new item (or a fresh fill of the same item) logs its notices again', async () => {
  const { api, trace } = harness(clothingForm());
  await api.tryFill('Size', null, async () => true, []);
  await api.tryFill('Size', null, async () => true, []);
  api.setItem({ id: 'other-item' });
  await api.tryFill('Size', null, async () => true, []);
  api.setItem({ id: 'other-item' }, 99);
  await api.tryFill('Size', null, async () => true, []);
  assert.strictEqual(trace.filter((t) => t.code === 'field_empty').length, 3);
});

test('a field with a value is still filled normally', async () => {
  const { api, trace } = harness(cableForm());
  let filled = null;
  const ok = await api.tryFill('Condition', 'New with tags', async (v) => { filled = v; return true; }, []);
  assert.strictEqual(ok, true);
  assert.strictEqual(filled, 'New with tags');
  assert.strictEqual(trace.filter((t) => t.lvl === 'warn').length, 0);
});

test('review_warning lines (incl. the Color / Brand fallback notes) are logged once per item fill across redraws', () => {
  const { api, trace } = harness(cableForm());
  const item = { id: 'mugig-1' };
  const colorMsg = 'Color was not set on this item -- accepted Vinted\'s own suggested color (or inferred one from the title/description if Vinted had no suggestion), please verify it\'s correct.';
  const brandMsg = 'Brand was not set on this item -- selected Vinted\'s own "No brand" option, please verify.';
  for (let i = 0; i < 3; i++) api.logReview(item, [colorMsg, brandMsg]);
  const rw = trace.filter((t) => t.code === 'review_warning');
  assert.strictEqual(rw.length, 2);
  assert.deepStrictEqual(rw.map((t) => t.msg), [colorMsg, brandMsg]);
  api.logReview({ id: 'next-item' }, [colorMsg]);
  assert.strictEqual(trace.filter((t) => t.code === 'review_warning').length, 3);
});

test('Color and Brand fallback wording is unchanged', () => {
  assert.ok(src.includes("'Color was not set on this item -- accepted Vinted\\'s own suggested color (or inferred one from the title/description if Vinted had no suggestion), please verify it\\'s correct.'"));
  assert.ok(src.includes("'Brand was not set on this item -- selected Vinted\\'s own \"No brand\" option, please verify.'"));
});

test('manifest is 1.0.85', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.85');
});
