/**
 * Guest weekend sales email (2026-11-26): email + ZIP signup with double opt-in, stored as a reserved
 * SearchNotification row. Prisma, the email rails and the limiter store are mocks; nothing is sent.
 */
const mockSearch = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsert: jest.fn(),
  updateMany: jest.fn(),
};
const mockUser = { findUnique: jest.fn(), findFirst: jest.fn() };
const mockSale = { aggregate: jest.fn(), findMany: jest.fn() };
const mockLog = { findFirst: jest.fn(), create: jest.fn() };
jest.mock('../lib/prisma', () => ({
  prisma: { searchNotification: mockSearch, user: mockUser, sale: mockSale, emailAutomationLog: mockLog },
}));

const mockSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
const mockIsSuppressed = jest.fn();
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: (...a: any[]) => mockIsSuppressed(...a) },
  isEmailDomainBlocked: (e: string) => e.endsWith('@blocked.example'),
}));
const mockGmailSend = jest.fn();
class MockQuotaExceededError extends Error {}
jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: (...a: any[]) => mockGmailSend(...a) } },
  QuotaExceededError: MockQuotaExceededError,
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
jest.mock('../middleware/rateLimiter', () => ({ searchLimiter: (_q: any, _s: any, n: any) => n() }));
jest.mock('axios', () => ({ get: jest.fn().mockRejectedValue(new Error('no network in tests')) }));

import {
  WEEKEND_DIGEST_QUERY,
  confirmDigestSignup,
  isReservedSearchQuery,
  requestDigestSignup,
  signDigestConfirmToken,
  signDigestUnsubToken,
  unsubscribeDigest,
  verifyDigestConfirmToken,
  verifyDigestUnsubToken,
} from '../services/weekendDigestSignupService';
import { signNotifyMeToken } from '../services/notifyMeSenderService';
import { buildDigestHtml, sendGuestWeeklyDigest } from '../controllers/notificationController';
import router from '../routes/weekendDigest';

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r));
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  mockSessionUser.mockReturnValue(null);
  mockIsSuppressed.mockResolvedValue(false);
  mockSearch.findUnique.mockResolvedValue(null);
  mockSearch.create.mockResolvedValue({});
  mockSearch.update.mockResolvedValue({});
  mockSearch.upsert.mockResolvedValue({});
  mockSearch.updateMany.mockResolvedValue({ count: 1 });
  mockSend.mockResolvedValue({ sent: true });
});

