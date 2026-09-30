/**
 * Refresh-token rotation with reuse detection (2026-09-30 auth hardening).
 * Real express router + real refreshTokenService against an in-memory RefreshToken table; Prisma user lookups,
 * mailer, notifications and the auth controller are mocked (same harness style as authRoutesHardening).
 */
var mockPrisma: any;
var mockRows: any[];
jest.mock('../index', () => {
  mockRows = [];
  const cmp = (a: any, op: string, b: any) => {
    const av = a instanceof Date ? a.getTime() : a;
    const bv = b instanceof Date ? b.getTime() : b;
    return op === 'lt' ? av < bv : av > bv;
  };
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v === null) return row[k] === null || row[k] === undefined;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('lt' in v) return cmp(row[k], 'lt', v.lt);
        if ('gt' in v) return cmp(row[k], 'gt', v.gt);
      }
      return row[k] === v;
    });
  let seq = 0;
  const refreshToken = {
    create: jest.fn(async ({ data }: any) => {
      if (mockRows.some((r) => r.tokenHash === data.tokenHash) || (data.id && mockRows.some((r) => r.id === data.id))) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const row = { id: `rt${++seq}`, createdAt: new Date(), revokedAt: null, revokedReason: null, replacedById: null, ...data };
      mockRows.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => mockRows.find((r) => matches(r, where)) ?? null),
    findFirst: jest.fn(async () => [...mockRows].sort((a, b) => a.createdAt - b.createdAt)[0] ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const r of mockRows) if (matches(r, where)) { Object.assign(r, data); count++; }
      return { count };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const r = mockRows.find((x) => matches(x, where));
      Object.assign(r, data);
      return r;
    }),
    count: jest.fn(async ({ where }: any) => mockRows.filter((r) => matches(r, where)).length),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = mockRows.length;
      for (let i = mockRows.length - 1; i >= 0; i--) if (matches(mockRows[i], where)) mockRows.splice(i, 1);
      return { count: before - mockRows.length };
    }),
  };
  mockPrisma = {
    refreshToken,
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
    userRoleSubscription: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { prisma: mockPrisma };
});
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue({}) } } }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/auth', () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));
jest.mock('../controllers/authController', () => {
  const noop = (_req: any, res: any) => res.json({});
  return {
    register: noop, login: noop, oauthLogin: noop, redeemInvite: noop, verifyEmail: noop,
    oauthVerifyAge: noop, linkOAuthProvider: noop, getRegistrationChallenge: noop, exitImpersonation: noop,
  };
});
jest.mock('../utils/securityEvent', () => ({ logSecurityEvent: jest.fn() }));

import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import authRouter from '../routes/auth';
import {
  issueRefreshToken, rotateRefreshToken, revokeAllRefreshTokensForUser, pruneExpiredRefreshTokens,
  hashJti, __resetRefreshTokenCaches,
} from '../services/refreshTokenService';
import { logSecurityEvent } from '../utils/securityEvent';

let server: http.Server;
let base = '';
const SECRET = 'unit-test-refresh-secret';
const userRow = {
  role: 'USER', roles: ['USER'], tokenVersion: 0, suspendedAt: null, deletedAt: null, organizer: null,
};
const claims = { id: 'u1', email: 'a@b.co', name: 'A', role: 'USER', roles: ['USER'], tokenVersion: 0, organizerTokenVersion: 0 };

