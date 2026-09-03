/*
 * Per-marketplace category eligibility registry (S-EXT-BATCH-2026-08-19).
 *
 * Replaces the one-off Facebook-only gate (extensionController.ts's former
 * isFacebookRestrictedCoinOrCurrencyItem body, now a thin wrapper around checkEligibility('FACEBOOK', ...)
 * below -- SAME logic, SAME behavior, just moved here) with a generalized registry covering
 * Grailed/Poshmark/Mercari/Vinted too. Architect-designed 2026-08-18 (typed rule registry,
 * 3 shapes); this file adds a 4th shape (CATEGORY_ALLOWLIST) for Grailed, which is fashion-only --
 * enumerating every possible NON-fashion category to block would be unreliable, so Grailed is
 * allowlisted (eligible only if a fashion keyword matches) instead of blocklisted like the others.
 *
 * Match against Item.category (free-text, e.g. "Home & Garden" -- schema.prisma) and
 * Item.ebayCategoryId where available -- same two-field pattern the original Facebook gate used.
 *
 * Default-safe-on-missing-data behavior is deliberately ASYMMETRIC by rule shape:
 *   - CATEGORY_BLOCKLIST (Poshmark/Mercari/Vinted, general/broad marketplaces): a blank/missing
 *     category means "no reason found to block it" -> ELIGIBLE. Matches the original Facebook
 *     gate's exact behavior (`if (!category) return false` i.e. not-restricted).
 *   - CATEGORY_ALLOWLIST (Grailed, fashion-only): a blank/missing category means "can't confirm
 *     this is fashion" -> INELIGIBLE (hidden by default). This is the safer default for a
 *     single-vertical marketplace -- the organizer's "Show all items" override in popup.js covers
 *     the edge case where an item's category text is wrong/missing but the item is actually fine.
 *
 * Sourced 2026-08-19 (see session research, cited inline per rule below). This is a
 * defense-in-depth / UX filter, not the sole compliance gate -- each platform's own listing form
 * still enforces its own rules at submission time regardless of what this registry decides.
 */

import { EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS } from './ebayRateEstimateService';

export type EligibilityPlatform = 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED';

export interface EligibilityCheckItem {
  category: string | null | undefined;
  ebayCategoryId: string | null | undefined;
  /** Added S-FB-WEAPON-COIN-FIX-2026-09-03: excludeKeywords/nameKeywords matching now checks
   * category + title combined (see buildHaystack below), not category alone. Root-caused via a
   * live production query this session: real coin-accessory items (e.g. "BCW Quarter Coin Tubes,
   * Each, Crystal Clear Storage") carry category="Coins & Paper Money" (no "tube"/"slab"/"holder"
   * substring anywhere in the category text) while the accessory word only appears in the TITLE --
   * so the existing exclude carve-out (which only tested category) could never fire and these
   * always-allowed items were wrongly blocked. Optional -- omitting it just means less signal for
   * the exclude-keyword carve-out to work with, not a hard failure. */
  title?: string | null | undefined;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
}

interface CategoryBlocklistRule {
  type: 'CATEGORY_BLOCKLIST';
  platform: EligibilityPlatform;
  /** Case-insensitive substring match against Item.category. Any match -> ineligible (unless excludeKeywords also matches). */
  nameKeywords: readonly string[];
  /** If a nameKeywords match ALSO matches one of these, treat as eligible (accessory/carve-out pattern, same idea as the original FB_COIN_ACCESSORY_EXCLUDE_KEYWORDS). */
  excludeKeywords?: readonly string[];
  /** Exact match (after descendant expansion) against Item.ebayCategoryId -> ineligible regardless of free-text category. */
  ebayCategoryIds?: readonly string[];
  reason: string;
}

interface CategoryAllowlistRule {
  type: 'CATEGORY_ALLOWLIST';
  platform: EligibilityPlatform;
  /** Case-insensitive substring match against Item.category. Eligible ONLY if one of these matches. */
  nameKeywords: readonly string[];
  reason: string;
}

// Reserved for future work (not used by any rule in this batch -- Etsy/Discogs connectors,
// per the 2026-08-18 Architect memo). Declared here so the registry's TYPE surface matches the
// full 4-shape design even though only 2 shapes have real rules today.
interface AttributeAgeAllowlistRule {
  type: 'ATTRIBUTE_AGE_ALLOWLIST';
  platform: EligibilityPlatform;
  reason: string;
}
interface PrerequisiteLookupRule {
  type: 'PREREQUISITE_LOOKUP';
  platform: EligibilityPlatform;
  reason: string;
}

