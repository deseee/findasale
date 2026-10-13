/**
 * TCGdex Pokemon identity ingest, end to end over an in-memory store and a fake archive download.
 * Covers: off by default, identity only (nothing third-party survives), idempotent re-runs, the
 * database soft limit, per-set error isolation, language handling and failure behavior.
 * No network, no database.
 */
import { TCGDEX_PINNED_REF } from '../services/cardCatalog/catalogConfig';
import {
  TCGDEX_MAX_UNREADABLE_RATIO,
  TCGDEX_SPACE_CHECK_EVERY_SETS,
  TcgdexProgress,
  runTcgdexIngest,
  tcgdexArchiveUrl,
} from '../services/cardCatalog/tcgdexIngest';
import type { PrintingRow } from '../services/cardCatalog/types';
import { MemoryCatalogStore, fakeHttp } from './__fixtures__/cardCatalogFixtures';
import {
  ARCHIVE_URL,
  FixtureFile,
  JA_CARD_NAME,
  JA_SET_NAME,
  STANDARD_ENGLISH_CARD_FILES,
  STANDARD_ENGLISH_ROW_COUNT,
  archiveBody,
  buildTarGz,
  simpleSet,
  standardFixtureFiles,
} from './__fixtures__/tcgdexFixtures';

const NOW = new Date('2026-10-12T07:41:00Z');
const ON = { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_TCGDEX_ENABLED: 'true' };
const CODELOAD_PREFIX = 'https://codeload.github.com/tcgdex/cards-database/tar.gz/';
const OTHER_REF = 'b'.repeat(40);
const VERSION_EN = `tcgdex:${TCGDEX_PINNED_REF}|en`;

function makeDeps(store: MemoryCatalogStore, httpGet: any, env: Record<string, string> = ON, alert = jest.fn()) {
  return { store, httpGet, env, now: () => NOW, alert, sleep: async () => undefined };
}

/** Serves the same archive for any pinned ref, as a fresh chunked stream per request. */
function archiveHttp(files: FixtureFile[] = standardFixtureFiles(), mutate: (gz: Buffer) => Buffer = (b) => b) {
  const gz = mutate(buildTarGz(files));
  return fakeHttp((url) => (url.startsWith(CODELOAD_PREFIX) ? { body: archiveBody(gz) } : { status: 404 }));
}

const allRows = (store: MemoryCatalogStore): PrintingRow[] => Array.from(store.printings.values());

let errorSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

