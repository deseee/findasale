/**
 * Smart-tag quota tracker: ATOMIC reserve-then-refund (2026-09-29 hardening).
 * The organizer table is an in-memory fake whose updateMany evaluates the same conditional predicate the
 * real UPDATE uses, one statement at a time (as Postgres does under the row lock). No database.
 */
type Org = { id: string; aiTagsUsedThisMonth: number; aiTagsResetAt: Date | null };
const orgs = new Map<string, Org>();

const cmp = (val: number, cond: any): boolean => {
  if (typeof cond === 'number') return val === cond;
  if ('lte' in cond && !(val <= cond.lte)) return false;
  if ('gte' in cond && !(val >= cond.gte)) return false;
  return true;
};
const dateMatch = (val: Date | null, cond: any): boolean => {
  if (cond === null) return val === null;
  if ('lt' in cond) return val !== null && val < cond.lt;
  if ('gte' in cond) return val !== null && val >= cond.gte;
  return false;
};
const matches = (o: Org, where: any): boolean => {
  if (where.id !== undefined && o.id !== where.id) return false;
  if (where.aiTagsUsedThisMonth !== undefined && !cmp(o.aiTagsUsedThisMonth, where.aiTagsUsedThisMonth)) return false;
  if (where.aiTagsResetAt !== undefined && !dateMatch(o.aiTagsResetAt, where.aiTagsResetAt)) return false;
  if (where.OR && !where.OR.some((c: any) => c.aiTagsResetAt !== undefined && dateMatch(o.aiTagsResetAt, c.aiTagsResetAt))) return false;
  return true;
};
const mockUpdateMany = jest.fn(async ({ where, data }: any) => {
  let count = 0;
  for (const o of orgs.values()) {
    if (!matches(o, where)) continue;
    count += 1;
    const u = data.aiTagsUsedThisMonth;
    if (typeof u === 'number') o.aiTagsUsedThisMonth = u;
    else if (u?.increment) o.aiTagsUsedThisMonth += u.increment;
    else if (u?.decrement) o.aiTagsUsedThisMonth -= u.decrement;
    if (data.aiTagsResetAt) o.aiTagsResetAt = data.aiTagsResetAt;
  }
  return { count };
});
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: {
      updateMany: (...a: any[]) => (mockUpdateMany as any)(...a),
      findUnique: async ({ where }: any) => (orgs.has(where.id) ? { aiTagsUsedThisMonth: orgs.get(where.id)!.aiTagsUsedThisMonth } : null),
      update: async ({ where, data }: any) => {
        const o = orgs.get(where.id)!;
        if (data.aiTagsUsedThisMonth?.increment) o.aiTagsUsedThisMonth += data.aiTagsUsedThisMonth.increment;
        return { aiTagsUsedThisMonth: o.aiTagsUsedThisMonth };
      },
    },
  },
}));

import {
  reserveAiTags,
  refundAiTags,
  checkAiTagQuota,
  getCachedAiTagQuotaForDisplay,
  normalizeTier,
} from '../lib/aiTagsQuotaTracker';

const monthStart = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};
const seed = (used: number, resetAt: Date | null = monthStart()) => orgs.set('org1', { id: 'org1', aiTagsUsedThisMonth: used, aiTagsResetAt: resetAt });

beforeEach(() => {
  orgs.clear();
  mockUpdateMany.mockClear();
});

describe('normalizeTier', () => {
  it('keeps real tiers and degrades anything else (including prototype keys) to SIMPLE', () => {
    expect(normalizeTier('PRO')).toBe('PRO');
    expect(normalizeTier('TEAMS')).toBe('TEAMS');
    expect(normalizeTier('nope')).toBe('SIMPLE');
    expect(normalizeTier('constructor')).toBe('SIMPLE');
    expect(normalizeTier(undefined)).toBe('SIMPLE');
  });
});

