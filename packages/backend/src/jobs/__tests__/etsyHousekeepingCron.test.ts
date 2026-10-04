/**
 * etsyHousekeepingCron.ts -- ADR-135 batch B1 (kill switch zero-work, pruning, token keepalive,
 * budget report, taxonomy staleness, commercial-trigger check, schedule registration).
 * Everything is injected: a small fake db, fake prune/report/keepalive functions, and mocked
 * node-cron, cronGuard and Sentry. No Etsy call, no database.
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import {
  ETSY_COMMERCIAL_ACCOUNTS_TRIGGER,
  ETSY_HOUSEKEEPING_SCHEDULE,
  ETSY_KEEPALIVE_AFTER_MS,
  ETSY_TAXONOMY_MAX_AGE_MS,
  computePeakRolling24h,
  evaluateCommercialTriggers,
  runEtsyHousekeeping,
  startEtsyHousekeepingCron,
} from '../etsyHousekeepingCron';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ENV_ON = { ETSY_CONNECTOR_ENABLED: 'true', ETSY_API_KEY: 'KEYSTRING', ETSY_SHARED_SECRET: 'SHAREDSECRET' };

interface FakeOpts {
  idle?: Array<{ organizerId: string }>;
  active?: Array<{ organizerId: string }>;
  liveGroups?: unknown[];
  taxonomyFetchedAt?: Date | null;
  callTimes?: Date[];
  apiState?: any;
}

function makeDb(o: FakeOpts = {}) {
  const calls = { accountFinds: [] as any[], groupBy: [] as any[], callFinds: [] as any[] };
  const db: any = {
    calls,
    marketplaceAccount: {
      findMany: jest.fn(async (args: any) => {
        calls.accountFinds.push(args);
        // The keepalive query filters on lastRefreshedAt; the trigger query does not.
        return args.where?.lastRefreshedAt ? o.idle ?? [] : o.active ?? [];
      }),
    },
    etsyTaxonomyNode: {
      findFirst: jest.fn(async () => (o.taxonomyFetchedAt === undefined || o.taxonomyFetchedAt === null ? null : { fetchedAt: o.taxonomyFetchedAt })),
    },
    etsyListing: {
      groupBy: jest.fn(async (args: any) => {
        calls.groupBy.push(args);
        return o.liveGroups ?? [];
      }),
    },
    etsyApiCall: {
      findMany: jest.fn(async (args: any) => {
        calls.callFinds.push(args);
        return (o.callTimes ?? []).map((at) => ({ at }));
      }),
    },
    etsyApiState: { findUnique: jest.fn(async () => o.apiState ?? null) },
  };
  return db;
}

function makeDeps(o: FakeOpts & { env?: Record<string, string | undefined> } = {}) {
  const db = makeDb(o);
  const pruneOAuthStates = jest.fn(async () => 3);
  const pruneApiCalls = jest.fn(async () => 7);
  const reportBudget = jest.fn(async () => undefined);
  const keepaliveToken = jest.fn(async (_organizerId: string) => 'token');
  const refreshTaxonomy = jest.fn(async () => undefined);
  const deps = {
    db,
    env: o.env ?? ENV_ON,
    now: () => NOW,
    pruneOAuthStates,
    pruneApiCalls,
    reportBudget,
    keepaliveToken,
    refreshTaxonomy,
  };
  return { db, deps, pruneOAuthStates, pruneApiCalls, reportBudget, keepaliveToken, refreshTaxonomy };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('kill switch', () => {
  it.each([undefined, '', 'false', 'TRUE', '1'])('does no work at all when ETSY_CONNECTOR_ENABLED is %p', async (flag) => {
    const h = makeDeps({ env: { ...ENV_ON, ETSY_CONNECTOR_ENABLED: flag } });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.skipped).toBe(true);
    expect(h.pruneOAuthStates).not.toHaveBeenCalled();
    expect(h.pruneApiCalls).not.toHaveBeenCalled();
    expect(h.reportBudget).not.toHaveBeenCalled();
    expect(h.keepaliveToken).not.toHaveBeenCalled();
    expect(h.refreshTaxonomy).not.toHaveBeenCalled();
    expect(h.db.marketplaceAccount.findMany).not.toHaveBeenCalled();
    expect(h.db.etsyTaxonomyNode.findFirst).not.toHaveBeenCalled();
    expect(h.db.etsyApiCall.findMany).not.toHaveBeenCalled();
  });
});

describe('prune and report', () => {
  it('prunes oauth states and api calls and reports the counts and the budget', async () => {
    const h = makeDeps({ taxonomyFetchedAt: new Date(NOW.getTime() - HOUR) });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.skipped).toBe(false);
    expect(res.prunedOAuthStates).toBe(3);
    expect(res.prunedApiCalls).toBe(7);
    expect(h.reportBudget).toHaveBeenCalledTimes(1);
  });

  it('a failing budget report does not stop the run', async () => {
    const h = makeDeps({ taxonomyFetchedAt: null });
    h.reportBudget.mockRejectedValueOnce(new Error('report broke key=KEYSTRING'));
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.skipped).toBe(false);
    expect(h.refreshTaxonomy).toHaveBeenCalledTimes(1);
    const warned = (console.warn as jest.Mock).mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(warned).not.toContain('KEYSTRING');
  });
});

describe('token keepalive', () => {
  it('asks for ACTIVE ETSY accounts not refreshed for 30 days, capped per run', async () => {
    const h = makeDeps({ idle: [], taxonomyFetchedAt: NOW });
    await runEtsyHousekeeping(h.deps);
    const q = h.db.calls.accountFinds.find((a: any) => a.where?.lastRefreshedAt);
    expect(q.where.platform).toBe('ETSY');
    expect(q.where.status).toBe('ACTIVE');
    expect(q.where.lastRefreshedAt.lt).toEqual(new Date(NOW.getTime() - ETSY_KEEPALIVE_AFTER_MS));
    expect(ETSY_KEEPALIVE_AFTER_MS).toBe(30 * DAY);
    expect(q.take).toBeGreaterThan(0);
  });

  it('refreshes each idle account once and isolates a failure to that account', async () => {
    const h = makeDeps({ idle: [{ organizerId: 'org_a' }, { organizerId: 'org_b' }, { organizerId: 'org_c' }], taxonomyFetchedAt: NOW });
    h.keepaliveToken.mockImplementation(async (id: string) => {
      if (id === 'org_b') throw Object.assign(new Error('refresh failed access_token=1001.LEAK'), { code: 'ETSY_REFRESH_FAILED' });
      return 'token';
    });
    const res = await runEtsyHousekeeping(h.deps);
    expect(h.keepaliveToken.mock.calls.map((c) => c[0])).toEqual(['org_a', 'org_b', 'org_c']);
    expect(res).toMatchObject({ keepaliveChecked: 3, keepaliveRefreshed: 2, keepaliveFailed: 1 });
    const warned = (console.warn as jest.Mock).mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(warned).not.toContain('LEAK');
  });

  it('does nothing when no account is idle', async () => {
    const h = makeDeps({ idle: [], taxonomyFetchedAt: NOW });
    const res = await runEtsyHousekeeping(h.deps);
    expect(h.keepaliveToken).not.toHaveBeenCalled();
    expect(res).toMatchObject({ keepaliveChecked: 0, keepaliveRefreshed: 0, keepaliveFailed: 0 });
  });
});

describe('taxonomy staleness', () => {
  it('refreshes when the table is empty', async () => {
    const h = makeDeps({ taxonomyFetchedAt: null });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res).toMatchObject({ taxonomyDue: true, taxonomyRefreshed: true });
    expect(h.refreshTaxonomy).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the newest node is older than 7 days, not at exactly 7 days', async () => {
    expect(ETSY_TAXONOMY_MAX_AGE_MS).toBe(7 * DAY);
    const stale = makeDeps({ taxonomyFetchedAt: new Date(NOW.getTime() - 7 * DAY - 1) });
    expect((await runEtsyHousekeeping(stale.deps)).taxonomyDue).toBe(true);
    const edge = makeDeps({ taxonomyFetchedAt: new Date(NOW.getTime() - 7 * DAY) });
    expect((await runEtsyHousekeeping(edge.deps)).taxonomyDue).toBe(false);
    expect(edge.refreshTaxonomy).not.toHaveBeenCalled();
  });

  it('does not refresh when the cache is fresh', async () => {
    const h = makeDeps({ taxonomyFetchedAt: new Date(NOW.getTime() - DAY) });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res).toMatchObject({ taxonomyDue: false, taxonomyRefreshed: false });
    expect(h.refreshTaxonomy).not.toHaveBeenCalled();
  });

  it('only reports due when no refresher is wired', async () => {
    const h = makeDeps({ taxonomyFetchedAt: null });
    const res = await runEtsyHousekeeping({ ...h.deps, refreshTaxonomy: undefined });
    expect(res).toMatchObject({ taxonomyDue: true, taxonomyRefreshed: false });
  });

  it('a failing refresher is contained and reported as not refreshed', async () => {
    const h = makeDeps({ taxonomyFetchedAt: null });
    h.refreshTaxonomy.mockRejectedValueOnce(new Error('taxonomy down'));
    const res = await runEtsyHousekeeping(h.deps);
    expect(res).toMatchObject({ taxonomyDue: true, taxonomyRefreshed: false });
  });
});

describe('computePeakRolling24h', () => {
  it('is zero with no calls', () => {
    expect(computePeakRolling24h([], NOW)).toBe(0);
  });

  it('counts calls inside the best rolling 24 hour window', () => {
    const times = [
      new Date(NOW.getTime() - 1 * HOUR),
      new Date(NOW.getTime() - 2 * HOUR),
      new Date(NOW.getTime() - 3 * HOUR),
      // a heavier burst 30 hours ago
      ...Array.from({ length: 10 }, (_, i) => new Date(NOW.getTime() - 30 * HOUR - i * 60_000)),
    ];
    expect(computePeakRolling24h(times, NOW)).toBe(10);
  });

  it('never counts two calls more than 24 hours apart in the same window', () => {
    expect(computePeakRolling24h([new Date(NOW.getTime() - DAY)], NOW)).toBe(1); // lands in an earlier hourly window
    const burst = [new Date(NOW.getTime() - 5 * HOUR), new Date(NOW.getTime() - DAY - 5 * HOUR)];
    expect(computePeakRolling24h(burst, NOW)).toBe(1);
  });
});

describe('evaluateCommercialTriggers', () => {
  const base = { accountsWithLiveListings: 0, peak24h: 0, limitPerDay: 5000, blockedReason: null as string | null };

  it('returns nothing when no condition holds', () => {
    expect(evaluateCommercialTriggers(base)).toEqual([]);
  });

  it('fires at 25 accounts with live listings', () => {
    expect(ETSY_COMMERCIAL_ACCOUNTS_TRIGGER).toBe(25);
    expect(evaluateCommercialTriggers({ ...base, accountsWithLiveListings: 24 })).toEqual([]);
    expect(evaluateCommercialTriggers({ ...base, accountsWithLiveListings: 25 })).toEqual(['accounts-with-live-listings=25']);
  });

  it('fires when the peak reaches 60 percent of the daily limit', () => {
    expect(evaluateCommercialTriggers({ ...base, peak24h: 2999 })).toEqual([]);
    expect(evaluateCommercialTriggers({ ...base, peak24h: 3000 })).toEqual(['peak-24h-usage=3000-of-5000']);
  });

  it('ignores the usage condition when the limit is unknown or zero', () => {
    expect(evaluateCommercialTriggers({ ...base, limitPerDay: null, peak24h: 99999 })).toEqual([]);
    expect(evaluateCommercialTriggers({ ...base, limitPerDay: 0, peak24h: 99999 })).toEqual([]);
  });

  it('fires when a QPD block was recorded, and only for QPD', () => {
    expect(evaluateCommercialTriggers({ ...base, blockedReason: 'QPD' })).toEqual(['qpd-block-recorded']);
    expect(evaluateCommercialTriggers({ ...base, blockedReason: 'QPS' })).toEqual([]);
  });

  it('can report several conditions at once', () => {
    expect(evaluateCommercialTriggers({ accountsWithLiveListings: 30, peak24h: 4000, limitPerDay: 5000, blockedReason: 'QPD' })).toHaveLength(3);
  });
});

describe('commercial trigger check inside a run', () => {
  it('logs the trigger line and raises one info event when a condition holds', async () => {
    const h = makeDeps({
      taxonomyFetchedAt: NOW,
      active: [{ organizerId: 'a' }, { organizerId: 'b' }],
      apiState: { limitPerDay: 5000, blockedReason: 'QPD' },
    });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.commercialTriggers).toEqual(['qpd-block-recorded']);
    const logged = (console.log as jest.Mock).mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toContain('[etsy-commercial-trigger] qpd-block-recorded');
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect((Sentry.captureMessage as jest.Mock).mock.calls[0][1]).toMatchObject({
      level: 'info',
      tags: { integration: 'etsy', area: 'budget', step: 'commercial-trigger' },
    });
  });

  it('counts only ACTIVE accounts that have a live listing', async () => {
    const accounts = Array.from({ length: 26 }, (_, i) => ({ organizerId: `org_${i}` }));
    const h = makeDeps({ taxonomyFetchedAt: NOW, active: accounts, liveGroups: accounts.map((a) => ({ organizerId: a.organizerId })) });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.commercialTriggers).toEqual(['accounts-with-live-listings=26']);
    const q = h.db.calls.groupBy[0];
    expect(q.where.state).toBe('ACTIVE');
    expect(q.where.organizerId.in).toHaveLength(26);
  });

  it('reads api call times only from the 48 hour retention window and raises nothing when quiet', async () => {
    const h = makeDeps({ taxonomyFetchedAt: NOW, apiState: { limitPerDay: 5000, blockedReason: null } });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.commercialTriggers).toEqual([]);
    expect(h.db.calls.callFinds[0].where.at.gt).toEqual(new Date(NOW.getTime() - 2 * DAY));
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('a failing trigger check never fails the run', async () => {
    const h = makeDeps({ taxonomyFetchedAt: NOW });
    h.db.etsyApiCall.findMany = jest.fn(async () => {
      throw new Error('db gone');
    });
    h.db.marketplaceAccount.findMany = jest.fn(async (args: any) => {
      if (args.where?.lastRefreshedAt) return [];
      return [{ organizerId: 'a' }];
    });
    const res = await runEtsyHousekeeping(h.deps);
    expect(res.skipped).toBe(false);
    expect(res.commercialTriggers).toEqual([]);
  });
});

describe('startEtsyHousekeepingCron', () => {
  it('registers one daily job at 04:23 and does not run anything at registration', () => {
    const h = makeDeps();
    startEtsyHousekeepingCron(h.deps);
    expect(ETSY_HOUSEKEEPING_SCHEDULE).toBe('23 4 * * *');
    expect((cron as any).schedule).toHaveBeenCalledTimes(1);
    expect((cron as any).schedule.mock.calls[0][0]).toBe('23 4 * * *');
    expect(h.pruneApiCalls).not.toHaveBeenCalled();
    expect(h.db.marketplaceAccount.findMany).not.toHaveBeenCalled();
  });

  it('the scheduled callback runs the housekeeping with the given deps', async () => {
    const h = makeDeps({ taxonomyFetchedAt: NOW });
    startEtsyHousekeepingCron(h.deps);
    const callback = (cron as any).schedule.mock.calls[0][1] as () => Promise<void>;
    await callback();
    expect(h.pruneApiCalls).toHaveBeenCalledTimes(1);
    expect(h.reportBudget).toHaveBeenCalledTimes(1);
  });
});
