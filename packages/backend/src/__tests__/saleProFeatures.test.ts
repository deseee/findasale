/**
 * $9.99 a-la-carte sale upgrade (2026-10-23): the one shared entitlement rule (lib/saleProFeatures.ts), the route gate
 * that uses it (middleware/requireTier.requireTierOrSaleUpgrade) and the per-sale 500 auto-tag allowance
 * (lib/aiTagsQuotaTracker.ts). Prisma is an in-memory fake whose updateMany evaluates the same conditional predicate
 * as the real UPDATE. No database, no network.
 *
 * Security invariants covered: per sale only (another sale of the same organizer gets nothing), owner only (another
 * organizer, or a SIMPLE organizer who is staff elsewhere, gets nothing), both payment columns required.
 */
type SaleRow = { id: string; organizerId: string; purchaseModel: string; alaCarteFeePaid: boolean };
type OrgRow = { id: string; aiTagsUsedThisMonth: number; aiTagsResetAt: Date | null };
const sales = new Map<string, SaleRow>();
const orgs = new Map<string, OrgRow>();
const usage = new Map<string, number>();
let usageTableMissing = false;

const numMatch = (val: number, cond: any): boolean => {
  if (cond === undefined) return true;
  if (typeof cond === 'number') return val === cond;
  if ('lte' in cond && !(val <= cond.lte)) return false;
  if ('gte' in cond && !(val >= cond.gte)) return false;
  return true;
};
const missing = () => Object.assign(new Error('The table `public.SaleAiTagUsage` does not exist in the current database.'), { code: 'P2021' });

jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: {
      findUnique: async ({ where }: any) => {
        const s = sales.get(where.id);
        return s ? { ...s } : null;
      },
    },
    organizer: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const o of orgs.values()) {
          if (where.id !== undefined && o.id !== where.id) continue;
          if (!numMatch(o.aiTagsUsedThisMonth, where.aiTagsUsedThisMonth)) continue;
          if (where.OR && !(o.aiTagsResetAt === null || o.aiTagsResetAt < where.OR[1].aiTagsResetAt.lt)) continue;
          if (where.aiTagsResetAt?.gte && !(o.aiTagsResetAt && o.aiTagsResetAt >= where.aiTagsResetAt.gte)) continue;
          count += 1;
          const u = data.aiTagsUsedThisMonth;
          if (typeof u === 'number') o.aiTagsUsedThisMonth = u;
          else if (u?.increment) o.aiTagsUsedThisMonth += u.increment;
          else if (u?.decrement) o.aiTagsUsedThisMonth -= u.decrement;
          if (data.aiTagsResetAt) o.aiTagsResetAt = data.aiTagsResetAt;
        }
        return { count };
      },
      findUnique: async ({ where }: any) => (orgs.has(where.id) ? { aiTagsUsedThisMonth: orgs.get(where.id)!.aiTagsUsedThisMonth } : null),
      update: async ({ where, data }: any) => {
        const o = orgs.get(where.id)!;
        if (data.aiTagsUsedThisMonth?.increment) o.aiTagsUsedThisMonth += data.aiTagsUsedThisMonth.increment;
        return { aiTagsUsedThisMonth: o.aiTagsUsedThisMonth };
      },
    },
    saleAiTagUsage: {
      createMany: async ({ data }: any) => {
        if (usageTableMissing) throw missing();
        let count = 0;
        for (const row of data) if (!usage.has(row.saleId)) { usage.set(row.saleId, 0); count += 1; }
        return { count };
      },
      updateMany: async ({ where, data }: any) => {
        if (usageTableMissing) throw missing();
        if (!usage.has(where.saleId) || !numMatch(usage.get(where.saleId)!, where.tagsUsed)) return { count: 0 };
        const cur = usage.get(where.saleId)!;
        if (data.tagsUsed?.increment) usage.set(where.saleId, cur + data.tagsUsed.increment);
        if (data.tagsUsed?.decrement) usage.set(where.saleId, cur - data.tagsUsed.decrement);
        return { count: 1 };
      },
      findUnique: async ({ where }: any) => {
        if (usageTableMissing) throw missing();
        return usage.has(where.saleId) ? { tagsUsed: usage.get(where.saleId) } : null;
      },
    },
  },
}));

import {
  ALA_CARTE_AI_TAGS_PER_SALE,
  isPaidAlaCarteSale,
  saleHasAlaCarteUpgrade,
  saleHasProFeatures,
  effectiveTierForSale,
} from '../lib/saleProFeatures';
import { requireTierOrSaleUpgrade } from '../middleware/requireTier';
import { reserveAiTags, refundAiTags, checkAiTagQuota, incrementAiTagCount } from '../lib/aiTagsQuotaTracker';
import { checkAITagLimit } from '../lib/tierEnforcement';

