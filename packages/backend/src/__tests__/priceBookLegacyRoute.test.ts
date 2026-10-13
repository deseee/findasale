/**
 * ADR-140 B5 / AT-30: the legacy route GET /api/cards/suggested-price with the price book dependency, and the catalog price
 * switch CARD_CATALOG_PRICE_REFERENCE_ENABLED (section 12.2).
 *
 * The handlers run against the catalog fake (cardCatalogFixtures) and the real price book services run against the in-memory
 * price book fake (priceBookFakes). Nothing here touches a database or the network.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createCardCatalogHandlers, createPriceBookRouteDep } from '../controllers/cardCatalogController';
import type { CardCatalogPriceBookDep } from '../controllers/cardCatalogController';
import { isCatalogPriceReferenceEnabled } from '../services/cardCatalog/catalogConfig';
import { suggestPriceForPrinting } from '../services/cardCatalog/cardCatalogLookup';
import { isCatalogPriceReferenceEnabled as bookSwitchEnabled } from '../services/priceBook/config';
import { READY_SCRYFALL_SOURCE, dbPrinting, makeFakeDb } from './__fixtures__/cardCatalogFixtures';
import { FAKE_NOW, createFakePriceBookDb, seedBook, seedCardItem, seedLock, seedPrinting, seedReference } from './__fixtures__/priceBookFakes';
import type { AnyRow, FakeDb } from './__fixtures__/priceBookFakes';

const NOW = FAKE_NOW;
const A = 'orgA';
const B = 'orgB';
const CATALOG_ON = { CARD_CATALOG_ENABLED: 'true' };
const BOOK_ON = { CARD_CATALOG_ENABLED: 'true', CARD_PRICE_BOOK_ENABLED: 'true' };
const SWITCH = 'CARD_CATALOG_PRICE_REFERENCE_ENABLED';

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = jest.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = jest.fn((b: any) => {
    res.body = b;
    return res;
  });
  return res;
}

const mtgPrinting = (over: Record<string, unknown> = {}) =>
  dbPrinting({ id: 'SCRYFALL:p1', name: 'Lightning Bolt', nameNorm: 'lightning bolt', setCode: 'm11', setName: 'Magic 2011', collectorNumber: '149', finishes: ['NONFOIL', 'FOIL'], ...over });

const pokemonPrinting = () =>
  dbPrinting({
    id: 'TCGDEX:en:base1-4',
    source: 'TCGDEX',
    game: 'POKEMON',
    name: 'Charizard',
    nameNorm: 'charizard',
    setCode: 'base1',
    setName: 'Base Set',
    collectorNumber: '4',
    rarity: 'Rare Holo',
    finishes: ['HOLO'],
    scryfallId: null,
    price: null,
  });

/** A price book fake with the printings the book services read. */
function bookShop(organizerId: string, bookOverrides: AnyRow | null = { enabled: true }, db: FakeDb = createFakePriceBookDb()) {
  const book = bookOverrides === null ? null : seedBook(db, organizerId, bookOverrides);
  return { db, book, bookId: (book?.id ?? '') as string };
}

function seedBookPrintings(db: FakeDb) {
  seedPrinting(db, { id: 'SCRYFALL:p1', name: 'Lightning Bolt', setCode: 'm11', collectorNumber: '149', rarity: 'common', finishes: ['NONFOIL', 'FOIL'] });
  seedPrinting(db, { id: 'TCGDEX:en:base1-4', game: 'POKEMON', source: 'TCGDEX', name: 'Charizard', setCode: 'base1', setName: 'Base Set', collectorNumber: '4', rarity: 'Rare Holo', finishes: ['HOLO'] });
}

interface Setup {
  env?: Record<string, string>;
  printings?: any[];
  /** Price book fake; omit for a handler built with no price book dependency. */
  pb?: FakeDb | null;
  dep?: CardCatalogPriceBookDep | 'none';
}

