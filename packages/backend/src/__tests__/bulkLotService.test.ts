/**
 * bulkLotService (ADR-136, roadmap #659). NOT executed when written (jest cannot run on the authoring device);
 * CI is the first real run. The database is an in-memory fake that models just what the service uses, including the
 * WHERE guards on updateMany (stockSold lte/gte/gt, status), so the guarded writes are exercised, not just called.
 *
 * Covers: strict input parsing, converting a card item into a lot (and every refusal), creating a lot item, restock
 * and set-total rules (never below sold), line planning (quantity, stock, price, PRICE_CHANGED), the protective
 * lookup (fail open flag off, fail closed flag on), releasing reserved cards, and the public view shape.
 */
import {
  BULK_LOT_MESSAGES,
  assertNoBulkLots,
  bulkChannelRefusal,
  createBulkLotItem,
  enableBulkLot,
  findBulkLotItemIds,
  getOrganizerLot,
  isBulkLotError,
  listOrganizerLots,
  parseCreateLotItem,
  parseEnableLot,
  parseUpdateLot,
  planBulkLine,
  quoteBulkLine,
  releaseBulkLotUnits,
  toBulkLotView,
  toOrganizerBulkLotView,
  toPublicBulkLotView,
  updateBulkLot,
} from '../services/bulkLot/bulkLotService';

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const v = row[key] ?? 0;
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('gte' in cond && !(v >= cond.gte)) return false;
      if ('gt' in cond && !(v > cond.gt)) return false;
      if ('isNot' in cond) return cond.isNot === null ? row[key] != null : true;
      if ('in' in cond) return cond.in.includes(row[key]);
      return true;
    }
    return row[key] === cond;
  });
}

function makeDb(rows: Record<string, Row>, lotItemIds: string[] = []) {
  const db: any = {
    rows,
    item: {
      findUnique: jest.fn(async ({ where }: any) => (rows[where.id] ? { ...rows[where.id] } : null)),
      findMany: jest.fn(async ({ where }: any) => Object.values(rows).filter((r) => matches(r, where ?? {})).map((r) => ({ ...r }))),
      create: jest.fn(async ({ data }: any) => {
        const { bulkLot, ...rest } = data;
        const row: Row = { id: 'new_1', ...rest, stockSold: 0, bulkLot: bulkLot?.create ? { game: bulkLot.create.game, lotKind: bulkLot.create.lotKind } : null };
        rows[row.id] = row;
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows[where.id];
        const { bulkLot, ...rest } = data;
        Object.assign(row, rest);
        if (bulkLot?.create) row.bulkLot = { game: bulkLot.create.game, lotKind: bulkLot.create.lotKind };
        if (bulkLot?.update) row.bulkLot = { ...(row.bulkLot ?? {}), ...bulkLot.update };
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hits = Object.values(rows).filter((r) => matches(r, where));
        for (const row of hits) {
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'decrement' in (v as any)) row[k] = row[k] - (v as any).decrement;
            else row[k] = v;
          }
        }
        return { count: hits.length };
      }),
    },
    itemBulkLot: {
      findMany: jest.fn(async ({ where }: any) => lotItemIds.filter((id) => where.itemId.in.includes(id)).map((itemId) => ({ itemId }))),
    },
  };
  return db;
}

const cardItem = (over: Row = {}): Row => ({
  id: 'i1',
  organizerId: 'org_1',
  saleId: 'sale_1',
  title: 'Commons',
  description: null,
  price: null,
  status: 'AVAILABLE',
  isActive: true,
  draftStatus: 'PUBLISHED',
  listingType: 'FIXED',
  stockTotal: 1,
  stockSold: 0,
  ebayListingId: null,
  ebayOfferId: null,
  photoUrls: [],
  card: { id: 'c1' },
  bulkLot: null,
  ...over,
});

