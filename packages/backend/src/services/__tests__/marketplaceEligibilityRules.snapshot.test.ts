/**
 * ADR-135 batch E-B2, acceptance 2: existing behavior unchanged.
 *
 * Written FIRST, from the UNMODIFIED marketplaceEligibilityRules.ts (before the Etsy
 * ATTRIBUTE_AGE_ALLOWLIST edit): every expected value below was captured by running the original
 * file's checkEligibility against these inputs, then frozen here. If an existing platform's result
 * ever changes, this test fails. Covers FACEBOOK, REVERB and GRAILED (the three the ADR names) plus
 * POSHMARK, MERCARI, CRAIGSLIST, GUMTREE_AU and VINTED as extra guard rails.
 */

// marketplaceEligibilityRules imports ebayRateEstimateService, which imports the prisma client.
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility, EligibilityPlatform } from '../marketplaceEligibilityRules';

const FB_REASON = 'Facebook Marketplace does not allow listing coins or currency (Commerce Policy).';
const REVERB_REASON = 'Reverb is for musical instruments & gear only (Listing Guidelines: Prohibited Items and Actions).';
const GRAILED_REASON = 'Grailed is a fashion/streetwear-only marketplace -- this item’s category doesn’t look like apparel, footwear, or accessories.';
const POSHMARK_REASON = 'Over Poshmark\'s 15lb shipping limit -- Poshmark\'s Community Guidelines prohibit arranging local pickup/meetups in place of shipping, so this is a dead end there, not just a bad fit.';
const MERCARI_REASON = 'Over Mercari\'s 50lb / 34"x20" shipping ceiling -- beyond this Mercari requires shipping outside its own label flow, which this extension can\'t drive.';
const VINTED_REASON = 'This category isn’t allowed on Vinted (Items Not Allowed policy).';

interface SnapshotCase {
  platform: EligibilityPlatform;
  name: string;
  input: any;
  eligible: boolean;
  reason: string | null;
}

const CASES: SnapshotCase[] = [
  { platform: 'FACEBOOK', name: 'coin category text', input: { category: 'Coins & Paper Money', ebayCategoryId: null, title: '1921 Morgan Silver Dollar' }, eligible: false, reason: FB_REASON },
  { platform: 'FACEBOOK', name: 'coin ebay root id', input: { category: 'Collectibles', ebayCategoryId: '11116', title: 'Old thing' }, eligible: false, reason: FB_REASON },
  { platform: 'FACEBOOK', name: 'coin accessory carve-out', input: { category: 'Coins & Paper Money', ebayCategoryId: null, title: 'BCW Quarter Coin Tubes, Each, Crystal Clear Storage' }, eligible: true, reason: null },
  { platform: 'FACEBOOK', name: 'bullion', input: { category: 'Collectibles', ebayCategoryId: null, title: '10 troy ounce silver bar' }, eligible: false, reason: FB_REASON },
  { platform: 'FACEBOOK', name: 'plain furniture', input: { category: 'Furniture', ebayCategoryId: null, title: 'Oak side table' }, eligible: true, reason: null },
  { platform: 'FACEBOOK', name: 'missing data', input: { category: null, ebayCategoryId: null }, eligible: true, reason: null },
  { platform: 'REVERB', name: 'instrument ok', input: { category: 'Musical Instruments & Gear', ebayCategoryId: null, title: 'Fender Stratocaster' }, eligible: true, reason: null },
  { platform: 'REVERB', name: 'not an instrument', input: { category: 'Furniture', ebayCategoryId: null, title: 'Oak side table' }, eligible: false, reason: REVERB_REASON },
  { platform: 'REVERB', name: 'missing data', input: { category: null, ebayCategoryId: null }, eligible: false, reason: REVERB_REASON },
  { platform: 'GRAILED', name: 'sneakers ok', input: { category: 'Sneakers', ebayCategoryId: null, title: 'Nike Air Max' }, eligible: true, reason: null },
  { platform: 'GRAILED', name: 'tracksuit ok', input: { category: 'Tracksuits & Sets', ebayCategoryId: null, title: 'Adidas Tracksuit' }, eligible: true, reason: null },
  { platform: 'GRAILED', name: 'furniture blocked', input: { category: 'Furniture', ebayCategoryId: null, title: 'Oak side table' }, eligible: false, reason: GRAILED_REASON },
  { platform: 'GRAILED', name: 'clothing rack excluded', input: { category: 'Clothing Racks', ebayCategoryId: null, title: 'H-Rack Grid Hanger Brackets' }, eligible: false, reason: GRAILED_REASON },
  { platform: 'GRAILED', name: 'steel is not tee', input: { category: 'Golf', ebayCategoryId: null, title: 'Stainless Steel Club Set' }, eligible: false, reason: GRAILED_REASON },
  { platform: 'GRAILED', name: 'missing data', input: { category: null, ebayCategoryId: null }, eligible: false, reason: GRAILED_REASON },
  { platform: 'POSHMARK', name: 'overweight', input: { category: 'Home & Garden', ebayCategoryId: null, title: 'Anvil', packageWeightOz: 300 }, eligible: false, reason: POSHMARK_REASON },
  { platform: 'MERCARI', name: 'longest side too long', input: { category: 'Home & Garden', ebayCategoryId: null, title: 'Ladder', packageLengthIn: 40 }, eligible: false, reason: MERCARI_REASON },
  { platform: 'MERCARI', name: 'within limits', input: { category: 'Home & Garden', ebayCategoryId: null, title: 'Lamp', packageWeightOz: 100, packageLengthIn: 10 }, eligible: true, reason: null },
  { platform: 'CRAIGSLIST', name: 'no rules', input: { category: 'Coins & Paper Money', ebayCategoryId: null, title: 'Gold coin' }, eligible: true, reason: null },
  { platform: 'GUMTREE_AU', name: 'no rules', input: { category: 'Furniture', ebayCategoryId: null, title: 'Chair' }, eligible: true, reason: null },
  { platform: 'VINTED', name: 'plain furniture', input: { category: 'Furniture', ebayCategoryId: null, title: 'Chair' }, eligible: false, reason: VINTED_REASON },
];

describe('marketplaceEligibilityRules existing-platform snapshot (unchanged by the Etsy rule)', () => {
  it('has at least 6 FACEBOOK, REVERB and GRAILED cases', () => {
    const n = CASES.filter((c) => ['FACEBOOK', 'REVERB', 'GRAILED'].includes(c.platform)).length;
    expect(n).toBeGreaterThanOrEqual(6);
  });

  for (const c of CASES) {
    it(`${c.platform} / ${c.name} returns the pre-edit result`, () => {
      expect(checkEligibility(c.platform, c.input)).toEqual({ eligible: c.eligible, reason: c.reason });
    });
  }
});
