/**
 * routes/etsyListings.ts -- ADR-135 batch E-B3, route half of acceptance 4: the kill switch is per route
 * and first, authentication and the organizer check come next, then the limiter, then the real handler.
 * Express app on an ephemeral port, node fetch as the client (same style as routes/__tests__/etsy.test.ts).
 * The auth middleware, the rate limiters and the prisma client are stubbed; the real kill switch and the
 * real controller run. No Etsy call, no real database.
 */

const mockLimiterHits = { payment: 0, item: 0 };

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: jest.fn(async () => ({ id: 'org_1' })) },
    item: { findFirst: jest.fn(async () => null) },
    etsyListing: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
  },
}));
jest.mock('../../middleware/rateLimiter', () => ({
  paymentLimiter: (_req: any, _res: any, next: any) => {
    mockLimiterHits.payment++;
    next();
  },
  itemEndpointLimiter: (_req: any, _res: any, next: any) => {
    mockLimiterHits.item++;
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
import router from '../etsyListings';
import { authenticate, requireOrganizer } from '../../middleware/auth';
import { itemEndpointLimiter, paymentLimiter } from '../../middleware/rateLimiter';
import { etsyKillSwitch } from '../../controllers/etsyConnectController';

const ROUTES: Array<{ method: string; path: string; limiter: 'item' | 'payment' }> = [
  { method: 'GET', path: '/api/etsy/items/item_1/eligibility', limiter: 'item' },
  { method: 'GET', path: '/api/etsy/taxonomy/suggest', limiter: 'item' },
  { method: 'POST', path: '/api/etsy/items/item_1/draft', limiter: 'payment' },
  { method: 'GET', path: '/api/etsy/items/item_1/listing', limiter: 'item' },
  { method: 'POST', path: '/api/etsy/items/item_1/publish', limiter: 'payment' },
  { method: 'DELETE', path: '/api/etsy/items/item_1/listing', limiter: 'payment' },
];
const PATTERNS = [
  'GET /api/etsy/items/:id/eligibility',
  'GET /api/etsy/taxonomy/suggest',
  'POST /api/etsy/items/:id/draft',
  'GET /api/etsy/items/:id/listing',
  'POST /api/etsy/items/:id/publish',
  'DELETE /api/etsy/items/:id/listing',
];

const ORGANIZER = { id: 'user_1', roles: ['ORGANIZER'] };
const SHOPPER = { id: 'user_9', roles: ['USER'] };

async function call(method: string, path: string, user?: any, body: any = {}) {
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
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

const saved = { connector: process.env.ETSY_CONNECTOR_ENABLED, push: process.env.ETSY_PUSH_ENABLED };
beforeEach(() => {
  mockLimiterHits.payment = 0;
  mockLimiterHits.item = 0;
});
afterEach(() => {
  for (const [key, value] of [
    ['ETSY_CONNECTOR_ENABLED', saved.connector],
    ['ETSY_PUSH_ENABLED', saved.push],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('router stack', () => {
  const layers = (router as any).stack as any[];

  it('has only real routes (the kill switch is per route, never router.use)', () => {
    expect(layers.length).toBe(ROUTES.length);
    for (const layer of layers) expect(layer.route).toBeTruthy();
  });

  it('runs the kill switch, authenticate, requireOrganizer, then the right limiter, then the handler, on every route', () => {
    for (const layer of layers) {
      const handles = layer.route.stack.map((s: any) => s.handle);
      expect(handles).toHaveLength(5);
      expect(handles[0]).toBe(etsyKillSwitch);
      expect(handles[1]).toBe(authenticate);
      expect(handles[2]).toBe(requireOrganizer);
      const method = Object.keys(layer.route.methods)[0];
      const isRead = method === 'get';
      expect(handles[3]).toBe(isRead ? itemEndpointLimiter : paymentLimiter);
      expect(typeof handles[4]).toBe('function');
    }
  });

  it('exposes exactly the six documented routes', () => {
    const found = layers
      .map((l) => Object.keys(l.route.methods).filter((m) => l.route.methods[m]).map((m) => `${m.toUpperCase()} /api/etsy${l.route.path}`))
      .flat()
      .sort();
    expect(found).toEqual([...PATTERNS].sort());
  });
});

describe('kill switch off', () => {
  it.each(ROUTES)('$method $path answers 503 ETSY_DISABLED with enabled:false, even for a signed-in organizer', async ({ method, path }) => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    const res = await call(method, path, ORGANIZER);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'ETSY_DISABLED', enabled: false });
  });

  it.each(ROUTES)('$method $path is blocked for any value other than exactly "true"', async ({ method, path }) => {
    process.env.ETSY_CONNECTOR_ENABLED = 'TRUE';
    expect((await call(method, path, ORGANIZER)).status).toBe(503);
    process.env.ETSY_CONNECTOR_ENABLED = '1';
    expect((await call(method, path, ORGANIZER)).status).toBe(503);
  });

  it('does not touch a sibling router on the same prefix (the webhook keeps answering)', async () => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    const res = await call('POST', '/api/etsy/webhook', undefined);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('stops before the limiter and before authentication', async () => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    const res = await call('POST', '/api/etsy/items/item_1/draft', undefined);
    expect(res.status).toBe(503);
    expect(mockLimiterHits.payment + mockLimiterHits.item).toBe(0);
  });
});

describe('connector on: authentication and organizer checks', () => {
  beforeEach(() => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
  });

  it.each(ROUTES)('$method $path answers 401 when not signed in', async ({ method, path }) => {
    expect((await call(method, path)).status).toBe(401);
  });

  it.each(ROUTES)('$method $path answers 403 for a signed-in user who is not an organizer', async ({ method, path }) => {
    const res = await call(method, path, SHOPPER);
    expect(res.status).toBe(403);
    expect(mockLimiterHits.payment + mockLimiterHits.item).toBe(0);
  });

  it.each(ROUTES)('$method $path runs its limiter exactly once for an organizer', async ({ method, path, limiter }) => {
    process.env.ETSY_PUSH_ENABLED = 'false';
    await call(method, path, ORGANIZER);
    expect(mockLimiterHits[limiter]).toBe(1);
    expect(mockLimiterHits[limiter === 'item' ? 'payment' : 'item']).toBe(0);
  });

  it('reaches the real handlers: reads of an unknown item answer 404 ETSY_ITEM_NOT_FOUND', async () => {
    for (const path of ['/api/etsy/items/item_1/eligibility', '/api/etsy/items/item_1/listing']) {
      const res = await call('GET', path, ORGANIZER);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ETSY_ITEM_NOT_FOUND');
    }
  });
});

describe('ETSY_PUSH_ENABLED off blocks draft and publish, never end or discard', () => {
  beforeEach(() => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    delete process.env.ETSY_PUSH_ENABLED;
  });

  it('POST draft answers 503 ETSY_PUSH_DISABLED', async () => {
    const res = await call('POST', '/api/etsy/items/item_1/draft', ORGANIZER, { attest: true, taxonomyId: 1234, whenMade: '1970s' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ETSY_PUSH_DISABLED');
  });

  it('POST publish answers 503 ETSY_PUSH_DISABLED', async () => {
    const res = await call('POST', '/api/etsy/items/item_1/publish', ORGANIZER, { confirm: true });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ETSY_PUSH_DISABLED');
  });

  it('DELETE listing still reaches its handler (404 listing not found, not 503)', async () => {
    const res = await call('DELETE', '/api/etsy/items/item_1/listing', ORGANIZER);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ETSY_LISTING_NOT_FOUND');
  });
});
