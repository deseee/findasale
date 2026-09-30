/**
 * Password-reset and email-verification tokens are hashed at rest (2026-09-30 auth hardening), with a legacy
 * plaintext fallback until the old link expires. Routes are exercised through real express + express-rate-limit
 * (in-memory store); the verify-email CONTROLLER is covered in authEnumerationAndVerify.test.ts.
 */
var mockPrisma: any;
var mockSend: jest.Mock;
jest.mock('../index', () => {
  mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { prisma: mockPrisma };
});
jest.mock('../lib/transactionalEmailService', () => {
  mockSend = jest.fn();
  return { transactionalEmailService: { emails: { send: (...a: unknown[]) => mockSend(...a) } } };
});
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/auth', () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));
jest.mock('../controllers/authController', () => {
  const noop = (_req: any, res: any) => res.json({});
  return {
    register: noop, login: noop, oauthLogin: noop, redeemInvite: noop, verifyEmail: noop,
    oauthVerifyAge: noop, linkOAuthProvider: noop, getRegistrationChallenge: noop, exitImpersonation: noop,
  };
});

import http from 'http';
import express from 'express';
import authRouter from '../routes/auth';
import { hashOpaqueToken, tokenLookupCandidates, looksLikeStoredTokenHash, TOKEN_HASH_PREFIX } from '../utils/authSecurity';

let server: http.Server;
let base = '';
let ipCounter = 0;

beforeAll(async () => {
  process.env.FRONTEND_URL = 'https://finda.sale';
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/auth', authRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

async function post(path: string, body: any) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

beforeEach(() => {
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.user.update.mockReset();
  mockPrisma.user.updateMany.mockReset();
  mockPrisma.refreshToken.updateMany.mockClear();
  mockSend.mockReset().mockResolvedValue({});
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('token hashing helpers', () => {
  it('hashOpaqueToken is a deterministic sha256: + 64 hex, and never equals the input', () => {
    const h = hashOpaqueToken('abc');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(h).toBe(hashOpaqueToken('abc'));
    expect(h).not.toBe(hashOpaqueToken('abd'));
    expect(h).not.toContain('abc');
  });

  it('lookup candidates are the hashed form first, then the legacy plaintext; unusable input yields none', () => {
    expect(tokenLookupCandidates('tok')).toEqual([hashOpaqueToken('tok'), 'tok']);
    expect(tokenLookupCandidates('')).toEqual([]);
    expect(tokenLookupCandidates(undefined)).toEqual([]);
    expect(tokenLookupCandidates({ not: '' })).toEqual([]);
    // A leaked stored hash presented AS the token must not match the legacy plaintext lookup
    expect(looksLikeStoredTokenHash(hashOpaqueToken('tok'))).toBe(true);
    expect(tokenLookupCandidates(hashOpaqueToken('tok'))).toEqual([]);
    expect(tokenLookupCandidates(TOKEN_HASH_PREFIX + 'x')).toEqual([]);
  });
});

describe('POST /auth/forgot-password stores only a hash', () => {
  it('persists sha256:<hash> while the emailed link carries the raw token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    const res = await post('/auth/forgot-password', { email: 'a@b.co' });
    expect(res.status).toBe(200);
    const stored = mockPrisma.user.update.mock.calls[0][0].data.resetToken as string;
    expect(stored).toMatch(/^sha256:[0-9a-f]{64}$/);
    const html = mockSend.mock.calls[0][0].html as string;
    const raw = /reset-password\?token=([0-9a-f]+)/.exec(html)![1];
    expect(hashOpaqueToken(raw)).toBe(stored);
    expect(html).not.toContain(stored);
  });
});

describe('POST /auth/reset-password with hashed and legacy tokens', () => {
  const body = (token: string) => ({ token, newPassword: 'a-new-password' });

  it('accepts a hashed row: looks up the hash and claims exactly the stored value atomically', async () => {
    const stored = hashOpaqueToken('raw-token');
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', resetToken: stored, resetTokenExpiry: new Date(Date.now() + 60_000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await post('/auth/reset-password', body('raw-token'));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique.mock.calls[0][0]).toEqual({ where: { resetToken: stored } });
    const where = mockPrisma.user.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'u1', resetToken: stored });
    expect(mockPrisma.user.updateMany.mock.calls[0][0].data).toMatchObject({ resetToken: null, resetTokenExpiry: null });
  });

  it('still accepts a LEGACY plaintext row until it expires (hash lookup misses, plaintext lookup hits)', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u2', resetToken: 'old-plain-token', resetTokenExpiry: new Date(Date.now() + 60_000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await post('/auth/reset-password', body('old-plain-token'));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.findUnique.mock.calls.map((c: any[]) => c[0].where.resetToken)).toEqual([hashOpaqueToken('old-plain-token'), 'old-plain-token']);
    expect(mockPrisma.user.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'u2', resetToken: 'old-plain-token' });
  });

  it('rejects an expired legacy plaintext row', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u2', resetToken: 'old', resetTokenExpiry: new Date(Date.now() - 1000) });
    const res = await post('/auth/reset-password', body('old'));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a presented value that IS a stored hash (a database leak must not become a working token), without any lookup', async () => {
    const res = await post('/auth/reset-password', body(hashOpaqueToken('raw-token')));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('stays single-use: a lost atomic claim is a 400 and revokes nothing', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', resetToken: hashOpaqueToken('t'), resetTokenExpiry: new Date(Date.now() + 60_000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await post('/auth/reset-password', body('t'));
    expect(res.status).toBe(400);
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('a successful reset revokes every refresh-token family of the user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u9', resetToken: hashOpaqueToken('t'), resetTokenExpiry: new Date(Date.now() + 60_000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    await post('/auth/reset-password', body('t'));
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u9', revokedAt: null },
      data: expect.objectContaining({ revokedReason: 'password_change' }),
    });
  });

  it('accepts the field name the real reset page sends ("password") as well as "newPassword"', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', resetToken: hashOpaqueToken('t'), resetTokenExpiry: new Date(Date.now() + 60_000) });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect((await post('/auth/reset-password', { token: 't', password: 'a-new-password' })).status).toBe(200);
    expect((await post('/auth/reset-password', { token: 't' })).status).toBe(400);
    expect((await post('/auth/reset-password', { token: 't', password: 'short' })).status).toBe(400);
    expect((await post('/auth/reset-password', { token: 't', password: 'x'.repeat(129) })).status).toBe(400);
  });
});

describe('POST /auth/resend-verification stores only a hash', () => {
  it('persists the hash, emails the raw token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.co', emailVerified: false, emailVerificationToken: 'sha256:old' });
    const res = await post('/auth/resend-verification', { email: 'a@b.co' });
    expect(res.status).toBe(200);
    const stored = mockPrisma.user.update.mock.calls[0][0].data.emailVerificationToken as string;
    expect(stored).toMatch(/^sha256:[0-9a-f]{64}$/);
    const html = mockSend.mock.calls[0][0].html as string;
    const raw = /verify-email\?token=([0-9a-f]+)/.exec(html)![1];
    expect(hashOpaqueToken(raw)).toBe(stored);
  });
});
