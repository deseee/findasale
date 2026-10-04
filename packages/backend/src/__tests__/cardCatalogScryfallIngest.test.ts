/**
 * ADR-134 batch B3 acceptance (1), (2), (3), (7), (8), (9) for the Scryfall ingest, plus mapping rules.
 * Synthetic 50-row Scryfall-shaped fixture; no network, no database.
 */
import { Readable } from 'stream';
import {
  SCRYFALL_BULK_DATA_URL,
  mapScryfallCard,
  runScryfallIngest,
} from '../services/cardCatalog/scryfallIngest';
import { DEFAULT_DB_SOFT_LIMIT_MB } from '../services/cardCatalog/catalogConfig';
import {
  MemoryCatalogStore,
  SCRYFALL_DOWNLOAD_URL,
  SCRYFALL_UPDATED_AT,
  bulkListing,
  chunked,
  fakeHttp,
  gzipJsonl,
  scryfallCard,
  scryfallRows,
} from './__fixtures__/cardCatalogFixtures';

const NOW = new Date('2026-10-04T06:23:00Z');
const baseDeps = (store: MemoryCatalogStore, httpGet: any, env: Record<string, string> = {}) => ({
  store,
  httpGet,
  env,
  now: () => NOW,
  alert: jest.fn(),
  sleep: async () => undefined,
});

function okHttp(rows = scryfallRows(50), updatedAt = SCRYFALL_UPDATED_AT) {
  return fakeHttp((url) => {
    if (url === SCRYFALL_BULK_DATA_URL) return { body: JSON.stringify(bulkListing(updatedAt)) };
    if (url === SCRYFALL_DOWNLOAD_URL) return { body: chunked(gzipJsonl(rows)) };
    return { status: 404 };
  });
}

describe('Scryfall ingest (acceptance 1): 50-row fixture', () => {
  it('inserts 50 printings and prices, and a second pass over identical data changes 0 rows', async () => {
    const store = new MemoryCatalogStore();
    const first = await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    expect(first.status).toBe('OK');
    expect(first.rowsRead).toBe(50);
    expect(first.printingsChanged).toBe(50);
    expect(store.printings.size).toBe(50);
    expect(first.pricesChanged).toBe(store.prices.size);
    // Fixture cards 13, 20, 34 and 41 carry no price at all, so no price row is created for them.
    expect(store.prices.size).toBe(46);

    // Force a full second pass with a NEW bulk version (so the unchanged-version shortcut is not what is tested).
    const second = await runScryfallIngest(baseDeps(store, okHttp(scryfallRows(50), '2026-10-04T21:05:42.559+00:00').httpGet));
    expect(second.status).toBe('OK');
    expect(second.rowsRead).toBe(50);
    expect(second.printingsChanged).toBe(0); // rows updated = 0: no dead-tuple churn
    expect(second.pricesChanged).toBe(0);
  });

  it('writes only changed rows when one card changes', async () => {
    const store = new MemoryCatalogStore();
    await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    const rows = scryfallRows(50);
    rows[3] = scryfallCard(3, { prices: { usd: '9.99', usd_foil: null, usd_etched: null } });
    const again = await runScryfallIngest(baseDeps(store, okHttp(rows, '2026-10-04T21:05:42.559+00:00').httpGet));
    expect(again.printingsChanged).toBe(0);
    expect(again.pricesChanged).toBe(1);
  });

  it('skips a run whose bulk version is already stored (SKIPPED_UNCHANGED) without downloading', async () => {
    const store = new MemoryCatalogStore();
    await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    const http = okHttp();
    const again = await runScryfallIngest(baseDeps(store, http.httpGet));
    expect(again.status).toBe('SKIPPED_UNCHANGED');
    expect(http.calls.map((c) => c.url)).toEqual([SCRYFALL_BULK_DATA_URL]);
    expect(store.sources.get('SCRYFALL')?.lastStatus).toBe('SKIPPED_UNCHANGED');
  });

  it('records the bulk updated_at as sourceVersion and OK bookkeeping', async () => {
    const store = new MemoryCatalogStore();
    await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    const src = store.sources.get('SCRYFALL')!;
    expect(src.lastStatus).toBe('OK');
    expect(src.sourceVersion).toBe(SCRYFALL_UPDATED_AT);
    expect(src.rowsUpserted).toBe(50);
    expect(src.consecutiveFailures).toBe(0);
    expect(src.lastSuccessAt).toEqual(NOW);
    const price = store.prices.get('SCRYFALL:00000000-0000-4000-8000-000000000000')!;
    expect(price.asOf.toISOString()).toBe('2026-10-03T21:05:42.559Z');
  });
});

