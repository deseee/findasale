// 1.0.71 (2026-10-27, Patrick): the extension explains Poshmark's label cost. Up to 5 lb included; 5-10 lb $5; 10-15 lb
// $10; 15-25 lb $15; over 25 lb the full shipping cost, deducted from earnings. The server's item.poshmarkLabel is the
// source of truth; poshLabelSurchargeUsd mirrors packages/backend/src/services/poshmarkLabelSurcharge.ts for an older
// server. KEEP IN SYNC with packages/backend/src/__tests__/poshmarkLabelSurcharge.test.ts (same edges).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const posh = rd('fas-poshmark.js');
const popup = rd('popup.js');

function extract(src, name) {
  let i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let depth = 0;
  const j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}
const costsLine = posh.match(/const POSH_LABEL_COSTS_TEXT = [^\n]*\n/)[0];
const L = new Function(costsLine + ['poshLabelSurchargeUsd', 'poshLabelInfoFor', 'poshLabelHasDeduction', 'poshLabelDeductionSentence', 'poshLabelHeadsUpText', 'poshLabelRunNote'].map((n) => extract(posh, n)).join('\n') +
  '\nreturn { poshLabelSurchargeUsd, poshLabelInfoFor, poshLabelHasDeduction, poshLabelHeadsUpText, poshLabelRunNote, POSH_LABEL_COSTS_TEXT };')();

test('tier edges mirror the server: 80, 80.01, 160, 160.01, 240, 240.01, 400, 400.01 oz', () => {
  const want = [[80, 0, false], [80.01, 5, false], [160, 5, false], [160.01, 10, false], [240, 10, false], [240.01, 15, false], [400, 15, false], [400.01, null, true]];
  for (const [oz, usd, full] of want) assert.deepStrictEqual(L.poshLabelSurchargeUsd(oz), { surchargeUsd: usd, fullLabelCost: full }, String(oz));
  for (const bad of [null, undefined, 0, -1, 'x']) assert.deepStrictEqual(L.poshLabelSurchargeUsd(bad), { surchargeUsd: null, fullLabelCost: false });
});

test('the backend tiers in poshmarkLabelSurcharge.ts match this copy', () => {
  const be = fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'backend', 'src', 'services', 'poshmarkLabelSurcharge.ts'), 'utf8');
  assert.ok(/POSHMARK_LABEL_INCLUDED_OZ = 80;/.test(be));
  assert.ok(/\{ upToOz: 160, usd: 5 \}/.test(be) && /\{ upToOz: 240, usd: 10 \}/.test(be) && /\{ upToOz: 400, usd: 15 \}/.test(be));
  assert.ok(/POSHMARK_FULL_COST_OVER_OZ = 400;/.test(be));
});

test('the server payload wins; the local copy is only a fallback (organizer weight first, then the estimate)', () => {
  assert.deepStrictEqual(L.poshLabelInfoFor({ poshmarkLabel: { surchargeUsd: 10, fullLabelCost: false, weightLb: 11.1, source: 'estimate' }, packageWeightOz: 10 }), { surchargeUsd: 10, fullLabelCost: false, weightLb: 11.1, source: 'estimate' });
  assert.deepStrictEqual(L.poshLabelInfoFor({ packageWeightOz: 178, aiPackageWeightOz: 10 }), { surchargeUsd: 10, fullLabelCost: false, weightLb: 11.1, source: 'organizer' });
  assert.deepStrictEqual(L.poshLabelInfoFor({ aiPackageWeightOz: 96 }), { surchargeUsd: 5, fullLabelCost: false, weightLb: 6, source: 'estimate' });
  assert.deepStrictEqual(L.poshLabelInfoFor({}), { surchargeUsd: null, fullLabelCost: false, weightLb: null, source: 'none' });
});

const info = (usd, lb, source, full) => ({ surchargeUsd: usd, weightLb: lb, source: source || 'organizer', fullLabelCost: !!full });