describe('reserveAiTags (atomic)', () => {
  it('reserves when enough remain and reports ok', async () => {
    seed(10);
    const r = await reserveAiTags('org1', 'SIMPLE', 5);
    expect(r).toMatchObject({ ok: true, reserved: 5, limit: 100 });
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(15);
  });

  it('allows exactly the last tag and refuses the next (limit 100)', async () => {
    seed(99);
    expect((await reserveAiTags('org1', 'SIMPLE', 1)).ok).toBe(true);
    const denied = await reserveAiTags('org1', 'SIMPLE', 1);
    expect(denied).toMatchObject({ ok: false, reserved: 0, used: 100, limit: 100, remaining: 0, exceeded: true });
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(100);
  });

  it('refuses a request bigger than what remains without reserving a partial amount', async () => {
    seed(97);
    const r = await reserveAiTags('org1', 'SIMPLE', 8);
    expect(r).toMatchObject({ ok: false, reserved: 0, used: 97, remaining: 3, exceeded: false });
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(97);
  });

  it('20 parallel single-tag reservations with 5 left admit exactly 5 (no check-then-increment race)', async () => {
    seed(95);
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveAiTags('org1', 'SIMPLE', 1)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(100);
  });

  it('the guard is in the UPDATE predicate itself (used <= limit - n), not a prior read', async () => {
    seed(0);
    await reserveAiTags('org1', 'SIMPLE', 3);
    const spend = mockUpdateMany.mock.calls.map((c: any[]) => c[0]).find((a: any) => a.data.aiTagsUsedThisMonth?.increment);
    expect(spend.where.aiTagsUsedThisMonth).toEqual({ lte: 97 });
    expect(spend.data.aiTagsUsedThisMonth).toEqual({ increment: 3 });
  });

  it('TEAMS (unlimited) always reserves but still counts usage', async () => {
    seed(5000);
    const r = await reserveAiTags('org1', 'TEAMS', 4);
    expect(r.ok).toBe(true);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(5004);
  });

  it('an unknown organizer is refused (nothing reserved) and surfaces as a thrown lookup', async () => {
    await expect(reserveAiTags('ghost', 'SIMPLE', 1)).rejects.toThrow(/not found/);
  });

  it('resets a stale or null month exactly once, in a guarded update', async () => {
    seed(80, new Date(Date.UTC(2020, 0, 1)));
    const r = await reserveAiTags('org1', 'SIMPLE', 1);
    expect(r.ok).toBe(true);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(1); // reset to 0, then reserved 1
    expect(orgs.get('org1')!.aiTagsResetAt!.getTime()).toBe(monthStart().getTime());
    seed(7, null);
    await reserveAiTags('org1', 'SIMPLE', 1);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(1);
  });

  it('clamps a nonsense unit count to at least 1', async () => {
    seed(0);
    const r = await reserveAiTags('org1', 'SIMPLE', NaN);
    expect(r.reserved).toBe(1);
  });
});

describe('refundAiTags', () => {
  it('hands back reserved tags and never goes below zero', async () => {
    seed(5);
    expect(await refundAiTags('org1', 2)).toBe(1);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(3);
    expect(await refundAiTags('org1', 10)).toBe(0); // predicate used >= n fails: nothing changes
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(3);
  });

  it('never touches a counter that already rolled into a new month', async () => {
    seed(5, new Date(Date.UTC(2020, 0, 1)));
    expect(await refundAiTags('org1', 1)).toBe(0);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(5);
  });

  it('ignores zero, negative and non-finite refunds', async () => {
    seed(5);
    expect(await refundAiTags('org1', 0)).toBe(0);
    expect(await refundAiTags('org1', -3)).toBe(0);
    expect(await refundAiTags('org1', NaN)).toBe(0);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(5);
  });

  it('reserve then refund round-trips to the starting count', async () => {
    seed(40);
    await reserveAiTags('org1', 'SIMPLE', 6);
    await refundAiTags('org1', 6);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(40);
  });
});

describe('cache is display-only', () => {
  it('a cached display value never allows or denies a reservation', async () => {
    seed(0);
    await getCachedAiTagQuotaForDisplay('org1', 'SIMPLE'); // primes the cache with used=0
    orgs.get('org1')!.aiTagsUsedThisMonth = 100; // another instance spent everything
    const stale = await getCachedAiTagQuotaForDisplay('org1', 'SIMPLE');
    expect(stale.used).toBe(0); // display may be a few seconds stale...
    const r = await reserveAiTags('org1', 'SIMPLE', 1);
    expect(r.ok).toBe(false); // ...but the decision reads the database
  });

  it('checkAiTagQuota always reads fresh', async () => {
    seed(3);
    expect((await checkAiTagQuota('org1', 'SIMPLE')).used).toBe(3);
    orgs.get('org1')!.aiTagsUsedThisMonth = 50;
    expect((await checkAiTagQuota('org1', 'SIMPLE')).used).toBe(50);
  });
});