function handlersFor(opts: Setup = {}) {
  const catalog = makeFakeDb({ printings: opts.printings ?? [mtgPrinting(), pokemonPrinting()], sources: [READY_SCRYFALL_SOURCE] });
  let priceBook: CardCatalogPriceBookDep | undefined;
  if (opts.dep && opts.dep !== 'none') priceBook = opts.dep;
  else if (opts.dep !== 'none' && opts.pb) priceBook = createPriceBookRouteDep(() => opts.pb);
  const handlers = createCardCatalogHandlers({
    getDb: () => catalog.db,
    getEnv: () => opts.env ?? CATALOG_ON,
    now: () => NOW,
    ...(priceBook ? { priceBook } : {}),
  });
  return { handlers, catalog };
}

async function call(h: ReturnType<typeof handlersFor>['handlers'], query: Record<string, string>, organizerId: string | null = A) {
  const res = mockRes();
  const user = organizerId ? { id: `user_${organizerId}`, organizerProfile: { id: organizerId } } : { id: 'user_admin' };
  await h.suggestedPrice({ query, user } as any, res);
  return res;
}

const q = (extra: Record<string, string> = {}) => ({ printingId: 'SCRYFALL:p1', finish: 'NONFOIL', conditionCode: 'NM', language: 'en', ...extra });
const bytes = (res: any) => JSON.stringify({ status: res.statusCode, body: res.body });

describe('isCatalogPriceReferenceEnabled (section 12.2)', () => {
  test('unset, empty and any other word mean on; only false, 0, no and off (any case, trimmed) mean off', () => {
    for (const v of [undefined, '', 'true', '1', 'yes', 'on', 'ON', 'maybe', 'enabled', ' true ']) {
      expect(isCatalogPriceReferenceEnabled({ [SWITCH]: v })).toBe(true);
    }
    for (const v of ['false', 'FALSE', 'False', '0', 'no', 'No', 'off', 'OFF', ' off ', ' false\n']) {
      expect(isCatalogPriceReferenceEnabled({ [SWITCH]: v })).toBe(false);
    }
    expect(isCatalogPriceReferenceEnabled({})).toBe(true);
  });

  test('has the same meaning as the switch helper in the price book config (one switch, two readers)', () => {
    for (const v of [undefined, '', 'true', '1', 'yes', 'on', 'maybe', 'false', 'FALSE', '0', 'no', 'off', ' OFF ']) {
      expect(isCatalogPriceReferenceEnabled({ [SWITCH]: v })).toBe(bookSwitchEnabled({ [SWITCH]: v }));
    }
  });

  test('reads the environment object it is given on every call (never at import time)', () => {
    const env: Record<string, string | undefined> = {};
    expect(isCatalogPriceReferenceEnabled(env)).toBe(true);
    env[SWITCH] = 'off';
    expect(isCatalogPriceReferenceEnabled(env)).toBe(false);
    delete env[SWITCH];
    expect(isCatalogPriceReferenceEnabled(env)).toBe(true);
  });
});