const monthStart = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};

beforeEach(() => {
  sales.clear();
  orgs.clear();
  usage.clear();
  usageTableMissing = false;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // org1 (SIMPLE) owns s_paid (upgraded) and s_free (not upgraded). org2 owns s_other (upgraded).
  sales.set('s_paid', { id: 's_paid', organizerId: 'org1', purchaseModel: 'ALA_CARTE', alaCarteFeePaid: true });
  sales.set('s_free', { id: 's_free', organizerId: 'org1', purchaseModel: 'SUBSCRIPTION', alaCarteFeePaid: false });
  sales.set('s_half', { id: 's_half', organizerId: 'org1', purchaseModel: 'ALA_CARTE', alaCarteFeePaid: false });
  sales.set('s_other', { id: 's_other', organizerId: 'org2', purchaseModel: 'ALA_CARTE', alaCarteFeePaid: true });
  orgs.set('org1', { id: 'org1', aiTagsUsedThisMonth: 0, aiTagsResetAt: monthStart() });
  orgs.set('org2', { id: 'org2', aiTagsUsedThisMonth: 0, aiTagsResetAt: monthStart() });
});

describe('saleProFeatures (shared entitlement rule)', () => {
  const org1 = { id: 'org1', subscriptionTier: 'SIMPLE' };
  it('needs both payment columns', () => {
    expect(isPaidAlaCarteSale(sales.get('s_paid'))).toBe(true);
    expect(isPaidAlaCarteSale(sales.get('s_half'))).toBe(false);
    expect(isPaidAlaCarteSale(sales.get('s_free'))).toBe(false);
    expect(isPaidAlaCarteSale(null)).toBe(false);
  });
  it('is per sale and owner only', () => {
    expect(saleHasProFeatures(sales.get('s_paid'), org1)).toBe(true);
    expect(saleHasProFeatures(sales.get('s_free'), org1)).toBe(false); // same organizer, other sale
    expect(saleHasProFeatures(sales.get('s_other'), org1)).toBe(false); // someone else's upgraded sale
    expect(saleHasProFeatures(sales.get('s_paid'), { id: 'org2', subscriptionTier: 'PRO' })).toBe(false); // PRO, not the owner
    expect(saleHasProFeatures(sales.get('s_paid'), { id: '', subscriptionTier: 'SIMPLE' })).toBe(false);
    expect(saleHasAlaCarteUpgrade(sales.get('s_paid'), org1)).toBe(true);
  });
  it('PRO/TEAMS own sales always have the features', () => {
    expect(saleHasProFeatures(sales.get('s_free'), { id: 'org1', subscriptionTier: 'PRO' })).toBe(true);
    expect(saleHasProFeatures(sales.get('s_free'), { id: 'org1', subscriptionTier: 'TEAMS' })).toBe(true);
  });
  it('effective tier lifts SIMPLE on the upgraded sale only and never lowers a paid tier', () => {
    expect(effectiveTierForSale(sales.get('s_paid'), org1)).toBe('PRO');
    expect(effectiveTierForSale(sales.get('s_free'), org1)).toBe('SIMPLE');
    expect(effectiveTierForSale(sales.get('s_other'), org1)).toBe('SIMPLE');
    expect(effectiveTierForSale(null, org1)).toBe('SIMPLE');
    expect(effectiveTierForSale(sales.get('s_paid'), { id: 'org1', subscriptionTier: 'TEAMS' })).toBe('TEAMS');
  });
});

