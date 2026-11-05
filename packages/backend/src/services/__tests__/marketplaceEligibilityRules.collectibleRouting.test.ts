/**
 * 2026-11-05 collectible routing (intake audit: MVS carts, comics, game manuals and records were going to Poshmark/Vinted
 * where they do not sell). Collectible families are not suggested for NEW Poshmark/Vinted listings; live listings are never
 * pulled (the takedown sweep does not set forNewListing); eBay, Mercari, Facebook and Craigslist are unchanged; Poshmark's
 * electronics allowance (2026-10-17), $5 minimum (2026-10-19) and pickup-only rule (2026-10-27) still hold.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility, buildListingEligibilityItem, COLLECTIBLE_ROUTING_FAMILIES, pickupOnlyEligibilityReason } from '../marketplaceEligibilityRules';

const pkg = { packageWeightOz: 12, packageLengthIn: 12, packageWidthIn: 12, packageHeightIn: 2, price: 25 };
const newListing = (it: Record<string, unknown>) => buildListingEligibilityItem({ ...pkg, ebayCategoryId: null, ...it } as any, { forNewListing: true });
const liveCheck = (it: Record<string, unknown>) => buildListingEligibilityItem({ ...pkg, ebayCategoryId: null, ...it } as any, { forNewListing: false });

const COLLECTIBLES = [
  { category: 'Video Games & Consoles', title: 'Samurai Shodown SNK Neo Geo MVS Cart' },
  { category: 'Collectibles', title: 'Amazing Spider-Man #129 Comic Book' },
  { category: 'Music', title: 'Fleetwood Mac Rumours Vinyl LP Record' },
  { category: 'Toys & Hobbies', title: 'Charizard Pokemon Card 4/102' },
  { category: 'Video Games & Consoles', title: 'Super Mario World Instruction Manual' },
];

describe('collectible routing (new listings only)', () => {
  it('covers records, cards, coins, comics and video games', () => {
    expect([...COLLECTIBLE_ROUTING_FAMILIES].sort()).toEqual(['COIN_CURRENCY', 'COMIC', 'TRADING_CARD', 'VIDEO_GAME', 'VINYL_RECORD']);
  });

  it.each(COLLECTIBLES)('$title is not suggested for new Poshmark or Vinted listings', (item) => {
    for (const platform of ['POSHMARK', 'VINTED'] as const) {
      const r = checkEligibility(platform, newListing(item));
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/sell on eBay/);
      expect(r.reason).not.toMatch(/\u2014|\bAI\b/);
    }
  });

  it.each(COLLECTIBLES)('$title stays eligible on Mercari, Facebook and Craigslist', (item) => {
    expect(checkEligibility('MERCARI', newListing(item)).eligible).toBe(true);
    expect(checkEligibility('FACEBOOK', newListing(item)).eligible).toBe(true);
    expect(checkEligibility('CRAIGSLIST', newListing(item)).eligible).toBe(true);
  });

  it.each(COLLECTIBLES)('$title live listing is never flagged for takedown by this rule', (item) => {
    expect(checkEligibility('POSHMARK', liveCheck(item)).eligible).toBe(true);
    expect(checkEligibility('VINTED', liveCheck(item)).eligible).toBe(true);
  });

  it('keeps Poshmark electronics (cameras, consoles) eligible', () => {
    expect(checkEligibility('POSHMARK', newListing({ category: 'Cameras & Photo', title: 'Canon AE-1 Film Camera' })).eligible).toBe(true);
    expect(checkEligibility('POSHMARK', newListing({ category: 'Video Games & Consoles', title: 'Nintendo 64 Console with Controller' })).eligible).toBe(true);
  });

  it('keeps fashion and home goods eligible on Poshmark and Vinted', () => {
    const jacket = { category: 'Clothing, Shoes & Accessories', title: 'Patagonia Down Jacket' };
    expect(checkEligibility('POSHMARK', newListing(jacket)).eligible).toBe(true);
    expect(checkEligibility('VINTED', newListing(jacket)).eligible).toBe(true);
  });

  it('existing rules still win: Poshmark $5 minimum and pickup-only', () => {
    const cheapJacket = { category: 'Clothing, Shoes & Accessories', title: 'Old Navy Jacket', price: 4 };
    expect(checkEligibility('POSHMARK', newListing(cheapJacket)).eligible).toBe(false);
    const pickup = newListing({ category: 'Clothing, Shoes & Accessories', title: 'Patagonia Jacket', ebayShippingOverride: 'LOCAL_PICKUP_ONLY' });
    expect(checkEligibility('POSHMARK', pickup)).toEqual({ eligible: false, reason: pickupOnlyEligibilityReason('POSHMARK') });
  });
});
