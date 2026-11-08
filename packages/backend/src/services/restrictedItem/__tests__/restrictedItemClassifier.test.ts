/**
 * Restricted-item classifier (2026-11-06). Deterministic keyword + category rules. Synthetic titles only.
 */
import {
  applyAutoRatchet,
  classifyRestrictedItem,
  effectiveRestrictedClass,
  RESTRICTED_CLASSIFIER_VERSION,
  stripExclusions,
  normalizeForRestrictedMatch,
} from '../restrictedItemClassifier';

const cls = (title: string, extra: Partial<Parameters<typeof classifyRestrictedItem>[0]> = {}) =>
  classifyRestrictedItem({ title, ...extra }).restrictedClass;

describe('restricted classifier: positives', () => {
  it.each([
    ['Vintage Cavalry Sword with Scabbard', 'WEAPON'],
    ['WWII Bayonet', 'WEAPON'],
    ['Brass Knuckles Paperweight', 'WEAPON'],
    ['Pepper Spray Keychain', 'WEAPON'],
    ['Taser Pulse', 'WEAPON'],
    ['Compound Bow 70 lb', 'WEAPON'],
    ['Nunchaku Training Set', 'WEAPON'],
    ['Ruger 10/22 Rifle Stock', 'FIREARM_RELATED'],
    ['Leather Pistol Holster', 'FIREARM_RELATED'],
    ['Box of 9mm Ammo', 'FIREARM_RELATED'],
    ['AR-15 Magazine 30 rd', 'FIREARM_RELATED'],
    ['Daisy Red Ryder BB Gun', 'FIREARM_RELATED'],
    ['Antique Flintlock Musket', 'FIREARM_RELATED'],
    ['Gun Safe 24 Gun', 'FIREARM_RELATED'],
    ['Airsoft Pistol Kit', 'FIREARM_RELATED'],
    ['Case XX Pocket Knife', 'KNIFE'],
    ['Bowie Knife with Sheath', 'KNIFE'],
    ['Machete 18 inch', 'KNIFE'],
    ['Chef Knife 8"', 'KNIFE'],
    ['Wusthof Paring Knives (3)', 'KNIFE'],
    ['Swiss Army Knife', 'KNIFE'],
    ['Meat Cleaver', 'KNIFE'],
    ['1 oz .999 Fine Silver Round', 'COIN_BULLION_PRECIOUS_METAL'],
    ['1921 Morgan Silver Dollar', 'COIN_BULLION_PRECIOUS_METAL'],
    ['Krugerrand 1 oz', 'COIN_BULLION_PRECIOUS_METAL'],
    ['Wheat Pennies Lot of 50', 'COIN_BULLION_PRECIOUS_METAL'],
    ['Junk Silver Lot', 'COIN_BULLION_PRECIOUS_METAL'],
    ['Old Foreign Coins Lot', 'COIN_BULLION_PRECIOUS_METAL'],
    ['1957 Silver Certificate $1', 'COIN_BULLION_PRECIOUS_METAL'],
    ['Scrap Gold 14k 12 grams', 'COIN_BULLION_PRECIOUS_METAL'],
    ['14k Gold Ring Size 7', 'JEWELRY'],
    ['Sterling Silver Charm Bracelet', 'JEWELRY'],
    ['Costume Jewelry Lot', 'JEWELRY'],
    ['Vintage Rhinestone Brooch', 'JEWELRY'],
    ['Pearl Necklace and Earrings', 'JEWELRY'],
    ['Diamond Engagement Ring 1 cttw', 'JEWELRY'],
    ['Mens Cufflinks', 'JEWELRY'],
    ['Gold Coin Pendant Necklace', 'COIN_BULLION_PRECIOUS_METAL'],
  ] as const)('%s -> %s', (title, expected) => {
    expect(cls(title)).toBe(expected);
  });
});

describe('restricted classifier: negatives and exclusions', () => {
  it.each([
    'Hot Glue Gun',
    'Ryobi 18V Nail Gun',
    'Arrow T50 Staple Gun',
    'Caulk Gun Heavy Duty',
    'Heat Gun for Paint Removal',
    'Theragun Massage Gun',
    'Super Soaker Water Gun',
    'Nerf Blaster Lot',
    'Gunmetal Grey Throw Pillow',
    'Gun Metal Finish Lamp',
    'Coin Purse Leather',
    'Ceramic Piggy Coin Bank',
    'Coin Holder Album',
    'Chocolate Coins Party Favors',
    'Coin Operated Arcade Machine',
    'CR2032 Coin Cell Battery',
    'Ring Light 18 inch',
    'Key Ring Set',
    'Napkin Rings Set of 8',
    'Ring Video Doorbell',
    'Lord of the Rings DVD Set',
    'Butter Knife Set',
    'Silverware Set Service for 8',
    'Sterling Silver Flatware',
    'Palette Knife Set for Painting',
    'Putty Knife 3 inch',
    'Knife Sharpener',
    'Wiper Blades 22"',
    'Bladerunner Inline Skates',
    'Rollerblade Skates',
    'Circular Saw Blade',
    'Jewelry Box with Mirror',
    'Jewelry Organizer Hanging',
    'Pendant Light Fixture',
    'Diamond Plate Toolbox',
    'Diamond Painting Kit',
    'Stiletto Heels Size 8',
    'Twirling Baton',
    'Ink Cartridge HP 64',
    'Ornate Gold Leaf Picture Frame',
    'Silver Plated Serving Tray',
    'Golden Retriever Figurine',
    'Bar Stool Set of 2',
    'Toaster',
    '',
  ])('%s -> NONE', (title) => {
    expect(cls(title)).toBe('NONE');
  });

  it('an exclusion is stripped, not a veto: other weapon words in the same title still match', () => {
    expect(cls('Glue Gun and Pistol Holster')).toBe('FIREARM_RELATED');
    expect(cls('Butter Knife Set plus Hunting Knife')).toBe('KNIFE');
    expect(cls('Coin Purse with Silver Dollar inside')).toBe('COIN_BULLION_PRECIOUS_METAL');
    expect(cls('Key Ring and 14k Gold Ring')).toBe('JEWELRY');
  });

  it('a steak knife set is KNIFE even when the silverware word is present', () => {
    expect(cls('Silverware Set with Steak Knives')).toBe('KNIFE');
  });

  it('whole words only', () => {
    expect(cls('Shotgun Wedding Card Game')).toBe('FIREARM_RELATED'); // deliberate: "shotgun" always matches
    expect(cls('Gunther Bear Plush')).toBe('NONE');
    expect(cls('Springtime Wreath')).toBe('NONE');
    expect(cls('Boxing Gloves')).toBe('NONE');
    expect(cls('Coincidence Novel')).toBe('NONE');
    expect(cls('Sabertooth Tiger Model')).toBe('NONE');
  });
});

