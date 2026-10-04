/**
 * ADR-134 batch B3 acceptance (4), (5), (6) at the HTTP-handler level, the disabled-state contract
 * (HTTP 200, catalogReady:false) and the response envelope. Handlers are called with mock req/res.
 */
import { createCardCatalogHandlers } from '../controllers/cardCatalogController';
import { READY_SCRYFALL_SOURCE, dbPrinting, makeFakeDb } from './__fixtures__/cardCatalogFixtures';

const ENABLED = { CARD_CATALOG_ENABLED: 'true' };
const NOW = new Date('2026-10-04T12:00:00Z');

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

const fifty = Array.from({ length: 50 }, (_, i) =>
  dbPrinting({ id: `SCRYFALL:b${i}`, name: `Bolt ${i}`, nameNorm: `bolt ${String(i).padStart(2, '0')}`, setCode: 'lea', collectorNumber: String(i + 1), scryfallId: `b${i}` }),
);

function handlersFor(opts: { env?: Record<string, string>; printings?: any[]; sources?: any[]; ignoreTake?: boolean } = {}) {
  const fake = makeFakeDb({ printings: opts.printings ?? fifty, sources: opts.sources ?? [READY_SCRYFALL_SOURCE], ignoreTake: opts.ignoreTake });
  const handlers = createCardCatalogHandlers({ getDb: () => fake.db, getEnv: () => opts.env ?? ENABLED, now: () => NOW });
  return { handlers, ...fake };
}

describe('disabled catalog (CARD_CATALOG_ENABLED unset): every route answers 200 with catalogReady:false', () => {
  const touchDb = () => {
    throw new Error('database must not be touched while the catalog is disabled');
  };
  const disabled = () => createCardCatalogHandlers({ getDb: touchDb as any, getEnv: () => ({}), now: () => NOW });

  it('vocabulary, search, resolve, suggested-price and status', async () => {
    const h = disabled();
    const calls: Array<[string, any]> = [
      ['getVocabulary', { query: {} }],
      ['search', { query: { game: 'MTG', q: 'bolt' } }],
      ['resolve', { body: { refs: [{ ref: 'a', game: 'MTG', name: 'Bolt' }] } }],
      ['suggestedPrice', { query: { printingId: 'SCRYFALL:x' } }],
      ['status', { query: {} }],
    ];
    for (const [name, req] of calls) {
      const res = mockRes();
      await (h as any)[name](req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ success: true, catalogReady: false, dataAsOf: { SCRYFALL: null, TCGCSV: null } });
    }
    const s = mockRes();
    await h.search({ query: { game: 'MTG', q: 'bolt' } } as any, s);
    expect(s.body.results).toEqual([]);
    const r = mockRes();
    await h.resolve({ body: { refs: [{ ref: 'a', game: 'MTG', name: 'Bolt' }] } } as any, r);
    expect(r.body.results).toEqual([{ ref: 'a', status: 'UNMATCHED', candidates: [], truncated: false }]);
  });

  it('is also catalogReady:false (HTTP 200) when enabled but no ingest has completed yet', async () => {
    const { handlers } = handlersFor({ sources: [] });
    const res = mockRes();
    await handlers.search({ query: { game: 'MTG', q: 'bolt' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ catalogReady: false, results: [] });
  });
});

