/**
 * 2026-10-27 (Patrick: "take them off Poshmark and do the pull when marked pickup"). An item marked local pickup only
 * (Item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') is ineligible on every marketplace that only sells with shipping
 * (Poshmark, Mercari, Vinted, Grailed, and since 2026-10-29 Etsy), for new listings and for the takedown sweep alike, and stays eligible on the
 * marketplaces that support pickup (Facebook, Craigslist, Gumtree AU, Reverb).
 */

// marketplaceEligibilityRules imports ebayRateEstimateService, which imports the prisma client.
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import {
  checkEligibility,
  buildListingEligibilityItem,
  PICKUP_INCOMPATIBLE_PLATFORMS,
  pickupOnlyEligibilityReason,
  isPickupOnlyBlocked,
  EligibilityPlatform,
} from '../marketplaceEligibilityRules';
import { PICKUP_INCOMPATIBLE_AUTO_QUEUE_PLATFORMS, AUTO_QUEUE_PLATFORMS, isPickupOnlyBlockedForAutoQueue } from '../autoQueueSettings';
import { computeChannelStatusForItems } from '../itemChannelStatusService';

// A small, light, cheap-enough item that every shipping-only marketplace would otherwise accept (Grailed needs fashion).
const base = { category: 'Sneakers', ebayCategoryId: null, title: 'Nike Air Max 90', packageWeightOz: 40, packageLengthIn: 14, packageWidthIn: 10, packageHeightIn: 6, price: 40 };
const pickup = { ...base, ebayShippingOverride: 'LOCAL_PICKUP_ONLY' };

