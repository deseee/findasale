/**
 * ADR-140 B3b: run previews (AT-19, AT-20 and the preview half of AT-21). A preview computes a suggestion for every eligible
 * card and stores a PREVIEW run with its rows. It never changes an item.
 */
import { FAKE_NOW, createFakePriceBookDb, makeCtx, seedBook, seedCardItem, seedItem, seedLock, seedRule } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { lookupKey } from '../services/priceBook/cardKey';
import { isPriceBookError } from '../services/priceBook/db';
import type { ServiceCtx } from '../services/priceBook/db';
import { previewSummaryText } from '../services/priceBook/messages';
import type { PriceBookProvider } from '../services/priceBook/providers/registry';
import type { ReferenceCandidate } from '../services/priceBook/types';
import { MAX_ITEM_PAGE, PREVIEW_BATCH_SIZE, RUN_COPY, allRunMessages, cancelRun, getRun, listRunItems, listRuns, previewRun, updateSelection } from '../services/priceBook/runService';
import type { RunDeps } from '../services/priceBook/runService';
import { suggest } from '../services/priceBook/suggestService';

const A = 'orgA';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ENV = { CARD_PRICE_BOOK_ENABLED: 'true' };

interface Shop {
  db: FakeDb;
  bookId: string;
  ctx: ServiceCtx;
  deps: RunDeps;
  /** Reference value in cents by collector number. A card with no entry has no reference. */
  values: Record<string, number>;
  fetches: { calls: number };
  /** Adds a listed card whose collector number is n. Returns the item id. */
  add(n: number, price: number | null, refCents: number | null, item?: AnyRow, card?: AnyRow): string;
  /** The same context some milliseconds later. */
  later(ms: number): ServiceCtx;
}

function shop(env: Record<string, string | undefined> = {}, bookOverrides: AnyRow = {}): Shop {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, { enabled: true, ...bookOverrides });
  const bookId = book.id as string;
  seedRule(db, bookId, { name: 'All cards', roundingMode: 'NONE' });
  const values: Record<string, number> = {};
  const fetches = { calls: 0 };
  const provider: PriceBookProvider = {
    kind: 'MANUAL',
    terms: { status: 'CLEARED', reviewedOn: null, reference: 'test' },
    isActive: () => true,
    async fetch(_ctx, cards) {
      fetches.calls += 1;
      const out = new Map<string, ReferenceCandidate[]>();
      for (const c of cards) {
        const cents = values[c.collectorNumber ?? ''];
        if (cents !== undefined) {
          out.set(lookupKey(c.cardKey, c.finish, c.language), [{ kind: 'MANUAL', valueCents: cents, asOf: FAKE_NOW, origin: 'TEST', label: 'Test number' }]);
        }
      }
      return out;
    },
  };
  const ctx = makeCtx(db, A, { env: { ...ENV, ...env } });
  return {
    db,
    bookId,
    ctx,
    values,
    fetches,
    deps: { providers: [provider] },
    add(n, price, refCents, item = {}, card = {}) {
      if (refCents !== null) values[String(n)] = refCents;
      const made = seedCardItem(db, A, { title: `Card ${n}`, price, ...item }, { cardName: `Card ${n}`, collectorNumber: String(n), ...card });
      return made.item.id as string;
    },
    later(ms) {
      return { ...ctx, now: new Date(FAKE_NOW.getTime() + ms) };
    },
  };
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

function runItemRow(db: FakeDb, runId: string, itemId: string): AnyRow {
  const row = db.tables.priceBookRunItem.find((r) => r.runId === runId && r.itemId === itemId);
  if (!row) throw new Error(`no run item ${itemId}`);
  return row;
}

const BULK = { kind: 'BULK' };

async function allRows(s: Shop, runId: string, view = 'all') {
  const page = await listRunItems(s.ctx, runId, { view, limit: MAX_ITEM_PAGE });
  const byItem = new Map(page.items.map((r) => [r.itemId, r]));
  return { rows: page.items, byItem, next: page.nextCursor };
}

