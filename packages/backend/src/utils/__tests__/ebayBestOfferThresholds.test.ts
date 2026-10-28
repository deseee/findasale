/**
 * Best Offer thresholds sent to eBay (2026-10-28). Stored Item.bestOfferAutoAcceptAmt /
 * bestOfferMinimumAmt are never moved by a markdown, so they can sit at or above the price.
 * Every eBay payload must carry thresholds eBay accepts, using the same safe pair the
 * price-revision repair has used since 2026-09-19.
 */
import fs from 'fs';
import path from 'path';
import {
  isBestOfferThresholdError,
  computeSafeBestOfferThresholds,
  toBestOfferAmount,
  areBestOfferThresholdsValid,
  resolveBestOfferThresholds,
  buildBestOfferTerms,
  sanitizeOfferBestOfferTerms,
} from '../ebayBestOfferThresholds';

/** Minimal stand-in for a Prisma Decimal: an object whose valueOf is a numeric string. */
const decimal = (s: string) => ({ d: [1], e: 0, s: 1, valueOf: () => s, toString: () => s });

describe('computeSafeBestOfferThresholds (unchanged repair ratios)', () => {
  it('accept is 90% of the price and minimum is 75% of accept, rounded to cents', () => {
    expect(computeSafeBestOfferThresholds(25)).toEqual({ accept: 22.5, minimum: 16.88 });
    expect(computeSafeBestOfferThresholds(100)).toEqual({ accept: 90, minimum: 67.5 });
  });
  it('keeps the 0.99 and 0.50 floors', () => {
    expect(computeSafeBestOfferThresholds(1)).toEqual({ accept: 0.99, minimum: 0.74 });
    expect(computeSafeBestOfferThresholds(0.5)).toEqual({ accept: 0.99, minimum: 0.74 });
    expect(computeSafeBestOfferThresholds(0.6).minimum).toBeGreaterThanOrEqual(0.5);
  });
});

describe('isBestOfferThresholdError', () => {
  it('matches the Inventory API and Trading API wording', () => {
    expect(isBestOfferThresholdError('The Best Offer Auto Accept price must be less than the Buy It Now price')).toBe(true);
    expect(isBestOfferThresholdError('Auto decline amount must be less than the price')).toBe(true);
    expect(isBestOfferThresholdError('Minimum Best Offer price must be lower')).toBe(true);
    expect(isBestOfferThresholdError('Some other error')).toBe(false);
    expect(isBestOfferThresholdError(undefined)).toBe(false);
  });
});

describe('toBestOfferAmount', () => {
  it('reads numbers, numeric strings, Decimals and eBay Amount objects; rounds to cents', () => {
    expect(toBestOfferAmount(12.345)).toBe(12.35);
    expect(toBestOfferAmount('9.5')).toBe(9.5);
    expect(toBestOfferAmount(decimal('30.00'))).toBe(30);
    expect(toBestOfferAmount({ value: '18.00', currency: 'USD' })).toBe(18);
  });
  it('null, empty, zero, negative and non-numeric mean no threshold', () => {
    for (const v of [null, undefined, '', 0, -1, 'abc', { value: null }, { currency: 'USD' }]) {
      expect(toBestOfferAmount(v)).toBeNull();
    }
  });
});

describe('areBestOfferThresholdsValid', () => {
  it('auto-accept and auto-decline must both be below the price, and decline below accept', () => {
    expect(areBestOfferThresholdsValid(25, 20, 15)).toBe(true);
    expect(areBestOfferThresholdsValid(25, null, null)).toBe(true);
    expect(areBestOfferThresholdsValid(25, 25, 15)).toBe(false); // accept equal to price
    expect(areBestOfferThresholdsValid(25, 30, 15)).toBe(false); // accept above price
    expect(areBestOfferThresholdsValid(25, null, 25)).toBe(false); // decline equal to price
    expect(areBestOfferThresholdsValid(25, 20, 20)).toBe(false); // decline equal to accept
    expect(areBestOfferThresholdsValid(25, 20, 22)).toBe(false); // decline above accept
  });
});

describe('resolveBestOfferThresholds', () => {
  it('valid stored amounts are sent unchanged, including a single one', () => {
    expect(resolveBestOfferThresholds(25, 20, 15)).toEqual({ accept: 20, minimum: 15, adjusted: false });
    expect(resolveBestOfferThresholds(25, 20, null)).toEqual({ accept: 20, minimum: null, adjusted: false });
    expect(resolveBestOfferThresholds(25, null, 10)).toEqual({ accept: null, minimum: 10, adjusted: false });
  });
  it('no stored amounts means none sent and nothing adjusted', () => {
    expect(resolveBestOfferThresholds(25, null, null)).toEqual({ accept: null, minimum: null, adjusted: false });
    expect(resolveBestOfferThresholds(25, 0, 0)).toEqual({ accept: null, minimum: null, adjusted: false });
  });
  it('a marked-down price below the stored auto-accept replaces BOTH with the repair pair', () => {
    expect(resolveBestOfferThresholds(25, decimal('30'), decimal('20'))).toEqual({ accept: 22.5, minimum: 16.88, adjusted: true });
  });
  it('auto-accept equal to the price is invalid too', () => {
    expect(resolveBestOfferThresholds(25, 25, null)).toEqual({ accept: 22.5, minimum: 16.88, adjusted: true });
  });
  it('a valid accept with an invalid decline still replaces both (same as the repair)', () => {
    expect(resolveBestOfferThresholds(25, 20, 26)).toEqual({ accept: 22.5, minimum: 16.88, adjusted: true });
  });
  it('a decline-only amount at or above the price gets the repair pair', () => {
    expect(resolveBestOfferThresholds(10, null, 12)).toEqual({ accept: 9, minimum: 6.75, adjusted: true });
  });
  it('when even the repair pair is invalid (price at the 0.99 floor) no thresholds are sent', () => {
    expect(resolveBestOfferThresholds(0.99, 5, 3)).toEqual({ accept: null, minimum: null, adjusted: true });
  });
  it('cent rounding cannot sneak an amount up to the price', () => {
    expect(resolveBestOfferThresholds(25, 24.996, null).adjusted).toBe(true);
  });
});