describe('Scryfall ingest (acceptance 2): failed download keeps old rows', () => {
  it('HTTP 500 on the file: old rows intact, lastStatus FAILED, consecutiveFailures +1', async () => {
    const store = new MemoryCatalogStore();
    await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    const before = new Map(store.printings);

    const bad = fakeHttp((url) => (url === SCRYFALL_BULK_DATA_URL ? { body: JSON.stringify(bulkListing('2026-10-05T21:05:42.559+00:00')) } : { status: 500 }));
    const deps = baseDeps(store, bad.httpGet);
    const res = await runScryfallIngest(deps);
    expect(res.status).toBe('FAILED');
    expect(res.consecutiveFailures).toBe(1);
    expect(store.printings.size).toBe(50);
    expect(store.printings).toEqual(before);
    const src = store.sources.get('SCRYFALL')!;
    expect(src.lastStatus).toBe('FAILED');
    expect(src.consecutiveFailures).toBe(1);
    expect(src.sourceVersion).toBe(SCRYFALL_UPDATED_AT); // not advanced, so the next run retries

    const res2 = await runScryfallIngest(deps);
    expect(res2.consecutiveFailures).toBe(2);
    expect(deps.alert).not.toHaveBeenCalled();
    const res3 = await runScryfallIngest(deps);
    expect(res3.consecutiveFailures).toBe(3);
    expect(deps.alert).toHaveBeenCalledTimes(1); // three in a row raises one alert
  });

  it('a stream that errors mid-download fails the run and deletes nothing', async () => {
    const store = new MemoryCatalogStore();
    await runScryfallIngest(baseDeps(store, okHttp().httpGet));
    const gz = gzipJsonl(scryfallRows(50));
    const broken = fakeHttp((url) => {
      if (url === SCRYFALL_BULK_DATA_URL) return { body: JSON.stringify(bulkListing('2026-10-05T21:05:42.559+00:00')) };
      const body = new Readable({ read() {} });
      body.push(gz.subarray(0, 120));
      setImmediate(() => body.destroy(new Error('socket reset')));
      return { body };
    });
    const res = await runScryfallIngest(baseDeps(store, broken.httpGet));
    expect(res.status).toBe('FAILED');
    expect(store.printings.size).toBe(50);
    expect(store.sources.get('SCRYFALL')?.lastStatus).toBe('FAILED');
  });

  it('a bulk listing without default_cards fails cleanly', async () => {
    const store = new MemoryCatalogStore();
    const http = fakeHttp(() => ({ body: JSON.stringify({ object: 'list', data: [] }) }));
    const res = await runScryfallIngest(baseDeps(store, http.httpGet));
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/default_cards/);
  });

  it('an empty file is a failure, not a success', async () => {
    const store = new MemoryCatalogStore();
    const res = await runScryfallIngest(baseDeps(store, okHttp([]).httpGet));
    expect(res.status).toBe('FAILED');
  });
});

describe('Scryfall ingest (acceptance 3): HTTP 429 stops the run, no retry', () => {
  it('429 on the bulk listing: one request, FAILED, never retried', async () => {
    const store = new MemoryCatalogStore();
    const http = fakeHttp(() => ({ status: 429, body: 'slow down' }));
    const res = await runScryfallIngest(baseDeps(store, http.httpGet));
    expect(http.calls).toHaveLength(1);
    expect(res.status).toBe('FAILED');
    expect(res.error).toMatch(/429/);
    expect(store.sources.get('SCRYFALL')?.consecutiveFailures).toBe(1);
  });

  it('429 on the file download: two requests in total, no retry', async () => {
    const store = new MemoryCatalogStore();
    const http = fakeHttp((url) => (url === SCRYFALL_BULK_DATA_URL ? { body: JSON.stringify(bulkListing()) } : { status: 429 }));
    const res = await runScryfallIngest(baseDeps(store, http.httpGet));
    expect(http.calls).toHaveLength(2);
    expect(res.status).toBe('FAILED');
    expect(store.printings.size).toBe(0);
  });
});

describe('Scryfall ingest (acceptance 7): database-space guard', () => {
  it('defaults the soft limit to 4000 MB (orchestrator override, not 900)', () => {
    expect(DEFAULT_DB_SOFT_LIMIT_MB).toBe(4000);
  });

  it('records SKIPPED_DB_SPACE, alerts, and makes no network call when the database exceeds the limit', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = 4001;
    const http = okHttp();
    const deps = baseDeps(store, http.httpGet);
    const res = await runScryfallIngest(deps);
    expect(res.status).toBe('SKIPPED_DB_SPACE');
    expect(http.calls).toHaveLength(0);
    expect(store.printings.size).toBe(0);
    expect(store.sources.get('SCRYFALL')?.lastStatus).toBe('SKIPPED_DB_SPACE');
    expect(deps.alert).toHaveBeenCalledTimes(1);
  });

  it('honors DB_SOFT_LIMIT_MB from the environment', async () => {
    const store = new MemoryCatalogStore();
    store.dbSizeMb = 950;
    const skipped = await runScryfallIngest(baseDeps(store, okHttp().httpGet, { DB_SOFT_LIMIT_MB: '900' }));
    expect(skipped.status).toBe('SKIPPED_DB_SPACE');
    const ran = await runScryfallIngest(baseDeps(store, okHttp().httpGet, {}));
    expect(ran.status).toBe('OK'); // 950 MB is under the 4000 default
  });
});

