/**
 * ADR-134 batch B3 acceptance (6): suggested price rules. Pure function, no I/O.
 */
import {
  CONDITION_MULTIPLIERS,
  computeSuggestedPrice,
  roundSuggestedCents,
} from '../services/cardCatalog/cardPriceSuggestionService';

const NOW = new Date('2026-10-04T12:00:00Z');
const fresh = new Date('2026-10-04T06:00:00Z');
const price = (over: Record<string, unknown> = {}) => ({
  usd: 10,
  usdFoil: 25,
  usdEtched: null,
  usdReverse: null,
  asOf: fresh,
  ...over,
});

describe('computeSuggestedPrice: specified failure codes (acceptance 6)', () => {
  it('GRADED_NOT_SUPPORTED when a grader or grade is present', () => {
    const r = computeSuggestedPrice({ price: price(), grader: 'PSA', grade: '10', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'GRADED_NOT_SUPPORTED', suggestedPrice: null });
    expect(computeSuggestedPrice({ price: price(), grade: '9', now: NOW })).toMatchObject({ code: 'GRADED_NOT_SUPPORTED' });
  });

  it('LANGUAGE_NOT_COVERED for non-English, returning the labeled English reference', () => {
    const r = computeSuggestedPrice({ price: price(), language: 'ja', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'LANGUAGE_NOT_COVERED', suggestedPrice: null });
    expect((r as any).englishReference).toEqual({ finish: 'NONFOIL', price: 10, label: 'English Near Mint reference' });
  });

  it('LANGUAGE_NOT_COVERED omits the reference when the English finish has no price', () => {
    const r = computeSuggestedPrice({ price: price(), finish: 'ETCHED', language: 'de', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'LANGUAGE_NOT_COVERED' });
    expect((r as any).englishReference).toBeUndefined();
  });

  it('NO_PRICE_FOR_FINISH when the finish column is null or zero', () => {
    expect(computeSuggestedPrice({ price: price(), finish: 'ETCHED', now: NOW })).toMatchObject({ ok: false, code: 'NO_PRICE_FOR_FINISH' });
    expect(computeSuggestedPrice({ price: price(), finish: 'REVERSE_HOLO', now: NOW })).toMatchObject({ code: 'NO_PRICE_FOR_FINISH' });
    expect(computeSuggestedPrice({ price: price({ usd: 0 }), now: NOW })).toMatchObject({ code: 'NO_PRICE_FOR_FINISH' });
  });

  it('NO_PRICE_DATA when the printing has no price row, and validation codes for unknown finish or condition', () => {
    expect(computeSuggestedPrice({ price: null, now: NOW })).toMatchObject({ ok: false, code: 'NO_PRICE_DATA' });
    expect(computeSuggestedPrice({ price: price(), finish: 'SPARKLY', now: NOW })).toMatchObject({ code: 'INVALID_FINISH' });
    expect(computeSuggestedPrice({ price: price(), conditionCode: 'XX', now: NOW })).toMatchObject({ code: 'INVALID_CONDITION' });
  });

  it('checks graded before language before finish', () => {
    expect(computeSuggestedPrice({ price: price(), grader: 'BGS', language: 'ja', finish: 'ETCHED', now: NOW })).toMatchObject({ code: 'GRADED_NOT_SUPPORTED' });
    expect(computeSuggestedPrice({ price: price(), language: 'ja', finish: 'ETCHED', now: NOW })).toMatchObject({ code: 'LANGUAGE_NOT_COVERED' });
  });
});

