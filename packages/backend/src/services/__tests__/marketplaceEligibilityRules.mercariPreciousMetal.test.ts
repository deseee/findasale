/**
 * Mercari precious metals (2026-10-23). Mercari's Prohibited Items page bans "precious metals, including gold, silver, and
 * platinum sold in any medium" (bars, coins, rounds, scrap). Bare 'gold'/'silver' used to block ordinary goods
 * ("Ornate Gold Leaf Picture Frame"); only bullion contexts are blocked now. Synthetic titles only.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility } from '../marketplaceEligibilityRules';

const merc = (title: string, category: string | null = null) => checkEligibility('MERCARI', { category, ebayCategoryId: null, title });

describe('MERCARI precious metals: bullion contexts only', () => {
  it.each([
    'Ornate Gold Leaf Picture Frame',
    'Silver Plated Serving Tray',
    'Gold Tone Wall Mirror',
    'Vintage Silverware Set Service for 8',
    '14k Gold Ring Size 7',
    'Sterling Silver Charm Bracelet',
    'Gold Coin Pendant Necklace',
    'Chocolate Gold Coins Party Favors',
    'Gold Bar Stool Set of 2',
    'Silver Bar Cart on Wheels',
    'Coin Holder Album for Silver Coins',
    'Golden Retriever Figurine',
    'Silver Fox Faux Fur Throw',
  ])('allows %s', (title) => {
    expect(merc(title, 'Home & Garden').eligible).toBe(true);
  });

  it.each([
    '1 oz .999 Fine Silver Round',
    '10 Troy Ounce Silver Bar',
    '1 Gram Gold Bar PAMP Suisse',
    '2021 American Silver Eagle 1 oz Silver Coin',
    'Krugerrand 1 oz',
    'Scrap Gold Lot 14k 12 grams',
    'Sterling Scrap 50 grams',
    'Gold Nugget 2.1 grams',
    'Junk Silver Bullion Lot',
  ])('blocks %s', (title) => {
    const r = merc(title, 'Collectibles');
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/precious metals/i);
  });

  it('blocks by the eBay bullion category leaf even with a plain title', () => {
    expect(merc('1 oz round', 'Bars & Rounds').eligible).toBe(false);
  });

  it('other Mercari bans still apply (loose gemstones, weapons)', () => {
    expect(merc('Loose Diamond 0.5 ct').eligible).toBe(false);
    expect(merc('Hunting Knife').eligible).toBe(false);
  });
});
