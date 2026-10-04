/**
 * Review page grade-click suggestion (Wave 3, F3, B3 UI).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGradeEstimateBody,
  parseGradeEstimate,
  gradeDisclosure,
  gradeSuggestionLine,
  formatGradeFactor,
} from '../gradeSuggestion';

const base = {
  itemId: 'it1',
  title: 'Brass lamp',
  category: 'Home',
  grade: 'C',
  photoUrls: ['https://example.com/a.jpg'],
};

test('body sends the real condition, the clicked grade, and persist:false', () => {
  const body = buildGradeEstimateBody({ ...base, condition: 'USED' });
  assert.deepEqual(body, {
    itemId: 'it1',
    title: 'Brass lamp',
    category: 'Home',
    condition: 'USED',
    conditionGrade: 'C',
    photoUrls: ['https://example.com/a.jpg'],
    persist: false,
  });
  assert.strictEqual(body.persist, false);
});

test('body never carries a grade label as the condition', () => {
  for (const grade of ['S', 'A', 'B', 'C', 'D']) {
    const body = buildGradeEstimateBody({ ...base, condition: 'USED', grade });
    assert.equal(body.condition, 'USED');
    assert.equal(body.conditionGrade, grade);
    for (const label of ['like new', 'excellent', 'good', 'fair', 'poor']) {
      assert.notEqual(String(body.condition).toLowerCase(), label);
    }
  }
});

test('condition is normalized through conditionModel (legacy and casing)', () => {
  assert.equal(buildGradeEstimateBody({ ...base, condition: 'used' }).condition, 'USED');
  assert.equal(buildGradeEstimateBody({ ...base, condition: ' Like New ' }).condition, 'USED');
  assert.equal(buildGradeEstimateBody({ ...base, condition: 'GOOD' }).condition, 'USED');
  assert.equal(buildGradeEstimateBody({ ...base, condition: 'parts or repair' }).condition, 'PARTS_OR_REPAIR');
  assert.equal(buildGradeEstimateBody({ ...base, condition: 'NEW' }).condition, 'NEW');
  assert.equal(buildGradeEstimateBody({ ...base, condition: 'Refurbished' }).condition, 'REFURBISHED');
});

test('blank or unrecognized condition is omitted rather than guessed', () => {
  assert.ok(!('condition' in buildGradeEstimateBody({ ...base, condition: '' })));
  assert.ok(!('condition' in buildGradeEstimateBody({ ...base, condition: null })));
  assert.ok(!('condition' in buildGradeEstimateBody({ ...base, condition: undefined })));
  assert.ok(!('condition' in buildGradeEstimateBody({ ...base, condition: 'A' })));
  assert.ok(!('condition' in buildGradeEstimateBody({ ...base, condition: 'excellent photo' })));
});

test('photoUrls is left out when empty or missing', () => {
  assert.ok(!('photoUrls' in buildGradeEstimateBody({ ...base, condition: 'USED', photoUrls: [] })));
  assert.ok(!('photoUrls' in buildGradeEstimateBody({ ...base, condition: 'USED', photoUrls: null })));
  assert.ok(!('photoUrls' in buildGradeEstimateBody({ ...base, condition: 'USED', photoUrls: undefined })));
});

test('gradeDisclosure: exact string for each grade factor', () => {
  assert.equal(
    gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' }),
    'Adjusted for grade C (x0.85).',
  );
  assert.equal(
    gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 1.1, gradeFactorGrade: 'A' }),
    'Adjusted for grade A (x1.1).',
  );
  assert.equal(
    gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.65, gradeFactorGrade: 'D' }),
    'Adjusted for grade D (x0.65).',
  );
  assert.equal(
    gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 1, gradeFactorGrade: 'B' }),
    'Adjusted for grade B (x1).',
  );
});

test('gradeDisclosure: null unless applied is strictly true and the data is usable', () => {
  assert.equal(gradeDisclosure(undefined), null);
  assert.equal(gradeDisclosure(null), null);
  assert.equal(gradeDisclosure({}), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: false, gradeFactor: 1 }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: 'true' as any, gradeFactor: 0.85, gradeFactorGrade: 'C' }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85 }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactorGrade: 'C' }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0, gradeFactorGrade: 'C' }), null);
  assert.equal(gradeDisclosure({ gradeFactorApplied: true, gradeFactor: NaN, gradeFactorGrade: 'C' }), null);
});

test('formatGradeFactor trims trailing zeros and float noise', () => {
  assert.equal(formatGradeFactor(0.85), '0.85');
  assert.equal(formatGradeFactor(1.1), '1.1');
  assert.equal(formatGradeFactor(1), '1');
  assert.equal(formatGradeFactor(0.8500000001), '0.85');
});

test('parseGradeEstimate: cents become dollars with the range and the disclosure', () => {
  const s = parseGradeEstimate({
    estimatedPrice: 3849,
    priceRange: { low: 3000, high: 4500 },
    confidence: 'MEDIUM',
    flags: { gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' },
  });
  assert.deepEqual(s, {
    price: 38.49,
    range: { low: 30, high: 45 },
    disclosure: 'Adjusted for grade C (x0.85).',
  });
});

test('parseGradeEstimate: no disclosure when no grade factor was applied', () => {
  const s = parseGradeEstimate({
    estimatedPrice: 2000,
    priceRange: { low: 1500, high: 2500 },
    confidence: 'HIGH',
    flags: { gradeFactorApplied: false, gradeFactor: 1 },
  });
  assert.equal(s?.disclosure, null);
  const t = parseGradeEstimate({ estimatedPrice: 2000, priceRange: { low: 1500, high: 2500 }, confidence: 'HIGH' });
  assert.equal(t?.disclosure, null);
});

test('parseGradeEstimate: the estimate is always inside its range', () => {
  const below = parseGradeEstimate({ estimatedPrice: 1000, priceRange: { low: 1500, high: 2500 }, confidence: 'LOW' });
  assert.deepEqual(below?.range, { low: 10, high: 25 });
  const above = parseGradeEstimate({ estimatedPrice: 3000, priceRange: { low: 1500, high: 2500 }, confidence: 'LOW' });
  assert.deepEqual(above?.range, { low: 15, high: 30 });
  const reversed = parseGradeEstimate({ estimatedPrice: 2000, priceRange: { low: 2500, high: 1500 }, confidence: 'LOW' });
  assert.deepEqual(reversed?.range, { low: 15, high: 25 });
  for (const s of [below, above, reversed]) {
    assert.ok(s && s.range && s.range.low <= s.price && s.price <= s.range.high);
  }
});

test('parseGradeEstimate: missing or bad range yields no range, not a made-up one', () => {
  assert.equal(parseGradeEstimate({ estimatedPrice: 2000, confidence: 'LOW' })?.range, null);
  assert.equal(parseGradeEstimate({ estimatedPrice: 2000, priceRange: { low: 'x', high: 5 }, confidence: 'LOW' })?.range, null);
  assert.equal(parseGradeEstimate({ estimatedPrice: 2000, priceRange: { low: -5, high: 5 }, confidence: 'LOW' })?.range, null);
});

test('parseGradeEstimate: nothing to offer for FLOOR, empty, zero or junk', () => {
  assert.equal(parseGradeEstimate(null), null);
  assert.equal(parseGradeEstimate(undefined), null);
  assert.equal(parseGradeEstimate('x'), null);
  assert.equal(parseGradeEstimate({ estimatedPrice: 49, confidence: 'FLOOR' }), null);
  assert.equal(parseGradeEstimate({ estimatedPrice: 0, confidence: 'LOW' }), null);
  assert.equal(parseGradeEstimate({ estimatedPrice: -300, confidence: 'LOW' }), null);
  assert.equal(parseGradeEstimate({ estimatedPrice: 'abc', confidence: 'LOW' }), null);
  assert.equal(parseGradeEstimate({ confidence: 'LOW' }), null);
});

test('parseGradeEstimate: rounds cents like the old code (Math.round(cents) / 100)', () => {
  assert.equal(parseGradeEstimate({ estimatedPrice: 3849.4, confidence: 'LOW' })?.price, 38.49);
  assert.equal(parseGradeEstimate({ estimatedPrice: 3849.6, confidence: 'LOW' })?.price, 38.5);
});

test('gradeSuggestionLine: with and without a range', () => {
  assert.equal(
    gradeSuggestionLine({ price: 38.49, range: { low: 30, high: 45 }, disclosure: null }),
    'New suggested price $38.49 (range $30.00 to $45.00). Use it?',
  );
  assert.equal(
    gradeSuggestionLine({ price: 38.49, range: null, disclosure: null }),
    'New suggested price $38.49. Use it?',
  );
  assert.equal(
    gradeSuggestionLine({ price: 38.49, range: { low: 38.49, high: 38.49 }, disclosure: null }),
    'New suggested price $38.49. Use it?',
  );
});

test('user-facing strings have no em dash, no "AI", no banned phrases', () => {
  const strings = [
    gradeDisclosure({ gradeFactorApplied: true, gradeFactor: 0.85, gradeFactorGrade: 'C' }) as string,
    gradeSuggestionLine({ price: 10, range: { low: 8, high: 12 }, disclosure: null }),
    gradeSuggestionLine({ price: 10, range: null, disclosure: null }),
  ];
  for (const s of strings) {
    assert.ok(!/[—–]/.test(s), s);
    assert.ok(!/\bAI\b/.test(s), s);
    assert.ok(!/garage sale|estate sale/i.test(s), s);
  }
});
