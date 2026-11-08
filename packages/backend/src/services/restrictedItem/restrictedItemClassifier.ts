/**
 * Restricted-item classifier (2026-11-06, Finix restricted-item card blocking).
 *
 * DETERMINISTIC: keywords + category only. No model calls of any kind (Patrick 2026-11-05: the item pipeline never uses a
 * model stronger than Haiku, and this classifier adds none). Same input -> same output, always.
 *
 * Classes, highest first (precedence when several match): WEAPON > FIREARM_RELATED > KNIFE > COIN_BULLION_PRECIOUS_METAL
 * > JEWELRY > NONE. The order is also the RATCHET order: an automatic reclassification never moves an item DOWN this order
 * (see applyAutoRatchet). Only an admin override can lower or clear a class.
 *
 * MATCHING
 *   - Text is lower-cased and every run of non-letter/non-digit characters becomes one space ("AR-15" -> "ar 15",
 *     "Gun-Metal" -> "gun metal"). A phrase matches only on whole words, with an optional plural s/es on its last word.
 *   - EXCLUSION PHRASES ARE STRIPPED, THEY DO NOT VETO. Each exclusion phrase ("glue gun", "butter knife", "key ring") is
 *     removed from the text before the class keywords are searched. So "Glue Gun and Pistol Holster" still matches
 *     FIREARM_RELATED on "pistol"/"holster", while "Hot Glue Gun" matches nothing. (The marketplace rules veto a whole rule
 *     on an exclude hit; that let weapons through, see marketplaceEligibilityRules.ts matchesExcludeKeyword 2026-11-04.)
 *   - FIELDS: title, tags and brand get the full keyword list. description only gets the STRONG list (unambiguous terms
 *     such as "handgun", "ammunition", "switchblade", "bullion"): sellers write things like "great for storing coins or
 *     jewelry" in descriptions, which would otherwise block ordinary goods. category and ebayCategoryName are read ONLY
 *     by the category rules below, so their carve-outs (coin albums, kitchen knives, jewelry boxes) always hold.
 *   - CATEGORY-WIDE: an eBay category of Jewelry, Coins / Paper Money / Bullion, or Knives / Swords / Blades classifies the
 *     item on the category alone (Patrick 2026-10-07: Finix gets a category-wide block plus keyword screening). Storage
 *     and accessory leaves (jewelry boxes, coin albums, display cases, cleaning, tools) are carved out.
 *
 * DELIBERATE EDGE DECISIONS (open for Patrick to change, see report):
 *   - Table knives are NONE: butter / dinner / table / cheese / fish / spreader knives, flatware and silverware, palette and
 *     putty knives, knife rests, sharpeners and knife blocks with no knife named. Sharp kitchen knives stay KNIFE: chef,
 *     carving, paring, bread, steak, boning, santoku, cleaver. A "silverware set with steak knives" is therefore KNIFE.
 *   - Costume / fashion jewelry is still JEWELRY.
 *   - Watches are NOT jewelry by keyword. A watch listed in eBay's "Jewelry & Watches" category is JEWELRY by the category
 *     rule (category-wide block).
 *   - Toy and tool "guns" are NONE: glue, nail, staple, caulk, heat, grease, spray, massage, water, squirt, Nerf, bubble,
 *     cap, label/price/tag, solder, radar, temperature, rivet, tape, drywall, foam guns; "gunmetal"/"gun metal" color.
 *     Air, BB, pellet, airsoft and paintball guns are FIREARM_RELATED.
 *   - Coin accessories are NONE (coin purse, coin bank, coin holder/album/tube/folder/sorter/counter/wrapper, coin-op
 *     machines, chocolate coins, coin cell batteries). A coin PENDANT is JEWELRY.
 *   - Sterling silverware is NONE (not bullion). Bullion contexts (bars, rounds, troy ounces, .999, scrap, nuggets, named
 *     bullion coins) are COIN_BULLION_PRECIOUS_METAL.
 */

export type RestrictedItemClassName =
  | 'NONE'
  | 'WEAPON'
  | 'FIREARM_RELATED'
  | 'KNIFE'
  | 'COIN_BULLION_PRECIOUS_METAL'
  | 'JEWELRY';

export const RESTRICTED_CLASSES: readonly Exclude<RestrictedItemClassName, 'NONE'>[] = [
  'WEAPON',
  'FIREARM_RELATED',
  'KNIFE',
  'COIN_BULLION_PRECIOUS_METAL',
  'JEWELRY',
];