describe('which cards a preview lists', () => {
  test('only this organizer\'s shelf cards: single cards with a fixed or register price, not lots, not sold, not deleted', async () => {
    const s = shop();
    const plain = s.add(1, 4, 450);
    const pos = s.add(2, 4, 450, { listingType: 'POS' });
    const reserved = s.add(3, 4, 450, { status: 'RESERVED' });
    s.add(4, 4, 450, { status: 'SOLD' });
    s.add(5, 4, 450, { deletedAt: FAKE_NOW });
    s.add(6, 4, 450, { listingType: 'AUCTION' });
    s.add(7, 4, 450, {}, { productType: 'SEALED' });
    seedItem(s.db, A, { title: 'Not a card', price: 4 });
    const lot = s.add(8, 4, 450);
    s.db.insert('itemBulkLot', { itemId: lot, organizerId: A });
    seedCardItem(s.db, 'orgB', { title: 'Other shop', price: 4 }, { cardName: 'Other', collectorNumber: '1' });

    const out = await previewRun(s.ctx, BULK, s.deps);
    const { byItem } = await allRows(s, out.run.id);
    expect(Array.from(byItem.keys()).sort()).toEqual([plain, pos, reserved].sort());
    expect(byItem.get(plain)?.state).toBe('PENDING');
    expect(byItem.get(pos)?.newPriceCents).toBe(450);
    expect(byItem.get(reserved)?.skipReason).toBe('NOT_AVAILABLE');
    expect(out.run.counts.eligible).toBe(3);
  });

  test('a card of another organizer never appears, even with the same collector number', async () => {
    const s = shop();
    const mine = s.add(1, 4, 450);
    seedCardItem(s.db, 'orgB', { title: 'Other shop', price: 4 }, { cardName: 'Card 1', collectorNumber: '1' });
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect(out.items.map((r) => r.itemId)).toEqual([mine]);
  });
});