describe('AT-30 legacy parity: the answer is byte for byte the legacy one when the book is absent or off', () => {
  test('the legacy answer itself: stored catalog price, no priceBook block, no catalogReference key', async () => {
    const { handlers } = handlersFor({ dep: 'none' });
    const res = await call(handlers, q());
    expect(res.statusCode).toBe(200);
    expect(res.body.suggestion).toMatchObject({ ok: true, suggestedPrice: 100, currency: 'USD' });
    expect(Object.keys(res.body.suggestion)).not.toContain('priceBook');
    expect(Object.keys(res.body.suggestion)).not.toContain('catalogReference');
    expect(res.body.data.suggestion).toBe(res.body.suggestion);
  });

  test('with the dependency absent, with the flag off, with no book, with a book that is off, with no organizer: identical bytes', async () => {
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q()));

    // Dependency present, platform flag unset: answers null without touching the price book database.
    const touch = jest.fn(() => {
      throw new Error('the price book database must not be touched');
    });
    const flagOff = handlersFor({ dep: createPriceBookRouteDep(touch), env: CATALOG_ON });
    expect(bytes(await call(flagOff.handlers, q({ itemId: 'whatever' })))).toBe(baseline);
    expect(touch).not.toHaveBeenCalled();

    // Flag on, organizer has no book.
    const none = bookShop(A, null);
    seedBookPrintings(none.db);
    expect(bytes(await call(handlersFor({ pb: none.db, env: BOOK_ON }).handlers, q()))).toBe(baseline);

    // Flag on, a book that exists but the organizer switch is off (it even has a typed price).
    const off = bookShop(A, { enabled: false });
    seedBookPrintings(off.db);
    seedReference(off.db, off.bookId, { valueCents: 1200 });
    expect(bytes(await call(handlersFor({ pb: off.db, env: BOOK_ON }).handlers, q()))).toBe(baseline);

    // Flag on, an enabled book, but the caller is not an organizer with a profile.
    const on = bookShop(A, { enabled: true });
    seedBookPrintings(on.db);
    seedReference(on.db, on.bookId, { valueCents: 1200 });
    expect(bytes(await call(handlersFor({ pb: on.db, env: BOOK_ON }).handlers, q(), null))).toBe(baseline);
  });

  test('a foreign or unknown itemId changes nothing while the book is off (ignored, so no difference to observe)', async () => {
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q()));
    const off = bookShop(A, { enabled: false });
    seedBookPrintings(off.db);
    const foreign = seedCardItem(createFakePriceBookDb(), B).item;
    for (const itemId of [foreign.id as string, 'nope']) {
      expect(bytes(await call(handlersFor({ pb: off.db, env: BOOK_ON }).handlers, q({ itemId })))).toBe(baseline);
      expect(bytes(await call(handlersFor({ dep: 'none' }).handlers, q({ itemId })))).toBe(baseline);
    }
  });

  test('legacy failures and validation are unchanged with the book off', async () => {
    const { handlers } = handlersFor({ dep: createPriceBookRouteDep(() => createFakePriceBookDb()), env: CATALOG_ON });
    const bad = await call(handlers, q({ finish: 'SHINY' }));
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('CARD_VALIDATION');
    const missing = await call(handlers, q({ printingId: 'SCRYFALL:nope' }));
    expect(missing.statusCode).toBe(404);
    expect(missing.body.code).toBe('CARD_NOT_FOUND');
    const graded = await call(handlers, q({ grader: 'PSA', grade: '9' }));
    expect(graded.body.suggestion).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED' });
  });

  test('a failing price book database falls back to the legacy answer and is logged, not thrown', async () => {
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q()));
    const pb = bookShop(A, { enabled: true });
    seedBookPrintings(pb.db);
    pb.db.failWhen(() => null);
    const broken = { ...pb.db, cardPrinting: { ...pb.db.cardPrinting, findMany: async () => { throw new Error('db down'); } } } as unknown as FakeDb;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call(handlersFor({ pb: broken, env: BOOK_ON }).handlers, q());
    expect(bytes(res)).toBe(baseline);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('a dependency that throws, or answers null, or answers INVALID_INPUT, keeps the legacy answer', async () => {
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q()));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const thrower: CardCatalogPriceBookDep = { suggestForRoute: async () => { throw new Error('boom'); } };
    expect(bytes(await call(handlersFor({ dep: thrower }).handlers, q()))).toBe(baseline);
    const nul: CardCatalogPriceBookDep = { suggestForRoute: async () => null };
    expect(bytes(await call(handlersFor({ dep: nul }).handlers, q()))).toBe(baseline);
    const invalid: CardCatalogPriceBookDep = {
      suggestForRoute: async () => ({
        kind: 'ANSWER',
        suggestion: {
          ok: false, code: 'INVALID_INPUT', family: 'RETAIL', priceCents: null, priceSource: null, priceAsOf: null, referenceCents: null,
          referenceOrigin: null, referenceLabel: null, rule: null, unchanged: false, applyAllowed: false, lockedReason: null,
          review: { required: false, reasons: [], movePercent: null }, warnings: [], trace: [], why: 'x',
        },
      }),
    };
    expect(bytes(await call(handlersFor({ dep: invalid }).handlers, q()))).toBe(baseline);
    spy.mockRestore();
  });
});

