/**
 * /api/item-cards routes (ADR-134 #640, batch B2). NOT executed when written (jest cannot run on the
 * authoring device); CI is the first real run. The router is mounted on a test Express app; auth is
 * stubbed (x-test-user header) and the Prisma client is an in-memory fake. Nothing here touches a
 * database or a network.
 *
 * Covers ADR-134 section 12 B2 acceptance:
 *   (1) unknown key in the card -> 400 CARD_VALIDATION       (2) another organizer's item -> 404
 *   (3) PUT twice with the same data -> same dedupKey         (4) apply-printing keeps lockedFields
 *   (5) graded + conditionCode rejected                       (7) responses never expose dedupKey/organizerId
 */
import express from 'express';
import type { AddressInfo } from 'net';
import { makeFakeCardDb, printingRow } from './__fixtures__/fakeCardDb';

const mockDb: any = makeFakeCardDb({
  items: [
    // Owned by user u1 (organizer org1) through a sale.
    { id: 'item_mine', organizerId: 'org1', saleId: 'sale1', sale: { organizerId: 'org1', organizer: { userId: 'u1' } } },
    // Owned by user u2 (organizer org2).
    { id: 'item_theirs', organizerId: 'org2', saleId: 'sale2', sale: { organizerId: 'org2', organizer: { userId: 'u2' } } },
    // Inventory item (no sale) owned by u1 through the denormalized organizerId.
    { id: 'item_inventory', organizerId: 'org1', saleId: null, sale: null },
  ],
  organizers: [{ id: 'org1', userId: 'u1' }, { id: 'org2', userId: 'u2' }],
  printings: [printingRow()],
});

jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
}));
jest.mock('../lib/prisma', () => ({ prisma: mockDb }));

// Required AFTER the mocks above.
const router = require('../routes/itemCard').default;

const organizerU1 = { id: 'u1', roles: ['ORGANIZER'] };
const shopper = { id: 'u3', roles: ['USER'] };