describe('tokens', () => {
  it('round-trips a confirm token with its ZIP and rejects tampering and expiry', () => {
    const t = signDigestConfirmToken('A@Example.com', '49079')!;
    expect(verifyDigestConfirmToken(t)).toEqual({ email: 'a@example.com', zip: '49079' });
    expect(verifyDigestConfirmToken(t.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyDigestConfirmToken(t, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  it('keeps purposes apart: unsubscribe and Notify Me tokens never confirm, and vice versa', () => {
    const unsub = signDigestUnsubToken('a@example.com')!;
    expect(verifyDigestUnsubToken(unsub)).toBe('a@example.com');
    expect(verifyDigestConfirmToken(unsub)).toBeNull();
    expect(verifyDigestUnsubToken(signNotifyMeToken('a@example.com'))).toBeNull();
    expect(verifyDigestUnsubToken(signDigestConfirmToken('a@example.com', '49079'))).toBeNull();
  });

  it('marks "__" queries as reserved', () => {
    expect(isReservedSearchQuery(WEEKEND_DIGEST_QUERY)).toBe(true);
    expect(isReservedSearchQuery('  __anything')).toBe(true);
    expect(isReservedSearchQuery('brass lamp')).toBe(false);
  });
});

describe('requestDigestSignup', () => {
  it('validates email and ZIP', async () => {
    expect(await requestDigestSignup('nope', '49079', null)).toEqual({ ok: false, error: 'invalid_email' });
    expect(await requestDigestSignup('a@example.com', '4907', null)).toEqual({ ok: false, error: 'invalid_zip' });
    expect(await requestDigestSignup('a@blocked.example', '49079', null)).toEqual({ ok: false, error: 'blocked_email' });
    expect(mockSearch.create).not.toHaveBeenCalled();
  });

  it('creates an UNCONFIRMED row and sends one confirmation email carrying the ZIP', async () => {
    const r = await requestDigestSignup('New@Example.com', '49079', null);
    await flush();
    expect(r).toEqual({ ok: true, status: 'pending_confirmation' });
    expect(mockSearch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'new@example.com', searchQuery: WEEKEND_DIGEST_QUERY, city: '49079', confirmedAt: null }),
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const msg = mockSend.mock.calls[0][0];
    expect(msg.to).toBe('new@example.com');
    expect(msg.text).toContain('49079');
    const token = decodeURIComponent(/\/api\/digest\/confirm\?token=([^\s"]+)/.exec(msg.text)![1]);
    expect(verifyDigestConfirmToken(token)).toEqual({ email: 'new@example.com', zip: '49079' });
  });

  it('never changes a CONFIRMED subscriber anonymously (the new ZIP waits for their click)', async () => {
    mockSearch.findUnique.mockResolvedValue({ id: 'r1', isActive: true, confirmedAt: new Date(), expiredAt: null, city: '49079' });
    const r = await requestDigestSignup('a@example.com', '49001', null);
    await flush();
    expect(r).toEqual({ ok: true, status: 'pending_confirmation' });
    expect(mockSearch.update).not.toHaveBeenCalled();
    expect(mockSearch.create).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to an address that unsubscribed, with the same response', async () => {
    mockSearch.findUnique.mockResolvedValue({ id: 'r1', isActive: false, confirmedAt: new Date(), expiredAt: null });
    const r = await requestDigestSignup('gone@example.com', '49079', null);
    await flush();
    expect(r).toEqual({ ok: true, status: 'pending_confirmation' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('caps confirmation emails per address per day', async () => {
    for (let i = 0; i < 5; i++) await requestDigestSignup('spam@example.com', '49079', null);
    await flush();
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('confirms a signed-in visitor using their own account email at once', async () => {
    const r = await requestDigestSignup('me@example.com', '49079', 'me@example.com');
    expect(r).toEqual({ ok: true, status: 'subscribed' });
    expect(mockSearch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ confirmedAt: expect.any(Date), city: '49079' }) })
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('confirm and unsubscribe', () => {
  it('a valid link turns the email on with the ZIP from the token', async () => {
    const out = await confirmDigestSignup(signDigestConfirmToken('a@example.com', '49001'));
    expect(out).toEqual({ zip: '49001' });
    expect(mockSearch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ city: '49001', isActive: true, confirmedAt: expect.any(Date) }) })
    );
  });

  it('a bad link changes nothing', async () => {
    expect(await confirmDigestSignup('garbage')).toBeNull();
    expect(mockSearch.upsert).not.toHaveBeenCalled();
  });

  it('unsubscribe deactivates only the weekend email row', async () => {
    expect(await unsubscribeDigest(signDigestUnsubToken('a@example.com'))).toBe(true);
    expect(mockSearch.updateMany).toHaveBeenCalledWith({
      where: { email: 'a@example.com', searchQuery: WEEKEND_DIGEST_QUERY, isActive: true },
      data: { isActive: false, expiredAt: null },
    });
    expect(await unsubscribeDigest('garbage')).toBe(false);
  });
});

describe('routes', () => {
  const handler = (method: string, path: string) => {
    const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  };
  function mockRes() {
    const res: any = { statusCode: 200 };
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.json = jest.fn((b: any) => { res.body = b; return res; });
    res.type = jest.fn(() => res);
    res.send = jest.fn((b: any) => { res.html = b; return res; });
    return res;
  }

  it('POST /subscribe returns 400 with a plain message for a bad ZIP', async () => {
    const res = mockRes();
    await handler('post', '/subscribe')({ body: { email: 'a@example.com', zip: 'abc' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Enter a 5-digit ZIP code.');
  });

  it('POST /subscribe returns the pending message for a new signup', async () => {
    const res = mockRes();
    await handler('post', '/subscribe')({ body: { email: 'a@example.com', zip: '49079' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('pending_confirmation');
  });

  it('GET /confirm shows a confirmation page', async () => {
    const res = mockRes();
    await handler('get', '/confirm')({ query: { token: signDigestConfirmToken('a@example.com', '49079') } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.html).toContain('49079');
  });
});

describe('guest Friday email', () => {
  const sale = {
    id: 's1',
    title: '<b>Barn</b> sale',
    city: 'Paw Paw',
    state: 'MI',
    zip: '49079',
    address: '1 Main St',
    startDate: new Date('2026-12-04T14:00:00Z'),
    endDate: new Date('2026-12-05T22:00:00Z'),
    photoUrls: [],
    organizer: { businessName: 'Org', timezone: 'America/Detroit' },
    lat: 42.2,
    lng: -85.9,
  };

  it('guest template names the ZIP, drops the dashboard link and invites organizers', () => {
    const html = buildDigestHtml(null, [sale], 'https://finda.sale', 'https://finda.sale/u', true, new Date('2026-12-04T09:00:00Z'), {
      isAccountHolder: false,
      zip: '49079',
    });
    expect(html).toContain('near 49079');
    expect(html).toContain('signed up for weekend sales near ZIP code 49079');
    expect(html).not.toContain('/shopper/dashboard');
    expect(html).toContain('/register?role=organizer');
    expect(html).not.toContain('<b>Barn</b>');
  });

  it('sends confirmed guests their nearby sales once per edition', async () => {
    const now = new Date('2026-12-04T09:00:00Z'); // a Friday
    mockSearch.findMany.mockResolvedValue([
      { id: 'g1', email: 'guest@example.com', city: '49079', lastCheckedAt: null },
      { id: 'g2', email: 'done@example.com', city: '49079', lastCheckedAt: new Date('2026-12-04T09:00:30Z') },
    ]);
    mockSale.aggregate.mockResolvedValue({ _avg: { lat: 42.2, lng: -85.9 } });
    mockSale.findMany.mockResolvedValue([sale]);
    mockUser.findFirst.mockResolvedValue(null);
    mockGmailSend.mockResolvedValue({ id: 'm1' });

    const out = await sendGuestWeeklyDigest(now, 'weekly_digest:2026-12-04', 'https://finda.sale');
    expect(out).toEqual({ quotaHit: false, sent: 1 });
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    const msg = mockGmailSend.mock.calls[0][0];
    expect(msg.to).toBe('guest@example.com');
    expect(msg.subject).toContain('near 49079');
    expect(msg.listUnsubscribe).toMatch(/^<https:\/\/finda\.sale\/api\/digest\/unsubscribe\?token=.+>$/);
    expect(mockSearch.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { lastCheckedAt: expect.any(Date) } });
  }, 15000);

  it('skips a guest whose account opted out of the digest', async () => {
    mockSearch.findMany.mockResolvedValue([{ id: 'g1', email: 'acct@example.com', city: '49079', lastCheckedAt: null }]);
    mockSale.aggregate.mockResolvedValue({ _avg: { lat: 42.2, lng: -85.9 } });
    mockSale.findMany.mockResolvedValue([sale]);
    mockUser.findFirst.mockResolvedValue({ id: 'u1', notificationPrefs: { emailWeeklyDigest: false } });
    mockLog.findFirst.mockResolvedValue(null);
    const out = await sendGuestWeeklyDigest(new Date('2026-12-04T09:00:00Z'), 'weekly_digest:2026-12-04', 'https://finda.sale');
    expect(out.sent).toBe(0);
    expect(mockGmailSend).not.toHaveBeenCalled();
  });

  it('sends nothing when there are no sales near the ZIP', async () => {
    mockSearch.findMany.mockResolvedValue([{ id: 'g1', email: 'far@example.com', city: '99999', lastCheckedAt: null }]);
    mockSale.aggregate.mockResolvedValue({ _avg: { lat: null, lng: null } });
    const out = await sendGuestWeeklyDigest(new Date('2026-12-04T09:00:00Z'), 'weekly_digest:2026-12-04', 'https://finda.sale');
    expect(out.sent).toBe(0);
    expect(mockGmailSend).not.toHaveBeenCalled();
  });
});
