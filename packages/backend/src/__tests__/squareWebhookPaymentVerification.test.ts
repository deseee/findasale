/**
 * squareWebhookController.syncSquarePaymentStatus, money review P1-3 (2026-09-29): a COMPLETED Square
 * payment must match the record it claims to pay before anything is marked PAID.
 *   - payment.order_id equals the stored order id (when one is stored)
 *   - amount_money >= the expected card-leg cents (a tip only adds), currency USD
 *   - the event merchant equals the organizer's stored merchant, the payment location equals the stored location
 * A mismatch is a Sentry warning and an early return (webhook still answers 200): NOTHING is recorded.
 * Applies to the direct order-id match, the paymentNote decode path and POSPaymentLink.
 * Prisma and the recorders are mocks.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
jest.mock('square', () => ({ WebhooksHelper: { verifySignature: jest.fn() } }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    pOSPaymentLink: { findFirst: jest.fn() },
    holdInvoice: { findFirst: jest.fn(), findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    purchase: { findFirst: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../services/squareRefundService', () => ({ handleSquareDisputeWebhook: jest.fn() }));
const mockMarkPaid = jest.fn();
jest.mock('../services/holdInvoicePaymentRecorder', () => ({ markHoldInvoicePaid: (...a: any[]) => mockMarkPaid(...a) }));
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({ HOLD_INVOICE_NOTE_KEY: 'invoiceId' }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
const mockRecordLink = jest.fn();
jest.mock('../services/posPaymentLinkRecorder', () => ({ recordPosPaymentLinkSale: (...a: any[]) => mockRecordLink(...a) }));

import { prisma } from '../lib/prisma';
import { syncSquarePaymentStatus, verifySquarePaymentAgainstRecord } from '../controllers/squareWebhookController';

const db: any = prisma;

const payment = (over: any = {}) => ({
  id: 'sqpay_1',
  status: 'COMPLETED',
  order_id: 'order_1',
  location_id: 'LOC1',
  amount_money: { amount: 2500, currency: 'USD' },
  note: 'invoiceId=inv_1',
  ...over,
});

const invoiceRow = (over: any = {}) => ({
  id: 'inv_1',
  squareOrderId: 'order_1',
  totalAmount: 2500,
  cashAmountCents: null,
  cardAmountCents: 2500,
  sale: { organizerId: 'org_1' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.pOSPaymentLink.findFirst.mockResolvedValue(null);
  db.holdInvoice.findFirst.mockResolvedValue({ id: 'inv_1' });
  db.holdInvoice.findUnique.mockResolvedValue(invoiceRow());
  db.organizer.findUnique.mockResolvedValue({ squareMerchantId: 'MERCH1', squareLocationId: 'LOC1' });
  db.purchase.findFirst.mockResolvedValue(null);
  mockMarkPaid.mockResolvedValue({ recorded: true, alreadyPaid: false });
  mockRecordLink.mockResolvedValue({ recorded: true, alreadyCompleted: false });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('syncSquarePaymentStatus, hold invoice by order id', () => {
  it('a payment that matches the invoice records it', async () => {
    await syncSquarePaymentStatus('payment.updated', payment(), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledWith('inv_1', { processor: 'SQUARE', externalPaymentId: 'sqpay_1' }, { source: 'webhook' });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('a tip on top of the invoice amount still records', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 3000, currency: 'USD' } }), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('a payment for LESS than the card leg is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 100, currency: 'USD' } }), 'MERCH1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('PAYMENT-MISMATCH'), expect.objectContaining({ level: 'warning' }));
  });

  it('a bigint amount from the SDK is understood', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: BigInt(2500), currency: 'USD' } }), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('a non-USD payment is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 2500, currency: 'CAD' } }), 'MERCH1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('a payment from another merchant is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment(), 'SOMEONE_ELSE');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockCaptureMessage.mock.calls[0][0]).toContain("not the organizer's merchant");
  });

  it('a payment taken at another location is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ location_id: 'OTHER' }), 'MERCH1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('a cash + card invoice only needs the card leg covered', async () => {
    db.holdInvoice.findUnique.mockResolvedValue(invoiceRow({ totalAmount: 5000, cashAmountCents: 2500, cardAmountCents: 2500 }));
    await syncSquarePaymentStatus('payment.updated', payment(), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('only COMPLETED payment.updated events are considered', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ status: 'APPROVED' }), 'MERCH1');
    await syncSquarePaymentStatus('payment.created', payment(), 'MERCH1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(db.holdInvoice.findFirst).not.toHaveBeenCalled();
  });
});

describe('syncSquarePaymentStatus, paymentNote decode path', () => {
  beforeEach(() => {
    db.holdInvoice.findFirst.mockResolvedValue(null); // the order id matches no invoice directly
  });

  it('a note naming an invoice whose stored order is DIFFERENT is not recorded (a note is not proof)', async () => {
    db.holdInvoice.findUnique.mockResolvedValue(invoiceRow({ squareOrderId: 'order_other' }));
    await syncSquarePaymentStatus('payment.updated', payment({ order_id: 'order_forged' }), 'MERCH1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockCaptureMessage.mock.calls[0][0]).toContain('does not match the stored order');
  });

  it('a note whose order matches is recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment(), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('a legacy invoice with no stored order id still records when the amount and merchant check out', async () => {
    db.holdInvoice.findUnique.mockResolvedValue(invoiceRow({ squareOrderId: null }));
    await syncSquarePaymentStatus('payment.updated', payment(), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('an invoice id that does not exist goes to the recorder unchanged (it logs and records nothing)', async () => {
    db.holdInvoice.findUnique.mockResolvedValue(null);
    mockMarkPaid.mockResolvedValue({ recorded: false, alreadyPaid: false });
    await syncSquarePaymentStatus('payment.updated', payment(), 'MERCH1');
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
  });
});

describe('syncSquarePaymentStatus, POSPaymentLink', () => {
  const link = (over: any = {}) => ({ id: 'link_1', squareOrderId: 'order_1', amount: 4000, isSplitPayment: false, cardAmountCents: null, organizerId: 'org_1', ...over });

  beforeEach(() => {
    db.pOSPaymentLink.findFirst.mockResolvedValue(link());
  });

  it('a matching payment records the link sale', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 4000, currency: 'USD' } }), 'MERCH1');
    expect(mockRecordLink).toHaveBeenCalledTimes(1);
  });

  it('an underpayment is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 3999, currency: 'USD' } }), 'MERCH1');
    expect(mockRecordLink).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalled();
  });

  it('a split link is checked against its card amount, not the full amount', async () => {
    db.pOSPaymentLink.findFirst.mockResolvedValue(link({ isSplitPayment: true, cardAmountCents: 1500 }));
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 1500, currency: 'USD' } }), 'MERCH1');
    expect(mockRecordLink).toHaveBeenCalledTimes(1);
  });

  it('a payment from another merchant is not recorded', async () => {
    await syncSquarePaymentStatus('payment.updated', payment({ amount_money: { amount: 4000, currency: 'USD' } }), 'INTRUDER');
    expect(mockRecordLink).not.toHaveBeenCalled();
  });
});

describe('verifySquarePaymentAgainstRecord', () => {
  const base = { kind: 'HOLD_INVOICE' as const, recordId: 'inv_1', payment: payment(), storedOrderId: 'order_1', expectedCardCents: 2500, organizerProfileId: 'org_1', envelopeMerchantId: 'MERCH1' };

  it('ok when everything matches', async () => {
    await expect(verifySquarePaymentAgainstRecord(base)).resolves.toEqual({ ok: true });
  });

  it('a payment with no readable amount is rejected', async () => {
    const r = await verifySquarePaymentAgainstRecord({ ...base, payment: payment({ amount_money: undefined }) });
    expect(r.ok).toBe(false);
  });

  it('skips the merchant check (with a warning) when the event carries no merchant id', async () => {
    const r = await verifySquarePaymentAgainstRecord({ ...base, envelopeMerchantId: undefined });
    expect(r).toEqual({ ok: true });
  });
});
