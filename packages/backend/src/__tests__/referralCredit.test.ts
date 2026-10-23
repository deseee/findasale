/**
 * Roadmap #661 (2026-10-23): organizer referral subscription credit.
 * Pure math (net fee, proration, renewal application), the Purchase-row earn path with its fraud gates, refund
 * clawback, and the renewal credit reservation. Prisma is mocked; nothing touches a database or a payment provider.
 */
const m: any = {
  purchase: { findUnique: jest.fn(), findMany: jest.fn() },
  affiliateReferral: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  affiliateFraudSignal: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  subscriptionCreditEntry: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: m }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

import {
  referralNetFeeCents,
  referralCreditWorthNowCents,
  identitySignals,
  processPurchaseForReferralCredit,
  sweepReferralCredit,
  fireReferralCreditCheck,
} from '../services/affiliateService';
import { creditToApplyCents, reserveRenewalCredit, getCreditBalance } from '../services/subscriptionCreditService';
import { calculateReferralCreditCents, ORGANIZER_REFERRAL_CREDIT, isReferralCreditEnabled } from '../config/affiliateConfig';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-23T12:00:00Z');

const users: Record<string, any> = {
  referrer: { id: 'referrer', email: 'ref@example.com', deviceFingerprint: 'devA', stripeCardFingerprint: 'cardA' },
  referred: { id: 'referred', email: 'new@example.com', deviceFingerprint: 'devB', stripeCardFingerprint: 'cardB' },
  shopper: { id: 'shopper', email: 'shop@example.com', deviceFingerprint: 'devC', stripeCardFingerprint: 'cardC' },
};

function purchase(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    status: 'PAID',
    amount: 100,
    platformFeeAmount: 10,
    cashDebtCollectedAmount: null,
    cashLegAmount: null,
    processor: 'SQUARE',
    squareAppFeeSentCents: 680, // $10 fee net of Square's processing cost
    stripePaymentIntentId: null,
    squarePaymentId: 'sqpay_1',
    refundedAmount: null,
    isTestTransaction: false,
    userId: 'shopper',
    buyerEmail: null,
    buyerCardFingerprint: null,
    createdAt: new Date(NOW.getTime() - DAY),
    sale: { organizer: { userId: 'referred' } },
    ...over,
  };
}

function referral(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    referrerId: 'referrer',
    referredUserId: 'referred',
    status: 'PENDING',
    fraudReviewStatus: 'CLEAR',
    qualifiedAt: null,
    createdAt: new Date(NOW.getTime() - 30 * DAY),
    ...over,
  };
}

const ORIGINAL_FLAG = process.env.REFERRAL_PAYOUTS_ENABLED;
afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.REFERRAL_PAYOUTS_ENABLED;
  else process.env.REFERRAL_PAYOUTS_ENABLED = ORIGINAL_FLAG;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REFERRAL_PAYOUTS_ENABLED = 'true'; // flag ON for every test except the "flag OFF" block, which unsets it
  m.$transaction.mockImplementation(async (fn: any) => fn(m));
  m.$queryRaw.mockResolvedValue([]);
  m.user.findUnique.mockImplementation(async ({ where }: any) => users[where.id] ?? null);
  m.affiliateReferral.findFirst.mockImplementation(async ({ where }: any) =>
    where.referredUserId === 'referred' ? { id: 'r1', referrerId: 'referrer' } : null
  );
  m.affiliateReferral.findUnique.mockResolvedValue(referral());
  m.affiliateReferral.update.mockResolvedValue({});
  m.affiliateReferral.count.mockResolvedValue(0);
  m.affiliateFraudSignal.findFirst.mockResolvedValue(null);
  m.affiliateFraudSignal.create.mockResolvedValue({});
  m.subscriptionCreditEntry.findMany.mockResolvedValue([]);
  m.subscriptionCreditEntry.create.mockResolvedValue({ id: 'e1' });
});

