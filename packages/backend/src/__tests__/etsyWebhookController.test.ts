/**
 * ADR-135 batch E-B4 acceptance 1 and 2: the Etsy webhook receiver. Signature (HMAC-SHA256 over
 * id.timestamp.rawBody, 300 second tolerance, timing-safe compare), replay protection by webhook-id,
 * kill switch, resource_url never fetched, and the sale ending up in the ledger exactly once.
 * Everything is injected: fake request and response objects, in-memory fake db, fake receipt fetch.
 * No Etsy call, no real database, no timers (the async step is collected, then awaited).
 */

const mockCaptureMessage = jest.fn();
const mockAddBreadcrumb = jest.fn();
jest.mock('@sentry/node', () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  addBreadcrumb: (...a: unknown[]) => mockAddBreadcrumb(...a),
}));
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import * as crypto from 'crypto';
import {
  claimEtsyWebhookEvent,
  computeEtsyWebhookSignature,
  decodeEtsyWebhookSecret,
  ETSY_WEBHOOK_PENDING_STALE_MS,
  makeEtsyWebhookHandler,
  processEtsyWebhookEvent,
  resetEtsyWebhookAlertStateForTests,
  verifyEtsyWebhookSignature,
} from '../controllers/etsyWebhookController';
import type { EtsyWebhookDeps } from '../controllers/etsyWebhookController';
import { makeEtsySyncFakeDb, seedSyncConnection, seedSyncItem, seedSyncListing } from '../services/marketplace/__tests__/etsySyncFakeDb';

const KEY = crypto.randomBytes(32);
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = new Date('2026-10-03T16:00:00.000Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const ENV = { ETSY_CONNECTOR_ENABLED: 'true', ETSY_WEBHOOK_SECRET: SECRET } as any;

function body(over: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      event_type: 'order.paid',
      shop_id: 555,
      resource_url: 'https://api.example.test/v3/application/shops/555/receipts/3001',
      ...over,
    }),
    'utf8'
  );
}

function sign(raw: Buffer, id = 'wh_1', ts = String(NOW_S), key: Buffer = KEY): string {
  return computeEtsyWebhookSignature(key, id, ts, raw);
}

function makeReq(raw: unknown, headers: Record<string, string | undefined> = {}) {
  return { body: raw, headers } as any;
}

