/**
 * Wave 4 wiring (ADR-134 B9 + ADR-135 B6): index.ts mounts, body-parser order, route-level timeouts and cron
 * registrations, plus a small express app that mounts the REAL routers in the same order index.ts does and
 * checks them over HTTP with the connector and the catalog switched off.
 *
 * Part 1 reads index.ts as text (the app cannot be imported in a unit test: it boots Socket.io, crons and the
 * database). Part 2 is the supertest-style check; it uses Node's own http client because supertest is not a
 * dependency. Auth is stubbed with a pass-through so the routers can be reached; the kill-switch behavior under
 * test is the routers' own.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const indexSrc = read('index.ts');

/** Position of the first line that is code (not a // comment) and contains `needle`; -1 if none. */
function codeAt(src: string, needle: string): number {
  let offset = 0;
  for (const line of src.split('\n')) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('//') && line.includes(needle)) return offset + line.indexOf(needle);
    offset += line.length + 1;
  }
  return -1;
}
const count = (src: string, needle: string): number =>
  src.split('\n').filter((l) => !l.trimStart().startsWith('//') && l.includes(needle)).length;

describe('index.ts body parsers and mounts (source order)', () => {
  const rawEtsy = "app.use('/api/etsy/webhook', express.raw({ type: '*/*' }));";
  const jsonParser = 'app.use(express.json(';
  const mountWebhook = "app.use('/api/etsy/webhook', etsyWebhookRoutes);";
  const mountEtsy = "app.use('/api/etsy', etsyRoutes);";
  const mountEtsyListings = "app.use('/api/etsy', etsyListingRoutes);";

  it('registers express.raw for /api/etsy/webhook exactly once, BEFORE the JSON parser and next to the eBay raw lines', () => {
    expect(count(indexSrc, rawEtsy)).toBe(1);
    expect(codeAt(indexSrc, rawEtsy)).toBeGreaterThan(0);
    expect(codeAt(indexSrc, rawEtsy)).toBeLessThan(codeAt(indexSrc, jsonParser));
    expect(codeAt(indexSrc, rawEtsy)).toBeGreaterThan(codeAt(indexSrc, "app.use('/api/ebay/notifications', express.raw"));
    expect(codeAt(indexSrc, rawEtsy)).toBeLessThan(codeAt(indexSrc, "app.use('/api/outreach/resend-webhook'"));
  });

  it('mounts the Etsy webhook router first, then the connect router, then the listings router, all after the JSON parser', () => {
    for (const m of [mountWebhook, mountEtsy, mountEtsyListings]) expect(count(indexSrc, m)).toBe(1);
    const w = codeAt(indexSrc, mountWebhook);
    const e = codeAt(indexSrc, mountEtsy);
    const l = codeAt(indexSrc, mountEtsyListings);
    expect(w).toBeGreaterThan(codeAt(indexSrc, jsonParser));
    expect(w).toBeLessThan(e);
    expect(e).toBeLessThan(l);
  });

  it('mounts the three card routers once each, after the JSON parser and before the JSON 404 catch-all', () => {
    const notFound = codeAt(indexSrc, "res.status(404).json({ message: 'Not found' })");
    expect(notFound).toBeGreaterThan(0);
    for (const m of [
      "app.use('/api/cards', cardCatalogRoutes);",
      "app.use('/api/item-cards', itemCardRoutes);",
      "app.use('/api/card-intake', cardIntakeRoutes);",
      mountWebhook,
      mountEtsy,
      mountEtsyListings,
    ]) {
      expect(count(indexSrc, m)).toBe(1);
      expect(codeAt(indexSrc, m)).toBeGreaterThan(codeAt(indexSrc, jsonParser));
      expect(codeAt(indexSrc, m)).toBeLessThan(notFound);
    }
  });

  it('imports each router as a default export that exists, and no router applies its kill switch with router.use', () => {
    const imports: Array<[string, string]> = [
      ['cardCatalogRoutes', 'routes/cardCatalog'],
      ['itemCardRoutes', 'routes/itemCard'],
      ['cardIntakeRoutes', 'routes/cardIntake'],
      ['etsyRoutes', 'routes/etsy'],
      ['etsyListingRoutes', 'routes/etsyListings'],
      ['etsyWebhookRoutes', 'routes/etsyWebhook'],
    ];
    for (const [name, file] of imports) {
      expect(indexSrc).toContain(`import ${name} from './${file}';`);
      expect(read(`${file}.ts`)).toMatch(/export default router;/);
    }
    for (const file of ['routes/etsy', 'routes/etsyListings', 'routes/etsyWebhook']) {
      expect(read(`${file}.ts`).split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')).not.toMatch(/router\.use\(/);
    }
  });

  it('gives the card-intake preview and confirm routes a route-level timeout, after the global 30 s guard and before the mount', () => {
    const preview = "app.post('/api/card-intake/:saleId/preview', requestTimeout(180000));";
    const confirm = "app.post('/api/card-intake/:saleId/confirm', requestTimeout(180000));";
    expect(count(indexSrc, preview)).toBe(1);
    expect(count(indexSrc, confirm)).toBe(1);
    const global = codeAt(indexSrc, 'app.use(requestTimeout(30000));');
    const mount = codeAt(indexSrc, "app.use('/api/card-intake', cardIntakeRoutes);");
    expect(codeAt(indexSrc, preview)).toBeGreaterThan(global);
    expect(codeAt(indexSrc, confirm)).toBeGreaterThan(global);
    expect(codeAt(indexSrc, preview)).toBeLessThan(mount);
    expect(codeAt(indexSrc, confirm)).toBeLessThan(mount);
    // the middleware skip list carries the same pattern (see middleware/__tests__/requestTimeout.test.ts)
    expect(read('middleware/requestTimeout.ts')).toContain('/^\\/api\\/card-intake\\/[^/]+\\/(preview|confirm)$/.test(req.path)');
  });

  it('keeps the Etsy webhook path in the CSRF exact-path allowlist', () => {
    expect(read('middleware/csrf.ts')).toContain("'/api/etsy/webhook'");
  });

  it('starts the Etsy and card crons once each, beside the other sold-sync crons, and hands the taxonomy refresh to housekeeping', () => {
    for (const call of [
      'startEtsySoldSyncCron();',
      'scheduleCardCatalogScryfallRefresh();',
      'scheduleCardCatalogTcgcsvRefresh();',
      'startEtsyHousekeepingCron({ refreshTaxonomy: () => refreshEtsyTaxonomyCache() });',
    ]) {
      expect(count(indexSrc, call)).toBe(1);
      expect(codeAt(indexSrc, call)).toBeGreaterThan(codeAt(indexSrc, 'startReverbSoldSyncCron();'));
    }
    expect(indexSrc).toContain("import { startEtsySoldSyncCron } from './jobs/etsySoldSyncCron';");
    expect(indexSrc).toContain("import { startEtsyHousekeepingCron } from './jobs/etsyHousekeepingCron';");
    expect(indexSrc).toContain("import { scheduleCardCatalogScryfallRefresh, scheduleCardCatalogTcgcsvRefresh } from './jobs/cardCatalogRefreshCron';");
    expect(indexSrc).toContain("import { refreshEtsyTaxonomyCache } from './services/marketplace/etsyTaxonomy';");
    expect(read('jobs/etsyHousekeepingCron.ts')).toMatch(/export function startEtsyHousekeepingCron\(/);
    expect(read('services/marketplace/etsyTaxonomy.ts')).toMatch(/export async function refreshEtsyTaxonomyCache\(/);
  });

  it('logs one boot line naming the new mounts', () => {
    const line = indexSrc.split('\n').find((l) => l.includes('[boot] Card + Etsy mounts:')) ?? '';
    for (const mount of ['/api/cards', '/api/item-cards', '/api/card-intake', '/api/etsy/webhook', '/api/etsy']) {
      expect(line).toContain(mount);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Part 2: the real routers, mounted the way index.ts mounts them, over HTTP.
// ---------------------------------------------------------------------------------------------

jest.mock('../index', () => ({ prisma: {} }));
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'u1', roles: ['ORGANIZER'], role: 'ORGANIZER', organizer: { id: 'org1' } }; next(); },
  requireOrganizer: (_req: any, _res: any, next: any) => next(),
  optionalAuthenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/rateLimiter', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return new Proxy({}, { get: () => pass });
});

describe('real routers mounted in index.ts order (connector and catalog off)', () => {
  let server: http.Server;
  let base = '';
  const seenBodyTypes: string[] = [];
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    delete process.env.ETSY_CONNECTOR_ENABLED;
    delete process.env.CARD_CATALOG_ENABLED;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('express');
    const cardCatalogRoutes = require('../routes/cardCatalog').default;
    const etsyRoutes = require('../routes/etsy').default;
    const etsyListingRoutes = require('../routes/etsyListings').default;
    const etsyWebhookRoutes = require('../routes/etsyWebhook').default;

    const app = express();
    app.use('/api/etsy/webhook', express.raw({ type: '*/*' }));
    // probe: records what the body parser handed to later middleware for the webhook path
    app.use('/api/etsy/webhook', (req: any, _res: any, next: any) => { seenBodyTypes.push(Buffer.isBuffer(req.body) ? 'buffer' : typeof req.body); next(); });
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/cards', cardCatalogRoutes);
    app.use('/api/etsy/webhook', etsyWebhookRoutes);
    app.use('/api/etsy', etsyRoutes);
    app.use('/api/etsy', etsyListingRoutes);
    app.use((_req: any, res: any) => res.status(404).json({ message: 'Not found' }));

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env = savedEnv;
  });

  const call = async (method: string, p: string, body?: string, headers: Record<string, string> = {}) => {
    const res = await fetch(base + p, { method, body, headers });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  };

  it('GET /api/cards/status answers 200 with catalogReady:false while the catalog is off', async () => {
    const r = await call('GET', '/api/cards/status');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, catalogReady: false });
  });

  it('POST /api/etsy/webhook is public, receives the body as a raw Buffer, and answers 200 with the connector off', async () => {
    seenBodyTypes.length = 0;
    const r = await call('POST', '/api/etsy/webhook', JSON.stringify({ event_type: 'order.paid', shop_id: 1 }), { 'content-type': 'application/json' });
    expect(r.status).toBe(200);
    expect(seenBodyTypes).toEqual(['buffer']);
  });

  it('the connect and listings routers answer 503 ETSY_DISABLED (their own per-route kill switch) and are not shadowed by the webhook mount', async () => {
    for (const [method, p] of [
      ['GET', '/api/etsy/connection'],
      ['GET', '/api/etsy/connect'],
      ['GET', '/api/etsy/shop-setup'],
      ['GET', '/api/etsy/items/abc/eligibility'],
      ['GET', '/api/etsy/taxonomy/suggest?itemId=abc'],
      ['POST', '/api/etsy/items/abc/draft'],
    ] as Array<[string, string]>) {
      const r = await call(method, p, method === 'POST' ? '{}' : undefined, method === 'POST' ? { 'content-type': 'application/json' } : {});
      expect({ p, status: r.status, code: r.json?.code }).toEqual({ p, status: 503, code: 'ETSY_DISABLED' });
    }
  });

  it('an unknown /api/etsy path falls through to the JSON 404 (nothing swallows it)', async () => {
    const r = await call('GET', '/api/etsy/does-not-exist');
    expect(r.status).toBe(404);
  });
});