describe('feature flag REFERRAL_PAYOUTS_ENABLED (default OFF)', () => {
  beforeEach(() => {
    delete process.env.REFERRAL_PAYOUTS_ENABLED;
  });

  it('is off unless the variable is exactly "true"', () => {
    expect(isReferralCreditEnabled()).toBe(false);
    process.env.REFERRAL_PAYOUTS_ENABLED = 'TRUE';
    expect(isReferralCreditEnabled()).toBe(false);
    process.env.REFERRAL_PAYOUTS_ENABLED = '1';
    expect(isReferralCreditEnabled()).toBe(false);
    process.env.REFERRAL_PAYOUTS_ENABLED = 'true';
    expect(isReferralCreditEnabled()).toBe(true);
  });

  it('OFF: a qualifying purchase qualifies nothing and writes no row', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase());
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'NONE', reason: 'DISABLED' });
    expect(m.purchase.findUnique).not.toHaveBeenCalled();
    expect(m.affiliateReferral.update).not.toHaveBeenCalled();
    expect(m.affiliateFraudSignal.create).not.toHaveBeenCalled();
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });

  it('OFF: the sweep and the payment hook do nothing', async () => {
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');
    expect(await sweepReferralCredit({ since: new Date(0), now: NOW })).toEqual({ processed: 0, earned: 0, adjusted: 0 });
    fireReferralCreditCheck('p1');
    expect(setImmediateSpy).not.toHaveBeenCalled();
    expect(m.affiliateReferral.findMany).not.toHaveBeenCalled();
    setImmediateSpy.mockRestore();
  });

  it('OFF: a renewal applies no credit (full charge) even with a positive balance', async () => {
    m.subscriptionCreditEntry.findMany.mockResolvedValue([{ amountCents: 5000, status: 'ACTIVE', availableAt: new Date(0) }]);
    expect(await reserveRenewalCredit({ userId: 'referrer', organizerId: 'org1', periodKey: 'renewal:x', attempt: 0, amountCents: 2900, now: NOW })).toEqual({ appliedCents: 0, entryId: null });
    expect(m.$transaction).not.toHaveBeenCalled();
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });

  it('ON: the same purchase earns credit', async () => {
    process.env.REFERRAL_PAYOUTS_ENABLED = 'true';
    m.purchase.findUnique.mockResolvedValue(purchase());
    expect((await processPurchaseForReferralCredit('p1', NOW)).action).toBe('EARNED');
  });
});

describe('referral credit math', () => {
  it('credits a share of the NET platform fee, rounded down', () => {
    expect(calculateReferralCreditCents(680)).toBe(Math.floor((680 * ORGANIZER_REFERRAL_CREDIT.COMMISSION_RATE_BPS) / 10000));
    expect(calculateReferralCreditCents(0)).toBe(0);
    expect(calculateReferralCreditCents(-5)).toBe(0);
    expect(calculateReferralCreditCents(1000, 20000)).toBe(1000); // a misconfigured rate can never exceed the fee
  });

  it('uses the Square app fee actually sent, minus any cash-debt padding', () => {
    expect(referralNetFeeCents(purchase())).toBe(680);
    expect(referralNetFeeCents(purchase({ cashDebtCollectedAmount: 2 }))).toBe(480);
  });

  it('earns nothing on cash, synthetic or off-platform tenders', () => {
    expect(referralNetFeeCents(purchase({ processor: 'CASH', squareAppFeeSentCents: null }))).toBe(0);
    expect(referralNetFeeCents(purchase({ processor: 'STRIPE', squareAppFeeSentCents: null, stripePaymentIntentId: 'cash_abc' }))).toBe(0);
    expect(referralNetFeeCents(purchase({ squarePaymentId: 'sq_test_1' }))).toBe(0);
  });

  it('a legacy Stripe card row is credited on its fee net of debt', () => {
    expect(referralNetFeeCents(purchase({ processor: 'STRIPE', squareAppFeeSentCents: null, stripePaymentIntentId: 'pi_123' }))).toBe(1000);
  });

  it('prorates by refunds and goes to zero when reversed', () => {
    expect(referralCreditWorthNowCents(68, purchase())).toBe(68);
    expect(referralCreditWorthNowCents(68, purchase({ refundedAmount: 50 }))).toBe(34);
    expect(referralCreditWorthNowCents(68, purchase({ status: 'REFUNDED' }))).toBe(0);
    expect(referralCreditWorthNowCents(68, purchase({ status: 'DISPUTED' }))).toBe(0);
  });

  it('identity signals are null-safe and catch shared device, card and email', () => {
    expect(identitySignals(users.referrer, users.referred)).toEqual([]);
    expect(identitySignals(users.referrer, { ...users.referred, deviceFingerprint: 'devA' })).toEqual(['SHARED_DEVICE_FP']);
    expect(identitySignals(users.referrer, { ...users.referred, stripeCardFingerprint: 'cardA' })).toEqual(['SHARED_CARD_FP']);
    expect(identitySignals(users.referrer, { ...users.referred, email: ' REF@example.com ' })).toEqual(['SELF_REFERRAL']);
    expect(identitySignals({ ...users.referrer, deviceFingerprint: null }, { ...users.referred, deviceFingerprint: null })).toEqual([]);
  });
});