function signedReq(raw: Buffer, over: { id?: string; ts?: string; sig?: string } = {}) {
  const id = over.id ?? 'wh_1';
  const ts = over.ts ?? String(NOW_S);
  return makeReq(raw, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': over.sig ?? sign(raw, id, ts) });
}

function makeRes() {
  const res: any = { statusCode: 0, payload: undefined, headersSent: false };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (p: unknown) => {
    res.payload = p;
    res.headersSent = true;
    return res;
  };
  return res;
}

const receiptTx = (over: Record<string, unknown> = {}) => ({
  transactionId: '7001',
  listingId: '9001',
  quantity: 1,
  receiptId: '3001',
  paidAt: new Date('2026-10-03T15:00:00.000Z'),
  ...over,
});

function world(opts: { itemOver?: Record<string, any>; env?: any } = {}) {
  const db = makeEtsySyncFakeDb({ clock: () => NOW });
  const item = seedSyncItem(db, opts.itemOver);
  seedSyncListing(db, { itemId: item.id });
  const conn = seedSyncConnection(db);
  const fetchReceipt = jest.fn(async (_a: { organizerId: string; shopId: string; receiptId: string }) => ({
    ok: true as const,
    transactions: [receiptTx()],
  }));
  const sellItemUnits = jest.fn(async (itemId: string, units: number) => {
    const row = db.store.items.find((r: any) => r.id === itemId);
    const total = row.stockTotal ?? 1;
    row.stockSold += units;
    const fullySoldOut = row.stockSold >= total;
    if (fullySoldOut) row.status = 'SOLD';
    return { fullySoldOut, remainingStock: Math.max(total - row.stockSold, 0) };
  });
  const fanOut = jest.fn();
  const notify = jest.fn(async () => undefined);
  const tasks: Array<() => Promise<void>> = [];
  const deps: EtsyWebhookDeps = {
    db,
    env: opts.env ?? ENV,
    now: () => NOW,
    fetchReceipt,
    sellItemUnits,
    syncStock: jest.fn(async () => undefined),
    fanOut,
    notify,
    schedule: (fn: () => Promise<void>) => {
      tasks.push(fn);
    },
  } as any;
  const handler = makeEtsyWebhookHandler(deps);
  const drain = async () => {
    while (tasks.length) await tasks.shift()!();
  };
  return { db, item, conn, deps, handler, tasks, drain, fetchReceipt, sellItemUnits, fanOut, notify };
}

async function deliver(w: ReturnType<typeof world>, req: any) {
  const res = makeRes();
  await w.handler(req, res);
  return res;
}

beforeEach(() => {
  mockCaptureMessage.mockClear();
  mockAddBreadcrumb.mockClear();
  resetEtsyWebhookAlertStateForTests();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('signature verification (acceptance 1)', () => {
  const raw = body();
  const base = { secret: SECRET, webhookId: 'wh_1', timestamp: String(NOW_S), rawBody: raw, nowSeconds: NOW_S };

  it('accepts a correct signature (whsec_ prefix removed, base64 decoded, HMAC-SHA256 base64)', () => {
    expect(verifyEtsyWebhookSignature({ ...base, signature: sign(raw) })).toEqual({ ok: true });
    const manual = crypto.createHmac('sha256', KEY).update(`wh_1.${NOW_S}.${raw.toString('utf8')}`).digest('base64');
    expect(sign(raw)).toBe(manual);
  });

  it('decodes the secret with or without the prefix and refuses empty secrets', () => {
    expect(decodeEtsyWebhookSecret(SECRET)!.equals(KEY)).toBe(true);
    expect(decodeEtsyWebhookSecret(KEY.toString('base64'))!.equals(KEY)).toBe(true);
    expect(decodeEtsyWebhookSecret('whsec_')).toBeNull();
    expect(decodeEtsyWebhookSecret('')).toBeNull();
    expect(decodeEtsyWebhookSecret(undefined)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const other = crypto.randomBytes(32);
    expect(verifyEtsyWebhookSignature({ ...base, signature: sign(raw, 'wh_1', String(NOW_S), other) })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a tampered body, a tampered id and a tampered timestamp', () => {
    const good = sign(raw);
    expect(verifyEtsyWebhookSignature({ ...base, rawBody: body({ shop_id: 556 }), signature: good })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyEtsyWebhookSignature({ ...base, webhookId: 'wh_2', signature: good })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyEtsyWebhookSignature({ ...base, timestamp: String(NOW_S + 1), signature: good })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('accepts 300 seconds of clock skew either way and rejects 301', () => {
    for (const skew of [-300, 300]) {
      const ts = String(NOW_S + skew);
      expect(verifyEtsyWebhookSignature({ ...base, timestamp: ts, signature: sign(raw, 'wh_1', ts) })).toEqual({ ok: true });
    }
    for (const skew of [-301, 301]) {
      const ts = String(NOW_S + skew);
      expect(verifyEtsyWebhookSignature({ ...base, timestamp: ts, signature: sign(raw, 'wh_1', ts) })).toEqual({ ok: false, reason: 'stale-timestamp' });
    }
  });

  it('accepts a v1, prefix and several space separated entries, rejects v2 and garbage entries', () => {
    const good = sign(raw);
    expect(verifyEtsyWebhookSignature({ ...base, signature: `v1,${good}` })).toEqual({ ok: true });
    expect(verifyEtsyWebhookSignature({ ...base, signature: `v1,${sign(raw, 'x')} v1,${good}` })).toEqual({ ok: true });
    expect(verifyEtsyWebhookSignature({ ...base, signature: `${sign(raw, 'x')} ${good}` })).toEqual({ ok: true });
    expect(verifyEtsyWebhookSignature({ ...base, signature: `v2,${good}` })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyEtsyWebhookSignature({ ...base, signature: '!!!not-base64!!! ,,,' })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reports missing headers, bad shapes and a missing secret', () => {
    const good = sign(raw);
    expect(verifyEtsyWebhookSignature({ ...base, webhookId: undefined, signature: good })).toEqual({ ok: false, reason: 'missing-headers' });
    expect(verifyEtsyWebhookSignature({ ...base, timestamp: undefined, signature: good })).toEqual({ ok: false, reason: 'missing-headers' });
    expect(verifyEtsyWebhookSignature({ ...base, signature: undefined })).toEqual({ ok: false, reason: 'missing-headers' });
    expect(verifyEtsyWebhookSignature({ ...base, timestamp: 'abc', signature: good })).toEqual({ ok: false, reason: 'bad-timestamp' });
    expect(verifyEtsyWebhookSignature({ ...base, webhookId: 'has space', signature: good })).toEqual({ ok: false, reason: 'bad-timestamp' });
    expect(verifyEtsyWebhookSignature({ ...base, secret: '', signature: good })).toEqual({ ok: false, reason: 'no-secret' });
  });

  it('compares with crypto.timingSafeEqual over decoded buffers, never === on the strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'controllers', 'etsyWebhookController.ts'), 'utf8');
    expect(src).toContain('crypto.timingSafeEqual(candidate, expected)');
    expect(src).not.toMatch(/(?:signature|entry|b64)\s*===\s*(?:expected|computed)/);
  });
});

describe('handler: kill switch and request shape (acceptance 1, 6)', () => {
  it.each([[undefined], ['false'], ['TRUE'], ['1'], ['']])('ETSY_CONNECTOR_ENABLED=%p answers 200 and does nothing', async (flag) => {
    const w = world({ env: { ETSY_CONNECTOR_ENABLED: flag, ETSY_WEBHOOK_SECRET: SECRET } });
    const raw = body();
    const res = await deliver(w, signedReq(raw));
    expect(res.statusCode).toBe(200);
    expect(w.tasks).toHaveLength(0);
    expect(w.db.store.webhookEvents).toHaveLength(0);
    expect(w.fetchReceipt).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('kill switch off answers 200 even for an unsigned, non-buffer request and never touches the database', async () => {
    const dbSpy = jest.fn(() => {
      throw new Error('the database must not be touched');
    });
    const handler = makeEtsyWebhookHandler({ env: { ETSY_CONNECTOR_ENABLED: 'false' } as any, db: new Proxy({}, { get: dbSpy }) } as any);
    const res = makeRes();
    await handler(makeReq({ not: 'a buffer' }), res);
    expect(res.statusCode).toBe(200);
    expect(dbSpy).not.toHaveBeenCalled();
  });

  it('a body that is not the raw Buffer answers 400 and raises a Sentry error', async () => {
    const w = world();
    const res = await deliver(w, makeReq({ event_type: 'order.paid' }, { 'webhook-id': 'wh_1' }));
    expect(res.statusCode).toBe(400);
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('raw body'), expect.objectContaining({ level: 'error' }));
    expect(w.tasks).toHaveLength(0);
  });

  it('an empty Buffer answers 400', async () => {
    const w = world();
    const res = await deliver(w, makeReq(Buffer.alloc(0)));
    expect(res.statusCode).toBe(400);
  });

  it('a missing ETSY_WEBHOOK_SECRET answers 503 and processes nothing', async () => {
    const w = world({ env: { ETSY_CONNECTOR_ENABLED: 'true' } });
    const raw = body();
    const res = await deliver(w, signedReq(raw));
    expect(res.statusCode).toBe(503);
    expect(w.db.store.webhookEvents).toHaveLength(0);
    expect(w.tasks).toHaveLength(0);
  });

  it('a bad signature answers 401 with a fixed body, claims nothing and logs no secret or header value', async () => {
    const w = world();
    const raw = body();
    const res = await deliver(w, signedReq(raw, { sig: sign(raw, 'wh_1', String(NOW_S), crypto.randomBytes(32)) }));
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ received: false });
    expect(w.db.store.webhookEvents).toHaveLength(0);
    expect(w.tasks).toHaveLength(0);
    const logged = JSON.stringify(mockCaptureMessage.mock.calls) + JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(KEY.toString('base64'));
    expect(logged).not.toContain(sign(raw));
  });

  it('missing headers and a stale timestamp answer 401', async () => {
    const w = world();
    const raw = body();
    expect((await deliver(w, makeReq(raw, {}))).statusCode).toBe(401);
    const old = String(NOW_S - 301);
    expect((await deliver(w, signedReq(raw, { ts: old }))).statusCode).toBe(401);
    expect(w.db.store.webhookEvents).toHaveLength(0);
  });

  it('samples the signature-failure alert to one per 10 minutes', async () => {
    const w = world();
    const raw = body();
    for (let i = 0; i < 4; i++) await deliver(w, signedReq(raw, { sig: 'AAAA' }));
    const alerts = mockCaptureMessage.mock.calls.filter((c) => String(c[0]).includes('signature'));
    expect(alerts).toHaveLength(1);
  });

  it('a signed body that is not JSON, or lacks event_type or shop_id, answers 400', async () => {
    const w = world();
    const notJson = Buffer.from('not json');
    expect((await deliver(w, signedReq(notJson))).statusCode).toBe(400);
    const noType = Buffer.from(JSON.stringify({ shop_id: 555 }));
    expect((await deliver(w, signedReq(noType, { id: 'wh_2' }))).statusCode).toBe(400);
    const noShop = Buffer.from(JSON.stringify({ event_type: 'order.paid' }));
    expect((await deliver(w, signedReq(noShop, { id: 'wh_3' }))).statusCode).toBe(400);
    expect(w.db.store.webhookEvents).toHaveLength(0);
  });
});

describe('handler: a paid order becomes one sale (acceptance 1, 2)', () => {
  it('answers 200 first, then records the sale and marks the event COMPLETED', async () => {
    const w = world();
    const raw = body();
    const res = await deliver(w, signedReq(raw));
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ received: true });
    // Claimed but not processed yet: the response did not wait for the work.
    expect(w.db.store.webhookEvents).toEqual([expect.objectContaining({ eventId: 'etsy:wh_1', status: 'PENDING' })]);
    expect(w.fetchReceipt).not.toHaveBeenCalled();
    expect(w.tasks).toHaveLength(1);

    await w.drain();
    expect(w.fetchReceipt).toHaveBeenCalledTimes(1);
    expect(w.db.store.soldEvents).toHaveLength(1);
    expect(w.db.store.soldEvents[0]).toEqual(expect.objectContaining({ transactionId: '7001', receiptId: '3001', etsyListingId: '9001', quantity: 1, source: 'WEBHOOK' }));
    expect(w.item.status).toBe('SOLD');
    expect(w.item.lastSoldVia).toBe('ETSY');
    expect(w.fanOut).toHaveBeenCalledTimes(1);
    expect(w.db.store.webhookEvents[0].status).toBe('COMPLETED');
  });

  it('the same webhook-id delivered twice is processed once (replay protection)', async () => {
    const w = world({ itemOver: { stockTotal: 5 } });
    const raw = body();
    const first = await deliver(w, signedReq(raw));
    await w.drain();
    const second = await deliver(w, signedReq(raw));
    await w.drain();
    expect(first.payload).toEqual({ received: true });
    expect(second.statusCode).toBe(200);
    expect(second.payload).toEqual({ received: true, duplicate: true });
    expect(w.fetchReceipt).toHaveBeenCalledTimes(1);
    expect(w.sellItemUnits).toHaveBeenCalledTimes(1);
    expect(w.db.store.soldEvents).toHaveLength(1);
  });

  it('a repeat that arrives while the first is still in flight is also a duplicate', async () => {
    const w = world();
    const raw = body();
    await deliver(w, signedReq(raw));
    const again = await deliver(w, signedReq(raw));
    expect(again.payload).toEqual({ received: true, duplicate: true });
    expect(w.tasks).toHaveLength(1);
  });

  it('a different webhook-id for the same transaction (Etsy resend) still records one sale', async () => {
    const w = world({ itemOver: { stockTotal: 5 } });
    const raw = body();
    await deliver(w, signedReq(raw, { id: 'wh_1' }));
    await w.drain();
    await deliver(w, signedReq(raw, { id: 'wh_2' }));
    await w.drain();
    expect(w.fetchReceipt).toHaveBeenCalledTimes(2);
    expect(w.db.store.soldEvents).toHaveLength(1);
    expect(w.sellItemUnits).toHaveBeenCalledTimes(1);
  });

  it('a FAILED event is reclaimed by the retry and processed again', async () => {
    const w = world();
    w.fetchReceipt.mockResolvedValueOnce({ ok: false, status: 500 } as any);
    const raw = body();
    await deliver(w, signedReq(raw));
    await w.drain();
    expect(w.db.store.webhookEvents[0].status).toBe('FAILED');
    expect(w.db.store.soldEvents).toHaveLength(0);

    const retry = await deliver(w, signedReq(raw));
    expect(retry.payload).toEqual({ received: true });
    await w.drain();
    expect(w.db.store.webhookEvents[0].status).toBe('COMPLETED');
    expect(w.db.store.soldEvents).toHaveLength(1);
  });

  it('a PENDING event older than 10 minutes is reclaimed, a fresh one is not', async () => {
    const w = world();
    const raw = body();
    w.db.store.webhookEvents.push({ eventId: 'etsy:wh_1', status: 'PENDING', updatedAt: new Date(NOW.getTime() - ETSY_WEBHOOK_PENDING_STALE_MS + 1000) });
    const fresh = await deliver(w, signedReq(raw));
    expect(fresh.payload).toEqual({ received: true, duplicate: true });
    expect(w.tasks).toHaveLength(0);

    w.db.store.webhookEvents[0].updatedAt = new Date(NOW.getTime() - ETSY_WEBHOOK_PENDING_STALE_MS - 1000);
    const stale = await deliver(w, signedReq(raw));
    expect(stale.payload).toEqual({ received: true });
    expect(w.tasks).toHaveLength(1);
  });

  it('two concurrent reclaims of one FAILED event let exactly one through', async () => {
    const db = makeEtsySyncFakeDb({ clock: () => NOW });
    db.store.webhookEvents.push({ eventId: 'etsy:wh_1', status: 'FAILED', updatedAt: NOW });
    const [a, b] = await Promise.all([claimEtsyWebhookEvent(db, 'etsy:wh_1', NOW), claimEtsyWebhookEvent(db, 'etsy:wh_1', NOW)]);
    expect([a.proceed, b.proceed].sort()).toEqual([false, true]);
  });

  it('a database failure while claiming answers 500 so Etsy retries', async () => {
    const w = world();
    w.db.processedWebhookEvent.create = async () => {
      throw new Error('db down');
    };
    const res = await deliver(w, signedReq(body()));
    expect(res.statusCode).toBe(500);
    expect(w.tasks).toHaveLength(0);
  });

  it('records the webhook arrival time on the shop settings', async () => {
    const w = world();
    await deliver(w, signedReq(body()));
    await w.drain();
    expect(w.conn.settings.lastWebhookAt).toEqual(NOW);
  });

  it('a multi-quantity sale draws only the units sold and does not fan out', async () => {
    const w = world({ itemOver: { stockTotal: 5 } });
    w.fetchReceipt.mockResolvedValueOnce({ ok: true, transactions: [receiptTx({ quantity: 2 })] });
    await deliver(w, signedReq(body()));
    await w.drain();
    expect(w.sellItemUnits).toHaveBeenCalledWith('item_1', 2);
    expect(w.fanOut).not.toHaveBeenCalled();
    expect(w.item.status).toBe('AVAILABLE');
  });
});

describe('processEtsyWebhookEvent (acceptance 1, 2)', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    eventType: 'order.paid',
    shopId: '555',
    resourceUrl: 'https://api.example.test/v3/application/shops/555/receipts/3001',
    ...over,
  });

  it('never fetches resource_url: the receipt call gets only ids parsed from it', async () => {
    const w = world();
    const r = await processEtsyWebhookEvent(ev({ resourceUrl: 'https://evil.example.test/steal?token=1&x=/v3/application/shops/555/receipts/3001' }), w.deps);
    expect(r.outcome).toBe('ignored-bad-resource');
    expect(w.fetchReceipt).not.toHaveBeenCalled();

    const ok = await processEtsyWebhookEvent(ev({ resourceUrl: 'https://evil.example.test/v3/application/shops/555/receipts/3001' }), w.deps);
    expect(ok.outcome).toBe('recorded');
    expect(w.fetchReceipt).toHaveBeenCalledTimes(1);
    // Only three plain fields cross: no URL, no host, nothing from the payload text.
    expect(w.fetchReceipt.mock.calls[0][0]).toEqual({ organizerId: 'org_1', shopId: '555', receiptId: '3001' });
  });

  it('the default fetch builds the API path from the numeric ids and never uses the resource_url string', async () => {
    const w = world();
    const authedRequest = jest.fn(async (_org: string, opts: any) => ({
      status: 200,
      ok: true,
      body: { receipt_id: 3001, transactions: [{ transaction_id: 7001, listing_id: 9001, quantity: 1, receipt_id: 3001, paid_timestamp: 1790000000 }] },
    }));
    const deps = { ...w.deps, fetchReceipt: undefined, authedRequest } as any;
    const r = await processEtsyWebhookEvent(ev({ resourceUrl: 'https://evil.example.test/v3/application/shops/555/receipts/3001?x=1' }), deps);
    // Host and query string are discarded: only the two ids survive, and the path is rebuilt from them.
    expect(r.outcome).toBe('recorded');
    expect(authedRequest).toHaveBeenCalledTimes(1);
    const first = authedRequest.mock.calls[0] as any;
    expect(first[1].path).toBe('/v3/application/shops/555/receipts/3001');
    expect(JSON.stringify(first)).not.toContain('evil');
    expect(JSON.stringify(first)).not.toContain('x=1');
    authedRequest.mockClear();

    const r2 = await processEtsyWebhookEvent(ev({ resourceUrl: '/v3/application/shops/555/receipts/3001' }), deps);
    expect(r2.outcome).toBe('recorded');
    expect(authedRequest).toHaveBeenCalledTimes(1);
    const [orgId, opts] = authedRequest.mock.calls[0] as any;
    expect(orgId).toBe('org_1');
    expect(opts.path).toBe('/v3/application/shops/555/receipts/3001');
    expect(JSON.stringify(opts)).not.toContain('evil');
  });

  it.each([
    ['a different shop inside the url', 'https://api.example.test/v3/application/shops/556/receipts/3001'],
    ['a path traversal', 'https://api.example.test/v3/application/shops/555/receipts/../3001'],
    ['a non numeric receipt', 'https://api.example.test/v3/application/shops/555/receipts/abc'],
    ['a leading zero receipt', 'https://api.example.test/v3/application/shops/555/receipts/0123'],
    ['an extra path segment', 'https://api.example.test/v3/application/shops/555/receipts/3001/transactions'],
    ['no url at all', null],
    ['an empty url', ''],
  ])('ignores %s', async (_name, url) => {
    const w = world();
    const r = await processEtsyWebhookEvent(ev({ resourceUrl: url as any }), w.deps);
    expect(r.outcome).toBe('ignored-bad-resource');
    expect(w.fetchReceipt).not.toHaveBeenCalled();
    expect(w.db.store.soldEvents).toHaveLength(0);
  });

  it('ignores a shop that no connected account owns', async () => {
    const w = world();
    const r = await processEtsyWebhookEvent(ev({ shopId: '999', resourceUrl: 'https://x.example.test/v3/application/shops/999/receipts/3001' }), w.deps);
    expect(r.outcome).toBe('ignored-unknown-shop');
    expect(w.fetchReceipt).not.toHaveBeenCalled();
  });

  it.each([['NEEDS_REAUTH'], ['DISCONNECTED'], ['PAUSED']])('ignores an account that is %s', async (status) => {
    const w = world();
    w.conn.account.status = status;
    const r = await processEtsyWebhookEvent(ev(), w.deps);
    expect(r.outcome).toBe('ignored-inactive-account');
    expect(w.fetchReceipt).not.toHaveBeenCalled();
    expect(w.db.store.soldEvents).toHaveLength(0);
  });

  it('order.canceled leaves only a breadcrumb: no fetch, no ledger row, no stock change', async () => {
    const w = world();
    const r = await processEtsyWebhookEvent(ev({ eventType: 'order.canceled' }), w.deps);
    expect(r.outcome).toBe('canceled-noted');
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(w.fetchReceipt).not.toHaveBeenCalled();
    expect(w.sellItemUnits).not.toHaveBeenCalled();
    expect(w.db.store.soldEvents).toHaveLength(0);
  });

  it.each([['order.shipped'], ['order.delivered'], ['something.else'], ['']])('ignores event %p', async (type) => {
    const w = world();
    const r = await processEtsyWebhookEvent(ev({ eventType: type }), w.deps);
    expect(r.outcome).toBe('ignored-event');
    expect(w.fetchReceipt).not.toHaveBeenCalled();
  });

  it('a receipt fetch failure is reported, and nothing is recorded', async () => {
    const w = world();
    w.fetchReceipt.mockResolvedValueOnce({ ok: false, status: 429 } as any);
    const r = await processEtsyWebhookEvent(ev(), w.deps);
    expect(r.outcome).toBe('receipt-fetch-failed');
    expect(w.db.store.soldEvents).toHaveLength(0);
  });

  it('a listing that FindA.Sale does not know is counted unmatched and is not an error', async () => {
    const w = world();
    w.fetchReceipt.mockResolvedValueOnce({ ok: true, transactions: [receiptTx({ listingId: '1234' })] });
    const r = await processEtsyWebhookEvent(ev(), w.deps);
    expect(r.outcome).toBe('recorded');
    expect(r.transactions).toEqual(expect.objectContaining({ recorded: 0, unmatched: 1 }));
  });

  it('a throwing dependency becomes outcome failed and never rejects', async () => {
    const w = world();
    w.fetchReceipt.mockRejectedValueOnce(new Error('boom'));
    await expect(processEtsyWebhookEvent(ev(), w.deps)).resolves.toEqual({ outcome: 'failed' });
  });

  it('writes no buyer field: the fetch result is the only thing read, and the ledger holds the allowed columns', async () => {
    const w = world();
    w.fetchReceipt.mockResolvedValueOnce({
      ok: true,
      transactions: [{ ...receiptTx(), buyerEmail: 'b@example.com', name: 'Pat Buyer', first_line: '1 Main St' } as any],
    });
    await processEtsyWebhookEvent(ev(), w.deps);
    expect(Object.keys(w.db.writes.soldEventCreates[0]).sort()).toEqual(['etsyListingId', 'itemId', 'quantity', 'receiptId', 'soldAt', 'source', 'transactionId']);
    expect(JSON.stringify(w.db.store)).not.toContain('b@example.com');
    expect(JSON.stringify(w.db.store)).not.toContain('Pat Buyer');
    expect(JSON.stringify(w.db.store)).not.toContain('1 Main St');
  });
});