const lotItem = (over: Row = {}): Row =>
  cardItem({ price: 8, stockTotal: 4200, stockSold: 0, bulkLot: { game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' }, ...over });

const ctx = { organizerId: 'org_1' };

async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    if (typeof p === 'function') p();
    else await p;
  } catch (err) {
    expect(isBulkLotError(err)).toBe(true);
    return (err as any).code;
  }
  throw new Error('expected a BulkLotError');
}

describe('strict input parsing', () => {
  it('accepts a good lot and fills nothing else', () => {
    expect(parseEnableLot({ totalCards: 4200, pricePerThousand: 8 })).toEqual({ totalCards: 4200, pricePerThousand: 8 });
  });
  it('rejects an unknown key instead of ignoring it (stockSold is server owned)', async () => {
    expect(await codeOf(() => parseEnableLot({ totalCards: 4200, pricePerThousand: 8, stockSold: 5 }))).toBe('BULK_VALIDATION');
    expect(await codeOf(() => parseEnableLot({ totalCards: 4200, pricePerThousand: 8, organizerId: 'x' }))).toBe('BULK_VALIDATION');
  });
  it('rejects a lot of fewer than 2 cards, a fractional count and a count above 1,000,000', async () => {
    for (const totalCards of [1, 0, -5, 2.5, 1_000_001, '4200']) {
      expect(await codeOf(() => parseEnableLot({ totalCards, pricePerThousand: 8 }))).toBe('BULK_VALIDATION');
    }
  });
  it('rejects a zero, negative or non-numeric price per 1,000', async () => {
    for (const pricePerThousand of [0, -1, '8', null, Number.NaN, 0.004]) {
      expect(await codeOf(() => parseEnableLot({ totalCards: 100, pricePerThousand }))).toBe('BULK_VALIDATION');
    }
  });
  it('rejects a lot type that is not in the vocabulary', async () => {
    expect(await codeOf(() => parseEnableLot({ totalCards: 100, pricePerThousand: 8, lotKind: 'WHATEVER' }))).toBe('BULK_VALIDATION');
    expect(parseEnableLot({ totalCards: 100, pricePerThousand: 8, lotKind: 'BULK_LAND' }).lotKind).toBe('BULK_LAND');
  });
  it('create needs a name of 1 to 80 characters', async () => {
    expect(await codeOf(() => parseCreateLotItem({ title: '   ', totalCards: 10, pricePerThousand: 5 }))).toBe('BULK_VALIDATION');
    expect(await codeOf(() => parseCreateLotItem({ title: 'x'.repeat(81), totalCards: 10, pricePerThousand: 5 }))).toBe('BULK_VALIDATION');
    expect(parseCreateLotItem({ title: '  Bulk  ', totalCards: 10, pricePerThousand: 5 }).title).toBe('Bulk');
  });
  it('update needs a change, and the total and add-cards cannot both be set', async () => {
    expect(await codeOf(() => parseUpdateLot({}))).toBe('BULK_VALIDATION');
    expect(await codeOf(() => parseUpdateLot({ totalCards: 100, addCards: 5 }))).toBe('BULK_VALIDATION');
    expect(parseUpdateLot({ addCards: 5 })).toEqual({ addCards: 5 });
  });
});

describe('enableBulkLot: turn a card item into a lot', () => {
  it('sets stock, price per 1,000 (dollars), the marker row and DONT_LIST in one write', async () => {
    const db = makeDb({ i1: cardItem() });
    const view = await enableBulkLot(db, ctx, 'i1', { totalCards: 4200, pricePerThousand: 8 });
    const data = db.item.update.mock.calls[0][0].data;
    expect(data.stockTotal).toBe(4200);
    expect(data.price).toBe(8);
    expect(data.ebayShippingOverride).toBe('DONT_LIST');
    expect(data.bulkLot.create).toEqual({ organizerId: 'org_1', game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' });
    expect(view).toMatchObject({ itemId: 'i1', totalCards: 4200, remainingCards: 4200, pricePerThousandCents: 800, soldOut: false });
  });

  it("treats another organizer's item exactly like a missing one", async () => {
    const db = makeDb({ i1: cardItem({ organizerId: 'org_2' }) });
    expect(await codeOf(enableBulkLot(db, ctx, 'i1', { totalCards: 100, pricePerThousand: 8 }))).toBe('BULK_NOT_FOUND');
    expect(await codeOf(enableBulkLot(db, ctx, 'nope', { totalCards: 100, pricePerThousand: 8 }))).toBe('BULK_NOT_FOUND');
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it.each([
    ['already a lot', { bulkLot: { id: 'b1' } }, 'BULK_ALREADY_LOT'],
    ['no card record', { card: null }, 'BULK_NOT_ELIGIBLE'],
    ['already has sales', { stockSold: 1 }, 'BULK_HAS_SALES'],
    ['not available', { status: 'SOLD' }, 'BULK_NOT_ELIGIBLE'],
    ['an auction', { listingType: 'AUCTION' }, 'BULK_NOT_ELIGIBLE'],
    ['listed on eBay', { ebayListingId: 'L1' }, 'BULK_NOT_ELIGIBLE'],
    ['has an eBay offer', { ebayOfferId: 'O1' }, 'BULK_NOT_ELIGIBLE'],
  ])('refuses an item that is %s', async (_name, over, code) => {
    const db = makeDb({ i1: cardItem(over as Row) });
    expect(await codeOf(enableBulkLot(db, ctx, 'i1', { totalCards: 100, pricePerThousand: 8 }))).toBe(code);
    expect(db.item.update).not.toHaveBeenCalled();
  });
});

describe('createBulkLotItem', () => {
  it('creates a published, fixed price, never-listed-on-eBay item owned by the sale organizer', async () => {
    const db = makeDb({});
    const view = await createBulkLotItem(db, { organizerId: 'org_1', saleId: 'sale_1' }, { title: 'Mixed bulk', totalCards: 10000, pricePerThousand: 5.5, lotKind: 'BULK_MIXED' });
    const data = db.item.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      saleId: 'sale_1',
      organizerId: 'org_1',
      title: 'Mixed bulk',
      price: 5.5,
      status: 'AVAILABLE',
      draftStatus: 'PUBLISHED',
      listingType: 'FIXED',
      stockTotal: 10000,
      ebayShippingOverride: 'DONT_LIST',
    });
    expect(data.embedding).toEqual([]);
    expect(data.bulkLot.create.lotKind).toBe('BULK_MIXED');
    expect(view.pricePerThousandCents).toBe(550);
    expect(view.lotKindLabel).toBe('Mixed bulk');
  });
  it('rejects an unknown key', async () => {
    expect(await codeOf(createBulkLotItem(makeDb({}), { organizerId: 'org_1', saleId: 's' }, { title: 'x', totalCards: 10, pricePerThousand: 5, status: 'SOLD' }))).toBe('BULK_VALIDATION');
  });
});

describe('updateBulkLot: restock, total and price', () => {
  it('a restock adds to the total and puts a sold-out lot back on sale', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 4200, stockSold: 4200, status: 'SOLD' }) });
    const view = await updateBulkLot(db, ctx, 'i1', { addCards: 1000 });
    expect(db.rows.i1.stockTotal).toBe(5200);
    expect(db.rows.i1.status).toBe('AVAILABLE');
    expect(view.remainingCards).toBe(1000);
    expect(view.soldOut).toBe(false);
  });
  it('refuses a total below the cards already sold, and changes nothing', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 4200, stockSold: 3000 }) });
    expect(await codeOf(updateBulkLot(db, ctx, 'i1', { totalCards: 2999 }))).toBe('BULK_TOTAL_BELOW_SOLD');
    expect(db.rows.i1.stockTotal).toBe(4200);
    const ok = await updateBulkLot(db, ctx, 'i1', { totalCards: 3000 });
    expect(ok.remainingCards).toBe(0);
  });
  it('the guard is in the write: a sale landing after our read still cannot push the total below sold', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 4200, stockSold: 0 }) });
    const realFind = db.item.findUnique;
    db.item.findUnique = jest.fn(async (args: any) => {
      const row = await realFind(args);
      db.rows.i1.stockSold = 4000; // a register sale lands right after the service read the row
      return row;
    });
    expect(await codeOf(updateBulkLot(db, ctx, 'i1', { totalCards: 100 }))).toBe('BULK_TOTAL_BELOW_SOLD');
    expect(db.rows.i1.stockTotal).toBe(4200);
  });
  it('changes the price per 1,000 and the lot type', async () => {
    const db = makeDb({ i1: lotItem() });
    const view = await updateBulkLot(db, ctx, 'i1', { pricePerThousand: 9.25, lotKind: 'BULK_COMMON' });
    expect(db.rows.i1.price).toBe(9.25);
    expect(view.pricePerThousandCents).toBe(925);
    expect(view.lotKind).toBe('BULK_COMMON');
  });
  it('is refused for an item that is not a lot, and for another organizer', async () => {
    expect(await codeOf(updateBulkLot(makeDb({ i1: cardItem() }), ctx, 'i1', { addCards: 5 }))).toBe('BULK_NOT_LOT');
    expect(await codeOf(updateBulkLot(makeDb({ i1: lotItem({ organizerId: 'org_2' }) }), ctx, 'i1', { addCards: 5 }))).toBe('BULK_NOT_FOUND');
  });
});

