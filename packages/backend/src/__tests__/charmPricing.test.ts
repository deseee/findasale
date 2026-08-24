import { applyCharmPricing, applyCharmPricingCents } from '../utils/charmPricing';

describe('applyCharmPricing', () => {
  it('rounds a whole dollar down to the prior .99', () => {
    expect(applyCharmPricing(10.0)).toBe(9.99);
  });

  it('rounds a half dollar down to the matching .49', () => {
    expect(applyCharmPricing(12.5)).toBe(12.49);
  });

  it('rounds a non-half-dollar amount to the nearest charm price', () => {
    expect(applyCharmPricing(12.75)).toBe(12.99); // nearest half is 13.00, then -0.01
    expect(applyCharmPricing(12.2)).toBe(11.99); // nearest half is 12.00, then -0.01
  });

  it('leaves an already-charm-priced value unchanged', () => {
    expect(applyCharmPricing(9.99)).toBe(9.99);
    expect(applyCharmPricing(0.99)).toBe(0.99);
  });

  it('floors very low or invalid amounts at $0.49', () => {
    expect(applyCharmPricing(0.2)).toBe(0.49);
    expect(applyCharmPricing(0)).toBe(0.49);
    expect(applyCharmPricing(NaN)).toBe(0.49);
  });

  it('never returns a whole-dollar or half-dollar ending', () => {
    for (const raw of [1, 5, 10, 15, 20, 24.5, 99, 100.5]) {
      const result = applyCharmPricing(raw);
      const cents = Math.round(result * 100) % 100;
      expect(cents === 49 || cents === 99).toBe(true);
    }
  });
});

describe('applyCharmPricingCents', () => {
  it('mirrors applyCharmPricing but in cents', () => {
    expect(applyCharmPricingCents(1000)).toBe(999); // $10.00 -> $9.99
    expect(applyCharmPricingCents(1250)).toBe(1249); // $12.50 -> $12.49
  });

  it('floors low cent amounts at 49', () => {
    expect(applyCharmPricingCents(50)).toBe(49);
    expect(applyCharmPricingCents(0)).toBe(49);
  });
});