describe('AT-30 the catalog switch (section 12.2)', () => {
  test.each(['false', 'FALSE', '0', 'no', 'off'])('%s: the legacy route answers NO_PRICE_DATA and says catalogReference OFF; nothing throws', async (word) => {
    const { handlers } = handlersFor({ dep: 'none', env: { ...CATALOG_ON, [SWITCH]: word } });
    const res = await call(handlers, q());
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_DATA', suggestedPrice: null, catalogReference: 'OFF' });
    expect(res.body.printing).toMatchObject({ id: 'SCRYFALL:p1', name: 'Lightning Bolt' });
  });

  test('unset, true and anything else keep today\'s number and add no key', async () => {
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q()));
    for (const word of ['true', '1', 'yes', 'on', '']) {
      const res = await call(handlersFor({ dep: 'none', env: { ...CATALOG_ON, [SWITCH]: word } }).handlers, q());
      expect(bytes(res)).toBe(baseline);
    }
  });

  test('the other legacy outcomes keep their order of checks: graded first, bad finish and bad condition still 400', async () => {
    const { handlers } = handlersFor({ dep: 'none', env: { ...CATALOG_ON, [SWITCH]: 'false' } });
    const graded = await call(handlers, q({ grader: 'PSA' }));
    expect(graded.body.suggestion).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED', catalogReference: 'OFF' });
    expect((await call(handlers, q({ finish: 'SHINY' }))).statusCode).toBe(400);
    expect((await call(handlers, q({ conditionCode: 'ZZ' }))).statusCode).toBe(400);
    expect((await call(handlers, q({ printingId: 'SCRYFALL:nope' }))).statusCode).toBe(404);
  });

  test('suggestPriceForPrinting: off gives the no price outcome and the marker; on has no marker', async () => {
    const catalog = makeFakeDb({ printings: [mtgPrinting()], sources: [READY_SCRYFALL_SOURCE] });
    const off = await suggestPriceForPrinting({ printingId: 'SCRYFALL:p1', finish: 'NONFOIL' }, catalog.db, { ...CATALOG_ON, [SWITCH]: 'off' }, NOW);
    expect(off.found && off.catalogReference).toBe('OFF');
    expect(off.found && off.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_DATA' });
    const on = await suggestPriceForPrinting({ printingId: 'SCRYFALL:p1', finish: 'NONFOIL' }, catalog.db, CATALOG_ON, NOW);
    expect(on.found && on.suggestion.ok).toBe(true);
    expect(Object.keys(on)).not.toContain('catalogReference');
  });

  test('the printing, its labels and its identity are not touched by the switch', async () => {
    const on = await call(handlersFor({ dep: 'none' }).handlers, q());
    const off = await call(handlersFor({ dep: 'none', env: { ...CATALOG_ON, [SWITCH]: 'false' } }).handlers, q());
    expect(off.body.printing).toEqual(on.body.printing);
    expect(off.body.dataAsOf).toEqual(on.body.dataAsOf);
    expect(off.body.printingId).toBe(on.body.printingId);
  });
});

