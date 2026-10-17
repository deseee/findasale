// Node tests for extension 1.0.20: Mercari shoebox question in the weight dialog. DOM is STUBBED (real Mercari screens after Next were NOT driven).
const test = require('node:test');
const assert = require('node:assert');
const W = require('../fas-mercari-weight.js');

// Minimal stub of the live dialog: pounds + ounces inputs, hidden yes/no radios with labels, a Next button disabled until a radio is checked.
function makeDialog(opts) {
  opts = opts || {};
  const radios = {};
  const labels = {};
  const mk = (ans) => {
    const r = { type: 'radio', id: ans, value: ans, checked: false, parentElement: null, closest: () => null };
    const l = { textContent: ans === 'yes' ? 'Yes' : 'No', _for: ans, closest: () => null };
    radios[ans] = r; labels[ans] = l;
  };
  mk('yes'); mk('no');
  const wrap = { textContent: 'Will your item fit in a shoebox? A standard shoebox measures 14" x 10" x 5".', querySelectorAll: (s) => (s === 'label' ? [labels.yes, labels.no] : []), parentElement: null };
  radios.yes.parentElement = wrap; radios.no.parentElement = wrap;
  const next = { disabled: true };
  const doc = {
    querySelector(sel) {
      if (opts.testids && sel === 'input[data-testid="FitsInShoeboxYes"]') return radios.yes;
      if (opts.testids && sel === 'input[data-testid="FitsInShoeboxNo"]') return radios.no;
      const m = sel.match(/^label\[for="(\w+)"\]$/);
      if (m) return labels[m[1]] || null;
      return null;
    },
    querySelectorAll(sel) { return sel === 'input[type="radio"]' ? [radios.yes, radios.no] : []; },
  };
  const clicks = [];
  const click = async (el) => {
    clicks.push(el === labels.yes ? 'label:yes' : el === labels.no ? 'label:no' : el === radios.yes ? 'input:yes' : el === radios.no ? 'input:no' : 'other');
    if (el === labels.yes && !opts.labelDead) { radios.yes.checked = true; radios.no.checked = false; }
    if (el === labels.no && !opts.labelDead) { radios.no.checked = true; radios.yes.checked = false; }
    if (el === radios.yes) { radios.yes.checked = true; radios.no.checked = false; }
    if (el === radios.no) { radios.no.checked = true; radios.yes.checked = false; }
    next.disabled = !(radios.yes.checked || radios.no.checked);
  };
  return { doc, radios, labels, next, click, clicks, deps: { click, sleep: async () => {} } };
}

const box = (l, w, h) => ({ packageLengthIn: l, packageWidthIn: w, packageHeightIn: h });

test('shoebox yes: dimensions that fit 14x10x5 in any orientation answer Yes', () => {
  assert.strictEqual(W.shoeboxDecision(box(5, 14, 10), 40).fits, true);
  assert.strictEqual(W.shoeboxDecision(box(9, 6, 2), 5).basis, 'dimensions-strict');
});
test('shoebox no: a package over 14x10x5 answers No and keeps the dims for the Length/Width/Height boxes', () => {
  const d = W.shoeboxDecision(box(20, 12, 8), 30);
  assert.strictEqual(d.fits, false);
  assert.deepStrictEqual(d.dims, { l: 20, w: 12, h: 8 });
  assert.strictEqual(W.shoeboxDecision(box(15, 4, 4), 30).fits, false);
});
test('legacy volume tolerance still turns a thin, slightly-long item into Yes', () => {
  assert.strictEqual(W.shoeboxDecision(box(16, 10, 3), 20, true).fits, true);
});
test('missing dims: Yes only under 1 lb, otherwise No, and the guess basis is recorded', () => {
  const light = W.shoeboxDecision({}, 5);
  assert.deepStrictEqual([light.fits, light.basis, light.unknownDims], [true, 'guess-no-dims-under-1lb', true]);
  const heavy = W.shoeboxDecision({ packageLengthIn: 4 }, 16);
  assert.deepStrictEqual([heavy.fits, heavy.basis], [false, 'guess-no-dims-1lb-or-more']);
  assert.strictEqual(W.shoeboxDecision(box(0, 0, 0), 5).unknownDims, true);
});

