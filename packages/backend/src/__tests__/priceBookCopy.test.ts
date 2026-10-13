/**
 * Price book copy rules (ADR-140 acceptance AT-16 and AT-17).
 *   - Every user facing string, and every sentence the explainer builds, is plain words: trimmed, no placeholder text,
 *     no em dash or en dash, no standalone two-letter banned word, no mention of the banned sale phrase.
 *   - The explainer is deterministic and the ADR sample sentence is produced exactly.
 *   - No source or test file of the price book contains an em dash, an en dash, a non ASCII character or a banned word.
 * The banned patterns are built from pieces so that this file itself stays clean.
 */
import fs from 'fs';
import path from 'path';
import { suggestPrice } from '../services/priceBook/engine';
import { quoteBuylist, starterBuylistRules } from '../services/priceBook/buylist';
import { explain } from '../services/priceBook/explain';
import { allPriceBookMessages, COPY } from '../services/priceBook/messages';
import { DEFAULT_BOOK_SETTINGS, ROUNDING_DIRECTIONS, ROUNDING_MODES } from '../services/priceBook/vocabulary';
import type { BookSettings, BulkRate, CardInput, PriceRule, PriceSuggestion, ReferenceCandidate } from '../services/priceBook/types';

const DASH_RE = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']');
const NON_ASCII_RE = /[^\x00-\x7F]/;
const STANDALONE_RE = new RegExp(['\\b', 'A', 'I', '\\b'].join(''));
const SALE_PHRASE_RE = new RegExp(['estate', 'sale'].join('\\s+'), 'i');
const PLACEHOLDER_RE = /\b(lorem|todo|tbd|xxx|placeholder|coming soon)\b/i;

const NOW = new Date('2026-10-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const book = (over: Partial<BookSettings> = {}): BookSettings => ({
  ...DEFAULT_BOOK_SETTINGS,
  version: 7,
  referenceOrder: [...DEFAULT_BOOK_SETTINGS.referenceOrder],
  ...over,
});

const card = (over: Partial<CardInput> = {}): CardInput => ({
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
  ...over,
});

const rule = (over: Partial<PriceRule> & { id: string }): PriceRule => ({
  family: 'RETAIL',
  name: `Rule ${over.id}`,
  priority: 10,
  enabled: true,
  basis: 'REFERENCE',
  percentBps: 10000,
  addCents: 0,
  ...over,
});

const manual = (valueCents: number, asOf: Date | null = new Date('2026-10-03T14:00:00.000Z')): ReferenceCandidate => ({
  kind: 'MANUAL',
  valueCents,
  asOf,
  origin: 'SHOP',
  label: 'Your typed price',
});

const catalog = (valueCents: number, ageMs: number): ReferenceCandidate => ({
  kind: 'CATALOG_REFERENCE',
  valueCents,
  asOf: new Date(NOW.getTime() - ageMs),
  origin: 'SCRYFALL',
  label: 'Catalog estimate (marketplace data carried by Scryfall)',
  language: 'en',
});

const sold = (valueCents: number, sampleCount: number): ReferenceCandidate => ({
  kind: 'SHOP_SOLD_HISTORY',
  valueCents,
  asOf: new Date('2026-10-09T00:00:00.000Z'),
  origin: 'SHOP',
  label: `Your last ${sampleCount} sales (median)`,
  sampleCount,
});

const rates: BulkRate[] = [{ direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'ANY', unit: 'PER_CARD', rateCents: 125 }];

interface Opts {
  card?: CardInput;
  candidates?: ReferenceCandidate[];
  rules?: PriceRule[];
  book?: BookSettings;
}
const sell = (o: Opts = {}): PriceSuggestion =>
  suggestPrice({
    card: o.card ?? card(),
    candidates: o.candidates ?? [],
    rules: o.rules ?? [],
    book: o.book ?? book(),
    rates,
    config: { now: NOW, minCardSaleCents: 99, family: 'RETAIL' },
  });