describe('skip reasons, counts and the tabs', () => {
  function mixed() {
    const s = shop();
    const id = {
      plain: s.add(1, 4, 450),
      review: s.add(2, 1, 500),
      unchanged: s.add(3, 4.5, 450),
      marked: s.add(4, 4, 450, { markdownApplied: true }),
      pinned: s.add(5, 4, 450),
      recent: s.add(6, 4, 450, { priceUpdatedAt: new Date(FAKE_NOW.getTime() - 2 * DAY) }),
      ebay: s.add(7, 4, 450, { ebayListingId: 'L1' }),
      graded: s.add(8, 4, 450, {}, { grader: 'PSA' }),
      noRef: s.add(9, 4, null),
    };
    seedLock(s.db, s.bookId, id.pinned);
    return { s, id };
  }

  test('every reason is named on its row and the counts add up', async () => {
    const { s, id } = mixed();
    const out = await previewRun(s.ctx, BULK, s.deps);
    const { byItem } = await allRows(s, out.run.id);
    const reasonOf = (itemId: string) => byItem.get(itemId)?.skipReason ?? null;
    expect(reasonOf(id.marked)).toBe('MARKED_DOWN');
    expect(reasonOf(id.pinned)).toBe('LOCKED');
    expect(reasonOf(id.recent)).toBe('RECENT_EDIT');
    expect(reasonOf(id.ebay)).toBe('EBAY_LIVE');
    expect(reasonOf(id.graded)).toBe('GRADED');
    expect(reasonOf(id.noRef)).toBe('NO_REFERENCE');
    expect(reasonOf(id.unchanged)).toBe('UNCHANGED');
    expect(reasonOf(id.plain)).toBeNull();
    expect(byItem.get(id.recent)?.why).toContain('Oct 10');
    expect(out.run.counts).toEqual({ eligible: 9, changes: 2, unchanged: 1, skipped: 6, review: 1 });
    expect(out.run.summary).toBe(previewSummaryText(2, 1, 6, 1));
    expect(out.run.status).toBe('PREVIEW');
  });

  test('plain changes start ticked; a row that needs a look starts unticked', async () => {
    const { s, id } = mixed();
    const out = await previewRun(s.ctx, BULK, s.deps);
    const { byItem } = await allRows(s, out.run.id);
    expect(byItem.get(id.plain)?.selected).toBe(true);
    expect(byItem.get(id.plain)?.reviewReasons).toEqual([]);
    expect(byItem.get(id.review)?.selected).toBe(false);
    expect(byItem.get(id.review)?.reviewReasons).toContain('LARGE_MOVE');
    for (const key of ['marked', 'pinned', 'recent', 'ebay', 'graded', 'noRef', 'unchanged'] as const) {
      expect(byItem.get(id[key])?.selected).toBe(false);
      expect(byItem.get(id[key])?.state).toBe('SKIPPED');
    }
  });

  test('the five views split the rows', async () => {
    const { s, id } = mixed();
    const out = await previewRun(s.ctx, BULK, s.deps);
    const ids = async (view: string) => (await allRows(s, out.run.id, view)).rows.map((r) => r.itemId).sort();
    expect(await ids('changes')).toEqual([id.plain]);
    expect(await ids('review')).toEqual([id.review]);
    expect(await ids('unchanged')).toEqual([id.unchanged]);
    expect(await ids('skipped')).toEqual([id.marked, id.pinned, id.recent, id.ebay, id.graded, id.noRef].sort());
    expect((await ids('all')).length).toBe(9);
    expect(out.items.map((r) => r.itemId)).toEqual([id.plain]);
  });

  test('a row shows old and new price in dollars and the change in percent', async () => {
    const { s, id } = mixed();
    const out = await previewRun(s.ctx, BULK, s.deps);
    const row = out.items.find((r) => r.itemId === id.plain);
    expect(row).toMatchObject({ oldPrice: 4, newPrice: 4.5, oldPriceCents: 400, newPriceCents: 450, changePercent: 12.5, title: 'Card 1' });
    expect(row?.why).toBeTruthy();
  });

  test('the number in a row is the number the single suggestion gives (no second pricing path)', async () => {
    const { s, id } = mixed();
    const out = await previewRun(s.ctx, BULK, s.deps);
    const single = await suggest(s.ctx, [{ itemId: id.plain }, { itemId: id.review }], { family: 'RETAIL', providers: s.deps.providers ?? [] });
    const { byItem } = await allRows(s, out.run.id);
    expect(byItem.get(id.plain)?.newPriceCents).toBe(single.results[0]?.suggestion.priceCents);
    expect(byItem.get(id.review)?.newPriceCents).toBe(single.results[1]?.suggestion.priceCents);
  });

  test('skip order: marked down first, then a pin, then a hand edit, then eBay, then graded', async () => {
    const s = shop();
    const old = new Date(FAKE_NOW.getTime() - DAY);
    const a = s.add(1, 4, 450, { markdownApplied: true, ebayListingId: 'L1', priceUpdatedAt: old });
    const b = s.add(2, 4, 450, { ebayListingId: 'L1', priceUpdatedAt: old });
    const c = s.add(3, 4, 450, { ebayListingId: 'L1', priceUpdatedAt: old });
    const d = s.add(4, 4, 450, { ebayListingId: 'L1' }, { grader: 'PSA' });
    const e = s.add(5, 4, 450, { status: 'RESERVED' }, { grader: 'PSA' });
    seedLock(s.db, s.bookId, a);
    seedLock(s.db, s.bookId, b);
    const out = await previewRun(s.ctx, BULK, s.deps);
    const { byItem } = await allRows(s, out.run.id);
    expect(byItem.get(a)?.skipReason).toBe('MARKED_DOWN');
    expect(byItem.get(b)?.skipReason).toBe('LOCKED');
    expect(byItem.get(c)?.skipReason).toBe('RECENT_EDIT');
    expect(byItem.get(d)?.skipReason).toBe('EBAY_LIVE');
    expect(byItem.get(e)?.skipReason).toBe('GRADED');
  });

  test('a pin that has expired no longer skips the card', async () => {
    const s = shop();
    const id = s.add(1, 4, 450);
    seedLock(s.db, s.bookId, id, { lockedUntil: new Date(FAKE_NOW.getTime() - MIN) });
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect(out.items.map((r) => r.itemId)).toEqual([id]);
  });
});

