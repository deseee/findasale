/**
 * Sale Passport (feature #29 rebuild, 2026-09-29): stamp derivation, idempotency, milestones,
 * legacy tally. Prisma is fully mocked, so this needs no database.
 *
 * NOT EXECUTED at authoring time (jest could not be run in the authoring environment).
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    saleCheckin: { findMany: jest.fn() },
    purchase: { findMany: jest.fn(), findFirst: jest.fn() },
    review: { findFirst: jest.fn() },
    favorite: { count: jest.fn(), findFirst: jest.fn() },
    uGCPhoto: { findMany: jest.fn() },
    boostPurchase: { findFirst: jest.fn() },
    referralReward: { findMany: jest.fn(), findFirst: jest.fn() },
    shopperPassportStamp: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    stampMilestone: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    shopperStamp: { upsert: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import {
  awardStamp,
  awardStampDetailed,
  awardReferralStampForReferee,
  evaluatePassport,
  getPassport,
  markPassportSeen,
  monthKey,
  placeInfo,
  seasonKey,
  PASSPORT_STAMPS,
  PASSPORT_MILESTONES,
} from '../services/loyaltyService';

const db = prisma as any;

const pawPaw = { title: 'Paw Paw Estate', city: 'Paw Paw', state: 'MI', zip: '49079' };
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function resetMocks() {
  jest.clearAllMocks();
  db.saleCheckin.findMany.mockResolvedValue([]);
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.findFirst.mockResolvedValue(null);
  db.review.findFirst.mockResolvedValue(null);
  db.favorite.count.mockResolvedValue(0);
  db.favorite.findFirst.mockResolvedValue(null);
  db.uGCPhoto.findMany.mockResolvedValue([]);
  db.boostPurchase.findFirst.mockResolvedValue(null);
  db.referralReward.findMany.mockResolvedValue([]);
  db.referralReward.findFirst.mockResolvedValue(null);
  db.shopperPassportStamp.findMany.mockResolvedValue([]);
  db.shopperPassportStamp.create.mockImplementation(async ({ data }: any) => ({ id: `row-${data.dedupeKey}`, ...data }));
  db.shopperPassportStamp.updateMany.mockResolvedValue({ count: 0 });
  db.stampMilestone.findMany.mockResolvedValue([]);
  db.stampMilestone.create.mockResolvedValue({});
  db.stampMilestone.findUnique.mockResolvedValue(null);
  db.stampMilestone.updateMany.mockResolvedValue({ count: 0 });
  db.shopperStamp.upsert.mockResolvedValue({});
  db.shopperStamp.findMany.mockResolvedValue([]);
}

const createdKeys = () => db.shopperPassportStamp.create.mock.calls.map((c: any[]) => c[0].data.dedupeKey);

describe('pure helpers', () => {
  it('monthKey is a UTC calendar month', () => {
    expect(monthKey(new Date('2026-09-15T12:00:00Z'))).toBe('2026-09');
  });

  it('seasonKey keys winter by the December year', () => {
    expect(seasonKey(new Date('2026-03-01T00:00:00Z'))).toBe('2026-SPRING');
    expect(seasonKey(new Date('2026-07-04T00:00:00Z'))).toBe('2026-SUMMER');
    expect(seasonKey(new Date('2026-09-29T00:00:00Z'))).toBe('2026-FALL');
    expect(seasonKey(new Date('2026-12-05T00:00:00Z'))).toBe('2026-WINTER');
    expect(seasonKey(new Date('2027-01-15T00:00:00Z'))).toBe('2026-WINTER');
    expect(seasonKey(new Date('2027-02-28T00:00:00Z'))).toBe('2026-WINTER');
  });

  it('placeInfo builds city, region (state + zip3) and label', () => {
    expect(placeInfo(pawPaw)).toEqual({ cityKey: 'paw paw|MI', regionKey: 'MI-490', placeLabel: 'Paw Paw, MI' });
    expect(placeInfo(null)).toEqual({ cityKey: null, regionKey: null, placeLabel: null });
    expect(placeInfo({ city: 'Lansing', state: 'mi', zip: '' }).regionKey).toBe('MI-lansing');
  });

  it('defines exactly 12 unique stamps in 4 categories of 3, and 4 milestones', () => {
    expect(PASSPORT_STAMPS).toHaveLength(12);
    expect(new Set(PASSPORT_STAMPS.map((s) => s.key)).size).toBe(12);
    for (const cat of ['VISIT', 'PURCHASE', 'SHARE', 'COMMUNITY']) {
      expect(PASSPORT_STAMPS.filter((s) => s.category === cat)).toHaveLength(3);
    }
    expect(PASSPORT_MILESTONES.map((m) => m.milestone)).toEqual([3, 6, 9, 12]);
  });

  it('copy has no em dashes, "AI", or "estate sale"', () => {
    const text = JSON.stringify([PASSPORT_STAMPS, PASSPORT_MILESTONES]);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text.toLowerCase()).not.toContain('estate sale');
  });
});

describe('attendance stamps', () => {
  beforeEach(resetMocks);

  it('awards First Steps on the first check-in and marks a fresh stamp unseen (toast)', async () => {
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: new Date(), sale: pawPaw }]);
    const res = await evaluatePassport('u1', ['attendance']);
    expect(createdKeys()).toEqual(['FIRST_STEPS']);
    const data = db.shopperPassportStamp.create.mock.calls[0][0].data;
    expect(data.seenAt).toBeNull();
    expect(data.placeLabel).toBe('Paw Paw, MI');
    expect(data.saleId).toBe('s1');
    expect(res.newStamps.map((s) => s.key)).toEqual(['FIRST_STEPS']);
  });

  it('records retroactive stamps silently (seenAt set, no toast)', async () => {
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: daysAgo(40), sale: pawPaw }]);
    await evaluatePassport('u1', ['attendance']);
    const data = db.shopperPassportStamp.create.mock.calls[0][0].data;
    expect(data.seenAt).toBeInstanceOf(Date);
    expect(data.earnedAt.getTime()).toBeLessThan(Date.now() - 30 * 24 * 60 * 60 * 1000);
  });

  it('is idempotent: an already-recorded stamp is never re-created', async () => {
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: new Date(), sale: pawPaw }]);
    db.shopperPassportStamp.findMany.mockResolvedValue([{ stampKey: 'FIRST_STEPS', dedupeKey: 'FIRST_STEPS' }]);
    const res = await evaluatePassport('u1', ['attendance']);
    expect(db.shopperPassportStamp.create).not.toHaveBeenCalled();
    expect(res.newStamps).toEqual([]);
  });

  it('a concurrent duplicate (P2002) is treated as success, not an error', async () => {
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: new Date(), sale: pawPaw }]);
    db.shopperPassportStamp.create.mockRejectedValue({ code: 'P2002' });
    const res = await evaluatePassport('u1', ['attendance']);
    expect(res.newStamps).toEqual([]);
  });

  it('Weekend Warrior needs 5 DIFFERENT sales in one month', async () => {
    const mk = (i: number, saleId: string) => ({ saleId, checkinAt: new Date(Date.UTC(2026, 8, i + 1, 15)), sale: pawPaw });
    db.saleCheckin.findMany.mockResolvedValue([mk(0, 'a'), mk(1, 'b'), mk(2, 'c'), mk(3, 'd')]);
    await evaluatePassport('u1', ['attendance']);
    expect(createdKeys()).not.toContain('WEEKEND_WARRIOR:2026-09');

    resetMocks();
    db.saleCheckin.findMany.mockResolvedValue([mk(0, 'a'), mk(1, 'b'), mk(2, 'c'), mk(3, 'd'), mk(4, 'e')]);
    await evaluatePassport('u1', ['attendance']);
    expect(createdKeys()).toContain('WEEKEND_WARRIOR:2026-09');
  });

  it('Road Tripper needs 3 different areas in one season', async () => {
    const at = (day: number, saleId: string, zip: string) => ({
      saleId,
      checkinAt: new Date(Date.UTC(2026, 8, day, 12)),
      sale: { city: 'X', state: 'MI', zip },
    });
    db.saleCheckin.findMany.mockResolvedValue([at(1, 'a', '49079'), at(2, 'b', '49079'), at(3, 'c', '49079')]);
    await evaluatePassport('u1', ['attendance']);
    expect(createdKeys()).not.toContain('ROAD_TRIPPER:2026-FALL');

    resetMocks();
    db.saleCheckin.findMany.mockResolvedValue([at(1, 'a', '49079'), at(2, 'b', '48933'), at(3, 'c', '49503')]);
    await evaluatePassport('u1', ['attendance']);
    expect(createdKeys()).toContain('ROAD_TRIPPER:2026-FALL');
  });
});

describe('purchase stamps', () => {
  beforeEach(resetMocks);

  const p = (id: string, saleId: string, amount: number, when: Date, pi?: string, orgUser = 'org-user') => ({
    id,
    saleId,
    amount,
    createdAt: when,
    stripePaymentIntentId: pi ?? null,
    squarePaymentId: null,
    sale: { ...pawPaw, organizer: { userId: orgUser } },
  });

  it('First Find on the first purchase', async () => {
    db.purchase.findMany.mockResolvedValue([p('p1', 's1', 10, new Date())]);
    await evaluatePassport('u1', ['purchases']);
    expect(createdKeys()).toContain('FIRST_FIND');
    expect(createdKeys()).not.toContain('TREASURE_HUNTER');
  });

  it('Treasure Hunter on the 5th distinct order; a multi-item cart is ONE order', async () => {
    db.purchase.findMany.mockResolvedValue([
      p('p1', 's1', 5, daysAgo(5), 'pi_A'),
      p('p2', 's1', 5, daysAgo(5), 'pi_A'), // same payment, second item
      p('p3', 's1', 5, daysAgo(4), 'pi_B'),
      p('p4', 's1', 5, daysAgo(3), 'pi_C'),
      p('p5', 's1', 5, daysAgo(2), 'pi_D'),
    ]);
    await evaluatePassport('u1', ['purchases']);
    expect(createdKeys()).not.toContain('TREASURE_HUNTER'); // only 4 distinct orders

    resetMocks();
    db.purchase.findMany.mockResolvedValue([
      p('p1', 's1', 5, daysAgo(5), 'pi_A'),
      p('p3', 's1', 5, daysAgo(4), 'pi_B'),
      p('p4', 's1', 5, daysAgo(3), 'pi_C'),
      p('p5', 's1', 5, daysAgo(2), 'pi_D'),
      p('p6', 's1', 5, daysAgo(1), 'pi_E'),
    ]);
    await evaluatePassport('u1', ['purchases']);
    expect(createdKeys()).toContain('TREASURE_HUNTER');
  });

  it('Lakefront Haul when spend at ONE sale reaches $50 (cumulative), one stamp per sale', async () => {
    db.purchase.findMany.mockResolvedValue([
      p('p1', 's1', 30, daysAgo(3), 'pi_A'),
      p('p2', 's1', 25, daysAgo(2), 'pi_B'),
      p('p3', 's2', 20, daysAgo(1), 'pi_C'),
    ]);
    await evaluatePassport('u1', ['purchases']);
    expect(createdKeys()).toContain('LAKEFRONT_HAUL:s1');
    expect(createdKeys()).not.toContain('LAKEFRONT_HAUL:s2');
  });

  it('ignores purchases at the shopper\'s own organizer sale (no stamp farming)', async () => {
    db.purchase.findMany.mockResolvedValue([p('p1', 's1', 80, new Date(), 'pi_A', 'u1')]);
    await evaluatePassport('u1', ['purchases']);
    expect(db.shopperPassportStamp.create).not.toHaveBeenCalled();
  });

  it('query excludes test transactions and POS', async () => {
    await evaluatePassport('u1', ['purchases']);
    const where = db.purchase.findMany.mock.calls[0][0].where;
    expect(where.isTestTransaction).toBe(false);
    expect(where.source).toEqual({ not: 'POS' });
    expect(where.status).toEqual({ in: ['PAID', 'COMPLETED'] });
  });
});

describe('other derived stamps', () => {
  beforeEach(resetMocks);

  it('Storyteller only from an APPROVED review', async () => {
    db.review.findFirst.mockResolvedValue({ saleId: 's1', createdAt: new Date(), sale: pawPaw });
    await evaluatePassport('u1', ['reviews']);
    expect(createdKeys()).toEqual(['STORYTELLER']);
    expect(db.review.findFirst.mock.calls[0][0].where.moderationStatus).toBe('APPROVED');
  });

  it('Keeper at 10 favorites, with progress below that', async () => {
    db.favorite.count.mockResolvedValue(7);
    const partial = await evaluatePassport('u1', ['favorites']);
    expect(createdKeys()).toEqual([]);
    expect(partial.progress.ITEM_KEEPER).toEqual({ current: 7, target: 10, label: 'saved items' });

    resetMocks();
    db.favorite.count.mockResolvedValue(10);
    db.favorite.findFirst.mockResolvedValue({ createdAt: daysAgo(2) });
    await evaluatePassport('u1', ['favorites']);
    expect(createdKeys()).toEqual(['ITEM_KEEPER']);
  });

  it('Haul Curator and Crowd Favorite from approved haul posts', async () => {
    db.uGCPhoto.findMany.mockResolvedValue([
      { saleId: 's1', likesCount: 3, createdAt: daysAgo(9), updatedAt: daysAgo(9) },
      { saleId: 's2', likesCount: 12, createdAt: daysAgo(4), updatedAt: daysAgo(3) },
    ]);
    await evaluatePassport('u1', ['hauls']);
    expect(createdKeys().sort()).toEqual(['CROWD_FAVORITE', 'HAUL_CURATOR']);
  });

  it('Community Guide from a non-refunded guide publication', async () => {
    db.boostPurchase.findFirst.mockResolvedValue({ createdAt: daysAgo(1) });
    await evaluatePassport('u1', ['guides']);
    expect(createdKeys()).toEqual(['COMMUNITY_GUIDE']);
    expect(db.boostPurchase.findFirst.mock.calls[0][0].where.refundedAt).toBeNull();
  });

  it('Friend Finder once per referred friend who purchased, fraud-gated', async () => {
    db.referralReward.findMany.mockResolvedValue([{ referredUserId: 'f1' }, { referredUserId: 'f2' }]);
    db.purchase.findFirst.mockImplementation(async ({ where }: any) =>
      where.userId === 'f1' ? { createdAt: daysAgo(2), saleId: 's1' } : null
    );
    await evaluatePassport('u1', ['referrals']);
    expect(createdKeys()).toEqual(['FRIEND_FINDER:f1']);
    expect(db.referralReward.findMany.mock.calls[0][0].where.fraudReviewStatus).toEqual({ in: ['CLEAR', 'APPROVED'] });
  });
});

describe('milestones', () => {
  beforeEach(resetMocks);

  it('creates Bronze at 3 distinct stamps and raises a toast when the trigger is fresh', async () => {
    db.shopperPassportStamp.findMany.mockResolvedValue([
      { stampKey: 'FIRST_FIND', dedupeKey: 'FIRST_FIND' },
      { stampKey: 'STORYTELLER', dedupeKey: 'STORYTELLER' },
    ]);
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: new Date(), sale: pawPaw }]);
    const res = await evaluatePassport('u1', ['attendance']);
    expect(db.stampMilestone.create).toHaveBeenCalledTimes(1);
    const data = db.stampMilestone.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', milestone: 3, badgeType: 'BRONZE', seenAt: null });
    expect(res.newMilestones.map((m) => m.badgeType)).toEqual(['BRONZE']);
  });

  it('repeatable stamps never inflate the count (distinct types only)', async () => {
    db.shopperPassportStamp.findMany.mockResolvedValue([
      { stampKey: 'LAKEFRONT_HAUL', dedupeKey: 'LAKEFRONT_HAUL:a' },
      { stampKey: 'LAKEFRONT_HAUL', dedupeKey: 'LAKEFRONT_HAUL:b' },
      { stampKey: 'LAKEFRONT_HAUL', dedupeKey: 'LAKEFRONT_HAUL:c' },
    ]);
    await evaluatePassport('u1', ['reviews']);
    expect(db.stampMilestone.create).not.toHaveBeenCalled();
  });

  it('never re-creates an existing milestone', async () => {
    db.shopperPassportStamp.findMany.mockResolvedValue([
      { stampKey: 'FIRST_FIND', dedupeKey: 'FIRST_FIND' },
      { stampKey: 'STORYTELLER', dedupeKey: 'STORYTELLER' },
      { stampKey: 'ITEM_KEEPER', dedupeKey: 'ITEM_KEEPER' },
    ]);
    db.stampMilestone.findMany.mockResolvedValue([{ milestone: 3 }]);
    await evaluatePassport('u1', ['reviews']);
    expect(db.stampMilestone.create).not.toHaveBeenCalled();
  });

  it('backfilled (retroactive) milestones are silent', async () => {
    db.shopperPassportStamp.findMany.mockResolvedValue([]);
    db.saleCheckin.findMany.mockResolvedValue([{ saleId: 's1', checkinAt: daysAgo(90), sale: pawPaw }]);
    db.review.findFirst.mockResolvedValue({ saleId: 's1', createdAt: daysAgo(80), sale: pawPaw });
    db.favorite.count.mockResolvedValue(10);
    db.favorite.findFirst.mockResolvedValue({ createdAt: daysAgo(70) });
    await evaluatePassport('u1', 'all');
    expect(db.stampMilestone.create).toHaveBeenCalledTimes(1);
    expect(db.stampMilestone.create.mock.calls[0][0].data.seenAt).toBeInstanceOf(Date);
  });
});

describe('legacy tally and award entry points', () => {
  beforeEach(resetMocks);

  it('MAKE_PURCHASE increments the legacy counter by 2 (spec), REFER_FRIEND by 3', async () => {
    await awardStampDetailed('u1', 'MAKE_PURCHASE', 's1', 'purchase-1');
    expect(db.shopperStamp.upsert.mock.calls[0][0]).toMatchObject({
      update: { count: { increment: 2 } },
      create: { userId: 'u1', type: 'MAKE_PURCHASE', count: 2 },
    });
    await awardStampDetailed('u1', 'REFER_FRIEND', undefined, 'friend-1');
    expect(db.shopperStamp.upsert.mock.calls[1][0].update.count.increment).toBe(3);
  });

  it('with a refId the legacy increment is idempotent (ledger P2002 means already counted)', async () => {
    db.shopperPassportStamp.create.mockRejectedValueOnce({ code: 'P2002' });
    await awardStampDetailed('u1', 'MAKE_PURCHASE', 's1', 'purchase-1');
    expect(db.shopperStamp.upsert).not.toHaveBeenCalled();
    const ledger = db.shopperPassportStamp.create.mock.calls[0][0].data;
    expect(ledger).toMatchObject({ stampKey: 'ACTIVITY', dedupeKey: 'ACT:MAKE_PURCHASE:purchase-1' });
  });

  it('legacy 5/20/50 tiers keep working', async () => {
    db.shopperStamp.findMany.mockResolvedValue([{ type: 'MAKE_PURCHASE', count: 6 }]);
    await awardStampDetailed('u1', 'MAKE_PURCHASE', 's1', 'purchase-2');
    const legacy = db.stampMilestone.create.mock.calls.find((c: any[]) => c[0].data.milestone === 5);
    expect(legacy[0].data).toMatchObject({ milestone: 5, badgeType: 'BRONZE' });
  });

  it('awardStamp (backward-compatible wrapper) never throws even when the database does', async () => {
    db.shopperStamp.upsert.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(awardStamp('u1', 'ATTEND_SALE', 's1')).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('referral stamp is skipped unless the referral passed the fraud gate and the friend purchased', async () => {
    await awardReferralStampForReferee('friend-1');
    expect(db.shopperStamp.upsert).not.toHaveBeenCalled();

    db.referralReward.findFirst.mockResolvedValue({ referrerId: 'referrer-1' });
    await awardReferralStampForReferee('friend-1');
    expect(db.shopperStamp.upsert).not.toHaveBeenCalled(); // no qualifying purchase yet

    db.purchase.findFirst.mockResolvedValue({ id: 'p1' });
    await awardReferralStampForReferee('friend-1');
    expect(db.shopperStamp.upsert.mock.calls[0][0].where.userId_type.userId).toBe('referrer-1');
  });

  it('ignores self-referrals', async () => {
    db.referralReward.findFirst.mockResolvedValue({ referrerId: 'friend-1' });
    db.purchase.findFirst.mockResolvedValue({ id: 'p1' });
    await awardReferralStampForReferee('friend-1');
    expect(db.shopperStamp.upsert).not.toHaveBeenCalled();
  });
});

describe('read model', () => {
  beforeEach(resetMocks);

  it('getPassport keeps the legacy fields and adds the Sale Passport', async () => {
    db.shopperStamp.findMany.mockResolvedValue([{ type: 'MAKE_PURCHASE', count: 2 }]);
    db.stampMilestone.findMany.mockImplementation(async ({ where }: any) =>
      where.milestone ? [] : [{ milestone: 5, badgeType: 'BRONZE', earnedAt: new Date(), seenAt: new Date() }]
    );
    const rows = [
      { id: 'r1', stampKey: 'FIRST_STEPS', dedupeKey: 'FIRST_STEPS', earnedAt: daysAgo(3), seenAt: null, placeLabel: 'Paw Paw, MI', saleId: 's1' },
    ];
    db.shopperPassportStamp.findMany.mockImplementation(async ({ where }: any) =>
      where.stampKey ? rows : rows.map((r) => ({ stampKey: r.stampKey, dedupeKey: r.dedupeKey }))
    );
    const res = await getPassport('u1');

    // legacy
    expect(res.stamps).toEqual([{ type: 'MAKE_PURCHASE', count: 2 }]);
    expect(res.totalStamps).toBe(2);
    expect(res.nextMilestone).toBe('BRONZE');
    expect(res.stampsToNextMilestone).toBe(3);
    expect(res.milestones.map((m) => m.milestone)).toEqual([5]);

    // new
    expect(res.passport.name).toBe('Sale Passport');
    expect(res.passport.totalSlots).toBe(12);
    expect(res.passport.earnedSlots).toBe(1);
    expect(res.passport.slots).toHaveLength(12);
    const first = res.passport.slots.find((s) => s.key === 'FIRST_STEPS')!;
    expect(first).toMatchObject({ earned: true, timesEarned: 1, latestPlaceLabel: 'Paw Paw, MI', unseen: true });
    expect(res.passport.next).toMatchObject({ milestone: 3, badgeType: 'BRONZE', stampsToGo: 2 });
    expect(res.passport.unseen.stamps.map((s) => s.key)).toEqual(['FIRST_STEPS']);
    expect(res.passport.activity).toMatchObject({ total: 2, tier: 'BRONZE' });
  });
});

describe('markPassportSeen', () => {
  beforeEach(resetMocks);

  it('is scoped to the caller and to the passed ids', async () => {
    await markPassportSeen('u1', { stampIds: ['a', 'b'], milestones: [3, 99] });
    const stampWhere = db.shopperPassportStamp.updateMany.mock.calls[0][0].where;
    expect(stampWhere).toMatchObject({ userId: 'u1', seenAt: null, id: { in: ['a', 'b'] } });
    const msWhere = db.stampMilestone.updateMany.mock.calls[0][0].where;
    expect(msWhere).toMatchObject({ userId: 'u1', seenAt: null, milestone: { in: [3] } });
  });

  it('all:true marks every unseen row for that user only', async () => {
    await markPassportSeen('u1', { all: true });
    expect(db.shopperPassportStamp.updateMany.mock.calls[0][0].where).toEqual({ userId: 'u1', seenAt: null });
  });
});