// ---------------------------------------------------------------------------------------------
describe('off by default: with either flag unset nothing happens', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['no flags at all', {}],
    ['only the catalog master switch', { CARD_CATALOG_ENABLED: 'true' }],
    ['only the TCGdex switch', { CARD_CATALOG_TCGDEX_ENABLED: 'true' }],
    ['the TCGdex switch false', { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_TCGDEX_ENABLED: 'false' }],
    ['POKEMON listed in CARD_CATALOG_GAMES without the TCGdex switch', { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'MTG,POKEMON' }],
  ];

  it.each(cases)('%s: DISABLED, no download, no store access', async (_label, env) => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, env));
    expect(res.status).toBe('DISABLED');
    expect(res.source).toBe('TCGDEX');
    expect(http.calls).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    expect(store.printings.size).toBe(0);
    expect(store.sources.size).toBe(0);
  });

  it('does not even construct a database store when disabled', async () => {
    await expect(runTcgdexIngest({ env: {} })).resolves.toMatchObject({ status: 'DISABLED', source: 'TCGDEX' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('a complete English run over the standard fixture archive', () => {
  it('stores identity rows only and reports what it skipped', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    const alert = jest.fn();
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, ON, alert));

    expect(res.status).toBe('OK');
    expect(res.source).toBe('TCGDEX');
    expect(res.rowsRead).toBe(STANDARD_ENGLISH_CARD_FILES);
    expect(res.rowsSkipped).toBe(2); // one unreadable file, one French-only card
    expect(res.printingsChanged).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(res.pricesChanged).toBe(0);
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(store.prices.size).toBe(0);
    expect(alert).not.toHaveBeenCalled();

    expect(res.detail).toMatchObject({
      ref: TCGDEX_PINNED_REF,
      languages: ['en'],
      sets: 5,
      setsUpserted: 5,
      setsFailed: [],
      unreadableSets: [],
      unreadableCards: 1,
      cardsWithoutSet: 0,
      cardsNotInRequestedLanguages: 1,
      unmappedVariantNotes: {},
    });

    const state = store.sources.get('TCGDEX');
    expect(state?.lastStatus).toBe('OK');
    expect(state?.sourceVersion).toBe(VERSION_EN);
    expect(state?.rowsUpserted).toBe(STANDARD_ENGLISH_ROW_COUNT);
  });

  it('requests exactly one URL: the pinned archive on codeload, never the hosted TCGdex API', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    await runTcgdexIngest(makeDeps(store, http.httpGet));
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe(ARCHIVE_URL);
    expect(ARCHIVE_URL).toBe(`${CODELOAD_PREFIX}${TCGDEX_PINNED_REF}`);
    expect(tcgdexArchiveUrl(TCGDEX_PINNED_REF)).toBe(ARCHIVE_URL);
    for (const c of http.calls) {
      expect(c.url).not.toMatch(/api\.tcgdex\.net|assets\.tcgdex\.net|tcgplayer|cardmarket/i);
      expect(c.headers['User-Agent']).toBe('FindASale/1.0 (card catalog)');
    }
  });

  it('nothing third-party survives: ids, prices and image links are absent from every stored row', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    const rows = allRows(store);
    expect(rows.length).toBe(STANDARD_ENGLISH_ROW_COUNT);
    for (const r of rows) {
      expect(r.source).toBe('TCGDEX');
      expect(r.game).toBe('POKEMON');
      expect(r.id.startsWith('TCGDEX:')).toBe(true);
      expect(r.scryfallId).toBeNull();
      expect(r.tcgplayerProductId).toBeNull();
      expect(r.cardmarketId).toBeNull();
      expect(r.imageSmallUrl).toBeNull();
      expect(r.imageNormalUrl).toBeNull();
    }
    const text = JSON.stringify([rows, res, Array.from(store.sources.values()), store.runs]);
    const needles = [
      '42382', '106999', '273699', '660224', // Base Set Charizard
      '487828', '702298', // Pineco
      '502554', '733598', '261103', // Venusaur ex
      '888001', '888002', '888003', '888004', // the priced test card
      '1523', '5322', '5402', '23237', // set level ids
      'assets.tcgdex.net', 'marketPrice', 'lowPrice', 'cardtrader', 'thirdParty', 'pricing',
    ];
    for (const n of needles) expect(text).not.toContain(n);
  });

  it('keeps the per-printing variants: Base Set Charizard is four rows, a modern card has a reverse holo, and a missing rarity stays null', async () => {
    const store = new MemoryCatalogStore();
    await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    const charizard = allRows(store).filter((r) => r.setCode === 'base1');
    expect(charizard.map((r) => r.id).sort()).toEqual(
      [
        'TCGDEX:en:base1-4:1999-2000-copyright',
        'TCGDEX:en:base1-4:shadowless',
        'TCGDEX:en:base1-4:shadowless+1st-edition',
        'TCGDEX:en:base1-4:unlimited',
      ].sort(),
    );
    expect(charizard.every((r) => r.name === 'Charizard' && r.finishes.join() === 'HOLO' && r.collectorNumber === '4/102')).toBe(true);
    expect(store.printings.get('TCGDEX:en:base1-4:shadowless+1st-edition')?.setName).toBe('Base Set (Shadowless, 1st Edition)');

    expect(store.printings.get('TCGDEX:en:sv01-001')?.finishes).toEqual(['NONFOIL', 'REVERSE_HOLO']);
    expect(store.printings.get('TCGDEX:en:sv03.5-003')?.finishes).toEqual(['HOLO']);
    expect(store.printings.get('TCGDEX:en:swshp-SWSH001')?.rarity).toBeNull();
    expect(store.printings.get('TCGDEX:en:swshp-SWSH001:w-promo')?.setName).toBe('SWSH Black Star Promos (W Promo)');
    expect(store.printings.get('TCGDEX:en:swshp-SWSH002')?.finishes).toEqual(['NONFOIL', 'HOLO']);
    // The unreadable card and the French-only card produced nothing.
    expect(store.printings.has('TCGDEX:en:swshp-SWSH003')).toBe(false);
    expect(store.printings.has('TCGDEX:en:swshp-SWSH004')).toBe(false);
  });

  it('reports progress after each set', async () => {
    const store = new MemoryCatalogStore();
    const seen: TcgdexProgress[] = [];
    await runTcgdexIngest({ ...makeDeps(store, archiveHttp().httpGet), onProgress: (p) => seen.push({ ...p }) });
    expect(seen.length).toBe(5);
    const last = seen[seen.length - 1];
    expect(last.setsUpserted).toBe(5);
    expect(last.setsFailed).toBe(0);
    expect(last.printingsChanged).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(seen.map((p) => p.setsUpserted)).toEqual([...seen.map((p) => p.setsUpserted)].sort((a, b) => a - b));
  });

  it('is independent of archive chunking and of file order inside a set (cards before their set file)', async () => {
    const late = simpleSet('T', 'Late Set', 'late1', 2);
    const files = [...late.slice(1), late[0]]; // card files first, set file last
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(res.status).toBe('OK');
    expect(Array.from(store.printings.keys()).sort()).toEqual(['TCGDEX:en:late1-1', 'TCGDEX:en:late1-2']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('idempotent re-runs', () => {
  it('the same ref and languages again: SKIPPED_UNCHANGED, no second download, nothing written', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    await runTcgdexIngest(makeDeps(store, http.httpGet));
    const snapshot = JSON.stringify(allRows(store));
    const again = await runTcgdexIngest(makeDeps(store, http.httpGet));
    expect(again.status).toBe('SKIPPED_UNCHANGED');
    expect(again.printingsChanged).toBe(0);
    expect(http.calls).toHaveLength(1);
    expect(JSON.stringify(allRows(store))).toBe(snapshot);
    expect(store.sources.get('TCGDEX')?.lastStatus).toBe('SKIPPED_UNCHANGED');
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(VERSION_EN);
  });

  it('a new ref with identical content downloads again but changes 0 rows', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    await runTcgdexIngest(makeDeps(store, http.httpGet));
    const second = await runTcgdexIngest(makeDeps(store, http.httpGet, { ...ON, CARD_CATALOG_TCGDEX_REF: OTHER_REF }));
    expect(second.status).toBe('OK');
    expect(second.rowsRead).toBe(STANDARD_ENGLISH_CARD_FILES);
    expect(second.printingsChanged).toBe(0);
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1].url).toBe(tcgdexArchiveUrl(OTHER_REF));
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(`tcgdex:${OTHER_REF}|en`);
  });

  it('a changed card rewrites only that card', async () => {
    const store = new MemoryCatalogStore();
    await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    const files = standardFixtureFiles().map((f) =>
      f.path.endsWith('Filler Set/7.ts') ? { ...f, content: f.content.replace('Common', 'Rare') } : f,
    );
    const second = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet, { ...ON, CARD_CATALOG_TCGDEX_REF: OTHER_REF }));
    expect(second.printingsChanged).toBe(1);
    expect(store.printings.get('TCGDEX:en:tst1-7')?.rarity).toBe('Rare');
  });

  it('a tag is an acceptable ref', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, { ...ON, CARD_CATALOG_TCGDEX_REF: 'v2026.10.1' }));
    expect(res.status).toBe('OK');
    expect(http.calls[0].url).toBe(tcgdexArchiveUrl('v2026.10.1'));
  });
});