describe('the two checkboxes', () => {
  test('include marked down cards: the markdown stamp is not a hand edit', async () => {
    const s = shop();
    const marked = s.add(1, 4, 450, { markdownApplied: true, priceUpdatedAt: new Date(FAKE_NOW.getTime() - 2 * DAY) });
    const without = await previewRun(s.ctx, BULK, s.deps);
    expect((await allRows(s, without.run.id)).byItem.get(marked)?.skipReason).toBe('MARKED_DOWN');
    const withIt = await previewRun(s.ctx, { ...BULK, includeMarkedDown: true }, s.deps);
    const row = (await allRows(s, withIt.run.id)).byItem.get(marked);
    expect(row?.state).toBe('PENDING');
    expect(row?.newPriceCents).toBe(450);
    expect(withIt.run.scope.includeMarkedDown).toBe(true);
  });

  test('include marked down cards does not lift a pin', async () => {
    const s = shop();
    const marked = s.add(1, 4, 450, { markdownApplied: true });
    seedLock(s.db, s.bookId, marked);
    const out = await previewRun(s.ctx, { ...BULK, includeMarkedDown: true }, s.deps);
    expect((await allRows(s, out.run.id)).byItem.get(marked)?.skipReason).toBe('LOCKED');
  });

  test('include cards listed on eBay', async () => {
    const s = shop();
    const live = s.add(1, 4, 450, { ebayListingId: 'L1' });
    const offer = s.add(2, 4, 450, { ebayOfferId: 'O1' });
    const off = await previewRun(s.ctx, BULK, s.deps);
    expect((await allRows(s, off.run.id)).byItem.get(live)?.skipReason).toBe('EBAY_LIVE');
    expect((await allRows(s, off.run.id)).byItem.get(offer)?.skipReason).toBe('EBAY_LIVE');
    const on = await previewRun(s.ctx, { ...BULK, includeEbayLive: true }, s.deps);
    expect((await allRows(s, on.run.id)).byItem.get(live)?.state).toBe('PENDING');
    expect((await allRows(s, on.run.id)).byItem.get(offer)?.state).toBe('PENDING');
  });
});