const buy = (o: Opts = {}): PriceSuggestion =>
  quoteBuylist({
    card: o.card ?? card(),
    candidates: o.candidates ?? [],
    rules: o.rules ?? starterBuylistRules().map((r, i) => ({ ...r, id: `s${i}` })),
    book: o.book ?? book(),
    rates,
    config: { now: NOW, minCardSaleCents: 99 },
  });

/** A spread of runs that touches every failure code, warning, review reason, lock, basis and rounding mode. */
function matrix(): PriceSuggestion[] {
  const out: PriceSuggestion[] = [];
  const c = manual(1200);
  out.push(sell({ candidates: [c] }));
  out.push(sell({ candidates: [c], card: card({ conditionCode: 'LP', finish: 'FOIL' }), rules: [rule({ id: 'a', name: 'Rares over $5', percentBps: 9500, rarityClass: 'RARE', refMinCents: 500 })] }));
  out.push(sell({ candidates: [c], card: card({ language: 'ja' }), book: book({ nonEnglishBps: 8000 }) }));
  out.push(sell({}));
  out.push(sell({ candidates: [c], rules: [rule({ id: 'x', rarityClass: 'MYTHIC' })], book: book() }));
  out.push(sell({ card: card({ graded: true, conditionCode: null }), candidates: [c] }));
  out.push(sell({ card: card({ productType: 'SEALED' }), candidates: [c] }));
  out.push(sell({ card: card({ costCents: 0 }), rules: [rule({ id: 'cp', basis: 'COST_PLUS', percentBps: 15000 })] }));
  out.push(sell({ card: card({ costCents: 400 }), rules: [rule({ id: 'cp', basis: 'COST_PLUS', percentBps: 15000 })] }));
  out.push(sell({ rules: [rule({ id: 'br', basis: 'BULK_RATE' })] }));
  out.push(sell({ card: card({ rarityClass: 'UNKNOWN' }), rules: [rule({ id: 'br', basis: 'BULK_RATE' })] }));
  out.push(sell({ rules: [rule({ id: 'fx', basis: 'FIXED_CENTS', fixedCents: 250 })] }));
  out.push(sell({ rules: [rule({ id: 'fx', basis: 'FIXED_CENTS', fixedCents: null })] }));
  out.push(sell({ candidates: [manual(40)] }));
  out.push(sell({ candidates: [manual(1200, new Date(NOW.getTime() - 100 * DAY))] }));
  out.push(sell({ candidates: [manual(1200, new Date(NOW.getTime() - 400 * DAY))] }));
  out.push(sell({ candidates: [catalog(900, 2 * HOUR)] , book: book({ allowCatalogReference: true }) }));
  out.push(sell({ candidates: [catalog(900, 100 * HOUR)], book: book({ allowCatalogReference: true }) }));
  out.push(sell({ candidates: [catalog(900, 20 * DAY)], book: book({ allowCatalogReference: true }) }));
  out.push(sell({ candidates: [sold(800, 2), catalog(2000, HOUR)], book: book({ allowCatalogReference: true }) }));
  out.push(sell({ candidates: [c], card: card({ currentPriceCents: 400, previousReferenceCents: 1900 }) }));
  out.push(sell({ candidates: [c], rules: [rule({ id: 'fl', floorCents: 1500 })] }));
  out.push(sell({ candidates: [c], rules: [rule({ id: 'ce', ceilingCents: 1000 })] }));
  out.push(sell({ candidates: [c], card: card({ costCents: 1500 }), rules: [rule({ id: 'mm', minMarginBps: 2000 })] }));
  out.push(sell({ candidates: [c], card: card({ costCents: 1500 }), rules: [rule({ id: 'bc' })] }));
  out.push(sell({ candidates: [c], rules: [rule({ id: 'ad', addCents: 150 })] }));
  out.push(sell({ candidates: [c], card: card({ lock: { kind: 'PIN', until: null } }) }));
  out.push(sell({ candidates: [c], card: card({ lock: { kind: 'RECENT_EDIT', until: new Date(NOW.getTime() + DAY) } }) }));
  for (const mode of ROUNDING_MODES) {
    for (const direction of ROUNDING_DIRECTIONS) {
      for (const cents of [137, 1263, 8841]) {
        out.push(sell({ candidates: [manual(cents)], rules: [rule({ id: `r${mode}${direction}`, roundingMode: mode, roundingDirection: direction })] }));
      }
    }
  }
  for (const ref of [149, 150, 2499, 2500]) out.push(buy({ candidates: [manual(ref)] }));
  out.push(buy({}));
  out.push(buy({ candidates: [manual(1200)], rules: [rule({ id: 'nr', family: 'BUYLIST', rarityClass: 'MYTHIC' })] }));
  out.push(buy({ candidates: [manual(150)], rules: [rule({ id: 'mo', family: 'BUYLIST', percentBps: 5000, minOfferCents: 500 })] }));
  out.push(buy({ candidates: [manual(1200)], card: card({ quantity: 3 }), rules: [rule({ id: 'q', family: 'BUYLIST', percentBps: 5000, creditBps: 15000 })] }));
  out.push(
    buy({
      candidates: [manual(1200)],
      rules: [rule({ id: 'rp', family: 'BUYLIST', basis: 'RETAIL_PRICE', percentBps: 5000 }), rule({ id: 'rr', percentBps: 10000 })],
    })
  );
  return out;
}

