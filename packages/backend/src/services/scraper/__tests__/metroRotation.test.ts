/**
 * GarageSaleFinder metro rotation (2026-11-01). Before this, every run walked the metro
 * list in the same order and the tail (West Coast, AK, HI) was starved whenever the run
 * ran out of request budget. No network, no DB.
 */

const mockQueryRaw = jest.fn();
jest.mock('../../../lib/prisma', () => ({
  prisma: { $queryRaw: (...a: any[]) => mockQueryRaw(...a) },
}));

import {
  orderMetrosForRotation,
  rotatedMetrosForSource,
  runRotatingMetroLoop,
  utcDayIndex,
  RotatingLoopDeps,
} from '../metroRotation';

const METROS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const NOW = new Date('2026-11-02T06:00:00Z');

describe('orderMetrosForRotation', () => {
  it('puts never-completed metros first, then oldest success first', () => {
    const last = new Map<string, Date>([
      ['a', new Date('2026-11-01T06:01:00Z')],
      ['b', new Date('2026-10-30T06:00:00Z')],
      ['c', new Date('2026-11-01T06:00:00Z')],
      ['e', new Date('2026-10-31T06:00:00Z')],
      ['zzz-not-configured', new Date('2026-01-01T00:00:00Z')],
    ]);
    const order = orderMetrosForRotation(METROS, last, NOW);
    expect(order.slice(0, 3).sort()).toEqual(['d', 'f', 'g']);
    expect(order.slice(3)).toEqual(['b', 'e', 'c', 'a']);
    expect(order).toHaveLength(METROS.length);
    expect(new Set(order).size).toBe(METROS.length);
  });

  it('starts at a different place each day when nothing has completed', () => {
    const day1 = orderMetrosForRotation(METROS, new Map(), NOW);
    const day2 = orderMetrosForRotation(METROS, new Map(), new Date(NOW.getTime() + 86_400_000));
    expect(day1).not.toEqual(day2);
    expect([...day1].sort()).toEqual([...METROS].sort());
    const offset = (utcDayIndex(NOW) * 37) % METROS.length;
    expect(day1[0]).toBe(METROS[offset]);
  });

  it('every metro is first in line within a few days even with a fixed budget', () => {
    // Simulate: each day only 3 metros complete, in rotation order.
    const last = new Map<string, Date>();
    const covered = new Set<string>();
    for (let day = 0; day < 3; day++) {
      const now = new Date(NOW.getTime() + day * 86_400_000);
      const order = orderMetrosForRotation(METROS, last, now);
      for (const m of order.slice(0, 3)) {
        last.set(m, now);
        covered.add(m);
      }
    }
    expect(covered.size).toBe(METROS.length);
  });
});

describe('rotatedMetrosForSource', () => {
  it('uses the DB last-success times', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { metro: 'a', last: new Date('2026-10-01T00:00:00Z') },
      { metro: 'b', last: new Date('2026-09-01T00:00:00Z') },
    ]);
    const order = await rotatedMetrosForSource('GarageSaleFinder', ['a', 'b', 'c'], NOW);
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('falls back to the day-offset order if the DB read fails', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db down'));
    const order = await rotatedMetrosForSource('GarageSaleFinder', METROS, NOW);
    expect([...order].sort()).toEqual([...METROS].sort());
  });
});

describe('runRotatingMetroLoop', () => {
  function deps(results: Record<string, Array<{ incompleteReason?: string } | Error>>, over: Partial<RotatingLoopDeps> = {}) {
    let t = 0;
    const calls: string[] = [];
    const sleeps: number[] = [];
    const d: RotatingLoopDeps = {
      runOne: async (m) => {
        calls.push(m);
        t += 60_000;
        const queue = results[m] || [];
        const r = queue.length ? queue.shift()! : {};
        if (r instanceof Error) throw r;
        return r;
      },
      capResetInMs: () => 600_000,
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      now: () => t,
      maxRunMs: 20 * 3_600_000,
      ...over,
    };
    return { d, calls, sleeps };
  }

  it('runs every metro when nothing is cut short', async () => {
    const { d, calls } = deps({});
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(METROS);
    expect(r).toMatchObject({ complete: 7, incomplete: 0, notReached: 0 });
  });

  it('on the hourly cap, waits for the window to reset and retries the same metro', async () => {
    const { d, calls, sleeps } = deps({ c: [{ incompleteReason: 'skipped_cap' }, {}] });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(['a', 'b', 'c', 'c', 'd', 'e', 'f', 'g']);
    expect(sleeps).toEqual([605_000]);
    expect(r).toMatchObject({ complete: 7, incomplete: 0 });
  });

  it('stops the run (rather than skipping every later metro) if still capped after the wait', async () => {
    const { d, calls } = deps({ c: [{ incompleteReason: 'skipped_cap' }, { incompleteReason: 'skipped_cap' }] });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(['a', 'b', 'c', 'c']);
    expect(r).toMatchObject({ stoppedBy: 'skipped_cap', notReached: 4 });
  });

  it('stops the run on the domain breaker or a block signal', async () => {
    const { d, calls } = deps({ b: [{ incompleteReason: 'skipped_breaker' }] });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(['a', 'b']);
    expect(r).toMatchObject({ stoppedBy: 'skipped_breaker', notReached: 5 });

    const x = deps({ a: [{ incompleteReason: 'metro_http_429' }] });
    expect((await runRotatingMetroLoop('GSF', METROS, x.d)).stoppedBy).toBe('metro_http_429');
  });

  it('a per-metro fetch-failure streak or an exception does not stop the run', async () => {
    const { d, calls } = deps({ b: [{ incompleteReason: 'fetch_failure_streak' }], d: [new Error('boom')] });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(METROS);
    expect(r).toMatchObject({ complete: 5, incomplete: 1, errored: 1 });
  });

  it('stops at the max run time and leaves the rest for the next run', async () => {
    const { d, calls } = deps({}, { maxRunMs: 3 * 60_000 });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(r).toMatchObject({ stoppedBy: 'max_run_time', notReached: 4 });
  });

  it('does not wait for the cap window when the wait would pass the deadline', async () => {
    const { d, calls, sleeps } = deps({ a: [{ incompleteReason: 'skipped_cap' }] }, { maxRunMs: 5 * 60_000 });
    const r = await runRotatingMetroLoop('GSF', METROS, d);
    expect(sleeps).toEqual([]);
    expect(calls).toEqual(['a']);
    expect(r.stoppedBy).toBe('skipped_cap');
  });
});