describe('AT-30 book on: the compatibility shape plus the priceBook block', () => {
  function shopWithTypedPrice(valueCents = 1200, bookOverrides: AnyRow = { enabled: true }) {
    const s = bookShop(A, bookOverrides);
    seedBookPrintings(s.db);
    seedReference(s.db, s.bookId, { valueCents, asOf: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000), note: 'binder A' });
    return s;
  }

  test('answers from the book in the legacy shape, with every field the frontend reads, plus the block', async () => {
    const s = shopWithTypedPrice();
    const res = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q({ conditionCode: 'LP' }));
    expect(res.statusCode).toBe(200);
    const sug = res.body.suggestion;
    // 1200 cents, Lightly Played at 90 percent = 1080, nearest 25 cents (tiered, $5 to $50) = 1075.
    expect(sug).toMatchObject({
      ok: true,
      suggestedPrice: 10.75,
      currency: 'USD',
      basis: { finish: 'NONFOIL', conditionCode: 'LP' },
      asOf: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      showDataDate: true,
      stale: false,
      belowEbayMinimum: false,
    });
    expect(typeof sug.note).toBe('string');
    expect(sug.priceBook).toMatchObject({
      ok: true,
      priceCents: 1075,
      price: 10.75,
      currency: 'USD',
      priceSource: 'MANUAL',
      referenceCents: 1200,
      referenceOrigin: 'SHOP',
      referenceLabel: 'Your typed price',
      applyAllowed: true,
      lockedReason: null,
    });
    expect(sug.priceBook.rule).toMatchObject({ isDefault: true });
    expect(Array.isArray(sug.priceBook.trace)).toBe(true);
    expect(Array.isArray(sug.priceBook.warnings)).toBe(true);
    expect(sug.priceBook.review).toMatchObject({ required: expect.any(Boolean), reasons: expect.any(Array) });
    expect(sug.priceBook.why).toBe(sug.note);
    expect(Object.keys(sug)).not.toContain('catalogReference');
    // The envelope is the legacy one.
    expect(Object.keys(res.body).sort()).toEqual(['catalogReady', 'data', 'dataAsOf', 'printing', 'printingId', 'success', 'suggestion'].sort());
    expect(res.body.data.suggestion).toBe(res.body.suggestion);
  });

  test('the shop\'s number wins over the stored catalog price for the same printing', async () => {
    const s = shopWithTypedPrice(500);
    const res = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q());
    expect(res.body.suggestion.suggestedPrice).toBe(5);
    expect(res.body.suggestion.priceBook.priceSource).toBe('MANUAL');
  });

  test('nothing is written to the price book database by the route', async () => {
    const s = shopWithTypedPrice();
    await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q());
    expect(s.db.writeCount()).toBe(0);
  });

  test('a Pokemon printing with no references gives NO_REFERENCE (the book is on) where the legacy route gives NO_PRICE_DATA', async () => {
    const s = bookShop(A, { enabled: true });
    seedBookPrintings(s.db);
    const env = { ...BOOK_ON, CARD_CATALOG_TCGDEX_ENABLED: 'true' };
    const legacy = await call(handlersFor({ dep: 'none', env }).handlers, { printingId: 'TCGDEX:en:base1-4', finish: 'HOLO', conditionCode: 'NM', language: 'en' });
    expect(legacy.body.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_DATA' });
    const res = await call(handlersFor({ pb: s.db, env }).handlers, { printingId: 'TCGDEX:en:base1-4', finish: 'HOLO', conditionCode: 'NM', language: 'en' });
    expect(res.statusCode).toBe(200);
    expect(res.body.suggestion).toMatchObject({ ok: false, code: 'NO_REFERENCE', suggestedPrice: null });
    expect(typeof res.body.suggestion.message).toBe('string');
    expect(res.body.suggestion.priceBook).toMatchObject({ ok: false, code: 'NO_REFERENCE', priceCents: null, applyAllowed: false });
  });

  test('a graded card is GRADED_NOT_SUPPORTED, with the block', async () => {
    const s = shopWithTypedPrice();
    const res = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q({ grader: 'PSA', grade: '9' }));
    expect(res.body.suggestion).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED', suggestedPrice: null });
    expect(res.body.suggestion.priceBook).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED', applyAllowed: false });
  });

  test('a bad finish is still the legacy 400 before the book is asked', async () => {
    const s = shopWithTypedPrice();
    const dep = createPriceBookRouteDep(() => s.db);
    const spy = jest.spyOn(dep, 'suggestForRoute');
    const res = await call(handlersFor({ dep, env: BOOK_ON }).handlers, q({ finish: 'SHINY' }));
    expect(res.statusCode).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test('an old typed price is flagged stale in the legacy shape', async () => {
    const s = bookShop(A, { enabled: true });
    seedBookPrintings(s.db);
    seedReference(s.db, s.bookId, { valueCents: 1000, asOf: new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000) });
    const res = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q());
    expect(res.body.suggestion).toMatchObject({ ok: true, stale: true, showDataDate: true });
    expect(res.body.suggestion.priceBook.warnings.map((w: any) => w.code)).toContain('REFERENCE_OLD');
  });

  test('a price under the eBay minimum is flagged', async () => {
    const s = shopWithTypedPrice(30);
    const res = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q());
    expect(res.body.suggestion).toMatchObject({ ok: true, belowEbayMinimum: true });
  });

  test('the switch off plus the book on: the book still answers, the catalog reference is not used, and the marker is present', async () => {
    const s = bookShop(A, { enabled: true, allowCatalogReference: true });
    seedBookPrintings(s.db);
    s.db.insert('cardPrice', { printingId: 'SCRYFALL:p1', usd: '1.25', usdFoil: null, usdEtched: null, usdReverse: null, asOf: new Date(NOW.getTime() - 60 * 60 * 1000) });
    const on = await call(handlersFor({ pb: s.db, env: BOOK_ON }).handlers, q());
    expect(on.body.suggestion.priceBook).toMatchObject({ ok: true, priceSource: 'CATALOG_REFERENCE', referenceOrigin: 'SCRYFALL' });
    expect(Object.keys(on.body.suggestion)).not.toContain('catalogReference');
    const off = await call(handlersFor({ pb: s.db, env: { ...BOOK_ON, [SWITCH]: 'false' } }).handlers, q());
    expect(off.body.suggestion).toMatchObject({ ok: false, code: 'NO_REFERENCE', suggestedPrice: null, catalogReference: 'OFF' });
    // The shop's own typed price still answers with the switch off.
    seedReference(s.db, s.bookId, { valueCents: 800 });
    const typed = await call(handlersFor({ pb: s.db, env: { ...BOOK_ON, [SWITCH]: 'false' } }).handlers, q());
    expect(typed.body.suggestion).toMatchObject({ ok: true, suggestedPrice: 8, catalogReference: 'OFF' });
    expect(typed.body.suggestion.priceBook.priceSource).toBe('MANUAL');
  });

  test('an item of the organizer gives the book its facts: the pin lock and the current price', async () => {
    const s = shopWithTypedPrice();
    const { item } = seedCardItem(s.db, A, { price: 12, costBasis: 3 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt', finish: 'NONFOIL', conditionCode: 'NM' });
    const h = handlersFor({ pb: s.db, env: BOOK_ON }).handlers;
    const same = await call(h, q({ itemId: item.id as string }));
    expect(same.statusCode).toBe(200);
    expect(same.body.suggestion.priceBook).toMatchObject({ ok: true, priceCents: 1200, unchanged: true, lockedReason: null, applyAllowed: true });
    seedLock(s.db, s.bookId, item.id as string);
    const locked = await call(h, q({ itemId: item.id as string }));
    expect(locked.body.suggestion).toMatchObject({ ok: true, suggestedPrice: 12 });
    expect(locked.body.suggestion.priceBook).toMatchObject({ lockedReason: 'PIN', applyAllowed: false });
  });

  test('an empty itemId is the same as none', async () => {
    const s = shopWithTypedPrice();
    const h = handlersFor({ pb: s.db, env: BOOK_ON }).handlers;
    expect(bytes(await call(h, q({ itemId: '' })))).toBe(bytes(await call(h, q())));
  });
});

