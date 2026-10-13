/**
 * TCGCSV ingest (ADR-134 batch B3): default-off flag, mapping, spacing, 429, DB-space guard, headers.
 * Synthetic payloads shaped like the live tcgcsv.com responses; no network, no database.
 *
 * Since the TCGdex work (2026-10-12) the TCGCSV job reads Yu-Gi-Oh only: Pokemon is never ingested
 * from TCGCSV (TCGplayer's terms bar combining its data), so the ingest tests below use the
 * Yu-Gi-Oh fixtures and one test proves Pokemon is ignored. The pure Pokemon helpers stay tested.
 */
import {
  TCGCSV_BASE_URL,
  TCGCSV_REQUEST_SPACING_MS,
  buildPriceMap,
  groupSetCode,
  mapTcgcsvProduct,
  runTcgcsvIngest,
} from '../services/cardCatalog/tcgcsvIngest';
import { getEnabledGames, isCatalogEnabled } from '../services/cardCatalog/catalogConfig';
import {
  MemoryCatalogStore,
  TCG_LAST_UPDATED,
  fakeHttp,
  tcgGroups,
  tcgPrices,
  tcgProducts,
} from './__fixtures__/cardCatalogFixtures';

const NOW = new Date('2026-10-04T21:10:00Z');

function tcgHttp(opts: { failOnce?: RegExp; status429?: RegExp } = {}) {
  let failedOnce = false;
  return fakeHttp((url) => {
    if (opts.status429 && opts.status429.test(url)) return { status: 429 };
    if (opts.failOnce && opts.failOnce.test(url) && !failedOnce) {
      failedOnce = true;
      return { status: 503 };
    }
    if (url === `${TCGCSV_BASE_URL}/last-updated.txt`) return { body: TCG_LAST_UPDATED + '\n' };
    let m = /\/tcgplayer\/(\d+)\/groups$/.exec(url);
    if (m) return { body: JSON.stringify(tcgGroups(m[1] === '3' ? 'POKEMON' : 'YUGIOH')) };
    m = /\/tcgplayer\/\d+\/(\d+)\/products$/.exec(url);
    if (m) return { body: JSON.stringify(tcgProducts(Number(m[1]))) };
    m = /\/tcgplayer\/\d+\/(\d+)\/prices$/.exec(url);
    if (m) return { body: JSON.stringify(tcgPrices(Number(m[1]))) };
    return { status: 404 };
  });
}

const deps = (store: MemoryCatalogStore, httpGet: any, env: Record<string, string>, sleep = jest.fn(async () => undefined)) => ({
  store,
  httpGet,
  env,
  now: () => NOW,
  alert: jest.fn(),
  sleep,
});

describe('flag defaults (legal decision D2 pending)', () => {
  it('CARD_CATALOG_ENABLED defaults to false and CARD_CATALOG_GAMES defaults to MTG only', () => {
    expect(isCatalogEnabled({})).toBe(false);
    expect(isCatalogEnabled({ CARD_CATALOG_ENABLED: 'true' })).toBe(true);
    expect(getEnabledGames({})).toEqual(['MTG']);
    expect(getEnabledGames({ CARD_CATALOG_GAMES: '' })).toEqual(['MTG']);
    expect(getEnabledGames({ CARD_CATALOG_GAMES: 'bogus' })).toEqual(['MTG']);
    // POKEMON cannot be listed while CARD_CATALOG_TCGDEX_ENABLED is off; YUGIOH still waits on D2 and must be listed.
    expect(getEnabledGames({ CARD_CATALOG_GAMES: 'mtg, pokemon,YUGIOH,pokemon' })).toEqual(['MTG', 'YUGIOH']);
    expect(getEnabledGames({ CARD_CATALOG_GAMES: 'pokemon' })).toEqual(['MTG']);
  });

  it('with the default games the TCGCSV job does nothing: DISABLED, no request, no bookkeeping', async () => {
    const store = new MemoryCatalogStore();
    const http = tcgHttp();
    const res = await runTcgcsvIngest(deps(store, http.httpGet, { CARD_CATALOG_ENABLED: 'true' }));
    expect(res.status).toBe('DISABLED');
    expect(http.calls).toHaveLength(0);
    expect(store.sources.size).toBe(0);
  });

  it('never ingests Pokemon from TCGCSV, whatever CARD_CATALOG_GAMES and the TCGdex flag say', async () => {
    const envs: Array<Record<string, string>> = [
      { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'MTG,POKEMON' },
      { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'POKEMON', CARD_CATALOG_TCGDEX_ENABLED: 'true' },
    ];
    for (const env of envs) {
      const store = new MemoryCatalogStore();
      const http = tcgHttp();
      const res = await runTcgcsvIngest(deps(store, http.httpGet, env));
      expect(res.status).toBe('DISABLED');
      expect(http.calls).toHaveLength(0);
      expect(store.printings.size).toBe(0);
    }
  });

  it('with Pokemon and Yu-Gi-Oh both listed, only the Yu-Gi-Oh category is requested', async () => {
    const store = new MemoryCatalogStore();
    const http = tcgHttp();
    const env = { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'POKEMON,YUGIOH', CARD_CATALOG_TCGDEX_ENABLED: 'true' };
    const res = await runTcgcsvIngest(deps(store, http.httpGet, env));
    expect(res.status).toBe('OK');
    expect(http.calls.some((c) => c.url.includes('/tcgplayer/3/'))).toBe(false);
    expect(http.calls.some((c) => c.url.endsWith('/tcgplayer/2/groups'))).toBe(true);
    expect(Array.from(store.printings.values()).every((p) => p.game === 'YUGIOH')).toBe(true);
  });
});

