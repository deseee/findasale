/**
 * P1-12 sale reminder unsubscribe type + P2 snooze webhook batch handling and GET /status (2026-09-29).
 * Prisma, the suppression list and the MailerLite snooze service are jest mocks. No network.
 */
const mockTokenFindUnique = jest.fn();
const mockTokenDelete = jest.fn();
const mockTokenFindFirst = jest.fn();
const mockTokenCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserFindUnique = jest.fn();
const mockSubUpdateMany = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    unsubscribeToken: {
      findUnique: (...a: unknown[]) => mockTokenFindUnique(...a),
      delete: (...a: unknown[]) => mockTokenDelete(...a),
      findFirst: (...a: unknown[]) => mockTokenFindFirst(...a),
      create: (...a: unknown[]) => mockTokenCreate(...a),
    },
    user: { update: (...a: unknown[]) => mockUserUpdate(...a), findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    saleSubscriber: { updateMany: (...a: unknown[]) => mockSubUpdateMany(...a) },
  },
}));
const mockProcessOptOut = jest.fn();
const mockClearOptOut = jest.fn();
jest.mock('../services/suppressionService', () => ({
  suppressionService: { processOptOut: (...a: unknown[]) => mockProcessOptOut(...a), clearOptOut: (...a: unknown[]) => mockClearOptOut(...a) },
}));
const mockSnooze = jest.fn();
jest.mock('../services/snoozeService', () => ({
  snoozeSubscriber: (...a: unknown[]) => mockSnooze(...a),
  checkAndReactivateSnoozes: jest.fn(),
  reactivateSubscriber: jest.fn(),
}));

import crypto from 'crypto';
import { handleUnsubscribe, resubscribe, generateUnsubscribeToken } from '../controllers/unsubscribeController';
import { handleMailerLiteWebhook, extractWebhookEvents, isUnsubscribeEvent, getSnoozeStatus } from '../controllers/snoozeController';

const mkRes = () => {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
  };
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTokenDelete.mockResolvedValue({});
  mockUserUpdate.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 2 });
  mockProcessOptOut.mockResolvedValue(undefined);
  mockSnooze.mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('unsubscribe type saleReminders', () => {
  const tokenFor = (type: string, prefs: Record<string, unknown> = { priceAlerts: true }) => ({
    token: 'tok',
    type,
    user: { id: 'u1', email: 'jane.doe@example.com', notificationPrefs: prefs },
  });

  it('turns off emailSaleReminders (merged into existing prefs), marks the subscriber rows and burns the token', async () => {
    mockTokenFindUnique.mockResolvedValue(tokenFor('saleReminders'));
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({ priceAlerts: true, emailSaleReminders: false });
    expect(mockSubUpdateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { emailOptOutAt: expect.any(Date) } });
    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { token: 'tok' } });
    expect(res.body.label).toBe('sale day reminders');
  });

  it('does not answer with the full email address', async () => {
    mockTokenFindUnique.mockResolvedValue(tokenFor('saleReminders'));
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, res);
    expect(JSON.stringify(res.body)).not.toContain('jane.doe');
    expect(res.body.email).toBe('j***@example.com');
  });

  it('still succeeds when the emailOptOutAt column is missing (migration not applied yet)', async () => {
    mockTokenFindUnique.mockResolvedValue(tokenFor('saleReminders'));
    mockSubUpdateMany.mockRejectedValue(Object.assign(new Error('column does not exist'), { code: 'P2022' }));
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it('an old newSales token still works and touches only that preference', async () => {
    mockTokenFindUnique.mockResolvedValue(tokenFor('newSales'));
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, res);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({ priceAlerts: true, emailNewSalesFromFollowed: false });
    expect(mockSubUpdateMany).not.toHaveBeenCalled();
  });

  it('unsubscribing from everything also stops reminders', async () => {
    mockTokenFindUnique.mockResolvedValue(tokenFor('all'));
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, res);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs.emailSaleReminders).toBe(false);
    expect(mockSubUpdateMany).toHaveBeenCalled();
    expect(mockProcessOptOut).toHaveBeenCalledWith('jane.doe@example.com');
  });

  it('unknown token is 404 and an unknown type is 400', async () => {
    mockTokenFindUnique.mockResolvedValue(null);
    const a = mkRes();
    await handleUnsubscribe({ query: { token: 'nope' } } as any, a);
    expect(a.statusCode).toBe(404);
    mockTokenFindUnique.mockResolvedValue(tokenFor('bogus'));
    const b = mkRes();
    await handleUnsubscribe({ query: { token: 'tok' } } as any, b);
    expect(b.statusCode).toBe(400);
  });

  it('resubscribing to saleReminders turns the preference back on and clears the row flag', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', notificationPrefs: { emailSaleReminders: false } });
    const res = mkRes();
    await resubscribe({ user: { id: 'u1' }, body: { type: 'saleReminders' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs.emailSaleReminders).toBe(true);
    expect(mockSubUpdateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { emailOptOutAt: null } });
  });

  it('tokens are random 256-bit hex values', async () => {
    mockTokenFindFirst.mockResolvedValue(null);
    mockTokenCreate.mockImplementation(async ({ data }: any) => data);
    const t = await generateUnsubscribeToken('u1', 'saleReminders');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(mockTokenCreate.mock.calls[0][0].data.type).toBe('saleReminders');
  });
});

