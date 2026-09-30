/**
 * Notify Me double opt-in flow (P1, 2026-09-29): anonymous captures never email a third party until the
 * address is confirmed, and the public endpoint is not an oracle for who is subscribed. Prisma, the
 * transactional email rail and the limiter store are mocks; nothing is sent.
 */
const mockSearch = { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
const mockWait = { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), create: jest.fn() };
const mockUser = { findUnique: jest.fn() };
jest.mock('../lib/prisma', () => ({ prisma: { searchNotification: mockSearch, shopperWaitlistEntry: mockWait, user: mockUser } }));

const mockSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
  isEmailDomainBlocked: (e: string) => e.endsWith('@blocked.example'),
}));

const mockSessionUser = jest.fn();
function mockCounterStore() {
  const counts = new Map<string, number>();
  return {
    init: () => undefined,
    increment: async (k: string) => {
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return { totalHits: n, resetTime: new Date(Date.now() + 86400000) };
    },
  };
}
jest.mock('../middleware/rateLimitShared', () => ({
  createRateLimitStore: () => mockCounterStore(),
  getVerifiedSessionUserId: (...a: any[]) => mockSessionUser(...a),
}));
jest.mock('../middleware/auth', () => ({ authenticate: (_q: any, _s: any, n: any) => n() }));
jest.mock('../middleware/rateLimiter', () => ({ searchLimiter: (_q: any, _s: any, n: any) => n() }));

import { notifyOnSearch, PENDING_CONFIRMATION_MESSAGE, MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY } from '../controllers/searchNotificationController';
import router from '../routes/shopperWaitlist';
import { signNotifyConfirmToken, signNotifyMeToken } from '../services/notifyMeSenderService';

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r));
};
function mockRes() {
  const res: any = { statusCode: 200, body: undefined, html: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  res.type = jest.fn(() => res);
  res.send = jest.fn((b: any) => { res.html = b; return res; });
  return res;
}
const post = async (body: any) => {
  const res = mockRes();
  await notifyOnSearch({ body } as any, res);
  await flush();
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockSessionUser.mockReturnValue(null);
  mockUser.findUnique.mockResolvedValue(null);
  mockSearch.findMany.mockResolvedValue([]);
  mockSearch.create.mockResolvedValue({});
  mockSearch.update.mockResolvedValue({});
  mockSearch.updateMany.mockResolvedValue({ count: 1 });
  mockWait.updateMany.mockResolvedValue({ count: 0 });
  mockSend.mockResolvedValue({ sent: true });
});

