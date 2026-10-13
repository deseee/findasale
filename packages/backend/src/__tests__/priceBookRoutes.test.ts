/**
 * /api/price-book end to end (ADR-140 batch B4). The router is mounted on a test Express app with the REAL controller over the
 * in-memory fake database, and every call goes over HTTP. Covers the book, rules, references (typed, from stock, import),
 * benchmarks, the bulk rate card, suggestions and quotes, locks, runs (preview, selection, apply, undo, cancel, lot runs) and
 * status, plus the pieces the controller owns: the price change hook, the catalog printing resolver and the production wiring.
 * Auth is stubbed (x-test-user header). No database, no network, no paid service.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { FAKE_NOW, createFakePriceBookDb, seedCardItem, seedItem, seedPrinting, seedReference } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';

const mockPrisma: Record<string, any> = {
  item: { findUnique: jest.fn() },
  cardIntakeBatch: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};
const mockPos = { resolveOrganizerOrTeamMember: jest.fn() };
const mockBulk = { updateBulkLot: jest.fn() };
const mockLookup = { loadCatalogState: jest.fn(), resolveRefs: jest.fn(), isCatalogGame: jest.fn() };
const mockCatalogStore = { getCatalogDb: jest.fn() };
const mockEbay = { pushItemToEbay: jest.fn() };
const mockAlerts = { notifyPriceDropAlerts: jest.fn() };
const mockShopify = { updateShopifyProductFields: jest.fn() };
const mockCommand = { invalidateCommandCenterCache: jest.fn() };
const mockFeed = { pushEvent: jest.fn() };
const mockSocket = { getIO: jest.fn() };
const mockCategories = { isPinnedCardCategoryId: jest.fn(), standardEnvelopePriceCrossing: jest.fn() };

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
// The production wiring loads these on first use. They are replaced here so the wiring can be checked without a database.
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }), { virtual: true });
jest.mock('../utils/posAuth', () => mockPos, { virtual: true });
jest.mock('../services/bulkLot/bulkLotService', () => mockBulk, { virtual: true });
jest.mock('../services/cardCatalog/cardCatalogLookup', () => mockLookup, { virtual: true });
jest.mock('../services/cardCatalog/catalogStore', () => mockCatalogStore, { virtual: true });
jest.mock('../services/ebayItemPushService', () => mockEbay, { virtual: true });
jest.mock('../services/priceDropService', () => mockAlerts, { virtual: true });
jest.mock('../services/shopifyService', () => mockShopify, { virtual: true });
jest.mock('../services/commandCenterService', () => mockCommand, { virtual: true });
jest.mock('../services/liveFeedService', () => mockFeed, { virtual: true });
jest.mock('../lib/socket', () => mockSocket, { virtual: true });
jest.mock('../config/cardEbayCategories', () => mockCategories, { virtual: true });

// Required AFTER the mocks above.
const { createPriceBookRouter } = require('../routes/priceBook');
const controller = require('../controllers/priceBookController');
const { createPriceBookHandlers, PRICE_BOOK_HANDLER_NAMES, createPriceChangedHook, createCatalogPrintingResolver, CATALOG_RESOLVE_GROUP, applyView, undoView, buildProductionDeps, priceBookHandlers } = controller;

const ORG = 'orgA';
const OWNER = { id: 'user_a', roles: ['ORGANIZER'] };

interface Reply {
  status: number;
  body: any;
}

interface RigOptions {
  env?: Record<string, string | undefined>;
  resolvePrintings?: unknown;
  wrapDb?: (db: FakeDb) => any;
  actorKind?: 'ORGANIZER' | 'TEAM_MEMBER';
}

interface Rig {
  db: FakeDb;
  env: Record<string, string | undefined>;
  base: string;
  changes: any[];
  lotCalls: Array<{ itemId: string; input: { pricePerThousand: number } }>;
  call(method: string, route: string, body?: unknown, user?: { id: string; roles: string[] } | null): Promise<Reply>;
  raw(method: string, route: string, init: { body?: any; headers?: Record<string, string> }): Promise<Reply>;
  bookId(): string;
}

const rigs: Array<{ server: any }> = [];

function startRig(options: RigOptions = {}): Rig {
  const db = createFakePriceBookDb();
  const env: Record<string, string | undefined> = { CARD_PRICE_BOOK_ENABLED: 'true', ...(options.env ?? {}) };
  const changes: any[] = [];
  const lotCalls: Array<{ itemId: string; input: { pricePerThousand: number } }> = [];
  const handlers = createPriceBookHandlers({
    db: options.wrapDb ? options.wrapDb(db) : db,
    env,
    now: () => FAKE_NOW,
    resolveActor: async (req: any) => ({ id: ORG, actingUserId: req.user.id, actorKind: options.actorKind ?? 'ORGANIZER' }),
    run: { minCardSaleCents: 99, onPriceChanged: (c: any) => void changes.push(c) },
    // Stands in for the real updateBulkLot: it validates nothing and writes Item.price, the only edit a lot has.
    lotDeps: (organizerId: string) => ({
      updateBulkLot: async (itemId: string, input: { pricePerThousand: number }) => {
        lotCalls.push({ itemId, input });
        const row = db.tables.item.find((r) => r.id === itemId && r.organizerId === organizerId);
        if (!row) throw new Error('BULK_NOT_FOUND');
        row.price = Math.round(input.pricePerThousand * 100) / 100;
        return undefined;
      },
    }),
    resolvePrintings: options.resolvePrintings ?? null,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/price-book', createPriceBookRouter(handlers));
  const server = app.listen(0);
  rigs.push({ server });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/price-book`;
  const read = async (res: Response): Promise<Reply> => {
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  };
  return {
    db,
    env,
    base,
    changes,
    lotCalls,
    async call(method, route, body, user = OWNER) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (user) headers['x-test-user'] = JSON.stringify(user);
      return read(await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    },
    async raw(method, route, init) {
      const headers: Record<string, string> = { 'x-test-user': JSON.stringify(OWNER), ...(init.headers ?? {}) };
      return read(await fetch(base + route, { method, headers, body: init.body }));
    },
    bookId() {
      const row = db.tables.priceBook.find((b) => b.organizerId === ORG);
      if (!row) throw new Error('no book');
      return row.id as string;
    },
  };
}

afterEach(() => {
  while (rigs.length > 0) {
    const rig = rigs.pop() as { server: any };
    rig.server.closeAllConnections?.();
    rig.server.close();
  }
});

/** A shop with its book on and the starting retail rule, made through the API. */
async function openShop(options: RigOptions = {}): Promise<Rig> {
  const rig = startRig(options);
  expect((await rig.call('PUT', '/book', { enabled: true })).status).toBe(201);
  expect((await rig.call('POST', '/book/templates', { template: 'RETAIL_STARTER' })).status).toBe(201);
  return rig;
}

const typedRef = (n: number, price: number | string, over: Record<string, unknown> = {}) => ({
  game: 'MTG',
  typed: { setCode: 'abc', collectorNumber: String(n), cardName: `Card ${n}` },
  finish: 'NONFOIL',
  price,
  ...over,
});

/** A listed card whose collector number is n. */
function addCard(db: FakeDb, n: number, price: number | null, item: AnyRow = {}, card: AnyRow = {}): string {
  return seedCardItem(db, ORG, { price, title: `Card ${n}`, ...item }, { cardName: `Card ${n}`, collectorNumber: String(n), setCode: 'abc', ...card }).item.id as string;
}

/** A reference row for the card added with addCard, written straight into the fake. */
function addReference(db: FakeDb, bookId: string, n: number, cents: number): void {
  seedReference(db, bookId, { cardKey: `s:abc|${n}|card ${n}|`, game: 'MTG', finish: 'NONFOIL', language: 'en', valueCents: cents, cardName: `Card ${n}`, setCode: 'abc', collectorNumber: String(n) });
}

const priceOf = (db: FakeDb, id: string): unknown => db.tables.item.find((r) => r.id === id)?.price;

// ---------------------------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------------------------

