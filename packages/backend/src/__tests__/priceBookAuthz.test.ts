/**
 * /api/price-book route auth matrix (ADR-140 batch B4, acceptance AT-29): the platform switch on every route but status,
 * 401 for no account, 403 for a signed in user who is not a shop, a team member who may read and suggest but never write,
 * open to every tier, strict bodies, tenant isolation through the HTTP layer, the limiters and the error envelope.
 * The router is mounted on a test Express app with the REAL controller over the in-memory fake database; auth is stubbed
 * (x-test-user header) and the shop lookup is a map. No database, no network, no paid service.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { FAKE_NOW, createFakePriceBookDb, seedBenchmark, seedBook, seedBulkRate, seedCardItem, seedLock, seedReference, seedRule } from './__fixtures__/priceBookFakes';
import type { FakeDb } from './__fixtures__/priceBookFakes';

jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
  requireOrganizer: (req: any, res: any, next: any) => {
    const roles: string[] = req.user?.roles ?? [];
    if (!roles.includes('ORGANIZER') && !roles.includes('ADMIN')) return res.status(403).json({ message: 'Organizer access required.' });
    next();
  },
}));
jest.mock('../middleware/rateLimitShared', () => ({
  createRateLimitStore: () => new (jest.requireActual('express-rate-limit').MemoryStore)(),
}));

// Required AFTER the mocks above.
const { createPriceBookRouter } = require('../routes/priceBook');
const { createPriceBookHandlers, PRICE_BOOK_HANDLER_NAMES } = require('../controllers/priceBookController');
const { authenticate } = require('../middleware/auth');

const ORG_A = 'orgA';
const ORG_B = 'orgB';

interface TestUser {
  id: string;
  roles: string[];
  subscriptionTier?: string;
}

const ownerA: TestUser = { id: 'user_a', roles: ['ORGANIZER'] };
const ownerB: TestUser = { id: 'user_b', roles: ['ORGANIZER'] };
const staffA: TestUser = { id: 'user_staff', roles: ['USER'] };
const shopper: TestUser = { id: 'user_shopper', roles: ['USER'] };

/** What utils/posAuth.resolveOrganizerOrTeamMember answers for each account. Anyone else gets its 403. */
const ACTORS: Record<string, { id: string; actorKind: 'ORGANIZER' | 'TEAM_MEMBER' }> = {
  user_a: { id: ORG_A, actorKind: 'ORGANIZER' },
  user_b: { id: ORG_B, actorKind: 'ORGANIZER' },
  user_staff: { id: ORG_A, actorKind: 'TEAM_MEMBER' },
};

interface Reply {
  status: number;
  body: any;
}

interface Rig {
  db: FakeDb;
  env: Record<string, string | undefined>;
  handlers: any;
  router: any;
  base: string;
  server: any;
  call(user: TestUser | null, method: string, route: string, body?: unknown): Promise<Reply>;
}

const rigs: Rig[] = [];

