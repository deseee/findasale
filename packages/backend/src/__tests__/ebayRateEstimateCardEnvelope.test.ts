/**
 * ADR-134 D5: the three pinned card leaf categories qualify for eBay Standard Envelope
 * (eBay help page read 2026-10-04: trading cards and collectible card games, $20 cap, 3 oz cap).
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { estimateCheapestRate } from '../services/ebayRateEstimateService';

const base = { weightOz: 1, zone: 'z5' as const, dims: { length: 6, width: 4, height: 0.2 } as any };

describe('card categories and Standard Envelope', () => {
  it.each(['183454', '183050', '261328'])('category %s at $5 and 1 oz picks the Standard Envelope', (categoryId) => {
    const r = estimateCheapestRate({ ...base, categoryId, priceUsd: 5 });
    expect(r.basis).toBe('standard_envelope');
  });

  it('a card at $25 is over the $20 cap and does not use the envelope', () => {
    const r = estimateCheapestRate({ ...base, categoryId: '183454', priceUsd: 25 });
    expect(r.basis).not.toBe('standard_envelope');
  });

  it('a card over 3 oz (a graded slab) does not use the envelope', () => {
    const r = estimateCheapestRate({ ...base, weightOz: 6, categoryId: '183050', priceUsd: 15 });
    expect(r.basis).not.toBe('standard_envelope');
  });

  it('an unrelated category id still fails closed', () => {
    const r = estimateCheapestRate({ ...base, categoryId: '99999999', priceUsd: 5 });
    expect(r.basis).not.toBe('standard_envelope');
  });
});