describe('GET /status', () => {
  it('answers platform facts before any book exists: the limits (undoDays among them) and the vocabulary with singular keys', async () => {
    const rig = startRig();
    const res = await rig.call('GET', '/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toMatchObject({ enabled: true, bookExists: false, bookEnabled: false, catalogReference: { bookOptedIn: false } });
    expect(data.limits).toMatchObject({ undoDays: 7, previewMinutes: 30, maxRunItems: 5000, suggestMaxCards: 100, importMaxRows: 5000, importMaxBytes: 2097152 });
    for (const key of ['finish', 'rarityClass', 'family', 'conditionCode', 'roundingMode', 'tier', 'unit', 'direction', 'priceSource']) {
      expect(Array.isArray(data.vocabulary[key])).toBe(true);
      expect(data.vocabulary[key].length).toBeGreaterThan(0);
      for (const entry of data.vocabulary[key]) expect(typeof entry.code === 'string' && typeof entry.label === 'string').toBe(true);
    }
    expect(data.vocabulary.finish.map((e: any) => e.code)).toContain('NONFOIL');
    expect(data.vocabulary.families).toEqual(['RETAIL', 'BUYLIST']);
  });

  it('reads the limits from the environment at call time', async () => {
    const rig = startRig({ env: { CARD_PRICE_BOOK_UNDO_DAYS: '3', CARD_PRICE_BOOK_RUN_PREVIEW_MINUTES: '10' } });
    expect((await rig.call('GET', '/status')).body.data.limits).toMatchObject({ undoDays: 3, previewMinutes: 10 });
    rig.env.CARD_PRICE_BOOK_UNDO_DAYS = '9';
    expect((await rig.call('GET', '/status')).body.data.limits.undoDays).toBe(9);
  });

  it('reports the shop book facts once a book exists, and the platform switch off without turning status away', async () => {
    const rig = await openShop();
    expect((await rig.call('GET', '/status')).body.data).toMatchObject({ enabled: true, bookExists: true, bookEnabled: true });
    expect((await rig.call('PUT', '/book', { allowCatalogReference: true })).status).toBe(200);
    expect((await rig.call('GET', '/status')).body.data.catalogReference.bookOptedIn).toBe(true);
    rig.env.CARD_PRICE_BOOK_ENABLED = 'false';
    const off = await rig.call('GET', '/status');
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ enabled: false, bookExists: false, bookEnabled: false });
    const disabled = await rig.call('GET', '/book');
    expect(disabled.status).toBe(404);
    expect(disabled.body).toMatchObject({ success: false, code: 'PRICE_BOOK_DISABLED' });
  });
});

// ---------------------------------------------------------------------------------------------
// book, templates, rules
// ---------------------------------------------------------------------------------------------

describe('the book', () => {
  it('has no book until the first write; PUT creates it (201) with counts, later writes answer 200 and bump the version', async () => {
    const rig = startRig();
    const none = await rig.call('GET', '/book');
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual({ book: null, counts: null });

    const made = await rig.call('PUT', '/book', { enabled: true, retailPercentBps: 9000 });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ created: true, changed: true, counts: { rules: 0, references: 0, benchmarks: 0, bulkRates: 0, locks: 0 } });
    expect(made.body.data.book).toMatchObject({ enabled: true, version: 1, retailPercentBps: 9000 });
    expect(made.body.data.book.organizerId).toBeUndefined();

    const changed = await rig.call('PUT', '/book', { retailPercentBps: 9500, ifVersion: 1 });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ created: false, changed: true });
    expect(changed.body.data.book).toMatchObject({ version: 2, retailPercentBps: 9500 });

    const read = await rig.call('GET', '/book');
    expect(read.body.data.book).toMatchObject({ version: 2, retailPercentBps: 9500, counts: { rules: 0 } });
    expect(rig.db.select('priceBook')).toHaveLength(1);
  });

  it('refuses a stale ifVersion with 409 VERSION_CONFLICT and writes nothing', async () => {
    const rig = await openShop();
    const before = rig.db.writeCount();
    const res = await rig.call('PUT', '/book', { retailPercentBps: 8000, ifVersion: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'VERSION_CONFLICT' });
    expect(rig.db.writeCount()).toBe(before);
  });

  it('refuses an unknown key and a wrong type with 400 VALIDATION and the list of problems', async () => {
    const rig = startRig();
    const unknown = await rig.call('PUT', '/book', { enabled: true, mystery: 1 });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(Array.isArray(unknown.body.issues)).toBe(true);
    const wrongType = await rig.call('PUT', '/book', { enabled: 'yes' });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.code).toBe('VALIDATION');
    expect(rig.db.select('priceBook')).toHaveLength(0);
  });

  it('applies a starting point to an empty list once; a second time answers 409 TEMPLATE_NEEDS_EMPTY', async () => {
    const rig = startRig();
    await rig.call('PUT', '/book', { enabled: true });
    const first = await rig.call('POST', '/book/templates', { template: 'RETAIL_STARTER' });
    expect(first.status).toBe(201);
    expect(first.body.data.label).toEqual(expect.any(String));
    expect(first.body.data.rules).toHaveLength(1);
    expect(first.body.data.rules[0]).toMatchObject({ family: 'RETAIL', name: 'All cards', basis: 'REFERENCE' });
    expect(first.body.data.rules[0].bookId).toBeUndefined();
    const again = await rig.call('POST', '/book/templates', { template: 'RETAIL_STARTER' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TEMPLATE_NEEDS_EMPTY');
    const buy = await rig.call('POST', '/book/templates', { template: 'BUYLIST_STARTER' });
    expect(buy.status).toBe(201);
    expect(buy.body.data.rules.every((r: any) => r.family === 'BUYLIST')).toBe(true);
    expect((await rig.call('POST', '/book/templates', { template: 'NOPE' })).status).toBe(400);
  });
});

