/**
 * TCGdex Pokemon: the guards that keep it OFF by default and unreachable until
 * CARD_CATALOG_TCGDEX_ENABLED is on (together with CARD_CATALOG_ENABLED). Covers configuration,
 * the lookup service, the HTTP handlers (status attribution included), the cron entry, the notice
 * file, and source-level guards on the new modules. No network, no database.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() }, schedule: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));

import cron from 'node-cron';
import {
  TCGDEX_PINNED_REF,
  getEnabledGames,
  getTcgdexLanguages,
  getTcgdexRef,
  isAcceptableTcgdexRef,
  isCatalogEnabled,
  isPokemonServable,
  isTcgdexEnabled,
} from '../services/cardCatalog/catalogConfig';
import {
  loadCatalogState,
  loadPrintingsByIds,
  resolveRefs,
  searchPrintings,
  suggestPriceForPrinting,
} from '../services/cardCatalog/cardCatalogLookup';
import { createCardCatalogHandlers } from '../controllers/cardCatalogController';
import { runTcgcsvIngest } from '../services/cardCatalog/tcgcsvIngest';
import {
  TCGDEX_ATTRIBUTION,
  TCGDEX_COPYRIGHT_LINE,
  TCGDEX_DISCLAIMER,
  TCGDEX_MIT_LICENSE_TEXT,
} from '../services/cardCatalog/tcgdexAttribution';
import { mapTcgdexCard, readSetMeta } from '../services/cardCatalog/tcgdexMap';
import { parseTcgdexDataFile } from '../services/cardCatalog/tcgdexLiteralParser';
import {
  CARD_BASE1_4_CHARIZARD_TS,
  CARD_SV01_001_PINECO_TS,
  CARD_SV035_003_VENUSAUR_TS,
  SET_BASE1_TS,
  SET_SV01_TS,
  SET_SV035_TS,
} from './__fixtures__/tcgdexFixtures';
import {
  MemoryCatalogStore,
  READY_SCRYFALL_SOURCE,
  dbPrinting,
  fakeHttp,
  makeFakeDb,
} from './__fixtures__/cardCatalogFixtures';
import {
  CARD_CATALOG_SCRYFALL_CRON,
  CARD_CATALOG_TCGCSV_CRON,
  CARD_CATALOG_TCGDEX_CRON,
  runCardCatalogTcgdexJob,
  scheduleCardCatalogTcgdexRefresh,
} from '../jobs/cardCatalogRefreshCron';

// Captured before any test: importing the job module must register nothing.
const scheduleCallsAtImport = (cron.schedule as jest.Mock).mock.calls.length;

const NOW = new Date('2026-10-12T12:00:00Z');
const MASTER_ONLY = { CARD_CATALOG_ENABLED: 'true' };
const TCGDEX_ONLY = { CARD_CATALOG_TCGDEX_ENABLED: 'true' };
const BOTH = { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_TCGDEX_ENABLED: 'true' };

const READY_TCGDEX_SOURCE = {
  source: 'TCGDEX',
  lastAttemptAt: new Date('2026-10-12T07:50:00Z'),
  lastSuccessAt: new Date('2026-10-12T07:50:00Z'),
  lastStatus: 'OK',
  lastError: null,
  sourceVersion: `tcgdex:${TCGDEX_PINNED_REF}|en`,
  rowsUpserted: 6,
  consecutiveFailures: 0,
};

/** Rows produced by the real mapper from the real-shaped fixtures, shaped as the database returns them. */
function tcgdexDbRows(): any[] {
  const make = (setSrc: string, localId: string, cardSrc: string) => {
    const set = readSetMeta(parseTcgdexDataFile(setSrc));
    if (!set) throw new Error('fixture set has no id');
    const mapped = mapTcgdexCard({ set, localId, card: parseTcgdexDataFile(cardSrc), lang: 'en' });
    return (mapped?.rows ?? []).map((r) => dbPrinting({ ...r, price: null }));
  };
  return [
    ...make(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS),
    ...make(SET_SV01_TS, '001', CARD_SV01_001_PINECO_TS),
    ...make(SET_SV035_TS, '003', CARD_SV035_003_VENUSAUR_TS),
  ];
}

