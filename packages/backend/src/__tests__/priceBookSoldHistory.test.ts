/**
 * ADR-140 AT-19: shop sold history (providers/soldHistory.ts and its use through suggestService).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook, seedCardItem, seedPrinting, seedPurchase } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { toBookSettings } from '../services/priceBook/bookService';
import type { BookRow, ProviderCard } from '../services/priceBook/db';
import { lookupKey } from '../services/priceBook/cardKey';
import { identityFromTyped } from '../services/priceBook/referenceService';
import { SOLD_HISTORY_SOURCES, isUsablePurchase, medianCents, soldHistoryProvider, unitPriceCents } from '../services/priceBook/providers/soldHistory';
import { suggest } from '../services/priceBook/suggestService';

const A = 'orgA';
const B = 'orgB';
const DAY = 24 * 60 * 60 * 1000;

function setup(overrides: AnyRow = {}) {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, overrides);
  seedPrinting(db, { id: 'SCRYFALL:p1', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', rarity: 'common', finishes: ['NONFOIL', 'FOIL'] });
  return { db, book };
}

interface Sale {
  cents: number;
  daysAgo?: number;
  org?: string;
  condition?: string | null;
  finish?: string;
  language?: string;
  purchase?: AnyRow;
  card?: AnyRow;
  item?: AnyRow;
}

/** One unit of the card sold on its own item. */
function sell(db: FakeDb, s: Sale): { item: AnyRow; purchase: AnyRow } {
  const org = s.org ?? A;
  const { item } = seedCardItem(
    db,
    org,
    { price: 5, ...(s.item ?? {}) },
    {
      catalogPrintingId: 'SCRYFALL:p1',
      cardName: 'Lightning Bolt',
      finish: s.finish ?? 'NONFOIL',
      language: s.language ?? 'en',
      conditionCode: s.condition === undefined ? 'NM' : s.condition,
      ...(s.card ?? {}),
    },
  );
  const purchase = seedPurchase(db, item.id as string, {
    amount: s.cents / 100,
    createdAt: new Date(FAKE_NOW.getTime() - (s.daysAgo ?? 1) * DAY),
    ...(s.purchase ?? {}),
  });
  return { item, purchase };
}

const boltCard = (over: Partial<ProviderCard> = {}): ProviderCard => ({
  cardKey: 'p:SCRYFALL:p1',
  finish: 'NONFOIL',
  language: 'en',
  catalogPrintingId: 'SCRYFALL:p1',
  game: 'MTG',
  rarityClass: 'COMMON',
  ...over,
});

async function history(db: FakeDb, book: AnyRow, org = A, card: ProviderCard = boltCard(), now = FAKE_NOW) {
  const settings = toBookSettings(book as unknown as BookRow);
  const map = await soldHistoryProvider.fetch({ db, organizerId: org, bookId: book.id as string, now, env: {}, book: settings }, [card]);
  return map.get(lookupKey(card.cardKey, card.finish, card.language)) ?? [];
}