// ---------------------------------------------------------------------------------------------
describe('database soft limit (same guard as the Scryfall job)', () => {
  it('stops before any network call when the database is over DB_SOFT_LIMIT_MB', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = 5000; // default limit is 4000
    const http = archiveHttp();
    const alert = jest.fn();
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, ON, alert));
    expect(res.status).toBe('SKIPPED_DB_SPACE');
    expect(http.calls).toHaveLength(0);
    expect(store.printings.size).toBe(0);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(store.sources.get('TCGDEX')?.lastStatus).toBe('SKIPPED_DB_SPACE');
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();
  });

  it('honors DB_SOFT_LIMIT_MB from the environment', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = 5000;
    const blocked = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, DB_SOFT_LIMIT_MB: '4500' }));
    expect(blocked.status).toBe('SKIPPED_DB_SPACE');
    const allowed = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, DB_SOFT_LIMIT_MB: '6000' }));
    expect(allowed.status).toBe('OK');
  });

  it('runs when the size is unknown', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = null;
    expect((await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet))).status).toBe('OK');
  });

  it('stops cleanly in the middle of a run: finished sets stay, nothing half written, version not recorded', async () => {
    const files: FixtureFile[] = [];
    for (let i = 0; i < TCGDEX_SPACE_CHECK_EVERY_SETS + 1; i++) files.push(...simpleSet('S', `Soft Set ${String(i).padStart(2, '0')}`, `ss${i}`, 1));
    const store = new MemoryCatalogStore();
    let calls = 0;
    store.getDbSizeMb = async () => (++calls === 1 ? 100 : 9999);
    const alert = jest.fn();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet, ON, alert));
    expect(res.status).toBe('SKIPPED_DB_SPACE');
    expect(store.printings.size).toBe(TCGDEX_SPACE_CHECK_EVERY_SETS);
    expect(res.printingsChanged).toBe(TCGDEX_SPACE_CHECK_EVERY_SETS);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(store.sources.get('TCGDEX')?.lastStatus).toBe('SKIPPED_DB_SPACE');
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();

    // Once there is room again the next run completes, and only the missing set is new.
    store.getDbSizeMb = async () => 100;
    const next = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(next.status).toBe('OK');
    expect(next.printingsChanged).toBe(1);
    expect(store.printings.size).toBe(TCGDEX_SPACE_CHECK_EVERY_SETS + 1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('failures leave the previous rows serving', () => {
  async function loaded() {
    const store = new MemoryCatalogStore();
    await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    return store;
  }
  const next = { ...ON, CARD_CATALOG_TCGDEX_REF: OTHER_REF };

  it('HTTP 429: stops, no retry, rows and version unchanged', async () => {
    const store = await loaded();
    const http = fakeHttp(() => ({ status: 429 }));
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, next));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/429/);
    expect(res.error).toMatch(/no retry/);
    expect(http.calls).toHaveLength(1);
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(VERSION_EN);
    expect(store.sources.get('TCGDEX')?.consecutiveFailures).toBe(1);
  });

  it('HTTP 404 and HTTP 503', async () => {
    for (const status of [404, 503]) {
      const store = await loaded();
      const http = fakeHttp(() => ({ status }));
      const res = await runTcgdexIngest(makeDeps(store, http.httpGet, next));
      expect(res.status).toBe('FAILED');
      expect(res.error).toContain(String(status));
      expect(http.calls).toHaveLength(1);
      expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT);
    }
  });

  it('a moving branch name is refused before any download', async () => {
    for (const ref of ['master', 'main', 'HEAD']) {
      const store = new MemoryCatalogStore();
      const http = archiveHttp();
      const res = await runTcgdexIngest(makeDeps(store, http.httpGet, { ...ON, CARD_CATALOG_TCGDEX_REF: ref }));
      expect(res.status).toBe('FAILED');
      expect(res.error).toMatch(/commit id or a tag/);
      expect(http.calls).toHaveLength(0);
      expect(store.printings.size).toBe(0);
    }
  });

  it('a truncated archive fails the run and records no version', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp(standardFixtureFiles(), (gz) => gz.subarray(0, Math.floor(gz.length / 2)));
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet));
    expect(res.status).toBe('FAILED');
    expect(store.sources.get('TCGDEX')?.lastStatus).toBe('FAILED');
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();
  });

  it('an archive that is not gzip fails the run', async () => {
    const store = new MemoryCatalogStore();
    const http = fakeHttp(() => ({ body: 'this is not an archive' }));
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet));
    expect(res.status).toBe('FAILED');
    expect(store.printings.size).toBe(0);
  });

  it('a decompressed archive over the size limit fails the run', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest({ ...makeDeps(store, archiveHttp().httpGet), limits: { maxTotalBytes: 4096, maxEntryBytes: 262144 } });
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/larger than the allowed size/);
  });

  it('raises the alert on the third failure in a row', async () => {
    const store = new MemoryCatalogStore();
    const alert = jest.fn();
    const http = fakeHttp(() => ({ status: 503 }));
    for (let i = 0; i < 3; i++) await runTcgdexIngest(makeDeps(store, http.httpGet, ON, alert));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toMatch(/TCGDEX/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('one bad set or file does not stop the run', () => {
  class FlakyStore extends MemoryCatalogStore {
    failing = true;
    async upsertPrintings(rows: PrintingRow[]) {
      if (this.failing && rows.some((r) => r.id.startsWith('TCGDEX:en:tst1-'))) throw new Error('simulated write failure');
      return super.upsertPrintings(rows);
    }
  }

  it('a set that cannot be written is recorded, the other sets are stored, the version stays unrecorded, and a healthy re-run completes', async () => {
    const store = new FlakyStore();
    const alert = jest.fn();
    const first = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, ON, alert));
    expect(first.status).toBe('OK');
    expect(first.detail).toMatchObject({ setsUpserted: 4, setsFailed: ['data/Test/Filler Set'] });
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT - 40);
    expect(store.sources.get('TCGDEX')?.lastStatus).toBe('OK');
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toMatch(/could not be written/);

    store.failing = false;
    const second = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    expect(second.status).toBe('OK');
    expect(second.printingsChanged).toBe(40);
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT);
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(VERSION_EN);
  });

  it('a set file that cannot be read makes its cards unreadable, and the run fails when too many are', async () => {
    const files = [
      ...simpleSet('T', 'Good Set', 'good1', 30),
      { path: 'data/T/Bad Set.ts', content: 'const set: Set = { id: makeId("x") }\nexport default set\n' },
      ...[1, 2, 3, 4].map((i) => ({ path: `data/T/Bad Set/${i}.ts`, content: 'const card: Card = { name: { en: "Orphan" } }\nexport default card\n' })),
    ];
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/could not be read/);
    expect(res.detail).toMatchObject({ unreadableSets: ['data/T/Bad Set'], cardsWithoutSet: 4 });
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();
  });

  it('a few unreadable files under the ratio are skipped and counted', async () => {
    expect(TCGDEX_MAX_UNREADABLE_RATIO).toBe(0.05);
    const files = [
      ...simpleSet('T', 'Mostly Set', 'mostly1', 40),
      { path: 'data/T/Mostly Set/99.ts', content: 'const card: Card = { name: { en: makeName("x") } }\nexport default card\n' },
    ];
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(res.status).toBe('OK');
    expect(res.rowsRead).toBe(41);
    expect(res.rowsSkipped).toBe(1);
    expect(res.detail).toMatchObject({ unreadableCards: 1 });
    expect(store.printings.size).toBe(40);
  });

  it('too many unreadable files fail the run (a changed source format is a failure, not a success)', async () => {
    const files = [
      ...simpleSet('T', 'Ratio Set', 'ratio1', 3),
      { path: 'data/T/Ratio Set/9.ts', content: 'const card: Card = { name: { en: makeName("x") } }\nexport default card\n' },
    ];
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/1 of 4 card files could not be read/);
    expect(store.sources.get('TCGDEX')?.sourceVersion ?? null).toBeNull();
  });

  it('an archive with no usable card fails the run', async () => {
    const files: FixtureFile[] = [
      { path: 'data/T/French Set.ts', content: 'const set: Set = { id: "fr1", name: { fr: "Seulement" } }\nexport default set\n' },
      { path: 'data/T/French Set/1.ts', content: 'const card: Card = { name: { fr: "Un" } }\nexport default card\n' },
      { path: 'README.md', content: 'x' },
    ];
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp(files).httpGet));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/no usable cards/);
    expect(store.printings.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('languages (CARD_CATALOG_TCGDEX_LANGUAGES)', () => {
  it('defaults to English only: no Japanese rows even though the archive has a Japanese set', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet));
    expect(res.detail).toMatchObject({ languages: ['en'] });
    expect(allRows(store).every((r) => r.language === 'en')).toBe(true);
    expect(store.printings.has('TCGDEX:ja:SV99-001')).toBe(false);
  });

  it('unknown codes fall back to English', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, CARD_CATALOG_TCGDEX_LANGUAGES: 'xx,nl' }));
    expect(res.detail).toMatchObject({ languages: ['en'] });
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(VERSION_EN);
  });

  it('en,ja adds the Japanese set from data-asia with language ja', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, CARD_CATALOG_TCGDEX_LANGUAGES: 'en,ja' }));
    expect(res.status).toBe('OK');
    expect(res.rowsRead).toBe(STANDARD_ENGLISH_CARD_FILES + 1);
    expect(store.printings.size).toBe(STANDARD_ENGLISH_ROW_COUNT + 1);
    expect(store.printings.get('TCGDEX:ja:SV99-001')).toMatchObject({
      source: 'TCGDEX',
      game: 'POKEMON',
      language: 'ja',
      name: JA_CARD_NAME,
      setName: JA_SET_NAME,
      setCode: 'sv99',
      collectorNumber: '001/50',
      rarity: 'Common',
      releaseYear: 2024,
      finishes: ['NONFOIL', 'REVERSE_HOLO'],
    });
    expect(store.sources.get('TCGDEX')?.sourceVersion).toBe(`tcgdex:${TCGDEX_PINNED_REF}|en,ja`);
  });

  it('changing the language list triggers a new download even for the same ref', async () => {
    const store = new MemoryCatalogStore();
    const http = archiveHttp();
    await runTcgdexIngest(makeDeps(store, http.httpGet));
    const res = await runTcgdexIngest(makeDeps(store, http.httpGet, { ...ON, CARD_CATALOG_TCGDEX_LANGUAGES: 'en,ja' }));
    expect(res.status).toBe('OK');
    expect(res.printingsChanged).toBe(1);
    expect(http.calls).toHaveLength(2);
  });

  it('ja alone reads only data-asia', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, CARD_CATALOG_TCGDEX_LANGUAGES: 'ja' }));
    expect(res.status).toBe('OK');
    expect(res.rowsRead).toBe(1);
    expect(Array.from(store.printings.keys())).toEqual(['TCGDEX:ja:SV99-001']);
  });

  it('fr stores the French names and nothing in English', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgdexIngest(makeDeps(store, archiveHttp().httpGet, { ...ON, CARD_CATALOG_TCGDEX_LANGUAGES: 'fr' }));
    expect(res.status).toBe('OK');
    expect(allRows(store).every((r) => r.language === 'fr')).toBe(true);
    expect(store.printings.get('TCGDEX:fr:swshp-SWSH004')?.name).toBe('Seulement francais');
    const dracaufeu = allRows(store).filter((r) => r.name === 'Dracaufeu');
    expect(dracaufeu).toHaveLength(4);
    expect(dracaufeu.every((r) => r.setName?.startsWith('Set de Base ('))).toBe(true);
  });
});
