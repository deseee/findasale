/** Mercari charges 10% + a flat $0.84, so new listings under $3 stay off it; existing listings are untouched. */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility } from '../marketplaceEligibilityRules';

const m = (price: number, forNewListing: boolean) =>
  checkEligibility('MERCARI', { category: null, ebayCategoryId: null, price, forNewListing });

describe('MERCARI minimum price (new listings only)', () => {
  it('blocks a new $1, $2.49, $2.50 and $2.99 listing, allows exactly $3 and up (no rounding, 2026-10-23)', () => {
    expect(m(1, true).eligible).toBe(false);
    expect(m(2.49, true).eligible).toBe(false);
    expect(m(2.5, true).eligible).toBe(false); // used to round up to 3 and pass
    expect(m(2.99, true).eligible).toBe(false);
    expect(m(3, true).eligible).toBe(true);
    expect(m(3.01, true).eligible).toBe(true);
  });
  it('never takes down an existing listing', () => {
    expect(m(1, false).eligible).toBe(true);
  });
});