test('answerShoebox clicks the LABEL, Next is disabled before and enabled after', async () => {
  const d = makeDialog();
  assert.strictEqual(d.next.disabled, true);
  assert.deepStrictEqual(W.shoeboxRadioState(d.doc), { present: true, yesChecked: false, noChecked: false, selected: null });
  const r = await W.answerShoebox(d.doc, true, d.deps);
  assert.deepStrictEqual([r.ok, r.via, r.answer], [true, 'label', 'yes']);
  assert.deepStrictEqual(d.clicks, ['label:yes']);
  assert.strictEqual(d.next.disabled, false);
  assert.strictEqual(W.shoeboxRadioState(d.doc).selected, 'yes');
});
test('answerShoebox "No" works, and falls back to clicking the input when the label click does not register', async () => {
  const a = makeDialog();
  assert.strictEqual((await W.answerShoebox(a.doc, false, a.deps)).answer, 'no');
  assert.strictEqual(W.shoeboxRadioState(a.doc).selected, 'no');
  const b = makeDialog({ labelDead: true });
  const r = await W.answerShoebox(b.doc, true, b.deps);
  assert.deepStrictEqual([r.ok, r.via], [true, 'label+input']);
  assert.deepStrictEqual(b.clicks, ['label:yes', 'input:yes']);
});
test('radio is found by data-testid too, and reports not found when absent', async () => {
  const d = makeDialog({ testids: true });
  assert.strictEqual(W.findShoeboxRadio(d.doc, 'yes'), d.radios.yes);
  const empty = { querySelector: () => null, querySelectorAll: () => [] };
  assert.strictEqual((await W.answerShoebox(empty, true, { click: async () => {} })).reason, 'radio_not_found');
  assert.strictEqual(W.shoeboxRadioState(empty).present, false);
});

// ---- weight boxes: empty pounds is not a failure ----
const stubBox = (rejectZero) => ({ value: '', _valueTracker: null, focus() {}, select() {} , rejectZero });
const setter = (el, v) => { if (el.rejectZero && String(v) === '0') return; el.value = String(v); };
test('pounds that refuses "0" stays empty and is NOT a failure when ounces is set (sub-pound package)', () => {
  const lb = stubBox(true), oz = stubBox(false);
  const r = W.fillWeightBoxes(lb, oz, 5, setter, null);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.poundsEmptyOk, true);
  assert.deepStrictEqual([lb.value, oz.value, r.failed], ['', '5', []]);
});
test('a rejected ounces box, or a rejected non-zero pounds box, is still a failure', () => {
  const oz = { value: '', rejectZero: false }, bad = (el) => { /* never sticks */ };
  assert.deepStrictEqual(W.fillWeightBoxes(stubBox(false), oz, 5, bad, null).failed, ['pounds', 'ounces']);
  const lb = stubBox(false), oz2 = stubBox(false);
  const r = W.fillWeightBoxes(lb, oz2, 37, (el, v) => { if (el === lb) return; el.value = String(v); }, null);
  assert.deepStrictEqual(r.failed, ['pounds']);
});

test('source pin: the weight dialog answers the shoebox question before it waits for Next', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'fas-mercari.js'), 'utf8');
  const i = src.indexOf('const weighModalField = await waitForSelector');
  assert.ok(i > 0);
  const seg = src.slice(i, i + 700);
  assert.ok(seg.indexOf('answerShoeboxAndAdvance(2500)') !== -1);
  assert.ok(src.indexOf('async function answerShoeboxAndAdvance') < i);
  assert.ok(src.indexOf('shoebox_answer') !== -1 && src.indexOf('shoeboxRadioState') !== -1);
});
