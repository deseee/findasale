/**
 * ADR-134 batch B3: router wiring (auth, limiters, no tier gate), cron schedule functions, import
 * safety, and source-level guards (no write to Item price-estimate fields, no /cards/* requests).
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() }, schedule: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../middleware/auth', () => ({
  authenticate: jest.fn(function authenticate() {}),
  requireOrganizer: jest.fn(function requireOrganizer() {}),
}));

import cron from 'node-cron';
import cardCatalogRouter, { cardLookupLimiter, cardResolveLimiter } from '../routes/cardCatalog';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  CARD_CATALOG_SCRYFALL_CRON,
  CARD_CATALOG_TCGCSV_CRON,
  runCardCatalogScryfallJob,
  runCardCatalogTcgcsvJob,
  scheduleCardCatalogScryfallRefresh,
  scheduleCardCatalogTcgcsvRefresh,
} from '../jobs/cardCatalogRefreshCron';

// Captured before any test (and before beforeEach clears mocks): importing the job module must register nothing.
const scheduleCallsAtImport = (cron.schedule as jest.Mock).mock.calls.length;

const SRC = path.resolve(__dirname, '..');
const ownedFiles = (): string[] => {
  const dir = path.join(SRC, 'services', 'cardCatalog');
  return [
    ...fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f)),
    path.join(SRC, 'controllers', 'cardCatalogController.ts'),
    path.join(SRC, 'routes', 'cardCatalog.ts'),
    path.join(SRC, 'jobs', 'cardCatalogRefreshCron.ts'),
  ];
};
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('router wiring', () => {
  const layers = (cardCatalogRouter as any).stack.filter((l: any) => l.route);
  const routeOf = (p: string, method: string) => layers.find((l: any) => l.route.path === p && l.route.methods[method]);

  it('exposes exactly the five routes of ADR section 3.4', () => {
    const sig = layers.map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`).sort();
    expect(sig).toEqual(['GET /search', 'GET /status', 'GET /suggested-price', 'GET /vocabulary', 'POST /resolve']);
  });

  it('every route runs authenticate, then requireOrganizer, then a limiter, then the handler', () => {
    for (const l of layers) {
      const handles = l.route.stack.map((s: any) => s.handle);
      expect(handles[0]).toBe(authenticate);
      expect(handles[1]).toBe(requireOrganizer);
      expect([cardLookupLimiter, cardResolveLimiter]).toContain(handles[2]);
      expect(handles).toHaveLength(4);
    }
  });

  it('resolve uses the stricter limiter and the rest use the lookup limiter', () => {
    expect(routeOf('/resolve', 'post').route.stack[2].handle).toBe(cardResolveLimiter);
    for (const p of ['/search', '/vocabulary', '/suggested-price', '/status']) {
      expect(routeOf(p, 'get').route.stack[2].handle).toBe(cardLookupLimiter);
    }
  });

  it('has no tier gate (Scryfall forbids paywalling its data)', () => {
    const src = fs.readFileSync(path.join(SRC, 'routes', 'cardCatalog.ts'), 'utf8');
    expect(stripComments(src)).not.toMatch(/requireTier|checkTierLapse/);
  });

  it('declares the limiter numbers of ADR section 3.4 (120 per minute lookup, 30 per minute resolve)', () => {
    const src = stripComments(fs.readFileSync(path.join(SRC, 'routes', 'cardCatalog.ts'), 'utf8'));
    expect(src).toMatch(/windowMs: 60 \* 1000,\s*max: 120/);
    expect(src).toMatch(/windowMs: 60 \* 1000,\s*max: 30/);
  });
});

describe('cron schedule functions', () => {
  beforeEach(() => (cron.schedule as jest.Mock).mockClear());

  it('registers nothing at import time', () => {
    expect(scheduleCallsAtImport).toBe(0);
  });

  it('schedules Scryfall at 06:23 UTC and TCGCSV at 21:10 UTC (after its 20:00 UTC publish)', () => {
    scheduleCardCatalogScryfallRefresh();
    scheduleCardCatalogTcgcsvRefresh();
    expect((cron.schedule as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['23 6 * * *', '10 21 * * *']);
    expect(CARD_CATALOG_SCRYFALL_CRON).toBe('23 6 * * *');
    expect(CARD_CATALOG_TCGCSV_CRON).toBe('10 21 * * *');
  });

  it('the scheduled handlers exit immediately while CARD_CATALOG_ENABLED is unset', async () => {
    const before = process.env.CARD_CATALOG_ENABLED;
    delete process.env.CARD_CATALOG_ENABLED;
    try {
      scheduleCardCatalogScryfallRefresh();
      const handler = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
      await expect(handler()).resolves.toBeUndefined();
    } finally {
      if (before !== undefined) process.env.CARD_CATALOG_ENABLED = before;
    }
  });

  it('job runners: null when disabled, delegate when enabled', async () => {
    const runScryfall = jest.fn(async () => ({ source: 'SCRYFALL' as const, status: 'OK' as const, rowsRead: 0, rowsSkipped: 0, printingsChanged: 0, pricesChanged: 0 }));
    const runTcgcsv = jest.fn(async () => ({ source: 'TCGCSV' as const, status: 'DISABLED' as const, rowsRead: 0, rowsSkipped: 0, printingsChanged: 0, pricesChanged: 0 }));
    expect(await runCardCatalogScryfallJob({ env: {}, runScryfall })).toBeNull();
    expect(await runCardCatalogTcgcsvJob({ env: { CARD_CATALOG_ENABLED: 'false' }, runTcgcsv })).toBeNull();
    expect(runScryfall).not.toHaveBeenCalled();
    expect(runTcgcsv).not.toHaveBeenCalled();
    expect((await runCardCatalogScryfallJob({ env: { CARD_CATALOG_ENABLED: 'true' }, runScryfall }))?.status).toBe('OK');
    expect((await runCardCatalogTcgcsvJob({ env: { CARD_CATALOG_ENABLED: 'true' }, runTcgcsv }))?.status).toBe('DISABLED');
  });
});

describe('import safety', () => {
  it('importing the service modules loads neither Prisma nor the network', () => {
    jest.isolateModules(() => {
      jest.doMock('../lib/prisma', () => {
        throw new Error('lib/prisma must not load at import time');
      });
      for (const m of ['catalogConfig', 'normalize', 'types', 'httpClient', 'catalogStore', 'ingestCommon', 'scryfallIngest', 'tcgcsvIngest', 'cardPriceSuggestionService', 'cardCatalogLookup', 'catalogVocabulary']) {
        expect(() => require(`../services/cardCatalog/${m}`)).not.toThrow();
      }
      expect(() => require('../controllers/cardCatalogController')).not.toThrow();
    });
  });

  it('no module reads process.env or the network at top level', () => {
    for (const file of ownedFiles()) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      // process.env may appear only inside functions or default parameters; every occurrence must be indented or in a parameter list.
      for (const line of src.split('\n')) {
        if (/process\.env/.test(line)) expect(line).toMatch(/^\s+|=\s*process\.env|\?\? process\.env|\(\) => process\.env/);
      }
      expect(src).not.toMatch(/^\s*(fetch|axios)\s*\(/m);
    }
  });

  it('never imports @findasale/shared', () => {
    for (const file of ownedFiles()) expect(fs.readFileSync(file, 'utf8')).not.toMatch(/@findasale\/shared/);
  });
});

describe('source guards', () => {
  it('never writes the item fields the eBay paths fall back to (aiSuggestedPrice, estimatedValue)', () => {
    for (const file of ownedFiles()) {
      expect(stripComments(fs.readFileSync(file, 'utf8'))).not.toMatch(/aiSuggestedPrice|estimatedValue/);
    }
  });

  it('never touches the item table or any model other than the card catalog tables', () => {
    for (const file of ownedFiles()) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      expect(src).not.toMatch(/\.item\./);
      expect(src).not.toMatch(/prisma\.(item|itemCard|sale|organizer)\b/);
      expect(src).not.toMatch(/"Item"/);
    }
  });

  it('never calls a Scryfall /cards endpoint', () => {
    for (const file of ownedFiles()) {
      expect(stripComments(fs.readFileSync(file, 'utf8'))).not.toMatch(/api\.scryfall\.com\/cards/);
    }
  });

  it('upsert SQL only rewrites rows that differ, and uses bound parameters', () => {
    const store = require('../services/cardCatalog/catalogStore');
    expect(store.PRINTING_UPSERT_SQL).toMatch(/ON CONFLICT \("id"\) DO UPDATE/);
    expect(store.PRINTING_UPSERT_SQL).toMatch(/WHERE \(.*IS DISTINCT FROM/s);
    expect(store.PRICE_UPSERT_SQL).toMatch(/IS DISTINCT FROM/);
    expect(store.FINISH_UPDATE_SQL).toMatch(/IS DISTINCT FROM/);
    expect(store.PRINTING_UPSERT_SQL).toMatch(/\$17::text\[\]/);
    expect(store.printingParams([]).length).toBe(17);
    expect(store.priceParams([]).length).toBe(6);
  });
});