describe('processPurchaseForReferralCredit', () => {
  it('does nothing for an organizer who was not referred', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase({ sale: { organizer: { userId: 'someone-else' } } }));
    const out = await processPurchaseForReferralCredit('p1', NOW);
    expect(out).toEqual({ action: 'NONE', reason: 'NOT_REFERRED' });
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });

  it('qualifies the referral and books ACTIVE credit with the hold', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase());
    const out = await processPurchaseForReferralCredit('p1', NOW);
    expect(out).toEqual({ action: 'EARNED', creditCents: 68, status: 'ACTIVE' });
    expect(m.affiliateReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'QUALIFIED', qualifiedAt: NOW }) })
    );
    const row = m.subscriptionCreditEntry.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: 'referrer', amountCents: 68, kind: 'REFERRAL_EARNED', status: 'ACTIVE', idempotencyKey: 'referral-earn:p1', netFeeCents: 680 });
    expect(row.availableAt.getTime()).toBe(purchase().createdAt.getTime() + ORGANIZER_REFERRAL_CREDIT.HOLD_DAYS * DAY);
    expect(m.$queryRaw).toHaveBeenCalled(); // ran under the referrer's credit lock
  });

  it('blocks a referral whose two accounts share a device, and holds the credit', async () => {
    users.referred.deviceFingerprint = 'devA';
    try {
      m.purchase.findUnique.mockResolvedValue(purchase());
      const out = await processPurchaseForReferralCredit('p1', NOW);
      expect(out).toEqual({ action: 'EARNED', creditCents: 68, status: 'HELD' });
      expect(m.affiliateReferral.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fraudReviewStatus: 'BLOCKED', deviceFraudFlag: true }) })
      );
      expect(m.affiliateReferral.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'QUALIFIED' }) }));
      expect(m.affiliateFraudSignal.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ signalType: 'SHARED_DEVICE_FP' }) }));
    } finally {
      users.referred.deviceFingerprint = 'devB';
    }
  });

  it('gives nothing when the referrer buys from the referred organizer (by account or by card)', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase({ userId: 'referrer' }));
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'SELF_DEALING' });
    m.purchase.findUnique.mockResolvedValue(purchase({ userId: null, buyerCardFingerprint: 'cardA' }));
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'SELF_DEALING' });
    m.purchase.findUnique.mockResolvedValue(purchase({ userId: 'referred' }));
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'SELF_DEALING' });
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });

  it('skips test rows, unpaid rows, sales before the referral and after the window', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase({ isTestTransaction: true }));
    expect((await processPurchaseForReferralCredit('p1', NOW)).action).toBe('SKIPPED');
    m.purchase.findUnique.mockResolvedValue(purchase({ status: 'PENDING' }));
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'NOT_PAID' });
    m.purchase.findUnique.mockResolvedValue(purchase({ createdAt: new Date(NOW.getTime() - 40 * DAY) }));
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'BEFORE_REFERRAL' });
    m.affiliateReferral.findUnique.mockResolvedValue(referral({ createdAt: new Date(NOW.getTime() - 400 * DAY) }));
    m.purchase.findUnique.mockResolvedValue(purchase());
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'SKIPPED', reason: 'OUTSIDE_WINDOW' });
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });

  it('holds credit past the per-referrer cap instead of dropping it', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase());
    m.affiliateReferral.findUnique.mockResolvedValue(referral({ status: 'QUALIFIED', qualifiedAt: new Date(NOW.getTime() - 5 * DAY) }));
    m.subscriptionCreditEntry.findMany.mockImplementation(async ({ where }: any) =>
      where.kind === 'REFERRAL_EARNED' && where.userId ? [{ amountCents: ORGANIZER_REFERRAL_CREDIT.CAP_MAX_CREDIT_CENTS }] : []
    );
    const out = await processPurchaseForReferralCredit('p1', NOW);
    expect(out).toEqual({ action: 'EARNED', creditCents: 68, status: 'HELD' });
  });

  it('claws back a refunded purchase and keeps a clawback inside the hold from going usable-negative', async () => {
    const earnAvail = new Date(NOW.getTime() + 3 * DAY);
    m.purchase.findUnique.mockResolvedValue(purchase({ status: 'REFUNDED', refundedAmount: 100 }));
    m.affiliateReferral.findUnique.mockResolvedValue(referral({ status: 'QUALIFIED', qualifiedAt: NOW }));
    m.subscriptionCreditEntry.findMany.mockImplementation(async ({ where }: any) =>
      where.sourcePurchaseId ? [{ id: 'e1', kind: 'REFERRAL_EARNED', amountCents: 68, status: 'ACTIVE', availableAt: earnAvail }] : []
    );
    const out = await processPurchaseForReferralCredit('p1', NOW);
    expect(out).toEqual({ action: 'ADJUSTED', deltaCents: -68 });
    const row = m.subscriptionCreditEntry.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ amountCents: -68, kind: 'REFERRAL_ADJUSTMENT', status: 'ACTIVE', userId: 'referrer' });
    expect(row.availableAt).toEqual(earnAvail);
  });

  it('is idempotent once the clawback is booked', async () => {
    m.purchase.findUnique.mockResolvedValue(purchase({ status: 'REFUNDED', refundedAmount: 100 }));
    m.subscriptionCreditEntry.findMany.mockImplementation(async ({ where }: any) =>
      where.sourcePurchaseId
        ? [
            { id: 'e1', kind: 'REFERRAL_EARNED', amountCents: 68, status: 'ACTIVE', availableAt: NOW },
            { id: 'e2', kind: 'REFERRAL_ADJUSTMENT', amountCents: -68, status: 'ACTIVE', availableAt: NOW },
          ]
        : []
    );
    expect(await processPurchaseForReferralCredit('p1', NOW)).toEqual({ action: 'NONE', reason: 'UP_TO_DATE' });
    expect(m.subscriptionCreditEntry.create).not.toHaveBeenCalled();
  });
});