type EligibilityRule =
  | CategoryBlocklistRule
  | CategoryAllowlistRule
  | AttributeAgeAllowlistRule
  | PrerequisiteLookupRule;

// ---- FACEBOOK (migrated verbatim from the original isFacebookRestrictedCoinOrCurrencyItem,
// extensionController.ts, pre-2026-08-19) -- Facebook Commerce Policy prohibits listing currency,
// cash, and coins. ID source: the "Coins & Paper Money" slice of eBay Taxonomy data (root L1 id
// '11116' + confirmed descendant leaf '11981', Eisenhower dollars) -- deliberately NOT the whole
// Standard-Envelope-eligible list, which also covers 7 unrelated families not restricted by FB's
// policy. Checked live 2026-08-15. Accessory carve-out (tubes/holders/slabs/etc.) added
// 2026-08-15 (Patrick correction, same day) -- a bare "coin" substring match also caught
// numismatic SUPPLIES, which are not restricted.
const FB_COIN_CURRENCY_CATEGORY_ID_ROOT = '11116'; // eBay L1 "Coins & Paper Money"
const FB_COIN_CURRENCY_CATEGORY_IDS: readonly string[] = [
  FB_COIN_CURRENCY_CATEGORY_ID_ROOT,
  ...(EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS[FB_COIN_CURRENCY_CATEGORY_ID_ROOT] || []),
];