describe('rules', () => {
  it('creates, lists in priority order, changes, reorders and deletes a rule', async () => {
    const rig = await openShop();
    const created = await rig.call('POST', '/rules', { family: 'RETAIL', name: 'Foils', finish: 'FOIL', basis: 'REFERENCE', percentBps: 11000 });
    expect(created.status).toBe(201);
    const foil = created.body.data.rule;
    expect(foil).toMatchObject({ family: 'RETAIL', name: 'Foils', finish: 'FOIL', percentBps: 11000 });
    expect(foil.bookId).toBeUndefined();

    const listed = await rig.call('GET', '/rules?family=RETAIL');
    expect(listed.status).toBe(200);
    expect(listed.body.data.rules).toHaveLength(2);
    expect(listed.body.data.rules.map((r: any) => r.name).sort()).toEqual(['All cards', 'Foils']);

    const renamed = await rig.call('PUT', `/rules/${foil.id}`, { name: 'Foils, priced up', percentBps: 12000 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.rule).toMatchObject({ id: foil.id, name: 'Foils, priced up', percentBps: 12000 });

    const all = listed.body.data.rules.map((r: any) => r.id) as string[];
    const reversed = [...all].reverse();
    const reordered = await rig.call('POST', '/rules/reorder', { family: 'RETAIL', ids: reversed });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.rules.map((r: any) => r.id)).toEqual(reversed);

    const removed = await rig.call('DELETE', `/rules/${foil.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ deleted: true });
    expect((await rig.call('DELETE', `/rules/${foil.id}`)).status).toBe(404);
    expect((await rig.call('GET', '/rules')).body.data.rules).toHaveLength(1);
  });

  it('answers 404 for a rule that is not there, 400 for moving a rule to the other list or adding one with ifVersion', async () => {
    const rig = await openShop();
    expect((await rig.call('PUT', '/rules/nope', { name: 'x' })).status).toBe(404);
    const rules = (await rig.call('GET', '/rules')).body.data.rules;
    const move = await rig.call('PUT', `/rules/${rules[0].id}`, { family: 'BUYLIST', name: 'x' });
    expect(move.status).toBe(400);
    expect(move.body.code).toBe('VALIDATION');
    const withVersion = await rig.call('POST', '/rules', { family: 'RETAIL', name: 'x', ifVersion: 1 });
    expect(withVersion.status).toBe(400);
    expect((await rig.call('POST', '/rules', { family: 'RETAIL', name: 'x', surprise: true })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// references
// ---------------------------------------------------------------------------------------------

describe('references', () => {
  it('saves a typed price (dollars in, cents stored) with game next to typed; the same card again updates it', async () => {
    const rig = await openShop();
    const first = await rig.call('PUT', '/references', typedRef(1, 12.5, { language: 'en', note: 'Shop price' }));
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(true);
    expect(first.body.data.reference).toMatchObject({ valueCents: 1250, price: 12.5, game: 'MTG', finish: 'NONFOIL', cardName: 'Card 1', setCode: 'abc', collectorNumber: '1', note: 'Shop price', cardKey: 's:abc|1|card 1|' });
    expect(first.body.data.reference.bookId).toBeUndefined();

    const again = await rig.call('PUT', '/references', typedRef(1, '13.00', { language: 'en' }));
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ created: false, reference: { valueCents: 1300, price: 13 } });
    expect(rig.db.select('priceBookReference')).toHaveLength(1);
  });

  it('refuses an amount with more than two decimals, a negative amount and an unknown key', async () => {
    const rig = await openShop();
    const three = await rig.call('PUT', '/references', typedRef(1, '12.345'));
    expect(three.status).toBe(400);
    expect(three.body.code).toBe('VALIDATION');
    expect((await rig.call('PUT', '/references', typedRef(1, -1))).status).toBe(400);
    expect((await rig.call('PUT', '/references', typedRef(1, 5, { bookId: 'x' }))).status).toBe(400);
    expect(rig.db.select('priceBookReference')).toHaveLength(0);
  });

  it('lists references newest first with a cursor, filters by text, and deletes one (a second delete is a 404)', async () => {
    const rig = await openShop();
    for (const n of [1, 2, 3]) expect((await rig.call('PUT', '/references', typedRef(n, n * 10))).status).toBe(201);
    const page1 = await rig.call('GET', '/references?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.data.references).toHaveLength(2);
    expect(typeof page1.body.data.nextCursor).toBe('string');
    // The cursor is the id of the last row of the page (the in-memory fake cannot compare text ids, so page two is not read here).
    expect(page1.body.data.nextCursor).toBe(page1.body.data.references[1].id);
    expect(new Set(page1.body.data.references.map((r: any) => r.id)).size).toBe(2);
    const all = await rig.call('GET', '/references');
    expect(all.body.data.references).toHaveLength(3);
    expect(all.body.data.nextCursor).toBeNull();
    for (const r of page1.body.data.references) expect(r.price).toBe(r.valueCents / 100);

    const found = await rig.call('GET', '/references?q=Card%203');
    expect(found.body.data.references.map((r: any) => r.cardName)).toEqual(['Card 3']);
    expect((await rig.call('GET', '/references?limit=abc')).status).toBe(400);

    const id = page1.body.data.references[0].id;
    expect((await rig.call('DELETE', `/references/${id}`)).body.data).toEqual({ deleted: true });
    expect((await rig.call('DELETE', `/references/${id}`)).status).toBe(404);
    expect(rig.db.select('priceBookReference')).toHaveLength(2);
  });

  it('"use my current prices" turns priced stock into references; skipped is a number with the reasons beside it', async () => {
    const rig = await openShop();
    addCard(rig.db, 1, 9, {}, { conditionCode: 'LP', finish: 'NONFOIL' });
    addCard(rig.db, 2, 5, {}, { conditionCode: 'NM' });
    addCard(rig.db, 3, null);
    const res = await rig.call('POST', '/references/from-stock', {});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ considered: 3, created: 2, updated: 0, skipped: 1 });
    expect(typeof res.body.data.skipped).toBe('number');
    expect(res.body.data.skippedDetail).toMatchObject({ noPrice: 1 });
    const rows = rig.db.select('priceBookReference');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => Number(r.valueCents)).sort((a, b) => a - b)).toEqual([500, 1000]);
    const again = await rig.call('POST', '/references/from-stock', { overwrite: true });
    expect(again.body.data).toMatchObject({ created: 0, updated: 2 });
    expect((await rig.call('POST', '/references/from-stock', { everything: true })).status).toBe(400);
  });
});

describe('reference import', () => {
  const CSV = 'game,set code,collector number,name,finish,price\nMTG,abc,1,Card 1,NONFOIL,3.00\nMTG,abc,2,Card 2,FOIL,4.50\n';

  it('a dry run counts and writes nothing; the real run saves and reports created and updated', async () => {
    const rig = await openShop();
    const dry = await rig.call('POST', '/references/import', { csvText: CSV, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ dryRun: true, rowCount: 2, willCreate: 2, willUpdate: 0, saved: false, created: 0, updated: 0, rejected: [] });
    expect(rig.db.select('priceBookReference')).toHaveLength(0);

    const real = await rig.call('POST', '/references/import', { csvText: CSV, dryRun: false });
    expect(real.status).toBe(200);
    expect(real.body.data).toMatchObject({ dryRun: false, saved: true, created: 2, updated: 0 });
    expect(rig.db.select('priceBookReference').map((r) => r.valueCents).sort()).toEqual([300, 450]);

    const second = await rig.call('POST', '/references/import', { csvText: CSV, dryRun: false });
    expect(second.body.data).toMatchObject({ saved: true, created: 0, updated: 2 });
  });

  it('takes rows as JSON, and needs dryRun spelled out', async () => {
    const rig = await openShop();
    const rows = [{ game: 'MTG', 'set code': 'abc', 'collector number': '7', name: 'Card 7', price: 2.25 }];
    const res = await rig.call('POST', '/references/import', { rows, dryRun: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ saved: true, created: 1 });
    const missing = await rig.call('POST', '/references/import', { csvText: CSV });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('VALIDATION');
  });

  it('takes one file as multipart (dryRun as a text field) and refuses extra fields', async () => {
    const rig = await openShop();
    const form = new FormData();
    form.append('dryRun', 'false');
    form.append('file', new Blob([CSV], { type: 'text/csv' }), 'prices.csv');
    const res = await rig.raw('POST', '/references/import', { body: form });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ saved: true, created: 2 });
    expect(rig.db.select('priceBookReference')).toHaveLength(2);

    const extra = new FormData();
    extra.append('dryRun', 'true');
    extra.append('bookId', 'other');
    extra.append('file', new Blob([CSV], { type: 'text/csv' }), 'prices.csv');
    const refused = await rig.raw('POST', '/references/import', { body: extra });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('VALIDATION');
  });

  it('refuses a file over 2 MB with 400 and reason FILE_TOO_LARGE', async () => {
    const rig = await openShop();
    const form = new FormData();
    form.append('dryRun', 'true');
    form.append('file', new Blob(['name,price\n' + 'x'.repeat(2 * 1024 * 1024 + 10)], { type: 'text/csv' }), 'big.csv');
    const res = await rig.raw('POST', '/references/import', { body: form });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION', reason: 'FILE_TOO_LARGE' });
  });

  it('refuses a file that carries a marketplace price column (FOREIGN_PRICE_COLUMN) and writes nothing', async () => {
    const rig = await openShop();
    const res = await rig.call('POST', '/references/import', { csvText: 'name,price,market price\nCard 1,3.00,2.00\n', dryRun: false });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'FOREIGN_PRICE_COLUMN' });
    expect(rig.db.select('priceBookReference')).toHaveLength(0);
  });

  it('matches rows to catalog printings through the injected resolver, and saves the rest as typed cards', async () => {
    const seen: any[] = [];
    const resolver = async (refs: any[]) => {
      seen.push(...refs);
      return refs.map((r) =>
        r.collectorNumber === '1'
          ? { ref: r.ref, status: 'EXACT', candidates: [{ id: 'SCRYFALL:p1', source: 'SCRYFALL', game: 'MTG', name: 'Card 1', setCode: 'abc', setName: 'Abc', collectorNumber: '1', language: 'en', rarity: 'rare', finishes: ['NONFOIL', 'FOIL'] }] }
          : { ref: r.ref, status: 'UNMATCHED', candidates: [] }
      );
    };
    const rig = await openShop({ resolvePrintings: resolver });
    seedPrinting(rig.db, { id: 'SCRYFALL:p1', name: 'Card 1', setCode: 'abc', collectorNumber: '1' });
    const res = await rig.call('POST', '/references/import', { csvText: CSV_TWO(), dryRun: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ saved: true, created: 2, unresolved: 1 });
    expect(seen).toHaveLength(2);
    const rows = rig.db.select('priceBookReference');
    expect(rows.find((r) => r.collectorNumber === '1' || r.cardKey === 'p:SCRYFALL:p1')?.catalogPrintingId).toBe('SCRYFALL:p1');
    expect(rows.filter((r) => r.catalogPrintingId === null)).toHaveLength(1);
  });
});

function CSV_TWO(): string {
  return 'game,set code,collector number,name,finish,price\nMTG,abc,1,Card 1,NONFOIL,3.00\nMTG,abc,2,Card 2,NONFOIL,4.50\n';
}

// ---------------------------------------------------------------------------------------------
// benchmarks
// ---------------------------------------------------------------------------------------------

describe('benchmarks', () => {
  it('saves a price per game, rarity class and finish (dollars in), lists, updates in place and deletes', async () => {
    const rig = await openShop();
    const made = await rig.call('PUT', '/benchmarks', { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', price: 5, note: 'Shop rule of thumb' });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ created: true, benchmark: { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', valueCents: 500, price: 5, note: 'Shop rule of thumb' } });
    expect(made.body.data.benchmark.bookId).toBeUndefined();
    const updated = await rig.call('PUT', '/benchmarks', { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', price: '6.25' });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ created: false, benchmark: { valueCents: 625, price: 6.25 } });
    const listed = await rig.call('GET', '/benchmarks');
    expect(listed.body.data.benchmarks).toHaveLength(1);
    const id = listed.body.data.benchmarks[0].id;
    expect((await rig.call('DELETE', `/benchmarks/${id}`)).body.data).toEqual({ deleted: true });
    expect((await rig.call('DELETE', `/benchmarks/${id}`)).status).toBe(404);
    expect((await rig.call('PUT', '/benchmarks', { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', price: 1.234 })).status).toBe(400);
    expect((await rig.call('PUT', '/benchmarks', { game: 'MTG', rarityClass: 'RARE', finish: 'FOIL', price: 1, extra: 1 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// bulk rate card
// ---------------------------------------------------------------------------------------------

describe('bulk rate card', () => {
  const sell = (price: number | null, over: Record<string, unknown> = {}) => ({ direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', price, ...over });

  it('saves rate rows (dollars in), reads them back in cents with the shop lots next to what the card would charge', async () => {
    const rig = await openShop();
    const lotId = seedItem(rig.db, ORG, { title: 'Commons box', price: 7, stockTotal: 5000, status: 'AVAILABLE' }).id as string;
    rig.db.insert('itemBulkLot', { itemId: lotId, organizerId: ORG, game: 'MTG', lotKind: 'BULK_COMMON' });
    const saved = await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(8), sell(12, { tier: 'UNCOMMON' })] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ dryRun: false, created: 2, updated: 0, deleted: 0, changed: 2 });
    expect(typeof saved.body.data.version).toBe('number');

    const read = await rig.call('GET', '/bulk-rates?game=MTG');
    expect(read.status).toBe(200);
    const byTier = new Map<string, any>(read.body.data.rates.map((r: any) => [r.tier, r]));
    expect(byTier.get('COMMON')).toMatchObject({ direction: 'SELL', unit: 'PER_1000', finish: 'ANY', rateCents: 800 });
    expect(byTier.get('UNCOMMON')).toMatchObject({ rateCents: 1200 });
    expect(read.body.data.rates[0].bookId).toBeUndefined();
    expect(read.body.data.lots).toEqual([{ itemId: lotId, title: 'Commons box', lotKind: 'BULK_COMMON', currentPerThousandCents: 700, rateCardPerThousandCents: 800 }]);
    expect(read.body.data.version).toBe(saved.body.data.version);
    expect((await rig.call('GET', '/bulk-rates?game=NOPE')).status).toBe(400);
  });

  it('a dry run writes nothing; a null price removes the cell; a stale ifVersion is a 409', async () => {
    const rig = await openShop();
    const dry = await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(8)], dryRun: true });
    expect(dry.body.data).toMatchObject({ dryRun: true, created: 1 });
    expect(rig.db.select('priceBookBulkRate')).toHaveLength(0);
    const saved = await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(8)] });
    const removed = await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(null)], ifVersion: saved.body.data.version });
    expect(removed.status).toBe(200);
    expect(removed.body.data.deleted).toBe(1);
    expect(rig.db.select('priceBookBulkRate')).toHaveLength(0);
    const stale = await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(9)], ifVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect((await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(1.005)] })).status).toBe(400);
    expect((await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [{ ...sell(1), nonsense: 1 }] })).status).toBe(400);
  });

  it('adjusts every rate by a percent: shows the change first, writes only with apply true', async () => {
    const rig = await openShop();
    await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [sell(8)] });
    const preview = await rig.call('POST', '/bulk-rates/adjust', { game: 'MTG', direction: 'SELL', percent: 10 });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ applied: false });
    expect(preview.body.data.changes[0]).toMatchObject({ tier: 'COMMON', beforeCents: 800, afterCents: 880 });
    expect(rig.db.select('priceBookBulkRate')[0]?.rateCents).toBe(800);
    const applied = await rig.call('POST', '/bulk-rates/adjust', { game: 'MTG', direction: 'SELL', percent: 10, apply: true });
    expect(applied.body.data.applied).toBe(true);
    expect(rig.db.select('priceBookBulkRate')[0]?.rateCents).toBe(880);
    expect((await rig.call('POST', '/bulk-rates/adjust', { game: 'MTG', direction: 'SELL', percent: -95 })).status).toBe(400);
    expect((await rig.call('POST', '/bulk-rates/adjust', { game: 'MTG', direction: 'SELL', percent: 501 })).status).toBe(400);
  });

  it('quotes a bulk buy from the BUY rates with the book credit bonus; a missing rate is a quote answer, not an error', async () => {
    const rig = await openShop();
    const none = await rig.call('POST', '/buylist/bulk-quote', { game: 'MTG', lines: [{ tier: 'COMMON', cards: 1000 }] });
    expect(none.status).toBe(200);
    expect(none.body.data).toMatchObject({ ok: false, code: 'NO_RATE' });
    await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [{ direction: 'BUY', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', price: 2 }] });
    const quote = await rig.call('POST', '/buylist/bulk-quote', { game: 'MTG', lines: [{ tier: 'COMMON', cards: 2500 }] });
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({ ok: true, cashCents: 500, creditCents: 600 });
    expect(typeof quote.body.data.bookVersion).toBe('number');
    expect((await rig.call('POST', '/buylist/bulk-quote', { game: 'MTG', lines: [] })).status).toBe(400);
    expect((await rig.call('POST', '/buylist/bulk-quote', { game: 'MTG', lines: [{ tier: 'COMMON', cards: 0 }] })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// suggestions and buylist quotes
// ---------------------------------------------------------------------------------------------

describe('suggestions', () => {
  it('prices a typed card from the shop reference: dollars next to cents, a why line, the book version', async () => {
    const rig = await openShop();
    await rig.call('PUT', '/references', typedRef(1, 12.5, { language: 'en' }));
    const res = await rig.call('POST', '/suggest', {
      family: 'RETAIL',
      cards: [{ ref: 'a1', game: 'MTG', finish: 'NONFOIL', conditionCode: 'NM', language: 'en', typed: { setCode: 'abc', collectorNumber: '1', cardName: 'Card 1' } }],
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.bookVersion).toBe('number');
    const row = res.body.data.results[0];
    expect(row).toMatchObject({ ref: 'a1', ok: true, priceCents: 1250, price: 12.5, family: 'RETAIL', priceSource: 'MANUAL', applyAllowed: true });
    expect(typeof row.why).toBe('string');
    expect(Array.isArray(row.warnings)).toBe(true);
    expect(res.body.data.unavailable).toEqual([]);
  });

  it('answers a card it cannot price as ok false with a code, in the same 200; stock cards are priced by item id', async () => {
    const rig = await openShop();
    const id = addCard(rig.db, 2, 4);
    addReference(rig.db, rig.bookId(), 2, 450);
    const res = await rig.call('POST', '/suggest', {
      family: 'RETAIL',
      cards: [{ ref: 'stock', itemId: id }, { ref: 'unknown', game: 'MTG', finish: 'FOIL', typed: { cardName: 'No Such Card' } }],
    });
    expect(res.status).toBe(200);
    const byRef = new Map<string, any>(res.body.data.results.map((r: any) => [r.ref, r]));
    expect(byRef.get('stock')).toMatchObject({ ok: true, itemId: id, priceCents: 450 });
    expect(byRef.get('unknown')).toMatchObject({ ok: false, applyAllowed: false, price: null });
    expect(typeof byRef.get('unknown').code).toBe('string');
  });

  it('refuses more than 100 cards, an empty list and an unknown family; answers 404 while the shop switch is off', async () => {
    const rig = await openShop();
    const many = Array.from({ length: 101 }, (_, i) => ({ ref: `c${i}` }));
    expect((await rig.call('POST', '/suggest', { family: 'RETAIL', cards: many })).status).toBe(400);
    expect((await rig.call('POST', '/suggest', { family: 'RETAIL', cards: [] })).status).toBe(400);
    expect((await rig.call('POST', '/suggest', { family: 'WHOLESALE', cards: [{ ref: 'a' }] })).status).toBe(400);
    await rig.call('PUT', '/book', { enabled: false });
    const off = await rig.call('POST', '/suggest', { family: 'RETAIL', cards: [{ ref: 'a' }] });
    expect(off.status).toBe(404);
    expect(off.body.code).toBe('PRICE_BOOK_DISABLED');
  });

  it('quotes buylist offers for cards, and writes nothing', async () => {
    const rig = await openShop();
    await rig.call('POST', '/book/templates', { template: 'BUYLIST_STARTER' });
    await rig.call('PUT', '/references', typedRef(1, 10, { language: 'en' }));
    const before = rig.db.writeCount();
    const res = await rig.call('POST', '/buylist/quote', {
      cards: [{ ref: 'q1', game: 'MTG', finish: 'NONFOIL', conditionCode: 'NM', language: 'en', quantity: 2, typed: { setCode: 'abc', collectorNumber: '1', cardName: 'Card 1' } }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.results[0]).toMatchObject({ ref: 'q1', family: 'BUYLIST' });
    expect(rig.db.writeCount()).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------
// locks
// ---------------------------------------------------------------------------------------------

describe('locks', () => {
  it('pins a price, lists the pins, and unpins; a lock of an item that is not the shop\'s is a 404', async () => {
    const rig = await openShop();
    const id = addCard(rig.db, 1, 4);
    const locked = await rig.call('PUT', `/locks/${id}`, { locked: true });
    expect(locked.status).toBe(200);
    expect(locked.body.data).toMatchObject({ locked: true, lock: { itemId: id, title: 'Card 1', price: 4, reason: 'PIN', priceCentsAtLock: 400 } });
    const listed = await rig.call('GET', '/locks');
    expect(listed.body.data.locks.map((l: any) => l.itemId)).toEqual([id]);
    const until = await rig.call('PUT', `/locks/${id}`, { locked: true, until: '2026-12-01T00:00:00.000Z' });
    expect(until.status).toBe(200);
    expect(until.body.data.lock.lockedUntil).toBe('2026-12-01T00:00:00.000Z');
    const open = await rig.call('PUT', `/locks/${id}`, { locked: false });
    expect(open.status).toBe(200);
    expect(open.body.data.locked).toBe(false);
    expect((await rig.call('GET', '/locks')).body.data.locks).toEqual([]);
    expect((await rig.call('PUT', '/locks/not-mine', { locked: true })).status).toBe(404);
    expect((await rig.call('PUT', `/locks/${id}`, { locked: true, extra: 1 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------------------------

const PREVIEW_BULK = { kind: 'BULK', scope: { onlyUnpriced: false }, includeMarkedDown: false, includeEbayLive: false };

/** A shop with n cards priced at 1.90 and a 2.00 reference each. Returns the item ids. */
async function stockedShop(n: number, options: RigOptions = {}): Promise<{ rig: Rig; ids: string[] }> {
  const rig = await openShop(options);
  const bookId = rig.bookId();
  const ids: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    ids.push(addCard(rig.db, i, 1.9));
    addReference(rig.db, bookId, i, 200);
  }
  return { rig, ids };
}

describe('a card run: preview, tick, apply, undo', () => {
  it('previews every card with the fields the screen reads (run item ids, code strings for warnings and review reasons)', async () => {
    const { rig, ids } = await stockedShop(2);
    const res = await rig.call('POST', '/runs/preview', PREVIEW_BULK);
    expect(res.status).toBe(200);
    const { run, items, nextCursor } = res.body.data;
    expect(run).toMatchObject({ kind: 'BULK', status: 'PREVIEW', counts: { eligible: 2, changes: 2, unchanged: 0, skipped: 0, review: 0 }, appliedCount: 0 });
    expect(typeof run.bookVersion).toBe('number');
    expect(typeof run.expiresAt).toBe('string');
    expect(nextCursor).toBeNull();
    expect(items).toHaveLength(2);
    for (const row of items) {
      expect(typeof row.id).toBe('string');
      expect(ids).toContain(row.itemId);
      expect(row).toMatchObject({ state: 'PENDING', selected: true, oldPriceCents: 190, newPriceCents: 200, oldPrice: 1.9, newPrice: 2, priceSource: 'MANUAL' });
      expect(Array.isArray(row.warnings) && row.warnings.every((w: unknown) => typeof w === 'string')).toBe(true);
      expect(Array.isArray(row.reviewReasons) && row.reviewReasons.every((w: unknown) => typeof w === 'string')).toBe(true);
    }
    expect(rig.db.tables.priceBookRun).toHaveLength(1);
    expect(priceOf(rig.db, ids[0] as string)).toBe(1.9);
  });

  it('lists runs and one run, pages the rows by view, and answers 404 for a run that is not the shop\'s', async () => {
    const { rig } = await stockedShop(3);
    const runId = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run.id as string;
    const runs = await rig.call('GET', '/runs');
    expect(runs.body.data.runs.map((r: any) => r.id)).toEqual([runId]);
    const one = await rig.call('GET', `/runs/${runId}`);
    expect(one.body.data.run).toMatchObject({ id: runId, status: 'PREVIEW' });
    const page = await rig.call('GET', `/runs/${runId}/items?view=all&limit=2`);
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(2);
    expect(typeof page.body.data.nextCursor).toBe('string');
    const rest = await rig.call('GET', `/runs/${runId}/items?view=all&limit=2&cursor=${encodeURIComponent(page.body.data.nextCursor)}`);
    expect(rest.body.data.items).toHaveLength(1);
    expect((await rig.call('GET', '/runs/nope')).status).toBe(404);
    expect((await rig.call('GET', '/runs/nope/items')).status).toBe(404);
  });

  it('applies the ticked rows: writes the prices, answers the counts the screen reads, and calls the price change hook per card', async () => {
    const { rig, ids } = await stockedShop(2);
    const preview = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    const res = await rig.call('POST', `/runs/${preview.id}/apply`, { ifBookVersion: preview.bookVersion, expectedCount: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ runId: preview.id, status: 'APPLIED', applied: 2, appliedThisCall: 2, remaining: 0, changedSince: 0, lockedSincePreview: 0, failed: 0 });
    expect(res.body.data.summary).toMatchObject({ status: 'APPLIED', applied: 2, changedSince: 0, failed: 0 });
    expect(typeof res.body.data.message).toBe('string');
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([2, 2]);
    expect(rig.changes).toHaveLength(2);
    expect(rig.changes[0]).toMatchObject({ kind: 'APPLY', organizerId: ORG, oldPrice: 1.9, newPrice: 2, runId: preview.id });
    expect((await rig.call('GET', `/runs/${preview.id}`)).body.data.run).toMatchObject({ status: 'APPLIED', appliedCount: 2 });
  });

  it('a second apply answers 409 ALREADY_APPLIED with the summary where the screen reads it', async () => {
    const { rig } = await stockedShop(2);
    const preview = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    const body = { ifBookVersion: preview.bookVersion, expectedCount: 2 };
    await rig.call('POST', `/runs/${preview.id}/apply`, body);
    const again = await rig.call('POST', `/runs/${preview.id}/apply`, body);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ success: false, code: 'ALREADY_APPLIED', runId: preview.id, status: 'APPLIED', applied: 2, remaining: 0, changedSince: 0, failed: 0 });
    expect(again.body.summary).toMatchObject({ status: 'APPLIED', applied: 2 });
    expect(rig.changes).toHaveLength(2);
  });

  it('PATCH takes run item ids: unticked rows stay as they were, and the tick count must match (COUNT_MISMATCH)', async () => {
    const { rig, ids } = await stockedShop(3);
    const preview = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data;
    const run = preview.run;
    const second = preview.items.find((r: any) => r.itemId === ids[1]);
    const patched = await rig.call('PATCH', `/runs/${run.id}/items`, { deselectIds: [second.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.data.counts ?? patched.body.data.run?.counts ?? patched.body.data).toBeTruthy();
    const rows = (await rig.call('GET', `/runs/${run.id}/items?view=all`)).body.data.items;
    expect(rows.find((r: any) => r.id === second.id).selected).toBe(false);
    expect(rows.filter((r: any) => r.selected)).toHaveLength(2);

    const wrong = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 3 });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('COUNT_MISMATCH');
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([1.9, 1.9, 1.9]);

    const right = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 2 });
    expect(right.body.data).toMatchObject({ status: 'APPLIED', applied: 2 });
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([2, 1.9, 2]);

    // An id that is not a row of this run is dropped, so nothing is left to change and the call is refused.
    const other = await rig.call('PATCH', `/runs/${run.id}/items`, { selectIds: ['no-such-row'] });
    expect(other.status).toBe(400);
    expect(other.body.code).toBe('VALIDATION');
  });

  it('refuses an apply after the book changed (BOOK_CHANGED), counts a card that changed since the preview, and leaves a pinned one', async () => {
    const { rig, ids } = await stockedShop(3);
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;

    const stale = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion + 1, expectedCount: 3 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('BOOK_CHANGED');

    const edited = rig.db.tables.item.find((r) => r.id === ids[0]) as AnyRow;
    edited.price = 3.33;
    expect((await rig.call('PUT', `/locks/${ids[1]}`, { locked: true })).status).toBe(200);
    const res = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ applied: 1, changedSince: 1, lockedSincePreview: 1, failed: 0, status: 'PARTIAL' });
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([3.33, 1.9, 2]);
  });

  it('applies and undoes more than one chunk: the screen loops while the status is APPLYING (undo reports APPLYING too)', async () => {
    // 200 rows are written per call, so 205 cards take two calls each way.
    const { rig, ids } = await stockedShop(205);
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    expect(run.counts.changes).toBe(205);
    const body = { ifBookVersion: run.bookVersion, expectedCount: 205 };

    const first = await rig.call('POST', `/runs/${run.id}/apply`, body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: 'APPLYING', applied: 200, appliedThisCall: 200, remaining: 5 });
    expect(first.body.data.summary).toMatchObject({ status: 'APPLYING', remaining: 5 });
    const second = await rig.call('POST', `/runs/${run.id}/apply`, body);
    expect(second.body.data).toMatchObject({ status: 'APPLIED', applied: 205, appliedThisCall: 5, remaining: 0 });
    expect(rig.changes).toHaveLength(205);
    expect(ids.every((id) => priceOf(rig.db, id) === 2)).toBe(true);

    const undoFirst = await rig.call('POST', `/runs/${run.id}/undo`, {});
    expect(undoFirst.status).toBe(200);
    expect(undoFirst.body.data).toMatchObject({ status: 'APPLYING', rawStatus: 'UNDOING', undone: 200, undoneThisCall: 200, undoSkipped: 0, remaining: 5 });
    const undoSecond = await rig.call('POST', `/runs/${run.id}/undo`, {});
    expect(undoSecond.body.data).toMatchObject({ status: 'UNDONE', undone: 205, undoSkipped: 0, remaining: 0 });
    expect(undoSecond.body.data.summary).toMatchObject({ status: 'UNDONE', undone: 205 });
    expect(ids.every((id) => priceOf(rig.db, id) === 1.9)).toBe(true);
    expect(rig.changes.filter((c) => c.kind === 'UNDO')).toHaveLength(205);
    expect((await rig.call('GET', `/runs/${run.id}`)).body.data.run.status).toBe('UNDONE');
  }, 120000);

  it('undo leaves a card the shop changed after the run and counts it as undoSkipped', async () => {
    const { rig, ids } = await stockedShop(2);
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 2 });
    (rig.db.tables.item.find((r) => r.id === ids[0]) as AnyRow).price = 9.99;
    const res = await rig.call('POST', `/runs/${run.id}/undo`, {});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ undone: 1, undoSkipped: 1, remaining: 0 });
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([9.99, 1.9]);
    const second = await rig.call('POST', `/runs/${run.id}/undo`, {});
    // A second undo is harmless: it changes nothing and says the same thing.
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ status: 'UNDONE', undoneThisCall: 0, undoSkipped: 1 });
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([9.99, 1.9]);
  });

  it('cancels a preview (no price changes); applying a cancelled run is refused', async () => {
    const { rig, ids } = await stockedShop(2);
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    const cancelled = await rig.call('POST', `/runs/${run.id}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.run.status).toBe('CANCELLED');
    const after = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 2 });
    expect(after.status).toBe(409);
    expect(after.body.code).toBe('RUN_NOT_PREVIEW');
    expect(ids.map((id) => priceOf(rig.db, id))).toEqual([1.9, 1.9]);
    expect((await rig.call('POST', `/runs/${run.id}/cancel`, {})).status).toBe(409);
  });

  it('a preview that is too large answers 400 SCOPE_TOO_LARGE with the count and the limit beside it', async () => {
    const { rig } = await stockedShop(3, { env: { CARD_PRICE_BOOK_MAX_RUN_ITEMS: '2' } });
    const res = await rig.call('POST', '/runs/preview', PREVIEW_BULK);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'SCOPE_TOO_LARGE', count: 3, max: 2 });
    expect(rig.db.tables.priceBookRun).toHaveLength(0);
  });

  it('refuses an unknown preview key or scope key, a kind that does not exist, and a body on undo or cancel', async () => {
    const { rig } = await stockedShop(1);
    expect((await rig.call('POST', '/runs/preview', { kind: 'BULK', everything: true })).status).toBe(400);
    expect((await rig.call('POST', '/runs/preview', { kind: 'BULK', scope: { organizerId: 'x' } })).status).toBe(400);
    expect((await rig.call('POST', '/runs/preview', { kind: 'SOMETHING' })).status).toBe(400);
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    expect((await rig.call('POST', `/runs/${run.id}/cancel`, { force: true })).status).toBe(400);
    expect((await rig.call('POST', `/runs/${run.id}/undo`, { force: true })).status).toBe(400);
    expect((await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: 0, expectedCount: 1 })).status).toBe(400);
  });

  it('the shop switch off for the book (not the platform) refuses a preview with 404 PRICE_BOOK_DISABLED', async () => {
    const { rig } = await stockedShop(1);
    await rig.call('PUT', '/book', { enabled: false });
    const res = await rig.call('POST', '/runs/preview', PREVIEW_BULK);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRICE_BOOK_DISABLED');
  });
});