describe('TCGCSV ingest for Yu-Gi-Oh', () => {
  const env = { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'MTG,YUGIOH' };

  function ygoHttp(lastUpdated: string) {
    return fakeHttp((url) => {
      if (url.endsWith('/last-updated.txt')) return { body: lastUpdated };
      if (/\/groups$/.test(url)) return { body: JSON.stringify(tcgGroups('YUGIOH')) };
      let m = /\/(\d+)\/products$/.exec(url);
      if (m) return { body: JSON.stringify(tcgProducts(Number(m[1]))) };
      m = /\/(\d+)\/prices$/.exec(url);
      if (m) return { body: JSON.stringify(tcgPrices(Number(m[1]))) };
      return { status: 404 };
    });
  }

  it('stores singles with set, number, rarity, finish and price from the allowed sub-type', async () => {
    const store = new MemoryCatalogStore();
    const res = await runTcgcsvIngest(deps(store, tcgHttp().httpGet, env));
    expect(res.status).toBe('OK');
    expect(store.printings.get('TCGCSV:55001')).toMatchObject({
      game: 'YUGIOH',
      source: 'TCGCSV',
      name: 'Aqua Madoor',
      setCode: 'lob',
      setName: 'The Legend of Blue Eyes White Dragon',
      collectorNumber: 'LOB-027',
      rarity: 'Rare',
      releaseYear: 2002,
      finishes: ['NONFOIL'],
      tcgplayerProductId: 55001,
      language: 'en',
    });
    expect(store.prices.get('TCGCSV:55001')).toMatchObject({ usd: '0.50', usdFoil: null, usdReverse: null });
    expect(res.detail).toMatchObject({ unmappedSubTypes: { 'YUGIOH:1st Edition': 1 } });
  });

  it('a second identical run with a new snapshot changes 0 printing rows and 0 price rows', async () => {
    const store = new MemoryCatalogStore();
    await runTcgcsvIngest(deps(store, tcgHttp().httpGet, env));
    // Same payloads, newer last-updated stamp, so the unchanged-version shortcut is not what is tested.
    const again = await runTcgcsvIngest(deps(store, ygoHttp('2026-10-04T20:05:38+0000').httpGet, env));
    expect(again.status).toBe('OK');
    expect(again.printingsChanged).toBe(0);
    expect(again.pricesChanged).toBe(0);
  });

  it('skips when last-updated and the game list are unchanged', async () => {
    const store = new MemoryCatalogStore();
    await runTcgcsvIngest(deps(store, tcgHttp().httpGet, env));
    const http = tcgHttp();
    const again = await runTcgcsvIngest(deps(store, http.httpGet, env));
    expect(again.status).toBe('SKIPPED_UNCHANGED');
    expect(http.calls).toHaveLength(1);
  });

  it('waits 250 ms between requests and sends User-Agent and Accept on each', async () => {
    const store = new MemoryCatalogStore();
    const sleep = jest.fn(async () => undefined);
    const http = tcgHttp();
    await runTcgcsvIngest(deps(store, http.httpGet, { ...env, CARD_DATA_USER_AGENT: 'FindASale/1.0 (card catalog; test)' }, sleep));
    // 1 last-updated + 1 groups + 1 group x (prices + products) = 4 requests, 3 waits
    expect(http.calls).toHaveLength(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    for (const call of sleep.mock.calls) expect((call as any)[0]).toBe(TCGCSV_REQUEST_SPACING_MS);
    for (const call of http.calls) {
      expect(call.headers['User-Agent']).toBe('FindASale/1.0 (card catalog; test)');
      expect(call.headers['Accept']).toBeTruthy();
      expect(call.url.startsWith(`${TCGCSV_BASE_URL}/`)).toBe(true);
    }
  });

  it('on a later run re-fetches products only for groups modified since the last success or not yet loaded', async () => {
    const store = new MemoryCatalogStore();
    await runTcgcsvIngest(deps(store, tcgHttp().httpGet, env));

    // Last success 2026-10-03 20:30 UTC: group 330 was modified 2026-08-20 (older than the 24 hour margin) and is loaded, so no products request.
    store.sources.get('TCGCSV')!.lastSuccessAt = new Date('2026-10-03T20:30:00Z');
    const quiet = ygoHttp('2026-10-05T20:05:38+0000');
    await runTcgcsvIngest(deps(store, quiet.httpGet, env));
    expect(quiet.calls.filter((c) => c.url.endsWith('/products'))).toEqual([]);
    expect(quiet.calls.filter((c) => c.url.endsWith('/prices'))).toHaveLength(1); // prices every run

    // Last success 2026-08-21: the group was modified 2026-08-20 20:55 UTC, inside the margin, so its products are fetched again.
    store.sources.get('TCGCSV')!.lastSuccessAt = new Date('2026-08-21T00:00:00Z');
    const busy = ygoHttp('2026-10-06T20:05:38+0000');
    await runTcgcsvIngest(deps(store, busy.httpGet, env));
    expect(busy.calls.filter((c) => c.url.endsWith('/products')).map((c) => c.url)).toEqual([`${TCGCSV_BASE_URL}/tcgplayer/2/330/products`]);
  });
});

describe('TCGCSV failure handling and guards', () => {
  const env = { CARD_CATALOG_ENABLED: 'true', CARD_CATALOG_GAMES: 'YUGIOH' };

  it('HTTP 429 stops the run at once with no retry', async () => {
    const store = new MemoryCatalogStore();
    const sleep = jest.fn(async () => undefined);
    const http = tcgHttp({ status429: /\/groups$/ });
    const res = await runTcgcsvIngest(deps(store, http.httpGet, env, sleep));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/429/);
    expect(http.calls.filter((c) => c.url.endsWith('/groups'))).toHaveLength(1);
    expect(store.sources.get('TCGCSV')?.consecutiveFailures).toBe(1);
  });

  it('retries a 5xx once and then succeeds', async () => {
    const store = new MemoryCatalogStore();
    const http = tcgHttp({ failOnce: /\/330\/prices$/ });
    const res = await runTcgcsvIngest(deps(store, http.httpGet, env));
    expect(res.status).toBe('OK');
    expect(http.calls.filter((c) => c.url.endsWith('/330/prices'))).toHaveLength(2);
  });

  it('records SKIPPED_DB_SPACE and makes no request when the database exceeds the soft limit', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = 4200;
    const http = tcgHttp();
    const d = deps(store, http.httpGet, env);
    const res = await runTcgcsvIngest(d);
    expect(res.status).toBe('SKIPPED_DB_SPACE');
    expect(http.calls).toHaveLength(0);
    expect(store.sources.get('TCGCSV')?.lastStatus).toBe('SKIPPED_DB_SPACE');
    expect(d.alert).toHaveBeenCalledTimes(1);
  });
});

