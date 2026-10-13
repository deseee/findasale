/**
 * ADR-140 B3b: bulk lot runs (section 8.5, AT-27). A lot is repriced from the rate card through the injected updateBulkLot, the
 * only price edit a lot has. There is no second pricing path: nothing here writes Item.price itself.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FAKE_NOW, createFakePriceBookDb, makeCtx, seedBook, seedBulkRate, seedCardItem, seedItem, seedLock, seedRule } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { MIN_CARD_SALE_CENTS } from '../utils/feeCalculator';
import { isPriceBookError } from '../services/priceBook/db';
import type { ServiceCtx } from '../services/priceBook/db';
import { LOT_KIND_TIER } from '../services/priceBook/vocabulary';
import { saveBulkRates } from '../services/priceBook/referenceService';
import { APPLY_CHUNK_SIZE, applyRun, getRun, listRunItems, previewRun, undoRun } from '../services/priceBook/runService';
import type { PriceChange } from '../services/priceBook/runService';
import { PACK_MIN_CHARGE_CENTS, allLotRunMessages, applyLotRun, decideLotRow, lotWarningText, packPriceCents, previewLotRun, undoLotRun } from '../services/priceBook/lotRunService';
import type { LotRunDeps, UpdateBulkLotFn } from '../services/priceBook/lotRunService';

const A = 'orgA';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ENV = { CARD_PRICE_BOOK_ENABLED: 'true' };
const LOT = { kind: 'LOT' };
const body = (n: number, version = 1) => ({ ifBookVersion: version, expectedCount: n });

interface LotShop {
  db: FakeDb;
  bookId: string;
  ctx: ServiceCtx;
  deps: LotRunDeps;
  calls: Array<{ itemId: string; pricePerThousand: number }>;
  failFor: Set<string>;
  changes: PriceChange[];
  /** A bulk lot item. Price is dollars per 1,000 cards, as Item.price holds it. */
  lot(kind: string, price: number | null, item?: AnyRow, lotExtra?: AnyRow): string;
  later(ms: number): ServiceCtx;
}

function lotShop(env: Record<string, string | undefined> = {}): LotShop {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, { enabled: true });
  const bookId = book.id as string;
  const calls: Array<{ itemId: string; pricePerThousand: number }> = [];
  const failFor = new Set<string>();
  const changes: PriceChange[] = [];
  // The real updateBulkLot validates, rounds to cents and writes Item.price; this stand in does the same for the price.
  const updateBulkLot: UpdateBulkLotFn = async (itemId, input) => {
    calls.push({ itemId, pricePerThousand: input.pricePerThousand });
    if (failFor.has(itemId)) throw new Error('BULK_PACK_INVALID');
    const row = db.tables.item.find((r) => r.id === itemId);
    if (!row) throw new Error('BULK_NOT_FOUND');
    row.price = Math.round(input.pricePerThousand * 100) / 100;
    return undefined;
  };
  const ctx = makeCtx(db, A, { env: { ...ENV, ...env } });
  return {
    db,
    bookId,
    ctx,
    deps: { updateBulkLot, onPriceChanged: (c) => void changes.push(c) },
    calls,
    failFor,
    changes,
    lot(kind, price, item = {}, lotExtra = {}) {
      const made = seedItem(db, A, { title: `Lot ${kind}`, price, stockTotal: 5000, ...item });
      db.insert('itemBulkLot', { itemId: made.id, organizerId: A, game: 'MTG', lotKind: kind, ...lotExtra });
      return made.id as string;
    },
    later(ms) {
      return { ...ctx, now: new Date(FAKE_NOW.getTime() + ms) };
    },
  };
}

function rates(s: LotShop, list: Array<[string, number]> = [['COMMON', 800], ['UNCOMMON', 1200]]) {
  for (const [tier, rateCents] of list) seedBulkRate(s.db, s.bookId, { tier, rateCents });
}

async function errorOf(p: Promise<unknown>): Promise<{ code: string; status: number; details: unknown }> {
  try {
    await p;
  } catch (e) {
    if (isPriceBookError(e)) return { code: e.code, status: e.status, details: e.details };
    throw e;
  }
  throw new Error('expected an error');
}

const itemRow = (db: FakeDb, id: string): AnyRow => {
  const row = db.tables.item.find((r) => r.id === id);
  if (!row) throw new Error('no item');
  return row;
};