describe('planBulkLine: one register line', () => {
  const row = (over: Row = {}) => ({ price: 8, status: 'AVAILABLE', stockTotal: 4200, stockSold: 0, ...over });

  it('prices 1,500 of 4,200 at $8.00 per 1,000 as $12.00', () => {
    expect(planBulkLine(row(), 1500, 12)).toEqual({ cards: 1500, cents: 1200, pricePerThousandCents: 800 });
    expect(planBulkLine(row(), '1,500', null).cents).toBe(1200);
  });
  it('allows exactly the cards that are left, and refuses one more', () => {
    expect(planBulkLine(row({ stockSold: 1200 }), 3000, null).cents).toBe(2400);
    expect(() => planBulkLine(row({ stockSold: 1200 }), 3001, null)).toThrow(BULK_LOT_MESSAGES.INSUFFICIENT_STOCK);
  });
  it('refuses zero, negative, fractional and non-numeric quantities', async () => {
    for (const q of [0, -3, 1.5, 'abc', '', null, undefined, true]) {
      expect(await codeOf(() => planBulkLine(row(), q, null))).toBe('BAD_QUANTITY');
    }
  });
  it('refuses a lot that is sold out or not available', async () => {
    expect(await codeOf(() => planBulkLine(row({ status: 'SOLD' }), 10, null))).toBe('NOT_AVAILABLE');
    expect(await codeOf(() => planBulkLine(row({ stockSold: 4200 }), 10, null))).toBe('NOT_AVAILABLE');
  });
  it('refuses a lot with no usable price', async () => {
    expect(await codeOf(() => planBulkLine(row({ price: null }), 10, null))).toBe('BAD_PRICE');
    expect(await codeOf(() => planBulkLine(row({ price: 0 }), 10, null))).toBe('BAD_PRICE');
  });
  it('refuses a line that rounds to zero cents', async () => {
    expect(await codeOf(() => planBulkLine(row({ price: 0.01 }), 100, null))).toBe('QUANTITY_TOO_SMALL');
  });
  it('refuses PRICE_CHANGED when the displayed total is off by even one cent', async () => {
    expect(await codeOf(() => planBulkLine(row(), 1500, 12.01))).toBe('PRICE_CHANGED');
    expect(await codeOf(() => planBulkLine(row(), 1500, 11.99))).toBe('PRICE_CHANGED');
    expect(await codeOf(() => planBulkLine(row(), 1500, Number.NaN))).toBe('PRICE_CHANGED');
  });
});