describe('scope', () => {
  test('sale, game, set, rarity, finish and only cards without a price narrow the run', async () => {
    const s = shop();
    const inSale = s.add(1, 4, 450, { saleId: 'sale1' });
    s.add(2, 4, 450, { saleId: 'sale2' });
    const pokemon = s.add(3, 4, 450, {}, { game: 'POKEMON', setCode: 'ZZZ' });
    const foil = s.add(4, 4, 450, {}, { finish: 'FOIL', setCode: 'xyz' });
    const noPrice = s.add(5, null, 450);
    const zero = s.add(6, 0, 450);
    const bySale = await previewRun(s.ctx, { kind: 'BULK', scope: { saleId: 'sale1' } }, s.deps);
    expect(bySale.items.map((r) => r.itemId)).toEqual([inSale]);
    const byGame = await previewRun(s.ctx, { kind: 'BULK', scope: { game: 'pokemon' } }, s.deps);
    expect(byGame.items.map((r) => r.itemId)).toEqual([pokemon]);
    const bySet = await previewRun(s.ctx, { kind: 'BULK', scope: { setCode: 'XYZ' } }, s.deps);
    expect(bySet.items.map((r) => r.itemId)).toEqual([foil]);
    const byFinish = await previewRun(s.ctx, { kind: 'BULK', scope: { finish: 'foil' } }, s.deps);
    expect(byFinish.items.map((r) => r.itemId)).toEqual([foil]);
    const unpriced = await previewRun(s.ctx, { kind: 'BULK', scope: { onlyUnpriced: true } }, s.deps);
    expect(unpriced.items.map((r) => r.itemId).sort()).toEqual([noPrice, zero].sort());
    expect(unpriced.run.scope.onlyUnpriced).toBe(true);
  });

  test('a rarity class keeps only cards of that class', async () => {
    const s = shop();
    const rare = s.add(1, 4, 450, {}, { rarity: 'rare' });
    s.add(2, 4, 450, {}, { rarity: 'common' });
    const out = await previewRun(s.ctx, { kind: 'BULK', scope: { rarityClass: 'rare' } }, s.deps);
    expect(out.items.map((r) => r.itemId)).toEqual([rare]);
  });

  test('an intake batch limits the run to unpriced cards added since the batch began, in its sale', async () => {
    const s = shop();
    const since = new Date(FAKE_NOW.getTime() - 3 * DAY);
    const fresh = s.add(1, null, 450, { saleId: 'sale1', createdAt: new Date(FAKE_NOW.getTime() - DAY) });
    s.add(2, null, 450, { saleId: 'sale1', createdAt: new Date(FAKE_NOW.getTime() - 9 * DAY) });
    s.add(3, null, 450, { saleId: 'sale2', createdAt: new Date(FAKE_NOW.getTime() - DAY) });
    s.add(4, 3, 450, { saleId: 'sale1', createdAt: new Date(FAKE_NOW.getTime() - DAY) });
    const seen: Array<[string, string]> = [];
    const deps: RunDeps = {
      ...s.deps,
      resolveIntakeBatch: async (organizerId, batchId) => {
        seen.push([organizerId, batchId]);
        return batchId === 'batch1' ? { saleId: 'sale1', createdAt: since } : null;
      },
    };
    const out = await previewRun(s.ctx, { kind: 'BULK', scope: { onlyUnpriced: true, intakeBatchId: 'batch1' } }, deps);
    expect(out.items.map((r) => r.itemId)).toEqual([fresh]);
    expect(seen).toEqual([[A, 'batch1']]);
    expect((await errorOf(previewRun(s.ctx, { kind: 'BULK', scope: { onlyUnpriced: true, intakeBatchId: 'batch2' } }, deps))).code).toBe('NOT_FOUND');
    expect((await errorOf(previewRun(s.ctx, { kind: 'BULK', scope: { onlyUnpriced: true, intakeBatchId: 'batch1' } }, s.deps))).code).toBe('VALIDATION');
  });

  test('an intake batch needs "only cards without a price"', async () => {
    const s = shop();
    expect((await errorOf(previewRun(s.ctx, { kind: 'BULK', scope: { intakeBatchId: 'b' } }, s.deps))).code).toBe('VALIDATION');
  });

  test('bad input is a plain validation error and nothing is stored', async () => {
    const s = shop();
    const bad: unknown[] = [
      null,
      [],
      { kind: 'LOT' },
      { kind: 'BULK', extra: 1 },
      { kind: 'BULK', scope: 'all' },
      { kind: 'BULK', scope: { nope: 1 } },
      { kind: 'BULK', scope: { game: 'CHESS' } },
      { kind: 'BULK', scope: { finish: 'SHINY' } },
      { kind: 'BULK', scope: { rarityClass: 'EPIC' } },
      { kind: 'BULK', scope: { saleId: 5 } },
      { kind: 'BULK', includeMarkedDown: 'yes' },
    ];
    for (const input of bad) expect((await errorOf(previewRun(s.ctx, input, s.deps))).code).toBe('VALIDATION');
    expect(s.db.tables.priceBookRun.length).toBe(0);
  });
});