describe('GET /search (acceptance 4)', () => {
  it('returns at most 20 and clamps limit=100', async () => {
    const { handlers, findMany } = handlersFor({ ignoreTake: true });
    const res = mockRes();
    await handlers.search({ query: { game: 'MTG', q: 'bolt', limit: '100' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(20);
    expect(res.body.capped).toBe(true);
    expect(res.body.limit).toBe(20);
    expect(findMany.mock.calls[0][0].take).toBe(21);
  });

  it('envelope: top-level keys, data mirror, catalogReady and dataAsOf', async () => {
    const { handlers } = handlersFor();
    const res = mockRes();
    await handlers.search({ query: { game: 'MTG', q: 'bolt', limit: '3' } } as any, res);
    expect(res.body.success).toBe(true);
    expect(res.body.catalogReady).toBe(true);
    expect(res.body.dataAsOf).toEqual({ SCRYFALL: '2026-10-03T21:05:42.559Z', TCGCSV: null });
    expect(res.body.data.results).toBe(res.body.results);
    expect(res.body.results).toHaveLength(3);
  });

  it('400 CARD_VALIDATION for a missing game, an unknown game, a short name, or an array query value', async () => {
    const { handlers } = handlersFor();
    for (const query of [{ q: 'bolt' }, { game: 'CHESS', q: 'bolt' }, { game: 'MTG', q: 'b' }, { game: 'MTG' }, { game: 'MTG', q: ['a', 'b'] }, { game: 'MTG', set: 'lea' }]) {
      const res = mockRes();
      await handlers.search({ query } as any, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('CARD_VALIDATION');
    }
  });

  it('returns empty results (200) for a game whose source has not run', async () => {
    const { handlers, findMany } = handlersFor({ env: { ...ENABLED, CARD_CATALOG_GAMES: 'MTG,POKEMON' } });
    const res = mockRes();
    await handlers.search({ query: { game: 'POKEMON', q: 'pika' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('500 with code CARD_CATALOG_ERROR when the database throws', async () => {
    const fake = makeFakeDb({ printings: fifty, sources: [READY_SCRYFALL_SOURCE] });
    fake.db.cardPrinting.findMany.mockRejectedValueOnce(new Error('boom'));
    const h = createCardCatalogHandlers({ getDb: () => fake.db, getEnv: () => ENABLED, now: () => NOW });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    await h.search({ query: { game: 'MTG', q: 'bolt' } } as any, res);
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('CARD_CATALOG_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
  });
});

describe('POST /resolve (acceptance 5)', () => {
  const ref = (i: number) => ({ ref: `r${i}`, game: 'MTG', name: 'Bolt 1' });

  it('returns 400 CARD_VALIDATION for 501 refs, before touching the catalog', async () => {
    const { handlers, findMany } = handlersFor();
    const res = mockRes();
    await handlers.resolve({ body: { refs: Array.from({ length: 501 }, (_, i) => ref(i)) } } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('accepts exactly 500 refs', async () => {
    const { handlers } = handlersFor();
    const res = mockRes();
    await handlers.resolve({ body: { refs: Array.from({ length: 500 }, (_, i) => ref(i)) } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(500);
    expect(res.body.results[0].ref).toBe('r0');
  });

  it('400 for a missing or malformed body', async () => {
    const { handlers } = handlersFor();
    for (const body of [undefined, {}, { refs: 'x' }, { refs: [{ game: 'MTG' }] }, { refs: [{ ref: 'a', game: 'NOPE' }] }]) {
      const res = mockRes();
      await handlers.resolve({ body } as any, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('resolves served games and marks refs for games with no data as UNMATCHED, in request order', async () => {
    const { handlers } = handlersFor({ printings: [dbPrinting({ id: 'SCRYFALL:aaa', scryfallId: 'aaa' })] });
    const res = mockRes();
    await handlers.resolve(
      { body: { refs: [{ ref: 'p', game: 'POKEMON', name: 'Pikachu' }, { ref: 'm', game: 'MTG', scryfallId: 'aaa' }] } } as any,
      res,
    );
    expect(res.body.results.map((r: any) => [r.ref, r.status])).toEqual([['p', 'UNMATCHED'], ['m', 'EXACT']]);
  });
});

describe('GET /suggested-price (acceptance 6)', () => {
  const printing = dbPrinting({
    id: 'SCRYFALL:p',
    price: { usd: 10, usdFoil: 25, usdEtched: null, usdReverse: null, asOf: new Date('2026-10-04T08:00:00Z') },
  });
  const call = async (query: Record<string, string>) => {
    const { handlers, db } = handlersFor({ printings: [printing] });
    const res = mockRes();
    await handlers.suggestedPrice({ query } as any, res);
    return { res, db };
  };

  it('returns a number for a plain request and never writes', async () => {
    const { res, db } = await call({ printingId: 'SCRYFALL:p', conditionCode: 'LP' });
    expect(res.statusCode).toBe(200);
    expect(res.body.suggestion).toMatchObject({ ok: true, suggestedPrice: 9, currency: 'USD', stale: false });
    expect(res.body.data.suggestion).toBe(res.body.suggestion);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.cardDataSource.upsert).not.toHaveBeenCalled();
  });

  it('GRADED_NOT_SUPPORTED, LANGUAGE_NOT_COVERED and NO_PRICE_FOR_FINISH come back as 200 outcomes with suggestedPrice null', async () => {
    const graded = await call({ printingId: 'SCRYFALL:p', grader: 'PSA', grade: '10' });
    expect(graded.res.body.suggestion).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED', suggestedPrice: null });
    const lang = await call({ printingId: 'SCRYFALL:p', language: 'ja' });
    expect(lang.res.body.suggestion).toMatchObject({ ok: false, code: 'LANGUAGE_NOT_COVERED', suggestedPrice: null });
    expect(lang.res.body.suggestion.englishReference.price).toBe(10);
    const noFinish = await call({ printingId: 'SCRYFALL:p', finish: 'ETCHED' });
    expect(noFinish.res.body.suggestion).toMatchObject({ ok: false, code: 'NO_PRICE_FOR_FINISH', suggestedPrice: null });
    for (const r of [graded, lang, noFinish]) expect(r.res.statusCode).toBe(200);
  });

  it('404 CARD_NOT_FOUND for an unknown printing, 400 for unknown finish or condition or a missing id', async () => {
    expect((await call({ printingId: 'SCRYFALL:nope' })).res).toMatchObject({ statusCode: 404, body: { code: 'CARD_NOT_FOUND' } });
    expect((await call({ printingId: 'SCRYFALL:p', finish: 'SPARKLY' })).res).toMatchObject({ statusCode: 400, body: { code: 'CARD_VALIDATION' } });
    expect((await call({ printingId: 'SCRYFALL:p', conditionCode: 'ZZ' })).res).toMatchObject({ statusCode: 400, body: { code: 'CARD_VALIDATION' } });
    expect((await call({})).res).toMatchObject({ statusCode: 400, body: { code: 'CARD_VALIDATION' } });
  });
});

describe('GET /vocabulary and /status', () => {
  it('serves games, finishes, condition codes, graders, grades and languages', async () => {
    const { handlers } = handlersFor();
    const res = mockRes();
    await handlers.getVocabulary({} as any, res);
    expect(res.body.games.map((g: any) => g.code)).toEqual(['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE', 'OTHER']);
    expect(res.body.conditionCodes.map((c: any) => c.code)).toEqual(['NM', 'LP', 'MP', 'HP', 'DMG']);
    expect(res.body.finishes.map((c: any) => c.code)).toEqual(['NONFOIL', 'FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO']);
    expect(res.body.graders).toContain('PSA');
    expect(res.body.grades).toContain('Authentic');
    expect(res.body.languages.map((l: any) => l.code)).toContain('zhs');
  });

  it('status reports source freshness', async () => {
    const { handlers } = handlersFor();
    const res = mockRes();
    await handlers.status({} as any, res);
    expect(res.body).toMatchObject({ catalogReady: true, enabled: true, readyGames: ['MTG'] });
    expect(res.body.sources[0]).toMatchObject({ source: 'SCRYFALL', lastStatus: 'OK', consecutiveFailures: 0 });
  });
});