/** Bump whenever a keyword, exclusion or category rule changes: the sweep job reclassifies every row whose stored
 *  restrictedClassifierVersion differs, so a rule change reaches existing items without a manual backfill. */
export const RESTRICTED_CLASSIFIER_VERSION = 'rk-1-2026-11-06';

/** Precedence / ratchet rank. Higher = more restricted. */
export const RESTRICTED_CLASS_RANK: Record<RestrictedItemClassName, number> = {
  NONE: 0,
  JEWELRY: 1,
  COIN_BULLION_PRECIOUS_METAL: 2,
  KNIFE: 3,
  FIREARM_RELATED: 4,
  WEAPON: 5,
};

export function isRestrictedItemClassName(v: unknown): v is RestrictedItemClassName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(RESTRICTED_CLASS_RANK, v);
}

export interface RestrictedClassifierInput {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  ebayCategoryName?: string | null;
  tags?: readonly string[] | null;
  brand?: string | null;
}

export interface RestrictedClassification {
  restrictedClass: RestrictedItemClassName;
  /** The keyword / category rule that decided it, for the audit trail. null for NONE. */
  matched: string | null;
  version: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rule tables
// ---------------------------------------------------------------------------------------------------------------------

/** Removed from the text before any keyword is searched. Whole words, optional plural on the last word. */
const EXCLUSION_PHRASES: readonly string[] = [
  // tool / toy guns and gun words that are not guns
  'glue gun', 'hot glue gun', 'nail gun', 'staple gun', 'caulk gun', 'caulking gun', 'heat gun', 'grease gun', 'spray gun',
  'paint spray gun', 'massage gun', 'massager gun', 'water gun', 'squirt gun', 'nerf gun', 'nerf', 'bubble gun', 'cap gun',
  'label gun', 'price gun', 'pricing gun', 'tag gun', 'tagging gun', 'solder gun', 'soldering gun', 'radar gun',
  'temperature gun', 'thermometer gun', 'temp gun', 'rivet gun', 'tape gun', 'drywall gun', 'foam gun', 'sealant gun',
  'impact gun', 'tire inflator gun', 'gunmetal', 'gun metal', 'top gun', 'gunsmoke', 'bullet journal', 'bullet point',
  'bullet proof coffee', 'ink cartridge', 'toner cartridge', 'printer cartridge', 'water filter cartridge',
  'faucet cartridge', 'game cartridge', 'filter cartridge', 'razor cartridge', 'blackjack table', 'blackjack game',
  'trigger sprayer', 'trigger spray', 'spray trigger',
  // twirling / relay batons
  'twirling baton', 'relay baton', 'conductor baton', 'conducting baton',
  // table knives, cutlery and knife accessories (deliberate: NONE, see header)
  'butter knife', 'butter knives', 'dinner knife', 'dinner knives', 'table knife', 'table knives', 'cheese knife',
  'cheese knives', 'fish knife', 'fish knives', 'spreader knife', 'spreader knives', 'palette knife', 'palette knives',
  'putty knife', 'putty knives', 'painting knife', 'painting knives', 'knife rest', 'knife sharpener', 'knife sharpening',
  'knife block', 'knife holder', 'knife magnet', 'magnetic knife strip', 'knife roll', 'knife edge',
  'butter spreader', 'flatware', 'silverware', 'cutlery tray',
  // blades that are not knives
  'blade runner', 'bladerunner', 'rollerblade', 'roller blade', 'wiper blade', 'saw blade', 'fan blade', 'mower blade',
  'lawn mower blade', 'blender blade', 'shoulder blade', 'skate blade', 'ceiling fan blade', 'razor blade', 'blade server',
  'grass blade', 'propeller blade', 'turbine blade', 'planer blade', 'jigsaw blade', 'circular saw blade', 'oscillating blade',
  // stiletto shoes
  'stiletto heel', 'stiletto heels', 'stiletto pump', 'stiletto pumps', 'stiletto boot', 'stiletto boots',
  'stiletto sandal', 'stiletto sandals', 'stiletto shoe', 'stiletto shoes',
  // coin accessories and not-money coins
  'coin purse', 'coin pouch', 'coin wallet', 'coin bank', 'coin holder', 'coin holders', 'coin album', 'coin tube',
  'coin folder', 'coin sorter', 'coin counter', 'coin wrapper', 'coin wrappers', 'coin op', 'coin operated',
  'chocolate coin', 'coin cell', 'coin cell battery', 'coin battery', 'coin slot', 'coin mech', 'coin door', 'coin box',
  'coin dish', 'coin tray', 'coin collector album', 'flip a coin',
  // rings that are not jewelry
  'ring light', 'key ring', 'keyring', 'o ring', 'napkin ring', 'ring binder', 'boxing ring', 'onion ring', 'piston ring',
  'shower ring', 'curtain ring', 'teething ring', 'ring toss', 'ring doorbell', 'ring video doorbell', 'ring camera',
  'ring pop', 'ring sling', 'lord of the rings', 'rings of power', 'ring mold', 'drain ring', 'ring holder', 'ring dish',
  'ring box', 'ring stand', 'ring sizer', 'ring gauge', 'trim ring', 'burner ring', 'gasket ring', 'retaining ring',
  'snap ring', 'lock ring', 'bull ring', 'tree ring', 'ring bearer pillow', 'stacking ring toy', 'rings toy',
  'jump ring', 'split ring',
  // jewelry storage and accessories (not jewelry)
  'jewelry box', 'jewellery box', 'jewelry boxes', 'jewelry organizer', 'jewellery organizer', 'jewelry armoire',
  'jewelry dish', 'jewelry stand', 'jewelry tree', 'jewelry cleaner', 'jewelry cleaning', 'jewelry display',
  'jewelry making', 'jewelry tool', 'jewelry pliers', 'jewelry chest', 'jewelry cabinet', 'jewelry holder', 'jewelry tray',
  'jewelry case', 'jewelry pouch', 'jewelry bag', 'necklace holder', 'necklace stand', 'bracelet holder', 'earring holder',
  'earring stand', 'earring card', 'earring cards', 'earring backs',
  // pendants and diamonds that are not jewelry
  'pendant light', 'pendant lamp', 'pendant lights', 'pendant fixture', 'pendant lighting', 'pendant shade',
  'diamond plate', 'diamond painting', 'diamond art', 'diamond blade', 'diamond sharpener', 'diamond drill',
  'diamond bit', 'diamond pattern', 'diamond quilted', 'diamond shaped', 'diamond shape', 'diamond cut glass',
  'black diamond', 'diamond back', 'diamondback', 'diamond dust', 'diamond grit',
];

interface KeywordRule {
  cls: Exclude<RestrictedItemClassName, 'NONE'>;
  /** Full list: title, tags, brand, category, ebayCategoryName. */
  keywords: readonly string[];
  /** Strong subset also searched in the description. */
  strong: readonly string[];
}

const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    cls: 'WEAPON',
    keywords: [
      'weapon', 'sword', 'swords', 'dagger', 'bayonet', 'katana', 'saber', 'sabre', 'rapier', 'cutlass', 'scimitar',
      'claymore', 'broadsword', 'longsword', 'short sword', 'spear', 'halberd', 'pike polearm', 'polearm', 'battle axe',
      'war hammer', 'warhammer weapon', 'tomahawk', 'mace weapon', 'morning star mace', 'flail weapon', 'taser',
      'stun gun', 'stun baton', 'nunchuck', 'nunchucks', 'nunchaku', 'brass knuckle', 'brass knuckles', 'knuckle duster',
      'baton', 'police baton', 'expandable baton', 'billy club', 'nightstick', 'blackjack', 'pepper spray',
      'bear spray', 'self defense spray', 'throwing star', 'shuriken', 'crossbow', 'compound bow', 'recurve bow',
      'longbow', 'blowgun', 'grenade', 'land mine', 'landmine', 'explosive', 'explosives', 'kubotan',
    ],
    strong: [
      'weapon', 'dagger', 'bayonet', 'taser', 'stun gun', 'nunchaku', 'nunchuck', 'brass knuckle', 'brass knuckles',
      'pepper spray', 'throwing star', 'shuriken', 'crossbow', 'grenade', 'explosive', 'explosives',
    ],
  },
  {
    cls: 'FIREARM_RELATED',
    keywords: [
      'firearm', 'firearms', 'gun', 'guns', 'handgun', 'shotgun', 'rifle', 'riflescope', 'rifle scope', 'pistol',
      'revolver', 'derringer', 'musket', 'flintlock', 'carbine', 'ammo', 'ammunition', 'gunpowder', 'black powder',
      'reloading press', 'reloading dies', 'reloading kit', 'shell casing', 'shell casings', 'brass casings',
      'shotgun shell', 'shotgun shells', 'rifle cartridge', 'pistol cartridge', 'ammo can', 'ammo box', 'bullet',
      'bullets', 'holster', 'gun case', 'gun safe', 'gun cabinet', 'gun rack', 'gun sling', 'gun cleaning',
      'gun magazine', 'rifle magazine', 'pistol magazine', 'ar magazine', 'high capacity magazine', 'speed loader',
      'speedloader', 'suppressor', 'silencer', 'muzzle brake', 'gun stock', 'rifle stock', 'gun barrel', 'rifle barrel',
      'trigger assembly', 'trigger group', 'bolt carrier', 'lower receiver', 'upper receiver', 'ar 15', 'ar15', 'ak 47',
      'ak47', 'bb gun', 'air rifle', 'air pistol', 'air gun', 'airgun', 'pellet gun', 'pellet rifle', 'airsoft',
      'paintball gun', 'paintball marker', 'flare gun', 'starter pistol', 'glock', 'ruger', 'beretta', 'sig sauer',
      'mossberg', 'springfield armory', 'daisy red ryder',
    ],
    strong: [
      'firearm', 'firearms', 'handgun', 'shotgun', 'rifle', 'pistol', 'revolver', 'ammo', 'ammunition', 'gunpowder',
      'holster', 'suppressor', 'silencer', 'ar 15', 'ak 47', 'glock', 'airsoft', 'bb gun', 'pellet gun',
    ],
  },
  {
    cls: 'KNIFE',
    keywords: [
      'knife', 'knives', 'pocket knife', 'pocketknife', 'switchblade', 'butterfly knife', 'balisong', 'machete',
      'bowie', 'dirk', 'stiletto', 'box cutter', 'boxcutter', 'utility knife', 'hunting knife', 'skinning knife',
      'fixed blade', 'folding blade', 'gravity knife', 'push dagger', 'karambit', 'kukri', 'cleaver', 'switch blade',
      'spyderco', 'benchmade', 'kershaw', 'ka bar', 'kabar', 'case xx', 'gerber knife', 'buck knife', 'buck knives',
      'swiss army knife', 'leatherman', 'multitool knife',
    ],
    strong: ['switchblade', 'butterfly knife', 'balisong', 'machete', 'gravity knife', 'karambit', 'hunting knife', 'pocket knife'],
  },
  {
    cls: 'COIN_BULLION_PRECIOUS_METAL',
    keywords: [
      'coin', 'coins', 'bullion', 'troy oz', 'troy ounce', 'troy ounces', '999 fine', '9999 fine', 'fine silver',
      'fine gold', 'silver bar', 'silver bars', 'gold bar', 'gold bars', 'silver round', 'silver rounds', 'gold round',
      'scrap gold', 'scrap silver', 'sterling scrap', 'gold scrap', 'silver scrap', 'junk silver', 'gold nugget',
      'gold nuggets', 'platinum bar', 'palladium bar', 'krugerrand', 'silver eagle', 'gold eagle', 'gold maple leaf',
      'silver maple leaf', 'britannia silver', 'philharmonic gold', 'pamp suisse', 'banknote', 'banknotes',
      'paper money', 'currency note', 'silver certificate', 'gold certificate', 'federal reserve note', 'proof set',
      'mint set', 'half dollar', 'silver dollar', 'morgan dollar', 'peace dollar', 'buffalo nickel', 'wheat penny',
      'wheat pennies', 'indian head penny', 'double eagle', 'numismatic', 'numismatics', 'pcgs', 'ngc graded',
      'commemorative coin', 'precious metal', 'precious metals',
    ],
    strong: ['bullion', 'troy oz', 'troy ounce', 'krugerrand', 'junk silver', 'scrap gold', 'scrap silver', 'silver eagle', 'numismatic', 'pcgs'],
  },
  {
    cls: 'JEWELRY',
    keywords: [
      'jewelry', 'jewellery', 'costume jewelry', 'necklace', 'necklaces', 'bracelet', 'bracelets', 'earring',
      'earrings', 'ring', 'rings', 'engagement ring', 'wedding band', 'pendant', 'brooch', 'brooches', 'locket',
      'cufflink', 'cufflinks', 'cuff links', 'tiara', 'anklet', 'choker', 'bangle', 'bangles', 'diamond', 'diamonds',
      'gemstone', 'gemstones', 'sapphire', 'opal', 'tanzanite', 'pearl necklace', 'pearl earrings', 'charm bracelet',
      '10k', '14k', '18k', '22k', '24k', '10kt', '14kt', '18kt', 'karat gold', 'carat', 'cttw', 'sterling silver ring',
      '925 sterling', 'signet ring', 'tie clip', 'tie tack', 'hat pin', 'body jewelry', 'nose ring', 'belly ring',
    ],
    strong: ['engagement ring', 'wedding band', 'cttw', 'karat gold', '14k gold', '18k gold'],
  },
];

