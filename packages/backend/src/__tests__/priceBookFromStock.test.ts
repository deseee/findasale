/**
 * ADR-140 AT-21 and section 5.4: "Use my current prices" (referenceService.referencesFromStock).
 */
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook, seedCardItem, seedItem, seedPrinting, seedReference } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { referencesFromStock } from '../services/priceBook/referenceService';
import { suggest } from '../services/priceBook/suggestService';

const A = 'orgA';
const B = 'orgB';

function shop() {
  const db = createFakePriceBookDb();
  seedPrinting(db, { id: 'SCRYFALL:p1', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', rarity: 'common', finishes: ['NONFOIL', 'FOIL'] });
  seedPrinting(db, { id: 'SCRYFALL:p2', name: 'Sol Ring', setCode: 'c21', collectorNumber: '263', rarity: 'uncommon', finishes: ['NONFOIL'] });
  return db;
}

function stock(db: FakeDb, price: number | null, card: AnyRow = {}, item: AnyRow = {}, org = A) {
  return seedCardItem(db, org, { price, ...item }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt', ...card });
}

const refs = (db: FakeDb) => db.select('priceBookReference');

describe('from stock: what it creates', () => {
  test('creates a Near Mint equivalent reference for each priced card, with the standard note and the clock\'s date', async () => {
    const db = shop();
    stock(db, 9, { conditionCode: 'LP' }); // 9.00 / 0.90 = 10.00
    stock(db, 5, { catalogPrintingId: 'SCRYFALL:p2', cardName: 'Sol Ring', conditionCode: 'NM' });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out).toMatchObject({ considered: 2, created: 2, updated: 0 });
    const rows = refs(db);
    const bolt = rows.find((r) => r.cardKey === 'p:SCRYFALL:p1');
    expect(bolt).toMatchObject({ valueCents: 1000, finish: 'NONFOIL', language: 'en', game: 'MTG', catalogPrintingId: 'SCRYFALL:p1', enteredByUserId: 'user_orgA' });
    expect(String(bolt?.note)).toMatch(/^From my stock on /);
    expect((bolt?.asOf as Date).getTime()).toBe(FAKE_NOW.getTime());
    expect(rows.find((r) => r.cardKey === 'p:SCRYFALL:p2')?.valueCents).toBe(500);
  });

  test('rounds the Near Mint equivalent half up', async () => {
    const db = shop();
    stock(db, 10.01, { conditionCode: 'LP' }); // 1001 / 0.9 = 1112.22
    stock(db, 10.04, { conditionCode: 'LP', finish: 'FOIL' }); // 1004 / 0.9 = 1115.55 -> 1116
    await referencesFromStock(makeCtx(db, A), {});
    const byFinish = new Map(refs(db).map((r) => [r.finish, r.valueCents]));
    expect(byFinish.get('NONFOIL')).toBe(1112);
    expect(byFinish.get('FOIL')).toBe(1116);
  });

  test('a card with no condition is read as Near Mint; the multipliers are the book\'s own', async () => {
    const db = shop();
    seedBook(db, A, { condLpBps: 8000 });
    stock(db, 8, { conditionCode: 'LP' });
    stock(db, 7, { conditionCode: null, finish: 'FOIL' });
    await referencesFromStock(makeCtx(db, A), {});
    const byFinish = new Map(refs(db).map((r) => [r.finish, r.valueCents]));
    expect(byFinish.get('NONFOIL')).toBe(1000);
    expect(byFinish.get('FOIL')).toBe(700);
  });

  test('typed cards (no catalog printing) get a typed key; the language is kept', async () => {
    const db = shop();
    stock(db, 20, { catalogPrintingId: null, game: 'POKEMON', setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', finish: 'HOLO', language: 'ja' });
    await referencesFromStock(makeCtx(db, A), {});
    const row = refs(db)[0];
    expect(row).toMatchObject({ cardKey: 's:base1|4|charizard|', game: 'POKEMON', finish: 'HOLO', language: 'ja', valueCents: 2000, catalogPrintingId: null });
  });

  test('creates the book when there is none, and never bumps its version', async () => {
    const db = shop();
    stock(db, 5);
    await referencesFromStock(makeCtx(db, A), {});
    const books = db.select('priceBook', { organizerId: A });
    expect(books).toHaveLength(1);
    expect(books[0]?.version).toBe(1);
    stock(db, 6, { finish: 'FOIL' });
    await referencesFromStock(makeCtx(db, A), {});
    expect(db.select('priceBook', { organizerId: A })[0]?.version).toBe(1);
  });

  test('the first reprice at 100 percent reproduces the shop\'s own prices', async () => {
    const db = shop();
    const { item } = stock(db, 9, { conditionCode: 'LP' });
    stock(db, 3.5, { conditionCode: 'NM', finish: 'FOIL' });
    await referencesFromStock(makeCtx(db, A), {});
    const out = await suggest(makeCtx(db, A), [{ itemId: item.id as string }], { family: 'RETAIL' });
    const s = out.results[0]?.suggestion;
    expect(s?.ok).toBe(true);
    expect(s?.priceSource).toBe('MANUAL');
    expect(s?.priceCents).toBe(900);
    expect(s?.unchanged).toBe(true);
  });
});

describe('from stock: what it skips (and counts)', () => {
  test('unpriced, graded, lot, not for sale, not a single, no finish', async () => {
    const db = shop();
    stock(db, 5); // the one good card
    stock(db, null, { finish: 'FOIL' });
    stock(db, 0, { finish: 'ETCHED' });
    stock(db, 5, { grader: 'PSA' });
    const lot = stock(db, 5, { game: 'MTG' });
    db.insert('itemBulkLot', { itemId: lot.item.id, organizerId: A, lotKind: 'BULK_COMMON' });
    stock(db, 5, {}, { status: 'SOLD' });
    stock(db, 5, {}, { listingType: 'AUCTION' });
    stock(db, 5, { productType: 'SEALED' });
    stock(db, 5, { finish: null });
    stock(db, 5, { finish: 'SHINY' });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out.created).toBe(1);
    expect(out.skipped).toMatchObject({ noPrice: 2, graded: 1, lot: 1, notForSale: 2, notCard: 1, noFinish: 2 });
    expect(out.considered).toBe(10);
    expect(refs(db)).toHaveLength(1);
  });

  test('a condition the book does not know is counted, not guessed', async () => {
    const db = shop();
    stock(db, 5, { conditionCode: 'MINT' });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out.skipped.noCondition).toBe(1);
    expect(out.created).toBe(0);
  });

  test('items without a card record, and deleted items, are never visited', async () => {
    const db = shop();
    seedItem(db, A, { price: 5, title: 'A mug' });
    stock(db, 5, {}, { deletedAt: FAKE_NOW });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out).toMatchObject({ considered: 0, created: 0 });
  });

  test('reserved and draft items count as stock; the item price is the shop\'s own number', async () => {
    const db = shop();
    stock(db, 5, {}, { status: 'RESERVED' });
    stock(db, 6, { finish: 'FOIL' }, { draftStatus: 'DRAFT' });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out.created).toBe(2);
  });

  test('two cards of the same stock make one reference (first wins), counted as a duplicate', async () => {
    const db = shop();
    stock(db, 5);
    stock(db, 9);
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out.created).toBe(1);
    expect(out.skipped.duplicate).toBe(1);
    expect(refs(db)).toHaveLength(1);
  });
});