describe('a lot run', () => {
  async function lotShop(): Promise<{ rig: Rig; lotId: string }> {
    const rig = await openShop();
    await rig.call('PUT', '/bulk-rates', { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', price: 8 }] });
    const lotId = seedItem(rig.db, ORG, { title: 'Commons box', price: 7, stockTotal: 5000, status: 'AVAILABLE' }).id as string;
    rig.db.insert('itemBulkLot', { itemId: lotId, organizerId: ORG, game: 'MTG', lotKind: 'BULK_COMMON' });
    return { rig, lotId };
  }

  it('previews from the rate card, applies through updateBulkLot with dollars per 1,000, and undoes', async () => {
    const { rig, lotId } = await lotShop();
    const res = await rig.call('POST', '/runs/preview', { kind: 'LOT', scope: { onlyUnpriced: false }, includeMarkedDown: false, includeEbayLive: false });
    expect(res.status).toBe(200);
    const run = res.body.data.run;
    expect(run).toMatchObject({ kind: 'LOT', status: 'PREVIEW', counts: { eligible: 1, changes: 1 } });
    expect(res.body.data.items[0]).toMatchObject({ itemId: lotId, oldPrice: 7, newPrice: 8, priceSource: 'RATE_CARD' });

    const applied = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 1 });
    expect(applied.status).toBe(200);
    expect(applied.body.data).toMatchObject({ status: 'APPLIED', applied: 1, failed: 0, changedSince: 0 });
    expect(rig.lotCalls).toEqual([{ itemId: lotId, input: { pricePerThousand: 8 } }]);
    expect(priceOf(rig.db, lotId)).toBe(8);

    const again = await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 1 });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'ALREADY_APPLIED', applied: 1 });

    const undone = await rig.call('POST', `/runs/${run.id}/undo`, {});
    expect(undone.status).toBe(200);
    expect(undone.body.data).toMatchObject({ status: 'UNDONE', undone: 1, undoSkipped: 0 });
    expect(rig.lotCalls[1]).toEqual({ itemId: lotId, input: { pricePerThousand: 7 } });
    expect(priceOf(rig.db, lotId)).toBe(7);
  });

  it('a lot run can be limited by sale only; any other card filter is a 400', async () => {
    const { rig } = await lotShop();
    for (const scope of [{ game: 'MTG' }, { setCode: 'abc' }, { rarityClass: 'RARE' }, { finish: 'FOIL' }, { intakeBatchId: 'b1' }, { onlyUnpriced: true }]) {
      const res = await rig.call('POST', '/runs/preview', { kind: 'LOT', scope }, { id: `user_${JSON.stringify(scope)}`, roles: ['ORGANIZER'] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
    const bySale = await rig.call('POST', '/runs/preview', { kind: 'LOT', scope: { saleId: null, onlyUnpriced: false } });
    expect(bySale.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
// the price change hook (RunDeps.onPriceChanged)
// ---------------------------------------------------------------------------------------------

describe('createPriceChangedHook', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'i1',
    organizerId: ORG,
    saleId: 'sale1',
    title: 'Card',
    ebayOfferId: null,
    ebayListingId: null,
    ebayCategoryId: null,
    ebaySyncHeldAt: null,
    ebayContentDirtyAt: null,
    ...over,
  });
  const change = (over: Record<string, unknown> = {}) => ({
    runId: 'r1',
    kind: 'APPLY',
    itemId: 'i1',
    organizerId: ORG,
    oldPriceCents: 500,
    newPriceCents: 400,
    oldPrice: 5,
    newPrice: 4,
    ebayListed: false,
    ...over,
  });

  function makeIo(loaded: unknown) {
    const log: string[] = [];
    const io = {
      loadItem: jest.fn(async () => loaded),
      pushToEbay: jest.fn(async (a: any) => void log.push(`ebay:${a.hold ? 'hold' : 'push'}:${a.fields.join('+')}`)),
      notifyPriceDrop: jest.fn(async () => void log.push('alert')),
      emitPriceDropEvent: jest.fn(() => void log.push('feed')),
      pushToShopify: jest.fn(async () => void log.push('shopify')),
      invalidateCommandCenter: jest.fn(async () => void log.push('cache')),
      isPinnedCardCategory: jest.fn(() => false),
      envelopeCrossing: jest.fn(() => false),
      warn: jest.fn(),
    };
    return { io, log };
  }

  it('a price drop on an eBay listing: push, alert, live feed, Shopify and cache, in the order itemController uses', async () => {
    const { io, log } = makeIo(item({ ebayOfferId: 'offer1', ebayListingId: 'list1', ebayContentDirtyAt: null }));
    const hook = createPriceChangedHook(io);
    hook(change());
    await hook.idle();
    expect(log).toEqual(['ebay:push:price', 'alert', 'feed', 'shopify', 'cache']);
    expect(io.pushToEbay).toHaveBeenCalledWith({ itemId: 'i1', organizerId: ORG, fields: ['price'], hold: false, dirtyBefore: null });
    expect(io.notifyPriceDrop).toHaveBeenCalledWith('i1', 5, 4);
    expect(io.emitPriceDropEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', saleId: 'sale1' }), 4);
  });

  it('a held listing records a held attempt and makes no push', async () => {
    const dirty = new Date('2026-10-01T00:00:00.000Z');
    const { io, log } = makeIo(item({ ebayOfferId: 'offer1', ebaySyncHeldAt: new Date(), ebayContentDirtyAt: dirty }));
    const hook = createPriceChangedHook(io);
    hook(change({ newPrice: 6, oldPrice: 5 }));
    await hook.idle();
    expect(log[0]).toBe('ebay:hold:price');
    expect(io.pushToEbay).toHaveBeenCalledTimes(1);
    expect(io.pushToEbay).toHaveBeenCalledWith(expect.objectContaining({ hold: true, dirtyBefore: dirty }));
    expect(io.notifyPriceDrop).not.toHaveBeenCalled();
    expect(io.emitPriceDropEvent).not.toHaveBeenCalled();
    expect(log).toContain('shopify');
  });

  it('a pinned card category that crosses the Standard Envelope line also resyncs shipping', async () => {
    const { io } = makeIo(item({ ebayOfferId: 'offer1', ebayCategoryId: '183454' }));
    io.isPinnedCardCategory.mockReturnValue(true);
    io.envelopeCrossing.mockReturnValue(true);
    const hook = createPriceChangedHook(io);
    hook(change({ oldPrice: 21, newPrice: 19 }));
    await hook.idle();
    expect(io.envelopeCrossing).toHaveBeenCalledWith(21, 19);
    expect(io.pushToEbay).toHaveBeenCalledWith(expect.objectContaining({ fields: ['price', 'shipping'] }));
  });

  it('an item with no eBay link, a price rise and no sale: only Shopify and the cache', async () => {
    const { io, log } = makeIo(item({ saleId: null }));
    const hook = createPriceChangedHook(io);
    hook(change({ oldPrice: 4, newPrice: 6 }));
    await hook.idle();
    expect(log).toEqual(['shopify', 'cache']);
    expect(io.pushToEbay).not.toHaveBeenCalled();
  });

  it('does nothing for an item that is gone or belongs to another shop', async () => {
    for (const loaded of [null, item({ organizerId: 'orgB', ebayOfferId: 'o' })]) {
      const { io } = makeIo(loaded);
      const hook = createPriceChangedHook(io);
      hook(change());
      await hook.idle();
      expect(io.pushToEbay).not.toHaveBeenCalled();
      expect(io.notifyPriceDrop).not.toHaveBeenCalled();
      expect(io.pushToShopify).not.toHaveBeenCalled();
      expect(io.invalidateCommandCenter).not.toHaveBeenCalled();
    }
  });

  it('is best effort: a failing step is logged and the next step still runs; nothing throws, even when the item read fails', async () => {
    const { io, log } = makeIo(item({ ebayOfferId: 'offer1' }));
    io.pushToEbay.mockRejectedValue(new Error('eBay is down'));
    io.notifyPriceDrop.mockRejectedValue(new Error('mail is down'));
    const hook = createPriceChangedHook(io);
    expect(() => hook(change())).not.toThrow();
    await hook.idle();
    expect(io.warn).toHaveBeenCalledTimes(2);
    expect(log).toEqual(['feed', 'shopify', 'cache']);

    const broken = makeIo(null);
    broken.io.loadItem.mockRejectedValue(new Error('db is down'));
    const hook2 = createPriceChangedHook(broken.io);
    hook2(change());
    await hook2.idle();
    expect(broken.io.warn).toHaveBeenCalledTimes(1);
  });

  it('works one change at a time, in the order they came, so a big apply cannot open many marketplace calls at once', async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const { io } = makeIo(null);
    io.loadItem.mockImplementation((async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      order.push(id);
      running -= 1;
      return null;
    }) as any);
    const hook = createPriceChangedHook(io);
    for (let i = 0; i < 6; i += 1) hook(change({ itemId: `i${i}` }));
    await hook.idle();
    expect(peak).toBe(1);
    expect(order).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5']);
  });
});

// ---------------------------------------------------------------------------------------------
// the catalog printing resolver (the import's PrintingResolver)
// ---------------------------------------------------------------------------------------------

describe('createCatalogPrintingResolver', () => {
  const candidate = (id: string) => ({ id, source: 'SCRYFALL', game: 'MTG', name: 'Card', setCode: 'abc', setName: 'Abc', collectorNumber: '1', language: 'en', rarity: 'rare', finishes: ['NONFOIL'], prices: { usd: 1 }, usd: 1 });

  it('asks the catalog in groups of 500 and keeps the answers in the order of the refs', async () => {
    const sizes: number[] = [];
    const resolver = createCatalogPrintingResolver({
      readyGames: async () => ['MTG'],
      isCatalogGame: () => true,
      resolve: async (refs: any[]) => {
        sizes.push(refs.length);
        return refs.map((r) => ({ ref: r.ref, status: 'EXACT', candidates: [candidate(`id-${r.ref}`)] }));
      },
    });
    const refs = Array.from({ length: 1200 }, (_, i) => ({ ref: `r${i}`, game: 'MTG', setCode: 'abc', collectorNumber: String(i), name: null, language: null, finish: null }));
    const out = await resolver(refs);
    expect(CATALOG_RESOLVE_GROUP).toBe(500);
    expect(sizes).toEqual([500, 500, 200]);
    expect(out).toHaveLength(1200);
    expect(out.map((o: any) => o.ref)).toEqual(refs.map((r) => r.ref));
    expect(out[1199]).toMatchObject({ status: 'EXACT', candidates: [{ id: 'id-r1199' }] });
  });

  it('keeps only the identity fields of a printing: its price block never reaches the price book', async () => {
    const resolver = createCatalogPrintingResolver({
      readyGames: async () => ['MTG'],
      isCatalogGame: () => true,
      resolve: async (refs: any[]) => refs.map((r) => ({ ref: r.ref, status: 'EXACT', candidates: [candidate('p1')] })),
    });
    const [only] = await resolver([{ ref: 'a', game: 'MTG', name: 'Card' }]);
    expect(Object.keys(only.candidates[0] as object).sort()).toEqual(['collectorNumber', 'finishes', 'game', 'id', 'language', 'name', 'rarity', 'setCode', 'setName', 'source']);
  });

  it('a game the catalog does not serve (or is not ready) is UNMATCHED with no query; a ref with no answer is UNMATCHED too', async () => {
    const resolve = jest.fn(async (refs: any[]) => refs.filter((r) => r.ref !== 'lost').map((r) => ({ ref: r.ref, status: 'EXACT', candidates: [candidate('p1')] })));
    const resolver = createCatalogPrintingResolver({ readyGames: async () => ['MTG'], isCatalogGame: (g: string) => g === 'MTG' || g === 'POKEMON', resolve: resolve as any });
    const out = await resolver([
      { ref: 'a', game: 'POKEMON', name: 'x' },
      { ref: 'b', game: 'LORCANA', name: 'x' },
      { ref: 'lost', game: 'MTG', name: 'x' },
      { ref: 'found', game: 'MTG', name: 'x' },
    ]);
    expect(out.map((o: any) => [o.ref, o.status])).toEqual([['a', 'UNMATCHED'], ['b', 'UNMATCHED'], ['lost', 'UNMATCHED'], ['found', 'EXACT']]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]?.[0]).toHaveLength(2);

    const idle = jest.fn(async () => []);
    const none = createCatalogPrintingResolver({ readyGames: async () => [], isCatalogGame: () => true, resolve: idle as any });
    expect((await none([{ ref: 'a', game: 'MTG', name: 'x' }]))[0]?.status).toBe('UNMATCHED');
    expect(idle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// wiring: transaction options, the production dependencies, the lazy handlers
// ---------------------------------------------------------------------------------------------

describe('wiring', () => {
  it('forwards the transaction options (timeout, maxWait) from the services to the database client', async () => {
    const seen: Array<{ timeout?: number; maxWait?: number } | undefined> = [];
    const wrapDb = (db: FakeDb) =>
      new Proxy(db, {
        get(target, prop) {
          if (prop === '$transaction') {
            return (fn: any, opts?: { timeout?: number; maxWait?: number }) => {
              seen.push(opts);
              return target.$transaction(fn, opts as any);
            };
          }
          return Reflect.get(target, prop, target);
        },
      });
    const { rig } = await stockedShop(2, { wrapDb });
    const run = (await rig.call('POST', '/runs/preview', PREVIEW_BULK)).body.data.run;
    await rig.call('POST', `/runs/${run.id}/apply`, { ifBookVersion: run.bookVersion, expectedCount: 2 });
    await rig.call('POST', `/runs/${run.id}/undo`, {});
    const withOptions = seen.filter((o) => o !== undefined);
    expect(withOptions.length).toBeGreaterThanOrEqual(3);
    expect(withOptions.some((o) => o?.timeout === 120000)).toBe(true);
    for (const opts of withOptions) {
      expect(typeof opts?.timeout).toBe('number');
      expect(opts?.timeout).toBeGreaterThanOrEqual(30000);
      expect(typeof opts?.maxWait).toBe('number');
      expect(opts?.maxWait).toBeGreaterThan(0);
    }
  });

  it('every handler the router needs exists, the list of names matches the factory, and the lazy export has the same names', () => {
    const made = createPriceBookHandlers({ db: createFakePriceBookDb(), env: {}, now: () => FAKE_NOW, resolveActor: async () => null, run: {}, lotDeps: () => ({ updateBulkLot: async () => undefined }) });
    expect(Object.keys(made).sort()).toEqual([...PRICE_BOOK_HANDLER_NAMES].sort());
    expect(Object.keys(priceBookHandlers).sort()).toEqual([...PRICE_BOOK_HANDLER_NAMES].sort());
    for (const name of PRICE_BOOK_HANDLER_NAMES) expect(typeof (made as any)[name]).toBe('function');
  });

  it('the controller and the routes do not import the database client or any heavy helper at load time', () => {
    for (const file of ['../controllers/priceBookController.ts', '../routes/priceBook.ts']) {
      const text = fs.readFileSync(path.join(__dirname, file), 'utf8');
      const topImports = text.split('\n').filter((l) => /^import\b/.test(l) || /^const .* = require\(/.test(l));
      for (const line of topImports) {
        expect(line).not.toMatch(/lib\/prisma|@prisma\/client|posAuth|bulkLotService|cardCatalogLookup|ebayItemPushService|shopifyService|liveFeedService|lib\/socket/);
      }
    }
  });

  it('the production dependencies are built from the real helpers: the client once, the organizer bound to the lot price edit, the card minimum', async () => {
    jest.clearAllMocks();
    mockPos.resolveOrganizerOrTeamMember.mockResolvedValue({ id: ORG });
    mockBulk.updateBulkLot.mockResolvedValue({ ok: true });
    const deps = buildProductionDeps();
    expect(deps.db).toBe(mockPrisma);
    expect(deps.env).toBe(process.env);
    expect(deps.now()).toBeInstanceOf(Date);
    expect(deps.run.minCardSaleCents).toBe(require('../utils/feeCalculator').MIN_CARD_SALE_CENTS);
    expect(typeof deps.run.onPriceChanged).toBe('function');
    expect(typeof deps.resolvePrintings).toBe('function');

    const req: any = { user: { id: 'u1' } };
    const res: any = {};
    await deps.resolveActor(req, res);
    expect(mockPos.resolveOrganizerOrTeamMember).toHaveBeenCalledWith(req, res, { requireStripe: false });

    await deps.lotDeps('orgZ').updateBulkLot('lot1', { pricePerThousand: 8 });
    expect(mockBulk.updateBulkLot).toHaveBeenCalledWith(mockPrisma, { organizerId: 'orgZ' }, 'lot1', { pricePerThousand: 8 });
  });

  it('resolves an intake batch for the shop only, and the catalog resolver reads the ready games and resolves through the catalog helper', async () => {
    jest.clearAllMocks();
    const deps = buildProductionDeps();
    const created = new Date('2026-10-01T00:00:00.000Z');
    mockPrisma.cardIntakeBatch.findFirst.mockResolvedValueOnce({ saleId: 's1', createdAt: created }).mockResolvedValueOnce(null);
    expect(await deps.run.resolveIntakeBatch?.(ORG, 'b1')).toEqual({ saleId: 's1', createdAt: created });
    expect(await deps.run.resolveIntakeBatch?.(ORG, 'b2')).toBeNull();
    expect(mockPrisma.cardIntakeBatch.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'b1', organizerId: ORG } }));

    mockLookup.loadCatalogState.mockResolvedValue({ readyGames: ['MTG'] });
    mockLookup.isCatalogGame.mockReturnValue(true);
    mockCatalogStore.getCatalogDb.mockReturnValue('catalog-db');
    mockLookup.resolveRefs.mockImplementation(async (refs: any[]) => refs.map((r) => ({ ref: r.ref, status: 'UNMATCHED', candidates: [] })));
    const out = await deps.resolvePrintings?.([{ ref: 'a', game: 'MTG', name: 'Card' }]);
    expect(out).toEqual([{ ref: 'a', status: 'UNMATCHED', candidates: [] }]);
    expect(mockLookup.resolveRefs).toHaveBeenCalledWith([expect.objectContaining({ ref: 'a', game: 'MTG', name: 'Card' })], 'catalog-db', process.env);
  });

  it('the production price change hook reaches the real helpers (eBay, alerts, Shopify, cache) with the arguments itemController uses', async () => {
    jest.clearAllMocks();
    mockPrisma.item.findUnique.mockResolvedValue({ id: 'i1', organizerId: ORG, saleId: 'sale1', title: 'Card', ebayOfferId: 'offer1', ebayListingId: 'l1', ebayCategoryId: 'c1', ebaySyncHeldAt: null, ebayContentDirtyAt: null });
    mockCategories.isPinnedCardCategoryId.mockReturnValue(true);
    mockCategories.standardEnvelopePriceCrossing.mockReturnValue(true);
    const io = { marker: true };
    mockSocket.getIO.mockReturnValue(io);
    const deps = buildProductionDeps();
    const hook = deps.run.onPriceChanged as unknown as ((c: unknown) => void) & { idle: () => Promise<void> };
    hook({ runId: 'r1', kind: 'APPLY', itemId: 'i1', organizerId: ORG, oldPriceCents: 2100, newPriceCents: 1900, oldPrice: 21, newPrice: 19, ebayListed: true });
    await hook.idle();
    expect(mockEbay.pushItemToEbay).toHaveBeenCalledWith({ itemId: 'i1', organizerId: ORG, trigger: 'SAVE', fields: ['price', 'shipping'], dirtyBefore: null });
    expect(mockAlerts.notifyPriceDropAlerts).toHaveBeenCalledWith('i1', 21, 19);
    expect(mockFeed.pushEvent).toHaveBeenCalledWith(io, 'sale1', expect.objectContaining({ type: 'PRICE_DROP', itemTitle: 'Card', amount: 19, saleId: 'sale1' }));
    expect(mockShopify.updateShopifyProductFields).toHaveBeenCalledWith('i1', { price: 19 });
    expect(mockCommand.invalidateCommandCenterCache).toHaveBeenCalledWith(ORG);
  });

  it('the lazy handlers build the production dependencies once, on first use, and answer 404 while the platform switch is off', async () => {
    jest.clearAllMocks();
    const saved = process.env.CARD_PRICE_BOOK_ENABLED;
    delete process.env.CARD_PRICE_BOOK_ENABLED;
    try {
      const sent: any[] = [];
      const res: any = { status: (s: number) => ((res.code = s), res), json: (b: unknown) => (sent.push([res.code, b]), res) };
      const next = jest.fn();
      priceBookHandlers.flagGate({} as any, res, next);
      priceBookHandlers.flagGate({} as any, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(sent).toHaveLength(2);
      expect(sent[0][0]).toBe(404);
      expect(sent[0][1]).toMatchObject({ success: false, code: 'PRICE_BOOK_DISABLED' });
    } finally {
      if (saved === undefined) delete process.env.CARD_PRICE_BOOK_ENABLED;
      else process.env.CARD_PRICE_BOOK_ENABLED = saved;
    }
  });
});

// ---------------------------------------------------------------------------------------------
// the views
// ---------------------------------------------------------------------------------------------

describe('apply and undo views', () => {
  it('applyView carries the flat fields and the same block in summary; undoView reports APPLYING while rows remain', () => {
    const a = applyView({ runId: 'r', status: 'APPLYING', applied: 5, appliedThisCall: 5, remaining: 2, changedSincePreview: 1, lockedSincePreview: 0, failed: 0, message: 'm' } as any);
    expect(a).toMatchObject({ runId: 'r', status: 'APPLYING', applied: 5, remaining: 2, changedSince: 1, changedSincePreview: 1, failed: 0 });
    expect(a.summary).toMatchObject({ status: 'APPLYING', changedSince: 1 });
    const u = undoView({ runId: 'r', status: 'UNDOING', undone: 3, undoneThisCall: 3, undoSkipped: 1, remaining: 4, message: 'm' } as any);
    expect(u).toMatchObject({ status: 'APPLYING', rawStatus: 'UNDOING', undone: 3, undoSkipped: 1, remaining: 4 });
    expect((undoView({ runId: 'r', status: 'UNDONE', undone: 7, undoneThisCall: 4, undoSkipped: 0, remaining: 0, message: 'm' } as any) as any).status).toBe('UNDONE');
  });
});