describe('quoteBulkLine and the organizer reads', () => {
  it('quotes for the right organizer only and never reserves stock', async () => {
    const db = makeDb({ i1: lotItem() });
    expect(await quoteBulkLine(db, ctx, 'i1', 1500)).toEqual({ itemId: 'i1', cards: 1500, cents: 1200, amount: 12, remainingCards: 4200 });
    expect(db.item.updateMany).not.toHaveBeenCalled();
    expect(await codeOf(quoteBulkLine(db, { organizerId: 'org_9' }, 'i1', 10))).toBe('BULK_NOT_FOUND');
    expect(await codeOf(quoteBulkLine(makeDb({ i1: cardItem() }), ctx, 'i1', 10))).toBe('BULK_NOT_LOT');
  });
  it('getOrganizerLot answers null for a non-lot or someone else item', async () => {
    const db = makeDb({ i1: lotItem(), i2: cardItem(), i3: lotItem({ organizerId: 'org_2' }) });
    expect((await getOrganizerLot(db, ctx, 'i1'))?.itemId).toBe('i1');
    expect(await getOrganizerLot(db, ctx, 'i2')).toBeNull();
    expect(await getOrganizerLot(db, ctx, 'i3')).toBeNull();
  });
  it('listOrganizerLots scopes the query to the sale and the organizer', async () => {
    const db = makeDb({ i1: lotItem(), i2: cardItem() });
    await listOrganizerLots(db, { organizerId: 'org_1', saleId: 'sale_1' });
    expect(db.item.findMany.mock.calls[0][0].where).toEqual({ saleId: 'sale_1', organizerId: 'org_1', bulkLot: { isNot: null } });
  });
});