describe('computeSuggestedPrice: numbers', () => {
  it('uses the finish column and the condition multiplier, and rounds by band', () => {
    // NM nonfoil $10.00 -> $10.00; LP 0.90 -> $9.00 (nearest $0.25 band)
    expect(computeSuggestedPrice({ price: price(), now: NOW })).toMatchObject({ ok: true, suggestedPrice: 10 });
    expect(computeSuggestedPrice({ price: price(), conditionCode: 'LP', now: NOW })).toMatchObject({ suggestedPrice: 9 });
    // foil $25 x 0.65 = 16.25
    expect(computeSuggestedPrice({ price: price(), finish: 'FOIL', conditionCode: 'HP', now: NOW })).toMatchObject({ suggestedPrice: 16.25 });
    // HOLO uses the foil column
    expect(computeSuggestedPrice({ price: price(), finish: 'HOLO', now: NOW })).toMatchObject({ suggestedPrice: 25 });
  });

  it('defaults to non-foil, Near Mint and English when omitted', () => {
    const r = computeSuggestedPrice({ price: price(), now: NOW });
    expect(r).toMatchObject({ ok: true, basis: { finish: 'NONFOIL', conditionCode: 'NM', multiplier: 1, priceField: 'usd' } });
  });

  it('ships the placeholder multipliers from the ADR (decision D10)', () => {
    expect(CONDITION_MULTIPLIERS).toEqual({ NM: 1.0, LP: 0.9, MP: 0.8, HP: 0.65, DMG: 0.5 });
  });

  it('rounds under $5 to $0.05, $5 to $50 to $0.25, over $50 to $1, and never below $0.05', () => {
    expect(roundSuggestedCents(123).cents).toBe(125);
    expect(roundSuggestedCents(122).cents).toBe(120);
    expect(roundSuggestedCents(512).cents).toBe(500);
    expect(roundSuggestedCents(513).cents).toBe(525);
    expect(roundSuggestedCents(5049).cents).toBe(5000);
    expect(roundSuggestedCents(5051).cents).toBe(5100);
    expect(roundSuggestedCents(0).cents).toBe(5);
    expect(roundSuggestedCents(-40).cents).toBe(5);
  });

  it('never returns a number below zero, whatever the inputs', () => {
    for (const usd of [0.01, 0.02, 0.5, 1, 4.99, 5, 50, 51, 1000, 99999.99]) {
      for (const cond of Object.keys(CONDITION_MULTIPLIERS)) {
        const r = computeSuggestedPrice({ price: price({ usd }), conditionCode: cond, now: NOW });
        expect(r.ok).toBe(true);
        expect((r as any).suggestedPrice).toBeGreaterThan(0);
      }
    }
  });

  it('flags a suggestion under $0.99 as below the eBay minimum', () => {
    expect(computeSuggestedPrice({ price: price({ usd: 0.3 }), now: NOW })).toMatchObject({ suggestedPrice: 0.3, belowEbayMinimum: true });
    expect(computeSuggestedPrice({ price: price({ usd: 1.0 }), now: NOW })).toMatchObject({ belowEbayMinimum: false });
  });
});

describe('computeSuggestedPrice: staleness', () => {
  it('shows the data date after 24 hours and marks stale after 48 hours (default)', () => {
    const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600 * 1000);
    expect(computeSuggestedPrice({ price: price({ asOf: at(10) }), now: NOW })).toMatchObject({ showDataDate: false, stale: false });
    expect(computeSuggestedPrice({ price: price({ asOf: at(30) }), now: NOW })).toMatchObject({ showDataDate: true, stale: false });
    expect(computeSuggestedPrice({ price: price({ asOf: at(60) }), now: NOW })).toMatchObject({ showDataDate: true, stale: true });
  });

  it('honors CARD_PRICE_STALE_HOURS via staleHours and prefers the newer of price.asOf and the source snapshot', () => {
    const old = new Date(NOW.getTime() - 60 * 3600 * 1000);
    expect(computeSuggestedPrice({ price: price({ asOf: old }), now: NOW, staleHours: 100 })).toMatchObject({ stale: false });
    const r = computeSuggestedPrice({ price: price({ asOf: old }), sourceAsOf: fresh, now: NOW });
    expect(r).toMatchObject({ stale: false, showDataDate: false, asOf: fresh.toISOString() });
  });

  it('treats a missing date as stale', () => {
    expect(computeSuggestedPrice({ price: price({ asOf: null }), now: NOW })).toMatchObject({ stale: true, asOf: null });
  });
});