function startRig(envOver: Record<string, string | undefined> = {}): Rig {
  const db = createFakePriceBookDb();
  const env: Record<string, string | undefined> = { CARD_PRICE_BOOK_ENABLED: 'true', ...envOver };
  const handlers = createPriceBookHandlers({
    db,
    env,
    now: () => FAKE_NOW,
    resolveActor: async (req: any, res: any) => {
      const actor = ACTORS[req.user?.id];
      if (!actor) {
        res.status(403).json({ message: 'Organizer access required' });
        return null;
      }
      return { ...actor, actingUserId: req.user.id };
    },
    run: { minCardSaleCents: 99 },
    lotDeps: () => ({ updateBulkLot: async () => ({}) }),
  });
  const router = createPriceBookRouter(handlers);
  const app = express();
  app.use(express.json());
  app.use('/api/price-book', router);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/price-book`;
  const rig: Rig = {
    db,
    env,
    handlers,
    router,
    base,
    server,
    async call(user, method, route, body) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (user) headers['x-test-user'] = JSON.stringify(user);
      const res = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { status: res.status, body: parsed };
    },
  };
  rigs.push(rig);
  return rig;
}

afterEach(() => {
  while (rigs.length > 0) {
    const rig = rigs.pop() as Rig;
    rig.server.closeAllConnections?.();
    rig.server.close();
  }
  jest.restoreAllMocks();
});

type Tier = 'status' | 'read' | 'owner';
interface RouteCase {
  method: string;
  path: string;
  tier: Tier;
  body?: unknown;
}

/** Every route of the router, with a body that passes the strict check. */
const ROUTES: RouteCase[] = [
  { method: 'GET', path: '/status', tier: 'status' },
  { method: 'GET', path: '/book', tier: 'read' },
  { method: 'POST', path: '/suggest', tier: 'read', body: { family: 'RETAIL', cards: [{ ref: 'a' }] } },
  { method: 'PUT', path: '/book', tier: 'owner', body: { enabled: true } },
  { method: 'POST', path: '/book/templates', tier: 'owner', body: { template: 'RETAIL_STARTER' } },
  { method: 'GET', path: '/rules', tier: 'owner' },
  { method: 'POST', path: '/rules', tier: 'owner', body: { family: 'RETAIL', name: 'Rule' } },
  { method: 'POST', path: '/rules/reorder', tier: 'owner', body: { family: 'RETAIL', ids: [] } },
  { method: 'PUT', path: '/rules/r1', tier: 'owner', body: { name: 'Rule' } },
  { method: 'DELETE', path: '/rules/r1', tier: 'owner' },
  { method: 'GET', path: '/references', tier: 'owner' },
  { method: 'PUT', path: '/references', tier: 'owner', body: { printingId: 'p1', finish: 'NONFOIL', price: 1 } },
  { method: 'POST', path: '/references/from-stock', tier: 'owner', body: {} },
  { method: 'POST', path: '/references/import', tier: 'owner', body: { csvText: 'name,price', dryRun: true } },
  { method: 'DELETE', path: '/references/r1', tier: 'owner' },
  { method: 'GET', path: '/benchmarks', tier: 'owner' },
  { method: 'PUT', path: '/benchmarks', tier: 'owner', body: { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', price: 1 } },
  { method: 'DELETE', path: '/benchmarks/b1', tier: 'owner' },
  { method: 'GET', path: '/bulk-rates', tier: 'owner' },
  { method: 'PUT', path: '/bulk-rates', tier: 'owner', body: { game: 'MTG', rates: [] } },
  { method: 'POST', path: '/bulk-rates/adjust', tier: 'owner', body: { game: 'MTG', direction: 'SELL', percent: 5 } },
  { method: 'POST', path: '/buylist/quote', tier: 'owner', body: { cards: [{ ref: 'a' }] } },
  { method: 'POST', path: '/buylist/bulk-quote', tier: 'owner', body: { game: 'MTG', lines: [{ tier: 'COMMON', cards: 10 }] } },
  { method: 'GET', path: '/locks', tier: 'owner' },
  { method: 'PUT', path: '/locks/i1', tier: 'owner', body: { locked: false } },
  { method: 'POST', path: '/runs/preview', tier: 'owner', body: { kind: 'BULK' } },
  { method: 'GET', path: '/runs', tier: 'owner' },
  { method: 'GET', path: '/runs/r1', tier: 'owner' },
  { method: 'GET', path: '/runs/r1/items', tier: 'owner' },
  { method: 'PATCH', path: '/runs/r1/items', tier: 'owner', body: { selectAllChanges: true } },
  { method: 'POST', path: '/runs/r1/apply', tier: 'owner', body: { ifBookVersion: 1, expectedCount: 0 } },
  { method: 'POST', path: '/runs/r1/undo', tier: 'owner', body: {} },
  { method: 'POST', path: '/runs/r1/cancel', tier: 'owner', body: {} },
];

const NOT_STATUS = ROUTES.filter((r) => r.tier !== 'status');
const OWNER_ONLY = ROUTES.filter((r) => r.tier === 'owner');
const label = (r: RouteCase): string => `${r.method} ${r.path}`;

/** [method, express path pattern] of every route the router declares. */
function declaredRoutes(router: any): Array<{ method: string; pattern: string; handlers: any[] }> {
  const out: Array<{ method: string; pattern: string; handlers: any[] }> = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({ method: method.toUpperCase(), pattern: layer.route.path, handlers: layer.route.stack.map((s: any) => s.handle) });
    }
  }
  return out;
}

const toPattern = (p: string): string => p.replace(/\/(r1|i1|b1)(?=\/|$)/g, '/:param');
const normalizePattern = (p: string): string => p.replace(/\/:[A-Za-z]+/g, '/:param');

function seedShop(db: FakeDb, orgId: string, bookOver: Record<string, unknown> = {}): string {
  return seedBook(db, orgId, { enabled: true, ...bookOver }).id as string;
}

describe('AT-29 the router matches the table of routes', () => {
  it('declares exactly the routes of ADR-140 section 10, no more and no fewer', () => {
    const rig = startRig();
    const declared = declaredRoutes(rig.router).map((d) => `${d.method} ${normalizePattern(d.pattern)}`).sort();
    const expected = ROUTES.map((r) => `${r.method} ${normalizePattern(toPattern(r.path))}`).sort();
    expect(declared).toEqual(expected);
    expect(declared.length).toBe(33);
  });

  it('the platform switch is the first middleware of every route but GET /status, and status has no switch at all', () => {
    const rig = startRig();
    for (const d of declaredRoutes(rig.router)) {
      if (d.method === 'GET' && d.pattern === '/status') {
        expect(d.handlers).not.toContain(rig.handlers.flagGate);
      } else {
        expect(d.handlers[0]).toBe(rig.handlers.flagGate);
      }
    }
  });

  it('every route has a limiter between its role check and its handler (at least four layers, the handler last)', () => {
    const rig = startRig();
    for (const d of declaredRoutes(rig.router)) {
      expect(d.handlers.length).toBeGreaterThanOrEqual(3);
      expect(typeof d.handlers[d.handlers.length - 1]).toBe('function');
    }
    const text = fs.readFileSync(path.join(__dirname, '..', 'routes', 'priceBook.ts'), 'utf8');
    expect((text.match(/limiter\('/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/rateLimit\(/);
  });

  it('the handlers object has exactly the names the lazy export lists', () => {
    const rig = startRig();
    expect(Object.keys(rig.handlers).sort()).toEqual([...PRICE_BOOK_HANDLER_NAMES].sort());
  });
});

describe('AT-29 the platform switch', () => {
  it.each(NOT_STATUS.map((r) => [label(r), r] as const))('%s answers 404 PRICE_BOOK_DISABLED with the switch off, signed in or not, and touches no data', async (_name, r) => {
    const rig = startRig({ CARD_PRICE_BOOK_ENABLED: undefined });
    for (const user of [null, ownerA, staffA, shopper]) {
      const res = await rig.call(user, r.method, r.path, r.body);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, code: 'PRICE_BOOK_DISABLED' });
      expect(typeof res.body.error).toBe('string');
    }
    expect(rig.db.reads.length).toBe(0);
    expect(rig.db.writes.length).toBe(0);
  });

  it.each(['false', '0', 'off', ''])('the value %p of the switch counts as off', async (value) => {
    const rig = startRig({ CARD_PRICE_BOOK_ENABLED: value });
    expect((await rig.call(ownerA, 'GET', '/book')).body.code).toBe('PRICE_BOOK_DISABLED');
  });

  it('GET /status still answers with the switch off: enabled false, no book facts, no database access', async () => {
    const rig = startRig({ CARD_PRICE_BOOK_ENABLED: undefined });
    seedShop(rig.db, ORG_A);
    rig.db.reads.length = 0;
    const res = await rig.call(ownerA, 'GET', '/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ enabled: false, bookExists: false, bookEnabled: false });
    expect(res.body.data.limits.undoDays).toBe(7);
    expect(rig.db.reads.length).toBe(0);
  });

  it('the switch is read on every request, never copied at start up', async () => {
    const rig = startRig();
    expect((await rig.call(ownerA, 'GET', '/book')).status).toBe(200);
    rig.env.CARD_PRICE_BOOK_ENABLED = 'false';
    expect((await rig.call(ownerA, 'GET', '/book')).status).toBe(404);
    rig.env.CARD_PRICE_BOOK_ENABLED = 'true';
    expect((await rig.call(ownerA, 'GET', '/book')).status).toBe(200);
  });

  it('a handler answers 404 on its own when a router forgot the gate', async () => {
    const rig = startRig({ CARD_PRICE_BOOK_ENABLED: undefined });
    const app = express();
    app.use(express.json());
    app.get('/book', authenticate, rig.handlers.getBook);
    const server = app.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/book`, { headers: { 'x-test-user': JSON.stringify(ownerA) } });
      expect(res.status).toBe(404);
      expect(((await res.json()) as any).code).toBe('PRICE_BOOK_DISABLED');
    } finally {
      (server as any).closeAllConnections?.();
      server.close();
    }
  });
});