describe('findBulkLotItemIds and the channel refusal', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('returns only the lots, and runs no query for an empty list', async () => {
    const db = makeDb({}, ['a', 'c']);
    expect(Array.from(await findBulkLotItemIds(db, ['a', 'b', 'c', null, undefined, 'a'], false)).sort()).toEqual(['a', 'c']);
    expect(db.itemBulkLot.findMany).toHaveBeenCalledTimes(1);
    expect((await findBulkLotItemIds(db, [], true)).size).toBe(0);
    expect(db.itemBulkLot.findMany).toHaveBeenCalledTimes(1);
  });
  it('fails OPEN when the flag is off and the lookup throws (a missing table cannot break any sale path)', async () => {
    const db: any = { itemBulkLot: { findMany: jest.fn().mockRejectedValue(new Error('relation does not exist')) } };
    expect((await findBulkLotItemIds(db, ['a'], false)).size).toBe(0);
    expect(await bulkChannelRefusal(db, ['a'], false)).toBeNull();
  });
  it('fails CLOSED when the flag is on and the lookup throws', async () => {
    const db: any = { itemBulkLot: { findMany: jest.fn().mockRejectedValue(new Error('db down')) } };
    expect(await codeOf(findBulkLotItemIds(db, ['a'], true))).toBe('BULK_CHECK_FAILED');
    expect(await bulkChannelRefusal(db, ['a'], true)).toMatchObject({ status: 503, code: 'BULK_CHECK_FAILED' });
  });
  it('a database that has no bulk lot table at all (an old test double) counts as no lots when the flag is off', async () => {
    expect((await findBulkLotItemIds({} as any, ['a'], false)).size).toBe(0);
  });
  it('refuses any channel that cannot sell lots, with or without the flag', async () => {
    const db = makeDb({}, ['lot1']);
    expect(await codeOf(assertNoBulkLots(db, ['x', 'lot1'], false))).toBe('BULK_CHANNEL_UNSUPPORTED');
    expect(await bulkChannelRefusal(db, ['lot1'], true)).toEqual({ status: 409, message: BULK_LOT_MESSAGES.BULK_CHANNEL_UNSUPPORTED, code: 'BULK_CHANNEL_UNSUPPORTED' });
    expect(await bulkChannelRefusal(db, ['x', 'y'], true)).toBeNull();
  });
});