const runRow = (db: FakeDb, runId: string, itemId: string): AnyRow => {
  const row = db.tables.priceBookRunItem.find((r) => r.runId === runId && r.itemId === itemId);
  if (!row) throw new Error('no run item');
  return row;
};

async function rowsOf(s: LotShop, runId: string) {
  const page = await listRunItems(s.ctx, runId, { view: 'all', limit: 200 });
  return new Map(page.items.map((r) => [r.itemId, r]));
}

describe('the preview: tier mapping and the rate card', () => {
  test('each lot kind takes the SELL per 1,000 rate of its tier, in cents per 1,000', async () => {
    const s = lotShop();
    rates(s, [['COMMON', 800], ['UNCOMMON', 1200], ['COMMON_UNCOMMON', 1000], ['RARE', 5000], ['LAND', 300], ['MIXED', 600]]);
    const ids: Record<string, string> = {
      BULK_COMMON: s.lot('BULK_COMMON', 7),
      BULK_UNCOMMON: s.lot('BULK_UNCOMMON', 10),
      BULK_COMMON_UNCOMMON: s.lot('BULK_COMMON_UNCOMMON', 9),
      BULK_RARE: s.lot('BULK_RARE', 40),
      BULK_LAND: s.lot('BULK_LAND', 2),
      BULK_MIXED: s.lot('BULK_MIXED', 5),
    };
    const out = await previewLotRun(s.ctx, LOT);
    const byItem = await rowsOf(s, out.run.id);
    const expected: Record<string, number> = { BULK_COMMON: 800, BULK_UNCOMMON: 1200, BULK_COMMON_UNCOMMON: 1000, BULK_RARE: 5000, BULK_LAND: 300, BULK_MIXED: 600 };
    for (const kind of Object.keys(ids)) {
      const row = byItem.get(ids[kind] as string);
      expect({ kind, cents: row?.newPriceCents }).toEqual({ kind, cents: expected[kind] });
      expect(row).toMatchObject({ state: 'PENDING', selected: true, priceSource: 'RATE_CARD', newPrice: (expected[kind] as number) / 100, reviewReasons: [] });
    }
    expect(Object.keys(LOT_KIND_TIER).sort()).toEqual(Object.keys(ids).sort());
    expect(out.run).toMatchObject({ kind: 'LOT', status: 'PREVIEW', counts: { eligible: 6, changes: 6, unchanged: 0, skipped: 0, review: 0 } });
  });

  test('only the SELL, per 1,000, any finish row of the lot\'s game counts', async () => {
    const s = lotShop();
    seedBulkRate(s.db, s.bookId, { tier: 'COMMON', rateCents: 800 });
    seedBulkRate(s.db, s.bookId, { tier: 'COMMON', rateCents: 100, direction: 'BUY' });
    seedBulkRate(s.db, s.bookId, { tier: 'COMMON', rateCents: 5, unit: 'PER_CARD' });
    seedBulkRate(s.db, s.bookId, { tier: 'COMMON', rateCents: 9999, finish: 'FOIL' });
    seedBulkRate(s.db, s.bookId, { tier: 'COMMON', rateCents: 777, game: 'POKEMON' });
    const mtg = s.lot('BULK_COMMON', 7);
    const pokemon = s.lot('BULK_COMMON', 7, {}, { game: 'POKEMON' });
    const other = s.lot('BULK_COMMON', 7, {}, { game: 'LORCANA' });
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(mtg)?.newPriceCents).toBe(800);
    expect(byItem.get(pokemon)?.newPriceCents).toBe(777);
    expect(byItem.get(other)?.skipReason).toBe('NO_RATE');
  });

  test('no rate is NO_RATE with the lot kind in the words; an unknown kind too', async () => {
    const s = lotShop();
    rates(s, [['COMMON', 800]]);
    const none = s.lot('BULK_UNCOMMON', 10);
    const weird = s.lot('BULK_SPARKLY', 10);
    const out = await previewLotRun(s.ctx, LOT);
    const byItem = await rowsOf(s, out.run.id);
    expect(byItem.get(none)).toMatchObject({ state: 'SKIPPED', skipReason: 'NO_RATE', selected: false, newPriceCents: null, why: 'No rate set for Bulk uncommons.' });
    expect(byItem.get(weird)?.skipReason).toBe('NO_RATE');
    expect(out.run.counts).toMatchObject({ eligible: 2, changes: 0, skipped: 2 });
  });

  test('the same price is UNCHANGED, and a lot with no price yet is priced', async () => {
    const s = lotShop();
    rates(s);
    const same = s.lot('BULK_COMMON', 8);
    const unpriced = s.lot('BULK_UNCOMMON', null);
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(same)).toMatchObject({ state: 'SKIPPED', skipReason: 'UNCHANGED', newPriceCents: 800 });
    expect(byItem.get(unpriced)).toMatchObject({ state: 'PENDING', oldPriceCents: null, newPriceCents: 1200 });
  });

  test('a pin skips the lot', async () => {
    const s = lotShop();
    rates(s);
    const pinned = s.lot('BULK_COMMON', 7);
    seedLock(s.db, s.bookId, pinned);
    const expired = s.lot('BULK_COMMON', 7);
    seedLock(s.db, s.bookId, expired, { lockedUntil: new Date(FAKE_NOW.getTime() - MIN) });
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(pinned)?.skipReason).toBe('LOCKED');
    expect(byItem.get(expired)?.state).toBe('PENDING');
  });

  test('the rate card is read as it is now: changing a rate changes the next preview', async () => {
    const s = lotShop();
    rates(s);
    const id = s.lot('BULK_COMMON', 7);
    expect((await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id)).get(id)?.newPriceCents).toBe(800);
    await saveBulkRates(s.ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 900 }] });
    expect((await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id)).get(id)?.newPriceCents).toBe(900);
  });
});

