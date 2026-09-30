/**
 * squareWebhookController, payment review finding 3 (2026-09-30): an event row left PENDING by a crashed
 * handler used to be skipped forever, losing the payment. A PENDING row older than 5 minutes (and a FAILED row)
 * is now re-claimed with an ATOMIC conditional update so two simultaneous retries cannot both process it, and
 * the auction-purchase branch flips PENDING -> PAID conditionally. Prisma and Square are mocks.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
const mockVerifySignature = jest.fn();
jest.mock('square', () => ({ WebhooksHelper: { verifySignature: (...a: any[]) => mockVerifySignature(...a) } }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    processedWebhookEvent: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    pOSPaymentLink: { findFirst: jest.fn() },
    holdInvoice: { findFirst: jest.fn(), findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    purchase: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../services/squareRefundService', () => ({ handleSquareDisputeWebhook: jest.fn() }));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({ markHoldInvoicePaid: jest.fn() }));
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({ HOLD_INVOICE_NOTE_KEY: 'invoiceId' }));
const mockEngagement = jest.fn();
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: (...a: any[]) => mockEngagement(...a) }));
jest.mock('../services/posPaymentLinkRecorder', () => ({ recordPosPaymentLinkSale: jest.fn() }));

import { prisma } from '../lib/prisma';
import {
  claimSquareWebhookEvent,
  handleSquareWebhook,
  processSquareWebhookEvent,
  syncSquarePaymentStatus,
  SQUARE_WEBHOOK_PENDING_STALE_MS,
} from '../controllers/squareWebhookController';

const db: any = prisma;
const KEY = 'square:evt_1';
const ago = (ms: number) => new Date(Date.now() - ms);
const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });

beforeEach(() => {
  jest.clearAllMocks();
  db.processedWebhookEvent.create.mockReset();
  db.processedWebhookEvent.findUnique.mockReset();
  db.processedWebhookEvent.updateMany.mockReset();
  db.processedWebhookEvent.update.mockReset().mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('claimSquareWebhookEvent', () => {
  it('a new event is claimed by the insert', async () => {
    db.processedWebhookEvent.create.mockResolvedValue({});
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: true, via: 'NEW' });
  });

  it('a COMPLETED duplicate is skipped', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'COMPLETED', updatedAt: ago(60 * 60 * 1000) });
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: false, reason: 'COMPLETED' });
  });

  it('a PENDING row younger than 5 minutes is in flight: skipped, nothing claimed', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'PENDING', updatedAt: ago(60 * 1000) });
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: false, reason: 'IN_FLIGHT' });
    expect(db.processedWebhookEvent.updateMany).not.toHaveBeenCalled();
  });

  it('a PENDING row older than 5 minutes is re-claimed atomically and reprocessed', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'PENDING', updatedAt: ago(SQUARE_WEBHOOK_PENDING_STALE_MS + 60 * 1000) });
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: true, via: 'STALE_PENDING_RETRY' });
    const arg = db.processedWebhookEvent.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ eventId: KEY, status: 'PENDING' });
    expect(arg.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(arg.data.updatedAt).toBeInstanceOf(Date);
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('stale PENDING'), expect.anything());
  });

  it('a stale PENDING row that another retry claimed first is skipped', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'PENDING', updatedAt: ago(10 * 60 * 1000) });
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: false, reason: 'LOST_CLAIM' });
  });

  it('a FAILED row is re-claimed with a conditional update (status FAILED -> PENDING)', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'FAILED', updatedAt: ago(1000) });
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: true, via: 'FAILED_RETRY' });
    expect(db.processedWebhookEvent.updateMany.mock.calls[0][0].where).toEqual({ eventId: KEY, status: 'FAILED' });
  });

  it('a non-unique insert error still lets the event process (fail open, as before)', async () => {
    db.processedWebhookEvent.create.mockRejectedValue(new Error('db hiccup'));
    expect(await claimSquareWebhookEvent(KEY, 'evt_1')).toEqual({ proceed: true, via: 'CHECK_ERROR' });
  });

  it('TWO simultaneous retries of a stale PENDING row: exactly one processes', async () => {
    // A stateful fake row: updateMany evaluates its WHERE against the current row and applies atomically.
    const row: any = { eventId: KEY, status: 'PENDING', updatedAt: ago(SQUARE_WEBHOOK_PENDING_STALE_MS + 5000) };
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockImplementation(async () => ({ ...row }));
    db.processedWebhookEvent.updateMany.mockImplementation(async ({ where, data }: any) => {
      const matches =
        row.eventId === where.eventId &&
        (where.status === undefined || row.status === where.status) &&
        (where.updatedAt?.lt === undefined || row.updatedAt < where.updatedAt.lt);
      if (!matches) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const [a, b] = await Promise.all([claimSquareWebhookEvent(KEY, 'evt_1'), claimSquareWebhookEvent(KEY, 'evt_1')]);
    expect([a.proceed, b.proceed].filter(Boolean)).toHaveLength(1);
  });

  it('TWO simultaneous retries of a FAILED row: exactly one processes', async () => {
    const row: any = { eventId: KEY, status: 'FAILED', updatedAt: ago(5000) };
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
    db.processedWebhookEvent.findUnique.mockImplementation(async () => ({ ...row }));
    db.processedWebhookEvent.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (row.eventId !== where.eventId || row.status !== where.status) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const [a, b] = await Promise.all([claimSquareWebhookEvent(KEY, 'evt_1'), claimSquareWebhookEvent(KEY, 'evt_1')]);
    expect([a.proceed, b.proceed].filter(Boolean)).toHaveLength(1);
  });
});

describe('handleSquareWebhook with a stale PENDING row', () => {
  const makeRes = () => {
    const res: any = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeReq = () => ({
    headers: { 'x-square-hmacsha256-signature': 'sig' },
    body: Buffer.from(JSON.stringify({ type: 'refund.updated', event_id: 'evt_1', merchant_id: 'M1', data: { object: { refund: { id: 'r1', status: 'COMPLETED', payment_id: 'p1' } } } })),
  } as any);

  beforeEach(() => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-signature-material';
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = 'https://example.test/hook';
    mockVerifySignature.mockResolvedValue(true);
    db.processedWebhookEvent.create.mockRejectedValue(p2002());
  });

  it('reprocesses an event left PENDING for over 5 minutes and marks it COMPLETED', async () => {
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'PENDING', updatedAt: ago(SQUARE_WEBHOOK_PENDING_STALE_MS + 1000) });
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await handleSquareWebhook(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(db.processedWebhookEvent.update).toHaveBeenCalledWith({ where: { eventId: KEY }, data: { status: 'COMPLETED' } });
  });

  it('still skips a PENDING event a live handler owns (younger than 5 minutes)', async () => {
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'PENDING', updatedAt: ago(30 * 1000) });
    const res = makeRes();
    await handleSquareWebhook(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    expect(db.processedWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('a retry that loses the claim answers 200 duplicate without processing', async () => {
    db.processedWebhookEvent.findUnique.mockResolvedValue({ eventId: KEY, status: 'FAILED', updatedAt: ago(1000) });
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await handleSquareWebhook(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
  });
});

describe('the verified event body is stored on the idempotency row (2026-09-30)', () => {
  const body = { type: 'refund.updated', event_id: 'evt_store', merchant_id: 'M1', data: { object: { refund: { id: 'r1', status: 'COMPLETED', payment_id: 'p1' } } } };
  const makeRes = () => {
    const res: any = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('claimSquareWebhookEvent inserts the payload with the PENDING row when one is passed', async () => {
    db.processedWebhookEvent.create.mockResolvedValue({});
    await claimSquareWebhookEvent(KEY, 'evt_1', body);
    expect(db.processedWebhookEvent.create).toHaveBeenCalledWith({ data: { eventId: KEY, status: 'PENDING', payload: body } });
  });

  it('without a payload the insert is unchanged', async () => {
    db.processedWebhookEvent.create.mockResolvedValue({});
    await claimSquareWebhookEvent(KEY, 'evt_1');
    expect(db.processedWebhookEvent.create).toHaveBeenCalledWith({ data: { eventId: KEY, status: 'PENDING' } });
  });

  it('handleSquareWebhook stores the parsed, signature-verified event on claim', async () => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-signature-material';
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = 'https://example.test/hook';
    mockVerifySignature.mockResolvedValue(true);
    db.processedWebhookEvent.create.mockResolvedValue({});
    const res = makeRes();
    await handleSquareWebhook({ headers: { 'x-square-hmacsha256-signature': 'sig' }, body: Buffer.from(JSON.stringify(body)) } as any, res);
    const arg = db.processedWebhookEvent.create.mock.calls[0][0].data;
    expect(arg).toMatchObject({ eventId: 'square:evt_store', status: 'PENDING' });
    expect(arg.payload).toEqual(body);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('an unverified body is never stored', async () => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-signature-material';
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = 'https://example.test/hook';
    mockVerifySignature.mockResolvedValue(false);
    const res = makeRes();
    await handleSquareWebhook({ headers: { 'x-square-hmacsha256-signature': 'sig' }, body: Buffer.from(JSON.stringify(body)) } as any, res);
    expect(db.processedWebhookEvent.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('processSquareWebhookEvent (the function the sweep re-drives) dispatches a stored event', async () => {
    await expect(processSquareWebhookEvent(body as any)).resolves.toBeUndefined();
  });
});

describe('auction purchase branch is idempotent', () => {
  const payment = { id: 'sqpay_9', status: 'COMPLETED', order_id: 'order_9', amount_money: { amount: 5000, currency: 'USD' } };

  beforeEach(() => {
    db.pOSPaymentLink.findFirst.mockResolvedValue(null);
    db.holdInvoice.findFirst.mockResolvedValue(null);
    db.purchase.findFirst.mockReset();
    db.purchase.updateMany.mockReset();
  });

  it('flips PENDING -> PAID with a conditional update and fires engagement once', async () => {
    db.purchase.findFirst.mockResolvedValueOnce({ id: 'pur_1', itemId: 'it1', status: 'PENDING' });
    db.purchase.updateMany.mockResolvedValue({ count: 1 });
    await syncSquarePaymentStatus('payment.updated', payment, 'M1');
    expect(db.purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'pur_1', status: 'PENDING' },
      data: { status: 'PAID', squarePaymentId: 'sqpay_9' },
    });
    expect(db.purchase.update).not.toHaveBeenCalled();
    expect(mockEngagement).toHaveBeenCalledTimes(1);
    expect(mockEngagement).toHaveBeenCalledWith('pur_1');
  });

  it('a delivery that loses the flip race does not award engagement a second time', async () => {
    db.purchase.findFirst.mockResolvedValueOnce({ id: 'pur_1', itemId: 'it1', status: 'PENDING' });
    db.purchase.updateMany.mockResolvedValue({ count: 0 });
    await syncSquarePaymentStatus('payment.updated', payment, 'M1');
    expect(mockEngagement).not.toHaveBeenCalled();
  });

  it('a crash-retry finds the row already PAID and re-fires the (idempotent) engagement award', async () => {
    db.purchase.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pur_1' });
    await syncSquarePaymentStatus('payment.updated', payment, 'M1');
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
    expect(db.purchase.findFirst.mock.calls[1][0].where).toMatchObject({ status: 'PAID', squarePaymentId: 'sqpay_9' });
    expect(mockEngagement).toHaveBeenCalledWith('pur_1');
  });

  it('a payment matching nothing is still ignored', async () => {
    db.purchase.findFirst.mockResolvedValue(null);
    await syncSquarePaymentStatus('payment.updated', payment, 'M1');
    expect(mockEngagement).not.toHaveBeenCalled();
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });
});
