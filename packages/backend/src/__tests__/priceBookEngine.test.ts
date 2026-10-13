/**
 * Price book rule engine (ADR-140 section 6, acceptance AT-1 and AT-5 to AT-11 and AT-18).
 */
import { suggestPrice } from '../services/priceBook/engine';
import { selectReference } from '../services/priceBook/engine';
import { computeSuggestedPrice, CONDITION_MULTIPLIERS } from '../services/cardCatalog/cardPriceSuggestionService';
import { CARD_CONDITION_CODES, CARD_FINISHES } from '../constants/cardVocabulary';
import { COPY } from '../services/priceBook/messages';
import { CONDITION_CODES, DEFAULT_BOOK_SETTINGS, DEFAULT_CONDITION_BPS, FINISHES } from '../services/priceBook/vocabulary';
import type { BookSettings, BulkRate, CardInput, PriceRule, PriceSuggestion, ReferenceCandidate } from '../services/priceBook/types';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const book = (over: Partial<BookSettings> = {}): BookSettings => ({
  ...DEFAULT_BOOK_SETTINGS,
  version: 7,
  referenceOrder: [...DEFAULT_BOOK_SETTINGS.referenceOrder],
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

const manual = (valueCents: number, over: Partial<ReferenceCandidate> = {}): ReferenceCandidate => ({
  kind: 'MANUAL',
  valueCents,
  asOf: new Date('2026-10-03T14:00:00.000Z'),
  origin: 'SHOP',
  label: 'Your typed price',
  ...over,
});

const benchmark = (valueCents: number, over: Partial<ReferenceCandidate> = {}): ReferenceCandidate => ({
  kind: 'SHOP_BENCHMARK',
  valueCents,
  asOf: new Date('2026-10-01T00:00:00.000Z'),
  origin: 'SHOP',
  label: 'Your benchmark for this kind of card',
  ...over,
});

const sold = (valueCents: number, sampleCount: number, over: Partial<ReferenceCandidate> = {}): ReferenceCandidate => ({
  kind: 'SHOP_SOLD_HISTORY',
  valueCents,
  asOf: new Date('2026-10-09T00:00:00.000Z'),
  origin: 'SHOP',
  label: `Your last ${sampleCount} sales (median)`,
  sampleCount,
  ...over,
});

const catalog = (valueCents: number, over: Partial<ReferenceCandidate> = {}): ReferenceCandidate => ({
  kind: 'CATALOG_REFERENCE',
  valueCents,
  asOf: ago(2 * HOUR),
  origin: 'SCRYFALL',
  label: 'Catalog estimate (marketplace data carried by Scryfall)',
  language: 'en',
  ...over,
});

interface RunOpts {
  card?: CardInput;
  candidates?: ReferenceCandidate[];
  rules?: PriceRule[];
  book?: BookSettings;
  rates?: BulkRate[];
  family?: 'RETAIL' | 'BUYLIST';
  now?: Date;
  minCardSaleCents?: number;
}
const run = (o: RunOpts = {}): PriceSuggestion =>
  suggestPrice({
    card: o.card ?? card(),
    candidates: o.candidates ?? [],
    rules: o.rules ?? [],
    book: o.book ?? book(),
    rates: o.rates,
    config: { now: o.now ?? NOW, minCardSaleCents: o.minCardSaleCents ?? 99, family: o.family ?? 'RETAIL' },
  });

const steps = (s: PriceSuggestion) => s.trace.map((t) => t.step);
const afters = (s: PriceSuggestion) => s.trace.map((t) => t.afterCents);

describe('AT-1 the five worked examples of section 6.3', () => {
  it('Magic rare, FOIL, LP, typed reference $12.00, rule "Rares over $5" at 95 percent, TIERED gives $10.25', () => {
    const r = run({
      card: card({ finish: 'FOIL', conditionCode: 'LP' }),
      candidates: [manual(1200)],
      rules: [rule({ id: 'r1', name: 'Rares over $5', rarityClass: 'RARE', finish: 'FOIL', refMinCents: 500, percentBps: 9500 })],
    });
    expect(r.ok).toBe(true);
    expect(r.priceCents).toBe(1025);
    expect(r.lineCents).toBe(1025);
    expect(steps(r)).toEqual(['REFERENCE', 'PERCENT', 'CONDITION', 'ROUND']);
    expect(afters(r)).toEqual([1200, 1140, 1026, 1025]);
    expect(r.trace.map((t) => t.beforeCents)).toEqual([null, 1200, 1140, 1026]);
    expect(r.priceSource).toBe('MANUAL');
    expect(r.referenceCents).toBe(1200);
    expect(r.referenceOrigin).toBe('SHOP');
    expect(r.referenceLabel).toBe('Your typed price');
    expect(r.priceAsOf).toBe('2026-10-03T14:00:00.000Z');
    expect(r.rule).toEqual({ id: 'r1', name: 'Rares over $5', bookVersion: 7, isDefault: false });
    expect(r.warnings).toEqual([]);
    expect(r.applyAllowed).toBe(true);
    expect(r.why).toBe(
      'Based on your typed price of $12.00 (Oct 3). Rule: Rares over $5. 95 percent, Lightly Played at 90 percent, rounded to the nearest 25 cents.'
    );
  });

  it('Pokemon holo rare, no history, benchmark HOLO $2.00, MP, default rule gives $1.60', () => {
    const r = run({
      card: card({ game: 'POKEMON', setCode: 'base1', rarityText: 'Rare Holo', finish: 'HOLO', conditionCode: 'MP' }),
      candidates: [benchmark(200, { finish: 'HOLO' })],
    });
    expect(r.priceCents).toBe(160);
    expect(afters(r)).toEqual([200, 160, 160]);
    expect(steps(r)).toEqual(['REFERENCE', 'CONDITION', 'ROUND']);
    expect(r.priceSource).toBe('SHOP_BENCHMARK');
    expect(r.rule).toEqual({ id: null, name: COPY.defaultRuleName, bookVersion: 7, isDefault: true });
    expect(r.warnings.map((w) => w.code)).toEqual([]);
  });

  it('Magic common single, typed reference $0.30, LP gives $0.25 with BELOW_CARD_MINIMUM', () => {
    const r = run({ card: card({ rarityClass: 'COMMON', conditionCode: 'LP' }), candidates: [manual(30)] });
    expect(r.priceCents).toBe(25);
    expect(afters(r)).toEqual([30, 27, 25]);
    expect(r.warnings).toEqual([{ code: 'BELOW_CARD_MINIMUM', message: 'Card payments need at least $0.99. Cash sales have no minimum.' }]);
  });

  it('no reference of any kind gives NO_REFERENCE and no number', () => {
    const r = run({ candidates: [] });
    expect(r).toMatchObject({ ok: false, code: 'NO_REFERENCE', priceCents: null, applyAllowed: false, priceSource: null, rule: null });
    expect(r.why).toBe(COPY.noSuggestion);
    expect(r.trace).toEqual([]);
  });

  it('a reference typed 400 days ago (limit 365) gives NO_REFERENCE with the note', () => {
    const r = run({ candidates: [manual(500, { asOf: ago(400 * DAY) })] });
    expect(r).toMatchObject({ ok: false, code: 'NO_REFERENCE', priceCents: null });
    expect(r.warnings).toEqual([{ code: 'REFERENCE_TOO_OLD', message: 'Your typed price is more than a year old.' }]);
    expect(r.why).toBe(`${COPY.noSuggestion} Your typed price is more than a year old.`);
  });
});

describe('AT-1 one vector per processing step, in order', () => {
  it('percent, condition, language, add, then NONE rounding, all exact', () => {
    const r = run({
      card: card({ conditionCode: 'HP', language: 'ja' }),
      candidates: [manual(1000)],
      rules: [rule({ id: 'r', percentBps: 5000, addCents: -10, roundingMode: 'NONE' })],
      book: book({ nonEnglishBps: 8000 }),
    });
    expect(steps(r)).toEqual(['REFERENCE', 'PERCENT', 'CONDITION', 'LANGUAGE', 'ADD']);
    expect(afters(r)).toEqual([1000, 500, 325, 260, 250]);
    expect(r.priceCents).toBe(250);
  });

  it('floor, then round, then result floor keep their order', () => {
    const r = run({
      candidates: [manual(80)],
      rules: [rule({ id: 'r', floorCents: 99, roundingMode: 'ENDING_99', roundingDirection: 'DOWN' })],
    });
    expect(steps(r)).toEqual(['REFERENCE', 'FLOOR_APPLIED', 'ROUND']);
    expect(afters(r)).toEqual([80, 99, 99]);
  });

  it('the cost floor comes before the rule floor and the ceiling check', () => {
    const r = run({
      card: card({ costCents: 1000 }),
      candidates: [manual(800)],
      rules: [rule({ id: 'r', minMarginBps: 2000, roundingMode: 'NONE' })],
    });
    expect(steps(r)).toEqual(['REFERENCE', 'COST_FLOOR']);
    expect(r.priceCents).toBe(1200);
  });

  it('RESULT_FLOOR raises zero to one cent', () => {
    const r = run({ candidates: [manual(100)], rules: [rule({ id: 'r', percentBps: 0, roundingMode: 'NONE' })] });
    expect(steps(r)).toEqual(['REFERENCE', 'PERCENT', 'RESULT_FLOOR']);
    expect(r.priceCents).toBe(1);
  });

  it('rounding happens after the add, and the add can not push below zero', () => {
    const r = run({ candidates: [manual(100)], rules: [rule({ id: 'r', addCents: -500, roundingMode: 'NONE' })] });
    expect(afters(r)).toEqual([100, 0, 1]);
    expect(r.priceCents).toBe(1);
  });

  it('quantity makes a line total and an invalid quantity is refused', () => {
    expect(run({ card: card({ quantity: 3 }), candidates: [manual(1000)] })).toMatchObject({ priceCents: 1000, lineCents: 3000 });
    expect(run({ card: card({ quantity: 0 }), candidates: [manual(1000)] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(run({ card: card({ quantity: 1.5 }), candidates: [manual(1000)] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('validation (section 6.3 step 1)', () => {
  const cands = [manual(1000)];
  it('unknown finish, condition or family is INVALID_INPUT', () => {
    expect(run({ card: card({ finish: 'SHINY' }), candidates: cands })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(run({ card: card({ conditionCode: 'XX' }), candidates: cands })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(run({ card: card({ conditionCode: null }), candidates: cands })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(run({ candidates: cands, family: 'LEND' as unknown as 'RETAIL' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('input is normalized for case and spaces', () => {
    expect(run({ card: card({ finish: ' foil ', conditionCode: ' lp ' }), candidates: cands }).priceCents).toBe(900);
  });
  it('graded gives GRADED_NOT_SUPPORTED with the legacy message, even with a null condition', () => {
    const r = run({ card: card({ graded: true, conditionCode: null }), candidates: cands });
    expect(r).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED' });
    expect(r.why).toBe('There is no free price source for graded cards. Enter your own price.');
  });
  it('a product type other than SINGLE is UNSUPPORTED_PRODUCT', () => {
    expect(run({ card: card({ productType: 'SEALED' }), candidates: cands })).toMatchObject({ ok: false, code: 'UNSUPPORTED_PRODUCT' });
    expect(run({ card: card({ productType: 'single' }), candidates: cands }).ok).toBe(true);
  });
});

describe('AT-5 the 99 cent card minimum', () => {
  const none = (reference: number, extra: Partial<PriceRule> = {}) =>
    run({ candidates: [manual(reference)], rules: [rule({ id: 'r', roundingMode: 'NONE', ...extra })] });

  it('warns at 98 cents and not at 99', () => {
    const at98 = none(98);
    expect(at98.priceCents).toBe(98);
    expect(at98.warnings.map((w) => w.code)).toEqual(['BELOW_CARD_MINIMUM']);
    const at99 = none(99);
    expect(at99.priceCents).toBe(99);
    expect(at99.warnings).toEqual([]);
  });
  it('never raises the price on its own', () => {
    const r = run({ candidates: [manual(50)] });
    expect(r.priceCents).toBe(50);
    expect(r.warnings.map((w) => w.code)).toEqual(['BELOW_CARD_MINIMUM']);
  });
  it('a floor of 99 in a rule removes the warning and records FLOOR_APPLIED', () => {
    const r = none(80, { floorCents: 99 });
    expect(r.priceCents).toBe(99);
    expect(r.warnings).toEqual([]);
    expect(steps(r)).toContain('FLOOR_APPLIED');
    expect(r.review.reasons).toContain('HIT_FLOOR');
  });
  it('the minimum is injected, not hardcoded', () => {
    const r = run({ candidates: [manual(120)], rules: [rule({ id: 'r', roundingMode: 'NONE' })], minCardSaleCents: 150 });
    expect(r.warnings).toEqual([{ code: 'BELOW_CARD_MINIMUM', message: 'Card payments need at least $1.50. Cash sales have no minimum.' }]);
  });
});

describe('AT-6 floor, ceiling and clamps', () => {
  it('floor and ceiling clamp the value', () => {
    const lo = run({ candidates: [manual(1000)], rules: [rule({ id: 'r', floorCents: 1500, roundingMode: 'NONE' })] });
    expect(lo.priceCents).toBe(1500);
    expect(steps(lo)).toEqual(['REFERENCE', 'FLOOR_APPLIED']);
    expect(lo.review.reasons).toEqual(['HIT_FLOOR']);
    const hi = run({ candidates: [manual(1000)], rules: [rule({ id: 'r', ceilingCents: 800, roundingMode: 'NONE' })] });
    expect(hi.priceCents).toBe(800);
    expect(steps(hi)).toEqual(['REFERENCE', 'CEILING_APPLIED']);
    expect(hi.review.reasons).toEqual(['HIT_CEILING']);
  });

  it('a value exactly on a bound is not clamped', () => {
    const r = run({ candidates: [manual(1000)], rules: [rule({ id: 'r', floorCents: 1000, ceilingCents: 1000, roundingMode: 'NONE' })] });
    expect(steps(r)).toEqual(['REFERENCE']);
    expect(r.review.reasons).toEqual([]);
  });

  it('the book defaults apply when the rule sets none, and the rule replaces them when it does', () => {
    const b = book({ defaultFloorCents: 500, defaultCeilingCents: 900 });
    expect(run({ candidates: [manual(300)], book: b, rules: [rule({ id: 'r', roundingMode: 'NONE' })] }).priceCents).toBe(500);
    expect(run({ candidates: [manual(3000)], book: b, rules: [rule({ id: 'r', roundingMode: 'NONE' })] }).priceCents).toBe(900);
    expect(run({ candidates: [manual(300)], book: b, rules: [rule({ id: 'r', floorCents: 100, ceilingCents: 5000, roundingMode: 'NONE' })] }).priceCents).toBe(300);
    expect(run({ candidates: [manual(300)], book: b }).priceCents).toBe(500);
  });

  it('a floor above the ceiling is a shop mistake: the lower bound wins with RANGE_CONFLICT', () => {
    const rules = [rule({ id: 'r', floorCents: 500, ceilingCents: 300, roundingMode: 'NONE' })];
    const under = run({ candidates: [manual(400)], rules });
    expect(under.priceCents).toBe(500);
    expect(under.warnings.map((w) => w.code)).toContain('RANGE_CONFLICT');
    const over = run({ candidates: [manual(900)], rules });
    expect(over.priceCents).toBe(500);
    expect(over.warnings.map((w) => w.code)).toContain('RANGE_CONFLICT');
    const inside = run({ candidates: [manual(500)], rules });
    expect(inside.priceCents).toBe(500);
  });

  it('rounding that crosses the ceiling is pulled back exactly (CLAMP_AFTER_ROUND)', () => {
    const r = run({ candidates: [manual(1013)], rules: [rule({ id: 'r', ceilingCents: 1013 })] });
    expect(r.priceCents).toBe(1013);
    expect(steps(r)).toEqual(['REFERENCE', 'ROUND', 'CLAMP_AFTER_ROUND']);
    expect(afters(r)).toEqual([1013, 1025, 1013]);
    expect(r.review.reasons).toContain('HIT_CEILING');
  });

  it('rounding that crosses the floor is pulled back exactly', () => {
    const r = run({
      candidates: [manual(1030)],
      rules: [rule({ id: 'r', floorCents: 1013, roundingMode: 'NEAREST_DOLLAR', roundingDirection: 'DOWN' })],
    });
    expect(r.priceCents).toBe(1013);
    expect(steps(r)).toEqual(['REFERENCE', 'ROUND', 'CLAMP_AFTER_ROUND']);
    expect(r.review.reasons).toContain('HIT_FLOOR');
  });

  it('the cost floor lifts the lower bound; without it a price below cost asks for a look', () => {
    const lifted = run({ card: card({ costCents: 1000 }), candidates: [manual(800)], rules: [rule({ id: 'r', minMarginBps: 2000 })] });
    expect(lifted.priceCents).toBe(1200);
    expect(lifted.review.reasons).toEqual(['HIT_FLOOR']);
    const below = run({ card: card({ costCents: 1000 }), candidates: [manual(800)], rules: [rule({ id: 'r' })] });
    expect(below.priceCents).toBe(800);
    expect(below.review.reasons).toEqual(['BELOW_COST']);
    const noCostKnown = run({ candidates: [manual(800)], rules: [rule({ id: 'r', minMarginBps: 2000 })] });
    expect(noCostKnown.priceCents).toBe(800);
  });
});

describe('AT-7 condition percents, language and graded', () => {
  it('the default condition percents equal CONDITION_MULTIPLIERS of the existing service', () => {
    for (const code of CONDITION_CODES) expect(DEFAULT_CONDITION_BPS[code] / 10000).toBe(CONDITION_MULTIPLIERS[code]);
    expect(Object.keys(DEFAULT_CONDITION_BPS)).toEqual(Object.keys(CONDITION_MULTIPLIERS));
    expect(DEFAULT_CONDITION_BPS).toEqual({ NM: 10000, LP: 9000, MP: 8000, HP: 6500, DMG: 5000 });
  });

  it('the finish and condition lists are the live card vocabulary', () => {
    expect([...FINISHES]).toEqual([...CARD_FINISHES]);
    expect([...CONDITION_CODES]).toEqual([...CARD_CONDITION_CODES]);
  });

  it('with the default book the engine reproduces the legacy suggestion for every condition and a wide price range', () => {
    const mismatches: string[] = [];
    let halfCentCases = 0;
    for (let cents = 1; cents <= 4000; cents += 1) {
      for (const code of CONDITION_CODES) {
        const mine = run({ card: card({ conditionCode: code }), candidates: [manual(cents)] });
        const legacy = computeSuggestedPrice({
          price: { usd: cents / 100, usdFoil: null, usdEtched: null, usdReverse: null, asOf: NOW },
          finish: 'NONFOIL',
          conditionCode: code,
          now: NOW,
        });
        if (!legacy.ok) throw new Error('legacy failed');
        // The legacy service multiplies in floating point, so an exact half cent product (for example 115 x 50 percent
        // = 57.5) can land just under the half and round the other way. The engine is integer exact and rounds half up.
        // Those exact half cent cases are the only ones allowed to differ.
        if ((cents * DEFAULT_CONDITION_BPS[code]) % 10000 === 5000) {
          halfCentCases += 1;
          continue;
        }
        if (mine.priceCents !== Math.round(legacy.suggestedPrice * 100)) mismatches.push(`${cents} ${code}: ${mine.priceCents} vs ${legacy.suggestedPrice}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(halfCentCases).toBeGreaterThan(0);
  });

  it('a per book override changes only that book', () => {
    const lp = card({ conditionCode: 'LP' });
    const custom = book({ condLpBps: 8500 });
    expect(run({ card: lp, candidates: [manual(1000)], book: custom, rules: [rule({ id: 'r', roundingMode: 'NONE' })] }).priceCents).toBe(850);
    expect(run({ card: lp, candidates: [manual(1000)], rules: [rule({ id: 'r', roundingMode: 'NONE' })] }).priceCents).toBe(900);
    expect(DEFAULT_BOOK_SETTINGS.condLpBps).toBe(9000);
  });

  it('every condition reads its own percent from the book', () => {
    const b = book({ condNmBps: 9999, condLpBps: 8888, condMpBps: 7777, condHpBps: 6666, condDmgBps: 5555 });
    const expected: Record<string, number> = { NM: 9999, LP: 8888, MP: 7777, HP: 6666, DMG: 5555 };
    for (const code of CONDITION_CODES) {
      const r = run({ card: card({ conditionCode: code }), candidates: [manual(10000)], book: b, rules: [rule({ id: 'r', roundingMode: 'NONE' })] });
      expect(r.priceCents).toBe(expected[code]);
    }
  });

  it('non English cards use the English reference times nonEnglishBps; an exact language reference is not reduced again', () => {
    const b = book({ nonEnglishBps: 8000 });
    const rules = [rule({ id: 'r', roundingMode: 'NONE' })];
    const fallback = run({ card: card({ language: 'ja' }), candidates: [manual(1000, { language: 'en' })], book: b, rules });
    expect(fallback.priceCents).toBe(800);
    expect(steps(fallback)).toContain('LANGUAGE');
    const noLanguageField = run({ card: card({ language: 'ja' }), candidates: [manual(1000)], book: b, rules });
    expect(noLanguageField.priceCents).toBe(800);
    const exact = run({ card: card({ language: 'ja' }), candidates: [manual(1000, { language: 'ja' })], book: b, rules });
    expect(exact.priceCents).toBe(1000);
    expect(steps(exact)).not.toContain('LANGUAGE');
    const english = run({ card: card({ language: 'en' }), candidates: [manual(1000)], book: b, rules });
    expect(english.priceCents).toBe(1000);
  });
});

describe('AT-8 selecting a reference', () => {
  it('follows the book order: a typed price beats a benchmark; moving sold history first changes the answer', () => {
    const both = [benchmark(200), manual(300)];
    expect(run({ candidates: both }).priceSource).toBe('MANUAL');
    const soldFirst = book({ referenceOrder: ['SHOP_SOLD_HISTORY', 'MANUAL', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'] });
    expect(run({ candidates: [...both, sold(250, 4)], book: soldFirst }).priceSource).toBe('SHOP_SOLD_HISTORY');
    const benchFirst = book({ referenceOrder: ['SHOP_BENCHMARK', 'MANUAL'] });
    expect(run({ candidates: both, book: benchFirst }).priceSource).toBe('SHOP_BENCHMARK');
  });

  it('a kind that is not in the book order is not used', () => {
    expect(run({ candidates: [manual(300)], book: book({ referenceOrder: ['SHOP_BENCHMARK'] }) })).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
  });

  it('a rule sourceKinds list restricts which kinds may be used', () => {
    const r = run({ candidates: [manual(300), benchmark(200)], rules: [rule({ id: 'r', sourceKinds: ['SHOP_BENCHMARK'] })] });
    expect(r.priceSource).toBe('SHOP_BENCHMARK');
    expect(r.referenceCents).toBe(200);
    expect(run({ candidates: [manual(300)], rules: [rule({ id: 'r', sourceKinds: ['SHOP_BENCHMARK'] })] })).toMatchObject({ code: 'NO_REFERENCE' });
  });

  it('MANUAL prefers the exact finish; a different finish is never used; BENCHMARK prefers the exact finish then ANY', () => {
    const exact = run({ card: card({ finish: 'FOIL' }), candidates: [manual(100, { finish: 'NONFOIL' }), manual(500, { finish: 'FOIL' })] });
    expect(exact.referenceCents).toBe(500);
    const wrongOnly = run({ card: card({ finish: 'FOIL' }), candidates: [manual(100, { finish: 'NONFOIL' })] });
    expect(wrongOnly).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
    const bench = run({ card: card({ finish: 'HOLO' }), candidates: [benchmark(150, { finish: 'ANY' }), benchmark(260, { finish: 'HOLO' })] });
    expect(bench.referenceCents).toBe(260);
    const anyOnly = run({ card: card({ finish: 'HOLO' }), candidates: [benchmark(150, { finish: 'ANY' })] });
    expect(anyOnly.referenceCents).toBe(150);
    const manualAny = run({ card: card({ finish: 'HOLO' }), candidates: [manual(150, { finish: 'ANY' })] });
    expect(manualAny.ok).toBe(false);
  });

  it('a candidate for another non English language is not used; English can stand in for a non English card', () => {
    expect(run({ card: card({ language: 'en' }), candidates: [manual(100, { language: 'ja' })] }).ok).toBe(false);
    expect(run({ card: card({ language: 'ja' }), candidates: [manual(100, { language: 'fr' })] }).ok).toBe(false);
    expect(run({ card: card({ language: 'ja' }), candidates: [manual(100, { language: 'en' }), manual(300, { language: 'ja' })] }).referenceCents).toBe(300);
  });

  it('within a kind the newest wins when the match is equal', () => {
    const r = run({ candidates: [manual(100, { asOf: ago(30 * DAY) }), manual(200, { asOf: ago(2 * DAY) }), manual(300, { asOf: null })] });
    expect(r.referenceCents).toBe(200);
  });

  it('typed references warn after referenceWarnDays and stop after referenceMaxDays', () => {
    const cases: Array<[number, 'ok' | 'warn' | 'none']> = [
      [10, 'ok'],
      [90, 'ok'],
      [91, 'warn'],
      [365, 'warn'],
      [366, 'none'],
    ];
    for (const [days, expected] of cases) {
      const r = run({ candidates: [manual(1000, { asOf: ago(days * DAY) })] });
      if (expected === 'none') {
        expect({ days, ok: r.ok, code: r.code }).toEqual({ days, ok: false, code: 'NO_REFERENCE' });
      } else {
        const codes = r.warnings.map((w) => w.code);
        expect({ days, ok: r.ok, old: codes.includes('REFERENCE_OLD') }).toEqual({ days, ok: true, old: expected === 'warn' });
        expect({ days, review: r.review.reasons.includes('REFERENCE_OLD') }).toEqual({ days, review: expected === 'warn' });
      }
    }
    const old = run({ candidates: [manual(1000, { asOf: new Date('2026-06-01T00:00:00.000Z') })] });
    expect(old.warnings.find((w) => w.code === 'REFERENCE_OLD')?.message).toBe('This price was set on Jun 1. Check it still looks right.');
  });

  it('benchmarks follow the same age limits', () => {
    expect(run({ candidates: [benchmark(100, { asOf: ago(91 * DAY) })] }).warnings.map((w) => w.code)).toEqual(['REFERENCE_OLD']);
    expect(run({ candidates: [benchmark(100, { asOf: ago(400 * DAY) })] }).code).toBe('NO_REFERENCE');
  });

  it('sold history has no age rule of its own', () => {
    const r = run({ candidates: [sold(1000, 3, { asOf: ago(2000 * DAY) })] });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('catalog numbers warn after 48 hours, stop after 14 days, and always carry the estimate note', () => {
    const fresh = run({ candidates: [catalog(1000, { asOf: ago(47 * HOUR) })] });
    expect(fresh.warnings.map((w) => w.code)).toEqual(['CATALOG_ESTIMATE']);
    const stale = run({ candidates: [catalog(1000, { asOf: ago(49 * HOUR) })] });
    expect(stale.warnings.map((w) => w.code)).toEqual(['REFERENCE_OLD', 'CATALOG_ESTIMATE']);
    const edge = run({ candidates: [catalog(1000, { asOf: ago(14 * DAY) })] });
    expect(edge.ok).toBe(true);
    const gone = run({ candidates: [catalog(1000, { asOf: ago(14 * DAY + HOUR) })] });
    expect(gone).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
    expect(gone.warnings).toEqual([{ code: 'REFERENCE_TOO_OLD', message: 'The catalog estimate is more than 14 days old.' }]);
    const unknownAge = run({ candidates: [catalog(1000, { asOf: null })] });
    expect(unknownAge.warnings.map((w) => w.code)).toEqual(['REFERENCE_OLD', 'CATALOG_ESTIMATE']);
    expect(fresh.warnings[0].message).toBe('Catalog estimate (marketplace data carried by Scryfall). Use it as a guide only.');
    expect(run({ candidates: [catalog(1000, { asOf: ago(49 * HOUR) })], now: NOW }).priceSource).toBe('CATALOG_REFERENCE');
  });

  it('the catalog stale hours come from the config when given', () => {
    const r = suggestPrice({
      card: card(),
      candidates: [catalog(1000, { asOf: ago(10 * HOUR) })],
      rules: [],
      book: book(),
      config: { now: NOW, minCardSaleCents: 99, family: 'RETAIL', catalogStaleHours: 6 },
    });
    expect(r.warnings.map((w) => w.code)).toEqual(['REFERENCE_OLD', 'CATALOG_ESTIMATE']);
  });

  it('a typed price is chosen over an older catalog number, and a too old typed price falls through to the next kind', () => {
    expect(run({ candidates: [catalog(900), manual(1000)] }).priceSource).toBe('MANUAL');
    const fallthrough = run({ candidates: [manual(1000, { asOf: ago(500 * DAY) }), catalog(900)] });
    expect(fallthrough.priceSource).toBe('CATALOG_REFERENCE');
    expect(fallthrough.referenceCents).toBe(900);
  });

  it('a value of zero, a negative value or a fraction is never a reference', () => {
    expect(run({ candidates: [manual(0)] }).code).toBe('NO_REFERENCE');
    expect(run({ candidates: [manual(-5)] }).code).toBe('NO_REFERENCE');
    expect(run({ candidates: [manual(10.5)] }).code).toBe('NO_REFERENCE');
    expect(run({ candidates: [manual(Number.NaN)] }).code).toBe('NO_REFERENCE');
  });

  it('selectReference reports the provenance of the pick and the too old notes on its own', () => {
    const sel = selectReference({
      candidates: [manual(1000, { asOf: ago(500 * DAY) }), benchmark(200)],
      rule: {},
      finish: 'NONFOIL',
      language: 'en',
      book: book(),
      config: { now: NOW },
    });
    expect(sel.selected?.kind).toBe('SHOP_BENCHMARK');
    expect(sel.tooOld).toEqual([]);
    const none = selectReference({ candidates: [manual(1000, { asOf: ago(500 * DAY) })], rule: {}, finish: 'NONFOIL', language: 'en', book: book(), config: { now: NOW } });
    expect(none.selected).toBeNull();
    expect(none.tooOld.map((w) => w.code)).toEqual(['REFERENCE_TOO_OLD']);
  });
});

describe('AT-9 rule matching', () => {
  const cands = [manual(1000)];
  const price = (rules: PriceRule[], c: CardInput = card()) => run({ candidates: cands, rules: rules.map((r) => ({ ...r, roundingMode: 'NONE' })), card: c });

  it('the first enabled match wins by priority, ties broken by id', () => {
    const a = rule({ id: 'b', name: 'B', priority: 5, percentBps: 5000 });
    const c = rule({ id: 'c', name: 'C', priority: 1, percentBps: 2000 });
    expect(price([a, c]).rule?.id).toBe('c');
    expect(price([c, a]).priceCents).toBe(200);
    const t1 = rule({ id: 'a1', priority: 3, percentBps: 3000 });
    const t2 = rule({ id: 'a2', priority: 3, percentBps: 4000 });
    expect(price([t2, t1]).rule?.id).toBe('a1');
    expect(price([t1, t2]).rule?.id).toBe('a1');
  });

  it('disabled rules and rules of the other family are skipped', () => {
    const off = rule({ id: 'off', priority: 1, percentBps: 1000, enabled: false });
    const other = rule({ id: 'buy', priority: 2, percentBps: 1000, family: 'BUYLIST' });
    const on = rule({ id: 'on', priority: 3, percentBps: 5000 });
    expect(price([off, other, on]).rule?.id).toBe('on');
    expect(price([off, other]).rule?.isDefault).toBe(true);
  });

  it('matchers: game, set, rarity class, rarity text, finish, language, product type', () => {
    expect(price([rule({ id: 'g', game: 'pokemon', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'g', game: 'mtg', percentBps: 1000 })]).rule?.id).toBe('g');
    expect(price([rule({ id: 's', setCode: 'LEA', percentBps: 1000 })]).rule?.id).toBe('s');
    expect(price([rule({ id: 's', setCode: '2ed', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'rc', rarityClass: 'RARE', percentBps: 1000 })]).rule?.id).toBe('rc');
    expect(price([rule({ id: 'rc', rarityClass: 'MYTHIC', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'rt', rarityText: ' RARE ', percentBps: 1000 })]).rule?.id).toBe('rt');
    expect(price([rule({ id: 'rt', rarityText: 'Double Rare', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'f', finish: 'FOIL', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'f', finish: 'NONFOIL', percentBps: 1000 })]).rule?.id).toBe('f');
    expect(price([rule({ id: 'f', finish: 'ANY', percentBps: 1000 })]).rule?.id).toBe('f');
    expect(price([rule({ id: 'l', language: 'JA', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'l', language: 'EN', percentBps: 1000 })]).rule?.id).toBe('l');
    expect(price([rule({ id: 'p', productType: 'SEALED', percentBps: 1000 })]).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'p', productType: 'SINGLE', percentBps: 1000 })]).rule?.id).toBe('p');
  });

  it('a rule with a rarity class never matches an UNKNOWN card', () => {
    const unknown = card({ rarityClass: 'UNKNOWN', rarityText: null });
    expect(price([rule({ id: 'rc', rarityClass: 'RARE', percentBps: 1000 })], unknown).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'rc', rarityClass: 'UNKNOWN', percentBps: 1000 })], unknown).rule?.isDefault).toBe(true);
  });

  it('variantToken: NONE matches only a card without tokens; a named token needs that token', () => {
    const plain = card({ variantTokens: [] });
    const first = card({ variantTokens: ['FIRST_EDITION'] });
    const both = card({ variantTokens: ['SHADOWLESS', 'FIRST_EDITION'] });
    const none = rule({ id: 'n', variantToken: 'NONE', percentBps: 1000 });
    expect(price([none], plain).rule?.id).toBe('n');
    expect(price([none], first).rule?.isDefault).toBe(true);
    const fe = rule({ id: 'fe', variantToken: 'FIRST_EDITION', percentBps: 1000 });
    expect(price([fe], first).rule?.id).toBe('fe');
    expect(price([fe], both).rule?.id).toBe('fe');
    expect(price([fe], plain).rule?.isDefault).toBe(true);
    expect(price([rule({ id: 'sh', variantToken: 'shadowless', percentBps: 1000 })], both).rule?.id).toBe('sh');
  });

  it('the price band is tested on the selected reference value, inclusive at both ends', () => {
    const cheap = rule({ id: 'cheap', priority: 1, refMaxCents: 999, percentBps: 5000 });
    const dear = rule({ id: 'dear', priority: 2, refMinCents: 1000, percentBps: 8000 });
    expect(price([cheap, dear]).rule?.id).toBe('dear');
    const exactMax = rule({ id: 'edge', refMinCents: 1000, refMaxCents: 1000, percentBps: 7000 });
    expect(price([exactMax]).rule?.id).toBe('edge');
    const miss = rule({ id: 'miss', refMinCents: 1001, percentBps: 7000 });
    expect(price([miss]).rule?.isDefault).toBe(true);
  });

  it('the band uses the reference the rule may use (sourceKinds), not the first in the book order', () => {
    const r = run({
      candidates: [manual(100), benchmark(2000)],
      rules: [
        rule({ id: 'a', priority: 1, sourceKinds: ['SHOP_BENCHMARK'], refMinCents: 1500, percentBps: 5000, roundingMode: 'NONE' }),
        rule({ id: 'b', priority: 2, roundingMode: 'NONE' }),
      ],
    });
    expect(r.rule?.id).toBe('a');
    expect(r.priceCents).toBe(1000);
  });

  it('a banded rule with no reference is skipped and the default then reports NO_REFERENCE', () => {
    const r = run({ rules: [rule({ id: 'banded', refMinCents: 100 })] });
    expect(r).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
  });

  it('a matching rule that finds no reference answers NO_REFERENCE instead of falling through to a later rule', () => {
    const r = run({ candidates: [benchmark(500)], rules: [rule({ id: 'typed-only', priority: 1, variantToken: 'FIRST_EDITION', sourceKinds: ['MANUAL'] })], card: card({ variantTokens: ['FIRST_EDITION'] }) });
    expect(r).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
  });

  it('the synthetic default exists for RETAIL only', () => {
    const noRule = run({ candidates: cands, family: 'BUYLIST' });
    expect(noRule).toMatchObject({ ok: false, code: 'NO_RULE', family: 'BUYLIST' });
    const retail = run({ candidates: cands });
    expect(retail.rule).toMatchObject({ id: null, isDefault: true });
    const custom = run({ candidates: cands, book: book({ retailPercentBps: 8000, defaultRoundingMode: 'NONE' }) });
    expect(custom.priceCents).toBe(800);
  });

  it('rules with an unknown basis are ignored', () => {
    const r = run({ candidates: cands, rules: [rule({ id: 'x', basis: 'MAGIC', priority: 1 })] });
    expect(r.rule?.isDefault).toBe(true);
  });

  it('a RETAIL_PRICE basis is ignored in the retail family', () => {
    const r = run({ candidates: cands, rules: [rule({ id: 'x', basis: 'RETAIL_PRICE', priority: 1 })] });
    expect(r.rule?.isDefault).toBe(true);
  });
});

describe('other bases', () => {
  const rates: BulkRate[] = [{ direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'ANY', unit: 'PER_CARD', rateCents: 125 }];

  it('BULK_RATE uses the SELL PER_CARD row for the rarity tier and does not apply the condition', () => {
    const r = run({ card: card({ conditionCode: 'LP' }), rates, rules: [rule({ id: 'b', basis: 'BULK_RATE' })] });
    expect(r.priceCents).toBe(125);
    expect(r.priceSource).toBe('RATE_CARD');
    expect(steps(r)).toEqual(['RATE_CARD', 'ROUND']);
    expect(r.why).toBe('Based on your bulk rate card: $1.25. Rule: Rule b. Rounded to the nearest 5 cents.');
  });
  it('BULK_RATE gives NO_RATE with no row, with only a per 1,000 row, and for UNKNOWN rarity', () => {
    const rule1 = [rule({ id: 'b', basis: 'BULK_RATE' })];
    expect(run({ rules: rule1 }).code).toBe('NO_RATE');
    const per1000: BulkRate[] = [{ direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'ANY', unit: 'PER_1000', rateCents: 125000 }];
    expect(run({ rates: per1000, rules: rule1 }).code).toBe('NO_RATE');
    expect(run({ card: card({ rarityClass: 'UNKNOWN' }), rates, rules: rule1 }).code).toBe('NO_RATE');
    expect(run({ card: card({ game: 'POKEMON' }), rates, rules: rule1 }).code).toBe('NO_RATE');
  });
  it('BULK_RATE prefers the finish row over ANY', () => {
    const withFoil: BulkRate[] = [...rates, { direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'FOIL', unit: 'PER_CARD', rateCents: 300 }];
    expect(run({ card: card({ finish: 'FOIL' }), rates: withFoil, rules: [rule({ id: 'b', basis: 'BULK_RATE' })] }).priceCents).toBe(300);
  });
  it('FIXED_CENTS is fixed: no condition, rounding applies', () => {
    const r = run({ card: card({ conditionCode: 'LP' }), rules: [rule({ id: 'f', basis: 'FIXED_CENTS', fixedCents: 777 })] });
    expect(r.priceCents).toBe(775);
    expect(r.priceSource).toBe('FIXED_RULE');
    expect(run({ rules: [rule({ id: 'f', basis: 'FIXED_CENTS', fixedCents: null })] }).code).toBe('INVALID_INPUT');
  });
  it('COST_PLUS prices from the cost and needs one', () => {
    const r = run({ card: card({ costCents: 400 }), rules: [rule({ id: 'c', basis: 'COST_PLUS', percentBps: 15000 })] });
    expect(r.priceCents).toBe(600);
    expect(r.priceSource).toBe('COST');
    expect(run({ rules: [rule({ id: 'c', basis: 'COST_PLUS', percentBps: 15000 })] }).code).toBe('NO_COST');
    expect(run({ card: card({ costCents: 0 }), rules: [rule({ id: 'c', basis: 'COST_PLUS' })] }).code).toBe('NO_COST');
  });
  it('a band on a non reference basis is tested on a reference when one exists and fails when none does', () => {
    const banded = rule({ id: 'f', basis: 'FIXED_CENTS', fixedCents: 500, refMinCents: 1000, roundingMode: 'NONE' });
    expect(run({ candidates: [manual(1500)], rules: [banded] }).rule?.id).toBe('f');
    expect(run({ candidates: [manual(500)], rules: [banded] }).rule?.isDefault).toBe(true);
    expect(run({ rules: [banded] })).toMatchObject({ ok: false, code: 'NO_REFERENCE' });
  });
});

describe('AT-10 movement review', () => {
  const rules = [rule({ id: 'r', roundingMode: 'NONE' })];
  const move = (reference: number, current: number | null, extra: Partial<CardInput> = {}) =>
    run({ card: card({ currentPriceCents: current, ...extra }), candidates: [manual(reference)], rules });

  it('exactly at the threshold is not a review; one cent over is', () => {
    expect(move(1250, 1000).review).toEqual({ required: false, reasons: [], movePercent: 25 });
    expect(move(1251, 1000).review).toMatchObject({ required: true, reasons: ['LARGE_MOVE'] });
    expect(move(750, 1000).review).toEqual({ required: false, reasons: [], movePercent: -25 });
    expect(move(749, 1000).review).toMatchObject({ required: true, reasons: ['LARGE_MOVE'] });
  });
  it('the threshold comes from the book', () => {
    const tight = run({ card: card({ currentPriceCents: 1000 }), candidates: [manual(1101)], rules, book: book({ movementReviewBps: 1000 }) });
    expect(tight.review.reasons).toEqual(['LARGE_MOVE']);
    const loose = run({ card: card({ currentPriceCents: 1000 }), candidates: [manual(1101)], rules, book: book({ movementReviewBps: 5000 }) });
    expect(loose.review.reasons).toEqual([]);
  });
  it('no current price means no movement review and no percent', () => {
    expect(move(5000, null).review).toEqual({ required: false, reasons: [], movePercent: null });
    expect(move(5000, 0).review.movePercent).toBeNull();
    expect(run({ candidates: [manual(5000)], rules }).review.movePercent).toBeNull();
  });
  it('movePercent is a signed whole percent and never negative zero', () => {
    expect(move(1380, 1000).review.movePercent).toBe(38);
    expect(move(1000, 1000).review.movePercent).toBe(0);
    expect(Object.is(move(1000, 1000).review.movePercent, 0)).toBe(true);
    expect(Object.is(move(999, 100000).review.movePercent, -99)).toBe(true);
    expect(Object.is(move(100001, 100000).review.movePercent, 0)).toBe(true);
  });
  it('REFERENCE_MOVED compares the reference with the one used last time', () => {
    expect(move(1250, null, { previousReferenceCents: 1000 }).review.reasons).toEqual([]);
    expect(move(1251, null, { previousReferenceCents: 1000 }).review.reasons).toEqual(['REFERENCE_MOVED']);
    expect(move(749, null, { previousReferenceCents: 1000 }).review.reasons).toEqual(['REFERENCE_MOVED']);
    expect(move(1500, null, { previousReferenceCents: null }).review.reasons).toEqual([]);
  });
  it('LOW_SAMPLE for sold history built from fewer than three sales', () => {
    expect(run({ candidates: [sold(1000, 2)], rules }).review.reasons).toEqual(['LOW_SAMPLE']);
    expect(run({ candidates: [sold(1000, 3)], rules }).review.reasons).toEqual([]);
    expect(run({ candidates: [sold(1000, 5)], rules }).review.reasons).toEqual([]);
  });
  it('reasons are listed in a stable order and required is true when there is any', () => {
    const r = run({
      card: card({ currentPriceCents: 100, costCents: 5000, previousReferenceCents: 100 }),
      candidates: [sold(1000, 1)],
      rules: [rule({ id: 'r', roundingMode: 'NONE', ceilingCents: 900 })],
    });
    expect(r.review.reasons).toEqual(['LARGE_MOVE', 'HIT_CEILING', 'BELOW_COST', 'REFERENCE_MOVED', 'LOW_SAMPLE']);
    expect(r.review.required).toBe(true);
  });
  it('unchanged is true within one cent of the current price', () => {
    expect(move(1000, 1000).unchanged).toBe(true);
    expect(move(1001, 1000).unchanged).toBe(true);
    expect(move(999, 1000).unchanged).toBe(true);
    expect(move(1002, 1000).unchanged).toBe(false);
    expect(move(998, 1000).unchanged).toBe(false);
    expect(run({ candidates: [manual(1000)], rules }).unchanged).toBe(false);
  });
});

describe('AT-11 locks', () => {
  const rules = [rule({ id: 'r', roundingMode: 'NONE' })];
  it('a PIN or a RECENT_EDIT lock blocks apply and still returns the number', () => {
    const pinned = run({ card: card({ lock: { kind: 'PIN', until: null } }), candidates: [manual(1000)], rules });
    expect(pinned).toMatchObject({ ok: true, priceCents: 1000, applyAllowed: false, lockedReason: 'PIN' });
    expect(pinned.why).toContain(COPY.locked);
    const recent = run({ card: card({ lock: { kind: 'RECENT_EDIT', until: new Date(NOW.getTime() + DAY) } }), candidates: [manual(1000)], rules });
    expect(recent).toMatchObject({ ok: true, priceCents: 1000, applyAllowed: false, lockedReason: 'RECENT_EDIT' });
    expect(recent.why).toContain(COPY.recentEditNoDate);
  });
  it('an expired lock does not block, an unlocked card applies', () => {
    const expired = run({ card: card({ lock: { kind: 'PIN', until: new Date(NOW.getTime() - 1) } }), candidates: [manual(1000)], rules });
    expect(expired).toMatchObject({ applyAllowed: true, lockedReason: null });
    const exactlyNow = run({ card: card({ lock: { kind: 'PIN', until: new Date(NOW.getTime()) } }), candidates: [manual(1000)], rules });
    expect(exactlyNow.applyAllowed).toBe(true);
    expect(run({ candidates: [manual(1000)], rules })).toMatchObject({ applyAllowed: true, lockedReason: null });
  });
  it('a failure never allows apply', () => {
    expect(run({ card: card({ lock: { kind: 'PIN', until: null } }) })).toMatchObject({ ok: false, applyAllowed: false });
  });
});

describe('AT-18 determinism and the clock', () => {
  const rules = [rule({ id: 'r1', priority: 1, rarityClass: 'RARE', percentBps: 9500, minMarginBps: 1000 }), rule({ id: 'r2', priority: 2 })];
  const input = () => ({
    card: card({ conditionCode: 'LP', costCents: 200, currentPriceCents: 900, previousReferenceCents: 1100, lock: { kind: 'PIN' as const, until: null } }),
    candidates: [manual(1200), benchmark(900), catalog(800)],
    rules,
    book: book(),
  });

  it('the same input twice gives deep equal output', () => {
    expect(run(input())).toEqual(run(input()));
  });

  it('does not mutate its input (deeply frozen inputs work)', () => {
    const deepFreeze = <T,>(o: T): T => {
      if (o && typeof o === 'object' && !Object.isFrozen(o) && !(o instanceof Date)) {
        Object.freeze(o);
        for (const k of Object.keys(o as Record<string, unknown>)) deepFreeze((o as Record<string, unknown>)[k]);
      }
      return o;
    };
    const frozen = deepFreeze(input());
    const before = JSON.stringify(frozen);
    const out = run(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(out.ok).toBe(true);
    // the rules array order is not changed by the sort
    expect(frozen.rules.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('result does not depend on the order candidates or rules are listed in', () => {
    const a = input();
    const b = { ...input(), candidates: [...a.candidates].reverse(), rules: [...rules].reverse() };
    expect(run(b)).toEqual(run(a));
  });

  it('the injected now is used only to measure age: a clock that throws on anything else is fine', () => {
    class StrictNow extends Date {
      toISOString(): string {
        throw new Error('clock used for formatting');
      }
      toJSON(): string {
        throw new Error('clock used for formatting');
      }
      toString(): string {
        throw new Error('clock used for formatting');
      }
      valueOf(): number {
        throw new Error('clock used as a number');
      }
      [Symbol.toPrimitive](): never {
        throw new Error('clock used as a primitive');
      }
    }
    const strict = new StrictNow(NOW.getTime());
    expect(strict.getTime()).toBe(NOW.getTime());
    const out = run({ ...input(), now: strict });
    expect(out).toEqual(run({ ...input(), now: NOW }));
  });

  it('never reads the system clock', () => {
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now was called');
    });
    try {
      const out = run(input());
      expect(out.ok).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('result shape', () => {
  it('a success carries every documented field and the JSON round trip is lossless', () => {
    const r = run({ candidates: [manual(1000)], card: card({ currentPriceCents: 900 }) });
    expect(Object.keys(r).sort()).toEqual(
      [
        'ok', 'family', 'priceCents', 'lineCents', 'priceSource', 'priceAsOf', 'referenceCents', 'referenceOrigin', 'referenceLabel',
        'referenceNote', 'referenceSampleCount', 'rule', 'unchanged', 'applyAllowed', 'lockedReason', 'review', 'warnings', 'trace', 'roundingUsed', 'why',
      ].sort()
    );
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(r.roundingUsed).toEqual({ mode: 'TIERED', direction: 'NEAREST' });
  });
  it('a failure is a complete object too', () => {
    const r = run({ candidates: [] });
    expect(r.family).toBe('RETAIL');
    expect(r.review).toEqual({ required: false, reasons: [], movePercent: null });
    expect(r.warnings).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  it('carries the note and sample count of the reference as typed', () => {
    const r = run({ candidates: [sold(1000, 4, { note: 'Seen at <b>a show</b>' })] });
    expect(r.referenceNote).toBe('Seen at <b>a show</b>');
    expect(r.referenceSampleCount).toBe(4);
  });
});