describe('the preview: which lots are listed', () => {
  test('this organizer\'s lots on the shelf; not sold, deleted, other shops\' lots or ordinary cards', async () => {
    const s = lotShop();
    rates(s);
    const live = s.lot('BULK_COMMON', 7);
    const reserved = s.lot('BULK_COMMON', 7, { status: 'RESERVED' });
    s.lot('BULK_COMMON', 7, { status: 'SOLD' });
    s.lot('BULK_COMMON', 7, { deletedAt: FAKE_NOW });
    const foreign = seedItem(s.db, 'orgB', { price: 7 });
    s.db.insert('itemBulkLot', { itemId: foreign.id, organizerId: 'orgB', lotKind: 'BULK_COMMON' });
    seedCardItem(s.db, A, { price: 4 }, { collectorNumber: '1' });
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(Array.from(byItem.keys()).sort()).toEqual([live, reserved].sort());
    expect(byItem.get(reserved)).toMatchObject({ skipReason: 'NOT_AVAILABLE', state: 'SKIPPED' });
  });

  test('a sale can narrow the run', async () => {
    const s = lotShop();
    rates(s);
    const inSale = s.lot('BULK_COMMON', 7, { saleId: 'sale1' });
    s.lot('BULK_COMMON', 7, { saleId: 'sale2' });
    const out = await previewLotRun(s.ctx, { kind: 'LOT', scope: { saleId: 'sale1' } });
    expect(out.items.map((r) => r.itemId)).toEqual([inSale]);
    expect(out.run.scope.saleId).toBe('sale1');
  });

  test('a card run never lists a lot, and a lot run never lists a card (even a lot that has a card record)', async () => {
    const s = lotShop();
    rates(s);
    const lot = s.lot('BULK_COMMON', 7);
    s.db.insert('itemCard', { itemId: lot, organizerId: A, game: 'MTG', productType: 'SINGLE', cardName: 'Odd', setCode: 'abc', collectorNumber: '9' });
    const card = seedCardItem(s.db, A, { title: 'Single', price: 4 }, { cardName: 'Single', setCode: 'abc', collectorNumber: '1' }).item.id as string;
    seedRule(s.db, s.bookId, { roundingMode: 'NONE' });
    const lotRun = await previewLotRun(s.ctx, LOT);
    expect(Array.from((await rowsOf(s, lotRun.run.id)).keys())).toEqual([lot]);
    const cardRun = await previewRun(s.ctx, { kind: 'BULK' }, { providers: [] });
    const cardIds = Array.from((await rowsOf(s, cardRun.run.id)).keys());
    expect(cardIds).toEqual([card]);
    expect(cardRun.run.kind).toBe('BULK');
    expect(lotRun.run.kind).toBe('LOT');
  });
});

