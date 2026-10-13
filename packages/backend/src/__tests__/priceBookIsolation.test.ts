/**
 * Price book isolation, config and vocabulary pins (ADR-140 acceptance AT-3 and the config part of section 13.1).
 *   - The price book imports no pricing engine, no shadow price store, no TCGplayer or TCGCSV module, no eBay module,
 *     no model service and no HTTP client, directly or through the modules it imports.
 *   - The engine imports only files of its own directory (and the card name normalizer for the reference key).
 *   - Nothing reads the clock, a random number or the environment on its own.
 */
import fs from 'fs';
import path from 'path';
import { suggestPrice } from '../services/priceBook/engine';
import { quoteBuylist, starterBuylistRules } from '../services/priceBook/buylist';
import { getPriceBookConfig, isCatalogPriceReferenceEnabled, isPriceBookEnabled } from '../services/priceBook/config';
import { allPriceBookMessages } from '../services/priceBook/messages';
import { BULK_LOT_KINDS as REAL_LOT_KINDS } from '../services/bulkLot/bulkLotVocabulary';
import { CARD_CONDITION_CODES, CARD_FINISHES } from '../constants/cardVocabulary';
import { BULK_LOT_KINDS, CONDITION_CODES, DEFAULT_BOOK_SETTINGS, FINISHES, LOT_KIND_TIER, TIERS } from '../services/priceBook/vocabulary';
import type { BookSettings, CardInput, PriceRule, ReferenceCandidate } from '../services/priceBook/types';

const mockAiCalls: string[] = [];
const mockRecorder = () =>
  new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        if (name === 'then') return undefined;
        return (...args: unknown[]) => {
          mockAiCalls.push(String(name));
          return args.length >= 0 ? undefined : undefined;
        };
      },
    }
  );

jest.mock('../services/cloudAIService', () => mockRecorder(), { virtual: true });
jest.mock('../services/imageMatchService', () => mockRecorder(), { virtual: true });
jest.mock('../services/ebayImageSearchService', () => mockRecorder(), { virtual: true });
jest.mock('../lib/aiCostTracker', () => mockRecorder(), { virtual: true });
jest.mock('@anthropic-ai/sdk', () => mockRecorder(), { virtual: true });
jest.mock('@google-cloud/vision', () => mockRecorder(), { virtual: true });
jest.mock('axios', () => mockRecorder(), { virtual: true });

const SRC = path.join(__dirname, '..');
const BOOK_DIR = path.join(SRC, 'services', 'priceBook');

function listTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const FILES = listTs(BOOK_DIR);
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeOf = (file: string) => stripComments(fs.readFileSync(file, 'utf8'));