describe('from stock: existing references and overwrite', () => {
  test('an existing reference is kept and counted; another finish is still created', async () => {
    const db = shop();
    const book = seedBook(db, A);
    seedReference(db, book.id as string, { cardKey: 'p:SCRYFALL:p1', finish: 'NONFOIL', valueCents: 4242, note: 'typed by me' });
    stock(db, 5);
    stock(db, 6, { finish: 'FOIL' });
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out).toMatchObject({ created: 1, updated: 0 });
    expect(out.skipped.existing).toBe(1);
    const kept = refs(db).find((r) => r.finish === 'NONFOIL');
    expect(kept).toMatchObject({ valueCents: 4242, note: 'typed by me' });
  });

  test('overwrite replaces the existing reference', async () => {
    const db = shop();
    const book = seedBook(db, A);
    seedReference(db, book.id as string, { cardKey: 'p:SCRYFALL:p1', finish: 'NONFOIL', valueCents: 4242, note: 'typed by me' });
    stock(db, 5);
    const out = await referencesFromStock(makeCtx(db, A), { overwrite: true });
    expect(out).toMatchObject({ created: 0, updated: 1 });
    expect(refs(db)).toHaveLength(1);
    expect(refs(db)[0]).toMatchObject({ valueCents: 500 });
    expect(String(refs(db)[0]?.note)).toMatch(/^From my stock on /);
  });

  test('a failure part way rolls everything back', async () => {
    const db = shop();
    const book = seedBook(db, A);
    seedReference(db, book.id as string, { cardKey: 'p:SCRYFALL:p1', finish: 'NONFOIL', valueCents: 4242 });
    stock(db, 5);
    stock(db, 6, { finish: 'FOIL' });
    db.failWhen((table, op) => (table === 'priceBookReference' && op === 'updateMany' ? new Error('boom') : null));
    await expect(referencesFromStock(makeCtx(db, A), { overwrite: true })).rejects.toThrow('boom');
    expect(refs(db)).toHaveLength(1);
    expect(refs(db)[0]?.valueCents).toBe(4242);
  });
});

describe('from stock: scope and tenants', () => {
  test('saleId and game narrow the stock', async () => {
    const db = shop();
    stock(db, 5, {}, { saleId: 'sale1' });
    stock(db, 6, { finish: 'FOIL' }, { saleId: 'sale2' });
    stock(db, 7, { finish: 'ETCHED', game: 'POKEMON', catalogPrintingId: null, cardName: 'Pikachu', setCode: 'x', collectorNumber: '1' }, { saleId: 'sale1' });
    const bySale = await referencesFromStock(makeCtx(db, A), { saleId: 'sale1' });
    expect(bySale.created).toBe(2);
    const db2 = shop();
    stock(db2, 5);
    stock(db2, 7, { finish: 'HOLO', game: 'POKEMON', catalogPrintingId: null, cardName: 'Pikachu', setCode: 'x', collectorNumber: '1' });
    const byGame = await referencesFromStock(makeCtx(db2, A), { game: 'pokemon' });
    expect(byGame.created).toBe(1);
    expect(refs(db2)[0]?.game).toBe('POKEMON');
  });

  test('another organizer\'s stock is never turned into a reference, even through a mismatched card record', async () => {
    const db = shop();
    stock(db, 5);
    stock(db, 777, { finish: 'FOIL' }, {}, B);
    stock(db, 888, { finish: 'ETCHED', organizerId: A }, {}, B); // card record claims A, item belongs to B
    const out = await referencesFromStock(makeCtx(db, A), {});
    expect(out.created).toBe(1);
    expect(refs(db).map((r) => r.valueCents)).toEqual([500]);
    const book = db.select('priceBook', { organizerId: A })[0];
    expect(refs(db).every((r) => r.bookId === book?.id)).toBe(true);
  });
});