describe('the preview: warnings on a changed lot', () => {
  test('a pack that would come to less than 99 cents', async () => {
    const s = lotShop();
    rates(s);
    const small = s.lot('BULK_COMMON', 7, {}, { packSize: 100 });
    const fine = s.lot('BULK_UNCOMMON', 10, {}, { packSize: 100 });
    const none = s.lot('BULK_COMMON', 7);
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(small)?.warnings).toEqual(['PACK_BELOW_CARD_MINIMUM']);
    expect(byItem.get(fine)?.warnings).toEqual([]);
    expect(byItem.get(none)?.warnings).toEqual([]);
    expect(lotWarningText('PACK_BELOW_CARD_MINIMUM')).toBe('This pack would be under $0.99, so it cannot be sold online by card.');
  });

  test('the pack arithmetic is the lot arithmetic: floor((cards * P + 500) / 1000) against 99 cents', () => {
    expect(packPriceCents(100, 800)).toBe(80);
    expect(packPriceCents(100, 985)).toBe(99);
    expect(packPriceCents(100, 984)).toBe(98);
    expect(packPriceCents(1000, 1)).toBe(1);
    expect(PACK_MIN_CHARGE_CENTS).toBe(MIN_CARD_SALE_CENTS);
    const item = { id: 'i', price: 5, title: 'Lot', status: 'AVAILABLE' } as never;
    const warn = (rate: number) => decideLotRow(item, { itemId: 'i', organizerId: A, game: 'MTG', lotKind: 'BULK_COMMON', packSize: 100 }, rate, false, false, 1).warnings;
    expect(warn(985)).toEqual([]);
    expect(warn(984)).toEqual(['PACK_BELOW_CARD_MINIMUM']);
  });

  test('an enabled eBay bundle is noted; a disabled one, or another shop\'s, is not', async () => {
    const s = lotShop();
    rates(s);
    const bundled = s.lot('BULK_COMMON', 7);
    const off = s.lot('BULK_COMMON', 7);
    const foreign = s.lot('BULK_COMMON', 7);
    s.db.insert('itemBulkLotEbayBundle', { itemId: bundled, organizerId: A, enabled: true, bundleSize: 500 });
    s.db.insert('itemBulkLotEbayBundle', { itemId: off, organizerId: A, enabled: false });
    s.db.insert('itemBulkLotEbayBundle', { itemId: foreign, organizerId: 'orgB', enabled: true });
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(bundled)?.warnings).toEqual(['EBAY_BUNDLES_FOLLOW']);
    expect(byItem.get(off)?.warnings).toEqual([]);
    expect(byItem.get(foreign)?.warnings).toEqual([]);
    expect(lotWarningText('EBAY_BUNDLES_FOLLOW')).toBe('The eBay bundle price will follow this change.');
  });

  test('both warnings together, and none on a lot that does not change', async () => {
    const s = lotShop();
    rates(s);
    const both = s.lot('BULK_COMMON', 7, {}, { packSize: 100 });
    s.db.insert('itemBulkLotEbayBundle', { itemId: both, organizerId: A, enabled: true });
    const same = s.lot('BULK_COMMON', 8, {}, { packSize: 100 });
    s.db.insert('itemBulkLotEbayBundle', { itemId: same, organizerId: A, enabled: true });
    const byItem = await rowsOf(s, (await previewLotRun(s.ctx, LOT)).run.id);
    expect(byItem.get(both)?.warnings).toEqual(['PACK_BELOW_CARD_MINIMUM', 'EBAY_BUNDLES_FOLLOW']);
    expect(byItem.get(same)?.warnings).toEqual([]);
  });
});

