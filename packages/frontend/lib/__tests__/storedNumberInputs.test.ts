/**
 * Stored-value-safe number input constraints (bug 2026-10-28: a stored 0% eBay auto-accept
 * threshold blocked every save of the item through the browser's native min="1" check).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bestOfferPctInputBounds,
  bestOfferPctRangeNote,
  isBestOfferPctOutOfRange,
  moneyInputStep,
} from '../storedNumberInputs';

test('bestOfferPctInputBounds: no native min/max until the organizer edits the field', () => {
  assert.deepEqual(bestOfferPctInputBounds(false), {});
  assert.deepEqual(bestOfferPctInputBounds(true), { min: 1, max: 99 });
});

test('isBestOfferPctOutOfRange: empty and 1..99 are fine, 0 / negative / 100 are flagged', () => {
  assert.equal(isBestOfferPctOutOfRange(''), false);
  assert.equal(isBestOfferPctOutOfRange(1), false);
  assert.equal(isBestOfferPctOutOfRange(99), false);
  assert.equal(isBestOfferPctOutOfRange(0), true);
  assert.equal(isBestOfferPctOutOfRange(-12), true);
  assert.equal(isBestOfferPctOutOfRange(100), true);
});

test('bestOfferPctRangeNote: explains a stored threshold at or above price without blocking', () => {
  assert.equal(bestOfferPctRangeNote('', ''), null);
  assert.equal(bestOfferPctRangeNote(10, 25), null);
  // Live item cmo3etpx2005hjqsuvzlkt8qz: price 202.49, auto-accept 202.49 -> 0%, decline 168.07 -> 17%.
  assert.match(bestOfferPctRangeNote(0, 17) || '', /at or above the current price/);
  assert.match(bestOfferPctRangeNote(10, -4) || '', /at or above the current price/);
  assert.match(bestOfferPctRangeNote(100, 25) || '', /outside 1 to 99%/);
  assert.doesNotMatch(bestOfferPctRangeNote(0, 17) || '', /\u2014/);
});

test('moneyInputStep: cents normally, "any" for a stored value with more than 2 decimals', () => {
  assert.equal(moneyInputStep(''), '0.01');
  assert.equal(moneyInputStep(null), '0.01');
  assert.equal(moneyInputStep('202.49'), '0.01');
  assert.equal(moneyInputStep(19.99), '0.01');
  assert.equal(moneyInputStep('10'), '0.01');
  assert.equal(moneyInputStep('13.192'), 'any');
  assert.equal(moneyInputStep('abc'), '0.01');
});

test('ItemFormBody: best-offer inputs carry no hard-coded min="1"/max="99" and price step is value-aware', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'components', 'itemForm', 'ItemFormBody.tsx'), 'utf8');
  const start = src.indexOf('Auto-accept offers above:');
  const end = src.indexOf('{rangeNote && (');
  assert.ok(start > 0 && end > start, 'best-offer block found');
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /min="1"/);
  assert.doesNotMatch(block, /max="99"/);
  assert.match(block, /bestOfferPctInputBounds\(bestOfferAcceptEdited\)/);
  assert.match(block, /bestOfferPctInputBounds\(bestOfferDeclineEdited\)/);
  assert.match(src, /step=\{moneyInputStep\(formData\.price\)\}/);
});