describe('copy lint (AT-16)', () => {
  const messages = allPriceBookMessages();

  it('has a plausible number of messages and every one is a string', () => {
    expect(messages.length).toBeGreaterThan(100);
    for (const m of messages) expect(typeof m).toBe('string');
  });

  it.each(messages.map((m) => [m]))('"%s" follows the copy rules', (m) => {
    expect(m.trim().length).toBeGreaterThan(0);
    expect(m).not.toMatch(DASH_RE);
    expect(m).not.toMatch(STANDALONE_RE);
    expect(m).not.toMatch(SALE_PHRASE_RE);
    expect(m).not.toMatch(PLACEHOLDER_RE);
    // Templates carry single brace slots such as {n}; anything else with a brace is a mistake.
    expect(m).not.toMatch(/\{\{|\}\}|\$\{/);
    expect(m.replace(/\{[a-zA-Z]+\}/g, '')).not.toMatch(/[{}]/);
    expect(m).not.toMatch(/\s{2,}/);
    expect(m).not.toMatch(NON_ASCII_RE);
    expect(m).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\[object/);
    expect(m).toBe(m.trim());
  });

  it('the static strings are all in the linted list', () => {
    for (const value of Object.values(COPY)) expect(messages).toContain(value);
  });
});

describe('explain output (AT-16, AT-17)', () => {
  const runs = matrix();

  it('covers a wide spread of runs, ok and failed', () => {
    expect(runs.length).toBeGreaterThan(90);
    expect(runs.some((r) => r.ok)).toBe(true);
    expect(runs.some((r) => !r.ok)).toBe(true);
    const codes = new Set(runs.map((r) => r.code));
    for (const code of ['NO_REFERENCE', 'NO_RULE', 'NO_COST', 'NO_RATE', 'GRADED_NOT_SUPPORTED', 'UNSUPPORTED_PRODUCT', 'INVALID_INPUT', 'BELOW_MIN_OFFER']) {
      expect(codes).toContain(code);
    }
    const warnings = new Set(runs.flatMap((r) => r.warnings.map((w) => w.code)));
    for (const code of ['BELOW_CARD_MINIMUM', 'REFERENCE_OLD', 'REFERENCE_TOO_OLD', 'CATALOG_ESTIMATE']) expect(warnings).toContain(code);
    const reasons = new Set(runs.flatMap((r) => r.review.reasons));
    for (const reason of ['LARGE_MOVE', 'HIT_FLOOR', 'HIT_CEILING', 'BELOW_COST']) expect(reasons).toContain(reason);
    expect(runs.some((r) => r.lockedReason === 'PIN')).toBe(true);
    expect(runs.some((r) => r.lockedReason === 'RECENT_EDIT')).toBe(true);
  });

  it('every why sentence, warning message and trace label follows the copy rules', () => {
    const offenders: string[] = [];
    const lint = (where: string, text: string) => {
      if (text.trim() === '' || text !== text.trim()) offenders.push(`${where}: not trimmed or empty "${text}"`);
      if (DASH_RE.test(text)) offenders.push(`${where}: dash "${text}"`);
      if (STANDALONE_RE.test(text)) offenders.push(`${where}: banned word "${text}"`);
      if (SALE_PHRASE_RE.test(text)) offenders.push(`${where}: banned phrase "${text}"`);
      if (PLACEHOLDER_RE.test(text) || /\{\{|\}\}|\$\{|\{[a-zA-Z]+\}/.test(text)) offenders.push(`${where}: placeholder "${text}"`);
      if (/\s{2,}/.test(text)) offenders.push(`${where}: double space "${text}"`);
      if (NON_ASCII_RE.test(text)) offenders.push(`${where}: non ASCII "${text}"`);
      if (/\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(text)) offenders.push(`${where}: leaked value "${text}"`);
    };
    runs.forEach((r, i) => {
      lint(`run ${i} why`, r.why);
      for (const w of r.warnings) lint(`run ${i} warning ${w.code}`, w.message);
      for (const t of r.trace) if (t.label !== '') lint(`run ${i} trace ${t.step}`, t.label);
    });
    expect(offenders).toEqual([]);
  });

  it('every ok run says where the number came from, and every sentence ends with a full stop', () => {
    for (const r of runs) {
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.why.endsWith('.')).toBe(true);
      if (r.ok) expect(r.why).toMatch(/^(Based on|Fixed price)/);
    }
  });

  it('explain is deterministic: the same suggestion always gives the same text, and it equals the stored why', () => {
    for (const r of runs) {
      const { why, ...rest } = r;
      expect(explain(rest)).toBe(why);
      expect(explain(rest)).toBe(explain({ ...rest }));
    }
  });

  it('produces the ADR sample sentence exactly', () => {
    const r = sell({
      card: card({ finish: 'FOIL', conditionCode: 'LP' }),
      candidates: [manual(1200)],
      rules: [rule({ id: 'r1', name: 'Rares over $5', rarityClass: 'RARE', finish: 'FOIL', refMinCents: 500, percentBps: 9500 })],
    });
    expect(r.why).toBe(
      'Based on your typed price of $12.00 (Oct 3). Rule: Rares over $5. 95 percent, Lightly Played at 90 percent, rounded to the nearest 25 cents.'
    );
  });

  it('a failed run reads as one plain sentence about what is missing', () => {
    const r = sell({});
    expect(r.ok).toBe(false);
    expect(r.why).toBe(r.code === 'NO_REFERENCE' ? r.why : '');
    expect(r.why.split('. ').length).toBeLessThanOrEqual(3);
  });
});

describe('file scan (AT-17)', () => {
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

  const sources = listTs(BOOK_DIR);
  const tests = fs
    .readdirSync(__dirname)
    .filter((n) => /^priceBook.*\.test\.ts$/.test(n))
    .map((n) => path.join(__dirname, n));

  it('finds the sources and the nine test files', () => {
    expect(sources.length).toBeGreaterThanOrEqual(11);
    expect(tests.length).toBeGreaterThanOrEqual(9);
  });

  it('no price book source or test file has a dash character, a non ASCII character, the banned word or the banned phrase', () => {
    const offenders: string[] = [];
    for (const file of [...sources, ...tests]) {
      const text = fs.readFileSync(file, 'utf8');
      const name = path.relative(SRC, file).split(path.sep).join('/');
      if (DASH_RE.test(text)) offenders.push(`${name}: em or en dash`);
      if (NON_ASCII_RE.test(text)) offenders.push(`${name}: non ASCII`);
      if (STANDALONE_RE.test(text)) offenders.push(`${name}: banned word`);
      if (SALE_PHRASE_RE.test(text)) offenders.push(`${name}: banned phrase`);
      if (text.includes('\u0000')) offenders.push(`${name}: NUL byte`);
    }
    expect(offenders).toEqual([]);
  });

  it('source files end with a newline and use no tab characters', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      const name = path.relative(SRC, file).split(path.sep).join('/');
      if (!text.endsWith('\n')) offenders.push(`${name}: no final newline`);
      if (text.includes('\t')) offenders.push(`${name}: tab`);
    }
    expect(offenders).toEqual([]);
  });
});