describe('the preview: limits, validity and what it writes', () => {
  test('only the run and its rows are written', async () => {
    const s = lotShop();
    rates(s);
    s.lot('BULK_COMMON', 7);
    const before = JSON.stringify(s.db.tables.item);
    await previewLotRun(s.ctx, LOT);
    expect(JSON.stringify(s.db.tables.item)).toBe(before);
    expect(Array.from(new Set(s.db.writes.map((w) => w.table))).sort()).toEqual(['priceBookRun', 'priceBookRunItem']);
    expect(s.calls).toHaveLength(0);
  });

  test('valid 30 minutes; too many lots is SCOPE_TOO_LARGE', async () => {
    const s = lotShop({ CARD_PRICE_BOOK_MAX_RUN_ITEMS: '2' });
    rates(s);
    for (let n = 0; n < 3; n += 1) s.lot('BULK_COMMON', 7);
    expect(await errorOf(previewLotRun(s.ctx, LOT))).toMatchObject({ code: 'SCOPE_TOO_LARGE', status: 400, details: { count: 3, max: 2 } });
    expect(s.db.tables.priceBookRun).toHaveLength(0);
    const ok = lotShop();
    rates(ok);
    ok.lot('BULK_COMMON', 7);
    expect((await previewLotRun(ok.ctx, LOT)).run.expiresAt).toBe(new Date(FAKE_NOW.getTime() + 30 * MIN).toISOString());
  });

  test('bad bodies, a book that is off, and no book', async () => {
    const s = lotShop();
    for (const input of [null, [], { kind: 'BULK' }, { kind: 'LOT', scope: { game: 'MTG' } }, { kind: 'LOT', scope: 'x' }, { kind: 'LOT', extra: 1 }, { kind: 'LOT', includeMarkedDown: 'yes' }]) {
      expect((await errorOf(previewLotRun(s.ctx, input))).code).toBe('VALIDATION');
    }
    const off = lotShop();
    off.db.tables.priceBook[0]!.enabled = false;
    expect((await errorOf(previewLotRun(off.ctx, LOT))).code).toBe('PRICE_BOOK_DISABLED');
    expect((await errorOf(previewLotRun(makeCtx(createFakePriceBookDb(), A, { env: ENV }), LOT))).code).toBe('NOT_FOUND');
    expect(await previewLotRun(s.ctx, { kind: 'LOT', includeMarkedDown: false, includeEbayLive: false })).toMatchObject({ run: { kind: 'LOT' } });
  });
});