const RULES: EligibilityRule[] = [
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['coin', 'currency', 'paper money'],
    excludeKeywords: [
      'tube', 'holder', 'capsule', 'flip', 'album', 'slab', 'sleeve', 'case', 'display',
      'book', 'page', 'mount', 'folder', 'box', 'organizer', 'storage',
    ],
    ebayCategoryIds: FB_COIN_CURRENCY_CATEGORY_IDS,
    reason: 'Facebook Marketplace does not allow listing coins or currency (Commerce Policy).',
  },

  // ---- FACEBOOK WEAPONS (added S-FB-WEAPON-COIN-FIX-2026-09-03) -- live incident: a dagger was
  // pushed to Facebook Marketplace because NO weapons rule existed anywhere in this registry for
  // platform FACEBOOK -- confirmed via grep, zero matches for weapon/firearm/gun/dagger/knife/
  // blade/ammo in extensionController.ts or this file prior to this fix. Facebook resulted in an
  // account-level restriction, not just a listing removal. Keyword scope sourced from Meta's
  // Commerce Policy / Restricted Goods pages (checked this session): firearms and firearm parts,
  // ammunition and reloading components, paintball/BB/pellet guns, explosives, non-culinary
  // knives/blades/spears (the policy language specifically carves out CULINARY knives), tasers,
  // stun guns, nunchucks, batons, brass knuckles, pepper spray, and other self-defense weapons.
  // excludeKeywords mirrors MERCARI's existing culinary carve-out below (kitchen cutlery IS
  // allowed) -- deliberately does NOT carve out generic "pocket knife"/"utility knife" since those
  // are not culinary and Facebook does remove them in practice.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'explosive',
      'dagger', 'sword', 'bayonet', 'blade', 'knife',
      'taser', 'stun gun', 'nunchuck', 'nunchaku', 'baton', 'brass knuckle',
      'pepper spray', 'switchblade', 'butterfly knife',
    ],
    excludeKeywords: [
      'kitchen', 'cutlery', 'multitool', 'multi-tool', 'butter knife',
      'chef knife', 'paring knife', 'bread knife', 'steak knife',
    ],
    reason: 'Facebook Marketplace does not allow listing weapons, ammunition, or explosives (Commerce Policy).',
  },

  // ---- FACEBOOK ALCOHOL/TOBACCO/DRUGS/ADULT/ANIMAL PRODUCTS (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) --
  // same audit that found the weapons gap above. Facebook's Commerce Policy bans a
  // lot more than coins and weapons, confirmed via Meta's own policy pages this session: age-
  // restricted alcohol/tobacco, illegal drugs and drug paraphernalia, adult products, and certain
  // animal-related products/parts. Scoped conservatively to keyword-detectable, estate-sale-
  // relevant items only -- taxidermy and ivory antiques are a real, common estate-sale category
  // (unlike a generic "animal" keyword, which would false-positive on animal-print clothing or
  // figurines, so deliberately NOT included).
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: [
      'alcohol', 'liquor', 'wine', 'beer', 'tobacco', 'cigarette', 'cigar',
      'vape', 'e-cigarette', 'narcotic', 'prescription drug',
      'taxidermy', 'ivory', 'mounted head', 'rhino horn',
      'pornographic', 'sex toy',
    ],
    reason: 'Facebook Marketplace does not allow listing alcohol, tobacco, drugs, adult content, or certain animal products (Commerce Policy).',
  },

  // ---- CRAIGSLIST (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) -- previously had ZERO eligibility
  // rule at all, despite fas-craigslist.js supporting full auto-publish CHECKED BY DEFAULT (the
  // 2026-07-17 locked decision, confirmed via that file's own header comment this session) -- the
  // exact same silent-submit risk profile as the Facebook incident that triggered this whole audit,
  // arguably higher exposure since Craigslist's automation is opt-OUT, not opt-in. Sourced directly
  // from craigslist.org/about/prohibited (fetched live this session, not a third-party summary).
  // Deliberately does NOT include a blanket knife/blade/sword ban -- Craigslist's own list says only
  // "weapons; firearms/guns and components; BB/pellet, stun, and spear guns", and real-world seller
  // experience (and the absence of any knife-specific line item, unlike Facebook/Mercari/Vinted/
  // Gumtree AU which all explicitly call out knives) confirms ordinary knives/swords are routinely
  // sold there without issue -- extrapolating a knife ban here would be a guess, not evidence.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'CRAIGSLIST',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'gunpowder', 'firework', 'explosive',
      'stun gun', 'spear gun', 'taser',
      'prescription', 'narcotic',
      'alcohol', 'liquor', 'wine', 'beer', 'tobacco', 'cigarette', 'cigar',
      'recalled', 'hazmat',
      'ivory',
      'counterfeit', 'replica', 'pirated',
      'stolen',
    ],
    reason: 'Craigslist prohibits weapons, ammunition/explosives, alcohol/tobacco, controlled substances, counterfeit/replica items, and several other restricted categories (Prohibited Items policy).',
  },

  // ---- GUMTREE_AU (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) -- previously had ZERO eligibility
  // rule at all. fas-gumtree-au.js's own auto-publish status wasn't independently re-confirmed this
  // session (out of scope for the registry fix), but Craigslist's parallel gap alone is reason
  // enough not to leave this one bare too. Sourced directly from Gumtree's own official "General
  // posting rules" page (help.gumtree.com.au, fetched live this session, "Restricted Categories"
  // list, updated November 2024, 42 line items -- scoped here to the keyword-detectable subset most
  // relevant to estate/yard-sale inventory, not the full list verbatim e.g. voting forms, census
  // papers). UNLIKE Facebook/Mercari, Gumtree's own text lists "knives (including switchblade
  // knives)" under Weapons with NO stated culinary exception anywhere on the page -- deliberately NOT
  // carving out kitchen knives here, since assuming an unstated exception would be a guess, not
  // evidence (Australian knife law is also notably stricter than the US, which supports treating
  // this literally rather than assuming a US-style carve-out).
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'GUMTREE_AU',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'paintball gun', 'gel blaster',
      'spear gun', 'tear gas', 'taser', 'stun gun', 'knife', 'switchblade',
      'martial arts', 'archery', 'bow and arrow',
      'firework', 'explosive',
      'alcohol', 'tobacco', 'cigarette', 'vape', 'e-cigarette',
      'ivory', 'rhino horn',
      'counterfeit', 'replica',
      'stolen',
      'hazmat', 'narcotic', 'prescription',
      'used cosmetic', 'used underwear',
      'nitrous oxide',
    ],
    reason: 'Gumtree Australia prohibits weapons (including all knives), alcohol, tobacco, drugs, counterfeit/replica goods, and several other restricted categories (General Posting Policy).',
  },

  // ---- GRAILED -- fashion/streetwear/designer-apparel ONLY. Confirmed 2026-08-19: site's own
  // nav is Hype/Sartorial/Core (all apparel/streetwear/designer fashion), menswear expanded to
  // include womenswear/sneakers, no general-merchandise categories exist anywhere on the platform
  // (voolist.com "How to Sell on Grailed" 2026; closo.co "Ultimate Guide to Grailed Clothing"
  // 2026; vendoo.co "Resell on Grailed" 2026). Allowlist, not blocklist -- see file header.
  {
    type: 'CATEGORY_ALLOWLIST',
    platform: 'GRAILED',
    nameKeywords: [
      'clothing', 'apparel', 'shirt', 't-shirt', 'tee', 'pant', 'trouser', 'jean', 'denim',
      'jacket', 'coat', 'outerwear', 'dress', 'skirt', 'suit', 'sportswear', 'activewear',
      'streetwear', 'sweatshirt', 'sweater', 'hoodie', 'shoe', 'sneaker', 'footwear', 'boot',
      'sandal', 'bag', 'backpack', 'wallet', 'belt', 'accessor', 'jewelry', 'jewellery', 'watch',
      'sunglasses', 'hat', 'cap', 'beanie', 'scarf', 'glove', 'sock', 'underwear', 'swimwear',
      'romper', 'jumpsuit',
      // BUG FIX 2026-08-23 (Patrick-reported live: "Bored Ape Yacht Club Adidas Tracksuit" incorrectly
      // flagged "may not fit this marketplace" for Grailed). Root-caused via direct code read: this is
      // a substring allowlist against item.category, and the item's real category is "Tracksuits &
      // Sets" (confirmed against fas-grailed.js's own GRAILED_CATEGORY_OVERRIDES entry for the same
      // category string) -- 'tracksuit' was simply missing from the list, a genuine fashion item with
      // no other keyword match. Added the missing term plus its common sibling, both obviously
      // fashion/apparel and equally likely to be missed the same way.
      'tracksuit', 'sweatpant',
    ],
    reason: 'Grailed is a fashion/streetwear-only marketplace -- this item’s category doesn’t look like apparel, footwear, or accessories.',
  },

  // ---- POSHMARK -- broadened well beyond fashion (Home, Kids, Pet, sealed Beauty), but
  // Electronics is a separate CURATED catalog per Poshmark's own 2021 policy post
  // (blog.poshmark.com/2021/11/18/policy-update-introducing-electronics-on-poshmark: "does not
  // currently support items outside of our electronics catalog") -- ordinary secondhand
  // electronics are treated as ineligible here since catalog-membership can't be verified
  // programmatically. Confirmed 2026-08-19.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'POSHMARK',
    nameKeywords: [
      'food', 'opened beauty', 'used beauty', 'opened cosmetic', 'used cosmetic',
      'used personal care', 'used underwear', 'counterfeit', 'replica', 'recalled',
      // Conservative default -- Poshmark's Electronics is a curated/vetted catalog, not general
      // secondhand electronics (see comment above).
      'electronics', 'computer', 'laptop', 'television', 'appliance', 'printer', 'camera',
    ],
    excludeKeywords: ['sealed', 'unopened', 'new,', 'nwt', 'nwot'],
    reason: 'This category isn’t supported on Poshmark (prohibited item, or electronics outside Poshmark’s curated catalog).',
  },

  // ---- POSHMARK WEAPONS/ALCOHOL (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) -- the existing
  // POSHMARK rule above had ZERO weapons/firearms/ammunition/alcohol coverage, the exact same class
  // of gap the Facebook incident was caused by. Confirmed via Poshmark's own Prohibited Items Policy
  // (poshmark.com/prohibited_items_policy) and corroborating sources this session: "Firearms,
  // weapons & knives including guns, ammunition, and switchblades are prohibited," and alcohol is
  // separately banned. Split into its own rule (rather than folded into the electronics/beauty rule
  // above) so the reason message shown to the organizer is accurate to what actually blocked the item.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'POSHMARK',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'knife', 'switchblade',
      'alcohol', 'liquor', 'wine', 'beer',
    ],
    excludeKeywords: [
      'kitchen', 'cutlery', 'multitool', 'multi-tool', 'butter knife',
    ],
    reason: 'Poshmark prohibits firearms, weapons, knives, ammunition, and alcohol (Prohibited Items Policy).',
  },

  // ---- MERCARI -- broadest of the four (general marketplace). Blocklist sourced directly from
  // Mercari's own official Prohibited Items page (mercari.com/us/help_center/topics/account/
  // policies/prohibited-items, confirmed 2026-08-19, re-confirmed 2026-09-03). Carve-outs mirror
  // Mercari's own stated exceptions: kitchen cutlery/multitools ARE allowed despite the blade ban;
  // mounted/set jewelry containing gems is fine, only LOOSE (unset) gemstones are prohibited.
  // EXPANDED S-CROSS-MARKETPLACE-AUDIT-2026-09-03: added taser/stun gun/self-defense (Mercari's page
  // separately calls out "Self defense items, including military-grade items" -- not obviously
  // covered by the pre-existing weapon/firearm/gun keywords) and gambling/lottery (Mercari's page
  // separately bans "using this service for raffles... or selling lottery tickets and pull tabs").
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'MERCARI',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'knife', 'blade', 'explosive',
      'taser', 'stun gun', 'self defense',
      'narcotic', 'drug', 'prescription', 'alcohol', 'liquor', 'wine', 'beer', 'tobacco',
      'cigarette', 'cigar', 'vape', 'e-cigarette', 'cbd', 'supplement', 'vitamin', 'food',
      'gold', 'silver', 'platinum', 'precious metal', 'bullion', 'loose gem', 'loose diamond',
      'unset diamond', 'gemstone', 'cryptocurrency', 'crypto', 'gift card', 'prepaid card',
      'counterfeit', 'replica', 'taxidermy', 'ivory', 'adult', 'pornographic', 'sex toy',
      'fetish', 'lottery ticket', 'pull tab', 'raffle',
    ],
    excludeKeywords: [
      'kitchen', 'cutlery', 'multitool', 'multi-tool', 'butter knife',
      'ring', 'necklace', 'bracelet', 'earring', 'pendant', 'jewelry', 'jewellery', 'mounted',
    ],
    reason: 'This category isn’t allowed on Mercari (Prohibited Items policy).',
  },

  // ---- VINTED -- broader than originally assumed: Women/Men/Designer/Kids/Home/Electronics/
  // Books & Media/Hobbies & Collectibles/Sports all exist as real catalog categories
  // (vinted.com/help/16, confirmed 2026-08-19). Blocklist sourced from Vinted's own official
  // "Items not allowed" page. NOTE (flagged explicitly per this dispatch): Vinted's official page
  // bans "Furniture for adults" as a Non-category item DESPITE a "Home" catalog tab existing --
  // third-party sources claim Home includes small furniture, but going with Vinted's own primary
  // source as authoritative (more specific, more recent) -- 'furniture' is blocked here.
  // NARROWED S-CROSS-MARKETPLACE-AUDIT-2026-09-03: knife/blade/weapon/firearm/gun moved OUT of this
  // rule and into a dedicated rule below -- Vinted's real sharp-tools policy is much more specific
  // than a single generic ban (see that rule's own comment), and folding it in here would have given
  // every blocked knife the wrong, generic "Items Not Allowed" reason text instead of the real one.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'VINTED',
    nameKeywords: [
      'hazmat', 'food', 'drink', 'beverage',
      'medicine', 'medicinal', 'supplement', 'cosmetic', 'sanitary', 'tampon', 'recalled',
      'counterfeit', 'replica', 'cryptocurrency', 'crypto', 'coin', 'banknote', 'stamp',
      'fur', 'ivory', 'reptile skin', 'vape', 'e-cigarette', 'fetish', 'furniture',
      // Confirmed on Vinted's own page this session, not previously covered:
      'musical instrument', 'cycling helmet', 'safety harness', 'heated tobacco',
    ],
    excludeKeywords: ['sealed', 'unopened', 'unused', 'new,', 'album', 'holder', 'case', 'sleeve'],
    reason: 'This category isn’t allowed on Vinted (Items Not Allowed policy).',
  },

  // ---- VINTED SHARP KNIVES, BLADED TOOLS & WEAPONS (added S-CROSS-MARKETPLACE-AUDIT-2026-09-03) --
  // the old combined VINTED rule's weapon coverage was exactly as incomplete as Facebook's pre-fix
  // rule (only knife/blade/weapon/firearm/gun -- no dagger/sword/bayonet/ammo/explosive/taser/etc,
  // so a "Ceremonial Dagger" would have slipped through here exactly like it slipped through
  // Facebook). Sourced directly from vinted.com/help/52-items-not-allowed-on-vinted (fetched live
  // this session). Vinted's knife policy is UNUSUALLY STRICT and UNUSUALLY SPECIFIC compared to
  // every other platform in this file: it bans ALL sharp knives and bladed tools with a pointed tip
  // INCLUDING ordinary kitchen knives (bread/steak/butcher) -- the ONLY exception is "table knives
  // with a dull blade and rounded tip, such as butter knives" and "cartridge and electric razors...
  // in new condition, sealed." This is the opposite of Facebook/Mercari's culinary carve-out --
  // deliberately does NOT exclude 'kitchen'/'cutlery' here, only the specific dull-blade exceptions
  // Vinted itself states. Also covers Vinted-specific bladed-tool categories not obviously implied
  // by "knife": crafting/fabric scissors, axes, chainsaws, straight razors.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'VINTED',
    nameKeywords: [
      'knife', 'blade', 'dagger', 'sword', 'bayonet', 'machete', 'axe', 'chainsaw',
      'straight razor', 'razor blade', 'scissors', 'throwing star', 'stiletto',
      'switchblade', 'butterfly knife',
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'explosive',
      'taser', 'stun gun', 'nunchuck', 'nunchaku', 'baton', 'brass knuckle', 'pepper spray',
    ],
    excludeKeywords: [
      'butter knife', 'table knife', 'electric razor', 'cartridge razor',
    ],
    reason: 'Vinted prohibits all sharp knives and bladed tools with a pointed tip (including kitchen knives), plus firearms, ammunition, and other weapons (Items Not Allowed policy). Only dull/rounded table knives and sealed electric or cartridge razors are allowed.',
  },
];

