/**
 * Price book bulk rate card (ADR-140 sections 8.1 to 8.4, acceptance AT-13).
 */
import {
  adjustRates,
  lookupRate,
  lotPricePerThousandCents,
  quoteBulkBuy,
  quoteBulkLine,
  rateChangeWarnings,
  tierForLotKind,
  tierForRarityClass,
} from '../services/priceBook/bulkRates';
import { LOT_KIND_TIER, BULK_LOT_KINDS, TIERS } from '../services/priceBook/vocabulary';
import { priceCentsForCards } from '../services/bulkLot/bulkLotPricing';
import { BULK_LOT_KINDS as REAL_LOT_KINDS } from '../services/bulkLot/bulkLotVocabulary';
import type { BulkRate } from '../services/priceBook/types';

const rate = (over: Partial<BulkRate> & { rateCents: number }): BulkRate => ({
  direction: 'SELL',
  game: 'MTG',
  tier: 'COMMON',
  finish: 'ANY',
  unit: 'PER_1000',
  ...over,
});

const DASH_RE = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']');

describe('AT-13 quoteBulkLine on the ADR-136 table', () => {
  const rates = [rate({ rateCents: 800 })];
  const q = (cards: number) => quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards });

  it('$8.00 per 1,000: 1,500 cards is 1200 cents, 4,200 is 3360, 62 is 50, 1 is 1', () => {
    expect(q(1500)).toMatchObject({ ok: true, cents: 1200, unit: 'PER_1000', rateCents: 800 });
    expect(q(4200)).toMatchObject({ ok: true, cents: 3360 });
    expect(q(62)).toMatchObject({ ok: true, cents: 50 });
    expect(q(1)).toMatchObject({ ok: true, cents: 1 });
  });

  it('$0.40 per 1,000 and 1 card comes to 0 cents and is refused', () => {
    const low = [rate({ rateCents: 40 })];
    expect(quoteBulkLine(low, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 1 })).toEqual({
      ok: false,
      code: 'QUANTITY_TOO_SMALL',
    });
    expect(quoteBulkLine(low, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 12 })).toEqual({ ok: false, code: 'QUANTITY_TOO_SMALL' });
    expect(quoteBulkLine(low, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 13 })).toMatchObject({ ok: true, cents: 1 });
    expect(quoteBulkLine(low, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 38 })).toMatchObject({ ok: true, cents: 2 });
  });

  it('matches the live bulk lot arithmetic (priceCentsForCards) for a grid of quantities and rates', () => {
    for (const p of [1, 40, 650, 800, 12345, 10_000_000]) {
      for (const cards of [1, 2, 13, 61, 62, 999, 1000, 1500, 4200, 99_999, 1_000_000]) {
        const mine = quoteBulkLine([rate({ rateCents: p })], { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards });
        const theirs = priceCentsForCards(cards, p);
        if (theirs.ok) expect(mine).toMatchObject({ ok: true, cents: theirs.cents });
        else expect(mine).toMatchObject({ ok: false, code: theirs.code });
      }
    }
  });

  it('refuses bad quantities and tiers', () => {
    expect(q(0)).toEqual({ ok: false, code: 'BAD_QUANTITY' });
    expect(q(1.5)).toEqual({ ok: false, code: 'BAD_QUANTITY' });
    expect(q(1_000_001)).toEqual({ ok: false, code: 'BAD_QUANTITY' });
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'MYTHICAL', finish: 'ANY', cards: 5 })).toEqual({ ok: false, code: 'BAD_TIER' });
    expect(quoteBulkLine(rates, { direction: 'TRADE', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5 })).toEqual({ ok: false, code: 'NO_RATE' });
  });

  it('a tier with no rate gives NO_RATE and nothing is guessed', () => {
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'ANY', cards: 10 })).toEqual({ ok: false, code: 'NO_RATE' });
    expect(quoteBulkLine(rates, { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 10 })).toEqual({ ok: false, code: 'NO_RATE' });
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'POKEMON', tier: 'COMMON', finish: 'ANY', cards: 10 })).toEqual({ ok: false, code: 'NO_RATE' });
  });

  it('a per card rate multiplies directly', () => {
    const rares = [rate({ tier: 'RARE', unit: 'PER_CARD', rateCents: 25 })];
    expect(quoteBulkLine(rares, { direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'ANY', cards: 40 })).toMatchObject({ ok: true, cents: 1000, unit: 'PER_CARD' });
  });

  it('game matching ignores case', () => {
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'mtg', tier: 'COMMON', finish: 'any', cards: 1000 })).toMatchObject({ ok: true, cents: 800 });
  });
});