describe('AT-29 who may call what', () => {
  it.each(ROUTES.map((r) => [label(r), r] as const))('%s answers 401 to a request with no account', async (_name, r) => {
    const rig = startRig();
    const res = await rig.call(null, r.method, r.path, r.body);
    expect(res.status).toBe(401);
    expect(rig.db.writes.length).toBe(0);
  });

  it.each(NOT_STATUS.map((r) => [label(r), r] as const))('%s answers 403 to a signed in user who is not a shop', async (_name, r) => {
    const rig = startRig();
    const res = await rig.call(shopper, r.method, r.path, r.body);
    expect(res.status).toBe(403);
    expect(rig.db.writes.length).toBe(0);
  });

  it('GET /status is open to any signed in user and carries platform facts only for someone who is not a shop', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const asShopper = await rig.call(shopper, 'GET', '/status');
    expect(asShopper.status).toBe(200);
    expect(asShopper.body.data).toMatchObject({ enabled: true, bookExists: false, bookEnabled: false });
    const asOwner = await rig.call(ownerA, 'GET', '/status');
    expect(asOwner.body.data).toMatchObject({ enabled: true, bookExists: true, bookEnabled: true });
    const asStaff = await rig.call(staffA, 'GET', '/status');
    expect(asStaff.body.data).toMatchObject({ enabled: true, bookExists: true, bookEnabled: true });
    const other = await rig.call(ownerB, 'GET', '/status');
    expect(other.body.data).toMatchObject({ bookExists: false, bookEnabled: false });
  });

  it.each(OWNER_ONLY.map((r) => [label(r), r] as const))('%s is refused to a team member of the shop (403) and writes nothing', async (_name, r) => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const res = await rig.call(staffA, r.method, r.path, r.body);
    expect(res.status).toBe(403);
    expect(rig.db.writes.length).toBe(0);
  });

  it('a team member may read the book and ask for suggestions, for the owner shop', async () => {
    const rig = startRig();
    const bookId = seedShop(rig.db, ORG_A);
    seedRule(rig.db, bookId, { roundingMode: 'NONE' });
    const book = await rig.call(staffA, 'GET', '/book');
    expect(book.status).toBe(200);
    expect(book.body.data.book.id).toBe(bookId);
    const card = { ref: 'x', game: 'MTG', finish: 'NONFOIL', typed: { setCode: 'abc', collectorNumber: '1', cardName: 'Test Card' } };
    const sug = await rig.call(staffA, 'POST', '/suggest', { family: 'RETAIL', cards: [card] });
    expect(sug.status).toBe(200);
    expect(sug.body.data.results).toHaveLength(1);
    expect(sug.body.data.results[0].ref).toBe('x');
  });

  it('a team member of shop A never sees shop B (the shop comes from the account)', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A, { retailPercentBps: 11111 });
    seedShop(rig.db, ORG_B, { retailPercentBps: 22222 });
    expect((await rig.call(staffA, 'GET', '/book')).body.data.book.retailPercentBps).toBe(11111);
    expect((await rig.call(ownerB, 'GET', '/book')).body.data.book.retailPercentBps).toBe(22222);
  });

  it('write handlers refuse a team member on their own, even when a router lets the request through', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const app = express();
    app.use(express.json());
    const ownerNames = ['putBook', 'applyTemplate', 'listRules', 'createRule', 'updateRule', 'deleteRule', 'reorderRules', 'listReferences', 'putReference', 'deleteReference', 'referencesFromStock', 'importReferences', 'listBenchmarks', 'putBenchmark', 'deleteBenchmark', 'getBulkRates', 'putBulkRates', 'adjustBulkRates', 'buylistQuote', 'buylistBulkQuote', 'putLock', 'listLocks', 'previewRun', 'listRuns', 'getRun', 'listRunItems', 'patchRunItems', 'applyRun', 'undoRun', 'cancelRun'];
    for (const name of ownerNames) app.post(`/${name}`, authenticate, rig.handlers[name]);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      for (const name of ownerNames) {
        const res = await fetch(`http://127.0.0.1:${port}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(staffA) }, body: '{}' });
        const body = (await res.json()) as any;
        expect({ name, status: res.status, code: body.code }).toEqual({ name, status: 403, code: 'FORBIDDEN' });
      }
      expect(rig.db.writes.length).toBe(0);
    } finally {
      (server as any).closeAllConnections?.();
      server.close();
    }
  });
});

describe('AT-29 open to every tier (deliberately no requireTier)', () => {
  it.each([[undefined], ['SIMPLE'], ['PRO'], ['TEAMS']])('an organizer on tier %s can write the book and run a preview', async (tier) => {
    const rig = startRig();
    const user: TestUser = { ...ownerA, ...(tier ? { subscriptionTier: tier } : {}) };
    const put = await rig.call(user, 'PUT', '/book', { enabled: true });
    expect([200, 201]).toContain(put.status);
    expect(put.body.success).toBe(true);
    const preview = await rig.call(user, 'POST', '/runs/preview', { kind: 'BULK' });
    expect(preview.status).toBe(200);
  });

  it('neither the route file nor the controller imports or uses requireTier', () => {
    for (const file of [path.join('routes', 'priceBook.ts'), path.join('controllers', 'priceBookController.ts')]) {
      const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      const code = text
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
        .join('\n');
      expect(code).not.toMatch(/requireTier|checkTierLapse|subscriptionTier/);
    }
  });
});

describe('AT-29 strict bodies', () => {
  const extras: Array<[string, unknown]> = [
    ['bookId', 'book_9'],
    ['organizerId', ORG_B],
    ['version', 99],
    ['state', 'APPLIED'],
    ['selected', true],
  ];
  const WITH_BODY = OWNER_ONLY.filter((r) => r.body !== undefined && !(r.method === 'DELETE'));
  const READ_BODY = ROUTES.filter((r) => r.tier === 'read' && r.body !== undefined);

  it.each([...READ_BODY, ...WITH_BODY].map((r) => [label(r), r] as const))('%s refuses unknown keys with 400 VALIDATION', async (_name, r) => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    for (const [key, value] of extras) {
      const res = await rig.call(ownerA, r.method, r.path, { ...(r.body as object), [key]: value });
      expect({ key, status: res.status, code: res.body?.code }).toEqual({ key, status: 400, code: 'VALIDATION' });
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.issues)).toBe(true);
    }
    expect(rig.db.writes.length).toBe(0);
  });

  it('run items cannot be edited through the selection call: selected, state and skipReason are refused', async () => {
    const rig = startRig();
    const bookId = seedShop(rig.db, ORG_A);
    const run = rig.db.insert('priceBookRun', { bookId, kind: 'BULK', bookVersion: 1, expiresAt: new Date(FAKE_NOW.getTime() + 60000) });
    for (const body of [{ selected: true }, { state: 'APPLIED' }, { skipReason: 'NONE' }, { selectIds: ['a'], bookVersion: 5 }]) {
      const res = await rig.call(ownerA, 'PATCH', `/runs/${run.id}/items`, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
  });

  it('refuses unknown keys inside nested objects too (a typed card, a scope, a rate row, a suggest card)', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const cases: Array<[string, string, unknown]> = [
      ['PUT', '/references', { game: 'MTG', typed: { cardName: 'x', bookId: 'b' }, finish: 'NONFOIL', price: 1 }],
      ['POST', '/runs/preview', { kind: 'BULK', scope: { saleId: 's', organizerId: ORG_B } }],
      ['PUT', '/bulk-rates', { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', price: 1, bookId: 'b' }] }],
      ['POST', '/suggest', { family: 'RETAIL', cards: [{ ref: 'a', costCents: 1 }] }],
      ['POST', '/suggest', { family: 'RETAIL', cards: [{ ref: 'a', typed: { cardName: 'x', foo: 1 } }] }],
      ['POST', '/buylist/bulk-quote', { game: 'MTG', lines: [{ tier: 'COMMON', cards: 5, extra: 1 }] }],
    ];
    for (const [method, route, body] of cases) {
      const res = await rig.call(ownerA, method, route, body);
      expect({ route, status: res.status, code: res.body?.code }).toEqual({ route, status: 400, code: 'VALIDATION' });
    }
  });

  it('refuses a body that is not an object', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const res = await rig.call(ownerA, 'PUT', '/book', [1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('the server owns bookId, organizerId and createdByUserId: a body can neither set nor override them', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    const res = await rig.call(ownerA, 'PUT', '/references', { game: 'MTG', typed: { cardName: 'Card', setCode: 's', collectorNumber: '1' }, finish: 'NONFOIL', language: 'en', price: 2 });
    expect(res.status).toBe(201);
    const row = rig.db.tables.priceBookReference[0] as any;
    const bookA = (rig.db.tables.priceBook[0] as any).id;
    expect(row.bookId).toBe(bookA);
    expect(row.enteredByUserId).toBe(ownerA.id);
  });
});

describe('AT-29 tenant isolation through the HTTP layer', () => {
  function twoShops() {
    const rig = startRig();
    const bookA = seedShop(rig.db, ORG_A);
    const bookB = seedShop(rig.db, ORG_B);
    const rule = seedRule(rig.db, bookA, { name: 'A rule' });
    const reference = seedReference(rig.db, bookA);
    const benchmark = seedBenchmark(rig.db, bookA);
    seedBulkRate(rig.db, bookA);
    const { item } = seedCardItem(rig.db, ORG_A, { price: 5 });
    seedLock(rig.db, bookA, item.id as string);
    const run = rig.db.insert('priceBookRun', { bookId: bookA, kind: 'BULK', bookVersion: 1, expiresAt: new Date(FAKE_NOW.getTime() + 600000), previewCount: 1, changeCount: 1 });
    const runItem = rig.db.insert('priceBookRunItem', { runId: run.id, itemId: item.id, itemTitle: 'Card', oldPriceCents: 500, newPriceCents: 600, bookVersion: 1 });
    return { rig, bookA, bookB, rule, reference, benchmark, item, run, runItem };
  }

  it('shop B sees none of shop A rows in any list', async () => {
    const { rig } = twoShops();
    for (const [route, key] of [['/rules', 'rules'], ['/references', 'references'], ['/benchmarks', 'benchmarks'], ['/locks', 'locks'], ['/runs', 'runs']] as const) {
      const res = await rig.call(ownerB, 'GET', route);
      expect({ route, status: res.status, rows: res.body.data[key] }).toEqual({ route, status: 200, rows: [] });
    }
    const rates = await rig.call(ownerB, 'GET', '/bulk-rates');
    expect(rates.body.data.rates).toEqual([]);
    expect(rates.body.data.lots).toEqual([]);
    const book = await rig.call(ownerB, 'GET', '/book');
    expect(book.body.data.book.counts).toEqual({ rules: 0, references: 0, benchmarks: 0, bulkRates: 0, locks: 0 });
  });

  it('shop B gets the same 404 for a foreign id as for a missing one, on every route with an id, and nothing changes', async () => {
    const { rig, rule, reference, benchmark, item, run } = twoShops();
    const before = JSON.stringify(rig.db.tables);
    const foreign: Array<[string, string, unknown]> = [
      ['PUT', `/rules/${rule.id}`, { name: 'Hijack' }],
      ['DELETE', `/rules/${rule.id}`, undefined],
      ['DELETE', `/references/${reference.id}`, undefined],
      ['DELETE', `/benchmarks/${benchmark.id}`, undefined],
      ['PUT', `/locks/${item.id}`, { locked: true }],
      ['PUT', `/locks/${item.id}`, { locked: false }],
      ['GET', `/runs/${run.id}`, undefined],
      ['GET', `/runs/${run.id}/items`, undefined],
      ['PATCH', `/runs/${run.id}/items`, { selectAllChanges: true }],
      ['POST', `/runs/${run.id}/apply`, { ifBookVersion: 1, expectedCount: 1 }],
      ['POST', `/runs/${run.id}/undo`, {}],
      ['POST', `/runs/${run.id}/cancel`, {}],
    ];
    const missing: Array<[string, string, unknown]> = foreign.map(([m, p, b]) => [m, p.replace(/\/[^/]+(\/items|\/apply|\/undo|\/cancel)?$/, (_x, tail) => `/nothing_here${tail ?? ''}`), b]);
    for (let i = 0; i < foreign.length; i += 1) {
      const [method, route, body] = foreign[i] as [string, string, unknown];
      const [, missingRoute] = missing[i] as [string, string, unknown];
      const a = await rig.call(ownerB, method, route, body);
      const b = await rig.call(ownerB, method, missingRoute, body);
      expect({ route, status: a.status, code: a.body.code }).toEqual({ route, status: 404, code: 'NOT_FOUND' });
      expect(b.status).toBe(404);
      expect(a.body.error).toBe(b.body.error);
    }
    expect(JSON.stringify(rig.db.tables)).toBe(before);
  });

  it('shop B cannot price against a card of shop A (a foreign item id in a suggestion is a 404)', async () => {
    const { rig, item } = twoShops();
    const res = await rig.call(ownerB, 'POST', '/suggest', { family: 'RETAIL', cards: [{ ref: 'x', itemId: item.id }] });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('shop B cannot pin shop A cards or learn that they exist', async () => {
    const { rig, item } = twoShops();
    const pin = await rig.call(ownerB, 'PUT', `/locks/${item.id}`, { locked: true });
    const ghost = await rig.call(ownerB, 'PUT', '/locks/no_such_item', { locked: true });
    expect(pin.status).toBe(404);
    expect(pin.body).toEqual(ghost.body);
  });

  it('the preview of shop B lists only its own cards', async () => {
    const { rig } = twoShops();
    const own = seedCardItem(rig.db, ORG_B, { price: 3, title: 'Mine' });
    const preview = await rig.call(ownerB, 'POST', '/runs/preview', { kind: 'BULK' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.run.counts.eligible).toBe(1);
    const rows = rig.db.select('priceBookRunItem', { runId: preview.body.data.run.id });
    expect(rows.map((r) => r.itemId)).toEqual([own.item.id]);
  });
});

describe('AT-29 limits and the error envelope', () => {
  it('previews are limited to 6 a minute per account; another account is not affected', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    seedShop(rig.db, ORG_B);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await rig.call(ownerA, 'POST', '/runs/preview', { kind: 'BULK' })).status);
    expect(statuses.slice(0, 6).every((s) => s !== 429)).toBe(true);
    expect(statuses[6]).toBe(429);
    const limited = await rig.call(ownerA, 'POST', '/runs/preview', { kind: 'BULK' });
    expect(limited.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect((await rig.call(ownerB, 'POST', '/runs/preview', { kind: 'BULK' })).status).toBe(200);
  });

  it('apply and undo share a limit of 12 a minute per account', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    let last = 0;
    for (let i = 0; i < 12; i += 1) last = (await rig.call(ownerA, 'POST', '/runs/nope/apply', { ifBookVersion: 1, expectedCount: 0 })).status;
    expect(last).toBe(404);
    expect((await rig.call(ownerA, 'POST', '/runs/nope/apply', { ifBookVersion: 1, expectedCount: 0 })).status).toBe(429);
    expect((await rig.call(ownerA, 'POST', '/runs/nope/undo', {})).status).toBe(429);
  });

  it('writes are limited to 30 a minute per account', async () => {
    const rig = startRig();
    seedShop(rig.db, ORG_A);
    for (let i = 0; i < 30; i += 1) expect((await rig.call(ownerA, 'PUT', '/locks/none', { locked: false })).status).toBe(404);
    const over = await rig.call(ownerA, 'PUT', '/locks/none', { locked: false });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('RATE_LIMITED');
    // The read budget is separate.
    expect((await rig.call(ownerA, 'GET', '/book')).status).toBe(200);
  });

  it('reads are limited to 120 a minute per account', async () => {
    const rig = startRig();
    let limited = 0;
    for (let i = 0; i < 121; i += 1) {
      const res = await rig.call(ownerA, 'GET', '/status');
      if (res.status === 429) limited += 1;
    }
    expect(limited).toBe(1);
  });

  it('answers a failure it cannot name with a generic 500 and never leaks the cause', async () => {
    const rig = startRig();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    rig.db.failWhen((table, op) => (table === 'priceBook' && op === 'create' ? new Error('secret connection string db.internal:5432') : null));
    const res = await rig.call(ownerA, 'PUT', '/book', { enabled: true });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Something went wrong. Try again in a moment.', code: 'SERVER_ERROR' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|5432/);
  });

  it('every error is { success: false, error, code } with a plain sentence', async () => {
    const rig = startRig();
    const bookId = seedShop(rig.db, ORG_A);
    const samples = [
      await rig.call(ownerA, 'PUT', '/book', { retailPercentBps: 0 }),
      await rig.call(ownerA, 'PUT', '/book', { ifVersion: 99, enabled: false }),
      await rig.call(ownerA, 'GET', '/runs/none'),
      await rig.call(ownerA, 'POST', '/rules', { family: 'RETAIL' }),
    ];
    expect(bookId).toBeTruthy();
    expect(samples.map((s) => s.status)).toEqual([400, 409, 404, 400]);
    for (const s of samples) {
      expect(s.body.success).toBe(false);
      expect(typeof s.body.error).toBe('string');
      expect(s.body.error.length).toBeGreaterThan(5);
      expect(typeof s.body.code).toBe('string');
    }
    expect(samples[1]?.body.code).toBe('VERSION_CONFLICT');
  });

  it('a route pattern that matches nothing is not answered by this router', async () => {
    const rig = startRig();
    const res = await rig.call(ownerA, 'GET', '/nothing');
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });
});