describe('apply through the injected updateBulkLot', () => {
  async function ready() {
    const s = lotShop();
    rates(s);
    const common = s.lot('BULK_COMMON', 7);
    const uncommon = s.lot('BULK_UNCOMMON', 10.5);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    return { s, common, uncommon, runId };
  }

  test('one call per lot with the new price in dollars per 1,000; nothing else writes the lot', async () => {
    const { s, common, uncommon, runId } = await ready();
    const at = s.later(5 * MIN);
    const out = await applyLotRun(at, runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'APPLIED', applied: 2, remaining: 0, message: 'Applied 2 prices.' });
    expect(s.calls).toEqual([
      { itemId: common, pricePerThousand: 8 },
      { itemId: uncommon, pricePerThousand: 12 },
    ]);
    expect(itemRow(s.db, common).price).toBe(8);
    expect(s.db.writeCount('item')).toBe(0);
    expect(s.db.writeCount('itemPriceHistory')).toBe(0);
    expect(runRow(s.db, runId, common)).toMatchObject({ state: 'APPLIED', appliedAt: at.now });
    expect(await getRun(s.ctx, runId)).toMatchObject({ status: 'APPLIED', appliedCount: 2, appliedAt: at.now.toISOString() });
  });

  test('a price like 8.05 per 1,000 is passed as 8.05', async () => {
    const s = lotShop();
    rates(s, [['COMMON', 805]]);
    s.lot('BULK_COMMON', 7);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    await applyLotRun(s.later(MIN), runId, body(1), s.deps);
    expect(s.calls[0]?.pricePerThousand).toBe(8.05);
  });

  test('the alert hook is told, with the prices in cents per 1,000', async () => {
    const { s, common, runId } = await ready();
    await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect(s.changes[0]).toEqual({ runId, kind: 'APPLY', itemId: common, organizerId: A, oldPriceCents: 700, newPriceCents: 800, oldPrice: 7, newPrice: 8, ebayListed: false });
  });

  test('a second call is 409 ALREADY_APPLIED and calls updateBulkLot no more', async () => {
    const { s, runId } = await ready();
    await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    const err = await errorOf(applyLotRun(s.later(MIN), runId, body(2), s.deps));
    expect(err).toMatchObject({ code: 'ALREADY_APPLIED', status: 409 });
    expect(s.calls).toHaveLength(2);
  });

  test('two calls at once write each lot once', async () => {
    const s = lotShop();
    rates(s);
    for (let n = 0; n < 20; n += 1) s.lot('BULK_COMMON', 7);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    const at = s.later(MIN);
    await Promise.allSettled([applyLotRun(at, runId, body(20), s.deps), applyLotRun(at, runId, body(20), s.deps), applyLotRun(at, runId, body(20), s.deps)]);
    expect(s.calls).toHaveLength(20);
    expect(new Set(s.calls.map((c) => c.itemId)).size).toBe(20);
  });

  test('200 lots per call', async () => {
    const s = lotShop();
    rates(s);
    const total = APPLY_CHUNK_SIZE + 3;
    for (let n = 0; n < total; n += 1) s.lot('BULK_COMMON', 7);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    expect(await applyLotRun(s.later(MIN), runId, body(total), s.deps)).toMatchObject({ status: 'APPLYING', applied: 200, remaining: 3 });
    expect(await applyLotRun(s.later(MIN), runId, body(total), s.deps)).toMatchObject({ status: 'APPLIED', applied: total });
    expect(s.calls).toHaveLength(total);
  });

  test('the checks of the first call: version, count, nothing ticked, expiry', async () => {
    const { s, runId } = await ready();
    expect((await errorOf(applyLotRun(s.later(MIN), runId, body(2, 5), s.deps))).code).toBe('BOOK_CHANGED');
    expect((await errorOf(applyLotRun(s.later(MIN), runId, body(1), s.deps))).code).toBe('COUNT_MISMATCH');
    expect((await errorOf(applyLotRun(s.later(31 * MIN), runId, body(2), s.deps))).code).toBe('PREVIEW_EXPIRED');
    expect(s.calls).toHaveLength(0);
  });

  test('a rate saved after the preview changes the book version, so the preview cannot be applied', async () => {
    const { s, runId } = await ready();
    await saveBulkRates(s.ctx, { game: 'MTG', rates: [{ direction: 'SELL', tier: 'COMMON', unit: 'PER_1000', rateCents: 900 }] });
    expect((await errorOf(applyLotRun(s.later(MIN), runId, body(2, 1), s.deps))).code).toBe('BOOK_CHANGED');
    expect((await errorOf(applyLotRun(s.later(MIN), runId, body(2, 2), s.deps))).code).toBe('BOOK_CHANGED');
    expect(s.calls).toHaveLength(0);
  });

  test('applying a run does not change the book version', async () => {
    const { s, runId } = await ready();
    await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect(s.db.tables.priceBook[0]?.version).toBe(1);
  });

  test('a lot priced by hand after the preview is not overwritten', async () => {
    const { s, common, uncommon, runId } = await ready();
    itemRow(s.db, common).price = 7.5;
    const out = await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'PARTIAL', applied: 1, changedSincePreview: 1 });
    expect(itemRow(s.db, common).price).toBe(7.5);
    expect(itemRow(s.db, uncommon).price).toBe(12);
    expect(s.calls.map((c) => c.itemId)).toEqual([uncommon]);
    expect(runRow(s.db, runId, common)).toMatchObject({ state: 'CHANGED_SINCE_PREVIEW', appliedAt: null });
  });

  test('a lot sold out, deleted, or no longer a lot is left alone', async () => {
    for (const change of ['sold', 'deleted', 'notALot']) {
      const { s, common, runId } = await ready();
      if (change === 'sold') itemRow(s.db, common).status = 'SOLD';
      if (change === 'deleted') itemRow(s.db, common).deletedAt = FAKE_NOW;
      if (change === 'notALot') s.db.tables.itemBulkLot.splice(0, 1);
      const out = await applyLotRun(s.later(MIN), runId, body(2), s.deps);
      expect({ change, changed: out.changedSincePreview }).toEqual({ change, changed: 1 });
      expect(s.calls.map((c) => c.itemId)).not.toContain(common);
    }
  });

  test('a pin set after the preview is honored', async () => {
    const { s, common, runId } = await ready();
    seedLock(s.db, s.bookId, common);
    const out = await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'PARTIAL', applied: 1, lockedSincePreview: 1 });
    expect(s.calls.map((c) => c.itemId)).not.toContain(common);
    expect(runRow(s.db, runId, common)).toMatchObject({ state: 'SKIPPED', skipReason: 'LOCKED_SINCE_PREVIEW' });
  });

  test('when updateBulkLot refuses, the row is FAILED, the price stays, and the other lots go through', async () => {
    const { s, common, uncommon, runId } = await ready();
    s.failFor.add(common);
    const out = await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect(out).toMatchObject({ status: 'PARTIAL', applied: 1, failed: 1 });
    expect(itemRow(s.db, common).price).toBe(7);
    expect(itemRow(s.db, uncommon).price).toBe(12);
    expect(runRow(s.db, runId, common)).toMatchObject({ state: 'FAILED', appliedAt: null });
    expect(JSON.stringify(out)).not.toContain('BULK_PACK_INVALID');
  });

  test('an alert that throws never undoes a lot price', async () => {
    const { s, common, runId } = await ready();
    const deps: LotRunDeps = { updateBulkLot: s.deps.updateBulkLot, onPriceChanged: () => { throw new Error('mail down'); } };
    expect((await applyLotRun(s.later(MIN), runId, body(2), deps)).status).toBe('APPLIED');
    expect(itemRow(s.db, common).price).toBe(8);
  });

  test('a card run and a lot run cannot be applied or undone through each other', async () => {
    const { s, runId } = await ready();
    seedRule(s.db, s.bookId, { roundingMode: 'NONE' });
    seedCardItem(s.db, A, { price: 4 }, { collectorNumber: '1' });
    const cardRun = (await previewRun(s.ctx, { kind: 'BULK' }, { providers: [] })).run.id;
    expect(await errorOf(applyRun(s.later(MIN), runId, body(2)))).toMatchObject({ code: 'WRONG_RUN_KIND', status: 400 });
    expect((await errorOf(applyLotRun(s.later(MIN), cardRun, body(0), s.deps))).code).toBe('WRONG_RUN_KIND');
    await applyLotRun(s.later(MIN), runId, body(2), s.deps);
    expect((await errorOf(undoRun(s.later(2 * MIN), runId))).code).toBe('WRONG_RUN_KIND');
    expect((await errorOf(undoLotRun(s.later(2 * MIN), cardRun, s.deps))).code).toBe('WRONG_RUN_KIND');
  });

  test('another organizer cannot apply the run', async () => {
    const { s, runId } = await ready();
    seedBook(s.db, 'orgB', { enabled: true });
    const other = makeCtx(s.db, 'orgB', { env: ENV, now: s.later(MIN).now });
    expect((await errorOf(applyLotRun(other, runId, body(2), s.deps))).code).toBe('NOT_FOUND');
    expect(s.calls).toHaveLength(0);
  });
});