describe('pure TCGCSV helpers', () => {
  it('groupSetCode falls back to g<groupId> when the abbreviation is empty', () => {
    expect(groupSetCode({ groupId: 9, name: 'x', abbreviation: ' BS ', isSupplemental: false, publishedOn: null, modifiedOn: null })).toBe('bs');
    expect(groupSetCode({ groupId: 9, name: 'x', abbreviation: '', isSupplemental: false, publishedOn: null, modifiedOn: null })).toBe('g9');
  });

  it('mapTcgcsvProduct returns null for products without a Number', () => {
    const group = { groupId: 1, name: 'G', abbreviation: 'G', isSupplemental: false, publishedOn: '2020-01-01T00:00:00', modifiedOn: null };
    expect(mapTcgcsvProduct('POKEMON', group, { productId: 1, name: 'Box', extendedData: [] }, [])).toBeNull();
    expect(mapTcgcsvProduct('POKEMON', group, { productId: 2, name: 'Card', extendedData: [{ name: 'Number', value: '5/10' }] }, ['NONFOIL'])).toMatchObject({
      id: 'TCGCSV:2',
      collectorNumber: '5/10',
      releaseYear: 2020,
    });
  });

  it('mapTcgcsvProduct leaves releaseYear null for supplemental groups (their publishedOn is a refresh timestamp)', () => {
    const group = { groupId: 2332, name: 'Promos', abbreviation: 'PPP', isSupplemental: true, publishedOn: '2026-10-03T20:00:05Z', modifiedOn: null };
    expect(mapTcgcsvProduct('POKEMON', group, { productId: 7, name: 'Promo', extendedData: [{ name: 'Number', value: 'PP-001' }] }, [])?.releaseYear).toBeNull();
  });

  it('Yu-Gi-Oh stores Unlimited only and counts 1st Edition as unmapped (DECISION NEEDED)', () => {
    const unmapped = new Map<string, number>();
    const map = buildPriceMap('YUGIOH', [
      { productId: 5, marketPrice: 0.5, subTypeName: 'Unlimited' },
      { productId: 5, marketPrice: 9.5, subTypeName: '1st Edition' },
    ], unmapped);
    expect(map.prices.get(5)).toEqual({ usd: '0.50', usdFoil: null, usdReverse: null });
    expect(map.finishes.get(5)).toEqual(['NONFOIL']);
    expect(unmapped.get('YUGIOH:1st Edition')).toBe(1);
  });
});
