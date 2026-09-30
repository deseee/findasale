/**
 * Square refund state handling (2026-09-30, fix agent F): services/squareRefundService.ts
 * executeVerifiedSquareRefund's guarded flow around the RefundPayment call, and the idempotency key.
 *
 *  - token resolution is INSIDE the guarded flow: a failure there restores PAID (no request was sent)
 *  - a DEFINITIVE Square rejection (HTTP 4xx, REJECTED/FAILED status) restores PAID
 *  - an AMBIGUOUS failure after the request went out (timeout, 5xx, network) leaves the purchase
 *    REFUNDING for reconcileStuckSquareRefunds; PAID is never restored (the same money could be refunded twice)
 *  - the idempotency key includes the refund amount and stays within Square's 45 character limit
 *
 * Run: pnpm --filter backend test -- squareRefundStateHandling
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
    holdInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
    cashFeeAccrual: { findFirst: jest.fn(), findMany: jest.fn(), createMany: jest.fn() },
  },
}));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

const mockRefundPayment = jest.fn();
jest.mock('square', () => ({
  SquareClient: jest.fn().mockImplementation(() => ({
    refunds: { refundPayment: mockRefundPayment, get: jest.fn() },
    payments: { get: jest.fn() },
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
  return { ...actual, reverseSplitCashCommissionForRefund: jest.fn().mockResolvedValue({ status: 'REVERSED', reversedCents: 0, appliedCents: 0, shortfallCents: 0 }) };
});

import { prisma } from '../lib/prisma';
import { resolveOrganizerSquareAccessToken } from '../services/squarePaymentService';
import {
  executeVerifiedSquareRefund,
  buildSquareRefundIdempotencyKey,
  isDefinitiveSquareRejection,
} from '../services/squareRefundService';

const db: any = prisma;
const resolveToken = resolveOrganizerSquareAccessToken as unknown as jest.Mock;

const makePurchase = (over: any = {}) => ({
  id: 'clx9abcd0000abcdefghijklm',
  processor: 'SQUARE',
  status: 'PAID',
  squarePaymentId: 'sq_pay_1',
  amount: 100,
  cashLegAmount: null,
  cnpSurchargeCents: 0,
  createdAt: new Date(),
  userId: null,
  itemId: null,
  boothCartTransactionId: null,
  platformFeeAmount: 8,
  cashDebtCollectedAmount: null,
  user: null,
  item: null,
  sale: { organizer: { id: 'org_1', userId: 'user_1', businessName: 'Maple Co', squareMerchantId: 'm1' } },
  ...over,
});

const revertedToPaid = () =>
  db.purchase.updateMany.mock.calls.some((c: any[]) => c[0].where.status === 'REFUNDING' && c[0].data && c[0].data.status === 'PAID' && !('refundedAmount' in c[0].data));

beforeEach(() => {
  jest.clearAllMocks();
  resolveToken.mockResolvedValue('tok');
  mockRefundPayment.mockResolvedValue({ refund: { id: 'rf_1', status: 'PENDING' } });
  db.purchase.findUnique.mockResolvedValue(makePurchase());
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.purchase.update.mockResolvedValue({});
  db.organizer.findUnique.mockResolvedValue({ id: 'org_1', squareMerchantId: 'm1', squareOnboarded: true });
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  db.organizer.updateMany.mockResolvedValue({ count: 1 });
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 0 });
});

describe('buildSquareRefundIdempotencyKey', () => {
  it('is deterministic, includes the amount, and fits Square\'s 45 character limit', () => {
    const id = 'clx9abcd0000abcdefghijklm';
    const a = buildSquareRefundIdempotencyKey(id, 0, 10000);
    expect(buildSquareRefundIdempotencyKey(id, 0, 10000)).toBe(a);
    expect(buildSquareRefundIdempotencyKey(id, 0, 5000)).not.toBe(a); // corrected amount, new key
    expect(buildSquareRefundIdempotencyKey(id, 3000, 10000)).not.toBe(a); // later refund, new key
    expect(a.length).toBeLessThanOrEqual(45);
    // Even a 36 character uuid-style id with a large prior stays inside the limit.
    expect(buildSquareRefundIdempotencyKey('123e4567-e89b-12d3-a456-426614174000', 99999999, 99999999).length).toBeLessThanOrEqual(45);
  });

  it('a retry with a different amount sends a different key to Square', async () => {
    await executeVerifiedSquareRefund('clx9abcd0000abcdefghijklm', 100, 'organizer');
    await executeVerifiedSquareRefund('clx9abcd0000abcdefghijklm', 40, 'organizer');
    const k1 = mockRefundPayment.mock.calls[0][0].idempotencyKey;
    const k2 = mockRefundPayment.mock.calls[1][0].idempotencyKey;
    expect(k1).not.toBe(k2);
  });
});

describe('isDefinitiveSquareRejection', () => {
  it('is true for 4xx (other than 408) and false for timeouts, 5xx and status-less errors', () => {
    expect(isDefinitiveSquareRejection({ statusCode: 400 })).toBe(true);
    expect(isDefinitiveSquareRejection({ statusCode: 404 })).toBe(true);
    expect(isDefinitiveSquareRejection({ statusCode: 429 })).toBe(true);
    expect(isDefinitiveSquareRejection({ statusCode: 408 })).toBe(false);
    expect(isDefinitiveSquareRejection({ statusCode: 500 })).toBe(false);
    expect(isDefinitiveSquareRejection({ statusCode: 503 })).toBe(false);
    expect(isDefinitiveSquareRejection(new Error('socket hang up'))).toBe(false);
  });
});

describe('guarded flow', () => {
  it('a token resolution failure restores PAID (nothing was sent) and rethrows', async () => {
    resolveToken.mockRejectedValue(new Error('db timeout while refreshing the token'));
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toThrow('db timeout');
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(revertedToPaid()).toBe(true);
  });

  it('a definitive Square 4xx restores PAID', async () => {
    mockRefundPayment.mockRejectedValue(Object.assign(new Error('bad request'), { statusCode: 400 }));
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toThrow('bad request');
    expect(revertedToPaid()).toBe(true);
  });

  it('a REJECTED refund status restores PAID', async () => {
    mockRefundPayment.mockResolvedValue({ refund: { id: 'rf_1', status: 'REJECTED' } });
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toMatchObject({ statusCode: 502 });
    expect(revertedToPaid()).toBe(true);
  });

  it.each([
    ['a network timeout', new Error('timeout of 30000ms exceeded')],
    ['a Square 503', Object.assign(new Error('service unavailable'), { statusCode: 503 })],
    ['a request timeout 408', Object.assign(new Error('request timeout'), { statusCode: 408 })],
  ])('%s leaves the purchase REFUNDING for the reconcile sweep and never restores PAID', async (_label, err) => {
    mockRefundPayment.mockRejectedValue(err);
    await expect(executeVerifiedSquareRefund('pur_1', 100, 'organizer')).rejects.toMatchObject({
      statusCode: 502,
      details: expect.objectContaining({ code: 'REFUND_OUTCOME_UNKNOWN' }),
    });
    expect(revertedToPaid()).toBe(false);
    // The only purchase write is the PAID -> REFUNDING claim.
    const writes = db.purchase.updateMany.mock.calls.map((c: any[]) => c[0].data.status);
    expect(writes).toEqual(['REFUNDING']);
  });
});