describe('pickup-only eligibility', () => {
  it('lists exactly the shipping-only marketplaces', () => {
    expect([...PICKUP_INCOMPATIBLE_PLATFORMS].sort()).toEqual(['ETSY', 'GRAILED', 'MERCARI', 'POSHMARK', 'VINTED']);
  });

  it('ETSY: pickup-only is ineligible even for an item old enough for Etsy, new listing and takedown', () => {
    const vintage = { category: null, ebayCategoryId: null, etsyWhenMade: '1970s', asOfYear: 2026 };
    expect(checkEligibility('ETSY', vintage).eligible).toBe(true); // control: fine when it ships
    for (const forNewListing of [true, false]) {
      const r = checkEligibility('ETSY', { ...vintage, ebayShippingOverride: 'LOCAL_PICKUP_ONLY', forNewListing });
      expect(r).toEqual({ eligible: false, reason: pickupOnlyEligibilityReason('ETSY') });
    }
    expect(isPickupOnlyBlocked('ETSY', 'LOCAL_PICKUP_ONLY')).toBe(true);
    expect(isPickupOnlyBlocked('ETSY', 'SHIPPABLE')).toBe(false);
  });

  it.each(['POSHMARK', 'MERCARI', 'VINTED', 'GRAILED'] as EligibilityPlatform[])('%s: pickup-only is ineligible, new listing and takedown', (platform) => {
    expect(checkEligibility(platform, base).eligible).toBe(true); // control: the same item is fine when it ships
    for (const forNewListing of [true, false]) {
      const r = checkEligibility(platform, { ...pickup, forNewListing });
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe(pickupOnlyEligibilityReason(platform));
    }
  });

  it('reason text is plain and names the marketplace', () => {
    expect(pickupOnlyEligibilityReason('POSHMARK')).toBe('Marked pickup only, and Poshmark only sells with shipping.');
    expect(pickupOnlyEligibilityReason('MERCARI')).toBe('Marked pickup only, and Mercari only sells with shipping.');
    expect(pickupOnlyEligibilityReason('VINTED')).toBe('Marked pickup only, and Vinted only sells with shipping.');
    expect(pickupOnlyEligibilityReason('GRAILED')).toBe('Marked pickup only, and Grailed only sells with shipping.');
    expect(pickupOnlyEligibilityReason('ETSY')).toBe('Marked pickup only, and Etsy only sells with shipping.');
  });

  it.each(['FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU'] as EligibilityPlatform[])('%s supports pickup: pickup-only stays eligible', (platform) => {
    expect(checkEligibility(platform, pickup)).toEqual({ eligible: true, reason: null });
  });

  it('REVERB supports local pickup: a pickup-only instrument stays eligible', () => {
    const amp = { category: 'Musical Instruments & Gear', ebayCategoryId: null, title: 'Celestion G12 speaker cabinet', ebayShippingOverride: 'LOCAL_PICKUP_ONLY' };
    expect(checkEligibility('REVERB', amp)).toEqual({ eligible: true, reason: null });
  });

  it('other shipping overrides do not trigger the pickup rule', () => {
    for (const o of ['SHIPPABLE', 'DONT_LIST', null, undefined, 'local_pickup_only', '']) {
      expect(checkEligibility('POSHMARK', { ...base, ebayShippingOverride: o as any }).reason).not.toBe(pickupOnlyEligibilityReason('POSHMARK'));
      expect(isPickupOnlyBlocked('POSHMARK', o as any)).toBe(false);
    }
  });

  it('buildListingEligibilityItem threads ebayShippingOverride for both new listings and the takedown sweep', () => {
    const row = { title: 'Brass Table Lamp, Mid-Century Modern', category: 'Lamps', ebayCategoryId: null, ebayShippingOverride: 'LOCAL_PICKUP_ONLY', price: 45 };
    expect(buildListingEligibilityItem(row, { forNewListing: true }).ebayShippingOverride).toBe('LOCAL_PICKUP_ONLY');
    const takedown = buildListingEligibilityItem(row, { forNewListing: false });
    expect(takedown.ebayShippingOverride).toBe('LOCAL_PICKUP_ONLY');
    expect(checkEligibility('POSHMARK', takedown).eligible).toBe(false);
    // Absent override leaves the built object without the key (shape unchanged for every other item).
    expect('ebayShippingOverride' in buildListingEligibilityItem({ title: 'x' }, { forNewListing: false })).toBe(false);
  });

  it('the auto queue pickup list equals the shipping-only list limited to auto queue platforms', () => {
    const expected = PICKUP_INCOMPATIBLE_PLATFORMS.filter((p) => (AUTO_QUEUE_PLATFORMS as readonly string[]).includes(p));
    expect([...PICKUP_INCOMPATIBLE_AUTO_QUEUE_PLATFORMS].sort()).toEqual([...expected].sort());
    expect(isPickupOnlyBlockedForAutoQueue('GRAILED', true)).toBe(true);
    expect(isPickupOnlyBlockedForAutoQueue('CRAIGSLIST', true)).toBe(false);
  });

  it('the Add Items dot flags a live pickup-only Poshmark listing as needing removal', () => {
    const item: any = { id: 'i1', ...pickup, ebayListingId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null };
    const used = { facebook: true, craigslist: false, gumtreeAu: false, grailed: false, poshmark: true, mercari: true, vinted: false };
    const out = computeChannelStatusForItems(
      [item],
      { hasEbayConnection: false, shopifyEnabled: false, subscriptionTier: 'PRO', hasActiveDiscogsAccount: false, hasActiveReverbAccount: false },
      used,
      new Map([['i1', new Set(['POSHMARK', 'FACEBOOK'] as const)]]) as any,
    )['i1'];
    expect(out.poshmark).toBe('PUBLISHED_INELIGIBLE');
    expect(out.facebook).toBe('PUBLISHED');
    expect(out.mercari).toBeNull(); // not live there and not eligible for a new listing
  });

  it('the Add Items dot flags a live pickup-only Etsy listing as needing removal, and shows no dot otherwise', () => {
    const org = { hasEbayConnection: false, shopifyEnabled: false, subscriptionTier: 'PRO', hasActiveDiscogsAccount: false, hasActiveReverbAccount: false, hasActiveEtsyAccount: true };
    const used = { facebook: false, craigslist: false, gumtreeAu: false, grailed: false, poshmark: false, mercari: false, vinted: false };
    const vintage = { id: 'e1', category: null, ebayCategoryId: null, etsyWhenMade: '1970s', ebayListingId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null };
    const live: any = { ...vintage, etsyListingState: 'ACTIVE', ebayShippingOverride: 'LOCAL_PICKUP_ONLY' };
    expect(computeChannelStatusForItems([live], org as any, used, new Map() as any)['e1'].etsy).toBe('PUBLISHED_INELIGIBLE');
    const notListed: any = { ...vintage, ebayShippingOverride: 'LOCAL_PICKUP_ONLY' };
    expect(computeChannelStatusForItems([notListed], org as any, used, new Map() as any)['e1'].etsy).toBeNull();
    const ships: any = { ...vintage };
    expect(computeChannelStatusForItems([ships], org as any, used, new Map() as any)['e1'].etsy).toBe('ELIGIBLE');
  });
});
