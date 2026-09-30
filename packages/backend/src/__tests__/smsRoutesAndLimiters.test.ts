/**
 * Route wiring and rate limits for the text features (2026-09-29): every organizer text route is PRO gated and
 * rate limited; /subscribe is authenticated and limited per account and per IP but only when a phone is sent.
 * Express Router is a recording stub; the limiters are the real express-rate-limit instances (memory store).
 */
const mockRoutes: Array<{ method: string; path: string; handlers: unknown[] }> = [];
jest.mock('express', () => {
  const Router = () => {
    const r: any = {};
    for (const m of ['get', 'post', 'put', 'delete', 'patch', 'use']) {
      r[m] = (path: string, ...handlers: unknown[]) => {
        mockRoutes.push({ method: m, path, handlers });
        return r;
      };
    }
    return r;
  };
  return { __esModule: true, default: { Router }, Router };
});
const mockRequireTier = jest.fn((tier: string) => {
  const mw: any = (_req: unknown, _res: unknown, next: () => void) => next();
  mw.tier = tier;
  return mw;
});
jest.mock('../middleware/requireTier', () => ({ requireTier: (t: string) => mockRequireTier(t) }));
jest.mock('../middleware/auth', () => ({ authenticate: Object.assign((_a: unknown, _b: unknown, n: () => void) => n(), { isAuth: true }) }));
jest.mock('../middleware/rateLimitShared', () => ({ createRateLimitStore: () => undefined, createBurstAlerter: () => () => {} }));
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('twilio', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('../lib/emailService', () => ({ emailService: {} }));
jest.mock('../controllers/userController', () => ({ handleEarlyBirdBadge: jest.fn(), handleExplorerBadge: jest.fn() }));

import linesRouter from '../routes/lines';
import notificationsRouter from '../routes/notifications';
import {
  lineSmsBurstLimiter,
  lineSmsHourlyLimiter,
  smsSendBurstLimiter,
  smsSendHourlyLimiter,
  smsSubscribeUserLimiter,
  smsSubscribeIpLimiter,
} from '../middleware/smsRateLimiter';

void linesRouter; // referenced so the import (and the route registration it performs) is not elided
void notificationsRouter;
const find = (method: string, path: string) => mockRoutes.find((r) => r.method === method && r.path === path)!;
const tierOf = (handlers: unknown[]) => (handlers.find((h: any) => h && h.tier) as any)?.tier;

describe('lines routes', () => {
  it('every organizer line route requires PRO', () => {
    for (const [m, p] of [
      ['post', '/:saleId/start'],
      ['post', '/:saleId/next'],
      ['get', '/:saleId/status'],
      ['post', '/:saleId/notify'],
      ['post', '/:saleId/broadcast'],
      ['post', '/entry/:lineEntryId/entered'],
    ]) {
      expect(tierOf(find(m, p).handlers)).toBe('PRO');
    }
  });

  it('shopper routes stay open to any signed-in account', () => {
    for (const [m, p] of [['post', '/:saleId/join'], ['get', '/:saleId/my-position'], ['delete', '/:saleId/leave']]) {
      expect(tierOf(find(m, p).handlers)).toBeUndefined();
    }
  });

  it('the bulk text routes carry the burst and hourly line limiters, after the tier gate', () => {
    for (const p of ['/:saleId/start', '/:saleId/notify', '/:saleId/broadcast']) {
      const h = find('post', p).handlers;
      expect(h).toEqual(expect.arrayContaining([lineSmsBurstLimiter, lineSmsHourlyLimiter]));
      expect(h.findIndex((x: any) => x?.tier)).toBeLessThan(h.indexOf(lineSmsBurstLimiter));
    }
  });
});

describe('notifications routes', () => {
  it('/subscribe is authenticated and limited per account and per IP', () => {
    const h = find('post', '/subscribe').handlers;
    expect((h[0] as any).isAuth).toBe(true);
    expect(h).toEqual(expect.arrayContaining([smsSubscribeUserLimiter, smsSubscribeIpLimiter]));
  });

  it('/send-sms is PRO gated with burst and hourly limits, and the audience summary is PRO gated', () => {
    const h = find('post', '/send-sms').handlers;
    expect(tierOf(h)).toBe('PRO');
    expect(h).toEqual(expect.arrayContaining([smsSendBurstLimiter, smsSendHourlyLimiter]));
    expect(tierOf(find('get', '/sms-audience/:saleId').handlers)).toBe('PRO');
  });

  it('the inbound webhook is public (Twilio signature is checked inside the handler)', () => {
    const h = find('post', '/sms-webhook').handlers;
    expect(h).toHaveLength(1);
  });
});

const run = async (limiter: any, req: any) => {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headersSent: false,
    setHeader() {},
    getHeader() {},
    set() {
      return this;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      this.headersSent = true;
      return this;
    },
    send(b: any) {
      this.body = b;
      return this;
    },
  };
  let passed = false;
  await limiter(req, res, () => {
    passed = true;
  });
  return { passed, res };
};

describe('subscribe limiters', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());
  const req = (uid: string, ip: string, body: Record<string, unknown>) => ({ user: { id: uid }, ip, socket: { remoteAddress: ip }, headers: {}, body, app: { get: () => undefined } }) as any;

  it('per account: the 6th phone sign-up in an hour is refused with 429; email-only and "turn off" requests never count', async () => {
    for (let i = 0; i < 5; i++) expect((await run(smsSubscribeUserLimiter, req('acct-1', '198.51.100.1', { phone: '2695550142' }))).passed).toBe(true);
    const blocked = await run(smsSubscribeUserLimiter, req('acct-1', '198.51.100.1', { phone: '2695550142' }));
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.body.code).toBe('SMS_SUBSCRIBE_RATE_LIMITED');
    for (let i = 0; i < 20; i++) expect((await run(smsSubscribeUserLimiter, req('acct-2', '198.51.100.2', { email: 'a@example.com' }))).passed).toBe(true);
    for (let i = 0; i < 20; i++) expect((await run(smsSubscribeUserLimiter, req('acct-3', '198.51.100.3', { phone: '' }))).passed).toBe(true);
  });

  it('per IP: many accounts from one address are limited together', async () => {
    let refused = 0;
    for (let i = 0; i < 12; i++) {
      const r = await run(smsSubscribeIpLimiter, req(`acct-ip-${i}`, '198.51.100.50', { phone: '2695550142' }));
      if (!r.passed) refused++;
    }
    expect(refused).toBe(2);
  });
});
