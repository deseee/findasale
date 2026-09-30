/**
 * Card-not-present (CNP) surcharge refunds (2026-09-30): services/squareRefundService.ts
 * executeVerifiedSquareRefund, buildSquareRefundTag / parseSquareRefundTag,
 * reconcileStuckSquareRefunds.
 *
 * DECISION: the manual-card surcharge (3.5% + $0.15) is refunded proportionally to the principal
 * refunded. Purchase.amount EXCLUDES it; Purchase.cnpSurchargeCents records the row's share.
 * The Square refund = principal + surcharge share (integer cents, cumulative across partial refunds).
 * Status, the refund cap and every fee reversal stay on PRINCIPAL.
 *
 * Run: pnpm --filter backend test -- squareRefundCnpSurcharge
 *
 * A $100.00 manual-card sale: surcharge = round(10000 * 0.035) + 15 = 365 cents.
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
import {
  executeVerifiedSquareRefund,
  buildSquareRefundTag,
  parseSquareRefundTag,
  reconcileStuckSquareRefunds,
  buildSquareRefundIdempotencyKey,
} from '../services/squareRefundService';
import { reverseSplitCashCommissionForRefund as mockedReverse } from '../services/cashFeeRefundReversalService';

const db: any = prisma;
const reverseMock = mockedReverse as unknown as jest.Mock;

const makePurchase = (over: any = {}) => ({
  id: 'pur_1',
  processor: 'SQUARE',
  status: 'PAID',
  squarePaymentId: 'sq_pay_1',
  amount: 100,
  cashLegAmount: null,
  cnpSurchargeCents: 365,
  createdAt: new Date(),
  userId: null,
  itemId: null,
  boothCartTransactionId: null,
  platformFeeAmount: 8,
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
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.organizer.updateMany.mockResolvedValue({ count: 1 });
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 0 });
  reverseMock.mockResolvedValue({ status: 'REVERSED', reversedCents: 0, appliedCents: 0, shortfallCents: 0 });
});

const lastSquareCall = () => mockRefundPayment.mock.calls[mockRefundPayment.mock.calls.length - 1][0];
const finalizeData = () =>
  db.purchase.updateMany.mock.calls.find((c: any[]) => c[0].where.status === 'REFUNDING' && 'refundedAmount' in c[0].data)[0].data;

describe('full refund of a surcharged purchase', () => {
  it('asks Square for principal + the whole surcharge and reports it', async () => {
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer', 'requested_by_customer');
    expect(lastSquareCall().amountMoney).toEqual({ amount: BigInt(10365), currency: 'USD' });
    expect(lastSquareCall().idempotencyKey).toBe(buildSquareRefundIdempotencyKey('pur_1', 0, 10365));
    expect(res.refundedAmount).toBe(100); // principal only
    expect(res.surchargeRefundedAmount).toBe(3.65);
    expect(res.totalSurchargeRefunded).toBe(3.65);
    expect(res.refundedWithSurchargeAmount).toBe(103.65);
    expect(res.isFullRefund).toBe(true);
    const data = finalizeData();
    expect(data.status).toBe('REFUNDED');
    expect(data.refundedAmount).toBe(100); // tracked on principal: never inflated by the surcharge
  });

  it('the reason keeps the original ref tag (parsable) plus the cnp marker, within Square\'s 192 chars', async () => {
    await executeVerifiedSquareRefund('pur_1', 100, 'organizer', 'requested_by_customer');
    const reason: string = lastSquareCall().reason;
    expect(reason).toContain('Requested by customer');
    expect(reason).toContain('[FindA.Sale ref pur_1:0:10000:o]');
    expect(reason).toContain('[cnp 365]');
    expect(reason.length).toBeLessThanOrEqual(192);
    expect(parseSquareRefundTag(reason)).toEqual({ purchaseId: 'pur_1', priorCents: 0, amountCents: 10000, initiatedBy: 'organizer', surchargeCents: 365 });
  });
});

describe('two partial refunds are cumulative and can never exceed amount + surcharge', () => {
  it('first partial $33.33, then the remaining $66.67: 3455 + 6910 = 10365 cents', async () => {
    const first = await executeVerifiedSquareRefund('pur_1', 33.33, 'admin');
    expect(lastSquareCall().amountMoney.amount).toBe(BigInt(3455)); // 3333 + 122
    expect(first.isFullRefund).toBe(false);
    expect(finalizeData().status).toBe('PAID'); // partial stays PAID, item stays sold
    expect(finalizeData().refundedAmount).toBe(33.33);
    expect(first.surchargeRefundedAmount).toBe(1.22);
    expect(first.totalSurchargeRefunded).toBe(1.22);

    jest.clearAllMocks();
    mockRefundPayment.mockResolvedValue({});
    db.purchase.findUnique.mockResolvedValue(makePurchase({ refundedAmount: 33.33 }));
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));

    const second = await executeVerifiedSquareRefund('pur_1', 66.67, 'admin');
    expect(lastSquareCall().amountMoney.amount).toBe(BigInt(6910)); // 6667 + 243
    expect(lastSquareCall().idempotencyKey).toBe(buildSquareRefundIdempotencyKey('pur_1', 3333, 6910)); // distinct key for a later refund
    expect(second.surchargeRefundedAmount).toBe(2.43);
    expect(second.totalSurchargeRefunded).toBe(3.65);
    expect(second.isFullRefund).toBe(true);
    expect(finalizeData().status).toBe('REFUNDED');
    expect(finalizeData().refundedAmount).toBe(100);
    // 3455 + 6910 = 10365 = 10000 principal + 365 surcharge, exactly
  });

  it('three partials always sum to exactly principal + surcharge', async () => {
    const parts = [25.01, 40.33, 34.66];
    let prior = 0;
    let sentCents = 0;
    for (const p of parts) {
      jest.clearAllMocks();
      mockRefundPayment.mockResolvedValue({});
      db.purchase.findUnique.mockResolvedValue(makePurchase({ refundedAmount: prior || null }));
      db.purchase.updateMany.mockResolvedValue({ count: 1 });
      db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
      db.$transaction.mockImplementation(async (cb: any) => cb(db));
      await executeVerifiedSquareRefund('pur_1', p, 'admin');
      sentCents += Number(lastSquareCall().amountMoney.amount);
      prior = Math.round((prior + p) * 100) / 100;
    }
    expect(prior).toBe(100);
    expect(sentCents).toBe(10365);
  });

  it('cannot refund more principal than remains (so the surcharge can never be over-refunded); Square is not called', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ refundedAmount: 60 }));
    await expect(executeVerifiedSquareRefund('pur_1', 40.01, 'organizer')).rejects.toThrow(/cannot exceed/);
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('a fully refunded purchase (nothing left) is rejected before Square', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ refundedAmount: 100, status: 'PAID' }));
    await expect(executeVerifiedSquareRefund('pur_1', 0.01, 'organizer')).rejects.toThrow(/cannot exceed/);
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });
});

describe('a purchase without a surcharge is unchanged', () => {
  it.each([[0], [null], [undefined]])('cnpSurchargeCents %p: principal only, no cnp marker, zero surcharge fields', async (cnp) => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cnpSurchargeCents: cnp }));
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer', 'requested_by_customer');
    expect(lastSquareCall().amountMoney.amount).toBe(BigInt(10000));
    expect(lastSquareCall().reason).toContain('[FindA.Sale ref pur_1:0:10000:o]');
    expect(lastSquareCall().reason).not.toContain('[cnp');
    expect(res.surchargeRefundedAmount).toBe(0);
    expect(res.totalSurchargeRefunded).toBe(0);
    expect(res.refundedWithSurchargeAmount).toBe(100);
  });
});

describe('split-tender purchase with a surcharge (surcharge was only charged on the card leg)', () => {
  // $100 sale: $40 cash, $60 card; surcharge charged on the $60 card leg = round(6000*0.035)+15 = 225
  const splitPurchase = (over: any = {}) => makePurchase({ cashLegAmount: 40, cnpSurchargeCents: 225, ...over });

  it('full refund: Square gets card principal 6000 + full surcharge 225; the cash leg is handed back by hand', async () => {
    db.purchase.findUnique.mockResolvedValue(splitPurchase());
    const res = await executeVerifiedSquareRefund('pur_1', 100, 'organizer');
    expect(lastSquareCall().amountMoney.amount).toBe(BigInt(6225));
    expect(res.cashPortionToRefundByHand).toBe(40);
    expect(res.surchargeRefundedAmount).toBe(2.25);
  });

  it('a $30 refund that fits inside the card leg returns half the surcharge (113 of 225)', async () => {
    db.purchase.findUnique.mockResolvedValue(splitPurchase());
    const res = await executeVerifiedSquareRefund('pur_1', 30, 'organizer');
    expect(lastSquareCall().amountMoney.amount).toBe(BigInt(3113));
    expect(res.surchargeRefundedAmount).toBe(1.13);
    expect(finalizeData().status).toBe('PAID');
  });

  it('a whole-sale-in-cash row (no card leg) sends nothing to Square and refunds no surcharge', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ amount: 40, cashLegAmount: 40, cnpSurchargeCents: 0 }));
    const res = await executeVerifiedSquareRefund('pur_1', 40, 'organizer');
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(res.surchargeRefundedAmount).toBe(0);
  });
});

describe('the surcharge is never platform revenue or fee base', () => {
  it('debt re-accrual and status follow principal only: a full refund re-accrues exactly the recorded debt', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashDebtCollectedAmount: 3 }));
    await executeVerifiedSquareRefund('pur_1', 100, 'dispute');
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 3 });
  });

  it('a half refund re-accrues half the debt, not a surcharge-inflated share', async () => {
    db.purchase.findUnique.mockResolvedValue(makePurchase({ cashDebtCollectedAmount: 3 }));
    await executeVerifiedSquareRefund('pur_1', 50, 'dispute');
    expect(db.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 1.5 });
  });

  it('Square is never given an app_fee_money override (it refunds the platform fee proportionally itself)', async () => {
    await executeVerifiedSquareRefund('pur_1', 50, 'organizer');
    expect('appFeeMoney' in lastSquareCall()).toBe(false);
  });

  it('restores PAID and rethrows when Square rejects a surcharged refund', async () => {
    // A DEFINITIVE rejection (HTTP 4xx): nothing was refunded, so PAID is restored. An ambiguous failure
    // (timeout / 5xx) deliberately leaves REFUNDING instead; see squareRefundStateHandling.test.ts.
    mockRefundPayment.mockRejectedValue(Object.assign(new Error('square says no'), { statusCode: 400 }));
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toThrow('square says no');
    expect(db.purchase.updateMany).toHaveBeenLastCalledWith({ where: { id: 'pur_1', status: 'REFUNDING' }, data: { status: 'PAID' } });
  });
});

describe('refund tag build and parse', () => {
  it('a tag without a surcharge is byte-for-byte the original format and parses as before', () => {
    const tag = buildSquareRefundTag('pur_9', 1500, 2500, 'admin');
    expect(tag).toBe('[FindA.Sale ref pur_9:1500:2500:a]');
    expect(parseSquareRefundTag(`Duplicate charge ${tag}`)).toEqual({ purchaseId: 'pur_9', priorCents: 1500, amountCents: 2500, initiatedBy: 'admin' });
  });

  it('a tag with a surcharge share adds a separate marker and round-trips', () => {
    const tag = buildSquareRefundTag('pur_9', 0, 10000, 'dispute', 365);
    expect(tag).toBe('[FindA.Sale ref pur_9:0:10000:d] [cnp 365]');
    expect(parseSquareRefundTag(tag)).toEqual({ purchaseId: 'pur_9', priorCents: 0, amountCents: 10000, initiatedBy: 'dispute', surchargeCents: 365 });
  });

  it('an OLD-style parser (the original regex) still matches a new tag', () => {
    const tag = buildSquareRefundTag('pur_9', 0, 10000, 'organizer', 365);
    const m = /\[FindA\.Sale ref ([^:\]\s]+):(\d+):(\d+):([oad])\]/.exec(`Requested by customer ${tag}`);
    expect(m && [m[1], m[2], m[3], m[4]]).toEqual(['pur_9', '0', '10000', 'o']);
  });

  it('returns null for text without a tag', () => {
    expect(parseSquareRefundTag('Requested by customer')).toBeNull();
    expect(parseSquareRefundTag(undefined)).toBeNull();
  });
});

describe('reconcileStuckSquareRefunds still matches a surcharged refund by its tag', () => {
  it('finishes a stuck refund whose Square reason carries the ref tag and cnp marker', async () => {
    const stuck = makePurchase({ status: 'REFUNDING', updatedAt: new Date(Date.now() - 3600 * 1000) });
    db.purchase.findMany.mockResolvedValue([stuck]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['rf_1'] } });
    mockRefundsGet.mockResolvedValue({ refund: { id: 'rf_1', status: 'COMPLETED', reason: `Requested by customer ${buildSquareRefundTag('pur_1', 0, 10000, 'organizer', 365)}` } });

    const summary = await reconcileStuckSquareRefunds();
    expect(summary.finalized).toBe(1);
    expect(summary.errors).toBe(0);
    expect(finalizeData().status).toBe('REFUNDED');
    expect(finalizeData().refundedAmount).toBe(100);
    // the recomputed surcharge share agrees with the marker, so no mismatch alert
    expect(Sentry.captureMessage).not.toHaveBeenCalledWith(expect.stringContaining('CNP surcharge share'), expect.anything());
  });

  it('alerts (never blocks) when the marker disagrees with the recomputed share', async () => {
    const stuck = makePurchase({ status: 'REFUNDING', updatedAt: new Date(Date.now() - 3600 * 1000) });
    db.purchase.findMany.mockResolvedValue([stuck]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['rf_1'] } });
    mockRefundsGet.mockResolvedValue({ refund: { id: 'rf_1', status: 'COMPLETED', reason: buildSquareRefundTag('pur_1', 0, 10000, 'organizer', 999) } });

    const summary = await reconcileStuckSquareRefunds();
    expect(summary.finalized).toBe(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('CNP surcharge share'), expect.anything());
  });

  it('a refund with no surcharge marker still reconciles exactly as before', async () => {
    const stuck = makePurchase({ status: 'REFUNDING', cnpSurchargeCents: 0, updatedAt: new Date(Date.now() - 3600 * 1000) });
    db.purchase.findMany.mockResolvedValue([stuck]);
    mockPaymentsGet.mockResolvedValue({ payment: { refundIds: ['rf_1'] } });
    mockRefundsGet.mockResolvedValue({ refund: { id: 'rf_1', status: 'COMPLETED', reason: buildSquareRefundTag('pur_1', 0, 10000, 'admin') } });
    const summary = await reconcileStuckSquareRefunds();
    expect(summary.finalized).toBe(1);
  });
});