describe('subscription credit application', () => {
  it('never leaves a card remainder below the minimum card charge', () => {
    expect(creditToApplyCents(2900, 0)).toBe(0);
    expect(creditToApplyCents(2900, 500)).toBe(500);
    expect(creditToApplyCents(2900, 5000)).toBe(2900); // fully covered
    expect(creditToApplyCents(2900, 2850)).toBe(2900 - 99); // 50c remainder would be under the minimum
    expect(creditToApplyCents(2900, -300)).toBe(0); // negative balance (clawback) applies nothing
  });

  it('balance counts only ACTIVE rows past their hold', async () => {
    m.subscriptionCreditEntry.findMany.mockResolvedValue([
      { amountCents: 100, status: 'ACTIVE', availableAt: new Date(NOW.getTime() - DAY) },
      { amountCents: 50, status: 'ACTIVE', availableAt: new Date(NOW.getTime() + DAY) },
      { amountCents: 70, status: 'HELD', availableAt: new Date(NOW.getTime() - DAY) },
      { amountCents: -30, status: 'ACTIVE', availableAt: new Date(NOW.getTime() - DAY) },
    ]);
    expect(await getCreditBalance('referrer', NOW)).toEqual({ availableCents: 70, pendingCents: 50, heldCents: 70 });
  });

  it('reserves credit once per renewal attempt and reuses it on a crash-retry', async () => {
    m.subscriptionCreditEntry.findUnique.mockResolvedValueOnce(null);
    m.subscriptionCreditEntry.findMany.mockResolvedValue([{ amountCents: 1500, status: 'ACTIVE', availableAt: new Date(NOW.getTime() - DAY) }]);
    m.subscriptionCreditEntry.create.mockResolvedValue({ id: 'apply1' });
    const first = await reserveRenewalCredit({ userId: 'referrer', organizerId: 'org1', periodKey: 'renewal:x', attempt: 0, amountCents: 2900, now: NOW });
    expect(first).toEqual({ appliedCents: 1500, entryId: 'apply1' });
    expect(m.subscriptionCreditEntry.create.mock.calls[0][0].data).toMatchObject({ amountCents: -1500, kind: 'RENEWAL_APPLIED', idempotencyKey: 'renewal-apply:org1:renewal:x:try0' });

    m.subscriptionCreditEntry.findUnique.mockResolvedValueOnce({ id: 'apply1', amountCents: -1500, status: 'ACTIVE', userId: 'referrer' });
    const retry = await reserveRenewalCredit({ userId: 'referrer', organizerId: 'org1', periodKey: 'renewal:x', attempt: 0, amountCents: 2900, now: NOW });
    expect(retry).toEqual({ appliedCents: 1500, entryId: 'apply1' });
    expect(m.subscriptionCreditEntry.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed to a full charge when the lock or ledger errors', async () => {
    m.$transaction.mockRejectedValueOnce(new Error('pool exhausted'));
    expect(await reserveRenewalCredit({ userId: 'referrer', organizerId: 'org1', periodKey: 'renewal:x', attempt: 0, amountCents: 2900, now: NOW })).toEqual({ appliedCents: 0, entryId: null });
  });
});