describe('buildBestOfferTerms (offer create/update payload)', () => {
  it('sends stored thresholds as-is when valid', () => {
    expect(buildBestOfferTerms(25, decimal('20'), decimal('15'))).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '20.00', currency: 'USD' },
      autoDeclinePrice: { value: '15.00', currency: 'USD' },
    });
  });
  it('never sends a threshold at or above the price', () => {
    const terms = buildBestOfferTerms(25, decimal('30'), decimal('28'));
    expect(terms).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '22.50', currency: 'USD' },
      autoDeclinePrice: { value: '16.88', currency: 'USD' },
    });
  });
  it('Best Offer stays on with no thresholds when none are stored or none can be valid', () => {
    expect(buildBestOfferTerms(25, null, null)).toEqual({ bestOfferEnabled: true });
    expect(buildBestOfferTerms(0.99, 5, 3)).toEqual({ bestOfferEnabled: true });
  });
  it('property: for any price >= 0.99 and any stored amounts, the result is valid for that price', () => {
    const prices = [0.99, 1, 1.1, 1.25, 2, 4.99, 9.99, 25, 99.99, 1234.56];
    const stored = [null, 0.5, 1, 5, 9.99, 25, 30, 1000];
    for (const p of prices) {
      for (const a of stored) {
        for (const m of stored) {
          const t = buildBestOfferTerms(p, a, m);
          const accept = t.autoAcceptPrice ? Number(t.autoAcceptPrice.value) : null;
          const minimum = t.autoDeclinePrice ? Number(t.autoDeclinePrice.value) : null;
          expect(areBestOfferThresholdsValid(p, accept, minimum)).toBe(true);
        }
      }
    }
  });
});

describe('sanitizeOfferBestOfferTerms (GET-then-PUT echo paths)', () => {
  it('leaves an offer with no bestOfferTerms or with valid thresholds untouched', () => {
    const none: Record<string, unknown> = { sku: 'x' };
    expect(sanitizeOfferBestOfferTerms(none, 25)).toBe(false);
    expect(none).toEqual({ sku: 'x' });
    const ok: Record<string, unknown> = {
      bestOfferTerms: { bestOfferEnabled: true, autoAcceptPrice: { value: '20.00', currency: 'USD' } },
    };
    const before = JSON.stringify(ok);
    expect(sanitizeOfferBestOfferTerms(ok, 25)).toBe(false);
    expect(JSON.stringify(ok)).toBe(before);
  });
  it('replaces invalid echoed thresholds and keeps the other bestOfferTerms fields', () => {
    const original = {
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '30.00', currency: 'USD' },
      autoDeclinePrice: { value: '26.00', currency: 'USD' },
    };
    const offer: Record<string, unknown> = { bestOfferTerms: original };
    expect(sanitizeOfferBestOfferTerms(offer, 25)).toBe(true);
    expect(offer.bestOfferTerms).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '22.50', currency: 'USD' },
      autoDeclinePrice: { value: '16.88', currency: 'USD' },
    });
    // The object eBay returned (and any reference to it) is not mutated.
    expect(original.autoAcceptPrice.value).toBe('30.00');
  });
  it('drops the thresholds when no valid pair exists at that price', () => {
    const offer: Record<string, unknown> = {
      bestOfferTerms: { bestOfferEnabled: true, autoAcceptPrice: { value: '5.00', currency: 'USD' } },
    };
    expect(sanitizeOfferBestOfferTerms(offer, 0.99)).toBe(true);
    expect(offer.bestOfferTerms).toEqual({ bestOfferEnabled: true });
  });
});

describe('source guard: every eBay best-offer payload goes through the shared rules', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  it('ebayController builds bestOfferTerms with buildBestOfferTerms, never from the raw stored amounts', () => {
    const src = read('controllers/ebayController.ts');
    expect(src).toContain('bestOfferTerms: buildBestOfferTerms(price, item.bestOfferAutoAcceptAmt, item.bestOfferMinimumAmt)');
    expect(src).not.toMatch(/autoAcceptPrice:\s*\{\s*value:\s*Number\(item\.bestOfferAutoAcceptAmt\)/);
    expect(src).not.toMatch(/autoDeclinePrice:\s*\{\s*value:\s*Number\(item\.bestOfferMinimumAmt\)/);
  });
  it('the price-revision service uses the shared repair helpers (no private copy)', () => {
    const src = read('services/ebayPriceRevisionService.ts');
    expect(src).toContain("from '../utils/ebayBestOfferThresholds'");
    expect(src).not.toMatch(/function computeSafeBestOfferThresholds/);
    expect(src).not.toMatch(/function isBestOfferThresholdError/);
    expect(src).toContain('sanitizeOfferBestOfferTerms(offer, safeNewPrice)');
  });
  it('the item push service sanitizes the echoed offer before its price PUT', () => {
    expect(read('services/ebayItemPushService.ts')).toContain('sanitizeOfferBestOfferTerms(offerObject, Number(item.price))');
  });
});
