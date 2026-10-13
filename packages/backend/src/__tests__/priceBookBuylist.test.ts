/**
 * Buylist rules and quotes (ADR-140 section 7, acceptance AT-12).
 */
import { quoteBuylist, starterBuylistRules, starterRetailRules } from '../services/priceBook/buylist';
import { quoteBulkLine } from '../services/priceBook/bulkRates';
import { COPY } from '../services/priceBook/messages';
import { DEFAULT_BOOK_SETTINGS } from '../services/priceBook/vocabulary';
import type { BookSettings, BulkRate, CardInput, PriceRule, ReferenceCandidate } from '../services/priceBook/types';

const NOW = new Date('2026-10-12T12:00:00.000Z');

const book = (over: Partial<BookSettings> = {}): BookSettings => ({
  ...DEFAULT_BOOK_SETTINGS,
  version: 3,
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

const manual = (valueCents: number): ReferenceCandidate => ({
  kind: 'MANUAL',
  valueCents,
  asOf: new Date('2026-10-03T14:00:00.000Z'),
  origin: 'SHOP',
  label: 'Your typed price',
});

const buyRule = (over: Partial<PriceRule> & { id: string }): PriceRule => ({
  family: 'BUYLIST',
  name: `Buy ${over.id}`,
  priority: 10,
  enabled: true,
  basis: 'REFERENCE',
  percentBps: 5000,
  addCents: 0,
  ...over,
});

const starter = (): PriceRule[] => starterBuylistRules().map((r, i) => ({ ...r, id: `starter${i + 1}` }));

function quote(opts: { card?: CardInput; ref?: number; rules?: PriceRule[]; book?: BookSettings; minCardSaleCents?: number; rates?: BulkRate[] }) {
  return quoteBuylist({
    card: opts.card ?? card(),
    candidates: opts.ref === undefined ? [] : [manual(opts.ref)],
    rules: opts.rules ?? starter(),
    book: opts.book ?? book(),
    rates: opts.rates,
    config: { now: NOW, minCardSaleCents: opts.minCardSaleCents ?? 99 },
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe('starter templates', () => {
  it('gives three buy rules with the documented bands, percents and credit', () => {
    const rules = starterBuylistRules();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.name)).toEqual([COPY.starterBuyUnder, COPY.starterBuyMiddle, COPY.starterBuyTop]);
    expect(rules.map((r) => r.percentBps)).toEqual([4000, 5000, 6000]);
    expect(rules.map((r) => [r.refMinCents, r.refMaxCents])).toEqual([
      [null, 149],
      [150, 2499],
      [2500, null],
    ]);
    expect(rules.map((r) => r.priority)).toEqual([10, 20, 30]);
    for (const r of rules) {
      expect(r.family).toBe('BUYLIST');
      expect(r.enabled).toBe(true);
      expect(r.basis).toBe('REFERENCE');
      expect(r.creditBps).toBe(12000);
      expect(r.addCents).toBe(0);
    }
  });

  it('gives one retail starter rule and fresh objects on every call', () => {
    const rules = starterRetailRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe(COPY.starterSellAll);
    expect(rules[0]?.family).toBe('RETAIL');
    expect(rules[0]?.percentBps).toBe(10000);
    const a = starterBuylistRules();
    const b = starterBuylistRules();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a).toEqual(b);
  });
});

describe('AT-12 starter bands', () => {
  it('149 cents falls in the under $1.50 band at 40 percent', () => {
    const r = quote({ ref: 149 });
    expect(r.ok).toBe(true);
    expect(r.rule?.name).toBe(COPY.starterBuyUnder);
    expect(r.priceCents).toBe(60);
    expect(r.creditCents).toBe(70);
  });

  it('150 cents falls in the middle band at 50 percent', () => {
    const r = quote({ ref: 150 });
    expect(r.rule?.name).toBe(COPY.starterBuyMiddle);
    expect(r.priceCents).toBe(75);
    expect(r.creditCents).toBe(90);
  });

  it('2499 cents is still the middle band and 2500 cents is the top band', () => {
    const mid = quote({ ref: 2499 });
    expect(mid.rule?.name).toBe(COPY.starterBuyMiddle);
    expect(mid.priceCents).toBe(1250);
    expect(mid.creditCents).toBe(1500);
    const top = quote({ ref: 2500 });
    expect(top.rule?.name).toBe(COPY.starterBuyTop);
    expect(top.priceCents).toBe(1500);
    expect(top.creditCents).toBe(1800);
  });

  it('adds a CREDIT step to the trace after the cash steps', () => {
    const r = quote({ ref: 2500 });
    const last = r.trace[r.trace.length - 1];
    expect(last?.step).toBe('CREDIT');
    expect(last?.beforeCents).toBe(1500);
    expect(last?.afterCents).toBe(1800);
  });

  it('the plain words sentence names the cash offer rule and the credit', () => {
    const r = quote({ ref: 2500 });
    expect(r.why).toContain('Rule: Buy $25.00 and up.');
    expect(r.why).toContain('$18.00');
  });
});

describe('AT-12 rule order and matching', () => {
  it('the first matching rule by priority wins', () => {
    const rules = [
      buyRule({ id: 'late', priority: 20, percentBps: 3000 }),
      buyRule({ id: 'early', priority: 5, percentBps: 6000, rarityClass: 'RARE' }),
    ];
    const r = quote({ ref: 1000, rules });
    expect(r.rule?.id).toBe('early');
    expect(r.priceCents).toBe(600);
  });

  it('a rule that does not match the rarity is skipped for the next one', () => {
    const rules = [
      buyRule({ id: 'mythic', priority: 1, percentBps: 7000, rarityClass: 'MYTHIC' }),
      buyRule({ id: 'any', priority: 2, percentBps: 5000 }),
    ];
    const r = quote({ ref: 1000, rules });
    expect(r.rule?.id).toBe('any');
    expect(r.priceCents).toBe(500);
  });

  it('there is no default buy rule: no matching rule gives NO_RULE and no number', () => {
    const none = quote({ ref: 1000, rules: [] });
    expect(none.ok).toBe(false);
    expect(none.code).toBe('NO_RULE');
    expect(none.priceCents).toBeNull();
    expect(none.creditCents).toBeNull();
    const nonMatching = quote({ ref: 1000, rules: [buyRule({ id: 'm', rarityClass: 'MYTHIC' })] });
    expect(nonMatching.code).toBe('NO_RULE');
  });

  it('retail rules are never used for buying', () => {
    const retail: PriceRule = { ...buyRule({ id: 'retail' }), family: 'RETAIL' };
    expect(quote({ ref: 1000, rules: [retail] }).code).toBe('NO_RULE');
  });

  it('no reference gives NO_REFERENCE and no credit', () => {
    const r = quote({ rules: starter() });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NO_REFERENCE');
    expect(r.creditCents).toBeNull();
  });
});

describe('AT-12 rounding of the offer and the credit', () => {
  it('buying rounds DOWN by default so the shop never pays above its own percent', () => {
    const r = quote({ ref: 1040, rules: [buyRule({ id: 'b' })] });
    expect(r.priceCents).toBe(500);
    expect(r.roundingUsed).toEqual(expect.objectContaining({ mode: 'TIERED', direction: 'DOWN' }));
  });

  it('a rule can ask for NEAREST', () => {
    const r = quote({ ref: 1040, rules: [buyRule({ id: 'b', roundingDirection: 'NEAREST' })] });
    expect(r.priceCents).toBe(525);
  });

  it('credit uses the same mode and direction as the cash offer and is never below cash', () => {
    const down = quote({ ref: 1040, rules: [buyRule({ id: 'b' })] });
    expect(down.priceCents).toBe(500);
    expect(down.creditCents).toBe(600);
    const nearest = quote({ ref: 1040, rules: [buyRule({ id: 'b', roundingDirection: 'NEAREST' })] });
    expect(nearest.creditCents).toBe(625);
    const small = quote({ ref: 100, rules: [buyRule({ id: 'b', creditBps: 10000 })] });
    expect(small.creditCents).toBe(small.priceCents);
    const low = quote({ ref: 1000, rules: [buyRule({ id: 'b', creditBps: 5000 })] });
    expect(low.creditCents).toBe(low.priceCents);
  });

  it('applies the condition percent to the offer', () => {
    const r = quote({ card: card({ conditionCode: 'LP' }), ref: 1000, rules: [buyRule({ id: 'b' })] });
    expect(r.priceCents).toBe(450);
  });
});

describe('AT-12 credit percent source', () => {
  it('uses the rule credit percent when set, else the book buy credit percent', () => {
    const fromBook = quote({ ref: 1000, rules: [buyRule({ id: 'b' })], book: book({ buyCreditBps: 11000 }) });
    expect(fromBook.priceCents).toBe(500);
    expect(fromBook.creditCents).toBe(550);
    const fromRule = quote({ ref: 1000, rules: [buyRule({ id: 'b', creditBps: 15000 })], book: book({ buyCreditBps: 11000 }) });
    expect(fromRule.creditCents).toBe(750);
  });

  it('the default book credit percent is 120', () => {
    const r = quote({ ref: 1000, rules: [buyRule({ id: 'b' })] });
    expect(r.creditCents).toBe(600);
  });
});

describe('AT-12 minimum offer', () => {
  it('a cash offer below the rule minimum gives BELOW_MIN_OFFER, no price and no credit', () => {
    const r = quote({ ref: 150, rules: [buyRule({ id: 'b', minOfferCents: 100 })] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('BELOW_MIN_OFFER');
    expect(r.priceCents).toBeNull();
    expect(r.creditCents).toBeNull();
    expect(r.lineCents).toBeNull();
    expect(r.creditLineCents).toBeNull();
    expect(r.applyAllowed).toBe(false);
    expect(r.why.length).toBeGreaterThan(0);
  });

  it('an offer at the minimum is allowed', () => {
    const r = quote({ ref: 200, rules: [buyRule({ id: 'b', minOfferCents: 100 })] });
    expect(r.ok).toBe(true);
    expect(r.priceCents).toBe(100);
  });
});

describe('AT-12 quantity', () => {
  it('multiplies the cash and the credit by the quantity', () => {
    const r = quote({ card: card({ quantity: 4 }), ref: 1000, rules: [buyRule({ id: 'b' })] });
    expect(r.priceCents).toBe(500);
    expect(r.lineCents).toBe(2000);
    expect(r.creditCents).toBe(600);
    expect(r.creditLineCents).toBe(2400);
  });

  it('a quantity of one is the default', () => {
    const r = quote({ ref: 1000, rules: [buyRule({ id: 'b' })] });
    expect(r.lineCents).toBe(500);
    expect(r.creditLineCents).toBe(600);
  });
});

describe('AT-12 the retail price basis', () => {
  const retailRules = (): PriceRule[] => [
    { id: 'retail', family: 'RETAIL', name: 'Sell all', priority: 10, enabled: true, basis: 'REFERENCE', percentBps: 10000, addCents: 0 },
    buyRule({ id: 'fromRetail', basis: 'RETAIL_PRICE', percentBps: 5000 }),
  ];

  it('prices off what the retail family would charge', () => {
    const r = quote({ card: card({ conditionCode: 'LP' }), ref: 1200, rules: retailRules() });
    expect(r.ok).toBe(true);
    expect(r.rule?.id).toBe('fromRetail');
    expect(r.priceCents).toBe(525);
    expect(r.trace[0]?.step).toBe('RETAIL_PRICE');
    expect(r.trace[0]?.afterCents).toBe(1075);
  });

  it('fails with the same code when the retail price fails', () => {
    const r = quote({ ref: undefined, rules: retailRules() });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NO_REFERENCE');
    expect(r.priceCents).toBeNull();
  });

  it('does not inherit the retail below card minimum warning', () => {
    const r = quote({ ref: 40, rules: retailRules(), minCardSaleCents: 99 });
    expect(r.warnings.map((w) => w.code)).not.toContain('BELOW_CARD_MINIMUM');
  });
});

describe('AT-12 purity', () => {
  it('does not change frozen inputs and gives the same answer twice', () => {
    const input = deepFreeze({
      card: card({ quantity: 2 }),
      candidates: [manual(1040)],
      rules: starter(),
      book: book(),
      config: { now: NOW, minCardSaleCents: 99 },
    });
    const before = JSON.stringify(input);
    const a = quoteBuylist(input);
    const b = quoteBuylist(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(a).toEqual(b);
  });
});

describe('AT-12 bulk buying credit', () => {
  const rates: BulkRate[] = [
    { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000', rateCents: 400, creditRateCents: 600 },
    { direction: 'BUY', game: 'MTG', tier: 'UNCOMMON', finish: 'ANY', unit: 'PER_1000', rateCents: 1000 },
  ];

  it('an explicit rate card credit wins over the percent', () => {
    const r = quoteBulkLine(rates, { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 }, { buyCreditBps: 12000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cents).toBe(2000);
      expect(r.creditCents).toBe(3000);
    }
  });

  it('without an explicit credit the book percent applies', () => {
    const r = quoteBulkLine(rates, { direction: 'BUY', game: 'MTG', tier: 'UNCOMMON', finish: 'ANY', cards: 1000 }, { buyCreditBps: 12000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cents).toBe(1000);
      expect(r.creditCents).toBe(1200);
    }
  });
});
