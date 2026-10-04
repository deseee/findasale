/**
 * etsyBudget.ts -- ADR-135 batch B1 acceptance item 4: caps, effectiveUsed, blockedUntil, and that
 * reservation runs inside a transaction that takes pg_advisory_xact_lock.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import * as Sentry from '@sentry/node';
import {
  ETSY_ALERT_MIN_GAP_MS,
  ETSY_BLOCK_CAP_MS,
  ETSY_BUDGET_LOCK_KEY,
  ETSY_CALL_RETENTION_MS,
  ETSY_PRIORITY_CAPS,
  ETSY_REMAINING_FRESH_MS,
  computeEffectiveUsed,
  computeEtsyBudgetDecision,
  formatEtsyBudgetLog,
  markEtsyBlocked,
  pruneEtsyApiCalls,
  readEtsyDailyBudget,
  recordEtsyResponse,
  reportEtsyBudget,
  reserveEtsyCall,
  resolveEtsyLimit,
  scrubEtsySecrets,
} from '../etsyBudget';
import type { EtsyPriority } from '../etsyBudget';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const minutesAhead = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe('priority caps (URGENT 98%, INTERACTIVE 90%, BACKGROUND 60%)', () => {
  it('uses the ADR percentages', () => {
    expect(ETSY_PRIORITY_CAPS).toEqual({ URGENT: 0.98, INTERACTIVE: 0.9, BACKGROUND: 0.6 });
  });

  // limit 5000: thresholds are 4900, 4500 and 3000
  const cases: Array<[EtsyPriority, number, boolean]> = [
    ['URGENT', 4899, true],
    ['URGENT', 4900, false],
    ['INTERACTIVE', 4499, true],
    ['INTERACTIVE', 4500, false],
    ['BACKGROUND', 2999, true],
    ['BACKGROUND', 3000, false],
    ['URGENT', 0, true],
    ['BACKGROUND', 5000, false],
  ];
  it.each(cases)('%s at used=%i allowed=%s', (priority, used24h, allowed) => {
    const d = computeEtsyBudgetDecision({ priority, dailyBudget: 5000, state: null, used24h, now: NOW });
    expect(d.allowed).toBe(allowed);
    expect(d.limit).toBe(5000);
    if (!allowed) expect(d.reason).toBe('BUDGET');
  });

  it('floors the threshold for odd limits', () => {
    const d = computeEtsyBudgetDecision({ priority: 'BACKGROUND', dailyBudget: 101, state: null, used24h: 60, now: NOW });
    expect(d.threshold).toBe(60); // floor(101 * 0.6)
    expect(d.allowed).toBe(false);
  });
});

describe('limit resolution', () => {
  it('is min(configured budget, observed x-limit-per-day)', () => {
    expect(resolveEtsyLimit(5000, null)).toBe(5000);
    expect(resolveEtsyLimit(5000, { limitPerDay: 1000 })).toBe(1000);
    expect(resolveEtsyLimit(5000, { limitPerDay: 10000 })).toBe(5000);
    expect(resolveEtsyLimit(5000, { limitPerDay: 0 })).toBe(5000);
  });

  it('reads ETSY_DAILY_BUDGET from env at call time with a 5000 default', () => {
    expect(readEtsyDailyBudget({})).toBe(5000);
    expect(readEtsyDailyBudget({ ETSY_DAILY_BUDGET: '1200' })).toBe(1200);
    expect(readEtsyDailyBudget({ ETSY_DAILY_BUDGET: 'abc' })).toBe(5000);
    expect(readEtsyDailyBudget({ ETSY_DAILY_BUDGET: '-4' })).toBe(5000);
  });
});

describe('effectiveUsed = max(used, limit - remainingToday) only when observed within 10 minutes', () => {
  it('folds in calls we cannot see when the observation is fresh', () => {
    expect(computeEffectiveUsed(100, 5000, { remainingToday: 400, observedAt: minutesAgo(5) }, NOW)).toBe(4600);
  });

  it('keeps our own count when it is higher than the header implies', () => {
    expect(computeEffectiveUsed(4800, 5000, { remainingToday: 400, observedAt: minutesAgo(1) }, NOW)).toBe(4800);
  });

  it('ignores a stale observation (older than 10 minutes)', () => {
    expect(ETSY_REMAINING_FRESH_MS).toBe(600_000);
    expect(computeEffectiveUsed(100, 5000, { remainingToday: 400, observedAt: minutesAgo(11) }, NOW)).toBe(100);
    expect(computeEffectiveUsed(100, 5000, { remainingToday: 400, observedAt: minutesAgo(10) }, NOW)).toBe(4600);
  });

  it('ignores a missing observation time or missing remaining value', () => {
    expect(computeEffectiveUsed(100, 5000, { remainingToday: 400, observedAt: null }, NOW)).toBe(100);
    expect(computeEffectiveUsed(100, 5000, { remainingToday: null, observedAt: minutesAgo(1) }, NOW)).toBe(100);
  });

  it('drives the decision: a fresh low remainingToday blocks BACKGROUND and INTERACTIVE but not URGENT', () => {
    const state = { remainingToday: 400, observedAt: minutesAgo(5) }; // effectiveUsed 4600
    const run = (priority: EtsyPriority) =>
      computeEtsyBudgetDecision({ priority, dailyBudget: 5000, state, used24h: 100, now: NOW }).allowed;
    expect(run('BACKGROUND')).toBe(false);
    expect(run('INTERACTIVE')).toBe(false);
    expect(run('URGENT')).toBe(true);
  });

  it('a stale remainingToday does not block anything', () => {
    const state = { remainingToday: 400, observedAt: minutesAgo(30) };
    const d = computeEtsyBudgetDecision({ priority: 'BACKGROUND', dailyBudget: 5000, state, used24h: 100, now: NOW });
    expect(d.allowed).toBe(true);
    expect(d.effectiveUsed).toBe(100);
  });
});

describe('blockedUntil', () => {
  it('rejects every priority with BLOCKED and retryAt while the block is in the future', () => {
    const blockedUntil = minutesAhead(3);
    for (const priority of ['URGENT', 'INTERACTIVE', 'BACKGROUND'] as EtsyPriority[]) {
      const d = computeEtsyBudgetDecision({ priority, dailyBudget: 5000, state: { blockedUntil, blockedReason: 'QPD' }, used24h: 0, now: NOW });
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe('BLOCKED');
      expect(d.retryAt).toEqual(blockedUntil);
    }
  });

  it('allows calls again once the block has passed', () => {
    const d = computeEtsyBudgetDecision({ priority: 'URGENT', dailyBudget: 5000, state: { blockedUntil: minutesAgo(1) }, used24h: 0, now: NOW });
    expect(d.allowed).toBe(true);
  });
});

/** Fake Prisma that records the order of calls and whether they ran against the transaction client. */
function makeBudgetDb(opts: { state?: any; used?: number } = {}) {
  const log: string[] = [];
  let txOpen = false;
  const callIds = { next: 1 };
  const tx: any = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
      log.push(`tx:raw:${strings.join('?')}`);
      return 0;
    }),
    etsyApiState: {
      findUnique: jest.fn(async () => {
        log.push('tx:state');
        return opts.state ?? null;
      }),
    },
    etsyApiCall: {
      count: jest.fn(async (args: any) => {
        log.push('tx:count');
        tx.lastCountArgs = args;
        return opts.used ?? 0;
      }),
      create: jest.fn(async (args: any) => {
        log.push('tx:create');
        return { id: callIds.next++ };
      }),
    },
  };
  const outside = jest.fn();
  const db: any = {
    $transaction: jest.fn(async (fn: (t: any) => Promise<any>) => {
      txOpen = true;
      log.push('tx:begin');
      try {
        return await fn(tx);
      } finally {
        log.push('tx:end');
        txOpen = false;
      }
    }),
    // Any use of these outside the transaction is a bug (the reservation must be atomic).
    etsyApiState: { findUnique: outside },
    etsyApiCall: { count: outside, create: outside },
    $executeRaw: outside,
  };
  return { db, tx, log, outside, isTxOpen: () => txOpen };
}

