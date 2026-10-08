/**
 * S-ELIGIBILITY-BOUNDARY-MATCH-2026-10-08: regression suite for boundary-aware CATEGORY_BLOCKLIST
 * keyword matching in marketplaceEligibilityRules.ts.
 *
 * Origin: the vinyl LP "Grover Washington, Jr. Winelight Vinyl LP Record, Elektra, 1980" (category
 * "Music") was wrongly ineligible on FACEBOOK / CRAIGSLIST / POSHMARK / MERCARI because the alcohol
 * keyword 'wine' substring-matched inside "Winelight". The matcher was rewritten to whole-word /
 * phrase matching with inflection tolerance and an explicit compound-affix table. This suite proves
 * (1) EVERY existing blocklist keyword on EVERY platform still blocks a genuine phrase, (2) the
 * glued compounds and inflections the old substring behaviour caught still block, and (3) the
 * embedded-substring false positives no longer block.
 */

// marketplaceEligibilityRules imports ebayRateEstimateService, which imports the prisma client.
jest.mock('../../lib/prisma', () => ({ prisma: {} }));

import {
  checkEligibility,
  listBlocklistKeywords,
  matchesBlocklistKeyword,
  EligibilityPlatform,
} from '../marketplaceEligibilityRules';

function eligible(platform: EligibilityPlatform, title: string, category = 'Collectibles'): boolean {
  return checkEligibility(platform, { category, ebayCategoryId: null, title }).eligible;
}

describe('every existing blocklist keyword still blocks (no silent compliance weakening)', () => {
  const rules = listBlocklistKeywords();

  it('lists a non-trivial number of blocklist rules and keywords', () => {
    expect(rules.length).toBeGreaterThanOrEqual(20);
    expect(rules.reduce((n, r) => n + r.keywords.length, 0)).toBeGreaterThanOrEqual(300);
  });

  // Realistic phrases for keywords where "Vintage <keyword>" would not read naturally, or which
  // need an explicit natural title. Every keyword NOT listed here is exercised with
  // `Vintage <keyword>` below, so a keyword can never silently drop out of coverage.
  const REALISTIC: Record<string, string> = {
    'weapon': 'Medieval weapons display',
    'firearm': 'Antique firearms parts',
    'gun': 'Vintage Shotgun Winchester',
    'blade': 'Hunting blades set',
    'knife': 'Hunting Knives lot',
    'wine': 'Vintage Wine Bottle Collection',
    'beer': 'Antique beer steins',
    'cigar': 'Box of cigars',
    'cigarette': 'Pack of cigarettes',
    'coin': '1921 Morgan Silver Dollar coin',
    'currency': 'Foreign currency lot',
    'e-cigarette': 'E-Cigarette starter kit',
    'prescription drug': 'Prescription drugs bottle',
    'sex toy': 'Adult sex toys',
    'narcotic': 'Narcotics paraphernalia',
    'lighters': 'Zippo lighters lot',
  };
  const phraseFor = (kw: string) => REALISTIC[kw] || `Vintage ${kw}`;

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      it(`${rule.platform}: "${kw}" blocks "${phraseFor(kw)}"`, () => {
        expect(eligible(rule.platform, phraseFor(kw))).toBe(false);
      });
      it(`${rule.platform}: "${kw}" blocks when it is only in the category`, () => {
        expect(checkEligibility(rule.platform, { category: phraseFor(kw), ebayCategoryId: null, title: 'Item' }).eligible).toBe(false);
      });
    }
  }
});

