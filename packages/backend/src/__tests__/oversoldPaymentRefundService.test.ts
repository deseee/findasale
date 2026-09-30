/**
 * services/oversoldPaymentRefundService (payment review finding 2, 2026-09-30): a captured payment where some or
 * all items could not be fulfilled is refunded by the oversold items' card share (or in full when nothing could be
 * fulfilled), with accurate notification copy. Square, Prisma and email are mocks: no real refund is ever made.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
const mockNotificationCreate = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { notification: { create: (...a: any[]) => mockNotificationCreate(...a) } } }));
const mockRefund = jest.fn();
jest.mock('../services/squareDeadInvoiceRefundService', () => ({
  refundSquarePaymentForDeadInvoice: (...a: any[]) => mockRefund(...a),
  squareDeadInvoiceAutoRefundDisabled: () => process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1',
}));
const mockSendEmail = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: (...a: any[]) => mockSendEmail(...a) } } }));

import {
  computeOversoldSettlement,
  settleOversoldPayment,
  notifyOversoldSettlement,
  buildOversoldCopy,
  describeItems,
  oversoldRefundKind,
} from '../services/oversoldPaymentRefundService';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  mockRefund.mockResolvedValue({ attempted: true, refunded: true, reason: 'REFUNDED_PARTIAL', refundId: 'ref_1', refundedCents: 4000 });
  mockNotificationCreate.mockResolvedValue({});
  mockSendEmail.mockResolvedValue({});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('computeOversoldSettlement', () => {
  it('refunds the oversold row share of the card amount in whole cents', () => {
    const s = computeOversoldSettlement({ cardCents: 10000, cashCents: 0, weightsCents: [6000, 4000], oversoldIdx: [1] });
    expect(s.refundCardCents).toBe(4000);
    expect(s.fullRefund).toBe(false);
    expect(s.cashToReturnCents).toBe(0);
  });

  it('refunds the whole card amount when every row is oversold', () => {
    const s = computeOversoldSettlement({ cardCents: 10050, cashCents: 0, weightsCents: [6000, 4000], oversoldIdx: [0, 1] });
    expect(s.refundCardCents).toBe(10050);
    expect(s.fullRefund).toBe(true);
  });

  it('allocates with largest remainder so per-row shares sum exactly to the card amount', () => {
    const s = computeOversoldSettlement({ cardCents: 1000, cashCents: 0, weightsCents: [333, 333, 334], oversoldIdx: [0] });
    expect(s.cardShares.reduce((a, b) => a + b, 0)).toBe(1000);
    const all = computeOversoldSettlement({ cardCents: 1000, cashCents: 0, weightsCents: [333, 333, 334], oversoldIdx: [0, 1, 2] });
    expect(all.refundCardCents).toBe(1000);
  });

  it('split tender: the cash share of the oversold row goes back to the organizer, not to the card refund', () => {
    // sale of 100.00 = 60.00 card + 40.00 cash over rows 60/40; the 40.00 row is oversold
    const s = computeOversoldSettlement({ cardCents: 6000, cashCents: 4000, weightsCents: [6000, 4000], oversoldIdx: [1] });
    expect(s.refundCardCents).toBe(2400);
    expect(s.cashToReturnCents).toBe(1600);
  });

  it('a zero-weight row yields nothing to refund', () => {
    const s = computeOversoldSettlement({ cardCents: 500, cashCents: 0, weightsCents: [500, 0], oversoldIdx: [1] });
    expect(s.refundCardCents).toBe(0);
  });
});

describe('settleOversoldPayment', () => {
  const settlement = () => computeOversoldSettlement({ cardCents: 10000, cashCents: 0, weightsCents: [6000, 4000], oversoldIdx: [1] });
  const base = { kind: 'pos-link' as const, refId: 'link_1', organizerProfileId: 'org_1', processor: 'SQUARE' as const, paymentId: 'sqpay_1', cardPaidCents: 10000 };

  it('issues a PARTIAL refund of exactly the oversold share with a deterministic (payment, kind) key input', async () => {
    const out = await settleOversoldPayment({ ...base, settlement: settlement() });
    expect(out).toMatchObject({ status: 'REFUNDED', refundCents: 4000, refundId: 'ref_1' });
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({
      paymentId: 'sqpay_1',
      organizerId: 'org_1',
      expectedAmountCents: 10000,
      refundAmountCents: 4000,
      kind: oversoldRefundKind('pos-link', 'link_1'),
    });
  });

  it('a FULL refund (every item oversold) omits the amount so the whole captured payment goes back', async () => {
    const full = computeOversoldSettlement({ cardCents: 10000, cashCents: 0, weightsCents: [6000, 4000], oversoldIdx: [0, 1] });
    await settleOversoldPayment({ ...base, settlement: full });
    expect(mockRefund.mock.calls[0][0].refundAmountCents).toBeUndefined();
  });

  it('the same inputs always produce the same kind (a replay cannot create a second refund key)', () => {
    expect(oversoldRefundKind('hold-invoice', 'inv_9')).toBe(oversoldRefundKind('hold-invoice', 'inv_9'));
    expect(oversoldRefundKind('hold-invoice', 'inv_9')).not.toBe(oversoldRefundKind('pos-link', 'inv_9'));
  });

  it('honours the kill switch: no refund is reported and the caller is told a manual refund is needed', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    mockRefund.mockResolvedValue({ attempted: false, refunded: false, reason: 'DISABLED (SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1)' });
    const out = await settleOversoldPayment({ ...base, settlement: settlement() });
    expect(out.status).toBe('MANUAL');
    expect(out.autoRefundDisabled).toBe(true);
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('could not be refunded'), expect.objectContaining({ level: 'warning' }));
  });

  it('reports a failed refund to Sentry at error level and returns MANUAL', async () => {
    mockRefund.mockResolvedValue({ attempted: true, refunded: false, reason: 'REFUND_FAILED (BAD_REQUEST)' });
    const out = await settleOversoldPayment({ ...base, settlement: settlement() });
    expect(out.status).toBe('MANUAL');
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('could not be refunded'),
      expect.objectContaining({ level: 'error', tags: expect.objectContaining({ resolution: 'manual-refund-needed' }) })
    );
  });

  it('never throws when the refund service throws', async () => {
    mockRefund.mockRejectedValue(new Error('boom'));
    const out = await settleOversoldPayment({ ...base, settlement: settlement() });
    expect(out.status).toBe('MANUAL');
    expect(out.reason).toContain('boom');
  });

  it('a Stripe-processor payment is not auto-refunded (no path) and escalates to manual', async () => {
    const out = await settleOversoldPayment({ ...base, processor: 'STRIPE', settlement: settlement() });
    expect(out.status).toBe('MANUAL');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('an all-cash sale has no card amount: nothing is refunded through the processor', async () => {
    const cashOnly = computeOversoldSettlement({ cardCents: 0, cashCents: 5000, weightsCents: [5000], oversoldIdx: [0] });
    const out = await settleOversoldPayment({ ...base, paymentId: null, cardPaidCents: 0, settlement: cashOnly });
    expect(out.status).toBe('NOTHING_TO_REFUND');
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('notification copy', () => {
  const st = computeOversoldSettlement({ cardCents: 6000, cashCents: 4000, weightsCents: [6000, 4000], oversoldIdx: [1] });
  const refunded = { status: 'REFUNDED' as const, refundCents: st.refundCardCents, reason: 'x', autoRefundDisabled: false };
  const manual = { status: 'MANUAL' as const, refundCents: st.refundCardCents, reason: 'x', autoRefundDisabled: false };

  it('never mentions Stripe, an em dash, or the word AI, in any outcome or processor', () => {
    const cases = [
      buildOversoldCopy({ result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: true }),
      buildOversoldCopy({ result: manual, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: true }),
      buildOversoldCopy({ result: manual, settlement: st, titles: ['Lamp'], processor: 'STRIPE', ref: 'r1', partiallyFulfilled: false }),
      buildOversoldCopy({ result: { ...manual, autoRefundDisabled: true }, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: false }),
    ];
    for (const c of cases) {
      const text = [c.organizerTitle, c.organizerBody, c.shopperTitle, c.shopperBody].join(' ');
      expect(text).not.toMatch(/stripe/i);
      expect(text).not.toMatch(new RegExp('\\u2014|\\u2013'));
      expect(text).not.toMatch(/\bAI\b/);
      expect(text).not.toMatch(/estate sale/i);
    }
  });

  it('a refunded split-tender sale tells the organizer to return the cash part and states the refunded amount', () => {
    const c = buildOversoldCopy({ result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: true });
    expect(c.organizerBody).toContain('$24.00');
    expect(c.organizerBody).toContain('$16.00 in cash');
    expect(c.organizerBody).toContain('return that cash');
    expect(c.shopperBody).toContain('$24.00');
  });

  it('a manual outcome names the Square dashboard for Square and the generic processor for anything else', () => {
    expect(buildOversoldCopy({ result: manual, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: true }).organizerBody).toContain('Square dashboard');
    expect(buildOversoldCopy({ result: manual, settlement: st, titles: ['Lamp'], processor: 'STRIPE', ref: 'r1', partiallyFulfilled: true }).organizerBody).toContain('payment processor dashboard');
  });

  it('says the rest of the sale was recorded only when some items were fulfilled', () => {
    expect(buildOversoldCopy({ result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: true }).organizerBody).toContain('The rest of the sale was recorded');
    expect(buildOversoldCopy({ result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r1', partiallyFulfilled: false }).organizerBody).not.toContain('The rest of the sale was recorded');
  });

  it('describeItems names up to three and counts beyond that', () => {
    expect(describeItems(['A', 'B'])).toBe('"A", "B"');
    expect(describeItems(['A', 'B', 'C', 'D'])).toBe('4 items');
    expect(describeItems([])).toBe('an item');
  });
});

describe('notifyOversoldSettlement', () => {
  const st = computeOversoldSettlement({ cardCents: 10000, cashCents: 0, weightsCents: [6000, 4000], oversoldIdx: [1] });
  const refunded = { status: 'REFUNDED' as const, refundCents: 4000, reason: 'x', autoRefundDisabled: false };

  it('files the organizer notification and, for an account shopper, the shopper notification and email (escaped)', async () => {
    await notifyOversoldSettlement({
      result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'inv_1', partiallyFulfilled: true,
      organizerUserId: 'ou1', organizerLink: '/organizer/sales/s1',
      shopper: { userId: 'u1', email: 's@example.com', name: '<b>Sam</b>', link: '/invoices/inv_1' },
    });
    const types = mockNotificationCreate.mock.calls.map((c) => c[0].data.type);
    expect(types).toEqual(['payment_reconciliation', 'payment_refunded']);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).not.toContain('<b>Sam</b>');
    expect(html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
  });

  it('a POS link has no shopper contact: only the organizer is told', async () => {
    await notifyOversoldSettlement({
      result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'link_1', partiallyFulfilled: true,
      organizerUserId: 'ou1', organizerLink: '/organizer/pos', shopper: null,
    });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('a manual outcome uses the requested manual notification type for the organizer', async () => {
    await notifyOversoldSettlement({
      result: { status: 'MANUAL', refundCents: 4000, reason: 'x', autoRefundDisabled: false }, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'link_1', partiallyFulfilled: true,
      organizerUserId: 'ou1', organizerLink: '/organizer/pos', shopper: null, manualType: 'POS_PAYMENT_NEEDS_REFUND_REVIEW',
    });
    expect(mockNotificationCreate.mock.calls[0][0].data.type).toBe('POS_PAYMENT_NEEDS_REFUND_REVIEW');
  });

  it('never throws when the notification write fails', async () => {
    mockNotificationCreate.mockRejectedValue(new Error('db down'));
    await expect(notifyOversoldSettlement({
      result: refunded, settlement: st, titles: ['Lamp'], processor: 'SQUARE', ref: 'r', partiallyFulfilled: true,
      organizerUserId: 'ou1', organizerLink: '/x', shopper: { userId: 'u1' },
    })).resolves.toBeUndefined();
  });
});
