/**
 * ADR-140 B3a: suggestService, the providers (manual, benchmark, catalog, licensed feed), the registry's use of the terms guard,
 * price locks and the hand edit rule, and a few pins to code outside the price book.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CARD_GAMES } from '../constants/cardVocabulary';
import { FINISH_PRICE_FIELD } from '../services/cardCatalog/cardPriceSuggestionService';
import { MIN_CARD_SALE_CENTS } from '../utils/feeCalculator';
import { createFakePriceBookDb, FAKE_NOW, makeCtx, seedBook, seedCardItem, seedLock, seedPrinting, seedReference } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';
import { toBookSettings } from '../services/priceBook/bookService';
import type { BookRow, PriceBookTx, ProviderCard } from '../services/priceBook/db';
import { lookupKey } from '../services/priceBook/cardKey';
import { listLocks, resolveLocks, setLock } from '../services/priceBook/lockService';
import { benchmarkProvider } from '../services/priceBook/providers/benchmark';
import { CATALOG_FINISH_FIELD, catalogReferenceProvider } from '../services/priceBook/providers/catalogReference';
import { licensedFeedProvider } from '../services/priceBook/providers/licensedFeed';
import { manualProvider } from '../services/priceBook/providers/manual';
import { ALL_PROVIDERS, activeProviders } from '../services/priceBook/providers/registry';
import { CATALOG_REFERENCE_SWITCH } from '../services/priceBook/providers/types';
import type { ReferenceProvider } from '../services/priceBook/providers/types';
import { KNOWN_GAMES } from '../services/priceBook/referenceService';
import { DEFAULT_MIN_CARD_SALE_CENTS, MAX_SUGGEST_CARDS, suggest, suggestForRoute, suggestOne } from '../services/priceBook/suggestService';
import type { ReferenceCandidate } from '../services/priceBook/types';

const A = 'orgA';
const B = 'orgB';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function shop(bookOverrides: AnyRow = {}) {
  const db = createFakePriceBookDb();
  const book = seedBook(db, A, bookOverrides);
  seedPrinting(db, { id: 'SCRYFALL:p1', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', rarity: 'common', finishes: ['NONFOIL', 'FOIL'] });
  return { db, book, bookId: book.id as string, ctx: makeCtx(db, A) };
}

const bolt = (extra: AnyRow = {}) => ({ printingId: 'SCRYFALL:p1', finish: 'NONFOIL', conditionCode: 'NM', language: 'en', ...extra });

const settingsOf = (book: AnyRow) => toBookSettings(book as unknown as BookRow);

function pcard(over: Partial<ProviderCard> = {}): ProviderCard {
  return { cardKey: 'p:SCRYFALL:p1', finish: 'NONFOIL', language: 'en', catalogPrintingId: 'SCRYFALL:p1', game: 'MTG', rarityClass: 'COMMON', ...over };
}

async function fetchFrom(provider: ReferenceProvider<PriceBookTx>, db: FakeDb, book: AnyRow, card: ProviderCard, env: Record<string, string | undefined> = {}) {
  const map = await provider.fetch({ db, organizerId: A, bookId: book.id as string, now: FAKE_NOW, env, book: settingsOf(book) }, [card]);
  return map.get(lookupKey(card.cardKey, card.finish, card.language)) ?? [];
}

function spy(kind: ReferenceProvider['kind'], status: 'CLEARED' | 'CONDITIONAL' | 'NOT_CLEARED', value: number, active = true) {
  const state = { calls: 0, lastCards: [] as ProviderCard[] };
  const provider: ReferenceProvider<PriceBookTx> = {
    kind,
    terms: { status, reviewedOn: null, reference: 'test' },
    isActive: () => active,
    async fetch(_ctx, cards) {
      state.calls += 1;
      state.lastCards = cards;
      const out = new Map<string, ReferenceCandidate[]>();
      for (const c of cards) out.set(lookupKey(c.cardKey, c.finish, c.language), [{ kind, valueCents: value, asOf: FAKE_NOW, origin: 'TEST', label: 'Test number' }]);
      return out;
    },
  };
  return { provider, state };
}

describe('the terms guard in use', () => {
  const allOn = { CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'true', LICENSED_FEED_ENABLED: 'true', CARD_PRICE_BOOK_ENABLED: 'true' };

  test('the registry returns the real providers in the book\'s order, and never the licensed feed', () => {
    const { book } = shop({ allowCatalogReference: true });
    const kinds = activeProviders(allOn, settingsOf(book)).map((p) => p.kind);
    expect(kinds).toEqual(['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE']);
    expect(licensedFeedProvider.terms.status).toBe('NOT_CLEARED');
    expect(ALL_PROVIDERS.map((p) => p.kind).sort()).toEqual(['CATALOG_REFERENCE', 'LICENSED_FEED', 'MANUAL', 'SHOP_BENCHMARK', 'SHOP_SOLD_HISTORY']);
  });

  test('a kind that is not in the book\'s order is not used; the order is the book\'s', () => {
    const { book } = shop({ referenceOrder: ['SHOP_BENCHMARK', 'MANUAL'] });
    expect(activeProviders({}, settingsOf(book)).map((p) => p.kind)).toEqual(['SHOP_BENCHMARK', 'MANUAL']);
  });

  test('the catalog provider needs the platform switch (unset means on) AND the book\'s opt-in', () => {
    const optedIn = shop({ allowCatalogReference: true }).book;
    const optedOut = shop({ allowCatalogReference: false }).book;
    const has = (env: Record<string, string | undefined>, book: AnyRow) => activeProviders(env, settingsOf(book)).some((p) => p.kind === 'CATALOG_REFERENCE');
    expect(has({}, optedIn)).toBe(true);
    expect(has({ [CATALOG_REFERENCE_SWITCH]: 'false' }, optedIn)).toBe(false);
    expect(has({ [CATALOG_REFERENCE_SWITCH]: '0' }, optedIn)).toBe(false);
    expect(has({}, optedOut)).toBe(false);
    expect(has({ [CATALOG_REFERENCE_SWITCH]: 'true' }, optedOut)).toBe(false);
  });

  test('suggest never calls a not cleared provider, even one that says it is active and is first in the order', async () => {
    const { ctx } = shop({ referenceOrder: ['LICENSED_FEED', 'MANUAL'] });
    const licensed = spy('LICENSED_FEED', 'NOT_CLEARED', 99999);
    const out = await suggest({ ...ctx, env: allOn }, [bolt()], { family: 'RETAIL', providers: [licensed.provider, manualProvider] });
    expect(licensed.state.calls).toBe(0);
    expect(out.results[0]?.suggestion.code).toBe('NO_REFERENCE');
  });

  test('a cleared provider that is switched off is not called either', async () => {
    const { ctx } = shop();
    const off = spy('MANUAL', 'CLEARED', 700, false);
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL', providers: [off.provider] });
    expect(off.state.calls).toBe(0);
    expect(out.results[0]?.suggestion.ok).toBe(false);
  });

  test('providers are asked once for all the cards, with each distinct card once', async () => {
    const { ctx } = shop();
    const p = spy('MANUAL', 'CLEARED', 700);
    const out = await suggest(ctx, [bolt(), bolt({ ref: 'dup' }), bolt({ finish: 'FOIL' })], { family: 'RETAIL', providers: [p.provider] });
    expect(p.state.calls).toBe(1);
    expect(p.state.lastCards.map((c) => lookupKey(c.cardKey, c.finish, c.language)).sort()).toEqual(['p:SCRYFALL:p1|FOIL|en', 'p:SCRYFALL:p1|NONFOIL|en']);
    expect(out.results.map((r) => r.suggestion.referenceCents)).toEqual([700, 700, 700]);
  });

  test('a provider that fails is reported and the others still answer', async () => {
    const { ctx } = shop();
    const broken: ReferenceProvider<PriceBookTx> = { ...spy('SHOP_SOLD_HISTORY', 'CLEARED', 1).provider, fetch: async () => { throw new Error('db down'); } };
    const good = spy('MANUAL', 'CLEARED', 700);
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL', providers: [broken, good.provider] });
    expect(out.unavailable).toEqual(['SHOP_SOLD_HISTORY']);
    expect(out.results[0]?.suggestion.referenceCents).toBe(700);
  });

  test('the licensed feed stub returns nothing and purges nothing', async () => {
    const { db, book } = shop();
    expect(await fetchFrom(licensedFeedProvider, db, book, pcard(), allOn)).toEqual([]);
    expect(licensedFeedProvider.isActive({ env: allOn, book: settingsOf(book) })).toBe(false);
    await expect(licensedFeedProvider.purge?.({ db, organizerId: A, bookId: 'x', now: FAKE_NOW, env: {}, book: settingsOf(book) })).resolves.toBeUndefined();
  });
});

describe('the typed price provider', () => {
  test('returns the exact finish and language, with the shop\'s note as typed', async () => {
    const { db, book, bookId } = shop();
    seedReference(db, bookId, { valueCents: 321, note: '<b>binder</b>', asOf: new Date(FAKE_NOW.getTime() - 2 * DAY) });
    seedReference(db, bookId, { finish: 'FOIL', valueCents: 999 });
    const got = await fetchFrom(manualProvider, db, book, pcard());
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: 'MANUAL', valueCents: 321, origin: 'SHOP', label: 'Your typed price', note: '<b>binder</b>', finish: 'NONFOIL', language: 'en' });
    expect(got[0]?.asOf?.getTime()).toBe(FAKE_NOW.getTime() - 2 * DAY);
  });

  test('a card in another language also gets the English price of the same card, marked English; the exact language wins', async () => {
    const { db, ctx, bookId } = shop();
    seedReference(db, bookId, { language: 'en', valueCents: 1000 });
    const english = await suggest(ctx, [bolt({ language: 'ja' })], { family: 'RETAIL' });
    expect(english.results[0]?.suggestion.referenceCents).toBe(1000);
    seedReference(db, bookId, { language: 'ja', valueCents: 400 });
    const exact = await suggest(ctx, [bolt({ language: 'ja' })], { family: 'RETAIL' });
    expect(exact.results[0]?.suggestion.referenceCents).toBe(400);
    const other = await suggest(ctx, [bolt({ language: 'de' })], { family: 'RETAIL' });
    expect(other.results[0]?.suggestion.referenceCents).toBe(1000);
  });

  test('a price in a different finish is never used for this finish', async () => {
    const { db, ctx, bookId } = shop();
    seedReference(db, bookId, { finish: 'FOIL', valueCents: 999 });
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.code).toBe('NO_REFERENCE');
  });
});

describe('the benchmark provider', () => {
  const holo = (over: Partial<ProviderCard> = {}): ProviderCard => ({
    cardKey: 's:base1|4|charizard|',
    finish: 'HOLO',
    language: 'en',
    game: 'POKEMON',
    rarityClass: 'RARE',
    ...over,
  });

  test('returns the exact finish and the ANY finish for the card\'s game and rarity class', async () => {
    const { db, book, bookId } = shop();
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 200, note: 'typical' });
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'ANY', valueCents: 150 });
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'COMMON', finish: 'HOLO', valueCents: 5 });
    db.insert('priceBookBenchmark', { bookId, game: 'MTG', rarityClass: 'RARE', finish: 'HOLO', valueCents: 7 });
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'REVERSE_HOLO', valueCents: 9 });
    const got = await fetchFrom(benchmarkProvider, db, book, holo());
    expect(got.map((c) => [c.finish, c.valueCents]).sort()).toEqual([['ANY', 150], ['HOLO', 200]]);
    expect(got.every((c) => c.kind === 'SHOP_BENCHMARK' && c.origin === 'SHOP' && c.label === 'Your benchmark for this kind of card')).toBe(true);
  });

  test('an unknown rarity class has no benchmark; the engine prefers the exact finish over ANY', async () => {
    const { db, book, bookId, ctx } = shop();
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'ANY', valueCents: 150 });
    expect(await fetchFrom(benchmarkProvider, db, book, holo({ rarityClass: 'UNKNOWN' }))).toEqual([]);
    expect(await fetchFrom(benchmarkProvider, db, book, holo({ rarityClass: undefined }))).toEqual([]);
    const typed = { typed: { setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', rarity: 'Rare' }, game: 'POKEMON', finish: 'HOLO', conditionCode: 'NM' };
    const anyOnly = await suggest(ctx, [typed], { family: 'RETAIL' });
    expect(anyOnly.results[0]?.suggestion).toMatchObject({ priceSource: 'SHOP_BENCHMARK', referenceCents: 150 });
    db.insert('priceBookBenchmark', { bookId, game: 'POKEMON', rarityClass: 'RARE', finish: 'HOLO', valueCents: 220 });
    const exact = await suggest(ctx, [typed], { family: 'RETAIL' });
    expect(exact.results[0]?.suggestion.referenceCents).toBe(220);
  });

  test('the book\'s order decides between a typed price and a benchmark, and a rule can restrict the sources', async () => {
    const { db, bookId, ctx } = shop({ referenceOrder: ['SHOP_BENCHMARK', 'MANUAL'] });
    db.insert('priceBookBenchmark', { bookId, game: 'MTG', rarityClass: 'COMMON', finish: 'ANY', valueCents: 50 });
    seedReference(db, bookId, { valueCents: 700 });
    const first = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(first.results[0]?.suggestion).toMatchObject({ priceSource: 'SHOP_BENCHMARK', referenceCents: 50 });
    db.insert('priceBookRule', { bookId, family: 'RETAIL', name: 'Typed only', priority: 10, sourceKinds: ['MANUAL'] });
    const restricted = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(restricted.results[0]?.suggestion).toMatchObject({ priceSource: 'MANUAL', referenceCents: 700 });
  });
});

describe('the catalog provider', () => {
  function withPrice(bookOverrides: AnyRow = { allowCatalogReference: true }, price: AnyRow = {}, printing: AnyRow = {}) {
    const s = shop(bookOverrides);
    if (Object.keys(printing).length > 0) s.db.tables.cardPrinting[0] && Object.assign(s.db.tables.cardPrinting[0], printing);
    s.db.insert('cardPrice', { printingId: 'SCRYFALL:p1', usd: '1.25', usdFoil: 3, usdEtched: null, usdReverse: null, asOf: new Date(FAKE_NOW.getTime() - HOUR), ...price });
    return s;
  }

  test('gives the Scryfall number for the finish, as a catalog estimate with its warning and origin', async () => {
    const { ctx } = withPrice();
    const out = await suggest(ctx, [bolt(), bolt({ finish: 'FOIL' })], { family: 'RETAIL' });
    const [plain, foil] = out.results.map((r) => r.suggestion);
    expect(plain).toMatchObject({ ok: true, priceSource: 'CATALOG_REFERENCE', referenceCents: 125, referenceOrigin: 'SCRYFALL' });
    expect(foil?.referenceCents).toBe(300);
    expect(plain?.warnings.map((w) => w.code)).toContain('CATALOG_ESTIMATE');
    expect(plain?.referenceLabel).toBe('Catalog estimate (marketplace data carried by Scryfall)');
  });

  test('reads money columns that are strings or Decimal objects', async () => {
    const { db, book } = withPrice({ allowCatalogReference: true }, { usd: { toNumber: () => 2.5, toString: () => '2.50' } });
    const got = await fetchFrom(catalogReferenceProvider, db, book, pcard());
    expect(got[0]?.valueCents).toBe(250);
  });

  test('off when the platform switch is false, and off when the book has not opted in', async () => {
    const on = withPrice();
    expect(on.ctx).toBeDefined();
    const off = await suggest({ ...on.ctx, env: { [CATALOG_REFERENCE_SWITCH]: 'false' } }, [bolt()], { family: 'RETAIL' });
    expect(off.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    const optedOut = withPrice({ allowCatalogReference: false });
    const out = await suggest(optedOut.ctx, [bolt()], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    // Even when called directly, the provider checks both switches itself.
    expect(await fetchFrom(catalogReferenceProvider, optedOut.db, optedOut.book, pcard())).toEqual([]);
    expect(await fetchFrom(catalogReferenceProvider, on.db, on.book, pcard(), { [CATALOG_REFERENCE_SWITCH]: 'false' })).toEqual([]);
  });

  test('a printing that is not from Scryfall is refused, even with a price row', async () => {
    const { db, book, ctx } = withPrice({ allowCatalogReference: true }, {}, { source: 'TCGCSV' });
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard())).toEqual([]);
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    for (const source of ['tcgcsv', 'TCGDEX', '', 'SCRYFALL2']) {
      Object.assign(db.tables.cardPrinting[0] as AnyRow, { source });
      expect(await fetchFrom(catalogReferenceProvider, db, book, pcard())).toEqual([]);
    }
    Object.assign(db.tables.cardPrinting[0] as AnyRow, { source: 'scryfall' });
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard())).toHaveLength(1);
  });

  test('English only, and never for a graded card', async () => {
    const { db, book, ctx } = withPrice();
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard({ language: 'ja' }))).toEqual([]);
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard({ graded: true }))).toEqual([]);
    const out = await suggest(ctx, [bolt({ language: 'ja' }), bolt({ graded: true })], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    expect(out.results[1]?.suggestion.code).toBe('GRADED_NOT_SUPPORTED');
  });

  test('a finish the printing does not come in, a missing column and a zero price give nothing', async () => {
    const { db, book } = withPrice({ allowCatalogReference: true }, { usdEtched: 9, usd: 0 });
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard({ finish: 'ETCHED' }))).toEqual([]); // printing has no etched finish
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard())).toEqual([]); // usd is zero
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard({ finish: 'REVERSE_HOLO' }))).toEqual([]);
    expect(await fetchFrom(catalogReferenceProvider, db, book, pcard({ cardKey: 's:x|1|y|', catalogPrintingId: null }))).toEqual([]);
  });

  test('HOLO is priced from the foil column of a foil printing', async () => {
    const { db, book } = withPrice();
    const got = await fetchFrom(catalogReferenceProvider, db, book, pcard({ finish: 'HOLO' }));
    expect(got[0]?.valueCents).toBe(300);
  });

  test('an old catalog number warns after 48 hours and is not used after 14 days', async () => {
    const warn = withPrice({ allowCatalogReference: true }, { asOf: new Date(FAKE_NOW.getTime() - 3 * DAY) });
    const w = await suggest(warn.ctx, [bolt()], { family: 'RETAIL' });
    expect(w.results[0]?.suggestion.ok).toBe(true);
    expect(w.results[0]?.suggestion.warnings.map((x) => x.code)).toEqual(expect.arrayContaining(['CATALOG_ESTIMATE', 'REFERENCE_OLD']));
    const dead = withPrice({ allowCatalogReference: true }, { asOf: new Date(FAKE_NOW.getTime() - 15 * DAY) });
    const d = await suggest(dead.ctx, [bolt()], { family: 'RETAIL' });
    expect(d.results[0]?.suggestion.code).toBe('NO_REFERENCE');
    expect(d.results[0]?.suggestion.warnings.map((x) => x.code)).toContain('REFERENCE_TOO_OLD');
  });

  test('a typed price comes before the catalog number', async () => {
    const { db, bookId, ctx } = withPrice();
    seedReference(db, bookId, { valueCents: 777 });
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion).toMatchObject({ priceSource: 'MANUAL', referenceCents: 777 });
  });
});

describe('suggest: the result block', () => {
  test('carries the source, date, reference, rule, trace, warnings and words', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 1200, asOf: new Date(FAKE_NOW.getTime() - 3 * DAY), note: 'binder A' });
    db.insert('priceBookRule', { bookId, family: 'RETAIL', name: 'Mine', priority: 10, percentBps: 9500, roundingMode: 'NEAREST_25C', roundingDirection: 'NEAREST' });
    const out = await suggest(ctx, [bolt({ ref: 'a1', conditionCode: 'LP' })], { family: 'RETAIL' });
    const row = out.results[0];
    expect(out.bookVersion).toBe(1);
    expect(row?.ref).toBe('a1');
    expect(row?.card).toMatchObject({ cardKey: 'p:SCRYFALL:p1', game: 'MTG', finish: 'NONFOIL', language: 'en', conditionCode: 'LP', graded: false });
    const s = row?.suggestion;
    expect(s).toMatchObject({
      ok: true,
      family: 'RETAIL',
      priceCents: 1025, // 1200 x 95 percent = 1140, x 90 percent (LP) = 1026, nearest 25 cents = 1025
      priceSource: 'MANUAL',
      priceAsOf: new Date(FAKE_NOW.getTime() - 3 * DAY).toISOString(),
      referenceCents: 1200,
      referenceOrigin: 'SHOP',
      referenceLabel: 'Your typed price',
      referenceNote: 'binder A',
      applyAllowed: true,
      lockedReason: null,
    });
    expect(s?.rule).toMatchObject({ name: 'Mine', bookVersion: 1, isDefault: false });
    expect(s?.trace.map((t) => t.step)).toEqual(['REFERENCE', 'PERCENT', 'CONDITION', 'ROUND']);
    expect(Array.isArray(s?.warnings)).toBe(true);
    expect(s?.why).toContain('Mine');
  });

  test('an item gives the current price, cost and lock; a card record fills in what was not sent', async () => {
    const { db, bookId, ctx } = shop();
    const { item } = seedCardItem(db, A, { price: 12.5, costBasis: 4 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt', finish: 'FOIL', conditionCode: 'MP' });
    seedReference(db, bookId, { finish: 'FOIL', valueCents: 1250 });
    const out = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    const row = out.results[0];
    expect(row?.itemId).toBe(item.id);
    expect(row?.card).toMatchObject({ finish: 'FOIL', conditionCode: 'MP', language: 'en' });
    expect(row?.suggestion.referenceCents).toBe(1250);
    // A request field wins over the card record.
    const sent = await suggest(ctx, [{ itemId: item.id as string, conditionCode: 'NM' }], { family: 'RETAIL' });
    expect(sent.results[0]?.card.conditionCode).toBe('NM');
    expect(sent.results[0]?.suggestion.priceCents).toBe(1250);
  });

  test('printingId wins over typed details; a typed card and an unknown printing', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 500 });
    const both = await suggest(ctx, [bolt({ typed: { cardName: 'Something else' }, game: 'POKEMON' })], { family: 'RETAIL' });
    expect(both.results[0]?.card.cardKey).toBe('p:SCRYFALL:p1');
    expect(both.results[0]?.suggestion.referenceCents).toBe(500);
    const unknown = await suggest(ctx, [{ printingId: 'SCRYFALL:nope', finish: 'NONFOIL', conditionCode: 'NM' }], { family: 'RETAIL' });
    expect(unknown.results[0]?.suggestion).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(unknown.results[0]?.card.cardKey).toBeNull();
    const nothing = await suggest(ctx, [{ finish: 'NONFOIL', conditionCode: 'NM' }], { family: 'RETAIL' });
    expect(nothing.results[0]?.suggestion.code).toBe('INVALID_INPUT');
    db.insert('priceBookReference', { bookId, cardKey: 's:base1|4|charizard|', game: 'POKEMON', finish: 'HOLO', language: 'en', valueCents: 4000, asOf: FAKE_NOW });
    const typed = await suggest(ctx, [{ game: 'pokemon', typed: { setCode: 'BASE1', collectorNumber: '4/102', cardName: 'Charizard' }, finish: 'holo', conditionCode: 'nm' }], { family: 'RETAIL' });
    expect(typed.results[0]?.suggestion.referenceCents).toBe(4000);
  });

  test('graded cards are not priced and no provider is asked about them', async () => {
    const { ctx } = shop();
    const p = spy('MANUAL', 'CLEARED', 700);
    const out = await suggest(ctx, [bolt({ graded: true, conditionCode: null })], { family: 'RETAIL', providers: [p.provider] });
    expect(out.results[0]?.suggestion.code).toBe('GRADED_NOT_SUPPORTED');
    expect(p.state.calls).toBe(0);
  });

  test('quantity makes a line total; a bad quantity is INVALID_INPUT', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 1000 });
    const out = await suggest(ctx, [bolt({ quantity: 3 }), bolt({ quantity: 0 })], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion).toMatchObject({ priceCents: 1000, lineCents: 3000 });
    expect(out.results[1]?.suggestion.code).toBe('INVALID_INPUT');
  });

  test('the buying family returns a cash offer and a store credit offer', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 1000 });
    const none = await suggest(ctx, [bolt()], { family: 'BUYLIST' });
    expect(none.results[0]?.suggestion.code).toBe('NO_RULE');
    db.insert('priceBookRule', { bookId, family: 'BUYLIST', name: 'Buy', priority: 10, percentBps: 5000, roundingMode: 'NEAREST_5C', roundingDirection: 'DOWN' });
    const out = await suggest(ctx, [bolt()], { family: 'BUYLIST' });
    expect(out.results[0]?.suggestion).toMatchObject({ ok: true, family: 'BUYLIST', priceCents: 500, creditCents: 600 });
  });

  test('limits and errors: 1 to 100 cards, a known family, a book that exists, items that exist', async () => {
    const { ctx } = shop();
    expect(MAX_SUGGEST_CARDS).toBe(100);
    await expect(suggest(ctx, [], { family: 'RETAIL' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(suggest(ctx, 'nope', { family: 'RETAIL' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(suggest(ctx, [1], { family: 'RETAIL' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(suggest(ctx, Array.from({ length: 101 }, () => bolt()), { family: 'RETAIL' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await suggest(ctx, Array.from({ length: 100 }, () => bolt()), { family: 'RETAIL' })).results).toHaveLength(100);
    await expect(suggest(ctx, [bolt()], { family: 'SELL' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(suggest(ctx, [{ itemId: 'item_nope' }], { family: 'RETAIL' })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    const empty = createFakePriceBookDb();
    await expect(suggest(makeCtx(empty, A), [bolt()], { family: 'RETAIL' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('nothing is written, and the clock is the injected one', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 1000, asOf: new Date(FAKE_NOW.getTime() - 100 * DAY) });
    const out = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(db.writes).toHaveLength(0);
    expect(out.results[0]?.suggestion.warnings.map((w) => w.code)).toContain('REFERENCE_OLD'); // 100 days against the injected now
  });

  test('suggestForRoute answers null when the book is missing, off, or the platform switch is off; suggestOne is one row', async () => {
    const { ctx } = shop({ enabled: false });
    const on = { CARD_PRICE_BOOK_ENABLED: 'true' };
    expect(await suggestForRoute({ ...ctx, env: on }, [bolt()], { family: 'RETAIL' })).toBeNull();
    const enabled = shop({ enabled: true });
    expect(await suggestForRoute({ ...enabled.ctx, env: {} }, [bolt()], { family: 'RETAIL' })).toBeNull();
    const out = await suggestForRoute({ ...enabled.ctx, env: on }, [bolt()], { family: 'RETAIL' });
    expect(out?.results).toHaveLength(1);
    expect((await suggestOne(enabled.ctx, bolt(), { family: 'RETAIL' })).suggestion.code).toBe('NO_REFERENCE');
  });

  test('the card minimum is injected and defaults to the platform\'s', async () => {
    const { db, bookId, ctx } = shop();
    seedReference(db, bookId, { valueCents: 50 });
    const dflt = await suggest(ctx, [bolt()], { family: 'RETAIL' });
    expect(dflt.results[0]?.suggestion.warnings.map((w) => w.code)).toContain('BELOW_CARD_MINIMUM');
    const lower = await suggest(ctx, [bolt()], { family: 'RETAIL', minCardSaleCents: 10 });
    expect(lower.results[0]?.suggestion.warnings.map((w) => w.code)).not.toContain('BELOW_CARD_MINIMUM');
  });
});

describe('locks: pins', () => {
  async function pinned(until?: unknown) {
    const s = shop();
    const { item } = seedCardItem(s.db, A, { price: 5 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
    seedReference(s.db, s.bookId, { valueCents: 1000 });
    const out = await setLock(s.ctx, item.id as string, { locked: true, until });
    return { ...s, item, out };
  }

  test('a pin blocks apply but still returns the number', async () => {
    const { ctx, item, out } = await pinned();
    expect(out.locked).toBe(true);
    expect(out.lock).toMatchObject({ itemId: item.id, reason: 'PIN', priceCentsAtLock: 500, lockedUntil: null });
    const res = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    const s = res.results[0]?.suggestion;
    expect(s).toMatchObject({ ok: true, priceCents: 1000, applyAllowed: false, lockedReason: 'PIN' });
  });

  test('a pin with an end date lapses; one in the past is refused', async () => {
    const until = new Date(FAKE_NOW.getTime() + 2 * DAY).toISOString();
    const { db, ctx, item, out } = await pinned(until);
    expect(out.lock?.lockedUntil).toBe(until);
    const later = { ...ctx, now: new Date(FAKE_NOW.getTime() + 3 * DAY) };
    const res = await suggest(later, [{ itemId: item.id as string }], { family: 'RETAIL' });
    expect(res.results[0]?.suggestion.applyAllowed).toBe(true);
    expect(await listLocks(later)).toEqual([]);
    expect((await listLocks(ctx)).map((l) => l.itemId)).toEqual([item.id]);
    await expect(setLock(ctx, item.id as string, { locked: true, until: new Date(FAKE_NOW.getTime() - 1000).toISOString() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(setLock(ctx, item.id as string, { locked: true, until: 'not a date' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(db.select('priceBookLock')).toHaveLength(1);
  });

  test('pinning twice updates the one lock; unpinning removes it, and unpinning again is fine', async () => {
    const { db, ctx, item } = await pinned();
    db.tables.item.forEach((r) => { if (r.id === item.id) r.price = 6; });
    await setLock(ctx, item.id as string, { locked: true });
    const rows = db.select('priceBookLock');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priceCentsAtLock).toBe(600);
    expect(rows[0]?.createdByUserId).toBe('user_orgA');
    expect((await setLock(ctx, item.id as string, { locked: false })).locked).toBe(false);
    expect(db.select('priceBookLock')).toHaveLength(0);
    expect((await setLock(ctx, item.id as string, { locked: false })).locked).toBe(false);
    await expect(setLock(ctx, item.id as string, { locked: 'yes' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('locks never bump the book version', async () => {
    const { db, ctx, item } = await pinned();
    await setLock(ctx, item.id as string, { locked: false });
    expect(db.select('priceBook')[0]?.version).toBe(1);
  });

  test('a deleted item cannot be pinned', async () => {
    const { db, ctx } = shop();
    const { item } = seedCardItem(db, A, { deletedAt: FAKE_NOW });
    await expect(setLock(ctx, item.id as string, { locked: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('locks: the hand edit rule', () => {
  function edited(priceUpdatedAt: Date | null, extra: AnyRow = {}) {
    const s = shop(extra);
    const { item } = seedCardItem(s.db, A, { price: 5, priceUpdatedAt }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
    seedReference(s.db, s.bookId, { valueCents: 1000 });
    const scope = { organizerId: A, bookId: s.bookId, manualLockDays: 14, now: FAKE_NOW };
    return { ...s, item, scope };
  }
  const run = (db: FakeDb, bookId: string) => db.insert('priceBookRun', { bookId, kind: 'BULK', status: 'APPLIED', bookVersion: 1, expiresAt: FAKE_NOW });

  test('an edit within manualLockDays locks the price (RECENT_EDIT) until the window ends, and still returns the number', async () => {
    const edit = new Date(FAKE_NOW.getTime() - 3 * DAY);
    const { ctx, item, scope, db } = edited(edit);
    const res = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    expect(res.results[0]?.suggestion).toMatchObject({ ok: true, priceCents: 1000, applyAllowed: false, lockedReason: 'RECENT_EDIT' });
    const lock = (await resolveLocks(db, scope, [item.id as string])).get(item.id as string);
    expect(lock?.kind).toBe('RECENT_EDIT');
    expect(lock?.until?.getTime()).toBe(edit.getTime() + 14 * DAY);
  });

  test('an older edit, no edit, or manualLockDays of 0 is not a lock', async () => {
    const old = edited(new Date(FAKE_NOW.getTime() - 20 * DAY));
    expect((await resolveLocks(old.db, old.scope, [old.item.id as string])).get(old.item.id as string)).toBeNull();
    const none = edited(null);
    expect((await resolveLocks(none.db, none.scope, [none.item.id as string])).get(none.item.id as string)).toBeNull();
    const zero = edited(new Date(FAKE_NOW.getTime() - 1 * DAY));
    expect((await resolveLocks(zero.db, { ...zero.scope, manualLockDays: 0 }, [zero.item.id as string])).get(zero.item.id as string)).toBeNull();
  });

  test('a price written by a run of this book is not a hand edit (within 5 seconds before the stamp)', async () => {
    const edit = new Date(FAKE_NOW.getTime() - 3 * DAY);
    const cases: Array<[number, string | null]> = [
      [0, null],
      [-4000, null],
      [-5000, null],
      [-6000, 'RECENT_EDIT'], // the run wrote 6 seconds before the stamp: the stamp is a later hand edit
      [3 * 60 * 1000, null],
    ];
    for (const [offset, expected] of cases) {
      const s = edited(edit);
      const r = run(s.db, s.bookId);
      s.db.insert('priceBookRunItem', { runId: r.id, itemId: s.item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, appliedAt: new Date(edit.getTime() + offset) });
      const lock = (await resolveLocks(s.db, s.scope, [s.item.id as string])).get(s.item.id as string);
      expect(lock?.kind ?? null).toBe(expected);
    }
  });

  test('an undo by the book is also not a hand edit; a run of another organizer\'s book does not count', async () => {
    const edit = new Date(FAKE_NOW.getTime() - 3 * DAY);
    const s = edited(edit);
    const r = run(s.db, s.bookId);
    s.db.insert('priceBookRunItem', { runId: r.id, itemId: s.item.id, itemTitle: 't', state: 'UNDONE', bookVersion: 1, appliedAt: new Date(edit.getTime() - 86400000), undoneAt: edit });
    expect((await resolveLocks(s.db, s.scope, [s.item.id as string])).get(s.item.id as string)).toBeNull();

    const o = edited(edit);
    const otherBook = seedBook(o.db, B);
    const otherRun = run(o.db, otherBook.id as string);
    o.db.insert('priceBookRunItem', { runId: otherRun.id, itemId: o.item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, appliedAt: edit });
    expect((await resolveLocks(o.db, o.scope, [o.item.id as string])).get(o.item.id as string)?.kind).toBe('RECENT_EDIT');
  });

  test('a pin comes before the hand edit rule', async () => {
    const edit = new Date(FAKE_NOW.getTime() - 3 * DAY);
    const s = edited(edit);
    seedLock(s.db, s.bookId, s.item.id as string);
    expect((await resolveLocks(s.db, s.scope, [s.item.id as string])).get(s.item.id as string)?.kind).toBe('PIN');
  });
});

describe('the last applied reference', () => {
  test('a reference that moved a lot since the last applied run asks for a look', async () => {
    const { db, bookId, ctx } = shop();
    const { item } = seedCardItem(db, A, { price: 5 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
    seedReference(db, bookId, { valueCents: 1000 });
    const r = db.insert('priceBookRun', { bookId, kind: 'BULK', status: 'APPLIED', bookVersion: 1, expiresAt: FAKE_NOW });
    db.insert('priceBookRunItem', { runId: r.id, itemId: item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, referenceCents: 500, appliedAt: new Date(FAKE_NOW.getTime() - 40 * DAY) });
    const moved = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    expect(moved.results[0]?.suggestion.review.reasons).toContain('REFERENCE_MOVED');
    db.tables.priceBookRunItem.forEach((x) => { x.referenceCents = 980; });
    const steady = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    expect(steady.results[0]?.suggestion.review.reasons).not.toContain('REFERENCE_MOVED');
  });

  test('the newest applied run wins; skipped and other books\' rows are ignored', async () => {
    const { db, bookId, ctx } = shop();
    const { item } = seedCardItem(db, A, { price: 5 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
    seedReference(db, bookId, { valueCents: 1000 });
    const mine = db.insert('priceBookRun', { bookId, kind: 'BULK', status: 'APPLIED', bookVersion: 1, expiresAt: FAKE_NOW });
    const theirs = db.insert('priceBookRun', { bookId: seedBook(db, B).id, kind: 'BULK', status: 'APPLIED', bookVersion: 1, expiresAt: FAKE_NOW });
    db.insert('priceBookRunItem', { runId: mine.id, itemId: item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, referenceCents: 100, appliedAt: new Date(FAKE_NOW.getTime() - 50 * DAY) });
    db.insert('priceBookRunItem', { runId: theirs.id, itemId: item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, referenceCents: 100, appliedAt: new Date(FAKE_NOW.getTime() - 1 * DAY) });
    const r2 = db.insert('priceBookRun', { bookId, kind: 'BULK', status: 'APPLIED', bookVersion: 1, expiresAt: FAKE_NOW });
    db.insert('priceBookRunItem', { runId: r2.id, itemId: item.id, itemTitle: 't', state: 'APPLIED', bookVersion: 1, referenceCents: 990, appliedAt: new Date(FAKE_NOW.getTime() - 10 * DAY) });
    const out = await suggest(ctx, [{ itemId: item.id as string }], { family: 'RETAIL' });
    expect(out.results[0]?.suggestion.review.reasons).not.toContain('REFERENCE_MOVED');
  });
});

describe('pins to code outside the price book', () => {
  test('the known games are the card record\'s games', () => {
    expect([...KNOWN_GAMES]).toEqual([...CARD_GAMES]);
  });

  test('the catalog finish map is the catalog suggestion\'s finish map', () => {
    expect({ ...CATALOG_FINISH_FIELD }).toEqual({ ...FINISH_PRICE_FIELD });
  });

  test('the default card minimum is the platform\'s', () => {
    expect(DEFAULT_MIN_CARD_SALE_CENTS).toBe(MIN_CARD_SALE_CENTS);
  });
});

describe('copy and hygiene of the B3a files', () => {
  const dir = join(__dirname, '..', 'services', 'priceBook');
  const files = [
    'db.ts',
    'bookService.ts',
    'referenceService.ts',
    'suggestService.ts',
    'lockService.ts',
    'providers/registry.ts',
    'providers/manual.ts',
    'providers/soldHistory.ts',
    'providers/benchmark.ts',
    'providers/catalogReference.ts',
    'providers/licensedFeed.ts',
  ];
  const text = (f: string) => readFileSync(join(dir, f), 'utf8');

  test('the files exist', () => {
    const present = new Set(readdirSync(dir).concat(readdirSync(join(dir, 'providers')).map((p) => `providers/${p}`)));
    for (const f of files) expect(present.has(f)).toBe(true);
  });

  test.each(files)('%s is ASCII with no dashes, no banned words, no database client name', (f) => {
    const t = text(f);
    expect(t).not.toMatch(/[^\x00-\x7f]/);
    expect(t).not.toContain(String.fromCharCode(0x2014));
    expect(t).not.toContain(String.fromCharCode(0x2013));
    expect(t).not.toMatch(new RegExp(['\\b', 'A', 'I', '\\b'].join('')));
    expect(t.toLowerCase()).not.toContain(['estate', 'sale'].join(' '));
    expect(t).not.toMatch(/\x00/);
    const code = t.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
    expect(code.toLowerCase()).not.toContain('prisma');
    expect(code).not.toMatch(/process\.env|Date\.now\(|new Date\(\)|Math\.random|setTimeout/);
  });
});