describe('requireTierOrSaleUpgrade', () => {
  async function run(user: any, saleId: string | null, minTier: 'PRO' | 'TEAMS' = 'PRO') {
    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(b: any) { this.body = b; return this; },
    };
    const next = jest.fn();
    await requireTierOrSaleUpgrade(minTier, () => saleId)({ user, params: {} } as any, res, next);
    return { res, next };
  }
  const simple1 = { organizerProfile: { id: 'org1', subscriptionTier: 'SIMPLE' } };

  it('lets a SIMPLE owner through for their upgraded sale', async () => {
    const { next } = await run(simple1, 's_paid');
    expect(next).toHaveBeenCalled();
  });
  it('blocks the same organizer on a sale without the upgrade', async () => {
    const { res, next } = await run(simple1, 's_free');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TIER_REQUIRED');
  });
  it('blocks another organizer on an upgraded sale (no borrowing the owner upgrade)', async () => {
    const { res, next } = await run(simple1, 's_other');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
  it('blocks a half-written row, an unknown sale and a missing sale id', async () => {
    for (const id of ['s_half', 'nope', null]) {
      const { res, next } = await run(simple1, id);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    }
  });
  it('PRO passes without a sale lookup; no organizer profile is 403; TEAMS-only features are never unlocked', async () => {
    expect((await run({ organizerProfile: { id: 'org2', subscriptionTier: 'PRO' } }, null)).next).toHaveBeenCalled();
    const anon = await run({ id: 'shopper' }, 's_paid');
    expect(anon.next).not.toHaveBeenCalled();
    expect(anon.res.body.code).toBe('ORGANIZER_PROFILE_REQUIRED');
    const teams = await run(simple1, 's_paid', 'TEAMS');
    expect(teams.next).not.toHaveBeenCalled();
    expect(teams.res.statusCode).toBe(403);
  });
});

describe('per-sale 500 auto tags', () => {
  it('an upgraded sale spends its own allowance first and leaves the monthly allowance alone', async () => {
    const r = await reserveAiTags('org1', 'SIMPLE', 5, 's_paid');
    expect(r).toMatchObject({ ok: true, reserved: 5, bucket: 'SALE', saleId: 's_paid', limit: ALA_CARTE_AI_TAGS_PER_SALE });
    expect(usage.get('s_paid')).toBe(5);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(0);
    await refundAiTags('org1', 2, r);
    expect(usage.get('s_paid')).toBe(3);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(0);
  });

  it('other sales of the same organizer, and other organizers, use the monthly allowance only', async () => {
    const free = await reserveAiTags('org1', 'SIMPLE', 4, 's_free');
    expect(free).toMatchObject({ ok: true, bucket: 'MONTHLY', saleId: null });
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(4);
    const crossOrg = await reserveAiTags('org1', 'SIMPLE', 1, 's_other'); // org1 naming org2's upgraded sale
    expect(crossOrg.bucket).toBe('MONTHLY');
    expect(usage.has('s_other')).toBe(false);
    const half = await reserveAiTags('org1', 'SIMPLE', 1, 's_half');
    expect(half.bucket).toBe('MONTHLY');
    expect(usage.has('s_half')).toBe(false);
  });

  it('stops at 500 and then falls back to the monthly allowance', async () => {
    usage.set('s_paid', ALA_CARTE_AI_TAGS_PER_SALE - 2);
    const last = await reserveAiTags('org1', 'SIMPLE', 2, 's_paid');
    expect(last.bucket).toBe('SALE');
    expect(usage.get('s_paid')).toBe(ALA_CARTE_AI_TAGS_PER_SALE);
    const over = await reserveAiTags('org1', 'SIMPLE', 1, 's_paid');
    expect(over.bucket).toBe('MONTHLY');
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(1);
  });

  it('parallel reservations never spend more than the 500', async () => {
    usage.set('s_paid', ALA_CARTE_AI_TAGS_PER_SALE - 3);
    const rs = await Promise.all(Array.from({ length: 10 }, () => reserveAiTags('org1', 'SIMPLE', 1, 's_paid')));
    expect(rs.filter((r) => r.bucket === 'SALE').length).toBe(3);
    expect(usage.get('s_paid')).toBe(ALA_CARTE_AI_TAGS_PER_SALE);
  });

  it('quota status adds the sale allowance only for the upgraded sale', async () => {
    orgs.get('org1')!.aiTagsUsedThisMonth = 100; // monthly SIMPLE allowance used up
    const paid = await checkAiTagQuota('org1', 'SIMPLE', 's_paid');
    expect(paid.exceeded).toBe(false);
    expect(paid.remaining).toBe(ALA_CARTE_AI_TAGS_PER_SALE);
    expect(paid.sale).toMatchObject({ saleId: 's_paid', used: 0, limit: 500 });
    const free = await checkAiTagQuota('org1', 'SIMPLE', 's_free');
    expect(free.exceeded).toBe(true);
    expect(free.sale).toBeUndefined();
    const lim = await checkAITagLimit('org1', 'SIMPLE', 's_paid');
    expect(lim.isOverLimit).toBe(false);
  });

  it('post-hoc counting charges the upgraded sale, otherwise the month', async () => {
    await incrementAiTagCount('org1', 3, 's_paid');
    expect(usage.get('s_paid')).toBe(3);
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(0);
    await incrementAiTagCount('org1', 2, 's_free');
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(2);
  });

  it('a missing SaleAiTagUsage table (migration not applied) falls back to the metered monthly allowance', async () => {
    usageTableMissing = true;
    const r = await reserveAiTags('org1', 'SIMPLE', 2, 's_paid');
    expect(r).toMatchObject({ ok: true, bucket: 'MONTHLY' });
    expect(orgs.get('org1')!.aiTagsUsedThisMonth).toBe(2);
  });
});
