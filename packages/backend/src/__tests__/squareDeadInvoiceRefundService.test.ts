/**
 * services/squareDeadInvoiceRefundService: the guarded full refund of a captured Square payment
 * that cannot be applied to its dead invoice (money review P0-2, 2026-09-29). Square is mocked,
 * so no real refund or API call is ever made.
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

import { refundSquarePaymentForDeadInvoice, squareDeadInvoiceAutoRefundDisabled } from '../services/squareDeadInvoiceRefundService';

const input = { invoiceId: 'inv-1', organizerId: 'org-1', paymentId: 'pay-1', expectedAmountCents: 5000 };
const goodPayment = (over: any = {}) => ({
  payment: { id: 'pay-1', status: 'COMPLETED', amountMoney: { amount: BigInt(5000), currency: 'USD' }, ...over },
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  mockPrisma.organizer.findUnique.mockReset();
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org-1', squareMerchantId: 'm-1', squareOnboarded: true });
  mockResolveToken.mockReset();
  mockResolveToken.mockResolvedValue('token');
  mockPaymentsGet.mockReset();
  mockPaymentsGet.mockResolvedValue(goodPayment());
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ refund: { id: 'ref-1' } });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('refundSquarePaymentForDeadInvoice', () => {
  it('refunds a completed payment in full with a deterministic per-invoice idempotency key', async () => {
    const out = await refundSquarePaymentForDeadInvoice(input);
    expect(out).toMatchObject({ attempted: true, refunded: true, refundId: 'ref-1', refundedCents: 5000 });
    const call = mockRefund.mock.calls[0][0];
    expect(call.paymentId).toBe('pay-1');
    expect(call.idempotencyKey).toBe('key:dead-inv-refund:inv-1');
    expect(call.amountMoney).toEqual({ amount: BigInt(5000), currency: 'USD' });
  });

  it('refunds what was actually captured when it is MORE than the card leg (a tip)', async () => {
    mockPaymentsGet.mockResolvedValue(goodPayment({ amountMoney: { amount: BigInt(5500), currency: 'USD' } }));
    const out = await refundSquarePaymentForDeadInvoice(input);
    expect(out.refundedCents).toBe(5500);
  });

  it('the kill switch stops it before any Square call', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    expect(squareDeadInvoiceAutoRefundDisabled()).toBe(true);
    const out = await refundSquarePaymentForDeadInvoice(input);
    expect(out).toMatchObject({ attempted: false, refunded: false });
    expect(mockPaymentsGet).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it.each([
    ['not completed', { status: 'APPROVED' }],
    ['wrong currency', { amountMoney: { amount: BigInt(5000), currency: 'CAD' } }],
    ['nothing captured', { amountMoney: { amount: BigInt(0), currency: 'USD' } }],
    ['already refunded', { refundedMoney: { amount: BigInt(100), currency: 'USD' } }],
    ['captured less than the invoice card leg', { amountMoney: { amount: BigInt(4000), currency: 'USD' } }],
  ])('does NOT refund: %s', async (_name, over) => {
    mockPaymentsGet.mockResolvedValue(goodPayment(over));
    const out = await refundSquarePaymentForDeadInvoice(input);
    expect(out.refunded).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('a payment that cannot be read is not refunded', async () => {
    mockPaymentsGet.mockRejectedValue(new Error('boom'));
    expect((await refundSquarePaymentForDeadInvoice(input)).refunded).toBe(false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('a missing organizer or an unusable token is not refunded and never throws', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue(null);
    expect((await refundSquarePaymentForDeadInvoice(input)).refunded).toBe(false);
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org-1' });
    mockResolveToken.mockRejectedValue(new Error('no token'));
    expect((await refundSquarePaymentForDeadInvoice(input)).refunded).toBe(false);
  });

  it('a refund Square rejects is reported to Sentry and returned as not refunded, never thrown', async () => {
    mockRefund.mockRejectedValue(new Error('declined'));
    const Sentry = jest.requireMock('@sentry/node');
    const out = await refundSquarePaymentForDeadInvoice(input);
    expect(out.refunded).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('no payment id is not refunded', async () => {
    expect((await refundSquarePaymentForDeadInvoice({ ...input, paymentId: '' })).refunded).toBe(false);
  });
});