function normText(text: string | null | undefined): string {
  return (text || '').toLowerCase();
}

/**
 * S-FB-WEAPON-COIN-FIX-2026-09-03: category-only text is what caused the coin-tube/coin-slab
 * false-positive (see EligibilityCheckItem.title comment) -- a coin accessory's category is
 * typically the generic "Coins & Paper Money" while the word that actually identifies it as an
 * ALLOWED accessory (tube/slab/holder/etc.) only ever appears in the item's title. Combining both
 * fields gives every nameKeywords/excludeKeywords match real signal from both. Category is listed
 * first so a bare category match still counts as a match with no title at all (title is optional).
 */
function buildHaystack(item: EligibilityCheckItem): string {
  return `${normText(item.category)} ${normText(item.title)}`.trim();
}

/**
 * Checks whether an item is eligible to be listed on the given marketplace, per this registry.
 * Returns { eligible: true, reason: null } for any platform with no rule defined here
 * (e.g. CRAIGSLIST, GUMTREE_AU -- general marketplaces this registry doesn't gate at all).
 *
 * S-FB-WEAPON-COIN-FIX-2026-09-03: previously used RULES.find(), so only the FIRST rule for a
 * platform was ever consulted -- a real latent bug once a platform needed more than one rule
 * (exactly what adding the FACEBOOK weapons rule alongside the existing coin/currency rule hit).
 * Now evaluates EVERY rule for the platform: any blocking CATEGORY_BLOCKLIST match, or any failed
 * CATEGORY_ALLOWLIST match, makes the item ineligible (first blocking rule's reason wins).
 */