describe('AT-30 organizer isolation', () => {
  test('organizer B never sees organizer A\'s typed price or book; each shop gets its own number', async () => {
    const db = createFakePriceBookDb();
    const a = bookShop(A, { enabled: true }, db);
    const b = bookShop(B, { enabled: true }, db);
    seedBookPrintings(db);
    seedReference(db, a.bookId, { valueCents: 1200, note: 'A secret binder note' });
    seedReference(db, b.bookId, { valueCents: 500 });
    const h = handlersFor({ pb: db, env: BOOK_ON }).handlers;
    const forA = await call(h, q(), A);
    const forB = await call(h, q(), B);
    expect(forA.body.suggestion.suggestedPrice).toBe(12);
    expect(forB.body.suggestion.suggestedPrice).toBe(5);
    expect(JSON.stringify(forB.body)).not.toMatch(/1200|secret/);
  });

  test('an organizer with no book gets the legacy answer even when another organizer has a book with a price', async () => {
    const db = createFakePriceBookDb();
    const a = bookShop(A, { enabled: true }, db);
    seedBookPrintings(db);
    seedReference(db, a.bookId, { valueCents: 1200 });
    const baseline = bytes(await call(handlersFor({ dep: 'none' }).handlers, q(), B));
    expect(bytes(await call(handlersFor({ pb: db, env: BOOK_ON }).handlers, q(), B))).toBe(baseline);
  });

  test('a foreign itemId is answered exactly like an unknown one: 404 CARD_NOT_FOUND, nothing of the item in the body', async () => {
    const db = createFakePriceBookDb();
    const a = bookShop(A, { enabled: true }, db);
    bookShop(B, { enabled: true }, db);
    seedBookPrintings(db);
    seedReference(db, a.bookId, { valueCents: 1200 });
    const { item } = seedCardItem(db, A, { title: 'Alpha Bolt secret title', price: 777, costBasis: 5 }, { catalogPrintingId: 'SCRYFALL:p1', cardName: 'Lightning Bolt' });
    const h = handlersFor({ pb: db, env: BOOK_ON }).handlers;
    const foreign = await call(h, q({ itemId: item.id as string }), B);
    const unknown = await call(h, q({ itemId: 'item_does_not_exist' }), B);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toEqual({ error: 'Item not found', code: 'CARD_NOT_FOUND' });
    expect(bytes(foreign)).toBe(bytes(unknown));
    expect(JSON.stringify(foreign.body)).not.toMatch(/secret|777/);
    // The owner still gets an answer for the same id.
    const own = await call(h, q({ itemId: item.id as string }), A);
    expect(own.statusCode).toBe(200);
    expect(own.body.suggestion.priceBook.ok).toBe(true);
  });

  test('a deleted item behaves as a missing one', async () => {
    const db = createFakePriceBookDb();
    const a = bookShop(A, { enabled: true }, db);
    seedBookPrintings(db);
    seedReference(db, a.bookId, { valueCents: 1200 });
    const { item } = seedCardItem(db, A, { price: 12, deletedAt: new Date('2026-10-01T00:00:00Z') }, { catalogPrintingId: 'SCRYFALL:p1' });
    const res = await call(handlersFor({ pb: db, env: BOOK_ON }).handlers, q({ itemId: item.id as string }), A);
    expect(res.statusCode).toBe(404);
  });
});