describe('sold history: the number', () => {
  test('median of an odd count of sales', async () => {
    const { db, book } = setup();
    sell(db, { cents: 100, daysAgo: 3 });
    sell(db, { cents: 300, daysAgo: 2 });
    sell(db, { cents: 200, daysAgo: 1 });
    const out = await history(db, book);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'SHOP_SOLD_HISTORY', valueCents: 200, sampleCount: 3, origin: 'SHOP', label: 'Your last 3 sales (median)' });
    expect(out[0]?.asOf?.getTime()).toBe(FAKE_NOW.getTime() - 1 * DAY);
  });

  test('median of an even count is the average of the two middle values, half up', async () => {
    const { db, book } = setup();
    sell(db, { cents: 150 });
    sell(db, { cents: 251 });
    const out = await history(db, book);
    expect(out[0]?.valueCents).toBe(201); // (150 + 251) / 2 = 200.5 -> 201
    expect(out[0]?.sampleCount).toBe(2);
    expect(medianCents([1, 2, 3, 4])).toBe(3); // 2.5 -> 3
    expect(medianCents([5])).toBe(5);
    expect(medianCents([])).toBeNull();
  });

  test('fewer sales than the minimum give no candidate', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    expect(await history(db, book)).toEqual([]);
  });

  test('the minimum and maximum come from the book', async () => {
    const { db, book } = setup({ soldHistoryMinSales: 3, soldHistoryMaxSales: 3 });
    sell(db, { cents: 100, daysAgo: 1 });
    sell(db, { cents: 200, daysAgo: 2 });
    expect(await history(db, book)).toEqual([]);
    sell(db, { cents: 900, daysAgo: 3 });
    sell(db, { cents: 9000, daysAgo: 4 }); // the oldest of four: left out by the maximum of 3
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 200, sampleCount: 3 });
  });

  test('only the newest soldHistoryMaxSales sales are used', async () => {
    const { db, book } = setup();
    for (let i = 1; i <= 5; i += 1) sell(db, { cents: 1000, daysAgo: i });
    sell(db, { cents: 1, daysAgo: 6 });
    sell(db, { cents: 1, daysAgo: 7 });
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 1000, sampleCount: 5 });
  });

  test('the window comes from the book: a sale just inside counts, a sale just outside does not', async () => {
    const { db, book } = setup({ soldHistoryWindowDays: 30 });
    sell(db, { cents: 400, daysAgo: 30 });
    sell(db, { cents: 600, daysAgo: 29 });
    sell(db, { cents: 100000, daysAgo: 31 });
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 500, sampleCount: 2 });
  });

  test('a sale is converted to its Near Mint equivalent by the condition multiplier, half up', async () => {
    const { db, book } = setup();
    sell(db, { cents: 900, condition: 'LP' }); // 900 / 0.90 = 1000
    sell(db, { cents: 1000, condition: 'NM' });
    sell(db, { cents: 1000, condition: null }); // blank counts as NM
    const out = await history(db, book);
    expect(out[0]?.valueCents).toBe(1000);
    const odd = setup();
    sell(odd.db, { cents: 1001, condition: 'LP' }); // 1001 / 0.9 = 1112.2 -> 1112
    sell(odd.db, { cents: 1004, condition: 'LP' }); // 1004 / 0.9 = 1115.6 -> 1116
    expect((await history(odd.db, odd.book))[0]?.valueCents).toBe(1114); // (1112 + 1116) / 2
  });

  test('the multipliers are the book\'s own', async () => {
    const { db, book } = setup({ condLpBps: 8000 });
    sell(db, { cents: 800, condition: 'LP' });
    sell(db, { cents: 800, condition: 'LP' });
    expect((await history(db, book))[0]?.valueCents).toBe(1000);
  });

  test('the cashier discount is added back', async () => {
    const { db, book } = setup();
    sell(db, { cents: 900, purchase: { discountAmountCents: 100 } });
    sell(db, { cents: 800, purchase: { discountAmountCents: 100, cashierDiscretionAmountCents: 100 } });
    sell(db, { cents: 1000 });
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 1000, sampleCount: 3 });
    expect(unitPriceCents({ amount: 9, discountAmountCents: 100, cashierDiscretionAmountCents: null })).toBe(1000);
    expect(unitPriceCents({ amount: 9, discountAmountCents: null, cashierDiscretionAmountCents: 25 })).toBe(925);
    expect(unitPriceCents({ amount: -1, discountAmountCents: null, cashierDiscretionAmountCents: null })).toBeNull();
  });
});

describe('sold history: rows that never count', () => {
  async function onlyGoodOnes(db: FakeDb, book: AnyRow): Promise<number> {
    const out = await history(db, book);
    return out[0]?.sampleCount ?? 0;
  }

  test('lot rows (bulkQuantity), test rows, refunded rows and unpaid rows are excluded', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { cents: 99999, purchase: { bulkQuantity: 500 } });
    sell(db, { cents: 99999, purchase: { isTestTransaction: true } });
    sell(db, { cents: 99999, purchase: { refundedAmount: 5 } });
    sell(db, { cents: 99999, purchase: { status: 'REFUNDED' } });
    sell(db, { cents: 99999, purchase: { status: 'PENDING' } });
    sell(db, { cents: 99999, purchase: { status: 'FAILED' } });
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 500, sampleCount: 2 });
  });

  test('a refundedAmount of zero is not a refund', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500, purchase: { refundedAmount: 0 } });
    sell(db, { cents: 500 });
    expect(await onlyGoodOnes(db, book)).toBe(2);
  });

  test('ONLINE rows are not used (amount not verified to exclude shipping and fees); only POS is', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { cents: 99999, purchase: { source: 'ONLINE' } });
    expect(SOLD_HISTORY_SOURCES).toEqual(['POS']);
    expect(await onlyGoodOnes(db, book)).toBe(2);
  });

  test('a row with no item is excluded', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    seedPurchase(db, null, { amount: 999 });
    expect(await onlyGoodOnes(db, book)).toBe(0); // one real sale is below the minimum of 2
    expect(isUsablePurchase({ id: 'x', itemId: null, amount: 1, status: 'PAID', source: 'POS', isTestTransaction: false, bulkQuantity: null, refundedAmount: null, discountAmountCents: null, cashierDiscretionAmountCents: null, createdAt: FAKE_NOW })).toBe(false);
  });

  test('another organizer\'s items and sales are never read', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { org: B, cents: 99999 });
    sell(db, { org: B, cents: 99999 });
    sell(db, { org: B, cents: 99999 });
    const out = await history(db, book);
    expect(out[0]).toMatchObject({ valueCents: 500, sampleCount: 2 });
    // And organizer B asking about the same card sees only B's own sales.
    const bBook = seedBook(db, B);
    const asB = await history(db, bBook, B);
    expect(asB[0]).toMatchObject({ valueCents: 99999, sampleCount: 3 });
  });

  test('an item whose card record names this organizer but whose item belongs to another is excluded', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { cents: 99999, item: { organizerId: B }, card: { organizerId: A } });
    expect(await onlyGoodOnes(db, book)).toBe(2);
  });

  test('graded cards and cards of another finish or language do not count', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { cents: 99999, card: { grader: 'PSA' } });
    sell(db, { cents: 99999, finish: 'FOIL' });
    sell(db, { cents: 99999, language: 'ja' });
    expect(await onlyGoodOnes(db, book)).toBe(2);
    const foil = await history(db, book, A, boltCard({ finish: 'FOIL' }));
    expect(foil).toEqual([]); // one foil sale is below the minimum
    expect(await history(db, book, A, boltCard({ graded: true }))).toEqual([]);
  });

  test('an unknown condition code is skipped rather than guessed', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 500 });
    sell(db, { cents: 99999, condition: 'MINT' });
    expect(await onlyGoodOnes(db, book)).toBe(2);
  });

  test('a free sale (amount zero) is skipped', async () => {
    const { db, book } = setup();
    sell(db, { cents: 500 });
    sell(db, { cents: 0 });
    expect(await onlyGoodOnes(db, book)).toBe(0);
  });
});