describe('POST /api/search/notify (anonymous double opt-in)', () => {
  it('creates an UNCONFIRMED entry and sends one generic-subject confirmation email', async () => {
    const res = await post({ email: 'New@Example.com', query: 'Brass Lamp', city: 'Paw Paw' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'pending_confirmation', message: PENDING_CONFIRMATION_MESSAGE });
    const data = mockSearch.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'new@example.com', searchQuery: 'brass lamp', confirmedAt: null, isActive: true });
    expect(data.armedAt).toBeInstanceOf(Date);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toBe('new@example.com');
    expect(mail.subject).toBe('Confirm your FindA.Sale alert');
    expect(mail.subject).not.toMatch(/lamp/i);
    expect(mail.html).toContain('/api/shopper/waitlist/confirm?token=');
    expect(mail.html).toContain('/api/shopper/waitlist/unsubscribe?token=');
  });

  it('returns a byte-identical response for new, existing, opted-out and capped addresses (no oracle, no 409)', async () => {
    const fresh = await post({ email: 'a1@example.com', query: 'lamp' });

    mockSearch.findMany.mockResolvedValue([{ id: 'r1', searchQuery: 'lamp', isActive: true, notifiedAt: null, confirmedAt: new Date(), expiredAt: null }]);
    const existing = await post({ email: 'a2@example.com', query: 'lamp' });

    mockSearch.findMany.mockResolvedValue([{ id: 'r2', searchQuery: 'lamp', isActive: false, notifiedAt: null, confirmedAt: new Date(), expiredAt: null }]);
    const optedOut = await post({ email: 'a3@example.com', query: 'lamp' });

    mockSearch.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, searchQuery: `q${i}`, isActive: true, notifiedAt: null, confirmedAt: new Date(), expiredAt: null })));
    const capped = await post({ email: 'a4@example.com', query: 'a new one' });

    for (const r of [existing, optedOut, capped]) {
      expect(r.statusCode).toBe(fresh.statusCode);
      expect(r.body).toEqual(fresh.body);
    }
    expect(mockSearch.create).toHaveBeenCalledTimes(1); // only the genuinely new one wrote
  });

  it('an opted-out address is not re-subscribed by an anonymous caller', async () => {
    mockSearch.findMany.mockResolvedValue([{ id: 'r2', searchQuery: 'lamp', isActive: false, notifiedAt: null, confirmedAt: new Date(), expiredAt: null }]);
    await post({ email: 'optout@example.com', query: 'lamp' });
    expect(mockSearch.create).not.toHaveBeenCalled();
    expect(mockSearch.update).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('an anonymous caller never inherits an earlier confirmation: a fired alert is re-armed UNCONFIRMED', async () => {
    mockSearch.findMany.mockResolvedValue([{ id: 'r1', searchQuery: 'lamp', isActive: true, notifiedAt: new Date(), confirmedAt: new Date(), expiredAt: null }]);
    await post({ email: 'victim@example.com', query: 'lamp' });
    const data = mockSearch.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isActive: true, expiredAt: null, notifiedAt: null, confirmedAt: null });
    expect(data.armedAt).toBeInstanceOf(Date);
    expect(mockSend).toHaveBeenCalledTimes(1); // asks the real owner to confirm
  });

  it('an expired alert (expiredAt set) may be re-armed; it is not treated as an opt-out', async () => {
    mockSearch.findMany.mockResolvedValue([{ id: 'r1', searchQuery: 'lamp', isActive: false, notifiedAt: null, confirmedAt: new Date(), expiredAt: new Date() }]);
    await post({ email: 'aged@example.com', query: 'lamp' });
    expect(mockSearch.update).toHaveBeenCalledTimes(1);
    expect(mockSearch.update.mock.calls[0][0].data.expiredAt).toBeNull();
  });

  it('the signed-in owner of the address is confirmed immediately and gets honest answers', async () => {
    mockSessionUser.mockReturnValue('u1');
    mockUser.findUnique.mockResolvedValue({ email: 'Me@Example.com' });
    const res = await post({ email: 'me@example.com', query: 'desk' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('created');
    expect(mockSearch.create.mock.calls[0][0].data.confirmedAt).toBeInstanceOf(Date);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a signed-in user adding someone ELSE\'s address is treated as anonymous (needs that person\'s click)', async () => {
    mockSessionUser.mockReturnValue('u1');
    mockUser.findUnique.mockResolvedValue({ email: 'me@example.com' });
    const res = await post({ email: 'other@example.com', query: 'desk' });
    expect(res.body.status).toBe('pending_confirmation');
    expect(mockSearch.create.mock.calls[0][0].data.confirmedAt).toBeNull();
  });

  it('throttles confirmation emails per address per day, without changing the response', async () => {
    const results = [];
    for (let i = 0; i < MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY + 3; i++) {
      results.push(await post({ email: 'spam-target@example.com', query: `q${i}` }));
    }
    expect(mockSend).toHaveBeenCalledTimes(MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY);
    for (const r of results) expect(r.body).toEqual(results[0].body);
  });

  it('a confirmation email failure never changes the response', async () => {
    mockSend.mockRejectedValue(new Error('resend down'));
    const res = await post({ email: 'x1@example.com', query: 'lamp' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('pending_confirmation');
  });

  it('a unique-constraint race is reported as the same pending response', async () => {
    mockSearch.create.mockRejectedValue({ code: 'P2002' });
    const res = await post({ email: 'race@example.com', query: 'lamp' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('pending_confirmation');
  });

  it('still validates input and refuses blocked domains with a 400', async () => {
    expect((await post({ email: 'nope', query: 'lamp' })).statusCode).toBe(400);
    expect((await post({ email: 'a@example.com', query: 'x' })).statusCode).toBe(400);
    expect((await post({ email: 'me@blocked.example', query: 'lamp' })).statusCode).toBe(400);
    expect(mockSearch.create).not.toHaveBeenCalled();
  });
});

function routeHandler(method: 'get' | 'post', path: string): (req: any, res: any) => Promise<any> {
  const layer = (router as any).stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('public confirm / unsubscribe routes', () => {
  it('GET /confirm with a valid token confirms that email\'s pending alerts', async () => {
    const token = signNotifyConfirmToken('Person@Example.com') as string;
    const res = mockRes();
    await routeHandler('get', '/confirm')({ query: { token } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockSearch.updateMany).toHaveBeenCalledWith({
      where: { email: 'person@example.com', isActive: true, confirmedAt: null },
      data: { confirmedAt: expect.any(Date) },
    });
    expect(res.html).toContain('You are confirmed');
  });

  it('GET /confirm rejects garbage, an expired token and an UNSUBSCRIBE token (domain separation)', async () => {
    const expired = signNotifyConfirmToken('p@example.com', Date.now() - 10 * 86400000, 1000) as string;
    const unsub = signNotifyMeToken('p@example.com') as string;
    for (const token of ['', 'garbage', expired, unsub]) {
      const res = mockRes();
      await routeHandler('get', '/confirm')({ query: { token } }, res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockSearch.updateMany).not.toHaveBeenCalled();
  });

  it('POST /unsubscribe (RFC 8058 one-click) deactivates every alert for the token email', async () => {
    const token = signNotifyMeToken('p@example.com') as string;
    const res = mockRes();
    await routeHandler('post', '/unsubscribe')({ query: { token } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockSearch.updateMany).toHaveBeenCalledWith({ where: { email: 'p@example.com', isActive: true }, data: { isActive: false } });
    expect(mockWait.updateMany).toHaveBeenCalled();
  });

  it('POST /unsubscribe refuses a confirm token and a bad token', async () => {
    for (const token of [signNotifyConfirmToken('p@example.com') as string, 'nope']) {
      const res = mockRes();
      await routeHandler('post', '/unsubscribe')({ query: { token } }, res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockSearch.updateMany).not.toHaveBeenCalled();
  });

  it('GET /unsubscribe still works for the emailed link', async () => {
    const token = signNotifyMeToken('p@example.com') as string;
    const res = mockRes();
    await routeHandler('get', '/unsubscribe')({ query: { token } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('You are unsubscribed');
  });
});

describe('logged-in waitlist stamps armedAt', () => {
  it('create writes armedAt; re-arming a fired entry moves armedAt forward and clears notifiedAt', async () => {
    mockWait.findFirst.mockResolvedValueOnce(null);
    mockWait.count.mockResolvedValue(0);
    mockWait.create.mockImplementation(async ({ data }: any) => ({ id: 'w1', ...data }));
    const h = routeHandler('post', '/');
    const res = mockRes();
    await h({ user: { id: 'u1' }, body: { itemType: 'Brass Lamp' } }, res);
    expect(res.statusCode).toBe(201);
    expect(mockWait.create.mock.calls[0][0].data.armedAt).toBeInstanceOf(Date);

    mockWait.findFirst.mockResolvedValueOnce({ id: 'w1', notifiedAt: new Date() });
    mockWait.update.mockImplementation(async ({ data }: any) => ({ id: 'w1', ...data }));
    const res2 = mockRes();
    await h({ user: { id: 'u1' }, body: { itemType: 'Brass Lamp' } }, res2);
    expect(res2.statusCode).toBe(200);
    expect(mockWait.update.mock.calls[0][0].data).toMatchObject({ notifiedAt: null });
    expect(mockWait.update.mock.calls[0][0].data.armedAt).toBeInstanceOf(Date);
  });
});
