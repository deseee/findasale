/**
 * saleRedate: next-weekend suggestion for a sale whose dates have passed (2026-10-23).
 * Run: npm test   (node:test through tsx). Local-time based, so dates are built with the local Date constructor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextWeekendDates, saleDatesHavePassed, formatSaleRange } from '../saleRedate';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test('a Sat-Sun sale moves to the next Saturday, same hours and length', () => {
  // AB&T: Sat Jul 4 to Sun Jul 5. "Now" is Friday Oct 23 2026.
  const now = local(2026, 10, 23, 13, 0);
  const { start, end } = suggestNextWeekendDates(local(2026, 7, 4, 9, 0), local(2026, 7, 5, 15, 0), now);
  assert.equal(start.getDay(), 6);
  assert.deepEqual([start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()], [10, 24, 9, 0]);
  assert.deepEqual([end.getMonth() + 1, end.getDate(), end.getHours()], [10, 25, 15]);
});

test('a Friday start stays on Friday and never lands today', () => {
  const now = local(2026, 10, 23, 8, 0); // a Friday
  const { start } = suggestNextWeekendDates(local(2026, 10, 9, 8, 0), local(2026, 10, 11, 14, 0), now);
  assert.equal(start.getDay(), 5);
  assert.deepEqual([start.getMonth() + 1, start.getDate()], [10, 30]);
});

test('a weekday sale moves to the next Saturday and keeps its 8-day length', () => {
  const now = local(2026, 10, 21, 12, 0); // Wednesday
  const { start, end } = suggestNextWeekendDates(local(2026, 9, 9, 10, 0), local(2026, 9, 17, 16, 0), now);
  assert.equal(start.getDay(), 6);
  assert.deepEqual([start.getMonth() + 1, start.getDate()], [10, 24]);
  assert.deepEqual([end.getMonth() + 1, end.getDate(), end.getHours()], [11, 1, 16]);
});

test('the suggestion is always in the future and end is after start', () => {
  for (let d = 0; d < 14; d++) {
    const now = local(2026, 11, 1 + d, 23, 30);
    const { start, end } = suggestNextWeekendDates(local(2026, 1, 3, 9, 0), local(2026, 1, 3, 9, 0), now);
    assert.ok(start.getTime() > now.getTime());
    assert.ok(end.getTime() > start.getTime());
  }
});

test('saleDatesHavePassed', () => {
  const now = local(2026, 10, 23, 12);
  assert.equal(saleDatesHavePassed(local(2026, 10, 11), now), true);
  assert.equal(saleDatesHavePassed(local(2026, 10, 30), now), false);
  assert.equal(saleDatesHavePassed(null, now), false);
  assert.equal(saleDatesHavePassed('not a date', now), false);
});

test('formatSaleRange has no em dash', () => {
  const text = formatSaleRange(local(2026, 10, 24, 9), local(2026, 10, 25, 15));
  assert.ok(!text.includes(String.fromCharCode(0x2014)));
  assert.ok(text.includes(' to '));
});