function importsOf(text: string): string[] {
  const out: string[] = [];
  const re = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (spec !== undefined) out.push(spec);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const cand of [`${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(cand)) return cand;
  return null;
}

describe('source set', () => {
  it('finds every price book source file', () => {
    const names = FILES.map((f) => rel(f)).sort();
    for (const expected of ['bulkRates', 'buylist', 'cardKey', 'config', 'engine', 'explain', 'messages', 'rounding', 'types', 'vocabulary', 'providers/types']) {
      expect(names).toContain(`services/priceBook/${expected}.ts`);
    }
    expect(FILES.length).toBeGreaterThanOrEqual(11);
  });
});

describe('import isolation (AT-3)', () => {
  const BANNED_SPECS = [
    'pricingEngine',
    'shadowPricingStore',
    'cardTcgplayer',
    'tcgcsv',
    'tcgplayer',
    'ebay',
    'cloudAIService',
    'imageMatchService',
    'aiCostTracker',
    '@anthropic-ai/sdk',
    '@google-cloud/vision',
    '@prisma/client',
    'axios',
    'openai',
    'safeFetch',
    'node-fetch',
    'child_process',
  ];
  const BANNED_IDENTIFIERS = ['EbaySoldEvent', 'PricingComp', 'PricingSourceConfig', 'aiSuggestedPrice', 'estimatedValue', 'ebayLivePrice'];

  it('no price book file names a banned module in an import', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const spec of importsOf(codeOf(file))) {
        const lower = spec.toLowerCase();
        for (const banned of BANNED_SPECS) if (lower.includes(banned.toLowerCase())) offenders.push(`${rel(file)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no price book file uses a name from the pricing, eBay or model price models', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = codeOf(file);
      for (const id of BANNED_IDENTIFIERS) if (code.includes(id)) offenders.push(`${rel(file)} uses ${id}`);
    }
    expect(offenders).toEqual([]);
  });

  it('every import is a file of the price book itself, except the card name normalizer in the reference key', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const spec of importsOf(codeOf(file))) {
        if (!spec.startsWith('.')) {
          offenders.push(`${rel(file)} imports the package ${spec}`);
          continue;
        }
        const resolved = resolveLocal(file, spec);
        if (resolved === null) {
          offenders.push(`${rel(file)} imports ${spec} which does not resolve`);
          continue;
        }
        const target = rel(resolved);
        const inside = target.startsWith('services/priceBook/');
        const allowedNormalizer = rel(file) === 'services/priceBook/cardKey.ts' && target === 'services/cardCatalog/normalize.ts';
        if (!inside && !allowedNormalizer) offenders.push(`${rel(file)} imports ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the engine, the explainer and the rounding module import only files of their own directory', () => {
    for (const name of ['engine', 'explain', 'rounding', 'bulkRates', 'buylist', 'messages']) {
      const file = path.join(BOOK_DIR, `${name}.ts`);
      const specs = importsOf(codeOf(file));
      expect({ name, bad: specs.filter((s) => !s.startsWith('./')) }).toEqual({ name, bad: [] });
    }
  });

  it('the transitive import graph reaches no pricing, store, eBay, model or HTTP module', () => {
    const seen = new Set<string>();
    const queue = [...FILES];
    const offenders: string[] = [];
    while (queue.length) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of importsOf(codeOf(file))) {
        if (!spec.startsWith('.')) continue;
        const resolved = resolveLocal(file, spec);
        if (resolved === null) continue;
        const target = rel(resolved);
        if (/pricingEngine|shadowPricingStore|cardTcgplayer|tcgcsv|ebay|cloudAI|aiCostTracker/i.test(target)) offenders.push(`${rel(file)} reaches ${target}`);
        queue.push(resolved);
      }
    }
    expect(offenders).toEqual([]);
    expect(seen.size).toBeLessThan(60);
  });

  it('no file reads the environment, the clock, a random number, the network or a database on its own', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = codeOf(file);
      const checks: Array<[string, RegExp]> = [
        ['process.env', /process\.env/],
        ['Date.now', /Date\.now\s*\(/],
        ['new Date()', /new Date\(\s*\)/],
        ['Math.random', /Math\.random\s*\(/],
        ['fetch', /\b(?:await|return)\s+fetch\s*\(|=\s*fetch\s*\(|globalThis\.fetch|XMLHttpRequest/],
        ['http', /require\(\s*['"]https?['"]\s*\)|from\s+['"]https?['"]/],
        ['prisma', /prisma/i],
        ['fs', /from\s+['"]fs['"]|require\(\s*['"]fs['"]\s*\)/],
        ['setTimeout', /\bsetTimeout\s*\(/],
      ];
      for (const [label, re] of checks) if (re.test(code)) offenders.push(`${rel(file)} uses ${label}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('a pass through the engine records zero calls on any model service module', () => {
  const book: BookSettings = { ...DEFAULT_BOOK_SETTINGS, referenceOrder: [...DEFAULT_BOOK_SETTINGS.referenceOrder] };
  const card: CardInput = {
    cardKey: 'p:SCRYFALL:abc',
    game: 'MTG',
    setCode: 'lea',
    rarityText: 'rare',
    rarityClass: 'RARE',
    finish: 'NONFOIL',
    language: 'en',
    conditionCode: 'NM',
    variantTokens: [],
    graded: false,
  };
  const candidate: ReferenceCandidate = {
    kind: 'MANUAL',
    valueCents: 1200,
    asOf: new Date('2026-10-03T14:00:00.000Z'),
    origin: 'SHOP',
    label: 'Your typed price',
  };
  const now = new Date('2026-10-12T12:00:00.000Z');

  it('prices a card and quotes a buy with no model call', () => {
    mockAiCalls.length = 0;
    const sell = suggestPrice({ card, candidates: [candidate], rules: [], book, config: { now, minCardSaleCents: 99, family: 'RETAIL' } });
    expect(sell.ok).toBe(true);
    const rules: PriceRule[] = starterBuylistRules().map((r, i) => ({ ...r, id: `s${i}` }));
    const buy = quoteBuylist({ card, candidates: [candidate], rules, book, config: { now, minCardSaleCents: 99 } });
    expect(buy.ok).toBe(true);
    expect(allPriceBookMessages().length).toBeGreaterThan(50);
    expect(getPriceBookConfig({}).enabled).toBe(false);
    expect(mockAiCalls).toEqual([]);
  });
});

describe('config (section 13.1)', () => {
  it('defaults the book off, the catalog switch on, and every limit to the documented value', () => {
    expect(getPriceBookConfig({})).toEqual({
      enabled: false,
      catalogReferenceEnabled: true,
      previewMinutes: 30,
      undoDays: 7,
      maxRunItems: 5000,
      historyDays: 90,
    });
  });

  it('reads the environment object it is given', () => {
    expect(
      getPriceBookConfig({
        CARD_PRICE_BOOK_ENABLED: 'TRUE',
        CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'off',
        CARD_PRICE_BOOK_RUN_PREVIEW_MINUTES: '10',
        CARD_PRICE_BOOK_UNDO_DAYS: '3',
        CARD_PRICE_BOOK_MAX_RUN_ITEMS: '100',
        CARD_PRICE_BOOK_HISTORY_DAYS: '30',
      })
    ).toEqual({ enabled: true, catalogReferenceEnabled: false, previewMinutes: 10, undoDays: 3, maxRunItems: 100, historyDays: 30 });
  });

  it('the book turns on only for true, 1, yes or on', () => {
    for (const v of ['true', '1', 'yes', 'on', ' ON ']) expect(isPriceBookEnabled({ CARD_PRICE_BOOK_ENABLED: v })).toBe(true);
    for (const v of ['false', '0', 'no', 'off', '', 'maybe', undefined]) expect(isPriceBookEnabled({ CARD_PRICE_BOOK_ENABLED: v })).toBe(false);
  });

  it('the catalog switch is on when unset and off only for false, 0, no or off (decision D2)', () => {
    expect(isCatalogPriceReferenceEnabled({})).toBe(true);
    expect(isCatalogPriceReferenceEnabled({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: '' })).toBe(true);
    expect(isCatalogPriceReferenceEnabled({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: 'true' })).toBe(true);
    for (const v of ['false', 'FALSE', '0', 'no', 'off', ' Off ']) expect(isCatalogPriceReferenceEnabled({ CARD_CATALOG_PRICE_REFERENCE_ENABLED: v })).toBe(false);
  });

  it('limits that are not positive whole numbers fall back to the defaults', () => {
    const c = getPriceBookConfig({
      CARD_PRICE_BOOK_RUN_PREVIEW_MINUTES: '-5',
      CARD_PRICE_BOOK_UNDO_DAYS: 'abc',
      CARD_PRICE_BOOK_MAX_RUN_ITEMS: '0',
      CARD_PRICE_BOOK_HISTORY_DAYS: '1.5',
    });
    expect(c).toMatchObject({ previewMinutes: 30, undoDays: 7, maxRunItems: 5000, historyDays: 90 });
  });

  it('importing the config module does not read the environment: a later change is seen', () => {
    const env: Record<string, string | undefined> = {};
    expect(getPriceBookConfig(env).enabled).toBe(false);
    env.CARD_PRICE_BOOK_ENABLED = '1';
    expect(getPriceBookConfig(env).enabled).toBe(true);
  });
});

describe('vocabulary pins', () => {
  it('finishes and condition codes are the live card vocabulary, in the same order', () => {
    expect([...FINISHES]).toEqual([...CARD_FINISHES]);
    expect([...CONDITION_CODES]).toEqual([...CARD_CONDITION_CODES]);
  });

  it('lot kinds are the bulk lot kinds, and every kind maps to a known tier', () => {
    expect([...BULK_LOT_KINDS]).toEqual([...REAL_LOT_KINDS]);
    expect(Object.keys(LOT_KIND_TIER).sort()).toEqual([...REAL_LOT_KINDS].sort());
    for (const tier of Object.values(LOT_KIND_TIER)) expect(TIERS as readonly string[]).toContain(tier);
  });

  it('the default book settings are frozen and the switch is off', () => {
    expect(Object.isFrozen(DEFAULT_BOOK_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_BOOK_SETTINGS.referenceOrder)).toBe(true);
    expect(DEFAULT_BOOK_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_BOOK_SETTINGS.allowCatalogReference).toBe(false);
  });
});