describe('sold history: typed cards', () => {
  test('a typed card matches stock by set code, collector number and name', async () => {
    const db = createFakePriceBookDb();
    const book = seedBook(db, A);
    const identity = identityFromTyped({ game: 'POKEMON', setCode: 'BASE1', collectorNumber: '4/102', cardName: 'Charizard' });
    const typedCard: AnyRow = { game: 'POKEMON', setCode: 'base1', collectorNumber: '4', cardName: 'Charizard', finish: 'HOLO', catalogPrintingId: null };
    for (const cents of [10000, 12000]) {
      const { item } = seedCardItem(db, A, { price: 100 }, typedCard);
      seedPurchase(db, item.id as string, { amount: cents / 100 });
    }
    const { item: other } = seedCardItem(db, A, { price: 100 }, { ...typedCard, cardName: 'Blastoise' });
    seedPurchase(db, other.id as string, { amount: 999 });
    const card: ProviderCard = { cardKey: identity.cardKey, finish: 'HOLO', language: 'en', game: 'POKEMON', setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard' };
    const out = await history(db, book, A, card);
    expect(out[0]).toMatchObject({ valueCents: 11000, sampleCount: 2 });
  });
});

describe('sold history through the suggestion', () => {
  const asBolt = { printingId: 'SCRYFALL:p1', finish: 'NONFOIL', conditionCode: 'NM', language: 'en' };

  test('two sales: the price comes from sold history and carries the low sample review reason', async () => {
    const { db } = setup();
    sell(db, { cents: 1000, daysAgo: 2 });
    sell(db, { cents: 1200, daysAgo: 5 });
    const out = await suggest(makeCtx(db, A), [asBolt], { family: 'RETAIL' });
    const s = out.results[0]?.suggestion;
    expect(s?.ok).toBe(true);
    expect(s?.priceSource).toBe('SHOP_SOLD_HISTORY');
    expect(s?.referenceCents).toBe(1100);
    expect(s?.referenceSampleCount).toBe(2);
    expect(s?.review.reasons).toContain('LOW_SAMPLE');
    expect(s?.priceAsOf).toBe(new Date(FAKE_NOW.getTime() - 2 * DAY).toISOString());
    expect(s?.trace[0]?.step).toBe('REFERENCE');
  });

  test('three sales: no low sample reason', async () => {
    const { db } = setup();
    for (const cents of [1000, 1100, 1200]) sell(db, { cents });
    const out = await suggest(makeCtx(db, A), [asBolt], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.review.reasons).not.toContain('LOW_SAMPLE');
    expect(out.results[0]?.suggestion.referenceCents).toBe(1100);
  });

  test('a typed price comes before sold history (the default order)', async () => {
    const { db, book } = setup();
    sell(db, { cents: 1000 });
    sell(db, { cents: 1200 });
    db.insert('priceBookReference', { bookId: book.id, cardKey: 'p:SCRYFALL:p1', game: 'MTG', finish: 'NONFOIL', language: 'en', valueCents: 777, asOf: FAKE_NOW });
    const out = await suggest(makeCtx(db, A), [asBolt], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.priceSource).toBe('MANUAL');
    expect(out.results[0]?.suggestion.referenceCents).toBe(777);
  });
});

describe('sold history: the finding about Purchase.amount is recorded in the code', () => {
  test('the comment states the per unit finding and the lot exclusion', () => {
    const text = readFileSync(join(__dirname, '..', 'services', 'priceBook', 'providers', 'soldHistory.ts'), 'utf8');
    expect(text).toContain('FINDING: what Purchase.amount means');
    expect(text).toContain('ONE unit per row');
    expect(text).toContain('bulkQuantity IS NULL');
    expect(text).toContain('source POS');
  });
});