test('heads-up text at the tier edges', () => {
  assert.strictEqual(L.poshLabelHeadsUpText(info(0, 5.0)), '');
  assert.strictEqual(L.poshLabelHeadsUpText(info(null, null)), '');
  assert.strictEqual(L.poshLabelHeadsUpText(info(5, 5.0, 'estimate')),
    'Heads up: this item ships at 5.0 lb (estimated). ' + L.POSH_LABEL_COSTS_TEXT + ' Poshmark will deduct $5.00 from your earnings when this sells.');
  assert.strictEqual(L.poshLabelHeadsUpText(info(10, 11.1)),
    "Heads up: this item ships at 11.1 lb (from your saved package weight). Poshmark's prepaid label covers up to 5 lb; heavier labels cost $5 (5-10 lb), $10 (10-15 lb) or $15 (15-25 lb), and over 25 lb Poshmark deducts the full shipping cost. Poshmark will deduct $10.00 from your earnings when this sells.");
  assert.strictEqual(L.poshLabelHeadsUpText(info(15, 15.0)),
    'Heads up: this item ships at 15.0 lb (from your saved package weight). ' + L.POSH_LABEL_COSTS_TEXT + ' Poshmark will deduct $15.00 from your earnings when this sells. Over 15 lb, ship it in more than one box if you can.');
  assert.strictEqual(L.poshLabelHeadsUpText(info(43.1, 25.0, 'organizer', true)),
    'Heads up: this item ships at 25.0 lb (from your saved package weight). ' + L.POSH_LABEL_COSTS_TEXT + ' Poshmark will deduct the full shipping cost from your earnings when this sells, about $43.10 (USPS estimate). Over 15 lb, ship it in more than one box if you can.');
  assert.strictEqual(L.poshLabelHeadsUpText(info(null, 30.0, 'estimate', true)),
    'Heads up: this item ships at 30.0 lb (estimated). ' + L.POSH_LABEL_COSTS_TEXT + ' Poshmark will deduct the full USPS shipping cost from your earnings when this sells. Over 15 lb, ship it in more than one box if you can.');
});

test('run summary line lists the deduction and amount', () => {
  assert.strictEqual(L.poshLabelRunNote(info(0, 4)), '');
  assert.strictEqual(L.poshLabelRunNote(info(10, 11.1)), 'Poshmark will deduct $10.00 from your earnings for the heavier label (11.1 lb).');
  assert.strictEqual(L.poshLabelRunNote(info(43.1, 30, 'organizer', true)), 'Poshmark will deduct the full shipping cost, about $43.10 (USPS estimate) from your earnings for the heavier label (30.0 lb).');
});

test('plain English: no em dashes, never "AI"', () => {
  for (const t of [L.POSH_LABEL_COSTS_TEXT, L.poshLabelHeadsUpText(info(15, 18.8)), L.poshLabelHeadsUpText(info(null, 30, 'estimate', true)), L.poshLabelRunNote(info(5, 6))]) {
    assert.ok(!/\u2014/.test(t), t);
    assert.ok(!/\bAI\b/.test(t), t);
  }
  const hold = extract(posh, 'holdForPoshmarkFlagDecision');
  assert.ok(!/\u2014/.test(hold) && !/\bAI\b/.test(hold));
});

test('wiring: the heads-up is set at the start of every fill and appended under every overlay message', () => {
  assert.ok(/async function run\(item, index, total, autoPublish\) \{\n    setPoshLabelNote\(item\);/.test(posh));
  assert.ok(/function overlay\(html\) \{ ensureBar\(\)\.innerHTML = html \+ poshLabelNoteHtml; \}/.test(posh));
  assert.ok(/const labelNote = poshLabelRunNote\(poshLabelInfoFor\(item\)\);\n    if \(labelNote\) runNotes\.push\(labelNote\);/.test(posh));
});

test('popup: Poshmark items with a deduction are listed with their amounts, and the row badge shows the amount', () => {
  const fn = new Function(extract(popup, 'poshLabelAmountText') + '\nreturn poshLabelAmountText;')();
  assert.strictEqual(fn({ poshmarkLabel: { surchargeUsd: 10, fullLabelCost: false, weightLb: 11.1 } }), '$10.00');
  assert.strictEqual(fn({ poshmarkLabel: { surchargeUsd: 43.1, fullLabelCost: true, weightLb: 30 } }), 'about $43.10');
  assert.strictEqual(fn({ poshmarkLabel: { surchargeUsd: null, fullLabelCost: true, weightLb: 30 } }), 'full shipping cost');
  assert.strictEqual(fn({ poshmarkLabel: { surchargeUsd: 0, fullLabelCost: false, weightLb: 3 } }), '');
  assert.strictEqual(fn({}), '');
  assert.ok(/id="poshLabelNote"/.test(rd('popup.html')));
  assert.ok(/Poshmark will deduct a heavier-label cost from your earnings when these sell: /.test(popup));
});

test('the label payload reaches the Poshmark tab: popup queue map and the fill-time refresh carry poshmarkLabel', () => {
  assert.ok(/poshmarkLabel: it\.poshmarkLabel, \/\/ 1\.0\.71/.test(popup));
  const bg = rd('background.js');
  const i = bg.indexOf('const FAS_FRESHEN_FIELDS = [');
  assert.ok(i > 0 && bg.slice(i, bg.indexOf('];', i)).includes("'poshmarkLabel'"));
});
