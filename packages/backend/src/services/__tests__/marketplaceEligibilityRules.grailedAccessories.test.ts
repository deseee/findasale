/**
 * 2026-10-29: Grailed is menswear/fashion only. "Accessories" alone matched the allowlist, so a video game
 * (cmu5sk3ck005trd9brmzusqld, "Samurai Shodown, SNK Arcade Game Cartridge with Box & Accessories NEGEO MVS") came out
 * ELIGIBLE. The word now counts only with fashion context and never with electronics/gaming/vehicle/instrument context.
 */
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import { checkEligibility } from '../marketplaceEligibilityRules';

const grailed = (title: string, category: string | null) =>
  checkEligibility('GRAILED', { category, ebayCategoryId: null, title }).eligible;

describe('GRAILED: generic "accessories" needs fashion context', () => {
  it.each([
    ['Samurai Shodown, SNK Arcade Game Cartridge with Box & Accessories NEGEO MVS', 'Replacement Parts'],
    ['Samurai Shodown, SNK Arcade Game Cartridge with Box & Accessories NEGEO MVS', 'Video Games & Consoles'],
    ['Jim Dunlop Pick Holder, Series 5005', 'Other Guitar & Bass Accessories'],
    ['Ornate Gold Leaf Picture Frame with Accessories Print, Handcrafted', 'Frames'],
    ['Apple Lightning cable', 'Cell Phones & Accessories'],
    ['Mouse pad and USB hub', 'Computer Accessories'],
    ['Floor mats set', 'Car & Truck Accessories'],
    ['Xbox controller charging dock', 'Video Game Accessories'],
    ['Assorted accessories lot', null],
  ])('ineligible: %s (%s)', (title, category) => {
    expect(grailed(title, category)).toBe(false);
  });

  it.each([
    ['Silk pocket square', "Men's Accessories"],
    ['Hermes silk pocket square', 'Fashion Accessories'],
    ['Leather card case', "Women's Accessories"],
    ['Claw clip set', 'Hair Accessories'],
    ['Nike Air Max 90', 'Sneakers'],
    ['Leather belt, brown', 'Belts'],
    ['Gold chain necklace', 'Jewelry'],
    // a real fashion keyword still wins on its own, even next to a gaming word
    ['Nintendo logo baseball hat', 'Hats'],
  ])('eligible: %s (%s)', (title, category) => {
    expect(grailed(title, category)).toBe(true);
  });
});