describe('undo through the injected updateBulkLot', () => {
  async function applied() {
    const s = lotShop();
    rates(s);
    const common = s.lot('BULK_COMMON', 7);
    const uncommon = s.lot('BULK_UNCOMMON', 10.5);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    await applyLotRun(s.later(20 * MIN), runId, body(2), s.deps);
    s.calls.length = 0;
    s.changes.length = 0;
    return { s, common, uncommon, runId };
  }

  test('puts the old price back, in dollars per 1,000, only where the lot still has the price the run set', async () => {
    const { s, common, uncommon, runId } = await applied();
    const out = await undoLotRun(s.later(21 * MIN), runId, s.deps);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 2, undoSkipped: 0, message: 'Undid 2 prices.' });
    expect(s.calls).toEqual([
      { itemId: common, pricePerThousand: 7 },
      { itemId: uncommon, pricePerThousand: 10.5 },
    ]);
    expect(itemRow(s.db, common).price).toBe(7);
    expect(itemRow(s.db, uncommon).price).toBe(10.5);
    expect(s.changes[0]).toMatchObject({ kind: 'UNDO', oldPriceCents: 800, newPriceCents: 700 });
    expect(await getRun(s.ctx, runId)).toMatchObject({ status: 'UNDONE', undoneCount: 2 });
  });

  test('a lot changed since is left alone and counted', async () => {
    const { s, common, uncommon, runId } = await applied();
    itemRow(s.db, common).price = 9;
    const out = await undoLotRun(s.later(21 * MIN), runId, s.deps);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 1, undoSkipped: 1 });
    expect(out.message).toBe('Undid 1 prices. 1 cards were changed by hand since, so we left them alone.');
    expect(itemRow(s.db, common).price).toBe(9);
    expect(itemRow(s.db, uncommon).price).toBe(10.5);
    expect(s.calls.map((c) => c.itemId)).toEqual([uncommon]);
    expect(runRow(s.db, runId, common)).toMatchObject({ state: 'UNDO_SKIPPED', undoneAt: null });
  });

  test('a lot that had no price cannot go back to none, so it is left alone and counted', async () => {
    const s = lotShop();
    rates(s);
    const blank = s.lot('BULK_COMMON', null);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    await applyLotRun(s.later(MIN), runId, body(1), s.deps);
    expect(itemRow(s.db, blank).price).toBe(8);
    s.calls.length = 0;
    const out = await undoLotRun(s.later(2 * MIN), runId, s.deps);
    expect(out).toMatchObject({ status: 'UNDONE', undone: 0, undoSkipped: 1 });
    expect(s.calls).toHaveLength(0);
    expect(itemRow(s.db, blank).price).toBe(8);
  });

  test('a deleted lot, a pin, and a refusal are all left alone', async () => {
    const { s, common, uncommon, runId } = await applied();
    itemRow(s.db, common).deletedAt = FAKE_NOW;
    s.failFor.add(uncommon);
    const out = await undoLotRun(s.later(21 * MIN), runId, s.deps);
    expect(out).toMatchObject({ undone: 0, undoSkipped: 2 });
    const pinned = await applied();
    seedLock(pinned.s.db, pinned.s.bookId, pinned.common);
    expect(await undoLotRun(pinned.s.later(21 * MIN), pinned.runId, pinned.s.deps)).toMatchObject({ undone: 1, undoSkipped: 1 });
  });

  test('7 days from the apply, a second undo is the same summary, and it needs an applied run', async () => {
    const { s, runId } = await applied();
    const edge = 20 * MIN + 7 * DAY;
    expect((await errorOf(undoLotRun(s.later(edge + 1), runId, s.deps))).code).toBe('UNDO_EXPIRED');
    const first = await undoLotRun(s.later(edge), runId, s.deps);
    const calls = s.calls.length;
    expect(await undoLotRun(s.later(edge), runId, s.deps)).toMatchObject({ status: 'UNDONE', undone: first.undone, undoneThisCall: 0 });
    expect(s.calls).toHaveLength(calls);
    const fresh = lotShop();
    rates(fresh);
    fresh.lot('BULK_COMMON', 7);
    const preview = await previewLotRun(fresh.ctx, LOT);
    expect((await errorOf(undoLotRun(fresh.ctx, preview.run.id, fresh.deps))).code).toBe('RUN_NOT_APPLIED');
  });

  test('two undo calls at once restore each lot once', async () => {
    const s = lotShop();
    rates(s);
    for (let n = 0; n < 20; n += 1) s.lot('BULK_COMMON', 7);
    const runId = (await previewLotRun(s.ctx, LOT)).run.id;
    await applyLotRun(s.later(MIN), runId, body(20), s.deps);
    s.calls.length = 0;
    const at = s.later(2 * MIN);
    await Promise.allSettled([undoLotRun(at, runId, s.deps), undoLotRun(at, runId, s.deps), undoLotRun(at, runId, s.deps)]);
    expect(s.calls).toHaveLength(20);
    expect(new Set(s.calls.map((c) => c.itemId)).size).toBe(20);
  });
});

