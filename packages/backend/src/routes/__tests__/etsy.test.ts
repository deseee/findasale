/**
 * routes/etsy.ts -- ADR-135 batch B1, route half of acceptance item 6 (kill switch) and the guard order.
 * Express app on an ephemeral port, node fetch as the client (supertest is not installed). The auth
 * middleware, the rate limiter and the prisma client are stubbed; the real kill switch and the real
 * controller run. No Etsy call, no database.
 */

const mockLimiterHits = { count: 0 };

jest.mock('../../lib/prisma', () => ({
  prisma: { organizer: { findUnique: jest.fn(async () => null) } },
}));
jest.mock('../../middleware/rateLimiter', () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => {
    mockLimiterHits.count++;
    next();
  },
}));
jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
  requireOrganizer: (req: any, res: any, next: any) => {
    const roles: string[] = req.user?.roles ?? [];
    if (!req.user || !roles.includes('ORGANIZER')) return res.status(403).json({ message: 'Organizer access required.' });
    next();
  },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import router from '../etsy';
import { authenticate, requireOrganizer } from '../../middleware/auth';
import { etsyKillSwitch } from '../../controllers/etsyConnectController';

const ROUTES: Array<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/etsy/connect' },
  { method: 'POST', path: '/api/etsy/callback' },
  { method: 'GET', path: '/api/etsy/connection' },
  { method: 'DELETE', path: '/api/etsy/connection' },
  { method: 'GET', path: '/api/etsy/shop-setup' },
  { method: 'PUT', path: '/api/etsy/shop-setup' },
];

const ORGANIZER = { id: 'user_1', roles: ['ORGANIZER'] };
const SHOPPER = { id: 'user_9', roles: ['USER'] };

async function call(method: string, path: string, user?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/etsy', router);
  // Another router sharing the prefix, like the public webhook: it must keep answering when the connector is off.
  const webhookLike = express.Router();
  webhookLike.post('/webhook', (_req, res) => res.status(200).json({ ok: true }));
  app.use('/api/etsy', webhookLike);

  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify({}),
    });
    const body: any = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

const savedFlag = process.env.ETSY_CONNECTOR_ENABLED;
beforeEach(() => {
  mockLimiterHits.count = 0;
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.ETSY_CONNECTOR_ENABLED;
  else process.env.ETSY_CONNECTOR_ENABLED = savedFlag;
});

describe('router stack', () => {
  const layers = (router as any).stack as any[];

  it('has only real routes (the kill switch is per route, never router.use)', () => {
    expect(layers.length).toBe(ROUTES.length);
    for (const layer of layers) expect(layer.route).toBeTruthy();
  });

  it('runs the kill switch first, then authenticate, then requireOrganizer on every route', () => {
    for (const layer of layers) {
      const handles = layer.route.stack.map((s: any) => s.handle);
      expect(handles[0]).toBe(etsyKillSwitch);
      expect(handles[1]).toBe(authenticate);
      expect(handles[2]).toBe(requireOrganizer);
    }
  });

  it('exposes exactly the six documented routes', () => {
    const found = layers
      .map((l) => {
        const methods = Object.keys(l.route.methods).filter((m) => l.route.methods[m]);
        return methods.map((m) => `${m.toUpperCase()} /api/etsy${l.route.path}`);
      })
      .flat()
      .sort();
    expect(found).toEqual(ROUTES.map((r) => `${r.method} ${r.path}`).sort());
  });
});

describe('kill switch off (acceptance 6)', () => {
  it.each(ROUTES)('$method $path answers 503 ETSY_DISABLED with enabled:false, even for a signed-in organizer', async ({ method, path }) => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    const res = await call(method, path, ORGANIZER);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'ETSY_DISABLED', enabled: false });
    expect(mockLimiterHits.count).toBe(0);
  });

  it.each(ROUTES)('$method $path answers 503 (not 401) for an anonymous caller when the flag is not exactly true', async ({ method, path }) => {
    process.env.ETSY_CONNECTOR_ENABLED = 'TRUE';
    const res = await call(method, path);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ETSY_DISABLED');
  });

  it('does not swallow another router on the same prefix: the webhook-style route still answers 200', async () => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    const res = await call('POST', '/api/etsy/webhook');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('kill switch on', () => {
  beforeEach(() => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
  });

  it.each(ROUTES)('$method $path answers 401 without a session', async ({ method, path }) => {
    const res = await call(method, path);
    expect(res.status).toBe(401);
    expect(mockLimiterHits.count).toBe(0);
  });

  it.each(ROUTES)('$method $path answers 403 for a signed-in user who is not an organizer', async ({ method, path }) => {
    const res = await call(method, path, SHOPPER);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Organizer access required.' });
    expect(mockLimiterHits.count).toBe(0);
  });

  it.each(ROUTES)('$method $path reaches the controller for an organizer (404 when the profile row is missing)', async ({ method, path }) => {
    const res = await call(method, path, ORGANIZER);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Organizer profile not found' });
  });

  it('rate limits the routes that create state, exchange a code or spend Etsy budget, and not the local-state routes', async () => {
    const limited = ['GET /api/etsy/connect', 'POST /api/etsy/callback', 'GET /api/etsy/shop-setup', 'PUT /api/etsy/shop-setup'];
    for (const r of ROUTES) {
      mockLimiterHits.count = 0;
      await call(r.method, r.path, ORGANIZER);
      const expected = limited.includes(`${r.method} ${r.path}`) ? 1 : 0;
      expect(mockLimiterHits.count).toBe(expected);
    }
  });
});