async function call(method: string, path: string, user: any, body?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/item-cards', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}/api/item-cards${path}`, {
      method,
      headers,
      body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

beforeEach(() => {
  mockDb.cards.clear();
  mockDb.calls.cardCreate = 0;
  mockDb.calls.cardUpdate = 0;
});

describe('access', () => {
  it('requires a login', async () => {
    const res = await call('GET', '/item_mine', null);
    expect(res.status).toBe(401);
  });

  it('requires the ORGANIZER role', async () => {
    const res = await call('GET', '/item_mine', shopper);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('an item that does not exist is a 404', async () => {
    const res = await call('GET', '/no_such_item', organizerU1);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ITEM_NOT_FOUND');
  });
});

describe('(2) another organizer item returns 404 on every route and writes nothing', () => {
  it('GET', async () => {
    const res = await call('GET', '/item_theirs', organizerU1);
    expect(res.status).toBe(404);
  });

  it('PUT', async () => {
    const res = await call('PUT', '/item_theirs', organizerU1, { game: 'MTG' });
    expect(res.status).toBe(404);
    expect(mockDb.cards.size).toBe(0);
  });

  it('POST apply-printing', async () => {
    const res = await call('POST', '/item_theirs/apply-printing', organizerU1, { printingId: 'SCRYFALL:aaaa-bbbb' });
    expect(res.status).toBe(404);
    expect(mockDb.cards.size).toBe(0);
  });

  it('does not leak whether the card exists: a stored card on their item is invisible', async () => {
    mockDb.cards.set('item_theirs', { id: 'c9', itemId: 'item_theirs', organizerId: 'org2', game: 'MTG', dedupKey: 'x', lockedFields: [] });
    const res = await call('GET', '/item_theirs', organizerU1);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/MTG/);
  });
});

describe('GET', () => {
  it('returns data: null for an item without a card', async () => {
    const res = await call('GET', '/item_mine', organizerU1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('returns the owner shape (lockedFields included) without dedupKey, organizerId or itemId', async () => {
    await call('PUT', '/item_mine', organizerU1, { game: 'MTG', cardName: 'Bolt' });
    const res = await call('GET', '/item_mine', organizerU1);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ game: 'MTG', cardName: 'Bolt', lockedFields: ['game', 'cardName'] });
    expect(res.body.data).not.toHaveProperty('dedupKey');
    expect(res.body.data).not.toHaveProperty('organizerId');
    expect(res.body.data).not.toHaveProperty('itemId');
  });
});

describe('PUT', () => {
  it('(1) an unknown key returns 400 CARD_VALIDATION and writes nothing', async () => {
    const res = await call('PUT', '/item_mine', organizerU1, { game: 'MTG', bogus: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(res.body.error).toMatch(/bogus/);
    expect(mockDb.cards.size).toBe(0);
  });

  it.each(['lockedFields', 'dedupKey', 'organizerId', 'itemId', 'catalogPrintingId'])(
    'mass assignment: %s from the client is a 400, never written',
    async (key) => {
      const value = key === 'lockedFields' ? ['game'] : 'x';
      const res = await call('PUT', '/item_mine', organizerU1, { game: 'MTG', [key]: value });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CARD_VALIDATION');
      expect(mockDb.cards.size).toBe(0);
    }
  );

  it('creates the card with a server-computed dedupKey and server-set organizerId', async () => {
    const res = await call('PUT', '/item_mine', organizerU1, {
      game: 'MTG', cardName: 'Lightning Bolt', setCode: 'LEA', collectorNumber: '161', language: 'en', finish: 'NONFOIL', conditionCode: 'NM', releaseYear: 1993,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ game: 'MTG', setCode: 'lea', conditionCode: 'NM', releaseYear: 1993 });
    const stored = mockDb.cards.get('item_mine');
    expect(stored.dedupKey).toMatch(/^[0-9a-f]{40}$/);
    expect(stored.organizerId).toBe('org1');
    expect(stored.itemId).toBe('item_mine');
  });

  it('an inventory item (no sale) is writable by its denormalized organizer', async () => {
    const res = await call('PUT', '/item_inventory', organizerU1, { game: 'POKEMON' });
    expect(res.status).toBe(200);
    expect(mockDb.cards.get('item_inventory').organizerId).toBe('org1');
  });

  it('(3) PUT twice with the same data gives the same dedupKey', async () => {
    const body = { game: 'MTG', cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161', conditionCode: 'LP', finish: 'FOIL' };
    expect((await call('PUT', '/item_mine', organizerU1, body)).status).toBe(200);
    const first = mockDb.cards.get('item_mine').dedupKey;
    expect((await call('PUT', '/item_mine', organizerU1, body)).status).toBe(200);
    expect(mockDb.cards.get('item_mine').dedupKey).toBe(first);
    expect(mockDb.cards.size).toBe(1);
  });

  it('(5) graded plus conditionCode is rejected with 400 CARD_VALIDATION', async () => {
    const res = await call('PUT', '/item_mine', organizerU1, { game: 'POKEMON', grader: 'PSA', grade: '10', conditionCode: 'NM' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(res.body.issues[0].path).toBe('conditionCode');
    expect(mockDb.cards.size).toBe(0);
    const ok = await call('PUT', '/item_mine', organizerU1, { game: 'POKEMON', grader: 'PSA', grade: '10', certNumber: '123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.conditionCode).toBeNull();
  });

  it('rejects out-of-range releaseYear and a missing game on first save', async () => {
    expect((await call('PUT', '/item_mine', organizerU1, { game: 'MTG', releaseYear: 1899 })).status).toBe(400);
    expect((await call('PUT', '/item_mine', organizerU1, { game: 'MTG', releaseYear: 2101 })).status).toBe(400);
    expect((await call('PUT', '/item_mine', organizerU1, { cardName: 'Bolt' })).status).toBe(400);
    expect((await call('PUT', '/item_mine', organizerU1, undefined)).status).toBe(400);
    expect(mockDb.cards.size).toBe(0);
  });
});

describe('POST apply-printing', () => {
  it('(4) a field in lockedFields is not overwritten', async () => {
    await call('PUT', '/item_mine', organizerU1, { game: 'MTG', cardName: 'My Typed Name' });
    const res = await call('POST', '/item_mine/apply-printing', organizerU1, { printingId: 'SCRYFALL:aaaa-bbbb' });
    expect(res.status).toBe(200);
    expect(res.body.data.cardName).toBe('My Typed Name');
    expect(res.body.data.setCode).toBe('lea');
    expect(res.body.data.catalogPrintingId).toBe('SCRYFALL:aaaa-bbbb');
    expect(res.body.data.lockedFields).toEqual(['game', 'cardName']);
    expect(res.body.data).not.toHaveProperty('dedupKey');
    expect(mockDb.cards.get('item_mine').cardName).toBe('My Typed Name');
  });

  it('resetFields hands a locked field back to the catalog', async () => {
    await call('PUT', '/item_mine', organizerU1, { game: 'MTG', cardName: 'My Typed Name' });
    const res = await call('POST', '/item_mine/apply-printing', organizerU1, { printingId: 'SCRYFALL:aaaa-bbbb', resetFields: ['cardName'] });
    expect(res.status).toBe(200);
    expect(res.body.data.cardName).toBe('Lightning Bolt');
    expect(res.body.data.lockedFields).toEqual(['game']);
  });

  it('unknown body keys are a 400, an unknown printing is a 404 CARD_NOT_FOUND', async () => {
    const bad = await call('POST', '/item_mine/apply-printing', organizerU1, { printingId: 'SCRYFALL:aaaa-bbbb', price: 5 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('CARD_VALIDATION');
    const missing = await call('POST', '/item_mine/apply-printing', organizerU1, { printingId: 'SCRYFALL:nope' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CARD_NOT_FOUND');
    expect(mockDb.cards.size).toBe(0);
  });
});
