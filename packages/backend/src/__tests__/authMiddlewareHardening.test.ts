/**
 * middleware/auth.ts (2026-09-30 auth hardening): the ?token= URL JWT is rejected except on allowlisted routes (and
 * then only when fresh), and account suspension is enforced by `authenticate` on every route, with the documented
 * exemptions. Prisma is mocked; jsonwebtoken is real.
 */
var mockPrisma: any;
jest.mock('../lib/prisma', () => {
  mockPrisma = {
    user: { findUnique: jest.fn() },
    userRoleSubscription: { findFirst: jest.fn() },
  };
  return { prisma: mockPrisma };
});

import jwt from 'jsonwebtoken';
import { authenticate, optionalAuthenticate, urlTokenAllowedFor, suspensionExempt } from '../middleware/auth';

const SECRET = 'unit-test-jwt-secret';
const sign = (extra: any = {}, opts: jwt.SignOptions = { expiresIn: '1h' }) =>
  jwt.sign({ id: 'u1', tokenVersion: 0, ...extra }, SECRET, opts);

const baseUser = { id: 'u1', role: 'USER', roles: ['USER'], tokenVersion: 0, suspendedAt: null, deletedAt: null, suspendReason: null, organizer: null, roleSubscriptions: [] };

function mkReq(over: any = {}) {
  return { cookies: {}, headers: {}, query: {}, originalUrl: '/api/items/1', url: '/1', path: '/1', ...over } as any;
}
function mkRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  delete process.env.AUTH_URL_TOKEN_PATHS;
  mockPrisma.user.findUnique.mockReset().mockResolvedValue({ ...baseUser });
  mockPrisma.userRoleSubscription.findFirst.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('optionalAuthenticate: URL tokens', () => {
  it('ignores ?token= by default: the request is anonymous and the database is not even queried', async () => {
    const req = mkReq({ query: { token: sign() } });
    const next = jest.fn();
    await optionalAuthenticate(req, mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('still authenticates from the cookie and from the Authorization header', async () => {
    const viaCookie = mkReq({ cookies: { accessToken: sign() } });
    await optionalAuthenticate(viaCookie, mkRes(), jest.fn());
    expect(viaCookie.user?.id).toBe('u1');
    const viaHeader = mkReq({ headers: { authorization: `Bearer ${sign()}` } });
    await optionalAuthenticate(viaHeader, mkRes(), jest.fn());
    expect(viaHeader.user?.id).toBe('u1');
  });

  it('a cookie wins over a ?token= (the URL value is never even considered)', async () => {
    const req = mkReq({ cookies: { accessToken: sign() }, query: { token: 'garbage' } });
    await optionalAuthenticate(req, mkRes(), jest.fn());
    expect(req.user?.id).toBe('u1');
  });

  it('accepts ?token= only on a path listed in AUTH_URL_TOKEN_PATHS, and only when the token is fresh', async () => {
    process.env.AUTH_URL_TOKEN_PATHS = '/api/brand-kit/organizer, /api/exports/one';
    const allowed = mkReq({ originalUrl: '/api/brand-kit/organizer/business-card?token=x', query: { token: sign() } });
    await optionalAuthenticate(allowed, mkRes(), jest.fn());
    expect(allowed.user?.id).toBe('u1');

    const otherPath = mkReq({ originalUrl: '/api/items/1?token=x', query: { token: sign() } });
    await optionalAuthenticate(otherPath, mkRes(), jest.fn());
    expect(otherPath.user).toBeUndefined();

    const stale = mkReq({
      originalUrl: '/api/exports/one',
      query: { token: sign({ iat: Math.floor(Date.now() / 1000) - 3600 }, { expiresIn: '2h' }) },
    });
    const next = jest.fn();
    await optionalAuthenticate(stale, mkRes(), next);
    expect(stale.user).toBeUndefined(); // an hour-old session JWT in a URL is refused
    expect(next).toHaveBeenCalledTimes(1); // anonymous, not an error

    // prefix matching is on path segments: /api/exports/one-more does not match /api/exports/one
    const lookalike = mkReq({ originalUrl: '/api/exports/one-more', query: { token: sign() } });
    await optionalAuthenticate(lookalike, mkRes(), jest.fn());
    expect(lookalike.user).toBeUndefined();
  });

  it('urlTokenAllowedFor is false with no configuration', () => {
    expect(urlTokenAllowedFor(mkReq({ originalUrl: '/api/brand-kit/organizer/yard-sign' }))).toBe(false);
  });
});

describe('optionalAuthenticate: suspended / deleted / stale', () => {
  it('does not identify a suspended or deleted account (treated as anonymous)', async () => {
    for (const patch of [{ suspendedAt: new Date() }, { deletedAt: new Date() }]) {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, ...patch });
      const req = mkReq({ cookies: { accessToken: sign() } });
      const next = jest.fn();
      await optionalAuthenticate(req, mkRes(), next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('an expired access token is still a 401 so the client refreshes', async () => {
    const req = mkReq({ cookies: { accessToken: sign({}, { expiresIn: -10 }) } });
    const res = mkRes();
    const next = jest.fn();
    await optionalAuthenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authenticate: suspension is enforced on every route', () => {
  const run = async (user: any, url: string, tokenExtra: any = {}) => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    const req = mkReq({ cookies: { accessToken: sign(tokenExtra) }, originalUrl: url, url, path: url });
    const res = mkRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    return { req, res, next };
  };
  const suspended = { ...baseUser, suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' };

  it('403 ACCOUNT_SUSPENDED on ordinary non-checkout routes (it used to be only /checkout, /purchase, /payment, /stripe)', async () => {
    for (const url of ['/api/messages/send', '/api/sales', '/api/items/1/bid', '/api/organizer/settings', '/api/checkout/session']) {
      const { res, next } = await run(suspended, url);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
      expect(res.body.reason).toBe('SERIAL_CHARGEBACKS');
      expect(res.body.message).toBe('Your account has been suspended');
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('a suspended user can still read /api/auth/me and log out', async () => {
    for (const url of ['/api/auth/me', '/api/auth/me?x=1', '/api/auth/logout']) {
      const { next, res } = await run(suspended, url);
      expect(res.statusCode).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('an ADMIN keeps /api/admin/* (read and unsuspend) but is blocked elsewhere', async () => {
    const adminSuspended = { ...suspended, role: 'ADMIN', roles: ['USER', 'ADMIN'] };
    const ok = await run(adminSuspended, '/api/admin/users/u2/unsuspend');
    expect(ok.next).toHaveBeenCalledTimes(1);
    const blocked = await run(adminSuspended, '/api/sales');
    expect(blocked.res.statusCode).toBe(403);
    // a suspended NON-admin gets no admin exemption
    const nonAdmin = await run(suspended, '/api/admin/users');
    expect(nonAdmin.res.statusCode).toBe(403);
  });

  it('unsuspending takes effect on the very next request (no cache to wait out)', async () => {
    expect((await run(suspended, '/api/sales')).res.statusCode).toBe(403);
    const after = await run({ ...baseUser }, '/api/sales');
    expect(after.next).toHaveBeenCalledTimes(1);
    expect(after.req.user.id).toBe('u1');
  });

  it('a soft-deleted account is refused with 401 ACCOUNT_DELETED', async () => {
    const { res, next } = await run({ ...baseUser, deletedAt: new Date() }, '/api/sales');
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('ACCOUNT_DELETED');
    expect(next).not.toHaveBeenCalled();
  });

  it('a stale token on a suspended account learns nothing: plain 401, not 403', async () => {
    const { res } = await run({ ...suspended, tokenVersion: 5 }, '/api/sales', { tokenVersion: 0 });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  it('an active user is unaffected', async () => {
    const { next, req } = await run({ ...baseUser }, '/api/sales');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.roles).toEqual(['USER']);
  });

  it('never reads a URL token: ?token= does not authenticate a protected route', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser });
    const req = mkReq({ query: { token: sign() }, originalUrl: '/api/sales?token=x' });
    const res = mkRes();
    await authenticate(req, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });
});

describe('suspensionExempt', () => {
  it('matches exact paths only', () => {
    expect(suspensionExempt(mkReq({ originalUrl: '/api/auth/me/' }), { role: 'USER' })).toBe(true);
    expect(suspensionExempt(mkReq({ originalUrl: '/api/auth/mexico' }), { role: 'USER' })).toBe(false);
    expect(suspensionExempt(mkReq({ originalUrl: '/api/administrator' }), { role: 'ADMIN' })).toBe(false);
    expect(suspensionExempt(mkReq({ originalUrl: '/api/admin' }), { roles: ['ADMIN'] })).toBe(true);
  });
});