describe('releaseBulkLotUnits: give reserved cards back', () => {
  it('restores stock and puts a SOLD lot back on sale', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 4200, stockSold: 4200, status: 'SOLD' }) });
    await releaseBulkLotUnits(db, 'i1', 1500);
    expect(db.rows.i1.stockSold).toBe(2700);
    expect(db.rows.i1.status).toBe('AVAILABLE');
  });
  it('never takes stockSold below zero', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 4200, stockSold: 100 }) });
    await releaseBulkLotUnits(db, 'i1', 1500);
    expect(db.rows.i1.stockSold).toBe(0);
  });
  it('does nothing for a non-positive or fractional count', async () => {
    const db = makeDb({ i1: lotItem({ stockSold: 100 }) });
    await releaseBulkLotUnits(db, 'i1', 0);
    await releaseBulkLotUnits(db, 'i1', 2.5);
    expect(db.item.updateMany).not.toHaveBeenCalled();
    expect(db.rows.i1.stockSold).toBe(100);
  });
  it('a lot whose cards are all returned is on sale again', async () => {
    const db = makeDb({ i1: lotItem({ stockTotal: 10, stockSold: 10, status: 'SOLD' }) });
    await releaseBulkLotUnits(db, 'i1', 10);
    expect(db.rows.i1.status).toBe('AVAILABLE');
    expect(db.rows.i1.stockSold).toBe(0);
  });
});

describe('views', () => {
  it('a public view never carries the organizer id or the sold count fields of the organizer view', () => {
    const view = toBulkLotView(lotItem({ stockSold: 1500 }) as any);
    expect(Object.keys(view)).not.toContain('organizerId');
    expect(Object.keys(view)).not.toContain('status');
    expect(view).toMatchObject({
      pricePerThousandCents: 800,
      pricePerThousandLabel: '$8.00 per 1,000 cards',
      perCardLabel: '$0.008 per card',
      remainingCards: 2700,
      remainingLabel: '2,700 cards available',
      soldOut: false,
      available: true,
    });
    expect(view.ladder.map((r) => r.cardsLabel)).toEqual(['100', '500', '1,000', '2,500', '2,700']);
    expect(view.ladder[view.ladder.length - 1]).toMatchObject({ isAll: true, priceLabel: '$21.60' });
  });
  it('the public view drops the total and sold counts but keeps the cards available and the price list', () => {
    const view = toPublicBulkLotView(lotItem({ stockSold: 1500 }) as any);
    const keys = Object.keys(view);
    expect(keys).not.toContain('totalCards');
    expect(keys).not.toContain('soldCards');
    expect(keys).not.toContain('organizerId');
    expect(keys).not.toContain('status');
    expect(view).toMatchObject({ remainingCards: 2700, remainingLabel: '2,700 cards available', pricePerThousandCents: 800, available: true });
    expect(view.ladder.length).toBe(5);
  });
  it('a sold out lot has no price list and says so', () => {
    const view = toBulkLotView(lotItem({ stockSold: 4200, status: 'SOLD' }) as any);
    expect(view).toMatchObject({ soldOut: true, available: false, remainingLabel: 'Sold out', remainingCards: 0 });
    expect(view.ladder).toEqual([]);
  });
  it('a lot with no price shows no price and is not available', () => {
    const view = toBulkLotView(lotItem({ price: null }) as any);
    expect(view.pricePerThousandLabel).toBeNull();
    expect(view.available).toBe(false);
    expect(view.ladder).toEqual([]);
  });
  it('the organizer view adds status and visibility', () => {
    expect(toOrganizerBulkLotView(lotItem({ isActive: false, draftStatus: 'DRAFT' }) as any)).toMatchObject({ status: 'AVAILABLE', isActive: false, draftStatus: 'DRAFT' });
  });
});

describe('copy', () => {
  it('server wording has no "AI", no "estate sale", no dashes and ends each sentence plainly', () => {
    for (const text of Object.values(BULK_LOT_MESSAGES)) {
      expect(text).toBe(text.trim());
      expect(/\bAI\b/.test(text)).toBe(false);
      expect(/estate\s*sale/i.test(text)).toBe(false);
      expect(text.includes('—')).toBe(false);
      expect(text.includes('–')).toBe(false);
      expect(/[.]$/.test(text)).toBe(true);
    }
  });
});