describe('Scryfall ingest (acceptance 8 and 9): headers and request set', () => {
  it('sends User-Agent and Accept on every request, and the configured User-Agent', async () => {
    const store = new MemoryCatalogStore();
    const http = okHttp();
    await runScryfallIngest(baseDeps(store, http.httpGet, { CARD_DATA_USER_AGENT: 'FindASale/1.0 (card catalog; test)' }));
    expect(http.calls.length).toBe(2);
    for (const call of http.calls) {
      expect(call.headers['User-Agent']).toBe('FindASale/1.0 (card catalog; test)');
      expect(call.headers['Accept']).toBeTruthy();
    }
  });

  it('uses an accurate default User-Agent (never a library default) when none is configured', async () => {
    const http = okHttp();
    await runScryfallIngest(baseDeps(new MemoryCatalogStore(), http.httpGet));
    expect(http.calls[0].headers['User-Agent']).toMatch(/^FindASale\/1\.0/);
  });

  it('only ever requests the bulk-data listing and the bulk file, never /cards/*', async () => {
    const http = okHttp();
    await runScryfallIngest(baseDeps(new MemoryCatalogStore(), http.httpGet));
    expect(http.calls.map((c) => c.url)).toEqual([SCRYFALL_BULK_DATA_URL, SCRYFALL_DOWNLOAD_URL]);
    expect(http.calls.some((c) => /\/cards\//.test(c.url))).toBe(false);
  });

  it('refuses a download URL outside the allowlist and requests nothing from it', async () => {
    const http = fakeHttp((url) =>
      url === SCRYFALL_BULK_DATA_URL ? { body: JSON.stringify(bulkListing(SCRYFALL_UPDATED_AT, 'https://evil.example.com/x.jsonl.gz')) } : { status: 200 },
    );
    const res = await runScryfallIngest(baseDeps(new MemoryCatalogStore(), http.httpGet));
    expect(res.status).toBe('FAILED');
    expect(http.calls).toHaveLength(1);
  });

  it('reads jsonl_download_uri (the current field name) and falls back to download_uri', async () => {
    const listing = bulkListing();
    const entry = (listing.data as any[])[1];
    delete entry.jsonl_download_uri;
    entry.download_uri = SCRYFALL_DOWNLOAD_URL;
    const http = fakeHttp((url) =>
      url === SCRYFALL_BULK_DATA_URL ? { body: JSON.stringify(listing) } : { body: chunked(gzipJsonl(scryfallRows(3))) },
    );
    const res = await runScryfallIngest(baseDeps(new MemoryCatalogStore(), http.httpGet));
    expect(res.status).toBe('OK');
    expect(res.printingsChanged).toBe(3);
  });
});

describe('mapScryfallCard', () => {
  const snap = new Date('2026-10-03T21:05:42Z');

  it('maps identity, set, finishes, ids, release year and prices', () => {
    const m = mapScryfallCard(scryfallCard(0), snap)!;
    expect(m.printing).toMatchObject({
      id: 'SCRYFALL:00000000-0000-4000-8000-000000000000',
      source: 'SCRYFALL',
      game: 'MTG',
      name: 'Test Card 0',
      nameNorm: 'test card 0',
      setCode: 'tst', // lower-cased
      collectorNumber: '1',
      language: 'en',
      releaseYear: 2024,
      finishes: ['NONFOIL', 'FOIL'],
      tcgplayerProductId: 100000,
      cardmarketId: 200000,
    });
    expect(m.price).toMatchObject({ usd: '0.25', usdFoil: '1.50', usdEtched: null, usdReverse: null });
  });

  it('takes images from the first face for double-faced cards', () => {
    const card = scryfallCard(1, {
      image_uris: undefined,
      card_faces: [{ image_uris: { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg' } }, {}],
    });
    expect(mapScryfallCard(card, snap)!.printing.imageSmallUrl).toBe('https://cards.scryfall.io/small/a.jpg');
  });

  it('skips digital-only cards, art series cards and non-cards', () => {
    expect(mapScryfallCard(scryfallCard(2, { digital: true }), snap)).toBeNull();
    expect(mapScryfallCard(scryfallCard(3, { games: ['arena'] }), snap)).toBeNull();
    expect(mapScryfallCard(scryfallCard(4, { layout: 'art_series' }), snap)).toBeNull();
    expect(mapScryfallCard({ object: 'ruling', id: 'x' }, snap)).toBeNull();
    expect(mapScryfallCard(null, snap)).toBeNull();
  });

  it('rejects malformed prices and out-of-range dates instead of storing them', () => {
    const m = mapScryfallCard(scryfallCard(5, { released_at: '1066-01-01', prices: { usd: 'abc', usd_foil: '-1', usd_etched: '12.5' } }), snap)!;
    expect(m.printing.releaseYear).toBeNull();
    expect(m.price).toMatchObject({ usd: null, usdFoil: null, usdEtched: '12.50' });
  });
});