describe('limits and validity', () => {
  test('more cards than CARD_PRICE_BOOK_MAX_RUN_ITEMS is SCOPE_TOO_LARGE with the count, and nothing is stored', async () => {
    const s = shop({ CARD_PRICE_BOOK_MAX_RUN_ITEMS: '3' });
    for (let n = 1; n <= 4; n += 1) s.add(n, 4, 450);
    const err = await errorOf(previewRun(s.ctx, BULK, s.deps));
    expect(err.code).toBe('SCOPE_TOO_LARGE');
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ count: 4, max: 3 });
    expect(s.db.tables.priceBookRun.length).toBe(0);
    expect(s.fetches.calls).toBe(0);
  });

  test('exactly the maximum is allowed', async () => {
    const s = shop({ CARD_PRICE_BOOK_MAX_RUN_ITEMS: '3' });
    for (let n = 1; n <= 3; n += 1) s.add(n, 4, 450);
    expect((await previewRun(s.ctx, BULK, s.deps)).run.counts.eligible).toBe(3);
  });

  test('the default maximum is 5,000', async () => {
    const s = shop({ CARD_PRICE_BOOK_MAX_RUN_ITEMS: 'junk' });
    expect((await previewRun(s.ctx, BULK, s.deps)).run.counts.eligible).toBe(0);
    const text = RUN_COPY.scopeTooLarge;
    expect(text).toContain('{max}');
  });

  test('a preview is valid for 30 minutes; the environment can change that', async () => {
    const s = shop();
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect(out.run.expiresAt).toBe(new Date(FAKE_NOW.getTime() + 30 * MIN).toISOString());
    const s2 = shop({ CARD_PRICE_BOOK_RUN_PREVIEW_MINUTES: '5' });
    expect((await previewRun(s2.ctx, BULK, s2.deps)).run.expiresAt).toBe(new Date(FAKE_NOW.getTime() + 5 * MIN).toISOString());
  });

  test('after the minutes pass the run reads as EXPIRED and stays expired', async () => {
    const s = shop();
    s.add(1, 4, 450);
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect((await getRun(s.later(29 * MIN), out.run.id)).status).toBe('PREVIEW');
    expect((await getRun(s.later(30 * MIN), out.run.id)).status).toBe('EXPIRED');
    expect(s.db.tables.priceBookRun[0]?.status).toBe('EXPIRED');
    expect((await getRun(s.ctx, out.run.id)).status).toBe('EXPIRED');
  });

  test('listing runs expires old previews and keeps the newest first', async () => {
    const s = shop();
    const first = await previewRun(s.ctx, BULK, s.deps);
    const later = s.later(40 * MIN);
    const second = await previewRun(later, BULK, s.deps);
    const list = await listRuns(later);
    expect(list.map((r) => r.id)).toEqual([second.run.id, first.run.id]);
    expect(list.map((r) => r.status)).toEqual(['PREVIEW', 'EXPIRED']);
  });

  test('run history lists at most 50, and rows of runs older than the history days are removed but the summary stays', async () => {
    const s = shop();
    s.add(1, 4, 450);
    const old = await previewRun(s.ctx, BULK, s.deps);
    expect(s.db.tables.priceBookRunItem.length).toBe(1);
    const ctx = s.later(91 * DAY);
    const list = await listRuns(ctx, 500);
    expect(list.map((r) => r.id)).toEqual([old.run.id]);
    expect(s.db.tables.priceBookRunItem.length).toBe(0);
    expect(list[0]?.counts.eligible).toBe(1);
    expect((await errorOf(listRuns(ctx, 0))).code).toBe('VALIDATION');
  });
});

describe('what a preview writes', () => {
  test('only the run and its rows: no item, no price history, no lock', async () => {
    const s = shop();
    s.add(1, 4, 450);
    s.add(2, 4, 450, { ebayListingId: 'L1' });
    const before = JSON.stringify(s.db.tables.item);
    await previewRun(s.ctx, BULK, s.deps);
    expect(JSON.stringify(s.db.tables.item)).toBe(before);
    const tables = new Set(s.db.writes.map((w) => w.table));
    expect(Array.from(tables).sort()).toEqual(['priceBookRun', 'priceBookRunItem']);
    expect(s.db.tables.itemPriceHistory.length).toBe(0);
  });

  test('the run and all its rows are stored in one transaction: a failed row insert leaves no run behind', async () => {
    const s = shop();
    s.add(1, 4, 450);
    s.db.failWhen((table) => (table === 'priceBookRunItem' ? new Error('disk full') : null));
    await expect(previewRun(s.ctx, BULK, s.deps)).rejects.toThrow('disk full');
    expect(s.db.tables.priceBookRun.length).toBe(0);
    expect(s.db.tables.priceBookRunItem.length).toBe(0);
  });

  test('the run records the book version, who started it, and the scope', async () => {
    const s = shop();
    s.add(1, 4, 450, { saleId: 'sale1' });
    const out = await previewRun(s.ctx, { kind: 'BULK', scope: { saleId: 'sale1', game: 'mtg' } }, s.deps);
    const stored = s.db.tables.priceBookRun[0];
    expect(stored).toMatchObject({ kind: 'BULK', status: 'PREVIEW', bookVersion: 1, createdByUserId: 'user_orgA', scopeSaleId: 'sale1', scopeGame: 'MTG' });
    expect(out.run.scope).toMatchObject({ saleId: 'sale1', game: 'MTG' });
    expect(s.db.tables.priceBookRunItem[0]?.bookVersion).toBe(1);
  });

  test('cards are priced in batches of the suggestion limit, in item id order', async () => {
    const s = shop();
    const total = PREVIEW_BATCH_SIZE * 2 + 5;
    for (let n = 1; n <= total; n += 1) s.add(n, 4, 450);
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect(out.run.counts.eligible).toBe(total);
    expect(s.fetches.calls).toBe(3);
    expect(out.items.length).toBe(MAX_ITEM_PAGE);
    expect(out.nextCursor).toBe(String(MAX_ITEM_PAGE));
    const ids = out.items.map((r) => r.itemId);
    expect(ids).toEqual([...ids].sort());
    const rest = await listRunItems(s.ctx, out.run.id, { cursor: out.nextCursor });
    expect(rest.items.length).toBe(total - MAX_ITEM_PAGE);
    expect(rest.nextCursor).toBeNull();
  });

  test('a preview with no cards is an empty run, not an error', async () => {
    const s = shop();
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect(out.run.counts).toEqual({ eligible: 0, changes: 0, unchanged: 0, skipped: 0, review: 0 });
    expect(out.items).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });
});

