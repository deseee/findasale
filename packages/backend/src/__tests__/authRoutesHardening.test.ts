/**
 * routes/auth.ts hardening (2026-09-29): atomic single-use reset token, email normalization, per-email throttle on
 * forgot-password, per-account failed-login limiter, non-blocking email send, escaped email HTML.
 * Real express + express-rate-limit (in-memory store: no REDIS_URL), mocked Prisma / mailer / controllers.
 */
var mockPrisma: any;
var mockSend: jest.Mock;
var mockLogin: jest.Mock;
jest.mock('../index', () => {
  mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
  };
  return { prisma: mockPrisma };
});
jest.mock('../lib/transactionalEmailService', () => {
  mockSend = jest.fn();
  return { transactionalEmailService: { emails: { send: (...a: unknown[]) => mockSend(...a) } } };
});
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../controllers/authController', () => {
  mockLogin = jest.fn((_req: any, res: any) => res.status(400).json({ message: 'Invalid credentials' }));
  const noop = (_req: any, res: any) => res.json({});
  return {
    register: noop, login: (...a: any[]) => (mockLogin as any)(...a), oauthLogin: noop, redeemInvite: noop, verifyEmail: noop,
    oauthVerifyAge: noop, linkOAuthProvider: noop, getRegistrationChallenge: noop, exitImpersonation: noop,
  };
});

import http from 'http';
import express from 'express';
import authRouter from '../routes/auth';

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

// each call gets a fresh client IP so the per-IP limiters never interfere with the per-account / per-email ones
async function post(path: string, body: any, ip?: string) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

beforeEach(() => {
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.user.updateMany.mockReset();
  mockPrisma.user.update.mockReset();
  mockSend.mockReset().mockResolvedValue({});
  mockLogin.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /auth/reset-password', () => {
  const user = { id: 'u1', resetToken: 'tok', resetTokenExpiry: new Date(Date.now() + 60_000) };
  const body = { token: 'tok', newPassword: 'a-new-password' };

  it('claims the token atomically: conditional updateMany on token + expiry, success only when count is 1', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const ok = await post('/auth/reset-password', body);
    expect(ok.status).toBe(200);
    const arg = mockPrisma.user.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'u1', resetToken: 'tok' });
    expect(arg.where.resetTokenExpiry.gt).toBeInstanceOf(Date);
    expect(arg.data).toMatchObject({ resetToken: null, resetTokenExpiry: null, tokenVersion: { increment: 1 } });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('a concurrent second use of the same token (count 0) is refused', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await post('/auth/reset-password', body);
    expect(r.status).toBe(400);
    expect(r.json.message).toMatch(/invalid or has expired/);
  });

  it('expired or unknown tokens never reach the write', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...user, resetTokenExpiry: new Date(Date.now() - 1000) });
    expect((await post('/auth/reset-password', body)).status).toBe(400);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect((await post('/auth/reset-password', body)).status).toBe(400);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /auth/forgot-password', () => {
  it('normalizes the email before lookup', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const r = await post('/auth/forgot-password', { email: '  Alice@Example.COM ' });
    expect(r.status).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } });
  });

  it('answers immediately even when the mail provider hangs (no timing difference for real accounts)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'real@example.com' });
    mockPrisma.user.update.mockResolvedValue({});
    mockSend.mockReturnValue(new Promise(() => undefined)); // never resolves
    const started = Date.now();
    const r = await post('/auth/forgot-password', { email: 'real@example.com' });
    expect(r.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('escapes the client IP and user agent in the security footer', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'esc@example.com' });
    mockPrisma.user.update.mockResolvedValue({});
    await fetch(base + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': '<img src=x onerror=alert(1)>', 'x-forwarded-for': '10.8.8.8' },
      body: JSON.stringify({ email: 'esc@example.com' }),
    });
    const html: string = mockSend.mock.calls[0][0].html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('caps per email: the 4th request still returns the generic 200 but does no lookup or send', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u9', email: 'victim@example.com' });
    mockPrisma.user.update.mockResolvedValue({});
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post('/auth/forgot-password', { email: 'victim@example.com' })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledTimes(3);
    const capped = await post('/auth/forgot-password', { email: 'victim@example.com' });
    expect(capped.json.message).toBe('If that email exists, a reset link has been sent.');
    // another address is unaffected
    mockPrisma.user.findUnique.mockClear();
    await post('/auth/forgot-password', { email: 'someone-else@example.com' });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('POST /auth/login per-account limiter', () => {
  it('blocks the 21st failed attempt on one account even when every attempt comes from a different IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < 22; i++) results.push((await post('/auth/login', { email: 'Target@Example.com', password: 'guess' + i })).status);
    expect(results.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(results[20]).toBe(429);
    expect(results[21]).toBe(429);
    expect(mockLogin).toHaveBeenCalledTimes(20); // blocked attempts never reach the controller
  });

  it('does not affect a different account, and the email key is case-insensitive', async () => {
    const other = await post('/auth/login', { email: 'other@example.com', password: 'x' });
    expect(other.status).toBe(400);
    const sameAccountDifferentCase = await post('/auth/login', { email: 'TARGET@example.com', password: 'x' });
    expect(sameAccountDifferentCase.status).toBe(429);
  });
});
