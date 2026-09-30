/**
 * services/squareDeadInvoiceRefundService partial-amount support (payment review finding 2, 2026-09-30):
 * the oversold items' card share is refunded exactly, never more than was captured, with a deterministic
 * per-(payment id, kind) idempotency key. Square is mocked: no real refund or API call is ever made.
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
var mockPrisma: any = { organizer: { findUnique: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
var mockResolveToken = jest.fn();
jest.mock('../services/squarePaymentService', () => ({
  resolveOrganizerSquareAccessToken: (...args: any[]) => mockResolveToken(...args),
  buildSquareIdempotencyKey: (parts: string[]) => `key:${parts.join(':')}`,
}));
var mockPaymentsGet = jest.fn();
var mockRefund = jest.fn();
jest.mock('../utils/square', () => ({
  getSquareClientForMerchant: () => ({ payments: { get: mockPaymentsGet }, refunds: { refundPayment: mockRefund } }),
}));

import { refundSquarePaymentForDeadInvoice } from '../services/squareDeadInvoiceRefundService';

const input = { invoiceId: 'link-1', organizerId: 'org-1', paymentId: 'pay-1', expectedAmountCents: 5000 };
const goodPayment = (over: any = {}) => ({
  payment: { id: 'pay-1', status: 'COMPLETED', amountMoney: { amount: BigInt(5000), currency: 'USD' }, ...over },
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org-1', squareMerchantId: 'm-1', squareOnboarded: true });
  mockResolveToken.mockResolvedValue('token');
  mockPaymentsGet.mockReset();
  mockPaymentsGet.mockResolvedValue(goodPayment());
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ refund: { id: 'ref-1' } });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('partial refund', () => {
  it('refunds exactly the requested share, flagged partial, with the (payment id, kind) key and the given reason', async () => {
    const out = await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 1999, kind: 'oversold:pos-link:link-1', reasonText: 'An item on your order was no longer available' });
    expect(out).toMatchObject({ refunded: true, refundedCents: 1999, partial: true, refundId: 'ref-1' });
    const call = mockRefund.mock.calls[0][0];
    expect(call.amountMoney).toEqual({ amount: BigInt(1999), currency: 'USD' });
    expect(call.idempotencyKey).toBe('key:sq-refund:pay-1:oversold:pos-link:link-1');
    expect(call.reason).toBe('An item on your order was no longer available');
  });

  it('the same payment and kind always yield the same idempotency key (replay-safe)', async () => {
    await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 1000, kind: 'k1' });
    await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 1000, kind: 'k1' });
    expect(mockRefund.mock.calls[0][0].idempotencyKey).toBe(mockRefund.mock.calls[1][0].idempotencyKey);
  });

  it('a partial amount equal to the captured amount is a full refund, not flagged partial', async () => {
    const out = await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 5000, kind: 'k1' });
    expect(out).toMatchObject({ refunded: true, refundedCents: 5000, partial: false });
  });

  it('refuses an amount above what was captured, and non-positive or fractional amounts, without calling Square refunds', async () => {
    for (const bad of [5001, 0, -5, 12.5]) {
      const out = await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: bad, kind: 'k1' });
      expect(out.refunded).toBe(false);
    }
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('the kill switch still stops a partial refund before any Square call', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    const out = await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 1000, kind: 'k1' });
    expect(out).toMatchObject({ attempted: false, refunded: false });
    expect(mockPaymentsGet).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('a payment that was already partly refunded is not refunded again automatically', async () => {
    mockPaymentsGet.mockResolvedValue(goodPayment({ refundedMoney: { amount: BigInt(100), currency: 'USD' } }));
    const out = await refundSquarePaymentForDeadInvoice({ ...input, refundAmountCents: 1000, kind: 'k1' });
    expect(out.refunded).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('without a kind the legacy per-invoice key and a full refund are unchanged', async () => {
    await refundSquarePaymentForDeadInvoice(input);
    const call = mockRefund.mock.calls[0][0];
    expect(call.idempotencyKey).toBe('key:dead-inv-refund:link-1');
    expect(call.amountMoney).toEqual({ amount: BigInt(5000), currency: 'USD' });
  });
});
