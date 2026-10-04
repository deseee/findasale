/**
 * virtualWindow (ADR-134 batch B8): the windowing helper behind the Step B list.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OVERSCAN, VIRTUALIZE_THRESHOLD, computeWindow, offsetOfIndex, shouldVirtualize, withMeasurement } from '../virtualWindow';

const keys = (n: number) => Array.from({ length: n }, (_v, i) => 'r' + i);

test('lists above 200 rows are windowed, 200 and fewer are not', () => {
  assert.equal(VIRTUALIZE_THRESHOLD, 200);
  assert.equal(shouldVirtualize(200), false);
  assert.equal(shouldVirtualize(201), true);
  assert.equal(shouldVirtualize(0), false);
  assert.equal(shouldVirtualize(500), true);
});

test('an empty list has an empty window', () => {
  assert.deepEqual(computeWindow({ keys: [], measured: {}, estimate: 100, scrollTop: 0, viewportHeight: 500 }), { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 });
});

test('at the top only the visible rows plus the overscan below are rendered', () => {
  const w = computeWindow({ keys: keys(500), measured: {}, estimate: 100, scrollTop: 0, viewportHeight: 500, overscan: 2 });
  assert.equal(w.start, 0);
  assert.equal(w.end, 5 + 2);
  assert.equal(w.topPad, 0);
  assert.equal(w.totalHeight, 50000);
  assert.equal(w.bottomPad, 50000 - 7 * 100);
});

test('scrolled into the middle: rows above and below are replaced by spacers that keep the total height', () => {
  const w = computeWindow({ keys: keys(500), measured: {}, estimate: 100, scrollTop: 10000, viewportHeight: 500, overscan: 3 });
  assert.equal(w.start, 100 - 3);
  assert.equal(w.end, 105 + 3);
  assert.equal(w.topPad, 97 * 100);
  assert.equal(w.topPad + (w.end - w.start) * 100 + w.bottomPad, 50000);
  assert.ok(w.end - w.start < 20, 'only a small slice is rendered');
});

test('at the very end the last rows are rendered and the bottom spacer is zero', () => {
  const w = computeWindow({ keys: keys(500), measured: {}, estimate: 100, scrollTop: 50000 - 500, viewportHeight: 500, overscan: 2 });
  assert.equal(w.end, 500);
  assert.equal(w.bottomPad, 0);
  assert.equal(w.topPad + (w.end - w.start) * 100, 50000);
});

test('scrolling past the end (the list got shorter) still shows the last rows', () => {
  const w = computeWindow({ keys: keys(10), measured: {}, estimate: 100, scrollTop: 99999, viewportHeight: 500, overscan: 1 });
  assert.equal(w.end, 10);
  assert.ok(w.start < 10);
});

test('measured heights replace the estimate and move the window', () => {
  const k = keys(300);
  const measured: Record<string, number> = {};
  for (let i = 0; i < 50; i++) measured['r' + i] = 300; // the first 50 rows are tall
  const w = computeWindow({ keys: k, measured, estimate: 100, scrollTop: 300 * 10, viewportHeight: 300, overscan: 0 });
  assert.equal(w.start, 10);
  assert.equal(w.end, 11);
  assert.equal(w.topPad, 3000);
  assert.equal(w.totalHeight, 50 * 300 + 250 * 100);
});

test('a zero or missing measurement falls back to the estimate and an estimate of zero cannot loop forever', () => {
  const w = computeWindow({ keys: keys(5), measured: { r0: 0 }, estimate: 0, scrollTop: 0, viewportHeight: 3, overscan: 0 });
  assert.ok(w.totalHeight === 5);
  assert.ok(w.end >= 1);
});

test('default overscan keeps a few rows on each side so Tab can move to the next row', () => {
  assert.ok(DEFAULT_OVERSCAN >= 2);
  const w = computeWindow({ keys: keys(500), measured: {}, estimate: 100, scrollTop: 10000, viewportHeight: 500 });
  assert.equal(w.start, 100 - DEFAULT_OVERSCAN);
});

test('offsetOfIndex adds the heights above a row', () => {
  assert.equal(offsetOfIndex({ keys: keys(10), measured: { r1: 50 }, estimate: 100 }, 3), 100 + 50 + 100);
  assert.equal(offsetOfIndex({ keys: keys(10), measured: {}, estimate: 100 }, 0), 0);
  assert.equal(offsetOfIndex({ keys: keys(3), measured: {}, estimate: 10 }, 99), 30);
});

test('withMeasurement rounds, ignores junk and returns the same object when nothing changed', () => {
  const a = withMeasurement({}, 'r1', 120.4);
  assert.deepEqual(a, { r1: 120 });
  assert.equal(withMeasurement(a, 'r1', 120.2), a);
  assert.equal(withMeasurement(a, 'r2', 0), a);
  assert.equal(withMeasurement(a, 'r2', NaN), a);
  assert.deepEqual(withMeasurement(a, 'r1', 200), { r1: 200 });
  assert.deepEqual(a, { r1: 120 }, 'the old object is not changed');
});

test('a 500 row list renders a small slice at any scroll position', () => {
  for (const top of [0, 1234, 25000, 49000]) {
    const w = computeWindow({ keys: keys(500), measured: {}, estimate: 100, scrollTop: top, viewportHeight: 600 });
    assert.ok(w.end - w.start <= 6 + 2 * DEFAULT_OVERSCAN + 1, `slice too large at ${top}: ${w.end - w.start}`);
    assert.equal(w.topPad + (w.end - w.start) * 100 + w.bottomPad, 50000);
  }
});