const mtgRow = () => dbPrinting({ id: 'SCRYFALL:aaa', scryfallId: 'aaa' });
const allPrintings = () => [mtgRow(), ...tcgdexDbRows()];

// ---------------------------------------------------------------------------------------------
describe('configuration: Pokemon is off by default', () => {
  it('both flags default to false and Pokemon is servable only when both are on', () => {
    expect(isTcgdexEnabled({})).toBe(false);
    expect(isPokemonServable({})).toBe(false);
    expect(isPokemonServable(MASTER_ONLY)).toBe(false);
    expect(isPokemonServable(TCGDEX_ONLY)).toBe(false);
    expect(isPokemonServable(BOTH)).toBe(true);
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' true ']) expect(isTcgdexEnabled({ CARD_CATALOG_TCGDEX_ENABLED: v })).toBe(true);
    for (const v of ['', 'false', '0', 'no', 'off', 'maybe']) expect(isTcgdexEnabled({ CARD_CATALOG_TCGDEX_ENABLED: v })).toBe(false);
    // The TCGdex flag does not turn the catalog on.
    expect(isCatalogEnabled(TCGDEX_ONLY)).toBe(false);
  });

  it('POKEMON never appears in the enabled games while the TCGdex flag is off, however CARD_CATALOG_GAMES is written', () => {
    expect(getEnabledGames({})).toEqual(['MTG']);
    expect(getEnabledGames(MASTER_ONLY)).toEqual(['MTG']);
    for (const games of ['POKEMON', 'pokemon', 'MTG,POKEMON', ' pokemon , mtg', 'POKEMON,POKEMON']) {
      expect(getEnabledGames({ CARD_CATALOG_GAMES: games })).not.toContain('POKEMON');
      expect(getEnabledGames({ ...MASTER_ONLY, CARD_CATALOG_GAMES: games })).not.toContain('POKEMON');
    }
    expect(getEnabledGames({ CARD_CATALOG_GAMES: 'POKEMON,YUGIOH' })).toEqual(['YUGIOH']);
    expect(getEnabledGames({ CARD_CATALOG_TCGDEX_ENABLED: 'false', CARD_CATALOG_GAMES: 'POKEMON' })).toEqual(['MTG']);
  });

  it('with the TCGdex flag on, POKEMON is enabled even when not listed', () => {
    expect(getEnabledGames(TCGDEX_ONLY)).toEqual(['MTG', 'POKEMON']);
    expect(getEnabledGames(BOTH)).toEqual(['MTG', 'POKEMON']);
    expect(getEnabledGames({ ...BOTH, CARD_CATALOG_GAMES: 'POKEMON' })).toEqual(['POKEMON']);
    expect(getEnabledGames({ ...BOTH, CARD_CATALOG_GAMES: 'YUGIOH' })).toEqual(['YUGIOH', 'POKEMON']);
    expect(getEnabledGames({ ...BOTH, CARD_CATALOG_GAMES: 'MTG,POKEMON,YUGIOH' })).toEqual(['MTG', 'POKEMON', 'YUGIOH']);
  });

  it('the TCGCSV job still never ingests Pokemon', async () => {
    const store = new MemoryCatalogStore();
    const http = fakeHttp(() => ({ status: 404 }));
    const res = await runTcgcsvIngest({
      store,
      httpGet: http.httpGet,
      env: { ...BOTH, CARD_CATALOG_GAMES: 'POKEMON' },
      now: () => NOW,
      alert: jest.fn(),
      sleep: async () => undefined,
    });
    expect(res.status).toBe('DISABLED');
    expect(http.calls).toHaveLength(0);
  });

  it('languages default to English; unknown and unsupported codes are dropped', () => {
    expect(getTcgdexLanguages({})).toEqual(['en']);
    expect(getTcgdexLanguages({ CARD_CATALOG_TCGDEX_LANGUAGES: '' })).toEqual(['en']);
    expect(getTcgdexLanguages({ CARD_CATALOG_TCGDEX_LANGUAGES: 'EN, ja ,xx,en' })).toEqual(['en', 'ja']);
    expect(getTcgdexLanguages({ CARD_CATALOG_TCGDEX_LANGUAGES: 'nl,pl,id,th' })).toEqual(['en']);
    expect(getTcgdexLanguages({ CARD_CATALOG_TCGDEX_LANGUAGES: 'fr,de,zh-tw' })).toEqual(['fr', 'de', 'zh-tw']);
  });

  it('the source ref defaults to the pinned commit and a moving branch is not acceptable', () => {
    expect(TCGDEX_PINNED_REF).toMatch(/^[0-9a-f]{40}$/);
    expect(getTcgdexRef({})).toBe(TCGDEX_PINNED_REF);
    expect(getTcgdexRef({ CARD_CATALOG_TCGDEX_REF: ' v1.2.3 ' })).toBe('v1.2.3');
    expect(isAcceptableTcgdexRef(TCGDEX_PINNED_REF)).toBe(true);
    expect(isAcceptableTcgdexRef('v1.2.3')).toBe(true);
    for (const bad of ['master', 'main', 'HEAD', 'Develop', '', '../x', 'a b', 'refs/heads/master', 'x'.repeat(80)]) {
      expect(isAcceptableTcgdexRef(bad)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('lookup service: flag off rejects Pokemon everywhere, flag on serves it, Magic is unchanged', () => {
  it('searchPrintings', async () => {
    for (const env of [{}, MASTER_ONLY, TCGDEX_ONLY]) {
      const { db, findMany } = makeFakeDb({ printings: allPrintings() });
      const res = await searchPrintings({ game: 'POKEMON', q: 'charizard' }, db, env);
      expect(res).toEqual({ results: [], capped: false });
      expect(findMany).not.toHaveBeenCalled();
    }
    const { db } = makeFakeDb({ printings: allPrintings() });
    const on = await searchPrintings({ game: 'POKEMON', q: 'charizard' }, db, BOTH);
    expect(on.results).toHaveLength(4);
    expect(new Set(on.results.map((r) => r.setName)).size).toBe(4);
    expect(on.results.every((r) => r.game === 'POKEMON' && r.source === 'TCGDEX')).toBe(true);
    // Magic is unaffected by the Pokemon flags.
    const mtg = await searchPrintings({ game: 'MTG', q: 'lightning' }, db, {});
    expect(mtg.results.map((r) => r.id)).toEqual(['SCRYFALL:aaa']);
  });

  it('searchPrintings by set code and collector number (printed number, padded or not)', async () => {
    const { db } = makeFakeDb({ printings: allPrintings() });
    for (const typed of ['3', '003', '003/165']) {
      const res = await searchPrintings({ game: 'POKEMON', set: 'SV03.5', number: typed }, db, BOTH);
      expect(res.results.map((r) => r.id)).toEqual(['TCGDEX:en:sv03.5-003']);
    }
  });

  it('resolveRefs: Pokemon refs are UNMATCHED without a query while off, order preserved in a mixed list', async () => {
    const refs = [
      { ref: 'a', game: 'MTG' as const, name: 'Lightning Bolt' },
      { ref: 'b', game: 'POKEMON' as const, name: 'Charizard' },
      { ref: 'c', game: 'MTG' as const, scryfallId: 'aaa' },
      { ref: 'd', game: 'POKEMON' as const, setCode: 'base1', collectorNumber: '4' },
    ];
    for (const env of [{}, MASTER_ONLY, TCGDEX_ONLY]) {
      const { db, findMany } = makeFakeDb({ printings: allPrintings() });
      const out = await resolveRefs(refs, db, env);
      expect(out.map((o) => [o.ref, o.status])).toEqual([
        ['a', 'EXACT'],
        ['b', 'UNMATCHED'],
        ['c', 'EXACT'],
        ['d', 'UNMATCHED'],
      ]);
      expect(out[1].candidates).toEqual([]);
      for (const call of findMany.mock.calls) expect(JSON.stringify(call[0])).not.toContain('POKEMON');
    }
    const { db, findMany } = makeFakeDb({ printings: allPrintings() });
    const onlyPokemon = await resolveRefs([refs[1], refs[3]], db, {});
    expect(onlyPokemon.map((o) => o.status)).toEqual(['UNMATCHED', 'UNMATCHED']);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('resolveRefs with the flags on: Charizard is AMBIGUOUS across its four printings, a padded number is EXACT', async () => {
    const { db } = makeFakeDb({ printings: allPrintings() });
    const out = await resolveRefs(
      [
        { ref: 'by-name', game: 'POKEMON', name: 'Charizard' },
        { ref: 'by-number', game: 'POKEMON', setCode: 'BASE1', collectorNumber: '4' },
        { ref: 'venusaur', game: 'POKEMON', setCode: 'sv03.5', collectorNumber: '3', name: 'Venusaur ex' },
        { ref: 'tcgplayer', game: 'POKEMON', tcgplayerProductId: 42382 },
        { ref: 'mtg', game: 'MTG', name: 'Lightning Bolt' },
      ],
      db,
      BOTH,
    );
    expect(out[0].status).toBe('AMBIGUOUS');
    expect(out[0].candidates).toHaveLength(4);
    expect(new Set(out[0].candidates.map((c) => c.setName)).size).toBe(4);
    expect(out[1].status).toBe('AMBIGUOUS');
    expect(out[1].candidates.map((c) => c.id).sort()).toEqual(out[0].candidates.map((c) => c.id).sort());
    expect(out[2].status).toBe('EXACT');
    expect(out[2].candidates[0].id).toBe('TCGDEX:en:sv03.5-003');
    // A TCGplayer product id means nothing to TCGdex rows: they carry none.
    expect(out[3].status).toBe('UNMATCHED');
    expect(out[4].status).toBe('EXACT');
  });

  it('resolveRefs still enforces the 500 ref cap', async () => {
    const { db } = makeFakeDb({ printings: [] });
    const refs = Array.from({ length: 501 }, (_, i) => ({ ref: `r${i}`, game: 'POKEMON' as const, name: 'x' }));
    await expect(resolveRefs(refs, db, {})).rejects.toThrow(/at most 500/);
  });

  it('loadPrintingsByIds leaves Pokemon printings out while off', async () => {
    const ids = ['SCRYFALL:aaa', 'TCGDEX:en:sv01-001', 'TCGDEX:en:sv03.5-003'];
    for (const env of [{}, MASTER_ONLY, TCGDEX_ONLY]) {
      const { db } = makeFakeDb({ printings: allPrintings() });
      expect((await loadPrintingsByIds(ids, db, env)).map((p) => p.id)).toEqual(['SCRYFALL:aaa']);
    }
    const { db } = makeFakeDb({ printings: allPrintings() });
    const on = await loadPrintingsByIds(ids, db, BOTH);
    expect(on.map((p) => p.id).sort()).toEqual([...ids].sort());
    // Magic callers that pass no env keep working.
    expect((await loadPrintingsByIds(['SCRYFALL:aaa'], db)).map((p) => p.id)).toEqual(['SCRYFALL:aaa']);
  });

  it('suggestPriceForPrinting: not found while off, found with NO_PRICE_DATA while on (TCGdex rows carry no price)', async () => {
    const { db } = makeFakeDb({ printings: allPrintings() });
    for (const env of [{}, MASTER_ONLY, TCGDEX_ONLY]) {
      expect(await suggestPriceForPrinting({ printingId: 'TCGDEX:en:sv01-001' }, db, env, NOW)).toEqual({ found: false });
    }
    const on = await suggestPriceForPrinting({ printingId: 'TCGDEX:en:sv01-001' }, db, BOTH, NOW);
    expect(on.found).toBe(true);
    if (on.found) {
      expect(on.printing.game).toBe('POKEMON');
      expect(on.printing.price).toBeNull();
      expect(on.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_DATA', suggestedPrice: null });
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('catalog state and attribution', () => {
  const sources = [READY_SCRYFALL_SOURCE, READY_TCGDEX_SOURCE];

  it('flag off: no TCGDEX key, no attribution, Pokemon not ready, even if a TCGDEX source row exists', async () => {
    const { db } = makeFakeDb({ sources });
    const st = await loadCatalogState(() => db, MASTER_ONLY);
    expect(st.enabled).toBe(true);
    expect(st.readyGames).toEqual(['MTG']);
    expect('TCGDEX' in st.dataAsOf).toBe(false);
    expect(st.attributions).toBeUndefined();
    expect(st.sources.map((s) => s.source)).toEqual(['SCRYFALL']);
  });

  it('flag on: Pokemon is ready, freshness comes from the last success, and the attribution travels with it', async () => {
    const { db } = makeFakeDb({ sources });
    const st = await loadCatalogState(() => db, BOTH);
    expect(st.readyGames).toEqual(['MTG', 'POKEMON']);
    expect(st.dataAsOf.TCGDEX).toBe('2026-10-12T07:50:00.000Z');
    expect(st.attributions).toHaveLength(1);
    expect(st.attributions?.[0].copyright).toBe(TCGDEX_COPYRIGHT_LINE);
    expect(st.sources.map((s) => s.source).sort()).toEqual(['SCRYFALL', 'TCGDEX']);
  });

  it('flag on before the first TCGdex run: Pokemon not ready yet, attribution already present', async () => {
    const { db } = makeFakeDb({ sources: [READY_SCRYFALL_SOURCE] });
    const st = await loadCatalogState(() => db, BOTH);
    expect(st.readyGames).toEqual(['MTG']);
    expect(st.dataAsOf.TCGDEX).toBeUndefined();
    expect(st.attributions).toHaveLength(1);
  });

  it('TCGdex flag on but the master switch off: disabled, the database is not touched, no attribution', async () => {
    const touch = () => {
      throw new Error('database must not be touched');
    };
    const st = await loadCatalogState(touch as any, TCGDEX_ONLY);
    expect(st.enabled).toBe(false);
    expect(st.catalogReady).toBe(false);
    expect(st.attributions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('HTTP handlers', () => {
  function mockRes() {
    const res: any = { statusCode: 200 };
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
  function handlersFor(env: Record<string, string>, printings = allPrintings()) {
    const fake = makeFakeDb({ printings, sources: [READY_SCRYFALL_SOURCE, READY_TCGDEX_SOURCE] });
    return { handlers: createCardCatalogHandlers({ getDb: () => fake.db, getEnv: () => env, now: () => NOW }), ...fake };
  }

  it('status carries the attribution only while the TCGdex flag is on', async () => {
    const off = mockRes();
    await handlersFor(MASTER_ONLY).handlers.status({ query: {} } as any, off);
    expect(off.statusCode).toBe(200);
    expect(off.body.attribution).toBeUndefined();
    expect(off.body.data.attribution).toBeUndefined();
    expect(off.body.dataAsOf.TCGDEX).toBeUndefined();
    expect(JSON.stringify(off.body)).not.toMatch(/TCGdex|Nintendo/);

    const on = mockRes();
    await handlersFor(BOTH).handlers.status({ query: {} } as any, on);
    expect(on.body.attribution).toHaveLength(1);
    expect(on.body.attribution[0]).toMatchObject({
      source: 'TCGDEX',
      licenseName: 'MIT License',
      copyright: 'Copyright (c) 2021 TCGdex',
      disclaimer: TCGDEX_DISCLAIMER,
    });
    expect(on.body.attribution[0].licenseText).toContain('Permission is hereby granted');
    expect(on.body.readyGames).toEqual(['MTG', 'POKEMON']);
  });

  it('search for Pokemon returns nothing while off and the printings while on', async () => {
    const off = mockRes();
    const h = handlersFor(MASTER_ONLY);
    await h.handlers.search({ query: { game: 'POKEMON', q: 'charizard' } } as any, off);
    expect(off.statusCode).toBe(200);
    expect(off.body.results).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();

    const on = mockRes();
    await handlersFor(BOTH).handlers.search({ query: { game: 'POKEMON', q: 'charizard' } } as any, on);
    expect(on.body.results).toHaveLength(4);
  });

  it('resolve answers UNMATCHED for Pokemon while off and matches while on', async () => {
    const body = { refs: [{ ref: 'p', game: 'POKEMON', setCode: 'base1', collectorNumber: '4' }, { ref: 'm', game: 'MTG', scryfallId: 'aaa' }] };
    const off = mockRes();
    await handlersFor(MASTER_ONLY).handlers.resolve({ body } as any, off);
    expect(off.body.results.map((r: any) => [r.ref, r.status])).toEqual([['p', 'UNMATCHED'], ['m', 'EXACT']]);

    const on = mockRes();
    await handlersFor(BOTH).handlers.resolve({ body } as any, on);
    expect(on.body.results.map((r: any) => [r.ref, r.status])).toEqual([['p', 'AMBIGUOUS'], ['m', 'EXACT']]);
  });

  it('suggested-price: a TCGdex printing is 404 while off, and 200 with no price while on', async () => {
    const req = { query: { printingId: 'TCGDEX:en:sv01-001' } } as any;
    const off = mockRes();
    await handlersFor(MASTER_ONLY).handlers.suggestedPrice(req, off);
    expect(off.statusCode).toBe(404);
    expect(off.body.code).toBe('CARD_NOT_FOUND');

    const on = mockRes();
    await handlersFor(BOTH).handlers.suggestedPrice(req, on);
    expect(on.statusCode).toBe(200);
    expect(on.body.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_DATA' });
  });

  it('everything stays disabled (catalogReady:false, no database access) when the master switch is off, TCGdex flag or not', async () => {
    const touch = () => {
      throw new Error('database must not be touched');
    };
    const h = createCardCatalogHandlers({ getDb: touch as any, getEnv: () => TCGDEX_ONLY, now: () => NOW });
    for (const [name, req] of [
      ['status', { query: {} }],
      ['search', { query: { game: 'POKEMON', q: 'charizard' } }],
      ['resolve', { body: { refs: [{ ref: 'p', game: 'POKEMON', name: 'Charizard' }] } }],
      ['suggestedPrice', { query: { printingId: 'TCGDEX:en:sv01-001' } }],
    ] as Array<[string, any]>) {
      const res = mockRes();
      await (h as any)[name](req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ success: true, catalogReady: false });
      expect(res.body.attribution).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('cron entry', () => {
  const saved = { master: process.env.CARD_CATALOG_ENABLED, tcgdex: process.env.CARD_CATALOG_TCGDEX_ENABLED };
  afterEach(() => {
    if (saved.master === undefined) delete process.env.CARD_CATALOG_ENABLED;
    else process.env.CARD_CATALOG_ENABLED = saved.master;
    if (saved.tcgdex === undefined) delete process.env.CARD_CATALOG_TCGDEX_ENABLED;
    else process.env.CARD_CATALOG_TCGDEX_ENABLED = saved.tcgdex;
  });
  beforeEach(() => (cron.schedule as jest.Mock).mockClear());

  it('registers nothing at import time and has its own slot', () => {
    expect(scheduleCallsAtImport).toBe(0);
    expect(CARD_CATALOG_TCGDEX_CRON).toBe('41 7 * * *');
    expect(new Set([CARD_CATALOG_SCRYFALL_CRON, CARD_CATALOG_TCGCSV_CRON, CARD_CATALOG_TCGDEX_CRON]).size).toBe(3);
  });

  it('schedules the TCGdex refresh, and the handler is inert while either flag is off', async () => {
    delete process.env.CARD_CATALOG_ENABLED;
    delete process.env.CARD_CATALOG_TCGDEX_ENABLED;
    scheduleCardCatalogTcgdexRefresh();
    const calls = (cron.schedule as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('41 7 * * *');
    const handler = calls[0][1] as () => Promise<void>;
    await expect(handler()).resolves.toBeUndefined();

    process.env.CARD_CATALOG_ENABLED = 'true'; // TCGdex flag still unset
    await expect(handler()).resolves.toBeUndefined();
  });

  it('the job runner returns null unless both flags are on, then delegates', async () => {
    const run = jest.fn(async () => ({ source: 'TCGDEX' as const, status: 'OK' as const, rowsRead: 0, rowsSkipped: 0, printingsChanged: 0, pricesChanged: 0 }));
    expect(await runCardCatalogTcgdexJob({ env: {}, runTcgdex: run })).toBeNull();
    expect(await runCardCatalogTcgdexJob({ env: MASTER_ONLY, runTcgdex: run })).toBeNull();
    expect(await runCardCatalogTcgdexJob({ env: TCGDEX_ONLY, runTcgdex: run })).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect((await runCardCatalogTcgdexJob({ env: BOTH, runTcgdex: run }))?.status).toBe('OK');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('with real (unset) flags the default job does no work and needs no database', async () => {
    delete process.env.CARD_CATALOG_ENABLED;
    delete process.env.CARD_CATALOG_TCGDEX_ENABLED;
    await expect(runCardCatalogTcgdexJob()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('attribution and the notice file', () => {
  const root = path.resolve(__dirname, '..', '..', '..', '..');
  const notice = (): string => fs.readFileSync(path.join(root, 'NOTICE-tcgdex.md'), 'utf8');

  it('carries the MIT notice, the copyright line and the Nintendo / Pokemon Company disclaimer', () => {
    expect(TCGDEX_ATTRIBUTION.licenseName).toBe('MIT License');
    expect(TCGDEX_ATTRIBUTION.copyright).toBe('Copyright (c) 2021 TCGdex');
    expect(TCGDEX_ATTRIBUTION.url).toBe('https://github.com/tcgdex/cards-database');
    expect(TCGDEX_MIT_LICENSE_TEXT.startsWith('MIT License')).toBe(true);
    expect(TCGDEX_MIT_LICENSE_TEXT).toContain(TCGDEX_COPYRIGHT_LINE);
    expect(TCGDEX_MIT_LICENSE_TEXT).toContain('The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.');
    expect(TCGDEX_MIT_LICENSE_TEXT).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(TCGDEX_ATTRIBUTION.disclaimer).toBe(TCGDEX_DISCLAIMER);
    expect(TCGDEX_DISCLAIMER).toMatch(/Nintendo/);
    expect(TCGDEX_DISCLAIMER).toMatch(/The Pokemon Company/);
    expect(TCGDEX_ATTRIBUTION.scope).toMatch(/No images, prices or third-party product ids/);
  });

  it('NOTICE-tcgdex.md at the repository root repeats every line of the license text, the disclaimer and the source', () => {
    const text = notice();
    for (const line of TCGDEX_MIT_LICENSE_TEXT.split('\n').filter((l) => l.trim().length > 0)) expect(text).toContain(line);
    expect(text).toContain(TCGDEX_DISCLAIMER);
    expect(text).toContain('https://github.com/tcgdex/cards-database');
    expect(text).toContain(TCGDEX_PINNED_REF);
  });
});

// ---------------------------------------------------------------------------------------------
describe('source guards on the TCGdex modules', () => {
  const SRC = path.resolve(__dirname, '..');
  const dir = path.join(SRC, 'services', 'cardCatalog');
  const tcgdexFiles = (): string[] => fs.readdirSync(dir).filter((f) => /^tcgdex.*\.ts$/.test(f)).map((f) => path.join(dir, f));
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const read = (f: string): string => fs.readFileSync(f, 'utf8');

  it('there are five TCGdex modules', () => {
    expect(tcgdexFiles().map((f) => path.basename(f)).sort()).toEqual([
      'tcgdexAttribution.ts',
      'tcgdexIngest.ts',
      'tcgdexLiteralParser.ts',
      'tcgdexMap.ts',
      'tcgdexTarReader.ts',
    ]);
  });

  it('never executes downloaded content and never touches the disk or a child process', () => {
    for (const f of tcgdexFiles()) {
      const code = stripComments(read(f));
      expect(code).not.toMatch(/\beval\s*\(/);
      expect(code).not.toMatch(/new\s+Function\s*\(/);
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(code).not.toMatch(/\bimport\s*\(/);
      expect(code).not.toMatch(/from\s+'(fs|child_process|vm|worker_threads|net|http|https)'/);
      expect(code).not.toMatch(/writeFile|createWriteStream|execSync|spawn\(/);
    }
  });

  it('never calls the hosted TCGdex API or any image host, and reads no third-party, price, image or card text field', () => {
    for (const f of tcgdexFiles()) {
      const code = stripComments(read(f));
      expect(code).not.toMatch(/api\.tcgdex\.net|assets\.tcgdex\.net/);
      expect(code).not.toMatch(/thirdParty|cardtrader|\bpricing\b|marketPrice|illustrator/);
      expect(code).not.toMatch(/\.(tcgplayer|cardmarket|image|images)\b/);
    }
  });

  it('the pure modules read no environment and do no I/O', () => {
    for (const name of ['tcgdexAttribution.ts', 'tcgdexLiteralParser.ts', 'tcgdexMap.ts', 'tcgdexTarReader.ts']) {
      const code = stripComments(read(path.join(dir, name)));
      expect(code).not.toMatch(/process\.env/);
      expect(code).not.toMatch(/httpClient|catalogStore|lib\/prisma|@prisma\/client/);
    }
  });

  it('only the ingest talks to the network layer, and only through the shared allow-listed client', () => {
    const code = stripComments(read(path.join(dir, 'tcgdexIngest.ts')));
    expect(code).toMatch(/assertAllowedUrl\(url\)/);
    expect(code).toMatch(/tcgdexArchiveUrl/);
    expect(code).not.toMatch(/\bfetch\s*\(|axios/);
  });

  it('the new modules, tests, fixtures and notice are plain ASCII', () => {
    const files = [
      ...tcgdexFiles(),
      path.join(SRC, '__tests__', 'cardCatalogTcgdexMap.test.ts'),
      path.join(SRC, '__tests__', 'cardCatalogTcgdexIngest.test.ts'),
      path.join(SRC, '__tests__', 'cardCatalogTcgdexGuards.test.ts'),
      path.join(SRC, '__tests__', '__fixtures__', 'tcgdexFixtures.ts'),
      path.join(root(), 'NOTICE-tcgdex.md'),
    ];
    for (const f of files) {
      const text = read(f);
      expect(text.split('').every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
    }
  });

  function root(): string {
    return path.resolve(SRC, '..', '..', '..');
  }
});