describe('genuine inflections, hyphenation and glued compounds still block', () => {
  const CASES: [EligibilityPlatform, string, string][] = [
    // plural / inflection
    ['FACEBOOK', 'Hunting Knives', 'irregular plural knife->knives'],
    ['VINTED', 'Set of kitchen knives', 'irregular plural knife->knives'],
    ['FACEBOOK', 'Cigars in humidor', 'plural'],
    ['FACEBOOK', 'wine glasses set', 'plural'],
    ['FACEBOOK', 'Vintage firearms', 'firearm plural'],
    ['FACEBOOK', 'Boxes of ammunition', 'ammunition'],
    ['FACEBOOK', 'Foreign currencies', 'y->ies'],
    ['MERCARI', 'Lottery tickets', 'ticket plural'],
    ['GUMTREE_AU', 'State lotteries memorabilia', 'lottery y->ies'],
    ['FACEBOOK', 'Federal Reserve Notes', 'paper money category'],
    ['FACEBOOK', 'Taxidermied deer head', 'taxidermy y->ied'],
    ['FACEBOOK', 'Bootlegged concert tapes', 'doubled consonant'],
    ['GUMTREE_AU', 'Vaping supplies', 'silent-e drop'],
    ['FACEBOOK', 'Counterfeiters kit', 'counterfeit+ers'],
    ['CRAIGSLIST', 'Gunned down', 'gun doubled consonant'],
    // hyphen / spacing
    ['FACEBOOK', 'E Cigarette kit', 'hyphen as space'],
    ['FACEBOOK', 'ecigarette kit', 'glued'],
    ['FACEBOOK', 'sex-toys', 'hyphenated'],
    ['FACEBOOK', 'giftcards lot', 'glued multi-word'],
    ['FACEBOOK', 'Stungun 1990', 'glued multi-word'],
    ['FACEBOOK', 'Prescription-drug bottles', 'hyphenated multi-word'],
    ['MERCARI', 'Self-defense keychain', 'hyphen'],
    ['CRAIGSLIST', 'Home-canned peaches', 'hyphen'],
    // glued compounds the old substring match caught
    ['FACEBOOK', 'Remington shotgun', 'shotgun'],
    ['FACEBOOK', 'Colt handgun', 'handgun'],
    ['CRAIGSLIST', 'Crosman airgun', 'airgun'],
    ['GUMTREE_AU', 'Machinegun replica', 'machinegun'],
    ['VINTED', 'Antique gunpowder horn', 'gunpowder'],
    ['FACEBOOK', 'Antique pocketknife', 'pocketknife'],
    ['VINTED', 'Jackknife', 'jackknife'],
    ['FACEBOOK', 'Broadsword reproduction', 'broadsword'],
    ['FACEBOOK', 'Wineglass set', 'wineglass'],
    ['FACEBOOK', 'Winery tour poster', 'winery'],
    ['MERCARI', 'Seafood cookbook', 'seafood'],
    ['MERCARI', 'Multivitamin bottle', 'multivitamin'],
    ['FACEBOOK', 'Bitcoin novelty', 'bitcoin (coin)'],
    ['VINTED', 'Motorbike jacket', 'motorbike'],
    ['VINTED', 'Tortoiseshell comb', 'tortoiseshell'],
    ['FACEBOOK', 'Weaponry display', 'weaponry'],
    ['GUMTREE_AU', 'Alcoholic beverage sign', 'alcoholic'],
    ['FACEBOOK', 'Cigarillos tin', 'cigarillo'],
    ['GUMTREE_AU', 'Government identification card', 'government id stem'],
  ];
  for (const [platform, title, why] of CASES) {
    it(`${platform} blocks "${title}" (${why})`, () => {
      const category = title === 'Federal Reserve Notes' ? 'Paper Money' : 'Collectibles';
      expect(eligible(platform, title, category)).toBe(false);
    });
  }
});