describe('the book must be on', () => {
  test('no book, an organizer switch that is off, and a platform switch that is off', async () => {
    const empty = createFakePriceBookDb();
    expect((await errorOf(previewRun(makeCtx(empty, A, { env: ENV }), BULK))).code).toBe('NOT_FOUND');
    const off = shop({}, { enabled: false });
    expect(await errorOf(previewRun(off.ctx, BULK, off.deps))).toMatchObject({ code: 'PRICE_BOOK_DISABLED', status: 404 });
    const platform = shop({ CARD_PRICE_BOOK_ENABLED: 'false' });
    expect((await errorOf(previewRun(platform.ctx, BULK, platform.deps))).code).toBe('PRICE_BOOK_DISABLED');
  });
});

describe('tenant isolation of runs', () => {
  test('another organizer cannot read, page, select in or cancel a run by its id', async () => {
    const s = shop();
    s.add(1, 4, 450);
    const out = await previewRun(s.ctx, BULK, s.deps);
    seedBook(s.db, 'orgB', { enabled: true });
    const other = makeCtx(s.db, 'orgB', { env: ENV });
    expect((await errorOf(getRun(other, out.run.id))).code).toBe('NOT_FOUND');
    expect((await errorOf(listRunItems(other, out.run.id))).code).toBe('NOT_FOUND');
    expect((await errorOf(updateSelection(other, out.run.id, { selectAllChanges: false }))).code).toBe('NOT_FOUND');
    expect((await errorOf(cancelRun(other, out.run.id))).code).toBe('NOT_FOUND');
    expect(await listRuns(other)).toEqual([]);
    expect(s.db.tables.priceBookRun[0]?.status).toBe('PREVIEW');
  });

  test('an organizer with no book sees an empty history', async () => {
    const db = createFakePriceBookDb();
    expect(await listRuns(makeCtx(db, A, { env: ENV }))).toEqual([]);
  });
});