describe('AT-13 finish fallback and unit choice', () => {
  const rates = [
    rate({ rateCents: 800 }),
    rate({ finish: 'FOIL', rateCents: 2000 }),
    rate({ tier: 'RARE', unit: 'PER_CARD', rateCents: 20 }),
    rate({ tier: 'RARE', finish: 'FOIL', unit: 'PER_CARD', rateCents: 60 }),
  ];

  it('an exact finish row wins and a missing finish falls back to ANY', () => {
    expect(lookupRate(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'FOIL', unit: 'PER_1000' })?.rateCents).toBe(2000);
    expect(lookupRate(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'NONFOIL', unit: 'PER_1000' })?.rateCents).toBe(800);
    expect(lookupRate(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_1000' })?.rateCents).toBe(800);
    expect(lookupRate(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'FOIL', unit: 'PER_CARD' })).toBeNull();
  });

  it('quoteBulkLine uses the finer finish, and reports which finish row it used', () => {
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'FOIL', cards: 1000 })).toMatchObject({ ok: true, cents: 2000, finishUsed: 'FOIL' });
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ETCHED', cards: 1000 })).toMatchObject({ ok: true, cents: 800, finishUsed: 'ANY' });
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'RARE', finish: 'FOIL', cards: 10 })).toMatchObject({ ok: true, cents: 600, unit: 'PER_CARD' });
  });

  it('with no unit given PER_1000 is tried before PER_CARD within a finish; an explicit unit is honored', () => {
    const both = [rate({ rateCents: 800 }), rate({ unit: 'PER_CARD', rateCents: 2 })];
    expect(quoteBulkLine(both, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 1000 })).toMatchObject({ cents: 800, unit: 'PER_1000' });
    expect(quoteBulkLine(both, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 1000, unit: 'PER_CARD' })).toMatchObject({ cents: 2000, unit: 'PER_CARD' });
    expect(quoteBulkLine(both, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 10, unit: 'PER_HOUR' })).toEqual({ ok: false, code: 'NO_RATE' });
  });

  it('a rate outside the card limits is refused', () => {
    expect(quoteBulkLine([rate({ rateCents: 0 })], { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 10 })).toEqual({ ok: false, code: 'NO_RATE' });
    expect(quoteBulkLine([rate({ rateCents: 10_000_001 })], { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 10 })).toEqual({ ok: false, code: 'NO_RATE' });
  });
});