/** Bullion contexts beat jewelry for gold/silver karat words: "14k gold scrap lot" is precious metal, not jewelry. Covered
 *  by precedence (COIN_BULLION_PRECIOUS_METAL ranks above JEWELRY), listed here only as documentation. */

interface CategoryRule {
  cls: Exclude<RestrictedItemClassName, 'NONE'>;
  /** Matched (whole words) against category + ebayCategoryName. */
  categoryKeywords: readonly string[];
  /** A category text containing any of these is NOT category-classified (accessory / storage leaves). */
  carveOuts: readonly string[];
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    cls: 'WEAPON',
    categoryKeywords: ['swords', 'sword', 'weapons', 'militaria weapons', 'archery', 'crossbows', 'self defense'],
    carveOuts: ['letter openers', 'toy', 'toys'],
  },
  {
    cls: 'FIREARM_RELATED',
    categoryKeywords: ['guns', 'gun', 'firearms', 'ammunition', 'holsters', 'gun cases', 'airsoft', 'air guns', 'paintball', 'shooting', 'gun accessories', 'hunting guns'],
    carveOuts: ['toy', 'toys', 'glue guns', 'nail guns', 'staple guns', 'heat guns', 'spray guns', 'massage guns'],
  },
  {
    cls: 'KNIFE',
    categoryKeywords: ['knives', 'blades', 'knives swords blades', 'hunting knives', 'pocket knives', 'collectible knives'],
    carveOuts: ['kitchen', 'cutlery', 'flatware', 'knife sharpeners', 'saw blades', 'mower blades', 'fan blades', 'wiper blades'],
  },
  {
    cls: 'COIN_BULLION_PRECIOUS_METAL',
    categoryKeywords: ['coins', 'coin', 'paper money', 'bullion', 'banknotes', 'currency', 'precious metals'],
    carveOuts: ['coin albums', 'coin holders', 'coin supplies', 'supplies', 'albums', 'holders', 'coin banks', 'banks', 'coin op', 'coin operated', 'arcade', 'purses', 'wallets'],
  },
  {
    cls: 'JEWELRY',
    categoryKeywords: [
      'jewelry', 'jewellery', 'fine jewelry', 'fashion jewelry', 'vintage antique jewelry', 'jewelry watches', 'rings',
      'necklaces', 'necklaces pendants', 'bracelets', 'earrings', 'brooches', 'brooches pins', 'charms', 'charm bracelets',
      'cufflinks', 'loose diamonds', 'loose gemstones', 'body jewelry', 'anklets',
    ],
    carveOuts: [
      'boxes', 'organizers', 'jewelry boxes', 'displays', 'cleaning', 'tools', 'making', 'beading', 'supplies',
      'packaging', 'key rings', 'keyrings', 'napkin rings', 'o rings', 'piston rings', 'curtain rings',
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------------------------------------------------

/** Lower-case; every run of non-letter/non-digit characters becomes one space; trimmed. */
export function normalizeForRestrictedMatch(text: string | null | undefined): string {
  return (text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const phraseRegexCache = new Map<string, RegExp>();

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word regex for a phrase over normalized text; the last word may carry a plural s / es. Global flag so the same
 *  regex strips every occurrence. */
function phraseRegex(phrase: string): RegExp {
  let re = phraseRegexCache.get(phrase);
  if (!re) {
    const norm = normalizeForRestrictedMatch(phrase);
    const words = norm.split(' ').map(escapeRegex);
    const last = words.pop() as string;
    const body = [...words, `${last}(?:e?s)?`].join(' ');
    re = new RegExp(`(?:^| )${body}(?= |$)`, 'gu');
    phraseRegexCache.set(phrase, re);
  }
  re.lastIndex = 0;
  return re;
}

/** True when `phrase` occurs in already-normalized `normText` on whole-word boundaries. Exported for tests. */
export function containsPhrase(normText: string, phrase: string): boolean {
  if (!normText) return false;
  const re = phraseRegex(phrase);
  const hit = re.test(normText);
  re.lastIndex = 0;
  return hit;
}

// Longest exclusions first so "hot glue gun" is removed before "glue gun" could leave "hot".
const EXCLUSIONS_LONGEST_FIRST = [...EXCLUSION_PHRASES].sort(
  (a, b) => normalizeForRestrictedMatch(b).length - normalizeForRestrictedMatch(a).length,
);

/** Removes every exclusion phrase from already-normalized text (replaced by a single space). Exported for tests. */
export function stripExclusions(normText: string): string {
  let out = ` ${normText} `;
  for (const phrase of EXCLUSIONS_LONGEST_FIRST) {
    const re = phraseRegex(phrase);
    out = out.replace(re, ' ');
    re.lastIndex = 0;
  }
  return out.replace(/ +/g, ' ').trim();
}

const longestFirstCache = new WeakMap<readonly string[], readonly string[]>();
function longestFirst(phrases: readonly string[]): readonly string[] {
  let sorted = longestFirstCache.get(phrases);
  if (!sorted) {
    sorted = [...phrases].sort((a, b) => b.length - a.length);
    longestFirstCache.set(phrases, sorted);
  }
  return sorted;
}

/** The LONGEST phrase that matches (so the audit trail says "pocket knife", not "knife"), or null. */
function firstMatch(normText: string, phrases: readonly string[]): string | null {
  if (!normText) return null;
  for (const p of longestFirst(phrases)) if (containsPhrase(normText, p)) return p;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Classifies one item from its own fields. Pure and synchronous. Returns the HIGHEST matching class (see precedence in
 * the file header), or NONE.
 */
export function classifyRestrictedItem(input: RestrictedClassifierInput): RestrictedClassification {
  const fullText = stripExclusions(
    normalizeForRestrictedMatch(
      [input.title, (input.tags || []).join(' '), input.brand]
        .filter((v) => typeof v === 'string' && v)
        .join(' | '),
    ),
  );
  const descText = stripExclusions(normalizeForRestrictedMatch(input.description));
  const categoryText = normalizeForRestrictedMatch([input.category, input.ebayCategoryName].filter(Boolean).join(' | '));

  let best: { cls: RestrictedItemClassName; matched: string } | null = null;
  const consider = (cls: RestrictedItemClassName, matched: string) => {
    if (!best || RESTRICTED_CLASS_RANK[cls] > RESTRICTED_CLASS_RANK[best.cls]) best = { cls, matched };
  };

  for (const rule of KEYWORD_RULES) {
    const hit = firstMatch(fullText, rule.keywords);
    if (hit) {
      consider(rule.cls, `keyword:${hit}`);
      continue;
    }
    const descHit = firstMatch(descText, rule.strong);
    if (descHit) consider(rule.cls, `description:${descHit}`);
  }

  if (categoryText) {
    for (const rule of CATEGORY_RULES) {
      if (firstMatch(categoryText, rule.carveOuts)) continue;
      const hit = firstMatch(categoryText, rule.categoryKeywords);
      if (hit) consider(rule.cls, `category:${hit}`);
    }
  }

  const decided = best as { cls: RestrictedItemClassName; matched: string } | null;
  return {
    restrictedClass: decided ? decided.cls : 'NONE',
    matched: decided ? decided.matched : null,
    version: RESTRICTED_CLASSIFIER_VERSION,
  };
}

/**
 * The ratchet: an AUTOMATIC classification may raise an item's class but never lower it. This is what makes "organizers
 * cannot lower the class" hold: an organizer who renames "Bowie Knife" to "Kitchen Tool" changes the classifier output to
 * NONE, but the stored class stays KNIFE until an admin clears it.
 */
export function applyAutoRatchet(current: RestrictedItemClassName | null | undefined, auto: RestrictedItemClassName): RestrictedItemClassName {
  const cur: RestrictedItemClassName = current && isRestrictedItemClassName(current) ? current : 'NONE';
  return RESTRICTED_CLASS_RANK[auto] >= RESTRICTED_CLASS_RANK[cur] ? auto : cur;
}

/** Effective class: an admin override (when set) always wins; otherwise the stored (ratcheted) class. */
export function effectiveRestrictedClass(
  stored: RestrictedItemClassName | null | undefined,
  override: RestrictedItemClassName | null | undefined,
): RestrictedItemClassName {
  if (override && isRestrictedItemClassName(override)) return override;
  return stored && isRestrictedItemClassName(stored) ? stored : 'NONE';
}
