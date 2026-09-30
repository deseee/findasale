/**
 * posStrandedSaleReconcileCron.sweepStaleSquareWebhookEvents, payment review finding 3 (2026-09-30): `square:`
 * webhook events left PENDING for over 10 minutes. A row that stores the verified payload is claimed atomically and
 * RE-DRIVEN through processSquareWebhookEvent (retried once, FAILED plus Sentry on a second throw, capped per run);
 * a row with no payload is alerted on and flipped to FAILED with a conditional update. Prisma, Sentry and the
 * webhook handler are mocks.
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: (...a: any[]) => mockCaptureException(...a) }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    pOSPaymentLink: { findMany: jest.fn(), findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    processedWebhookEvent: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({}) }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn() }));
jest.mock('../services/posPaymentLinkRecorder', () => ({ recordPosPaymentLinkSale: jest.fn() }));
jest.mock('../services/squareCheckoutLinkService', () => ({ getSquareOrderPaymentStatus: jest.fn(), deleteSquareCheckoutLink: jest.fn() }));
jest.mock('../services/holdInvoiceSquareRelease', () => ({ prepareSquareInvoiceForRelease: jest.fn() }));
const mockProcessEvent = jest.fn();
jest.mock('../controllers/squareWebhookController', () => ({ processSquareWebhookEvent: (...a: any[]) => mockProcessEvent(...a) }));

import { prisma } from '../lib/prisma';
import { sweepStaleSquareWebhookEvents, SQUARE_WEBHOOK_SWEEP_STALE_MS, SQUARE_WEBHOOK_REDRIVE_CAP } from '../jobs/posStrandedSaleReconcileCron';

const ZERO = { checked: 0, markedFailed: 0, redriven: 0, redriveFailed: 0, deferred: 0 };

const db: any = prisma;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.POS_RECONCILE_DISABLED;
  db.processedWebhookEvent.findMany.mockReset();
  db.processedWebhookEvent.updateMany.mockReset();
  mockProcessEvent.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sweepStaleSquareWebhookEvents', () => {
  it('queries only square: events still PENDING for over 10 minutes', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([]);
    const out = await sweepStaleSquareWebhookEvents();
    expect(out).toEqual(ZERO);
    const where = db.processedWebhookEvent.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.eventId).toEqual({ startsWith: 'square:' });
    const cutoffAgeMs = Date.now() - where.updatedAt.lt.getTime();
    expect(cutoffAgeMs).toBeGreaterThanOrEqual(SQUARE_WEBHOOK_SWEEP_STALE_MS - 1000);
    expect(cutoffAgeMs).toBeLessThan(SQUARE_WEBHOOK_SWEEP_STALE_MS + 5000);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('flips each stale event WITHOUT a stored payload to FAILED with a conditional update and raises one Sentry warning', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([
      { eventId: 'square:a', updatedAt: new Date(Date.now() - 3600 * 1000) },
      { eventId: 'square:b', updatedAt: new Date(Date.now() - 1800 * 1000) },
    ]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    const out = await sweepStaleSquareWebhookEvents();
    expect(out).toEqual({ ...ZERO, checked: 2, markedFailed: 2 });
    expect(mockProcessEvent).not.toHaveBeenCalled();
    const first = db.processedWebhookEvent.updateMany.mock.calls[0][0];
    expect(first.where).toMatchObject({ eventId: 'square:a', status: 'PENDING' });
    expect(first.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(first.data).toEqual({ status: 'FAILED' });
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage.mock.calls[0][1].extra).toMatchObject({ count: 2, markedFailed: 2, redriven: 0, oldest: 'square:a' });
  });

  it('an event a redelivery re-claimed in the meantime (count 0) is left alone', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([{ eventId: 'square:a', updatedAt: new Date(Date.now() - 3600 * 1000) }]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    const out = await sweepStaleSquareWebhookEvents();
    expect(out).toEqual({ ...ZERO, checked: 1 });
  });

  it('never throws: a database error is reported to Sentry and swallowed', async () => {
    db.processedWebhookEvent.findMany.mockRejectedValue(new Error('db down'));
    await expect(sweepStaleSquareWebhookEvents()).resolves.toEqual(ZERO);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('honours the POS_RECONCILE_DISABLED kill switch', async () => {
    process.env.POS_RECONCILE_DISABLED = '1';
    await sweepStaleSquareWebhookEvents();
    expect(db.processedWebhookEvent.findMany).not.toHaveBeenCalled();
  });
});

describe('sweepStaleSquareWebhookEvents: re-driving a stored payload', () => {
  const evt = (id: string) => ({ event_id: id, type: 'payment.updated', data: { object: { payment: { id: 'p_' + id } } } });
  const row = (id: string, payload: unknown = evt(id)) => ({ eventId: `square:${id}`, updatedAt: new Date(Date.now() - 3600 * 1000), payload });

  it('claims the row atomically, re-drives the stored event through the handler and marks it COMPLETED', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([row('a')]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockProcessEvent.mockResolvedValue(undefined);
    const out = await sweepStaleSquareWebhookEvents();
    expect(out).toEqual({ ...ZERO, checked: 1, redriven: 1 });
    expect(mockProcessEvent).toHaveBeenCalledTimes(1);
    expect(mockProcessEvent.mock.calls[0][0]).toMatchObject({ event_id: 'a', type: 'payment.updated' });
    const calls = db.processedWebhookEvent.updateMany.mock.calls.map((c: any[]) => c[0]);
    // 1st: the claim (moves updatedAt, conditional on PENDING and stale). 2nd: terminal COMPLETED.
    expect(calls[0].where).toMatchObject({ eventId: 'square:a', status: 'PENDING' });
    expect(calls[0].where.updatedAt.lt).toBeInstanceOf(Date);
    expect(calls[0].data.updatedAt).toBeInstanceOf(Date);
    expect(calls[1]).toEqual({ where: { eventId: 'square:a', status: 'PENDING' }, data: { status: 'COMPLETED' } });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('a row a redelivery re-claimed first (claim count 0) is not driven at all', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([row('a')]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    const out = await sweepStaleSquareWebhookEvents();
    expect(out).toEqual({ ...ZERO, checked: 1 });
    expect(mockProcessEvent).not.toHaveBeenCalled();
  });

  it('retries once after a throw and completes when the second attempt succeeds', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([row('a')]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockProcessEvent.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(undefined);
    const out = await sweepStaleSquareWebhookEvents();
    expect(mockProcessEvent).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ...ZERO, checked: 1, redriven: 1 });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('marks the row FAILED and raises Sentry only after a second throw', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([row('a')]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockProcessEvent.mockRejectedValue(new Error('still broken'));
    const out = await sweepStaleSquareWebhookEvents();
    expect(mockProcessEvent).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ...ZERO, checked: 1, markedFailed: 1, redriveFailed: 1 });
    const calls = db.processedWebhookEvent.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(calls[calls.length - 1]).toEqual({ where: { eventId: 'square:a', status: 'PENDING' }, data: { status: 'FAILED' } });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][1].tags).toMatchObject({ sweep: 'stale-square-webhook-redrive' });
  });

  it('a payload that is not a Square event (missing event_id or type) is treated as no payload', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([row('a', { foo: 'bar' }), row('b', 'text')]);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    const out = await sweepStaleSquareWebhookEvents();
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(out).toEqual({ ...ZERO, checked: 2, markedFailed: 2 });
  });

  it('re-drives at most SQUARE_WEBHOOK_REDRIVE_CAP events per run and leaves the rest PENDING for the next tick', async () => {
    const many = Array.from({ length: SQUARE_WEBHOOK_REDRIVE_CAP + 4 }, (_, i) => row(`e${i}`));
    db.processedWebhookEvent.findMany.mockResolvedValue(many);
    db.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    mockProcessEvent.mockResolvedValue(undefined);
    const out = await sweepStaleSquareWebhookEvents();
    expect(mockProcessEvent).toHaveBeenCalledTimes(SQUARE_WEBHOOK_REDRIVE_CAP);
    expect(out.redriven).toBe(SQUARE_WEBHOOK_REDRIVE_CAP);
    expect(out.deferred).toBe(4);
    expect(out.markedFailed).toBe(0);
    const touched = db.processedWebhookEvent.updateMany.mock.calls.map((c: any[]) => c[0].where.eventId);
    expect(touched).not.toContain(`square:e${SQUARE_WEBHOOK_REDRIVE_CAP}`);
  });

  it('selects the payload column', async () => {
    db.processedWebhookEvent.findMany.mockResolvedValue([]);
    await sweepStaleSquareWebhookEvents();
    expect(db.processedWebhookEvent.findMany.mock.calls[0][0].select).toMatchObject({ eventId: true, payload: true });
  });
});