describe('embedded-substring false positives no longer block', () => {
  const ALL: EligibilityPlatform[] = ['FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU', 'POSHMARK', 'MERCARI'];
  const CASES: [string, string, EligibilityPlatform[]][] = [
    ['Grover Washington, Jr. Winelight Vinyl LP Record, Elektra, 1980', 'Music', ALL],
    ['Storm at Sunup, Gino Vannelli, 1975 Vinyl LP', 'Music', ALL],
    ['Max Beerbohm Collected Essays', 'Books', ['FACEBOOK', 'CRAIGSLIST', 'POSHMARK', 'MERCARI']],
    ['Swinelike Records Sampler', 'Music', ['FACEBOOK', 'CRAIGSLIST', 'POSHMARK', 'MERCARI']],
    ['CAPitol Records Greatest Hits Vinyl LP', 'Music', ALL],
    ['THAT Latin Feeling Vinyl LP', 'Music', ALL],
    ['Ammonite fossil specimen', 'Collectibles', ALL],
    ['Coincidence board game', 'Games', ['FACEBOOK']],
    ['Gunnar Optiks Computer Glasses', 'Eyewear', ['FACEBOOK', 'CRAIGSLIST', 'MERCARI']],
    ['Rollerblade Inline Skates', 'Sporting Goods', ['FACEBOOK', 'MERCARI']],
    ['Winegard Antenna', 'Home & Garden', ALL],
    ['Cryptography Textbook', 'Books', ['MERCARI']],
    ['Foodsaver Vacuum Sealer', 'Kitchen', ['MERCARI']],
    ['Furby Plush Toy', 'Toys', ['VINTED']],
    ['Biker Boots Size 10', 'Clothing', ['VINTED']],
  ];
  for (const [title, category, platforms] of CASES) {
    for (const p of platforms) {
      it(`${p} allows "${title}"`, () => {
        // Platforms whose OTHER rules legitimately block the category (Poshmark electronics etc.)
        // are avoided by only listing platforms exercised for the keyword family in question.
        expect(eligible(p, title, category)).toBe(true);
      });
    }
  }

  it('matchesBlocklistKeyword: whole-word boundaries', () => {
    expect(matchesBlocklistKeyword('winelight', 'wine')).toBe(false);
    expect(matchesBlocklistKeyword('red wine vinegar', 'wine')).toBe(true);
    expect(matchesBlocklistKeyword('beerbohm', 'beer')).toBe(false);
    expect(matchesBlocklistKeyword('swinelike', 'wine')).toBe(false);
    expect(matchesBlocklistKeyword('capitol', 'cap')).toBe(false);
    expect(matchesBlocklistKeyword('bladerunner', 'blade')).toBe(false);
    expect(matchesBlocklistKeyword('gunmetal', 'gun')).toBe(false);
    expect(matchesBlocklistKeyword('gun-metal', 'gun')).toBe(true);
    expect(matchesBlocklistKeyword('', 'gun')).toBe(false);
    expect(matchesBlocklistKeyword('anything', '')).toBe(false);
  });
});

describe('Vinted keeps its narrow tobacciana behavior', () => {
  it('blocks "lighters" and cigar cases but not a plain ashtray', () => {
    expect(eligible('VINTED', 'Marlboro lighters x5')).toBe(false);
    expect(eligible('VINTED', 'Ritmeester Pikeur Cigar Case Tobacco Metal Tin')).toBe(false);
    expect(eligible('VINTED', 'Glass ashtray', 'Collectibles')).toBe(true);
  });
});

describe('excludeKeywords carve-outs are unchanged (plain substring)', () => {
  it('still allows a Gunmetal golf club and Bladerunner skates', () => {
    expect(eligible('FACEBOOK', 'Titleist Gunmetal Black Golf Club')).toBe(true);
    expect(eligible('FACEBOOK', 'Bladerunner Inline Skates')).toBe(true);
  });
  it('still allows kitchen cutlery on Facebook but not Vinted', () => {
    expect(eligible('FACEBOOK', 'Kitchen knife set')).toBe(true);
    expect(eligible('VINTED', 'Kitchen knife set')).toBe(false);
  });
  it('still allows coin tubes on Facebook', () => {
    expect(eligible('FACEBOOK', 'BCW Quarter Coin Tubes', 'Coins & Paper Money')).toBe(true);
  });
});