describe('restricted classifier: fields', () => {
  it('reads tags, brand, category and ebayCategoryName with the full keyword list', () => {
    expect(cls('Vintage Item', { tags: ['pocket knife'] })).toBe('KNIFE');
    expect(cls('Folding Tool', { brand: 'Spyderco' })).toBe('KNIFE');
    expect(cls('Lot', { ebayCategoryName: 'Rings' })).toBe('JEWELRY');
  });

  it('description only fires on strong terms', () => {
    expect(cls('Wooden Box', { description: 'Great for storing coins or jewelry.' })).toBe('NONE');
    expect(cls('Wooden Box', { description: 'Includes a vintage switchblade.' })).toBe('KNIFE');
    expect(cls('Display Case', { description: 'Holds 2 handguns.' })).toBe('FIREARM_RELATED');
  });

  it('category-wide rules', () => {
    expect(cls('Lot of 5', { category: 'Jewelry & Watches' })).toBe('JEWELRY');
    expect(cls('Seiko Watch', { category: 'Jewelry & Watches' })).toBe('JEWELRY');
    expect(cls('Lot of 5', { category: 'Coins & Paper Money' })).toBe('COIN_BULLION_PRECIOUS_METAL');
    expect(cls('Blue Folder', { category: 'Coins & Paper Money', ebayCategoryName: 'Coin Albums' })).toBe('NONE');
    expect(cls('Lot', { ebayCategoryName: 'Collectible Knives' })).toBe('KNIFE');
    expect(cls('Mirror Box', { ebayCategoryName: 'Jewelry Boxes' })).toBe('NONE');
    expect(cls('Chef Set', { category: 'Home & Garden', ebayCategoryName: 'Kitchen Knives' })).toBe('NONE');
    expect(cls('Seiko Watch', { category: 'Fashion' })).toBe('NONE');
    // category text is read only by the category rules, so a carve-out leaf is never re-caught by a keyword
    expect(cls('Set of 8', { ebayCategoryName: 'Napkin Rings' })).toBe('NONE');
    expect(cls('Lot', { ebayCategoryName: 'Rings' })).toBe('JEWELRY');
  });

  it('highest class wins when several match', () => {
    expect(cls('Sword and Pearl Necklace')).toBe('WEAPON');
    expect(cls('Pocket Knife and Silver Dollar')).toBe('KNIFE');
    expect(cls('Rifle Scope and Hunting Knife')).toBe('FIREARM_RELATED');
  });

  it('is deterministic and versioned', () => {
    const a = classifyRestrictedItem({ title: 'Pocket Knife' });
    const b = classifyRestrictedItem({ title: 'Pocket Knife' });
    expect(a).toEqual(b);
    expect(a.version).toBe(RESTRICTED_CLASSIFIER_VERSION);
    expect(a.matched).toBe('keyword:pocket knife');
  });

  it('normalizes punctuation and case', () => {
    expect(normalizeForRestrictedMatch('AR-15  Magazine!!')).toBe('ar 15 magazine');
    expect(stripExclusions('hot glue gun and pistol')).toBe('and pistol');
  });
});

describe('ratchet and override', () => {
  it('automatic reclassification raises but never lowers', () => {
    expect(applyAutoRatchet('KNIFE', 'NONE')).toBe('KNIFE');
    expect(applyAutoRatchet('JEWELRY', 'WEAPON')).toBe('WEAPON');
    expect(applyAutoRatchet('WEAPON', 'JEWELRY')).toBe('WEAPON');
    expect(applyAutoRatchet(null, 'JEWELRY')).toBe('JEWELRY');
    expect(applyAutoRatchet('NONE', 'NONE')).toBe('NONE');
  });

  it('an admin override always wins, including clearing to NONE', () => {
    expect(effectiveRestrictedClass('KNIFE', 'NONE')).toBe('NONE');
    expect(effectiveRestrictedClass('NONE', 'WEAPON')).toBe('WEAPON');
    expect(effectiveRestrictedClass('KNIFE', null)).toBe('KNIFE');
    expect(effectiveRestrictedClass(undefined, undefined)).toBe('NONE');
  });
});