describe('reserveEtsyCall', () => {
  it('takes pg_advisory_xact_lock first, inside one transaction, then reads, counts and inserts', async () => {
    const { db, tx, log, outside } = makeBudgetDb({ used: 10 });
    const res = await reserveEtsyCall({ priority: 'INTERACTIVE', endpoint: 'GET /v3/application/shops/:id', organizerId: 'org_1' }, { db, now: () => NOW, env: {} });
    expect(res).toEqual({ callId: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(log[0]).toBe('tx:begin');
    expect(log[1]).toContain('pg_advisory_xact_lock');
    expect(log.slice(2)).toEqual(['tx:state', 'tx:count', 'tx:create', 'tx:end']);
    // The literal in the SQL equals the exported lock key, and nothing ran outside the transaction.
    expect(log[1]).toContain(String(ETSY_BUDGET_LOCK_KEY));
    expect(outside).not.toHaveBeenCalled();
    expect(tx.etsyApiCall.create).toHaveBeenCalledWith({
      data: { priority: 'INTERACTIVE', endpoint: 'GET /v3/application/shops/:id', organizerId: 'org_1' },
      select: { id: true },
    });
  });

  it('counts only the last 24 hours', async () => {
    const { db, tx } = makeBudgetDb();
    await reserveEtsyCall({ priority: 'URGENT', endpoint: 'x' }, { db, now: () => NOW, env: {} });
    expect(tx.lastCountArgs.where.at.gt).toEqual(new Date(NOW.getTime() - 24 * 3600 * 1000));
  });

  it('rejects with ETSY_BUDGET and writes no row when the priority cap is reached', async () => {
    const { db, tx } = makeBudgetDb({ used: 3000 });
    await expect(reserveEtsyCall({ priority: 'BACKGROUND', endpoint: 'x' }, { db, now: () => NOW, env: {} })).rejects.toMatchObject({ code: 'ETSY_BUDGET' });
    expect(tx.etsyApiCall.create).not.toHaveBeenCalled();
    // The lock was still taken before the decision.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('still admits URGENT when BACKGROUND is capped', async () => {
    const { db } = makeBudgetDb({ used: 3000 });
    await expect(reserveEtsyCall({ priority: 'URGENT', endpoint: 'x' }, { db, now: () => NOW, env: {} })).resolves.toEqual({ callId: 1 });
  });

  it('rejects with ETSY_BLOCKED and retryAt while blockedUntil is in the future', async () => {
    const blockedUntil = minutesAhead(5);
    const { db, tx } = makeBudgetDb({ state: { blockedUntil, blockedReason: 'QPS' } });
    await expect(reserveEtsyCall({ priority: 'URGENT', endpoint: 'x' }, { db, now: () => NOW, env: {} })).rejects.toMatchObject({
      code: 'ETSY_BLOCKED',
      retryAt: blockedUntil,
    });
    expect(tx.etsyApiCall.create).not.toHaveBeenCalled();
  });

  it('honors ETSY_DAILY_BUDGET and the observed limit', async () => {
    const small = makeBudgetDb({ used: 100 });
    await expect(reserveEtsyCall({ priority: 'BACKGROUND', endpoint: 'x' }, { db: small.db, now: () => NOW, env: { ETSY_DAILY_BUDGET: '150' } })).rejects.toMatchObject({ code: 'ETSY_BUDGET' });
    const observed = makeBudgetDb({ used: 100, state: { limitPerDay: 150 } });
    await expect(reserveEtsyCall({ priority: 'BACKGROUND', endpoint: 'x' }, { db: observed.db, now: () => NOW, env: {} })).rejects.toMatchObject({ code: 'ETSY_BUDGET' });
  });
});

describe('recordEtsyResponse', () => {
  function makeRecordDb() {
    const db: any = {
      etsyApiCall: { update: jest.fn(async () => ({})) },
      etsyApiState: { upsert: jest.fn(async () => ({})) },
    };
    return db;
  }

  it('stores the status and folds the rate-limit headers into EtsyApiState', async () => {
    const db = makeRecordDb();
    await recordEtsyResponse(7, 200, { 'x-limit-per-day': '5000', 'x-remaining-today': '4321', 'x-limit-per-second': '5' }, { db, now: () => NOW });
    expect(db.etsyApiCall.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 200 } });
    expect(db.etsyApiState.upsert).toHaveBeenCalledWith({
      where: { id: 'global' },
      create: { id: 'global', limitPerDay: 5000, remainingToday: 4321, limitPerSecond: 5, observedAt: NOW },
      update: { limitPerDay: 5000, remainingToday: 4321, limitPerSecond: 5, observedAt: NOW },
    });
  });

  it('does not touch EtsyApiState when no rate headers are present or they are malformed', async () => {
    const db = makeRecordDb();
    await recordEtsyResponse(8, 404, {}, { db, now: () => NOW });
    await recordEtsyResponse(9, 200, { 'x-remaining-today': 'abc', 'x-limit-per-day': '-1' }, { db, now: () => NOW });
    expect(db.etsyApiState.upsert).not.toHaveBeenCalled();
  });

  it('never throws when the database fails', async () => {
    const db = makeRecordDb();
    db.etsyApiCall.update.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(recordEtsyResponse(1, 200, {}, { db, now: () => NOW })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('markEtsyBlocked', () => {
  function makeBlockDb(existing: any) {
    return {
      etsyApiState: {
        findUnique: jest.fn(async () => existing),
        upsert: jest.fn(async () => ({})),
      },
    } as any;
  }

  it('writes blockedUntil and blockedReason', async () => {
    const db = makeBlockDb(null);
    const until = minutesAhead(2);
    await markEtsyBlocked({ until, reason: 'QPS' }, { db, now: () => NOW });
    expect(db.etsyApiState.upsert).toHaveBeenCalledWith({
      where: { id: 'global' },
      create: { id: 'global', blockedUntil: until, blockedReason: 'QPS' },
      update: { blockedUntil: until, blockedReason: 'QPS' },
    });
  });

  it('never shortens an existing later block and caps a block at 24 hours', async () => {
    const later = minutesAhead(60);
    const db = makeBlockDb({ blockedUntil: later });
    await markEtsyBlocked({ until: minutesAhead(1), reason: 'QPS' }, { db, now: () => NOW });
    expect(db.etsyApiState.upsert.mock.calls[0][0].update.blockedUntil).toEqual(later);

    const db2 = makeBlockDb(null);
    await markEtsyBlocked({ until: new Date(NOW.getTime() + 5 * ETSY_BLOCK_CAP_MS), reason: 'QPD' }, { db: db2, now: () => NOW });
    expect(db2.etsyApiState.upsert.mock.calls[0][0].update.blockedUntil).toEqual(new Date(NOW.getTime() + ETSY_BLOCK_CAP_MS));
  });
});

describe('pruneEtsyApiCalls', () => {
  it('deletes rows older than 48 hours', async () => {
    const db: any = { etsyApiCall: { deleteMany: jest.fn(async () => ({ count: 12 })) } };
    expect(await pruneEtsyApiCalls({ db, now: () => NOW })).toBe(12);
    expect(db.etsyApiCall.deleteMany).toHaveBeenCalledWith({ where: { at: { lt: new Date(NOW.getTime() - ETSY_CALL_RETENTION_MS) } } });
    expect(ETSY_CALL_RETENTION_MS).toBe(48 * 3600 * 1000);
  });
});

describe('reportEtsyBudget (log line and thresholds)', () => {
  function makeReportDb(state: any, used: number) {
    return {
      etsyApiState: { findUnique: jest.fn(async () => state), upsert: jest.fn(async () => ({})) },
      etsyApiCall: { count: jest.fn(async () => used) },
    } as any;
  }
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    (Sentry.captureMessage as jest.Mock).mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('logs used24h, limit, remaining and blocked', async () => {
    const db = makeReportDb(null, 1000);
    const { snapshot } = await reportEtsyBudget({ db, now: () => NOW, env: {} });
    expect(formatEtsyBudgetLog(snapshot)).toBe('[etsy-budget] used24h=1000 limit=5000 remaining=4000 blocked=no');
    expect(logSpy).toHaveBeenCalledWith('[etsy-budget] used24h=1000 limit=5000 remaining=4000 blocked=no');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('alerts at 80% (warning) and 95% (error) with etsy budget tags, at most once per hour', async () => {
    const warnDb = makeReportDb(null, 4000);
    expect((await reportEtsyBudget({ db: warnDb, now: () => NOW, env: {} })).alerted).toBe('warning');
    expect((Sentry.captureMessage as jest.Mock).mock.calls[0][1]).toMatchObject({ level: 'warning', tags: { integration: 'etsy', area: 'budget' } });
    expect(warnDb.etsyApiState.upsert).toHaveBeenCalled();

    const errDb = makeReportDb(null, 4750);
    expect((await reportEtsyBudget({ db: errDb, now: () => NOW, env: {} })).alerted).toBe('error');

    (Sentry.captureMessage as jest.Mock).mockClear();
    const recentDb = makeReportDb({ lastAlertAt: new Date(NOW.getTime() - (ETSY_ALERT_MIN_GAP_MS - 1000)) }, 4750);
    expect((await reportEtsyBudget({ db: recentDb, now: () => NOW, env: {} })).alerted).toBeNull();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();

    const oldDb = makeReportDb({ lastAlertAt: new Date(NOW.getTime() - ETSY_ALERT_MIN_GAP_MS - 1000) }, 4750);
    expect((await reportEtsyBudget({ db: oldDb, now: () => NOW, env: {} })).alerted).toBe('error');
  });

  it('reports an active block in the log line', async () => {
    const db = makeReportDb({ blockedUntil: minutesAhead(10), blockedReason: 'QPD' }, 0);
    const { snapshot } = await reportEtsyBudget({ db, now: () => NOW, env: {} });
    expect(formatEtsyBudgetLog(snapshot)).toContain('blocked=QPD until');
  });
});

describe('scrubEtsySecrets', () => {
  it('redacts tokens, bearer headers and configured secrets', () => {
    const env = { ETSY_API_KEY: 'abcd1234key', ETSY_SHARED_SECRET: 'sharedsecret99' };
    const out = scrubEtsySecrets('Bearer 12345678.abcdefghijklmnopqrstuvwxyz and abcd1234key plus sharedsecret99 and 99887766.ZZZZZZZZZZZZZZZZZZZZ', env);
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(out).not.toContain('abcd1234key');
    expect(out).not.toContain('sharedsecret99');
    expect(out).not.toContain('ZZZZZZZZZZZZZZZZZZZZ');
  });
});
