/**
 * Auth controller hardening (2026-09-29 security pass): OAuth trust, Prisma filter-object injection, suspended
 * OAuth accounts, register input validation and login input handling. Prisma and all side-effect services are mocked.
 */
var mockPrisma: any;
jest.mock('../index', () => {
  mockPrisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    betaInvite: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    userRoleSubscription: { findFirst: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({}) }, // 2026-09-30: session minting records the refresh-token family
    $transaction: jest.fn(),
  };
  return { prisma: mockPrisma };
});
jest.mock('../controllers/userController', () => ({ handleReferralBadge: jest.fn() }));
jest.mock('../services/mailerliteService', () => ({
  addShopperSubscriber: jest.fn().mockResolvedValue(undefined),
  addOrganizerSubscriber: jest.fn().mockResolvedValue(undefined),
  isTestOrSyntheticEmail: jest.fn().mockReturnValue(true),
}));
jest.mock('../services/referralService', () => ({ processReferral: jest.fn() }));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn(), XP_AWARDS: {} }));
jest.mock('../services/referralTrancheService', () => ({ referralTrancheService: { recordLogin: jest.fn() } }));
jest.mock('../lib/registrationRateLimiter', () => ({
  checkRegistrationLimit: jest.fn().mockResolvedValue({ limited: false }),
  recordRegistration: jest.fn(),
}));
jest.mock('../lib/registrationChallenge', () => ({
  issueChallenge: jest.fn(),
  verifyChallenge: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock('../lib/fraudDetectionService', () => ({ recordRegistration: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));

import { register, login, oauthLogin, linkOAuthProvider, oauthVerifyAge } from '../controllers/authController';
import { signOAuthAssertion, __resetOAuthAssertionWarning } from '../utils/oauthAssertion';

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined, cookies: {} as any };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  res.cookie = (n: string, v: string) => { res.cookies[n] = v; return res; };
  res.clearCookie = jest.fn();
  return res;
}
const req = (body: any, extra: any = {}) => ({ body, ip: '1.2.3.4', headers: {}, cookies: {}, ...extra } as any);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.OAUTH_BRIDGE_SECRET;
  process.env.JWT_SECRET = 'unit-test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret';
  process.env.FRONTEND_URL = 'https://finda.sale';
  __resetOAuthAssertionWarning();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('oauthLogin input handling', () => {
  it('rejects Prisma filter objects as providerId/provider without touching the database', async () => {
    for (const body of [
      { provider: 'google', providerId: { not: '' } },
      { provider: { contains: '' }, providerId: 'abc' },
      { provider: 'google', providerId: ['a'] },
      { provider: 'google', providerId: 42 },
      { provider: 'g'.repeat(41), providerId: 'abc' },
      { provider: 'google', providerId: 'x'.repeat(256) },
    ]) {
      const res = fakeRes();
      await oauthLogin(req(body), res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('with OAUTH_BRIDGE_SECRET set, refuses an unsigned or mismatched profile (401) before any lookup', async () => {
    process.env.OAUTH_BRIDGE_SECRET = 'bridge-secret';
    const unsigned = fakeRes();
    await oauthLogin(req({ provider: 'google', providerId: '123', email: 'a@b.co' }), unsigned);
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.body.code).toBe('OAUTH_ASSERTION_INVALID');

    const forged = fakeRes();
    const assertion = signOAuthAssertion({ provider: 'google', providerId: '123', email: 'a@b.co' }, 'bridge-secret');
    await oauthLogin(req({ provider: 'google', providerId: '999', email: 'a@b.co', oauthAssertion: assertion }), forged);
    expect(forged.statusCode).toBe(401);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('with a valid assertion the lookup proceeds; a suspended OAuth account gets 403 and no session', async () => {
    process.env.OAUTH_BRIDGE_SECRET = 'bridge-secret';
    const assertion = signOAuthAssertion({ provider: 'google', providerId: '123', email: 'a@b.co' }, 'bridge-secret');
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1', email: 'a@b.co', role: 'USER', roles: ['USER'], suspendedAt: new Date(), deletedAt: null, tokenVersion: 0,
    });
    const res = fakeRes();
    await oauthLogin(req({ provider: 'google', providerId: '123', email: 'A@B.co', oauthAssertion: assertion }), res);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({ where: { oauthProvider: 'google', oauthId: '123' } });
    expect(res.statusCode).toBe(403);
    expect(res.cookies.accessToken).toBeUndefined();
  });

  it('a deleted OAuth account is refused the same way', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', email: 'x@y.co', role: 'USER', deletedAt: new Date(), suspendedAt: null });
    const res = fakeRes();
    await oauthLogin(req({ provider: 'google', providerId: '5' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('legacy mode (no secret) still signs a normal user in and never returns credential columns', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u3', email: 'ok@y.co', name: 'Ok', role: 'USER', roles: ['USER'], suspendedAt: null, deletedAt: null, tokenVersion: 0, createdAt: new Date(),
      password: 'hash', resetToken: 'secret-reset', emailVerificationToken: 'secret-verify', fraudSuspect: false,
    });
    const res = fakeRes();
    await oauthLogin(req({ provider: 'google', providerId: '7', returnTo: 'https://finda.sale.evil.com/x' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.id).toBe('u3');
    for (const k of ['password', 'resetToken', 'emailVerificationToken', 'fraudSuspect']) expect(res.body.user).not.toHaveProperty(k);
    expect(res.body.returnTo).toBeNull(); // look-alike origin is not an allowed redirect
  });

  it('keeps a same-origin returnTo', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u3', email: 'ok@y.co', role: 'USER', roles: ['USER'], tokenVersion: 0, createdAt: new Date() });
    const res = fakeRes();
    await oauthLogin(req({ provider: 'google', providerId: '7', returnTo: 'https://finda.sale/browse' }), res);
    expect(res.body.returnTo).toBe('https://finda.sale/browse');
  });
});

describe('linkOAuthProvider input handling', () => {
  it('rejects non-string provider/providerId and requires the assertion when the secret is set', async () => {
    const bad = fakeRes();
    await linkOAuthProvider(req({ provider: 'google', providerId: { not: '' } }, { user: { id: 'u1' } }), bad);
    expect(bad.statusCode).toBe(400);

    process.env.OAUTH_BRIDGE_SECRET = 'bridge-secret';
    const unsigned = fakeRes();
    await linkOAuthProvider(req({ provider: 'google', providerId: '1' }, { user: { id: 'u1' } }), unsigned);
    expect(unsigned.statusCode).toBe(401);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('register validation', () => {
  const good = { email: 'New@Example.com ', password: 'correct horse', name: 'N', dateOfBirth: '1990-01-01' };

  it('rejects a missing or short password (previously a 500 or accepted)', async () => {
    for (const password of [undefined, '', 'short', 12345678, { a: 1 }]) {
      const res = fakeRes();
      await register(req({ ...good, password }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-string or malformed email with 400, not a TypeError 500', async () => {
    for (const email of [undefined, 5, {}, 'no-at-sign']) {
      const res = fakeRes();
      await register(req({ ...good, email }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects a non-string name with 400 instead of a 500 from Prisma', async () => {
    for (const name of [undefined, 5, {}]) {
      const res = fakeRes();
      await register(req({ ...good, name }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects an unparseable date of birth (NaN used to pass the age check)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    for (const dateOfBirth of ['abc', 'not-a-date', '2999-01-01']) {
      const res = fakeRes();
      await register(req({ ...good, dateOfBirth }), res);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/date of birth/i);
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a minor', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = fakeRes();
    const year = new Date().getUTCFullYear() - 10;
    await register(req({ ...good, dateOfBirth: `${year}-01-01` }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/18/);
  });
});

describe('login input handling', () => {
  it('rejects non-string email/password as invalid credentials without a database query', async () => {
    for (const body of [{}, { email: 'a@b.co' }, { email: 'a@b.co', password: { a: 1 } }, { email: { not: '' }, password: 'x' }, { email: 5, password: 'x' }, { email: 'a@b.co', password: '' }]) {
      const res = fakeRes();
      await login(req(body), res);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Invalid credentials');
    }
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('oauthVerifyAge', () => {
  it('rejects an unparseable date of birth and never writes ageVerifiedAt', async () => {
    const res = fakeRes();
    await oauthVerifyAge(req({ dateOfBirth: 'abc' }, { user: { id: 'u1' } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts an adult and returns the user without credential columns', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', password: 'h', resetToken: 'r', emailVerificationToken: 'v', name: 'A' });
    const res = fakeRes();
    await oauthVerifyAge(req({ dateOfBirth: '1985-03-04' }, { user: { id: 'u1' } }), res);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({ id: 'u1', name: 'A' });
  });
});