describe('AT-13 tier mapping', () => {
  it('maps all six lot kinds to the tiers of ADR-140 section 8.1', () => {
    expect(tierForLotKind('BULK_COMMON')).toBe('COMMON');
    expect(tierForLotKind('BULK_UNCOMMON')).toBe('UNCOMMON');
    expect(tierForLotKind('BULK_COMMON_UNCOMMON')).toBe('COMMON_UNCOMMON');
    expect(tierForLotKind('BULK_RARE')).toBe('RARE');
    expect(tierForLotKind('BULK_LAND')).toBe('LAND');
    expect(tierForLotKind('BULK_MIXED')).toBe('MIXED');
    expect(tierForLotKind('BULK_SEALED')).toBeNull();
  });

  it('the lot kind list is the live bulk lot vocabulary and every mapped tier is a real tier', () => {
    expect([...BULK_LOT_KINDS]).toEqual([...REAL_LOT_KINDS]);
    for (const kind of REAL_LOT_KINDS) expect(TIERS as readonly string[]).toContain(LOT_KIND_TIER[kind]);
  });

  it('a single card tier comes from its rarity class and UNKNOWN has none', () => {
    expect(tierForRarityClass('COMMON')).toBe('COMMON');
    expect(tierForRarityClass('SPECIAL')).toBe('SPECIAL');
    expect(tierForRarityClass('MYTHIC')).toBe('MYTHIC');
    expect(tierForRarityClass('UNKNOWN')).toBeNull();
  });

  it('lotPricePerThousandCents reads the SELL PER_1000 row at finish ANY for the lot tier', () => {
    const rates = [
      rate({ tier: 'COMMON_UNCOMMON', rateCents: 1000 }),
      rate({ tier: 'COMMON', rateCents: 800 }),
      rate({ tier: 'COMMON', finish: 'FOIL', rateCents: 5000 }),
      rate({ tier: 'RARE', unit: 'PER_CARD', rateCents: 25 }),
      rate({ direction: 'BUY', tier: 'UNCOMMON', rateCents: 100 }),
    ];
    expect(lotPricePerThousandCents(rates, { game: 'MTG', lotKind: 'BULK_COMMON' })).toBe(800);
    expect(lotPricePerThousandCents(rates, { game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' })).toBe(1000);
    expect(lotPricePerThousandCents(rates, { game: 'MTG', lotKind: 'BULK_RARE' })).toBeNull();
    expect(lotPricePerThousandCents(rates, { game: 'MTG', lotKind: 'BULK_UNCOMMON' })).toBeNull();
    expect(lotPricePerThousandCents(rates, { game: 'POKEMON', lotKind: 'BULK_COMMON' })).toBeNull();
    expect(lotPricePerThousandCents(rates, { game: 'MTG', lotKind: 'NOT_A_KIND' })).toBeNull();
  });

  it('no per card rate is ever derived from a per 1,000 row', () => {
    const rates = [rate({ rateCents: 800 })];
    expect(lookupRate(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', unit: 'PER_CARD' })).toBeNull();
    expect(quoteBulkLine(rates, { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 10, unit: 'PER_CARD' })).toEqual({ ok: false, code: 'NO_RATE' });
  });
});

describe('AT-13 buying: credit and baskets', () => {
  const buy = [
    rate({ direction: 'BUY', rateCents: 400 }),
    rate({ direction: 'BUY', tier: 'UNCOMMON', rateCents: 500, creditRateCents: 800 }),
    rate({ direction: 'BUY', tier: 'RARE', unit: 'PER_CARD', rateCents: 10 }),
  ];

  it('credit is the cash amount times the credit multiplier unless the row has an explicit credit rate', () => {
    const common = quoteBulkLine(buy, { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 }, { buyCreditBps: 12000 });
    expect(common).toMatchObject({ ok: true, cents: 2000, creditCents: 2400 });
    const bigger = quoteBulkLine(buy, { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 }, { buyCreditBps: 15000 });
    expect(bigger).toMatchObject({ cents: 2000, creditCents: 3000 });
    const dflt = quoteBulkLine(buy, { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 });
    expect(dflt).toMatchObject({ creditCents: 2400 });
    const explicit = quoteBulkLine(buy, { direction: 'BUY', game: 'MTG', tier: 'UNCOMMON', finish: 'ANY', cards: 2000 }, { buyCreditBps: 12000 });
    expect(explicit).toMatchObject({ ok: true, cents: 1000, creditCents: 1600 });
  });

  it('a SELL line carries no credit', () => {
    const sell = quoteBulkLine([rate({ rateCents: 800 })], { direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 1000 });
    expect(sell).toMatchObject({ ok: true, creditCents: null });
  });

  it('quoteBulkBuy sums cash and credit across lines', () => {
    const r = quoteBulkBuy(buy, { buyCreditBps: 12000 }, [
      { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 },
      { direction: 'BUY', game: 'MTG', tier: 'UNCOMMON', finish: 'ANY', cards: 2000 },
      { direction: 'BUY', game: 'MTG', tier: 'RARE', finish: 'ANY', cards: 30 },
    ]);
    expect(r).toMatchObject({ ok: true, cashCents: 2000 + 1000 + 300, creditCents: 2400 + 1600 + 360 });
    expect(r.lines).toHaveLength(3);
  });

  it('quoteBulkBuy refuses a line with no rate and gives no totals', () => {
    const r = quoteBulkBuy(buy, { buyCreditBps: 12000 }, [
      { direction: 'BUY', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 5000 },
      { direction: 'BUY', game: 'MTG', tier: 'MYTHIC', finish: 'ANY', cards: 4 },
    ]);
    expect(r).toMatchObject({ ok: false, code: 'NO_RATE', cashCents: null, creditCents: null });
    expect(r.lines[0]).toMatchObject({ ok: true });
    expect(r.lines[1]).toEqual({ ok: false, code: 'NO_RATE' });
  });

  it('quoteBulkBuy forces the BUY direction even if a line says SELL', () => {
    const r = quoteBulkBuy([rate({ rateCents: 800 })], { buyCreditBps: 12000 }, [{ direction: 'SELL', game: 'MTG', tier: 'COMMON', finish: 'ANY', cards: 1000 }]);
    expect(r).toMatchObject({ ok: false, code: 'NO_RATE' });
  });
});

describe('AT-13 adjustRates', () => {
  const rates = [
    rate({ rateCents: 800 }),
    rate({ tier: 'UNCOMMON', rateCents: 805 }),
    rate({ tier: 'RARE', unit: 'PER_CARD', rateCents: 25 }),
    rate({ finish: 'FOIL', rateCents: 2000 }),
    rate({ game: 'POKEMON', tier: 'COMMON', rateCents: 1000 }),
    rate({ direction: 'BUY', tier: 'COMMON', rateCents: 400, creditRateCents: 500 }),
  ];

  it('minus 10 percent rounds half up to the cent', () => {
    const r = adjustRates(rates, { percentBps: -1000, direction: 'SELL', game: 'MTG', finish: 'ANY' });
    if (!r.ok) throw new Error('expected ok');
    const after = r.changes.map((c) => [c.tier, c.beforeCents, c.afterCents]);
    expect(after).toEqual([
      ['COMMON', 800, 720],
      ['UNCOMMON', 805, 725],
      ['RARE', 25, 23],
    ]);
    expect(r.unchangedCount).toBe(0);
  });

  it('filters by game and finish, and by direction', () => {
    const all = adjustRates(rates, { percentBps: 1000, direction: 'SELL' });
    if (!all.ok) throw new Error('expected ok');
    expect(all.changes).toHaveLength(5);
    const foil = adjustRates(rates, { percentBps: 1000, direction: 'SELL', finish: 'FOIL' });
    if (!foil.ok) throw new Error('expected ok');
    expect(foil.changes.map((c) => c.afterCents)).toEqual([2200]);
    const buy = adjustRates(rates, { percentBps: 1000, direction: 'BUY' });
    if (!buy.ok) throw new Error('expected ok');
    expect(buy.changes).toHaveLength(1);
    expect(buy.changes[0]).toMatchObject({ beforeCents: 400, afterCents: 440, creditBeforeCents: 500, creditAfterCents: 550 });
  });

  it('holds results between 1 cent and the card limits and flags them', () => {
    const tiny = adjustRates([rate({ rateCents: 1 })], { percentBps: -9000, direction: 'SELL' });
    if (!tiny.ok) throw new Error('expected ok');
    expect(tiny.changes).toEqual([]);
    expect(tiny.unchangedCount).toBe(1);
    const small = adjustRates([rate({ rateCents: 3 })], { percentBps: -9000, direction: 'SELL' });
    if (!small.ok) throw new Error('expected ok');
    expect(small.changes[0]).toMatchObject({ afterCents: 1, clamped: true });
    const huge = adjustRates([rate({ rateCents: 9_000_000 })], { percentBps: 100000, direction: 'SELL' });
    if (!huge.ok) throw new Error('expected ok');
    expect(huge.changes[0]).toMatchObject({ afterCents: 10_000_000, clamped: true });
    const perCard = adjustRates([rate({ unit: 'PER_CARD', rateCents: 90_000_000 })], { percentBps: 100000, direction: 'SELL' });
    if (!perCard.ok) throw new Error('expected ok');
    expect(perCard.changes[0]).toMatchObject({ afterCents: 100_000_000, clamped: true });
  });

  it('rejects a percent that is not a whole number in range, and a bad direction', () => {
    expect(adjustRates(rates, { percentBps: 5.5, direction: 'SELL' })).toEqual({ ok: false, code: 'BAD_PERCENT' });
    expect(adjustRates(rates, { percentBps: -9001, direction: 'SELL' })).toEqual({ ok: false, code: 'BAD_PERCENT' });
    expect(adjustRates(rates, { percentBps: 100001, direction: 'SELL' })).toEqual({ ok: false, code: 'BAD_PERCENT' });
    expect(adjustRates(rates, { percentBps: Number.NaN, direction: 'SELL' })).toEqual({ ok: false, code: 'BAD_PERCENT' });
    expect(adjustRates(rates, { percentBps: 100, direction: 'LEND' })).toEqual({ ok: false, code: 'BAD_DIRECTION' });
  });

  it('plus 0 percent changes nothing and does not mutate its input', () => {
    const snapshot = JSON.stringify(rates);
    const r = adjustRates(rates, { percentBps: 0, direction: 'SELL' });
    expect(r).toMatchObject({ ok: true, changes: [], unchangedCount: 5 });
    expect(JSON.stringify(rates)).toBe(snapshot);
  });
});

describe('rateChangeWarnings', () => {
  const before = [rate({ rateCents: 800 }), rate({ tier: 'UNCOMMON', rateCents: 1000 }), rate({ tier: 'RARE', unit: 'PER_CARD', rateCents: 25 })];

  it('flags a decimal slip such as $8.00 typed as $800.00, once', () => {
    const w = rateChangeWarnings(before, [rate({ rateCents: 80000 }), before[1], before[2]]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: 'DECIMAL_SLIP', oldRateCents: 800, newRateCents: 80000 });
    expect(w[0].message).toContain('$8.00');
    expect(w[0].message).toContain('$800.00');
  });

  it('flags the slip in the other direction too', () => {
    const w = rateChangeWarnings(before, [rate({ rateCents: 80 }), before[1], before[2]]);
    expect(w.map((x) => x.code)).toEqual(['DECIMAL_SLIP']);
  });

  it('flags a change of more than 50 percent but not exactly 50 percent', () => {
    expect(rateChangeWarnings(before, [rate({ rateCents: 1200 }), before[1], before[2]])).toEqual([]);
    const over = rateChangeWarnings(before, [rate({ rateCents: 1201 }), before[1], before[2]]);
    expect(over.map((x) => x.code)).toEqual(['LARGE_RATE_CHANGE']);
    const drop = rateChangeWarnings(before, [rate({ rateCents: 399 }), before[1], before[2]]);
    expect(drop.map((x) => x.code)).toEqual(['LARGE_RATE_CHANGE']);
    expect(rateChangeWarnings(before, [rate({ rateCents: 400 }), before[1], before[2]])).toEqual([]);
  });

  it('does not warn about unchanged, new or removed rows', () => {
    expect(rateChangeWarnings(before, before)).toEqual([]);
    expect(rateChangeWarnings(before, [...before, rate({ tier: 'LAND', rateCents: 99999 })])).toEqual([]);
    expect(rateChangeWarnings(before, [before[0]])).toEqual([]);
    expect(rateChangeWarnings([], before)).toEqual([]);
  });

  it('keys rows by direction, game, tier, finish and unit', () => {
    const w = rateChangeWarnings(
      [rate({ direction: 'BUY', rateCents: 100 }), rate({ rateCents: 800 })],
      [rate({ direction: 'BUY', rateCents: 1000 }), rate({ rateCents: 800 })]
    );
    expect(w).toHaveLength(1);
    expect(w[0].key).toBe('BUY|MTG|COMMON|ANY|PER_1000');
  });

  it('its messages are free of dashes', () => {
    const w = rateChangeWarnings(before, [rate({ rateCents: 80000 }), rate({ tier: 'UNCOMMON', rateCents: 3000 }), before[2]]);
    expect(w).toHaveLength(2);
    for (const x of w) expect(x.message).not.toMatch(DASH_RE);
  });
});
