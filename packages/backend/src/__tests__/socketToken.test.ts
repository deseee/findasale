/**
 * Socket handshake token (2026-10-16): the socket host is a different origin from the app, so the httpOnly cookie never
 * reaches it. GET /auth/socket-token issues a short-lived purpose:'socket' JWT; the handshake accepts it, the private
 * sale rooms admit the owner and refuse another organizer, and the token can never authenticate an API route.
 * Real express, real authenticate middleware and jsonwebtoken; Prisma and socket.io are mocked.
 */
var mockPrisma: any;
var mockLibPrisma: any;
var mockHandlers: { connection?: (s: any) => void };
jest.mock('../index', () => {
  mockPrisma = { user: { findUnique: jest.fn() }, organizer: { findUnique: jest.fn() } };
  return { prisma: mockPrisma };
});
jest.mock('../lib/prisma', () => {
  mockLibPrisma = {
    user: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
    userRoleSubscription: { findFirst: jest.fn() },
  };
  return { prisma: mockLibPrisma };
});
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../controllers/authController', () => {
  const noop = (_req: any, res: any) => res.json({});
  return {
    register: noop, login: noop, oauthLogin: noop, redeemInvite: noop, verifyEmail: noop,
    oauthVerifyAge: noop, linkOAuthProvider: noop, getRegistrationChallenge: noop, exitImpersonation: noop,
  };
});
jest.mock('socket.io', () => {
  mockHandlers = {};
  return {
    Server: jest.fn().mockImplementation(() => ({
      on: (evt: string, fn: any) => { if (evt === 'connection') mockHandlers.connection = fn; },
      adapter: jest.fn(),
    })),
  };
});

import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import authRouter from '../routes/auth';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { initSocket } from '../lib/socket';
import { signSocketToken, SOCKET_TOKEN_TTL_SECONDS } from '../lib/socketToken';

const SECRET = 'unit-test-jwt-secret';
const baseUser = { id: 'u1', role: 'ORGANIZER', roles: ['ORGANIZER'], tokenVersion: 0, suspendedAt: null, deletedAt: null, suspendReason: null, organizer: null, roleSubscriptions: [] };
const accessToken = (over: any = {}) => jwt.sign({ id: 'u1', role: 'ORGANIZER', tokenVersion: 0, ...over }, SECRET, { expiresIn: '1h' });