beforeAll(async () => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = SECRET;
  process.env.FRONTEND_URL = 'https://finda.sale';
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(() => {
  mockRows.length = 0;
  __resetRefreshTokenCaches();
  delete process.env.AUTH_REFRESH_REUSE_LEEWAY_SECONDS;
  delete process.env.AUTH_LEGACY_REFRESH_GRACE_DAYS;
  delete process.env.AUTH_LEGACY_REFRESH_GRACE_STARTS_AT;
  mockPrisma.user.findUnique.mockReset().mockResolvedValue({ ...userRow });
  (logSecurityEvent as jest.Mock).mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function refresh(opts: { cookie?: string; header?: string }) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = `refreshToken=${opts.cookie}`;
  if (opts.header) headers['x-refresh-token'] = opts.header;
  const r = await fetch(base + '/auth/refresh', { method: 'POST', headers });
  const setCookies: string[] = (r.headers as any).getSetCookie?.() ?? [];
  const rotated = setCookies.map((c) => /^refreshToken=([^;]*)/.exec(c)?.[1]).find((v) => v);
  return { status: r.status, json: await r.json().catch(() => ({})), setCookies, rotated };
}
async function logout(cookie: string) {
  return fetch(base + '/auth/logout', { method: 'POST', headers: { cookie: `refreshToken=${cookie}` } });
}
const rowFor = (token: string) => mockRows.find((r) => r.tokenHash === hashJti((jwt.decode(token) as any).jti));
// A pre-deploy token: same claims and secret, but no jti and no database row.
const legacyToken = () => jwt.sign(claims, SECRET, { expiresIn: '30d' });

describe('issue', () => {
  it('signs a jti into the token and stores only its SHA-256 (never the token)', async () => {
    const token = await issueRefreshToken(claims, { req: { ip: '9.9.9.9', headers: { 'user-agent': 'UA/1' } } });
    const decoded: any = jwt.verify(token, SECRET);
    expect(decoded.id).toBe('u1');
    expect(typeof decoded.jti).toBe('string');
    expect(mockRows).toHaveLength(1);
    expect(mockRows[0].tokenHash).toBe(hashJti(decoded.jti));
    expect(JSON.stringify(mockRows[0])).not.toContain(token);
    expect(mockRows[0]).toMatchObject({ userId: 'u1', ip: '9.9.9.9', userAgent: 'UA/1', revokedAt: null });
  });

  it('falls back to a stateless token (with an error log) when the table does not exist yet', async () => {
    mockPrisma.refreshToken.create.mockRejectedValueOnce(Object.assign(new Error('The table `public.RefreshToken` does not exist'), { code: 'P2021' }));
    const token = await issueRefreshToken(claims);
    expect((jwt.verify(token, SECRET) as any).jti).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('propagates other database errors instead of silently issuing an untracked token', async () => {
    mockPrisma.refreshToken.create.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'P1001' }));
    await expect(issueRefreshToken(claims)).rejects.toThrow('connection lost');
  });
});

describe('POST /auth/refresh rotation', () => {
  it('consumes the presented token, issues the next one in the same family, and sets it as the cookie', async () => {
    const a = await issueRefreshToken(claims);
    const res = await refresh({ cookie: a });
    expect(res.status).toBe(200);
    expect(typeof res.json.token).toBe('string');
    expect(res.rotated).toBeTruthy();
    expect(res.rotated).not.toBe(a);
    expect(res.setCookies.some((c) => /HttpOnly/i.test(c) && /Secure/i.test(c) && /SameSite=Lax/i.test(c))).toBe(true);
    const rowA = rowFor(a);
    const rowB = rowFor(res.rotated!);
    expect(rowA.revokedReason).toBe('rotated');
    expect(rowA.revokedAt).toBeTruthy();
    expect(rowA.replacedById).toBe(rowB.id);
    expect(rowB.familyId).toBe(rowA.familyId);
    expect(rowB.revokedAt).toBeNull();
    // The new token keeps working, and rotates again
    const again = await refresh({ cookie: res.rotated });
    expect(again.status).toBe(200);
    expect(again.rotated).not.toBe(res.rotated);
  });

  it('reuse detection: replaying a consumed token (outside the leeway) revokes the WHOLE family and logs a security event', async () => {
    process.env.AUTH_REFRESH_REUSE_LEEWAY_SECONDS = '0';
    const a = await issueRefreshToken(claims);
    const first = await refresh({ cookie: a });
    expect(first.status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));
    const replay = await refresh({ cookie: a }); // the thief (or the owner's stale copy) presents the old token
    expect(replay.status).toBe(401);
    expect(replay.json.code).toBe('REFRESH_REUSE_DETECTED');
    expect(mockRows.every((r) => r.revokedAt)).toBe(true);
    expect(mockRows.filter((r) => r.revokedReason === 'reuse_detected')).toHaveLength(1); // the live child
    expect(logSecurityEvent).toHaveBeenCalledWith('refresh_token_reuse', expect.objectContaining({ userId: 'u1' }));
    // ...so the legitimate newest token is dead too and login is required
    const child = await refresh({ cookie: first.rotated });
    expect(child.status).toBe(401);
    expect(child.json.code).toBe('REFRESH_REVOKED');
  });

  it('a concurrent refresh inside the leeway gets a sibling token instead of tripping the alarm', async () => {
    const a = await issueRefreshToken(claims);
    const [r1, r2] = [await refresh({ cookie: a }), await refresh({ cookie: a })];
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.rotated).not.toBe(r1.rotated);
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(mockRows.filter((r) => !r.revokedAt)).toHaveLength(2); // two live siblings in one family
    expect(new Set(mockRows.map((r) => r.familyId)).size).toBe(1);
  });

  it('losing the atomic claim race is handled as a used token, not a crash', async () => {
    const a = await issueRefreshToken(claims);
    // The row is consumed by a concurrent request (which also issued its child) between our read and our
    // conditional update: our updateMany matches nothing.
    mockPrisma.refreshToken.updateMany.mockImplementationOnce(async () => {
      const row = rowFor(a);
      row.revokedAt = new Date();
      row.revokedReason = 'rotated';
      mockRows.push({ id: 'winner-child', userId: 'u1', familyId: row.familyId, tokenHash: 'winner', createdAt: new Date(), expiresAt: new Date(Date.now() + 1e9), revokedAt: null });
      return { count: 0 };
    });
    const res = await refresh({ cookie: a });
    expect(res.status).toBe(200); // inside the leeway: a sibling is issued rather than an alarm
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(mockRows.filter((r) => !r.revokedAt)).toHaveLength(2);
  });

  it('logout revokes the family, so the cookie is useless afterwards', async () => {
    const a = await issueRefreshToken(claims);
    const res = await refresh({ cookie: a });
    await logout(res.rotated!);
    expect(mockRows.every((r) => r.revokedAt)).toBe(true);
    expect(rowFor(res.rotated!).revokedReason).toBe('logout');
    const after = await refresh({ cookie: res.rotated });
    expect(after.status).toBe(401);
    expect(after.json.code).toBe('REFRESH_REVOKED');
  });

  it('revokeAllRefreshTokensForUser (password change / reset) revokes every family of that user only', async () => {
    const a = await issueRefreshToken(claims);
    const b = await issueRefreshToken(claims);
    const other = await issueRefreshToken({ ...claims, id: 'u2' });
    expect(await revokeAllRefreshTokensForUser('u1', 'password_change')).toBe(2);
    expect(rowFor(a).revokedReason).toBe('password_change');
    expect(rowFor(b).revokedAt).toBeTruthy();
    expect(rowFor(other).revokedAt).toBeNull();
    expect((await refresh({ cookie: a })).status).toBe(401);
    expect((await refresh({ cookie: other })).status).toBe(200);
  });

  it('rejects a validly signed token that has no row and no legacy shape (unknown jti)', async () => {
    const forged = jwt.sign(claims, SECRET, { expiresIn: '30d', jwtid: 'not-in-the-table' });
    const res = await refresh({ cookie: forged });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('REFRESH_UNKNOWN');
  });

  it('still enforces suspension, deletion and tokenVersion before rotating', async () => {
    const a = await issueRefreshToken(claims);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...userRow, suspendedAt: new Date() });
    expect((await refresh({ cookie: a })).status).toBe(401);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...userRow, deletedAt: new Date() });
    expect((await refresh({ cookie: a })).status).toBe(401);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...userRow, tokenVersion: 3 });
    expect((await refresh({ cookie: a })).status).toBe(401);
    expect(rowFor(a).revokedAt).toBeNull(); // none of those consumed the token
  });

  it('answers 503 (keeping the cookies) on a database failure instead of signing the user out', async () => {
    const a = await issueRefreshToken(claims);
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
    const res = await refresh({ cookie: a });
    expect(res.status).toBe(503);
    expect(res.setCookies.filter((c) => /^refreshToken=;/.test(c))).toHaveLength(0);
  });

  it('a garbage token is a 401 with cookies cleared', async () => {
    const res = await refresh({ cookie: 'not.a.jwt' });
    expect(res.status).toBe(401);
    expect(res.setCookies.some((c) => /^refreshToken=;/.test(c))).toBe(true);
  });
});

