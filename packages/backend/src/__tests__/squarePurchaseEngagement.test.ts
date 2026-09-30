/**
 * Square purchase engagement awards (2026-09-29, Sale Passport wiring): idempotency, one-award-per-
 * payment for carts, skip rules, and the never-throw guarantee. Prisma and every award service are
 * mocked, so this needs no database and makes no real Square or Stripe call.
 *
 * NOT EXECUTED at authoring time (jest could not be run in the authoring environment).
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    pointsTransaction: { findFirst: jest.fn() },
    referral: { findUnique: jest.fn() },
    referralReward: { findFirst: jest.fn(), update: jest.fn() },
    organizerReferral: { findUnique: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock('../services/loyaltyService', () => ({
  awardStamp: jest.fn(),
  awardReferralStampForReferee: jest.fn(),
}));
jest.mock('../services/achievementService', () => ({ checkAndAward: jest.fn() }));
jest.mock('../services/xpService', () => ({
  awardXp: jest.fn(),
  applyHuntPassMultiplier: jest.fn(),
  XP_AWARDS: {
    PURCHASE: 10,
    FIRST_PURCHASE_EVER: 50,
    ORG_SHOPPER_SIGNUP: 10,
    REFERRAL_FIRST_PURCHASE: 500,
    ORGANIZER_REFERRAL_PURCHASE: 500,
  },
}));
jest.mock('../services/badgeService', () => ({ checkAndAwardOgBuyer: jest.fn() }));
jest.mock('../services/referralTrancheService', () => ({
  referralTrancheService: { recordFirstPurchase: jest.fn(), recordOwnReferralSuccess: jest.fn() },
}));
jest.mock('../services/referralFraudService', () => ({
  evaluateReferralFraud: jest.fn(),
  getAccountAgeDays: jest.fn(() => 30),
  MIN_ACCOUNT_AGE_DAYS: 7,
}));

import { prisma } from '../lib/prisma';
import { awardStamp, awardReferralStampForReferee } from '../services/loyaltyService';
import { checkAndAward } from '../services/achievementService';
import { awardXp, applyHuntPassMultiplier } from '../services/xpService';
import { checkAndAwardOgBuyer } from '../services/badgeService';
import {
  awardSquarePurchaseEngagement,
  fireSquarePurchaseEngagement,
} from '../services/squarePurchaseEngagementService';

const db = prisma as any;
const mAwardXp = awardXp as jest.Mock;
const mStamp = awardStamp as jest.Mock;
const mRefStamp = awardReferralStampForReferee as jest.Mock;
const mAchievement = checkAndAward as jest.Mock;
const mOg = checkAndAwardOgBuyer as jest.Mock;
const mMultiplier = applyHuntPassMultiplier as jest.Mock;

type Row = Record<string, any>;
function purchaseRow(over: Row = {}): Row {
  return {
    id: 'p1',
    userId: 'u1',
    saleId: 's1',
    itemId: 'i1',
    status: 'PAID',
    source: 'ONLINE',
    isTestTransaction: false,
    squarePaymentId: 'sqpay1',
    createdAt: new Date('2026-09-29T12:00:00Z'),
    sale: { id: 's1', organizer: { userId: 'orgU' } },
    ...over,
  };
}

let rows: Row[];
let warnSpy: jest.SpyInstance;

function setupDb(all: Row[]) {
  rows = all;
  db.purchase.findUnique.mockImplementation(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null);
  db.purchase.findMany.mockImplementation(async ({ where }: any) =>
    rows
      .filter((r) => r.squarePaymentId === where.squarePaymentId && r.userId === where.userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((r) => ({ id: r.id, status: r.status, amount: r.amount }))
  );
  db.purchase.count.mockResolvedValue(3); // shopper has other paid purchases: not a first purchase
  db.pointsTransaction.findFirst.mockResolvedValue(null);
  db.referral.findUnique.mockResolvedValue(null);
  db.referralReward.findFirst.mockResolvedValue(null);
  db.organizerReferral.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ createdAt: new Date('2026-01-01') });
}

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mMultiplier.mockImplementation(async (_u: string, base: number) => base);
  mAwardXp.mockResolvedValue({ newXp: 10 });
  mStamp.mockResolvedValue(undefined);
  mRefStamp.mockResolvedValue(undefined);
  mAchievement.mockResolvedValue([]);
  mOg.mockResolvedValue(null);
  setupDb([purchaseRow()]);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('awardSquarePurchaseEngagement: awards', () => {
  it('awards purchase XP with a 72h hold, the passport stamp keyed by purchase id, referral stamp, achievement and OG badge', async () => {
    await awardSquarePurchaseEngagement('p1');

    expect(mAwardXp).toHaveBeenCalledTimes(1);
    const [userId, type, amount, ctx] = mAwardXp.mock.calls[0];
    expect(userId).toBe('u1');
    expect(type).toBe('PURCHASE_COMPLETED');
    expect(amount).toBe(10);
    expect(ctx.purchaseId).toBe('p1');
    expect(ctx.saleId).toBe('s1');
    expect(ctx.preMultipliedHuntPassXp).toBe(true);
    expect(ctx.holdUntil.getTime()).toBeGreaterThan(Date.now() + 71 * 60 * 60 * 1000);

    expect(mStamp).toHaveBeenCalledWith('u1', 'MAKE_PURCHASE', 's1', 'p1');
    expect(mRefStamp).toHaveBeenCalledWith('u1');
    expect(mAchievement).toHaveBeenCalledWith('u1', 'PURCHASE_MADE');
    expect(mOg).toHaveBeenCalledWith('u1', 's1', 'p1');
  });

  it('awards the first-purchase milestone and organizer signup XP only for a genuine first purchase', async () => {
    db.purchase.count.mockResolvedValue(0);
    await awardSquarePurchaseEngagement('p1');
    const types = mAwardXp.mock.calls.map((c) => c[1]);
    expect(types).toEqual(expect.arrayContaining(['PURCHASE_COMPLETED', 'FIRST_PURCHASE_EVER', 'ORG_SHOPPER_SIGNUP']));
    const orgCall = mAwardXp.mock.calls.find((c) => c[1] === 'ORG_SHOPPER_SIGNUP');
    expect(orgCall![0]).toBe('orgU');
  });

  it('does not award first-purchase milestones when the shopper already has other paid purchases', async () => {
    await awardSquarePurchaseEngagement('p1');
    const types = mAwardXp.mock.calls.map((c) => c[1]);
    expect(types).toEqual(['PURCHASE_COMPLETED']);
  });
});

describe('awardSquarePurchaseEngagement: idempotency', () => {
  it('does not award XP twice when a PURCHASE_COMPLETED transaction already references this purchase', async () => {
    db.pointsTransaction.findFirst.mockResolvedValue({ id: 'pt1' });
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).not.toHaveBeenCalled();
    // The stamp is still requested; awardStamp is itself idempotent via ACT:MAKE_PURCHASE:<id>.
    expect(mStamp).toHaveBeenCalledTimes(1);
    expect(mStamp.mock.calls[0][3]).toBe('p1');
  });

  it('webhook + sync response firing back to back awards XP once and uses the same stamp ref id both times', async () => {
    // Model the real ledger: the first XP award writes the row the second call's dedupe check sees.
    let ledgerHasXp = false;
    db.pointsTransaction.findFirst.mockImplementation(async () => (ledgerHasXp ? { id: 'pt1' } : null));
    mAwardXp.mockImplementation(async () => {
      ledgerHasXp = true;
      return { newXp: 10 };
    });

    await awardSquarePurchaseEngagement('p1');
    await awardSquarePurchaseEngagement('p1');

    expect(mAwardXp).toHaveBeenCalledTimes(1);
    expect(mStamp.mock.calls.map((c) => c[3])).toEqual(['p1', 'p1']);
  });

  it('two concurrent calls for the same purchase share one run (in-process guard)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    mAwardXp.mockImplementation(async () => {
      await gate;
      return { newXp: 10 };
    });
    const a = awardSquarePurchaseEngagement('p1');
    const b = awardSquarePurchaseEngagement('p1');
    await new Promise((r) => setImmediate(r));
    release();
    await Promise.all([a, b]);
    expect(mAwardXp).toHaveBeenCalledTimes(1);
    expect(mStamp).toHaveBeenCalledTimes(1);
  });

  it('a cart (one Square payment, three rows) earns one award set keyed to the earliest PAID row', async () => {
    setupDb([
      purchaseRow({ id: 'c1', createdAt: new Date('2026-09-29T12:00:00Z'), squarePaymentId: 'sqcart', status: 'REFUNDING' }),
      purchaseRow({ id: 'c2', createdAt: new Date('2026-09-29T12:00:01Z'), squarePaymentId: 'sqcart' }),
      purchaseRow({ id: 'c3', createdAt: new Date('2026-09-29T12:00:02Z'), squarePaymentId: 'sqcart' }),
    ]);
    // Caller passes the first created id, which lost a stock race; the earliest PAID sibling wins.
    await awardSquarePurchaseEngagement('c1');
    expect(mAwardXp).toHaveBeenCalledTimes(1);
    expect(mAwardXp.mock.calls[0][3].purchaseId).toBe('c2');
    expect(mStamp).toHaveBeenCalledTimes(1);
    expect(mStamp.mock.calls[0][3]).toBe('c2');
    // Passing a later sibling resolves to the same canonical row, so the stamp ref id is stable.
    mStamp.mockClear();
    await awardSquarePurchaseEngagement('c3');
    expect(mStamp.mock.calls[0][3]).toBe('c2');
  });

  it('organizer referral credit is gated by the status flip: a losing concurrent caller awards nothing', async () => {
    db.organizerReferral.findUnique.mockResolvedValue({ referrerId: 'refU', status: 'PENDING' });
    db.organizerReferral.updateMany.mockResolvedValue({ count: 0 });
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp.mock.calls.map((c) => c[1])).not.toContain('ORGANIZER_REFERRAL_PURCHASE');
  });
});

describe('awardSquarePurchaseEngagement: skip rules', () => {
  const noAwards = () => {
    expect(mAwardXp).not.toHaveBeenCalled();
    expect(mStamp).not.toHaveBeenCalled();
    expect(mRefStamp).not.toHaveBeenCalled();
    expect(mAchievement).not.toHaveBeenCalled();
    expect(mOg).not.toHaveBeenCalled();
  };

  it('skips a guest purchase (no userId)', async () => {
    setupDb([purchaseRow({ userId: null })]);
    await awardSquarePurchaseEngagement('p1');
    noAwards();
  });

  it('skips POS rows without a verified shopper card payment, and test-transaction rows', async () => {
    // cash settlement recorded by an organizer for a linked shopper (synthetic cash_ id)
    setupDb([purchaseRow({ source: 'POS', squarePaymentId: null, stripePaymentIntentId: 'cash_abc' })]);
    await awardSquarePurchaseEngagement('p1');
    setupDb([purchaseRow({ source: 'POS', squarePaymentId: 'cash_abc' })]);
    await awardSquarePurchaseEngagement('p1');
    setupDb([purchaseRow({ source: 'POS', squarePaymentId: 'sq_test_1' })]);
    await awardSquarePurchaseEngagement('p1');
    // walk-up card sale has no shopper account
    setupDb([purchaseRow({ source: 'POS', userId: null })]);
    await awardSquarePurchaseEngagement('p1');
    setupDb([purchaseRow({ isTestTransaction: true })]);
    await awardSquarePurchaseEngagement('p1');
    noAwards();
  });

  it('awards a POS row paid by a real Square card for a logged-in shopper (QR / phone POS request)', async () => {
    setupDb([purchaseRow({ source: 'POS', squarePaymentId: 'sqpos1' })]);
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).toHaveBeenCalled();
    expect(mStamp).toHaveBeenCalledTimes(1);
    expect(mStamp.mock.calls[0][3]).toBe('p1');
  });

  it('skips a purchase that is not PAID at award time (stock-race REFUNDING, refunded, pending)', async () => {
    for (const status of ['REFUNDING', 'REFUNDED', 'PENDING']) {
      setupDb([purchaseRow({ status })]);
      await awardSquarePurchaseEngagement('p1');
    }
    noAwards();
  });

  it('skips a missing purchase and an empty id', async () => {
    await awardSquarePurchaseEngagement('does-not-exist');
    await awardSquarePurchaseEngagement('');
    noAwards();
  });
});

describe('never-throw guarantee', () => {
  it('resolves when awardXp rejects, and still awards the passport stamp', async () => {
    mAwardXp.mockRejectedValue(new Error('xp down'));
    await expect(awardSquarePurchaseEngagement('p1')).resolves.toBeUndefined();
    expect(mStamp).toHaveBeenCalledTimes(1);
  });

  it('resolves when the passport stamp, achievement and badge all reject', async () => {
    mStamp.mockRejectedValue(new Error('migration not applied'));
    mRefStamp.mockRejectedValue(new Error('boom'));
    mAchievement.mockRejectedValue(new Error('boom'));
    mOg.mockRejectedValue(new Error('boom'));
    await expect(awardSquarePurchaseEngagement('p1')).resolves.toBeUndefined();
  });

  it('resolves when the first database read throws', async () => {
    db.purchase.findUnique.mockRejectedValue(new Error('db down'));
    await expect(awardSquarePurchaseEngagement('p1')).resolves.toBeUndefined();
    expect(mAwardXp).not.toHaveBeenCalled();
  });

  it('resolves when the dedupe lookup throws (XP step is skipped, later steps still run)', async () => {
    db.pointsTransaction.findFirst.mockRejectedValue(new Error('ledger down'));
    await expect(awardSquarePurchaseEngagement('p1')).resolves.toBeUndefined();
    expect(mStamp).toHaveBeenCalledTimes(1);
  });

  it('fireSquarePurchaseEngagement returns synchronously, never throws, and runs the award off the caller path', async () => {
    expect(() => fireSquarePurchaseEngagement(null)).not.toThrow();
    expect(() => fireSquarePurchaseEngagement(undefined)).not.toThrow();
    expect(mAwardXp).not.toHaveBeenCalled();

    fireSquarePurchaseEngagement('p1');
    expect(mAwardXp).not.toHaveBeenCalled(); // deferred, not run inline
    await new Promise((r) => setTimeout(r, 20));
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });

  it('fireSquarePurchaseEngagement swallows a failing award (no unhandled rejection)', async () => {
    db.purchase.findUnique.mockRejectedValue(new Error('db down'));
    expect(() => fireSquarePurchaseEngagement('p1')).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('anti-farming and self-purchase guards (money review P2, 2026-09-29)', () => {
  it('an organizer buying from their OWN sale earns nothing', async () => {
    setupDb([purchaseRow({ userId: 'orgU', sale: { id: 's1', organizer: { userId: 'orgU' } } })]);
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).not.toHaveBeenCalled();
    expect(mStamp).not.toHaveBeenCalled();
    expect(mAchievement).not.toHaveBeenCalled();
    expect(mOg).not.toHaveBeenCalled();
  });

  it('a different shopper on the same sale still earns', async () => {
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).toHaveBeenCalled();
  });

  it('a payment under $1 earns nothing; exactly $1 does', async () => {
    setupDb([purchaseRow({ amount: 0.5 })]);
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).not.toHaveBeenCalled();
    expect(mStamp).not.toHaveBeenCalled();

    setupDb([purchaseRow({ amount: 1 })]);
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });

  it('a cart is judged on the payment total, not each row: two 60 cent rows are $1.20 and earn', async () => {
    setupDb([
      purchaseRow({ id: 'a', amount: 0.6, createdAt: new Date('2026-09-29T12:00:00Z') }),
      purchaseRow({ id: 'b', amount: 0.6, createdAt: new Date('2026-09-29T12:00:01Z') }),
    ]);
    await awardSquarePurchaseEngagement('b');
    expect(mAwardXp).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mAwardXp.mockResolvedValue({ newXp: 10 });
    mMultiplier.mockImplementation(async (_u: string, base: number) => base);
    setupDb([
      purchaseRow({ id: 'a', amount: 0.4, createdAt: new Date('2026-09-29T12:00:00Z') }),
      purchaseRow({ id: 'b', amount: 0.4, createdAt: new Date('2026-09-29T12:00:01Z') }),
    ]);
    await awardSquarePurchaseEngagement('b');
    expect(mAwardXp).not.toHaveBeenCalled();
  });

  it('a row with no recorded amount is never treated as too small', async () => {
    setupDb([purchaseRow({ amount: null })]);
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });
});

describe('cross-instance advisory lock (money review P2, 2026-09-29)', () => {
  const queryRaw = jest.fn();
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([]);
  });
  afterEach(() => {
    delete db.$transaction;
  });

  it('takes a transaction-scoped Postgres advisory lock keyed by the canonical purchase BEFORE awarding', async () => {
    const order: string[] = [];
    queryRaw.mockImplementation(async () => {
      order.push('lock');
      return [];
    });
    mAwardXp.mockImplementation(async () => {
      order.push('award');
      return { newXp: 10 };
    });
    db.$transaction = jest.fn(async (cb: any) => cb({ $queryRaw: queryRaw }));
    await awardSquarePurchaseEngagement('p1');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // tagged template: the key is the last interpolated value
    expect(queryRaw.mock.calls[0].slice(1)).toContain('sqeng:p1');
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('award'));
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN: if the transaction cannot start the awards still run, once', async () => {
    db.$transaction = jest.fn().mockRejectedValue(new Error('pool exhausted'));
    await awardSquarePurchaseEngagement('p1');
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });

  it('a transaction that errors AFTER the awards ran does not run them a second time', async () => {
    db.$transaction = jest.fn(async (cb: any) => {
      await cb({ $queryRaw: queryRaw });
      throw new Error('commit failed');
    });
    await expect(awardSquarePurchaseEngagement('p1')).resolves.toBeUndefined();
    expect(mAwardXp).toHaveBeenCalledTimes(1);
  });
});