describe('no second pricing path', () => {
  const source = readFileSync(join(__dirname, '..', 'services', 'priceBook', 'lotRunService.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('the service never writes an item or a price history row itself', () => {
    expect(code).not.toMatch(/\.item\.(update|updateMany|create|createMany|deleteMany)\b/);
    expect(code).not.toMatch(/itemPriceHistory/);
    expect(code).not.toMatch(/applyOrganizerPrice|buildPriceUpdate/);
  });

  test('the only way a lot price changes is the injected function', () => {
    expect(code.match(/deps\.updateBulkLot\(/g)?.length).toBe(2);
    expect(code).not.toMatch(/from '\.\.\//);
    expect(code).not.toMatch(/bulkLotService/);
  });

  test('the rate comes from lotPricePerThousandCents, the one bulk rate function', () => {
    expect(code).toContain('lotPricePerThousandCents(');
    expect(code).not.toContain('quoteBulkLine');
  });
});

describe('copy', () => {
  test('every lot message follows the writing rules', () => {
    const messages = allLotRunMessages();
    expect(messages.length).toBeGreaterThan(8);
    for (const m of messages) {
      expect(m).toMatch(/^[\x20-\x7E]+$/);
      expect(m).not.toMatch(new RegExp('\\b' + 'A' + 'I' + '\\b'));
      expect(m.toLowerCase()).not.toContain('estate' + ' ' + 'sale');
      expect(m).not.toContain('{');
    }
  });
});
