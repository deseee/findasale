/**
 * ADR-134 batch B3 acceptance (4) and the resolve logic: capped search, EXACT / AMBIGUOUS / UNMATCHED.
 * Uses an in-memory fake that evaluates the Prisma where-syntax the service emits.
 */
import {
  RESOLVE_MAX_CANDIDATES,
  SEARCH_MAX_LIMIT,
  clampSearchLimit,
  decimalToNumber,
  loadCatalogState,
  resolveRefs,
  searchPrintings,
  suggestPriceForPrinting,
} from '../services/cardCatalog/cardCatalogLookup';
import {
  READY_SCRYFALL_SOURCE,
  dbPrinting,
  makeFakeDb,
} from './__fixtures__/cardCatalogFixtures';
import { collectorNumberCandidates, collectorNumbersMatch, normalizeCardName } from '../services/cardCatalog/normalize';

const fifty = Array.from({ length: 50 }, (_, i) =>
  dbPrinting({
    id: `SCRYFALL:b${i}`,
    name: `Bolt Variant ${i}`,
    nameNorm: `bolt variant ${String(i).padStart(2, '0')}`,
    setCode: `s${i % 5}`,
    collectorNumber: String(i + 1),
    scryfallId: `b${i}`,
  }),
);

describe('searchPrintings (acceptance 4: capped at 20)', () => {
  it('never returns more than 20 even when asked for 100 and the database ignores take', async () => {
    const { db, findMany } = makeFakeDb({ printings: fifty, ignoreTake: true });
    const res = await searchPrintings({ game: 'MTG', q: 'bolt', limit: 100 }, db);
    expect(res.results).toHaveLength(20);
    expect(res.capped).toBe(true);
    expect(findMany.mock.calls[0][0].take).toBe(SEARCH_MAX_LIMIT + 1);
  });

  it('honors a smaller limit and defaults to 20', async () => {
    const { db, findMany } = makeFakeDb({ printings: fifty });
    expect((await searchPrintings({ game: 'MTG', q: 'bolt', limit: 5 }, db)).results).toHaveLength(5);
    expect(findMany.mock.calls[0][0].take).toBe(6);
    expect((await searchPrintings({ game: 'MTG', q: 'bolt' }, db)).results).toHaveLength(20);
    expect(clampSearchLimit(0)).toBe(20);
    expect(clampSearchLimit(-3)).toBe(20);
    expect(clampSearchLimit('abc')).toBe(20);
    expect(clampSearchLimit(21)).toBe(20);
    expect(clampSearchLimit(7)).toBe(7);
  });

  it('is not capped when fewer rows match', async () => {
    const { db } = makeFakeDb({ printings: fifty.slice(0, 3) });
    const res = await searchPrintings({ game: 'MTG', q: 'bolt' }, db);
    expect(res.results).toHaveLength(3);
    expect(res.capped).toBe(false);
  });

  it('needs a name of two characters or a set with a number, and queries nothing otherwise', async () => {
    const { db, findMany } = makeFakeDb({ printings: fifty });
    expect((await searchPrintings({ game: 'MTG', q: 'b' }, db)).results).toEqual([]);
    expect((await searchPrintings({ game: 'MTG', set: 'lea' }, db)).results).toEqual([]);
    expect((await searchPrintings({ game: 'MTG' }, db)).results).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('normalizes the query like the stored name (accents, case, apostrophes) and scopes to the game', async () => {
    const { db, findMany } = makeFakeDb({ printings: [dbPrinting({ nameNorm: 'lim duls vault' })] });
    await searchPrintings({ game: 'MTG', q: "Lim-Dûl's Vault" }, db);
    const where = findMany.mock.calls[0][0].where;
    expect(where.game).toBe('MTG');
    expect(where.nameNorm).toEqual({ startsWith: 'lim duls vault' });
  });

  it('finds an exact set and number across stored spellings (123 vs 001/102)', async () => {
    const rows = [
      dbPrinting({ id: 'TCGCSV:1', game: 'POKEMON', setCode: 'bs', collectorNumber: '001/102', nameNorm: 'alakazam' }),
      dbPrinting({ id: 'TCGCSV:2', game: 'POKEMON', setCode: 'bs', collectorNumber: '002/102', nameNorm: 'blastoise' }),
    ];
    const { db } = makeFakeDb({ printings: rows });
    for (const typed of ['1', '001', '001/102', '1/102']) {
      const res = await searchPrintings({ game: 'POKEMON', set: 'BS', number: typed }, db);
      expect(res.results.map((r) => r.id)).toEqual(['TCGCSV:1']);
    }
  });

  it('returns prices as plain numbers (Decimal-safe) and exposes no nameNorm', async () => {
    const decimal = { toNumber: () => 12.5 };
    const { db } = makeFakeDb({ printings: [dbPrinting({ price: { usd: decimal, usdFoil: '3.40', usdEtched: null, usdReverse: null, asOf: new Date('2026-10-03T00:00:00Z') } })] });
    const res = await searchPrintings({ game: 'MTG', q: 'lightning' }, db);
    expect(res.results[0].price).toEqual({ usd: 12.5, usdFoil: 3.4, usdEtched: null, usdReverse: null, asOf: '2026-10-03T00:00:00.000Z' });
    expect((res.results[0] as any).nameNorm).toBeUndefined();
  });

  it('decimalToNumber handles every shape', () => {
    expect(decimalToNumber(null)).toBeNull();
    expect(decimalToNumber(undefined)).toBeNull();
    expect(decimalToNumber(2)).toBe(2);
    expect(decimalToNumber('2.50')).toBe(2.5);
    expect(decimalToNumber('x')).toBeNull();
    expect(decimalToNumber({ toNumber: () => 4 })).toBe(4);
    expect(decimalToNumber({ toString: () => '7.25' })).toBe(7.25);
  });
});

describe('resolveRefs', () => {
  const rows = [
    dbPrinting({ id: 'SCRYFALL:aaa', scryfallId: 'aaa', name: 'Lightning Bolt', nameNorm: 'lightning bolt', setCode: 'lea', collectorNumber: '161', releaseYear: 1993 }),
    dbPrinting({ id: 'SCRYFALL:bbb', scryfallId: 'bbb', name: 'Lightning Bolt', nameNorm: 'lightning bolt', setCode: 'm10', collectorNumber: '146', releaseYear: 2009 }),
    dbPrinting({ id: 'SCRYFALL:ccc', scryfallId: 'ccc', name: 'Lightning Bolt Token', nameNorm: 'lightning bolt token', setCode: 'tok', collectorNumber: '1', releaseYear: 2020 }),
    dbPrinting({ id: 'SCRYFALL:ddd', scryfallId: 'ddd', name: 'Counterspell', nameNorm: 'counterspell', setCode: 'lea', collectorNumber: '54', releaseYear: 1993 }),
    dbPrinting({ id: 'TCGCSV:42346', source: 'TCGCSV', game: 'POKEMON', scryfallId: null, tcgplayerProductId: 42346, name: 'Alakazam', nameNorm: 'alakazam', setCode: 'bs', collectorNumber: '001/102', releaseYear: 1999 }),
  ];

  it('EXACT by Scryfall id and by TCGplayer product id', async () => {
    const { db } = makeFakeDb({ printings: rows });
    const out = await resolveRefs(
      [
        { ref: 'r1', game: 'MTG', scryfallId: 'AAA' },
        { ref: 'r2', game: 'POKEMON', tcgplayerProductId: 42346 },
      ],
      db,
    );
    expect(out.map((o) => [o.ref, o.status, o.candidates[0]?.id])).toEqual([
      ['r1', 'EXACT', 'SCRYFALL:aaa'],
      ['r2', 'EXACT', 'TCGCSV:42346'],
    ]);
  });

  it('EXACT by set code plus collector number (across spellings), AMBIGUOUS by name alone, UNMATCHED otherwise', async () => {
    const { db } = makeFakeDb({ printings: rows });
    const out = await resolveRefs(
      [
        { ref: 'set', game: 'MTG', setCode: 'LEA', collectorNumber: '161' },
        { ref: 'padded', game: 'POKEMON', setCode: 'bs', collectorNumber: '1' },
        { ref: 'name', game: 'MTG', name: 'lightning bolt' },
        { ref: 'none', game: 'MTG', name: 'No Such Card' },
        { ref: 'empty', game: 'MTG' },
      ],
      db,
    );
    const by = Object.fromEntries(out.map((o) => [o.ref, o]));
    expect(by.set.status).toBe('EXACT');
    expect(by.set.candidates[0].id).toBe('SCRYFALL:aaa');
    expect(by.padded.status).toBe('EXACT');
    expect(by.name.status).toBe('AMBIGUOUS');
    expect(by.name.candidates.map((c) => c.id)).toEqual(['SCRYFALL:bbb', 'SCRYFALL:aaa']); // newest first, token excluded (exact names win)
    expect(by.none.status).toBe('UNMATCHED');
    expect(by.empty.status).toBe('UNMATCHED');
  });

  it('narrows an ambiguous set+number by name, and a name within a set is EXACT when unique', async () => {
    const dupes = [
      dbPrinting({ id: 'SCRYFALL:p1', name: 'Plains', nameNorm: 'plains', setCode: 'x', collectorNumber: '9' }),
      dbPrinting({ id: 'SCRYFALL:p2', name: 'Island', nameNorm: 'island', setCode: 'x', collectorNumber: '9' }),
    ];
    const { db } = makeFakeDb({ printings: dupes });
    const out = await resolveRefs(
      [
        { ref: 'a', game: 'MTG', setCode: 'x', collectorNumber: '9', name: 'Island' },
        { ref: 'b', game: 'MTG', setCode: 'x', collectorNumber: '9' },
        { ref: 'c', game: 'MTG', setCode: 'x', name: 'Plains' },
      ],
      db,
    );
    expect(out.map((o) => o.status)).toEqual(['EXACT', 'AMBIGUOUS', 'EXACT']);
  });

  it('returns at most 5 candidates per ref and flags truncation', async () => {
    const many = Array.from({ length: 9 }, (_, i) => dbPrinting({ id: `SCRYFALL:i${i}`, name: 'Island', nameNorm: 'island', setCode: `s${i}`, collectorNumber: String(i), releaseYear: 2000 + i }));
    const { db } = makeFakeDb({ printings: many });
    const [res] = await resolveRefs([{ ref: 'isl', game: 'MTG', name: 'Island' }], db);
    expect(res.status).toBe('AMBIGUOUS');
    expect(res.candidates).toHaveLength(RESOLVE_MAX_CANDIDATES);
    expect(res.truncated).toBe(true);
  });

  it('does not match a printing from another game', async () => {
    const { db } = makeFakeDb({ printings: rows });
    const [res] = await resolveRefs([{ ref: 'x', game: 'YUGIOH', name: 'Lightning Bolt' }], db);
    expect(res.status).toBe('UNMATCHED');
  });

  it('rejects more than 500 refs and preserves ref order for 500', async () => {
    const { db } = makeFakeDb({ printings: rows });
    const refs = Array.from({ length: 501 }, (_, i) => ({ ref: `r${i}`, game: 'MTG' as const, name: 'Counterspell' }));
    await expect(resolveRefs(refs, db)).rejects.toThrow(/500/);
    const ok = await resolveRefs(refs.slice(0, 500), db);
    expect(ok).toHaveLength(500);
    expect(ok[499].ref).toBe('r499');
    expect(ok.every((o) => o.status === 'EXACT')).toBe(true);
  });
});

describe('loadCatalogState', () => {
  it('does not touch the database when the catalog is disabled', async () => {
    const getDb = jest.fn(() => {
      throw new Error('db must not be used');
    });
    const st = await loadCatalogState(getDb as any, {});
    expect(st).toMatchObject({ enabled: false, catalogReady: false, readyGames: [], dataAsOf: { SCRYFALL: null, TCGCSV: null } });
    expect(getDb).not.toHaveBeenCalled();
  });

  it('is enabled but not ready before the first successful run', async () => {
    const { db } = makeFakeDb({ sources: [] });
    const st = await loadCatalogState(() => db, { CARD_CATALOG_ENABLED: 'true' });
    expect(st).toMatchObject({ enabled: true, catalogReady: false });
  });

  it('is ready for MTG after a Scryfall success and reports the snapshot time as dataAsOf', async () => {
    const { db } = makeFakeDb({ sources: [READY_SCRYFALL_SOURCE] });
    const st = await loadCatalogState(() => db, { CARD_CATALOG_ENABLED: 'true' });
    expect(st.catalogReady).toBe(true);
    expect(st.readyGames).toEqual(['MTG']);
    expect(st.dataAsOf.SCRYFALL).toBe('2026-10-03T21:05:42.559Z');
    expect(st.dataAsOf.TCGCSV).toBeNull();
  });

  it('does not report a game ready when its source is not enabled for it', async () => {
    const { db } = makeFakeDb({ sources: [{ ...READY_SCRYFALL_SOURCE, source: 'TCGCSV' }] });
    const st = await loadCatalogState(() => db, { CARD_CATALOG_ENABLED: 'true' }); // default games: MTG only
    expect(st.catalogReady).toBe(false);
  });
});

describe('suggestPriceForPrinting', () => {
  it('computes from the stored price and reports not-found for an unknown id, writing nothing', async () => {
    const { db } = makeFakeDb({ printings: [dbPrinting({ id: 'SCRYFALL:p', price: { usd: 10, usdFoil: null, usdEtched: null, usdReverse: null, asOf: new Date('2026-10-04T08:00:00Z') } })], sources: [READY_SCRYFALL_SOURCE] });
    const hit = await suggestPriceForPrinting({ printingId: 'SCRYFALL:p', conditionCode: 'LP' }, db, {}, new Date('2026-10-04T12:00:00Z'));
    expect(hit).toMatchObject({ found: true, suggestion: { ok: true, suggestedPrice: 9 } });
    expect(await suggestPriceForPrinting({ printingId: 'nope' }, db)).toEqual({ found: false });
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.cardDataSource.upsert).not.toHaveBeenCalled();
  });
});

describe('normalize helpers', () => {
  it('normalizeCardName', () => {
    expect(normalizeCardName("Lim-Dûl's Vault")).toBe('lim duls vault');
    expect(normalizeCardName('Æther Vial')).toBe('aether vial');
    expect(normalizeCardName('  Fire // Ice ')).toBe('fire ice');
    expect(normalizeCardName(null)).toBe('');
  });

  it('collector number candidates and matching', () => {
    expect(collectorNumberCandidates('001/102')).toEqual(expect.arrayContaining(['001/102', '001', '1', '01', '0001']));
    expect(collectorNumberCandidates('12a')).toEqual(['12a']);
    expect(collectorNumberCandidates('')).toEqual([]);
    expect(collectorNumbersMatch('001/102', '1')).toBe(true);
    expect(collectorNumbersMatch('12a', '12')).toBe(false);
    expect(collectorNumbersMatch('', '')).toBe(false);
  });
});