let server: http.Server;
let base = '';
let ipCounter = 0;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  const app = express();
  app.set('trust proxy', 1);
  app.use('/auth', authRouter);
  app.get('/api-route', authenticate, (_req, res) => res.json({ ok: true }));
  app.get('/optional-route', optionalAuthenticate, (req: any, res) => res.json({ user: req.user?.id ?? null }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

async function get(path: string, token?: string) {
  const r = await fetch(base + path, {
    headers: { 'x-forwarded-for': `10.8.0.${(ipCounter++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, json: await r.json().catch(() => ({})), headers: r.headers };
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  mockLibPrisma.user.findUnique.mockReset().mockResolvedValue({ ...baseUser });
  mockLibPrisma.sale.findUnique.mockReset().mockResolvedValue({ organizerId: 'org1' });
  mockLibPrisma.organizer.findUnique.mockReset().mockResolvedValue({ id: 'org1' });
  mockLibPrisma.workspaceMember.findFirst.mockReset().mockResolvedValue(null);
  mockLibPrisma.userRoleSubscription.findFirst.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('GET /auth/socket-token', () => {
  it('requires authentication', async () => {
    const r = await get('/auth/socket-token');
    expect(r.status).toBe(401);
    expect(r.json.token).toBeUndefined();
  });

  it('returns a short-lived HS256 JWT with the socket purpose and the caller identity', async () => {
    const r = await get('/auth/socket-token', accessToken());
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    const decoded: any = jwt.verify(r.json.token, SECRET, { algorithms: ['HS256'] });
    expect(decoded.purpose).toBe('socket');
    expect(decoded.id).toBe('u1');
    expect(decoded.tokenVersion).toBe(0);
    expect(decoded.exp - decoded.iat).toBe(SOCKET_TOKEN_TTL_SECONDS);
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(300);
  });

  it('refuses a socket token as the credential for the endpoint itself', async () => {
    const r = await get('/auth/socket-token', signSocketToken({ id: 'u1', tokenVersion: 0 }));
    expect(r.status).toBe(401);
  });

  it('is rate limited', async () => {
    const ip = '10.77.0.1';
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const r = await fetch(base + '/auth/socket-token', { headers: { 'x-forwarded-for': ip, authorization: `Bearer ${accessToken()}` } });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});

describe('a socket-purpose token is not an API credential', () => {
  it('is rejected by authenticate', async () => {
    const t = signSocketToken({ id: 'u1', tokenVersion: 0 });
    expect((await get('/api-route', t)).status).toBe(401);
    expect(mockLibPrisma.user.findUnique).not.toHaveBeenCalled();
    expect((await get('/api-route', accessToken())).status).toBe(200);
  });

  it('is anonymous on optionalAuthenticate routes', async () => {
    const t = signSocketToken({ id: 'u1', tokenVersion: 0 });
    expect((await get('/optional-route', t)).json.user).toBeNull();
    expect((await get('/optional-route', accessToken())).json.user).toBe('u1');
  });
});

const flush = () => new Promise((r) => setImmediate(r));

describe('socket handshake', () => {
  function connect(token?: string) {
    initSocket({} as any, ['https://finda.sale']);
    const handlers: Record<string, (...a: any[]) => any> = {};
    const socket: any = {
      handshake: { auth: token ? { token } : {}, headers: {} },
      data: {},
      connected: true,
      join: jest.fn(),
      leave: jest.fn(),
      on: (evt: string, fn: any) => { handlers[evt] = fn; },
    };
    mockHandlers.connection!(socket);
    return { socket, handlers };
  }

  it('accepts a socket token and admits the owning organizer to the private rooms', async () => {
    const { socket, handlers } = connect(signSocketToken({ id: 'u1', role: 'ORGANIZER', tokenVersion: 0 }));
    expect(socket.data.userId).toBe('u1');
    await flush();
    expect(socket.join).toHaveBeenCalledWith('user:u1');
    await handlers.JOIN_BRIEFING('s1');
    await handlers.JOIN_SALE_STATUS('s1');
    expect(socket.join).toHaveBeenCalledWith('briefing:s1');
    expect(socket.join).toHaveBeenCalledWith('sale-status:s1');
  });

  it('refuses another organizer', async () => {
    mockLibPrisma.organizer.findUnique.mockResolvedValue({ id: 'someone-else' });
    const { socket, handlers } = connect(signSocketToken({ id: 'u2', role: 'ORGANIZER', tokenVersion: 0 }));
    mockLibPrisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 'u2' });
    await handlers.JOIN_BRIEFING('s1');
    await handlers.JOIN_SALE_STATUS('s1');
    expect(socket.join).not.toHaveBeenCalledWith('briefing:s1');
    expect(socket.join).not.toHaveBeenCalledWith('sale-status:s1');
  });

  it('still applies tokenVersion revocation to a socket token', async () => {
    const { socket, handlers } = connect(signSocketToken({ id: 'u1', tokenVersion: 0 }));
    mockLibPrisma.user.findUnique.mockResolvedValue({ ...baseUser, tokenVersion: 1 });
    await handlers.JOIN_BRIEFING('s1');
    expect(socket.join).not.toHaveBeenCalledWith('briefing:s1');
  });

  it('keeps anonymous sockets anonymous (public rooms only) and ignores foreign-purpose tokens', async () => {
    const anon = connect();
    expect(anon.socket.data.userId).toBeUndefined();
    anon.handlers.JOIN_SALE_FEED('s1');
    expect(anon.socket.join).toHaveBeenCalledWith('sale:s1');
    await anon.handlers.JOIN_BRIEFING('s1');
    expect(anon.socket.join).not.toHaveBeenCalledWith('briefing:s1');

    const foreign = connect(jwt.sign({ id: 'u1', tokenVersion: 0, purpose: 'unsubscribe' }, SECRET, { expiresIn: '5m' }));
    expect(foreign.socket.data.userId).toBeUndefined();
  });

  // 2026-10-23 (security): the personal user room carries POS payment requests, hold invoices and cart shares, so
  // the join is gated on the same DB check as the private rooms.
  it('does not join the user room for a revoked token (tokenVersion bumped)', async () => {
    mockLibPrisma.user.findUnique.mockResolvedValue({ ...baseUser, tokenVersion: 1 });
    const { socket } = connect(signSocketToken({ id: 'u1', tokenVersion: 0 }));
    await flush();
    expect(socket.join).not.toHaveBeenCalledWith('user:u1');
  });

  it('does not join the user room for a suspended or deleted user', async () => {
    mockLibPrisma.user.findUnique.mockResolvedValue({ ...baseUser, suspendedAt: new Date() });
    const suspended = connect(signSocketToken({ id: 'u1', tokenVersion: 0 }));
    await flush();
    expect(suspended.socket.join).not.toHaveBeenCalledWith('user:u1');

    mockLibPrisma.user.findUnique.mockResolvedValue({ ...baseUser, deletedAt: new Date() });
    const deleted = connect(accessToken());
    await flush();
    expect(deleted.socket.join).not.toHaveBeenCalledWith('user:u1');

    mockLibPrisma.user.findUnique.mockResolvedValue(null);
    const gone = connect(accessToken());
    await flush();
    expect(gone.socket.join).not.toHaveBeenCalledWith('user:u1');
  });

  it('does not join the user room if the DB check fails', async () => {
    mockLibPrisma.user.findUnique.mockRejectedValue(new Error('db down'));
    const { socket } = connect(accessToken());
    await flush();
    expect(socket.join).not.toHaveBeenCalledWith('user:u1');
  });

  it('rejects an expired socket token', () => {
    const expired = jwt.sign({ id: 'u1', tokenVersion: 0, purpose: 'socket' }, SECRET, { expiresIn: -10 });
    expect(connect(expired).socket.data.userId).toBeUndefined();
  });
});
