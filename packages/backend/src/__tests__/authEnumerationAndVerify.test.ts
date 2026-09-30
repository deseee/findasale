/**
 * Account-enumeration parity for POST /auth/register, and hashed single-use email verification
 * (2026-09-30 auth hardening). Controller-level, Prisma and every side-effect service mocked.
 */
var mockPrisma: any;
var mockSend: jest.Mock;
jest.mock('../index', () => {
  mockPrisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), count: jest.fn() },
    betaInvite: { findUnique: jest.fn(), update: jest.fn() },
    organizer: { findUnique: jest.fn(), create: jest.fn() },
    userRoleSubscription: { findFirst: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
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
jest.mock('../lib/transactionalEmailService', () => {
  mockSend = jest.fn().mockResolvedValue({});
  return { transactionalEmailService: { emails: { send: (...a: unknown[]) => mockSend(...a) } } };
});

import bcrypt from 'bcryptjs';
import { register, verifyEmail, REGISTER_ACCEPTED_BODY, __resetRegisterNoticeThrottle } from '../controllers/authController';
import { recordRegistration } from '../lib/registrationRateLimiter';
import { hashOpaqueToken } from '../utils/authSecurity';

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined, cookies: {} as any };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  res.cookie = (n: string, v: string) => { res.cookies[n] = v; return res; };
  res.clearCookie = jest.fn();
  return res;
}
const req = (body: any) => ({ body, ip: '1.2.3.4', headers: {}, cookies: {} } as any);
const flush = () => new Promise((r) => setImmediate(r));

const good = { email: 'Someone@Example.com ', password: 'correct horse', name: 'Some One', dateOfBirth: '1990-01-01' };
const existingUser = { id: 'existing-id-123', email: 'someone@example.com', name: 'Existing Person', password: 'hash', role: 'USER', roles: ['USER'] };

beforeEach(() => {
  jest.clearAllMocks();
  __resetRegisterNoticeThrottle();
  process.env.JWT_SECRET = 'unit-test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret';
  process.env.FRONTEND_URL = 'https://finda.sale';
  mockPrisma.user.findUnique.mockReset().mockResolvedValue(null);
  mockPrisma.user.create.mockReset().mockImplementation(async ({ data }: any) => ({ id: 'new-1', createdAt: new Date(), tokenVersion: 0, ...data }));
  mockPrisma.user.count.mockReset().mockResolvedValue(0);
  mockPrisma.betaInvite.findUnique.mockReset().mockResolvedValue(null);
  mockPrisma.$transaction.mockReset().mockImplementation(async (fn: any) => fn(mockPrisma));
  mockSend.mockReset().mockResolvedValue({});
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('register: enumeration parity', () => {
  it('a brand-new address and an already-registered one get the SAME status, body and no session', async () => {
    const fresh = fakeRes();
    await register(req(good), fresh);

    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    const dup = fakeRes();
    await register(req(good), dup);

    expect(fresh.statusCode).toBe(201);
    expect(dup.statusCode).toBe(fresh.statusCode);
    expect(dup.body).toEqual(fresh.body);
    expect(fresh.body).toEqual(REGISTER_ACCEPTED_BODY);
    expect(fresh.body.message).toBe('Check your email to finish signing up');
    for (const res of [fresh, dup]) {
      expect(res.cookies).toEqual({}); // a Set-Cookie on only one branch would be a tell
      expect(res.body).not.toHaveProperty('user');
      expect(res.body).not.toHaveProperty('token');
    }
    // the new account really was created, the existing one really was not
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('never answers 409 for an existing address any more', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    const res = await (async () => { const r = fakeRes(); await register(req(good), r); return r; })();
    expect(res.statusCode).not.toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/already exists/i);
  });

  it('does the same work on the existing-account branch: hashes the password and advances the IP counter', async () => {
    const hashSpy = jest.spyOn(bcrypt, 'hash');
    await register(req(good), fakeRes());
    const freshHashes = hashSpy.mock.calls.length;
    expect(recordRegistration).toHaveBeenCalledTimes(1);

    hashSpy.mockClear();
    (recordRegistration as jest.Mock).mockClear();
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    await register(req(good), fakeRes());
    expect(hashSpy.mock.calls.length).toBe(freshHashes);
    expect(recordRegistration).toHaveBeenCalledTimes(1);
  });

  it('validation failures are identical for new and existing addresses (checked before the existence test)', async () => {
    const cases: any[] = [
      { ...good, dateOfBirth: 'not-a-date' },
      { ...good, dateOfBirth: `${new Date().getUTCFullYear() - 10}-01-01` },
      { ...good, inviteCode: 'BADCODE' },
      { ...good, country: 'CA', province: 'QC' },
    ];
    for (const body of cases) {
      const a = fakeRes();
      await register(req(body), a);
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      const b = fakeRes();
      await register(req(body), b);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      expect(a.statusCode).toBe(400);
      expect(b.statusCode).toBe(a.statusCode);
      expect(b.body).toEqual(a.body);
    }
  });

  it('emails the existing owner a "someone tried to register" note with no account details, not awaited', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    let releaseSend: () => void = () => undefined;
    mockSend.mockImplementation(() => new Promise<void>((r) => { releaseSend = r; }));
    const res = fakeRes();
    await register(req(good), res); // resolves although the mailer is still pending
    expect(res.statusCode).toBe(201);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toBe('someone@example.com');
    expect(mail.subject).toMatch(/someone tried to sign up/i);
    expect(mail.html).not.toContain('Existing Person');
    expect(mail.html).not.toContain('existing-id-123');
    expect(mail.html).toContain('https://finda.sale/forgot-password');
    releaseSend();
    await flush();
  });

  it('throttles that note to one per address per hour (no mail bombing through the sign-up form)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    for (let i = 0; i < 4; i++) await register(req(good), fakeRes());
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('a failing mailer never changes the response', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(existingUser);
    mockSend.mockRejectedValue(new Error('smtp down'));
    const res = fakeRes();
    await register(req(good), res);
    await flush();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(REGISTER_ACCEPTED_BODY);
  });

  it('two racing sign-ups for the same new address: the unique-index loser answers like the winner, not 500', async () => {
    mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error('Unique constraint failed on the fields: (`email`)'), { code: 'P2002', meta: { target: ['email'] } }));
    const res = fakeRes();
    await register(req(good), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(REGISTER_ACCEPTED_BODY);
  });

  it('other database failures are still a 500', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('connection lost'));
    const res = fakeRes();
    await register(req(good), res);
    expect(res.statusCode).toBe(500);
  });

  it('a new account stores the verification token hashed and emails the raw token', async () => {
    const res = fakeRes();
    await register(req(good), res);
    const stored = mockPrisma.user.create.mock.calls[0][0].data.emailVerificationToken as string;
    expect(stored).toMatch(/^sha256:[0-9a-f]{64}$/);
    const mail = mockSend.mock.calls[0][0];
    expect(mail.to).toBe('someone@example.com');
    const raw = /verify-email\?token=([0-9a-f]+)/.exec(mail.html)![1];
    expect(hashOpaqueToken(raw)).toBe(stored);
    expect(mail.html).not.toContain(stored);
  });
});