describe('MailerLite webhook: batches', () => {
  const SECRET = 'whsec';
  const send = async (payload: unknown) => {
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    const res = mkRes();
    await handleMailerLiteWebhook({ body: raw, headers: { signature } }, res);
    return res;
  };
  beforeEach(() => {
    process.env.MAILERLITE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.MAILERLITE_WEBHOOK_SECRET;
  });

  it('snoozes EVERY unsubscribe in a batch, once per distinct address', async () => {
    const res = await send({
      events: [
        { type: 'subscriber.unsubscribed', data: { subscriber: { email: 'A@example.com' } } },
        { type: 'subscriber.unsubscribed', data: { subscriber: { email: 'b@example.com' } } },
        { type: 'subscriber.unsubscribed', data: { subscriber: { email: 'a@example.com' } } },
        { type: 'subscriber.created', data: { subscriber: { email: 'c@example.com' } } },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(mockSnooze.mock.calls.map((c) => c[0]).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(res.body).toMatchObject({ processed: 2, ignored: 1 });
  });

  it('an event with no recognized unsubscribe name is ignored, not snoozed', async () => {
    const res = await send({ data: { email: 'x@example.com' } });
    expect(res.statusCode).toBe(200);
    expect(mockSnooze).not.toHaveBeenCalled();
    expect(res.body.message).toBe('Event ignored');
  });

  it('a single-event body still works', async () => {
    const res = await send({ type: 'subscriber.unsubscribed', data: { email: 'x@example.com' } });
    expect(res.statusCode).toBe(200);
    expect(mockSnooze).toHaveBeenCalledWith('x@example.com', 30);
  });

  it('an unsubscribe event without an email is a 400', async () => {
    const res = await send({ events: [{ type: 'subscriber.unsubscribed', data: {} }] });
    expect(res.statusCode).toBe(400);
  });

  it('a failed snooze answers 500 so MailerLite retries, after trying the rest', async () => {
    mockSnooze.mockRejectedValueOnce(new Error('ml down')).mockResolvedValue(undefined);
    const res = await send({
      events: [
        { type: 'subscriber.unsubscribed', data: { subscriber: { email: 'a@example.com' } } },
        { type: 'subscriber.unsubscribed', data: { subscriber: { email: 'b@example.com' } } },
      ],
    });
    expect(res.statusCode).toBe(500);
    expect(mockSnooze).toHaveBeenCalledTimes(2);
  });

  it('rejects a bad signature and a missing secret in production', async () => {
    const res = mkRes();
    await handleMailerLiteWebhook({ body: Buffer.from('{}'), headers: { signature: 'bad' } }, res);
    expect(res.statusCode).toBe(401);
    delete process.env.MAILERLITE_WEBHOOK_SECRET;
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res2 = mkRes();
    await handleMailerLiteWebhook({ body: Buffer.from('{}'), headers: {} }, res2);
    process.env.NODE_ENV = prev;
    expect(res2.statusCode).toBe(503);
  });

  it('never logs a full email address', async () => {
    await send({ events: [{ type: 'subscriber.unsubscribed', data: { subscriber: { email: 'private.person@example.com' } } }] });
    const logged = [...(console.log as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('private.person');
  });

  it('extractWebhookEvents and isUnsubscribeEvent', () => {
    expect(extractWebhookEvents({ events: [{ type: 'a', data: { email: 'x@y.co' } }, { event: 'b', email: 'z@y.co' }] })).toEqual([
      { name: 'a', email: 'x@y.co' },
      { name: 'b', email: 'z@y.co' },
    ]);
    expect(extractWebhookEvents({ events: Array.from({ length: 500 }, () => ({ type: 'subscriber.unsubscribed', data: { email: 'a@b.co' } })) })).toHaveLength(100);
    expect(isUnsubscribeEvent('subscriber.unsubscribed')).toBe(true);
    expect(isUnsubscribeEvent('subscriber.created')).toBe(false);
    expect(isUnsubscribeEvent(null)).toBe(false);
  });
});

describe('GET /snooze/status', () => {
  it('answers 501 instead of a made-up "not snoozed"', async () => {
    const res = mkRes();
    await getSnoozeStatus({ query: { email: 'me@example.com' }, user: { email: 'me@example.com', roles: [] } } as any, res);
    expect(res.statusCode).toBe(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
  });

  it('still refuses looking up someone else\'s address', async () => {
    const res = mkRes();
    await getSnoozeStatus({ query: { email: 'other@example.com' }, user: { email: 'me@example.com', roles: [] } } as any, res);
    expect(res.statusCode).toBe(403);
  });
});
