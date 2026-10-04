/**
 * routes/etsyWebhook.ts -- ADR-135 batch E-B4, route half of acceptance 1 and 6: the webhook route is
 * public (no authentication middleware, no per-route kill switch), answers 200 when the connector is
 * off, and sees the exact raw bytes when express.raw is mounted ahead of the global JSON parser, as the
 * wiring notes require. Express app on an ephemeral port, node fetch as the client. The prisma client is
 * an in-memory fake; no Etsy call, no real database.
 */

import * as crypto from 'crypto';

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
let mockPrisma: any = {};
jest.mock('../../lib/prisma', () => ({
  get prisma() {
    return mockPrisma;
  },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import router from '../etsyWebhook';
import { computeEtsyWebhookSignature } from '../../controllers/etsyWebhookController';
import { makeEtsySyncFakeDb } from '../../services/marketplace/__tests__/etsySyncFakeDb';

const KEY = crypto.randomBytes(32);
const SECRET = `whsec_${KEY.toString('base64')}`;

function buildApp() {
  const app = express();
  // Same order index.ts must use: raw body for this path first, then the global JSON parser, then the router.
  app.use('/api/etsy/webhook', express.raw({ type: '*/*' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/etsy/webhook', router);
  return app;
}

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});
beforeEach(() => {
  for (const k of ['ETSY_CONNECTOR_ENABLED', 'ETSY_WEBHOOK_SECRET']) saved[k] = process.env[k];
  mockPrisma = makeEtsySyncFakeDb();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

function post(raw: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/etsy/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw });
}
function signedHeaders(raw: string, id = 'wh_route_1') {
  const ts = String(Math.floor(Date.now() / 1000));
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': computeEtsyWebhookSignature(KEY, id, ts, Buffer.from(raw, 'utf8')) };
}
const tick = () => new Promise((r) => setImmediate(r));

describe('router shape', () => {
  it('has exactly one route, POST /, with one handler and no auth or kill switch layer', () => {
    const layers = (router as any).stack.filter((l: any) => l.route);
    expect(layers).toHaveLength(1);
    expect(layers[0].route.path).toBe('/');
    expect(layers[0].route.methods).toEqual({ post: true });
    expect(layers[0].route.stack).toHaveLength(1);
    // No router-level middleware at all: a router.use(killSwitch) would swallow the 200 acknowledgement.
    expect((router as any).stack.filter((l: any) => !l.route)).toHaveLength(0);
  });
});

describe('over HTTP', () => {
  it('connector off: unsigned POST answers 200 and nothing is written', async () => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    process.env.ETSY_WEBHOOK_SECRET = SECRET;
    const res = await post('{"event_type":"order.paid"}');
    expect(res.status).toBe(200);
    expect(mockPrisma.store.webhookEvents).toHaveLength(0);
  });

  it('connector on, no signature headers: 401', async () => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    process.env.ETSY_WEBHOOK_SECRET = SECRET;
    const res = await post('{"event_type":"order.paid","shop_id":555}');
    expect(res.status).toBe(401);
    expect(mockPrisma.store.webhookEvents).toHaveLength(0);
  });

  it('connector on, secret not configured: 503', async () => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    delete process.env.ETSY_WEBHOOK_SECRET;
    const raw = '{"event_type":"order.paid","shop_id":555}';
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(503);
  });

  it('the signature is checked over the exact bytes sent, even with odd whitespace', async () => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    process.env.ETSY_WEBHOOK_SECRET = SECRET;
    const raw = '{ "event_type" :  "order.canceled",\n "shop_id": 555 }';
    const ok = await post(raw, signedHeaders(raw, 'wh_route_2'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true });
    await tick();
    await tick();
    expect(mockPrisma.store.webhookEvents).toEqual([expect.objectContaining({ eventId: 'etsy:wh_route_2', status: 'COMPLETED' })]);

    // The same headers over a re-serialized body must fail: proves the raw bytes, not parsed JSON, are signed.
    const reserialized = JSON.stringify(JSON.parse(raw));
    const bad = await post(reserialized, signedHeaders(raw, 'wh_route_3'));
    expect(bad.status).toBe(401);
  });

  it('a replayed webhook-id answers 200 as a duplicate', async () => {
    process.env.ETSY_CONNECTOR_ENABLED = 'true';
    process.env.ETSY_WEBHOOK_SECRET = SECRET;
    const raw = '{"event_type":"order.canceled","shop_id":555}';
    const h = signedHeaders(raw, 'wh_route_4');
    const first = await post(raw, h);
    await tick();
    await tick();
    const second = await post(raw, h);
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('other methods are not routed', async () => {
    const res = await fetch(`${base}/api/etsy/webhook`, { method: 'GET' });
    expect(res.status).toBe(404);
  });
});