describe('verifyEmail: hashed, legacy-tolerant, atomic single use', () => {
  const future = new Date(Date.now() + 60_000);

  it('accepts a hashed row and claims exactly the stored value', async () => {
    const stored = hashOpaqueToken('raw-verify');
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', emailVerified: false, emailVerificationToken: stored, emailVerificationTokenExpiry: future });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = fakeRes();
    await verifyEmail(req({ token: 'raw-verify' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(mockPrisma.user.findFirst.mock.calls[0][0]).toEqual({ where: { emailVerificationToken: stored } });
    expect(mockPrisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: 'u1', emailVerificationToken: stored });
    expect(mockPrisma.user.updateMany.mock.calls[0][0].data).toMatchObject({ emailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiry: null });
  });

  it('still accepts a LEGACY plaintext token until it expires', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u2', emailVerified: false, emailVerificationToken: 'old-plain', emailVerificationTokenExpiry: future });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = fakeRes();
    await verifyEmail(req({ token: 'old-plain' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findFirst.mock.calls.map((c: any[]) => c[0].where.emailVerificationToken)).toEqual([hashOpaqueToken('old-plain'), 'old-plain']);
    expect(mockPrisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: 'u2', emailVerificationToken: 'old-plain' });
  });

  it('rejects an expired token (hashed or legacy) without writing', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', emailVerified: false, emailVerificationToken: hashOpaqueToken('t'), emailVerificationTokenExpiry: new Date(Date.now() - 1000) });
    const res = fakeRes();
    await verifyEmail(req({ token: 't' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('VERIFICATION_TOKEN_EXPIRED');
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a presented value that is itself a stored hash, without any lookup', async () => {
    const res = fakeRes();
    await verifyEmail(req({ token: hashOpaqueToken('raw-verify') }), res);
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('single use is atomic: losing the conditional claim is a 400, not a second success', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', emailVerified: false, emailVerificationToken: hashOpaqueToken('t'), emailVerificationTokenExpiry: future });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    const res = fakeRes();
    await verifyEmail(req({ token: 't' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.verified).toBeUndefined();
  });

  it('unknown token and non-string token are 400', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const a = fakeRes();
    await verifyEmail(req({ token: 'nope' }), a);
    expect(a.statusCode).toBe(400);
    const b = fakeRes();
    await verifyEmail(req({ token: { not: '' } }), b);
    expect(b.statusCode).toBe(400);
  });

  it('an already-verified account is an idempotent 200 and is not rewritten', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', emailVerified: true, emailVerificationToken: hashOpaqueToken('t'), emailVerificationTokenExpiry: future });
    const res = fakeRes();
    await verifyEmail(req({ token: 't' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});