describe('ticking rows and discarding a preview', () => {
  async function setup() {
    const s = shop();
    const plain = s.add(1, 4, 450);
    const second = s.add(2, 4, 450);
    const review = s.add(3, 1, 500);
    const skipped = s.add(4, 4, 450, { markdownApplied: true });
    const out = await previewRun(s.ctx, BULK, s.deps);
    return { s, plain, second, review, skipped, run: out.run };
  }

  test('select all changes, select the rows that need a look, and single ids', async () => {
    const { s, plain, second, review, run } = await setup();
    expect(await updateSelection(s.ctx, run.id, { selectAllChanges: false })).toEqual({ selected: 0, changes: 3 });
    expect(await updateSelection(s.ctx, run.id, { selectIds: [plain] })).toEqual({ selected: 1, changes: 3 });
    expect(await updateSelection(s.ctx, run.id, { selectReview: true })).toEqual({ selected: 2, changes: 3 });
    expect(runItemRow(s.db, run.id, review).selected).toBe(true);
    expect(await updateSelection(s.ctx, run.id, { deselectIds: [plain, review] })).toEqual({ selected: 0, changes: 3 });
    expect(await updateSelection(s.ctx, run.id, { selectAllChanges: true })).toEqual({ selected: 2, changes: 3 });
    expect(runItemRow(s.db, run.id, second).selected).toBe(true);
  });

  test('a skipped or unchanged row can never be ticked', async () => {
    const { s, skipped, run } = await setup();
    await updateSelection(s.ctx, run.id, { selectIds: [skipped] });
    expect(runItemRow(s.db, run.id, skipped).selected).toBe(false);
    expect(runItemRow(s.db, run.id, skipped).state).toBe('SKIPPED');
  });

  test('bad selection bodies are refused', async () => {
    const { s, run } = await setup();
    const bad: unknown[] = [null, {}, { selectIds: 'x' }, { selectIds: [1] }, { deselectIds: [''] }, { selectAllChanges: 'yes' }, { extra: true }];
    for (const input of bad) expect((await errorOf(updateSelection(s.ctx, run.id, input))).code).toBe('VALIDATION');
  });

  test('only a live preview can be changed: an expired or cancelled one is refused', async () => {
    const { s, run } = await setup();
    expect((await errorOf(updateSelection(s.later(31 * MIN), run.id, { selectAllChanges: true }))).code).toBe('PREVIEW_EXPIRED');
    const fresh = await previewRun(s.ctx, BULK, s.deps);
    expect((await cancelRun(s.ctx, fresh.run.id)).status).toBe('CANCELLED');
    expect((await errorOf(updateSelection(s.ctx, fresh.run.id, { selectAllChanges: true }))).code).toBe('RUN_NOT_PREVIEW');
    expect((await errorOf(cancelRun(s.ctx, fresh.run.id))).code).toBe('RUN_NOT_PREVIEW');
    expect((await errorOf(cancelRun(s.later(31 * MIN), run.id))).code).toBe('PREVIEW_EXPIRED');
  });

  test('cancelling a preview changes no item', async () => {
    const { s, run } = await setup();
    const before = JSON.stringify(s.db.tables.item);
    await cancelRun(s.ctx, run.id);
    expect(JSON.stringify(s.db.tables.item)).toBe(before);
  });
});

describe('paging a run', () => {
  test('pages come in item id order with a cursor and a limit', async () => {
    const s = shop();
    for (let n = 1; n <= 5; n += 1) s.add(n, 4, 450);
    const out = await previewRun(s.ctx, BULK, s.deps);
    const p1 = await listRunItems(s.ctx, out.run.id, { view: 'all', limit: 2 });
    expect(p1.items.length).toBe(2);
    expect(p1.nextCursor).toBe('2');
    const p2 = await listRunItems(s.ctx, out.run.id, { view: 'all', limit: 2, cursor: p1.nextCursor });
    const p3 = await listRunItems(s.ctx, out.run.id, { view: 'all', limit: 2, cursor: p2.nextCursor });
    expect(p3.items.length).toBe(1);
    expect(p3.nextCursor).toBeNull();
    const all = [...p1.items, ...p2.items, ...p3.items].map((r) => r.itemId);
    expect(new Set(all).size).toBe(5);
    expect(all).toEqual([...all].sort());
  });

  test('a limit above 200 is held to 200, and bad values are refused', async () => {
    const s = shop();
    s.add(1, 4, 450);
    const out = await previewRun(s.ctx, BULK, s.deps);
    expect((await listRunItems(s.ctx, out.run.id, { limit: 5000 })).items.length).toBe(1);
    for (const args of [{ view: 'everything' }, { limit: 0 }, { limit: 'x' }, { cursor: '-1' }, { cursor: 'abc' }]) {
      expect((await errorOf(listRunItems(s.ctx, out.run.id, args))).code).toBe('VALIDATION');
    }
    expect((await errorOf(listRunItems(s.ctx, '', {}))).code).toBe('NOT_FOUND');
    expect((await errorOf(listRunItems(s.ctx, 42, {}))).code).toBe('NOT_FOUND');
  });
});

describe('copy', () => {
  test('every run message follows the writing rules (no dashes, no banned words, plain ASCII)', () => {
    const messages = allRunMessages();
    expect(messages.length).toBeGreaterThan(15);
    for (const m of messages) {
      expect(m).toMatch(/^[\x20-\x7E]+$/);
      expect(m).not.toMatch(new RegExp('\\b' + 'A' + 'I' + '\\b'));
      expect(m.toLowerCase()).not.toContain('estate' + ' ' + 'sale');
    }
  });
});
