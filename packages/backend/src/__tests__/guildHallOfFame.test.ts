/**
 * Hall of Fame controller tests (2026-09-29): public-safe names, no leaked user ids for private
 * profiles, honest achievement date, and the seasonal reset job's idempotency.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockUserFindMany = jest.fn();
const mockUserCount = jest.fn();
const mockPassportFindMany = jest.fn();
const mockApplySeasonalReset = jest.fn();
const mockGroupBy = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findMany: (...a: any[]) => mockUserFindMany(...a), count: (...a: any[]) => mockUserCount(...a) },
    collectorPassport: { findMany: (...a: any[]) => mockPassportFindMany(...a) },
    pointsTransaction: { groupBy: (...a: any[]) => mockGroupBy(...a) },
  },
}));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../services/xpService', () => ({
  RANK_THRESHOLDS: { INITIATE: 0, SCOUT: 500, RANGER: 2000, SAGE: 5000, GRANDMASTER: 12000 },
  applySeasonalReset: (...a: any[]) => mockApplySeasonalReset(...a),
}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));

import cron from 'node-cron';
import {
  getHallOfFame,
  toPublicName,
  opaqueHallOfFameId,
  findRankAchievedAt,
} from '../controllers/guildController';
import { runSeasonalResetIfDue, startSeasonalResetJob, seasonStartFor, _resetSeasonalMemoForTests } from '../jobs/seasonalResetJob';
import { getSeasonXpLeaders } from '../services/seasonStandingsService';

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
};

describe('toPublicName (opted-in members only; one shared policy with crews and the Collector\'s League)', () => {
  const OPTED_IN = { showNameInGoingList: true };
  it('returns first name plus last initial for an opted-in member', () => {
    expect(toPublicName('Jane Doe', OPTED_IN)).toBe('Jane D.');
    expect(toPublicName('  jane   van der berg ', OPTED_IN)).toBe('jane B.');
    expect(toPublicName('Ana maria lopez', OPTED_IN)).toBe('Ana L.');
  });
  it('keeps single names and handles missing names', () => {
    expect(toPublicName('Prince', OPTED_IN)).toBe('Prince');
    expect(toPublicName(null, OPTED_IN)).toBe('Explorer');
    expect(toPublicName('   ', OPTED_IN)).toBe('Explorer');
  });
  it('is idempotent', () => {
    expect(toPublicName('Jane D.', OPTED_IN)).toBe('Jane D.');
  });
  it('never shows a name for a member who did not opt in (missing, false or non-boolean prefs)', () => {
    expect(toPublicName('Jane Doe')).toBe('Explorer');
    expect(toPublicName('Jane Doe', null)).toBe('Explorer');
    expect(toPublicName('Jane Doe', {})).toBe('Explorer');
    expect(toPublicName('Jane Doe', { showNameInGoingList: false })).toBe('Explorer');
    expect(toPublicName('Jane Doe', { showNameInGoingList: 'true' })).toBe('Explorer');
  });
  it('never shows an email address, even for an opted-in member whose account name is their email', () => {
    expect(toPublicName('jane.doe@example.com', OPTED_IN)).toBe('Explorer');
    expect(toPublicName('Jane jane@example.com', OPTED_IN)).toBe('Explorer');
  });
});

describe('findRankAchievedAt', () => {
  it('returns the earliest matching timestamp', () => {
    const history = [
      { rank: 'SCOUT', timestamp: '2026-01-01T00:00:00.000Z', xpAtTime: 500 },
      { rank: 'GRANDMASTER', timestamp: '2026-08-02T00:00:00.000Z', xpAtTime: 12000 },
      { rank: 'GRANDMASTER', timestamp: '2026-03-05T12:00:00.000Z', xpAtTime: 12100 },
    ];
    expect(findRankAchievedAt(history, 'GRANDMASTER')?.toISOString()).toBe('2026-03-05T12:00:00.000Z');
  });
  it('returns null when history is missing, malformed or has no such rank', () => {
    expect(findRankAchievedAt(undefined, 'GRANDMASTER')).toBeNull();
    expect(findRankAchievedAt([], 'GRANDMASTER')).toBeNull();
    expect(findRankAchievedAt([{ rank: 'GRANDMASTER', timestamp: 'nope' }, null, 5], 'GRANDMASTER')).toBeNull();
  });
});

describe('opaqueHallOfFameId', () => {
  it('is stable, prefixed and does not contain the user id', () => {
    const a = opaqueHallOfFameId('cuid_user_123');
    expect(a).toBe(opaqueHallOfFameId('cuid_user_123'));
    expect(a).not.toContain('cuid_user_123');
    expect(a.startsWith('hof_')).toBe(true);
    expect(a).not.toBe(opaqueHallOfFameId('cuid_user_124'));
  });
});

describe('getHallOfFame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupBy.mockReset();
    mockGroupBy.mockResolvedValue([]);
  });

  it('returns short names, real id only for public profiles, honest achievedAt, and no createdAt', async () => {
    // Season ledger: Sam earned 800 XP this season; no clawbacks.
    mockGroupBy
      .mockResolvedValueOnce([{ userId: 'u_private', _sum: { points: 800 } }])
      .mockResolvedValueOnce([]);
    mockUserFindMany
      .mockResolvedValueOnce([
        {
          id: 'u_public', name: 'Jane Doe', profileSlug: 'jane', guildXp: 15000, explorerRank: 'GRANDMASTER', notificationPrefs: { showNameInGoingList: true },
          rankUpHistory: [{ rank: 'GRANDMASTER', timestamp: '2026-05-01T00:00:00.000Z', xpAtTime: 12000 }],
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'u_private', name: 'Sam Roe', profileSlug: 'sam', guildXp: 13000, explorerRank: 'SAGE', // stored rank lags XP
          rankUpHistory: [], createdAt: new Date('2024-02-01T00:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'u_private', name: 'Sam Roe', profileSlug: 'sam', guildXp: 13000, explorerRank: 'SAGE' },
      ]);
    mockPassportFindMany.mockResolvedValueOnce([{ userId: 'u_public' }]);

    const res = makeRes();
    await getHallOfFame({} as any, res);

    expect(res.statusCode).toBe(200);
    const [gm1, gm2] = res.body.allTimeGrandmasters;
    expect(gm1).toMatchObject({ rank: 1, userId: 'u_public', name: 'Jane D.', profileSlug: 'jane', profilePublic: true, explorerRank: 'GRANDMASTER', achievedAt: '2026-05-01T00:00:00.000Z' });
    expect(gm2).toMatchObject({ rank: 2, name: 'Explorer', profileSlug: null, profilePublic: false, explorerRank: 'GRANDMASTER', achievedAt: null });
    expect(gm2.userId).not.toBe('u_private');
    expect(gm2.userId.startsWith('hof_')).toBe(true);

    expect(res.body.seasonalTop100[0].userId).toBe(gm2.userId);
    // The seasonal score is the season XP (800), not the lifetime balance (13000).
    expect(res.body.seasonalTop100[0]).toMatchObject({ rank: 1, guildXp: 800, seasonXp: 800, totalGuildXp: 13000, explorerRank: 'SAGE' });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('Doe');
    expect(serialized).not.toContain('Roe');
    expect(serialized).not.toContain('u_private');
    expect(serialized).not.toContain('createdAt');
  });

  it('selects Grandmasters by rank OR XP threshold so the reset does not empty the board', async () => {
    mockUserFindMany.mockResolvedValue([]);
    await getHallOfFame({} as any, makeRes());
    const where = mockUserFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ explorerRank: 'GRANDMASTER' }, { guildXp: { gte: 12000 } }]);
    expect(mockPassportFindMany).not.toHaveBeenCalled(); // nobody to look up
  });

  it('keeps the response shape when both lists are empty and returns 500 on failure', async () => {
    mockUserFindMany.mockResolvedValue([]);
    const ok = makeRes();
    await getHallOfFame({} as any, ok);
    expect(ok.body).toEqual({ allTimeGrandmasters: [], seasonalTop100: [] });

    mockUserFindMany.mockRejectedValue(new Error('db down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = makeRes();
    await getHallOfFame({} as any, bad);
    expect(bad.statusCode).toBe(500);
    err.mockRestore();
  });
});

describe('getHallOfFame seasonal board (season XP earned)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockReset();
    mockUserFindMany.mockResolvedValue([]);
    mockGroupBy.mockReset();
    mockGroupBy.mockResolvedValue([]);
    mockPassportFindMany.mockResolvedValue([]);
  });

  it('ranks by XP earned this season, not lifetime guildXp, and keeps the ledger order', async () => {
    mockGroupBy
      .mockResolvedValueOnce([
        { userId: 'u_low_lifetime', _sum: { points: 900 } },
        { userId: 'u_high_lifetime', _sum: { points: 400 } },
      ])
      .mockResolvedValueOnce([]);
    mockUserFindMany
      .mockResolvedValueOnce([]) // grandmasters
      .mockResolvedValueOnce([
        // returned in a different order than the ledger on purpose
        { id: 'u_high_lifetime', name: 'Big Lifetime', profileSlug: null, guildXp: 50000, explorerRank: 'GRANDMASTER', notificationPrefs: { showNameInGoingList: true } },
        { id: 'u_low_lifetime', name: 'Fresh Sage', profileSlug: null, guildXp: 5200, explorerRank: 'SAGE', notificationPrefs: { showNameInGoingList: true } },
      ]);
    const res = makeRes();
    await getHallOfFame({} as any, res);
    const board = res.body.seasonalTop100;
    expect(board.map((e: any) => e.rank)).toEqual([1, 2]);
    expect(board[0]).toMatchObject({ name: 'Fresh S.', guildXp: 900, seasonXp: 900, totalGuildXp: 5200 });
    expect(board[1]).toMatchObject({ name: 'Big L.', guildXp: 400, seasonXp: 400, totalGuildXp: 50000 });
    expect(board[0].userId.startsWith('hof_')).toBe(true);
  });

  it('queries positive ledger rows since Jan 1 UTC for Sage+ non-suspect members, grouped and limited', async () => {
    await getHallOfFame({} as any, makeRes());
    const q = mockGroupBy.mock.calls[0][0];
    expect(q.by).toEqual(['userId']);
    expect(q.where.points).toEqual({ gt: 0 });
    expect(q.where.createdAt.gte.toISOString()).toBe(seasonStartFor(new Date()).toISOString());
    expect(q.where.user).toEqual({ explorerRank: { in: ['SAGE', 'GRANDMASTER'] }, fraudSuspect: false });
    expect(q.orderBy).toEqual({ _sum: { points: 'desc' } });
    expect(q.take).toBeGreaterThanOrEqual(100);
  });

  it('never lowers anyone: no user write of any kind is attempted', async () => {
    await getHallOfFame({} as any, makeRes());
    const userApi: any = (require('../lib/prisma') as any).prisma.user;
    expect(userApi.updateMany).toBeUndefined();
    expect(userApi.update).toBeUndefined();
  });
});

describe('getSeasonXpLeaders', () => {
  beforeEach(() => {
    mockGroupBy.mockReset();
    mockGroupBy.mockResolvedValue([]);
  });

  it('subtracts chargeback clawbacks, drops zero scores, and breaks ties by user id', async () => {
    mockGroupBy
      .mockResolvedValueOnce([
        { userId: 'b', _sum: { points: 500 } },
        { userId: 'a', _sum: { points: 500 } },
        { userId: 'c', _sum: { points: 700 } },
        { userId: 'd', _sum: { points: 300 } },
      ])
      .mockResolvedValueOnce([{ userId: 'c', _sum: { points: -250 } }, { userId: 'd', _sum: { points: -300 } }]);
    const out = await getSeasonXpLeaders({ start: new Date('2027-01-01T00:00:00Z'), limit: 10 });
    // c: 700-250=450, d: 300-300=0 (dropped), a/b tie at 500 (a first)
    expect(out).toEqual([
      { userId: 'a', seasonXp: 500 },
      { userId: 'b', seasonXp: 500 },
      { userId: 'c', seasonXp: 450 },
    ]);
    expect(mockGroupBy.mock.calls[1][0].where.type).toBe('CHARGEBACK_XP_CLAWBACK');
    expect(mockGroupBy.mock.calls[1][0].where.userId).toEqual({ in: ['b', 'a', 'c', 'd'] });
  });

  it('honours an end bound (used for the closing-season snapshot) and caps the limit', async () => {
    await getSeasonXpLeaders({ start: new Date('2026-01-01T00:00:00Z'), end: new Date('2027-01-01T00:00:00Z'), limit: 10 });
    const where = mockGroupBy.mock.calls[0][0].where;
    expect(where.createdAt.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(mockGroupBy.mock.calls[0][0].take).toBe(60);
    expect(mockGroupBy).toHaveBeenCalledTimes(1); // empty candidate set skips the clawback query
  });
});

describe('seasonalResetJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupBy.mockReset();
    mockGroupBy.mockResolvedValue([]);
    _resetSeasonalMemoForTests();
  });

  it('seasonStartFor is Jan 1 UTC of that year', () => {
    expect(seasonStartFor(new Date('2027-01-03T10:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('records the boundary with the closing season top 10, calls the no-op hook and writes no user rows', async () => {
    mockGroupBy
      .mockResolvedValueOnce([{ userId: 'u1', _sum: { points: 900 } }])
      .mockResolvedValueOnce([]);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(runSeasonalResetIfDue(new Date('2027-01-01T00:05:00Z'))).resolves.toBe('recorded');
    expect(mockApplySeasonalReset).toHaveBeenCalledTimes(1);
    const where = mockGroupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(log.mock.calls.some((c) => String(c[0]).includes('Season 2026 closed') && String(c[0]).includes('u1'))).toBe(true);
    expect(mockUserCount).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('skips a repeat run in the same process (catch-up days are harmless)', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await runSeasonalResetIfDue(new Date('2027-01-01T00:05:00Z'));
    mockApplySeasonalReset.mockClear();
    await expect(runSeasonalResetIfDue(new Date('2027-01-02T00:05:00Z'))).resolves.toBe('skipped_already_recorded');
    expect(mockApplySeasonalReset).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('still completes the boundary when the closing-season snapshot query fails', async () => {
    mockGroupBy.mockRejectedValueOnce(new Error('db down'));
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(runSeasonalResetIfDue(new Date('2027-01-01T00:05:00Z'))).resolves.toBe('recorded');
    expect(mockApplySeasonalReset).toHaveBeenCalledTimes(1);
    log.mockRestore();
    err.mockRestore();
  });

  it('registers a UTC cron for Jan 1-7', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    startSeasonalResetJob();
    expect((cron.schedule as jest.Mock).mock.calls[0][0]).toBe('5 0 1-7 1 *');
    expect((cron.schedule as jest.Mock).mock.calls[0][2]).toEqual({ timezone: 'UTC' });
    log.mockRestore();
  });
});
