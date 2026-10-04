/**
 * pricingCompFormat: what-if estimate body, response parsing and grade disclosure for PricingCompSummary (Wave 3).
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMP_COPY,
  buildEstimateBody,
  canRunEstimate,
  estimateErrorMessage,
  formatRangeText,
  gradeDisclosure,
  parseEstimateResponse,
} from '../pricingCompFormat';

test('estimate body always carries persist:false and the item id', () => {
  const b = buildEstimateBody({ itemId: 'i1', title: 'Vase' });
  assert.equal(b.persist, false);
  assert.equal(b.itemId, 'i1');
  assert.equal(b.title, 'Vase');
});

test('estimate body passes real condition and grade through, trimmed', () => {
  const b = buildEstimateBody({ itemId: 'i1', title: ' Vase ', condition: 'USED', conditionGrade: ' C ', category: 'Home', brand: 'Acme' });
  assert.deepEqual(b, { itemId: 'i1', persist: false, title: 'Vase', category: 'Home', brand: 'Acme', condition: 'USED', conditionGrade: 'C' });
});

test('estimate body never guesses: missing or blank fields are omitted', () => {
  const b = buildEstimateBody({ itemId: 'i1', title: 'Vase', condition: '  ', conditionGrade: undefined, category: '' });
  assert.deepEqual(Object.keys(b).sort(), ['itemId', 'persist', 'title']);
});

test('canRunEstimate needs a title or a category', () => {
  assert.equal(canRunEstimate({}), false);
  assert.equal(canRunEstimate({ title: '  ' }), false);
  assert.equal(canRunEstimate({ title: 'Vase' }), true);
  assert.equal(canRunEstimate({ category: 'Home' }), true);
});

test('gradeDisclosure words the applied factor', () => {
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' }), 'Adjusted for grade C (x0.85).');
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 1.1, gradeFactorGrade: 'A' }), 'Adjusted for grade A (x1.10).');
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.65, gradeFactorGrade: 'D' }), 'Adjusted for grade D (x0.65).');
});

test('gradeDisclosure is null unless applied with a valid grade and factor', () => {
  assert.equal(gradeDisclosure({ gradeFactorApplied: false, gradeFactor: 1 }), null);
  assert.equal(gradeDisclosure({ gradeFactor: 0.85, gradeFactorGrade: 'C' }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85 }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactorGrade: 'S', gradeFactor: 1.1 }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactorGrade: 'C', gradeFactor: 'x' }), null);
  assert.equal(gradeDisclosure(undefined), null);
  assert.equal(gradeDisclosure(null), null);
  assert.equal(gradeDisclosure('flags'), null);
});

test('parseEstimateResponse converts cents to dollars and includes the grade line', () => {
  const r = parseEstimateResponse({
    estimatedPrice: 2049,
    priceRange: { low: 1200, high: 3000 },
    confidence: 'MEDIUM',
    compsFound: 5,
    flags: { gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' },
  });
  assert.deepEqual(r, { kind: 'ok', low: 12, high: 30, estimate: 20.49, compsFound: 5, gradeLine: 'Adjusted for grade C (x0.85).' });
});

test('parseEstimateResponse has no grade line when flags carry none', () => {
  const r = parseEstimateResponse({ estimatedPrice: 1000, priceRange: { low: 800, high: 1200 }, confidence: 'HIGH', compsFound: 1, flags: {} });
  assert.equal(r.kind, 'ok');
  assert.equal((r as any).gradeLine, null);
});

test('FLOOR confidence and malformed bodies are none, never a bare floor price', () => {
  assert.deepEqual(parseEstimateResponse({ estimatedPrice: 49, priceRange: { low: 49, high: 50 }, confidence: 'FLOOR' }), { kind: 'none' });
  for (const bad of [null, undefined, 3, {}, { estimatedPrice: 'x', priceRange: { low: 1, high: 2 } }, { estimatedPrice: 1, priceRange: { low: 1 } }]) {
    assert.deepEqual(parseEstimateResponse(bad), { kind: 'none' });
  }
});

test('estimateErrorMessage separates rate limiting from other failures', () => {
  assert.equal(estimateErrorMessage({ response: { status: 429 } }), COMP_COPY.rateLimited);
  assert.equal(estimateErrorMessage({ response: { status: 500 } }), COMP_COPY.error);
  assert.equal(estimateErrorMessage(new Error('Network Error')), COMP_COPY.error);
});

test('formatRangeText uses "to", not a dash', () => {
  assert.equal(formatRangeText(12, 30.5), '$12.00 to $30.50');
});

test('copy has no em dash, en dash or the word AI', () => {
  const all = Object.values(COMP_COPY).join('\n') + formatRangeText(1, 2) + gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' });
  assert.ok(!/[–—]/.test(all));
  assert.ok(!/\bai\b/i.test(all));
});

test('PricingCompSummary sends persist:false through the helper, never fetches comps on mount, and keeps autoRun default false', () => {
  const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');
  const src = fs.readFileSync(path.resolve(HERE, '..', '..', 'components', 'PricingCompSummary.tsx'), 'utf8');
  assert.match(src, /autoRun = false/);
  assert.match(src, /buildEstimateBody\(/);
  assert.ok(!/\/comps`/.test(src), 'the legacy POST /items/:id/comps (writes aiSuggestedPrice) must not be called');
});
