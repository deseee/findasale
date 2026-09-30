/**
 * Split-tender refunds (2026-09-29): services/squareRefundService.ts executeVerifiedSquareRefund,
 * services/cashFeeRefundReversalService.ts (cash-leg commission reversal), and
 * services/cashFeeService.ts resolveSplitRefund as wired into the refund.
 *
 * NOT EXECUTED when written (no runnable jest in the environment). Run
 *   pnpm --filter backend test -- splitRefundReversal
 * before merging.
 *
 * WHAT THIS PROVES (a $100.00 split sale: $60.00 on the card, $40.00 in cash, SIMPLE organizer,
 * cash-leg commission accrued = $3.20):
 *   - the Square refund is CAPPED at the card leg ($60.00) and never asks Square for more than it
 *     captured; the Square call is skipped entirely when the card leg is 0
 *   - Purchase.refundCashPortion, cashPortionToRefundByHand and the organizer message carry the
 *     part to hand back in cash ($15.00 on a $75.00 refund, $40.00 on a full one)
 *   - a refund that fits inside the card leg returns no cash and reverses no cash commission
 *   - a non-split purchase behaves exactly as before: full amount to Square, no refundCashPortion
 *     write, no message, no reversal
 *   - the cash-leg commission reversal is proportional, idempotent per purchase (replay changes
 *     nothing), sums to exactly the accrual across several rows, and never takes cashFeeBalance
 *     below zero
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    purchase: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    organizer: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    item: { updateMany: jest.fn() },
    vendorBooth: { findUnique: jest.fn() },
    pOSPaymentRequest: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    pOSPaymentLink: { findFirst: jest.fn() },
    holdInvoice: { findFirst: jest.fn().mockResolvedValue(null) }, // HOLD_INVOICE accrual lookup (2026-09-29)
    cashFeeAccrual: { findFirst: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  },
}));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

const mockRefundPayment = jest.fn();
const mockRefundsGet = jest.fn();
const mockPaymentsGet = jest.fn();
jest.mock('square', () => ({
  SquareClient: jest.fn().mockImplementation(() => ({
    refunds: { refundPayment: mockRefundPayment, get: mockRefundsGet },
    payments: { get: mockPaymentsGet },
  })),
  SquareEnvironment: { Production: 'production', Sandbox: 'sandbox' },
}));
jest.mock('../services/refundService', () => {
  class RefundError extends Error {
    statusCode: number;
    details?: Record<string, unknown>;
    constructor(message: string, statusCode = 400, details?: Record<string, unknown>) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return { RefundError };
});
jest.mock('../services/vendorBoothSaleNotificationService', () => ({
  notifyVendorBoothSaleRefunded: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/squarePaymentService', () => {
  class SquareOnboardingIncompleteError extends Error {}
  return { resolveOrganizerSquareAccessToken: jest.fn().mockResolvedValue('tok'), SquareOnboardingIncompleteError };
});
jest.mock('../services/squareVendorBoothCartService', () => {
  class SquareBoothOnboardingIncompleteError extends Error {}
  return { resolveVendorBoothSquareAccessToken: jest.fn(), SquareBoothOnboardingIncompleteError };
});
jest.mock('../services/cashFeeRefundReversalService', () => {
  const actual = jest.requireActual('../services/cashFeeRefundReversalService');
  return { ...actual, reverseSplitCashCommissionForRefund: jest.fn().mockResolvedValue({ status: 'REVERSED', reversedCents: 320, appliedCents: 320, shortfallCents: 0 }) };
});

import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { executeVerifiedSquareRefund, buildSquareRefundIdempotencyKey } from '../services/squareRefundService';
import { reverseSplitCashCommissionForRefund as mockedReverse } from '../services/cashFeeRefundReversalService';

// The mocked module above replaces reverseSplitCashCommissionForRefund with a jest.fn for the refund
// suite; the reversal suite below needs the REAL implementation.
const {
  computeCumulativeCommissionReversalCents,
  reverseSplitCashCommissionForRefund: realReverse,
} = jest.requireActual('../services/cashFeeRefundReversalService');

const db: any = prisma;
const reverseMock = mockedReverse as unknown as jest.Mock;

const makePurchase = (over: any = {}) => ({
  id: 'pur_1',
  processor: 'SQUARE',
  status: 'PAID',
  squarePaymentId: 'sq_pay_1',
  amount: 100,
  cashLegAmount: 40,
  createdAt: new Date(),
  userId: null,
  itemId: null,
  boothCartTransactionId: null,
  platformFeeAmount: 4.8,
  cashDebtCollectedAmount: null,
  user: null,
  item: null,
  sale: { organizer: { id: 'org_1', userId: 'user_1', businessName: 'Maple Estate Co', squareMerchantId: 'm1' } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRefundPayment.mockResolvedValue({});
  db.purchase.findUnique.mockResolvedValue(makePurchase());
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.purchase.update.mockResolvedValue({});
  db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
  db.organizer.update.mockResolvedValue({});
  // The finalize is now one interactive transaction (money review P1-14/P1-15): run it against the same
  // mocked client so the writes it makes are observable.
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.organizer.updateMany.mockResolvedValue({ count: 1 });
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 0 });
  reverseMock.mockResolvedValue({ status: 'REVERSED', reversedCents: 320, appliedCents: 320, shortfallCents: 0 });
});

const squareCentsSent = () => mockRefundPayment.mock.calls[0][0].amountMoney.amount;
// The finalize flips REFUNDING to its final status (REFUNDED for a full refund, PAID for a partial one)
// with a compare-and-swap updateMany that also carries the cumulative refundedAmount.
const finalizeCall = () =>
  db.purchase.updateMany.mock.calls.find((c: any[]) => c[0].where.status === 'REFUNDING' && 'refundedAmount' in c[0].data)[0];
const finalizeData = () => finalizeCall().data;

describe('executeVerifiedSquareRefund, split purchase', () => {
  it('full refund: Square is asked for the card leg only, the cash leg is reported to hand back', async () => {
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer');

    expect(mockRefundPayment).toHaveBeenCalledTimes(1);
    const req = mockRefundPayment.mock.calls[0][0];
    expect(req.amountMoney).toEqual({ amount: BigInt(6000), currency: 'USD' });
    expect(req.idempotencyKey).toBe(buildSquareRefundIdempotencyKey('pur_1', 0, 6000)); // digest of purchase + prior + amount
    expect(req.paymentId).toBe('sq_pay_1');

    const data = finalizeData();
    expect(data.refundedAmount).toBe(100); // the whole sale value came back
    expect(data.refundCashPortion).toBe(40);

    expect(res.refundedAmount).toBe(100);
    expect(res.cashPortionToRefundByHand).toBe(40);
    expect(res.message).toContain('Cash portion to refund by hand: $40.00');
    expect(res.message).toContain('$60.00 was refunded to the card');

    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(reverseMock).toHaveBeenCalledWith({
      organizerId: 'org_1',
      purchase: { id: 'pur_1', squarePaymentId: 'sq_pay_1' },
      cashPortionRefundedCents: 4000,
    });
  });

  it.each([
    [50, 5000, 0],
    [60, 6000, 0],
    [75, 6000, 15],
    [100, 6000, 40],
  ])('refund $%s sends %s cents to Square and leaves $%s cash to hand back', async (requested, squareCents, cashByHand) => {
    const res = await executeVerifiedSquareRefund('pur_1', requested, 'admin');
    expect(squareCentsSent()).toBe(BigInt(squareCents));
    expect(res.cashPortionToRefundByHand).toBe(cashByHand);
    expect(finalizeData().status).toBe(requested >= 100 ? 'REFUNDED' : 'PAID'); // partial stays PAID
    if (cashByHand === 0) {
      expect(res.message).toBeNull();
      expect('refundCashPortion' in finalizeData()).toBe(false);
      expect(reverseMock).not.toHaveBeenCalled(); // card-first: no cash returned, no cash commission reversed
    } else {
      expect(finalizeData().refundCashPortion).toBe(cashByHand);
      expect(reverseMock.mock.calls[0][0].cashPortionRefundedCents).toBe(cashByHand * 100);
    }
  });

  it('skips the Square call entirely when the card leg is 0 (whole sale paid in cash), still records the refund', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ amount: 40, cashLegAmount: 40 }));
    const res = await executeVerifiedSquareRefund('pur_1', 40, 'organizer');
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(res.cashPortionToRefundByHand).toBe(40);
    expect(finalizeData().status).toBe('REFUNDED');
  });

  it('a failing cash-commission reversal never fails the refund; it is alerted', async () => {
    reverseMock.mockRejectedValue(new Error('CashFeeAccrual missing'));
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer');
    expect(res.refundedAmount).toBe(100);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('alerts (warning) when the reversal was clamped because the balance was already paid down', async () => {
    reverseMock.mockResolvedValue({ status: 'REVERSED', reversedCents: 320, appliedCents: 100, shortfallCents: 220 });
    await executeVerifiedSquareRefund('pur_1', 100, 'organizer');
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('re-accrues collected cash-fee debt in proportion to the card refund, none when Square was skipped', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashDebtCollectedAmount: 3 }));
    await executeVerifiedSquareRefund('pur_1', 30, 'organizer'); // half of the $60.00 card leg
    expect(db.organizer.update).toHaveBeenCalledTimes(1);
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 1.5 });

    jest.clearAllMocks();
    mockRefundPayment.mockResolvedValue({});
    db.purchase.findUnique.mockResolvedValue(makePurchase({ amount: 40, cashLegAmount: 40, cashDebtCollectedAmount: 3 }));
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    db.purchase.update.mockResolvedValue({});
    db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    await executeVerifiedSquareRefund('pur_1', 40, 'organizer');
    expect(db.organizer.update).not.toHaveBeenCalled();
  });

  it('restores PAID and rethrows when Square rejects, without writing a cash portion or reversing anything', async () => {
    // A DEFINITIVE rejection (HTTP 4xx): nothing was refunded, so PAID is restored. An ambiguous failure
    // (timeout / 5xx) deliberately leaves REFUNDING instead; see squareRefundStateHandling.test.ts.
    mockRefundPayment.mockRejectedValue(Object.assign(new Error('square says no'), { statusCode: 400 }));
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toThrow('square says no');
    expect(db.purchase.updateMany).toHaveBeenLastCalledWith({ where: { id: 'pur_1', status: 'REFUNDING' }, data: { status: 'PAID' } });
    expect(reverseMock).not.toHaveBeenCalled();
    expect(db.purchase.update).not.toHaveBeenCalled();
  });
});

describe('executeVerifiedSquareRefund, non-split purchase is unchanged', () => {
  it.each([[undefined], [null], [0]])('cashLegAmount %p: full amount to Square, no cash portion, no message, no reversal', async (cashLegAmount) => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount }));
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer', 'requested_by_customer');
    expect(squareCentsSent()).toBe(BigInt(10000));
    expect(mockRefundPayment.mock.calls[0][0].reason).toContain('Requested by customer');
    expect(mockRefundPayment.mock.calls[0][0].reason).toContain('[FindA.Sale ref pur_1:0:10000:o]');
    expect('refundCashPortion' in finalizeData()).toBe(false);
    expect(res.cashPortionToRefundByHand).toBe(0);
    expect(res.message).toBeNull();
    expect(reverseMock).not.toHaveBeenCalled();
  });

  it('re-accrues the FULL recorded cash-fee debt on a full refund, exactly as before', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null, cashDebtCollectedAmount: 3 }));
    await executeVerifiedSquareRefund('pur_1', 100, 'dispute');
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 3 });
  });

  it('a partial refund re-accrues the debt in proportion, and the second partial only the increment (sums to the full debt)', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null, cashDebtCollectedAmount: 3 }));
    await executeVerifiedSquareRefund('pur_1', 50, 'dispute');
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 1.5 });

    jest.clearAllMocks();
    mockRefundPayment.mockResolvedValue({});
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null, cashDebtCollectedAmount: 3, refundedAmount: 50 }));
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    await executeVerifiedSquareRefund('pur_1', 50, 'dispute');
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 1.5 });
  });

  it('still rejects a refund above the purchase amount before touching Square', async () => {
    await expect(executeVerifiedSquareRefund('pur_1', 100.01, 'organizer')).rejects.toThrow(/cannot exceed/);
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });
});

describe('computeCumulativeCommissionReversalCents', () => {
  const base = { accrualCommissionCents: 320, accrualCashAmountCents: 4000, priorCashRefundedCents: 0, priorReversedCents: 0 };
  it('is proportional to the cash value refunded', () => {
    expect(computeCumulativeCommissionReversalCents({ ...base, cashRefundedCents: 4000 })).toBe(320);
    expect(computeCumulativeCommissionReversalCents({ ...base, cashRefundedCents: 1500 })).toBe(120);
    expect(computeCumulativeCommissionReversalCents({ ...base, cashRefundedCents: 0 })).toBe(0);
  });
  it('never exceeds the accrual, even if more cash is claimed than was accrued', () => {
    expect(computeCumulativeCommissionReversalCents({ ...base, cashRefundedCents: 9000 })).toBe(320);
    expect(computeCumulativeCommissionReversalCents({ ...base, cashRefundedCents: 4000, priorCashRefundedCents: 4000, priorReversedCents: 320 })).toBe(0);
  });
  it('rows refunded one after another add up to exactly the accrual (no penny drift)', () => {
    let prevCash = 0;
    let prevRev = 0;
    for (let i = 0; i < 3; i++) {
      const r = computeCumulativeCommissionReversalCents({
        accrualCommissionCents: 100,
        accrualCashAmountCents: 3000,
        cashRefundedCents: 1000,
        priorCashRefundedCents: prevCash,
        priorReversedCents: prevRev,
      });
      prevCash += 1000;
      prevRev += r;
    }
    expect(prevRev).toBe(100);
  });
  it('is 0 when there is nothing accrued (referral discount) or no cash', () => {
    expect(computeCumulativeCommissionReversalCents({ ...base, accrualCommissionCents: 0, cashRefundedCents: 4000 })).toBe(0);
    expect(computeCumulativeCommissionReversalCents({ ...base, accrualCashAmountCents: 0, cashRefundedCents: 4000 })).toBe(0);
  });
});

describe('reverseSplitCashCommissionForRefund (stateful fake ledger)', () => {
  let ledger: any[];
  let balance: number;

  beforeEach(() => {
    ledger = [{ id: 'a1', organizerId: 'org_1', sourceType: 'POS_PAYMENT_LINK', sourceId: 'link_1', cashAmountCents: 4000, commissionCents: 320 }];
    balance = 3.2;
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.pOSPaymentRequest.findFirst.mockResolvedValue(null);
    db.pOSPaymentLink.findFirst.mockResolvedValue({ id: 'link_1' });
    db.cashFeeAccrual.findFirst.mockImplementation(async ({ where }: any) =>
      ledger.find((r) => r.organizerId === where.organizerId && where.OR.some((c: any) => c.sourceType === r.sourceType && c.sourceId === r.sourceId)) ?? null
    );
    db.cashFeeAccrual.findMany.mockImplementation(async ({ where }: any) =>
      ledger.filter((r) => r.sourceType === where.sourceType && r.sourceId.startsWith(where.sourceId.startsWith))
    );
    db.cashFeeAccrual.createMany.mockImplementation(async ({ data }: any) => {
      let count = 0;
      for (const d of data) {
        if (!ledger.some((r) => r.sourceType === d.sourceType && r.sourceId === d.sourceId)) {
          ledger.push({ id: `l${ledger.length + 1}`, ...d });
          count++;
        }
      }
      return { count };
    });
    db.organizer.updateMany.mockImplementation(async ({ data, where }: any) => {
      if (data.cashFeeBalance === 0) {
        balance = 0;
        return { count: 1 };
      }
      if (where.cashFeeBalance && balance + 1e-9 < where.cashFeeBalance.gte) return { count: 0 };
      balance = Math.round((balance - data.cashFeeBalance.decrement) * 100) / 100;
      return { count: 1 };
    });
    db.organizer.findUnique.mockImplementation(async () => ({ cashFeeBalance: balance }));
  });

  const reversals = () => ledger.filter((r) => r.sourceType === 'REFUND_REVERSAL');
  const call = (purchaseId: string, cashCents: number, extra: any = {}) =>
    realReverse({ organizerId: 'org_1', purchase: { id: purchaseId, squarePaymentId: 'sq_pay_1' }, cashPortionRefundedCents: cashCents, ...extra });

  it('full cash refund reverses the whole $3.20, writes a negative ledger row, and is idempotent on replay', async () => {
    const first = await call('pur_a', 4000);
    expect(first).toEqual({ status: 'REVERSED', reversedCents: 320, appliedCents: 320, shortfallCents: 0 });
    expect(balance).toBe(0);
    expect(reversals()).toHaveLength(1);
    expect(reversals()[0]).toMatchObject({
      sourceId: 'POS_PAYMENT_LINK:link_1:pur_a',
      cashAmountCents: -4000,
      commissionCents: -320,
    });

    balance = 5; // pretend other accruals landed since
    const replay = await call('pur_a', 4000);
    expect(replay.status).toBe('DUPLICATE');
    expect(balance).toBe(5); // untouched
    expect(reversals()).toHaveLength(1);
  });

  it('a duplicate insert (concurrent replay that passed the pre-check) does not decrement the balance', async () => {
    // simulate the race: pre-check sees nothing, but createMany finds the row already there
    db.cashFeeAccrual.findMany.mockResolvedValue([]);
    ledger.push({ id: 'rv', organizerId: 'org_1', sourceType: 'REFUND_REVERSAL', sourceId: 'POS_PAYMENT_LINK:link_1:pur_a', cashAmountCents: -4000, commissionCents: -320 });
    const res = await call('pur_a', 4000);
    expect(res.status).toBe('DUPLICATE');
    expect(balance).toBe(3.2);
  });

  it('partial cash refund reverses proportionally ($15.00 of $40.00 cash = $1.20)', async () => {
    const res = await call('pur_a', 1500);
    expect(res.reversedCents).toBe(120);
    expect(balance).toBe(2);
  });

  it('two rows of one split sale reverse to exactly the accrual across separate refunds', async () => {
    const a = await call('pur_a', 2400);
    const b = await call('pur_b', 1600);
    expect(a.reversedCents + b.reversedCents).toBe(320);
    expect(balance).toBe(0);
    expect(reversals()).toHaveLength(2);
  });

  it('never takes cashFeeBalance below zero when the debt was already paid down; reports the shortfall', async () => {
    balance = 1;
    const res = await call('pur_a', 4000);
    expect(res).toEqual({ status: 'REVERSED', reversedCents: 320, appliedCents: 100, shortfallCents: 220 });
    expect(balance).toBe(0);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(reversals()[0].commissionCents).toBe(-320); // the ledger still records the full entitlement
  });

  it('finds a MANUAL_CARD accrual by the Square payment id', async () => {
    ledger = [{ id: 'a2', organizerId: 'org_1', sourceType: 'MANUAL_CARD', sourceId: 'sq_pay_1', cashAmountCents: 4000, commissionCents: 320 }];
    db.pOSPaymentLink.findFirst.mockResolvedValue(null);
    const res = await call('pur_a', 4000);
    expect(res.status).toBe('REVERSED');
    expect(reversals()[0].sourceId).toBe('MANUAL_CARD:sq_pay_1:pur_a');
  });

  it('finds a POS_PAYMENT_REQUEST accrual through the request whose squarePaymentId matches', async () => {
    ledger = [{ id: 'a3', organizerId: 'org_1', sourceType: 'POS_PAYMENT_REQUEST', sourceId: 'req_1', cashAmountCents: 4000, commissionCents: 320 }];
    db.pOSPaymentLink.findFirst.mockResolvedValue(null);
    db.pOSPaymentRequest.findFirst.mockResolvedValue({ id: 'req_1' });
    const res = await call('pur_a', 4000);
    expect(res.status).toBe('REVERSED');
    expect(reversals()[0].sourceId).toBe('POS_PAYMENT_REQUEST:req_1:pur_a');
  });

  it('finds a HOLD_INVOICE accrual through the cash-leg hold invoice whose squarePaymentId matches (2026-09-29)', async () => {
    ledger = [{ id: 'a4', organizerId: 'org_1', sourceType: 'HOLD_INVOICE', sourceId: 'inv_1', cashAmountCents: 4000, commissionCents: 320 }];
    db.pOSPaymentLink.findFirst.mockResolvedValue(null);
    db.holdInvoice.findFirst.mockResolvedValueOnce({ id: 'inv_1' }).mockResolvedValueOnce({ id: 'inv_1' }); // first call + the replay
    const res = await call('pur_a', 4000);
    expect(res).toEqual({ status: 'REVERSED', reversedCents: 320, appliedCents: 320, shortfallCents: 0 });
    // the lookup is scoped to invoices that actually had a cash leg, keyed by the purchase's payment id
    expect(db.holdInvoice.findFirst).toHaveBeenCalledWith({
      where: { squarePaymentId: 'sq_pay_1', cashAmountCents: { gt: 0 } },
      select: { id: true },
    });
    expect(reversals()[0]).toMatchObject({ sourceId: 'HOLD_INVOICE:inv_1:pur_a', cashAmountCents: -4000, commissionCents: -320 });
    // and it is idempotent on replay, like every other source
    balance = 5;
    const replay = await call('pur_a', 4000);
    expect(replay.status).toBe('DUPLICATE');
    expect(balance).toBe(5);
  });

  it('a hold invoice with no cash leg contributes no HOLD_INVOICE candidate (NO_ACCRUAL)', async () => {
    ledger = [];
    db.pOSPaymentLink.findFirst.mockResolvedValue(null);
    db.holdInvoice.findFirst.mockResolvedValueOnce(null);
    const res = await call('pur_a', 4000);
    expect(res.status).toBe('NO_ACCRUAL');
  });

  it('does nothing when the cash leg never accrued (test sale, referral discount, accrual pending)', async () => {
    ledger = [];
    const res = await call('pur_a', 4000);
    expect(res.status).toBe('NO_ACCRUAL');
    expect(db.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(balance).toBe(3.2);
  });

  it('does nothing for a refund with no cash portion, without even reading the DB', async () => {
    const res = await call('pur_a', 0);
    expect(res.status).toBe('NOTHING_TO_REVERSE');
    expect(db.cashFeeAccrual.findFirst).not.toHaveBeenCalled();
  });

  it('runs in the caller transaction when one is passed, in its own otherwise', async () => {
    await call('pur_a', 1000, { tx: db });
    expect(db.$transaction).not.toHaveBeenCalled();
    await call('pur_b', 1000);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Partial refunds and finalize reliability (2026-09-29, money review P1-14 / P1-15)
// ─────────────────────────────────────────────────────────────────────────────────────────

describe('executeVerifiedSquareRefund, partial refunds (P1-14)', () => {
  const plain = (over: any = {}) => makePurchase({ cashLegAmount: null, itemId: 'item_1', ...over });
  const itemRestored = () =>
    db.item.updateMany.mock.calls.some((c: any[]) => c[0].data && c[0].data.stockSold) ||
    db.item.updateMany.mock.calls.some((c: any[]) => c[0].data && c[0].data.status === 'AVAILABLE');

  it('a partial refund keeps the purchase PAID, tracks refundedAmount and does NOT put the item back on sale', async () => {
    db.purchase.findUnique.mockResolvedValue(plain());
    const res = await executeVerifiedSquareRefund('pur_1', 30, 'organizer');
    expect(finalizeData().status).toBe('PAID');
    expect(finalizeData().refundedAmount).toBe(30);
    expect(res).toMatchObject({ refundedAmount: 30, totalRefundedAmount: 30, remainingRefundable: 70, isFullRefund: false });
    expect(db.itemReservation.updateMany).not.toHaveBeenCalled();
    expect(itemRestored()).toBe(false);
  });

  it('a second partial refund is allowed up to the remainder, uses its own idempotency key, and the total reaching the amount finalizes REFUNDED and restores the item', async () => {
    db.purchase.findUnique.mockResolvedValue(plain({ refundedAmount: 30 }));
    const res = await executeVerifiedSquareRefund('pur_1', 70, 'organizer');
    const req = mockRefundPayment.mock.calls[0][0];
    expect(req.idempotencyKey).toBe(buildSquareRefundIdempotencyKey('pur_1', 3000, 7000));
    expect(req.reason).toContain('[FindA.Sale ref pur_1:3000:7000:o]');
    expect(req.amountMoney).toEqual({ amount: BigInt(7000), currency: 'USD' });
    expect(finalizeData()).toMatchObject({ status: 'REFUNDED', refundedAmount: 100 });
    expect(res).toMatchObject({ totalRefundedAmount: 100, remainingRefundable: 0, isFullRefund: true });
    expect(itemRestored()).toBe(true);
    // the claim is pinned to the refundedAmount that was read, so a stale read cannot double refund
    expect(db.purchase.updateMany.mock.calls[0][0].where).toEqual({ id: 'pur_1', status: 'PAID', refundedAmount: 30 });
  });

  it('rejects a refund above the REMAINING balance before touching Square', async () => {
    db.purchase.findUnique.mockResolvedValue(plain({ refundedAmount: 30 }));
    await expect(executeVerifiedSquareRefund('pur_1', 70.01, 'organizer')).rejects.toThrow(/remaining refundable/);
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });

  it('a lost claim (another refund won the race) refunds nothing', async () => {
    db.purchase.findUnique.mockResolvedValue(plain());
    db.purchase.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(executeVerifiedSquareRefund('pur_1', 10, 'organizer')).rejects.toThrow(/already in progress/);
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });
});

describe('executeVerifiedSquareRefund, finalize reliability (P1-15)', () => {
  it('when Square accepted the refund but the finalize keeps failing: retried, alerted, left REFUNDING (never reset to PAID), caller told not to retry', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null }));
    db.$transaction.mockRejectedValue(new Error('db blip'));
    mockRefundPayment.mockResolvedValue({ refund: { id: 'sqr_1', status: 'PENDING' } });

    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toMatchObject({
      statusCode: 500,
      details: { code: 'REFUND_FINALIZE_PENDING', purchaseId: 'pur_1', squareRefundId: 'sqr_1' },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(3); // retried
    expect(mockRefundPayment).toHaveBeenCalledTimes(1); // Square was asked exactly once
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    // the only status writes are the claim; nothing put the row back to PAID (that would allow a double refund)
    expect(db.purchase.updateMany.mock.calls.filter((c: any[]) => c[0].data.status === 'PAID')).toHaveLength(0);
  });

  it('a transient finalize failure is retried and the refund still completes', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null }));
    db.$transaction.mockRejectedValueOnce(new Error('db blip')).mockImplementation(async (cb: any) => cb(db));
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer');
    expect(res.isFullRefund).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('a finalize that finds the row already finalized writes nothing further (replay safe)', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashLegAmount: null, cashDebtCollectedAmount: 3 }));
    db.purchase.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); // claim ok, flip lost
    await executeVerifiedSquareRefund('pur_1', 100, 'organizer');
    expect(db.organizer.update).not.toHaveBeenCalled();
    expect(reverseMock).not.toHaveBeenCalled();
  });
});

describe('reconcileStuckSquareRefunds (P1-15)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { reconcileStuckSquareRefunds } = require('../services/squareRefundService');
  const stuckRow = (over: any = {}) => makePurchase({ status: 'REFUNDING', cashLegAmount: null, ...over });
  const flips = () => db.purchase.updateMany.mock.calls.map((c: any[]) => c[0]);

  it('finishes a refund Square COMPLETED (matched by its tag): final status from the amounts', async () => {
    db.purchase.findMany.mockResolvedValue([stuckRow()]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['r_old', 'r_new'] } });
    mockRefundsGet
      .mockResolvedValueOnce({ refund: { reason: 'Requested by customer', status: 'COMPLETED' } })
      .mockResolvedValueOnce({ refund: { reason: 'x [FindA.Sale ref pur_1:0:10000:a]', status: 'COMPLETED' } });
    const summary = await reconcileStuckSquareRefunds({ olderThanMinutes: 1 });
    expect(summary).toMatchObject({ checked: 1, finalized: 1, revertedToPaid: 0, errors: 0 });
    const flip = flips().find((f: any) => 'refundedAmount' in f.data);
    expect(flip.data).toMatchObject({ status: 'REFUNDED', refundedAmount: 100, refundInitiatedBy: 'admin' });
  });

  it('a partially refunded purchase reconciles to PAID with the cumulative amount', async () => {
    db.purchase.findMany.mockResolvedValue([stuckRow()]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['r1'] } });
    mockRefundsGet.mockResolvedValue({ refund: { reason: '[FindA.Sale ref pur_1:0:2500:o]', status: 'COMPLETED' } });
    await reconcileStuckSquareRefunds({});
    expect(flips().find((f: any) => 'refundedAmount' in f.data).data).toMatchObject({ status: 'PAID', refundedAmount: 25 });
  });

  it('no tagged refund at Square: nothing moved, so the purchase goes back to PAID', async () => {
    db.purchase.findMany.mockResolvedValue([stuckRow()]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: [] } });
    const summary = await reconcileStuckSquareRefunds({});
    expect(summary.revertedToPaid).toBe(1);
    expect(flips()).toEqual([{ where: { id: 'pur_1', status: 'REFUNDING' }, data: { status: 'PAID' } }]);
  });

  it('a PENDING refund is left alone for the next sweep', async () => {
    db.purchase.findMany.mockResolvedValue([stuckRow()]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['r1'] } });
    mockRefundsGet.mockResolvedValue({ refund: { reason: '[FindA.Sale ref pur_1:0:10000:o]', status: 'PENDING' } });
    const summary = await reconcileStuckSquareRefunds({});
    expect(summary.stillPending).toBe(1);
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });

  it('a Square lookup failure leaves the row untouched and is counted', async () => {
    db.purchase.findMany.mockResolvedValue([stuckRow()]);
    mockPaymentsGet.mockRejectedValue(new Error('square down'));
    const summary = await reconcileStuckSquareRefunds({});
    expect(summary.errors).toBe(1);
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });
});

describe('POS fulfillment failure refund (P1-10)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { refundFailedPosFulfillment, reconcilePosFulfillmentFailures } = require('../services/squareRefundService');
  const posReq = (over: any = {}) => ({
    id: 'req_1',
    status: 'FULFILLMENT_FAILED',
    processor: 'SQUARE',
    organizerId: 'org_1',
    squarePaymentId: 'sq_pay_1',
    cardAmountCents: 6000,
    totalAmountCents: 10000,
    ...over,
  });

  it('refunds the captured CARD amount with a deterministic key, then marks the request REFUNDED', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq());
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    mockRefundPayment.mockResolvedValue({ refund: { id: 'sqr_9', status: 'PENDING' } });
    const res = await refundFailedPosFulfillment('req_1');
    expect(res).toEqual({ status: 'REFUNDED', squareRefundId: 'sqr_9' });
    const req = mockRefundPayment.mock.calls[0][0];
    expect(req.idempotencyKey).toBe('pos-fulfil-refund-req_1');
    expect(req.paymentId).toBe('sq_pay_1');
    expect(req.amountMoney).toEqual({ amount: BigInt(6000), currency: 'USD' });
    expect(db.pOSPaymentRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'req_1', status: 'FULFILLMENT_FAILED' }, data: { status: 'REFUNDED' } });
  });

  it('a Square failure stays FULFILLMENT_FAILED (retryable) and alerts, never throws', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq());
    mockRefundPayment.mockRejectedValue(new Error('square down'));
    const res = await refundFailedPosFulfillment('req_1');
    expect(res.status).toBe('REFUND_PENDING');
    expect(db.pOSPaymentRequest.updateMany).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a rejected Square refund is treated as pending, not done', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq());
    mockRefundPayment.mockResolvedValue({ refund: { id: 'sqr_9', status: 'REJECTED' } });
    expect((await refundFailedPosFulfillment('req_1')).status).toBe('REFUND_PENDING');
    expect(db.pOSPaymentRequest.updateMany).not.toHaveBeenCalled();
  });

  it('already REFUNDED is a no-op success (replayed confirm); other states are not applicable', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq({ status: 'REFUNDED' }));
    expect((await refundFailedPosFulfillment('req_1')).status).toBe('REFUNDED');
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq({ status: 'PAID' }));
    expect((await refundFailedPosFulfillment('req_1')).status).toBe('NOT_APPLICABLE');
    db.pOSPaymentRequest.findUnique.mockResolvedValue(null);
    expect((await refundFailedPosFulfillment('req_1')).status).toBe('NOT_APPLICABLE');
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('with no card amount recorded it falls back to the request total', async () => {
    db.pOSPaymentRequest.findUnique.mockResolvedValue(posReq({ cardAmountCents: null }));
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    mockRefundPayment.mockResolvedValue({ refund: { id: 'sqr_9', status: 'COMPLETED' } });
    await refundFailedPosFulfillment('req_1');
    expect(mockRefundPayment.mock.calls[0][0].amountMoney.amount).toBe(BigInt(10000));
  });

  it('the sweep retries every stuck request and reports the split', async () => {
    db.pOSPaymentRequest.findMany.mockResolvedValue([{ id: 'req_1' }, { id: 'req_2' }]);
    db.pOSPaymentRequest.findUnique
      .mockResolvedValueOnce(posReq({ id: 'req_1' }))
      .mockResolvedValueOnce(posReq({ id: 'req_2', squarePaymentId: 'sq_pay_2' }));
    db.pOSPaymentRequest.updateMany.mockResolvedValue({ count: 1 });
    mockRefundPayment.mockResolvedValueOnce({ refund: { id: 'a', status: 'COMPLETED' } }).mockRejectedValueOnce(new Error('down'));
    expect(await reconcilePosFulfillmentFailures({})).toEqual({ checked: 2, refunded: 1, pending: 1 });
  });
});