describe('header-sourced refresh (browser extension: cannot store a rotated cookie)', () => {
  it('validates against the row but neither consumes it nor hands out a new refresh token', async () => {
    const a = await issueRefreshToken(claims);
    const res = await refresh({ header: a });
    expect(res.status).toBe(200);
    expect(typeof res.json.token).toBe('string');
    expect(res.rotated).toBeUndefined();
    expect(res.json.refreshToken).toBeUndefined();
    expect(rowFor(a).revokedAt).toBeNull();
    expect(mockRows).toHaveLength(1);
    expect((await refresh({ header: a })).status).toBe(200); // repeatable, like the extension expects
  });

  it('a revoked family stops the extension too', async () => {
    const a = await issueRefreshToken(claims);
    await logout(a);
    expect((await refresh({ header: a })).status).toBe(401);
  });
});

describe('legacy (pre-deploy) refresh tokens: one-time grace upgrade', () => {
  it('accepts a legacy token ONCE and upgrades it into a new tracked family', async () => {
    const legacy = legacyToken();
    const res = await refresh({ cookie: legacy });
    expect(res.status).toBe(200);
    const upgraded = res.rotated!;
    expect(typeof (jwt.decode(upgraded) as any).jti).toBe('string');
    const legacyRow = mockRows.find((r) => r.tokenHash.startsWith('legacy:'));
    expect(legacyRow.revokedReason).toBe('legacy_upgraded');
    expect(rowFor(upgraded).familyId).toBe(legacyRow.familyId);
    expect((await refresh({ cookie: upgraded })).status).toBe(200); // the upgraded token rotates normally
  });

  it('a replay of the same legacy token (outside the leeway) is refused and revokes the upgraded family', async () => {
    process.env.AUTH_REFRESH_REUSE_LEEWAY_SECONDS = '0';
    const legacy = legacyToken();
    const first = await refresh({ cookie: legacy });
    expect(first.status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));
    const replay = await refresh({ cookie: legacy });
    expect(replay.status).toBe(401);
    expect(replay.json.code).toBe('REFRESH_REUSE_DETECTED');
    expect((await refresh({ cookie: first.rotated })).status).toBe(401);
  });

  it('a concurrent second tab presenting the same legacy token inside the leeway also succeeds', async () => {
    const legacy = legacyToken();
    expect((await refresh({ cookie: legacy })).status).toBe(200);
    expect((await refresh({ cookie: legacy })).status).toBe(200);
  });

  it('is refused once the grace window (AUTH_LEGACY_REFRESH_GRACE_DAYS from the first issued row) has passed', async () => {
    process.env.AUTH_LEGACY_REFRESH_GRACE_DAYS = '14';
    await issueRefreshToken(claims); // first row ever: anchors the window
    mockRows[0].createdAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const res = await refresh({ cookie: legacyToken() });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('LEGACY_REFRESH_EXPIRED');
  });

  it('is accepted inside the window, and AUTH_LEGACY_REFRESH_GRACE_DAYS=0 disables legacy acceptance', async () => {
    await issueRefreshToken(claims);
    mockRows[0].createdAt = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    expect((await refresh({ cookie: legacyToken() })).status).toBe(200);
    __resetRefreshTokenCaches();
    process.env.AUTH_LEGACY_REFRESH_GRACE_DAYS = '0';
    const res = await refresh({ cookie: legacyToken() });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('LEGACY_REFRESH_EXPIRED');
  });

  it('AUTH_LEGACY_REFRESH_GRACE_STARTS_AT overrides the anchor', async () => {
    process.env.AUTH_LEGACY_REFRESH_GRACE_STARTS_AT = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    expect((await refresh({ cookie: legacyToken() })).json.code).toBe('LEGACY_REFRESH_EXPIRED');
  });

  it('header-sourced legacy tokens are accepted during the window without being consumed', async () => {
    const legacy = legacyToken();
    expect((await refresh({ header: legacy })).status).toBe(200);
    expect((await refresh({ header: legacy })).status).toBe(200);
    expect(mockRows.filter((r) => r.tokenHash.startsWith('legacy:'))).toHaveLength(0);
  });

  it('logout burns a legacy token so it cannot be used afterwards', async () => {
    const legacy = legacyToken();
    await logout(legacy);
    const res = await refresh({ cookie: legacy });
    expect(res.status).toBe(401);
  });

  it('keeps working while the RefreshToken table is missing (migration not applied yet)', async () => {
    const err = Object.assign(new Error('The table `public.RefreshToken` does not exist'), { code: 'P2021' });
    mockPrisma.refreshToken.findFirst.mockRejectedValueOnce(err);
    mockPrisma.$transaction.mockRejectedValueOnce(err);
    const res = await refresh({ cookie: legacyToken() });
    expect(res.status).toBe(200);
  });
});

describe('rotateRefreshToken / prune (service level)', () => {
  it('refuses a token whose row belongs to a different user', async () => {
    const a = await issueRefreshToken(claims);
    const payload: any = jwt.decode(a);
    const r = await rotateRefreshToken({ presented: a, payload: { ...payload, id: 'someone-else' }, rotate: true, nextClaims: claims });
    expect(r).toEqual({ ok: false, code: 'REFRESH_UNKNOWN' });
  });

  it('refuses an expired row', async () => {
    const a = await issueRefreshToken(claims);
    const r = await rotateRefreshToken({ presented: a, payload: jwt.decode(a), rotate: true, nextClaims: claims, now: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000) });
    expect(r).toEqual({ ok: false, code: 'REFRESH_EXPIRED' });
  });

  it('prunes rows that expired more than 7 days ago and keeps everything newer', async () => {
    const a = await issueRefreshToken(claims);
    const b = await issueRefreshToken(claims);
    rowFor(a).expiresAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    rowFor(b).expiresAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(await pruneExpiredRefreshTokens()).toBe(1);
    expect(mockRows).toHaveLength(1);
  });
});