describe('wiring', () => {
  test('the real dependency answers null for every call while CARD_PRICE_BOOK_ENABLED is unset or false, without opening the database', async () => {
    const touch = jest.fn(() => {
      throw new Error('must not be touched');
    });
    const dep = createPriceBookRouteDep(touch);
    const input = { organizerId: A, itemId: null, printing: mtgPrinting() as any, finish: 'NONFOIL', conditionCode: 'NM', language: 'en', graded: false, now: NOW };
    for (const flag of [undefined, '', 'false', '0', 'off', 'nonsense']) {
      expect(await dep.suggestForRoute({ ...input, env: flag === undefined ? {} : { CARD_PRICE_BOOK_ENABLED: flag } })).toBeNull();
    }
    expect(touch).not.toHaveBeenCalled();
  });

  test('the controller imports no database client at load time, wires the real dependency into the exported handlers, and the route file is unchanged in shape', () => {
    const controller = readFileSync(join(__dirname, '..', 'controllers', 'cardCatalogController.ts'), 'utf8');
    expect(controller).not.toMatch(/from ['"]\.\.\/lib\/prisma['"]/);
    expect(controller).not.toMatch(/@prisma\/client/);
    expect(controller).toMatch(/export const cardCatalogHandlers = createCardCatalogHandlers\(\{ priceBook: createPriceBookRouteDep\(\) \}\);/);
    expect(controller).toMatch(/isPriceBookEnabled\(input\.env\)/);
    const routes = readFileSync(join(__dirname, '..', 'routes', 'cardCatalog.ts'), 'utf8');
    expect(routes).toMatch(/router\.get\('\/suggested-price', authenticate, requireOrganizer, cardLookupLimiter, cardCatalogHandlers\.suggestedPrice\)/);
  });

  test('nothing the route adds is stored on an item: the controller and lookup never write', () => {
    const lookup = readFileSync(join(__dirname, '..', 'services', 'cardCatalog', 'cardCatalogLookup.ts'), 'utf8');
    const controller = readFileSync(join(__dirname, '..', 'controllers', 'cardCatalogController.ts'), 'utf8');
    for (const text of [lookup, controller]) {
      expect(text).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    }
  });
});