export function checkEligibility(platform: EligibilityPlatform, item: EligibilityCheckItem): EligibilityResult {
  const rules = RULES.filter((r) => r.platform === platform);
  if (rules.length === 0) return { eligible: true, reason: null };

  for (const rule of rules) {
    if (rule.type === 'CATEGORY_BLOCKLIST') {
      if (rule.ebayCategoryIds && item.ebayCategoryId && rule.ebayCategoryIds.includes(item.ebayCategoryId)) {
        return { eligible: false, reason: rule.reason };
      }
      const haystack = buildHaystack(item);
      if (!haystack) continue; // no data -> no reason to block on this rule, see file header
      const isBlocked = rule.nameKeywords.some((kw) => haystack.includes(kw));
      if (!isBlocked) continue;
      const isExcluded = (rule.excludeKeywords || []).some((kw) => haystack.includes(kw));
      if (isExcluded) continue;
      return { eligible: false, reason: rule.reason };
    }

    if (rule.type === 'CATEGORY_ALLOWLIST') {
      const haystack = buildHaystack(item);
      if (!haystack) return { eligible: false, reason: rule.reason }; // can't confirm -> hidden by default, see file header
      const isAllowed = rule.nameKeywords.some((kw) => haystack.includes(kw));
      if (!isAllowed) return { eligible: false, reason: rule.reason };
    }

    // ATTRIBUTE_AGE_ALLOWLIST / PREREQUISITE_LOOKUP: reserved, no rules of these shapes exist yet
    // -- no-op, neither blocks nor requires anything.
  }

  return { eligible: true, reason: null };
}
