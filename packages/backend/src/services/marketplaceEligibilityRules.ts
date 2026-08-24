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

export type EligibilityPlatform = 'FACEBOOK' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED';

export interface EligibilityCheckItem {
  category: string | null | undefined;
  ebayCategoryId: string | null | undefined;
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

  // ---- MERCARI -- broadest of the four (general marketplace). Blocklist sourced directly from
  // Mercari's own official Prohibited Items page (mercari.com/us/help_center/topics/account/
  // policies/prohibited-items, confirmed 2026-08-19). Carve-outs mirror Mercari's own stated
  // exceptions: kitchen cutlery/multitools ARE allowed despite the blade ban; mounted/set
  // jewelry containing gems is fine, only LOOSE (unset) gemstones are prohibited.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'MERCARI',
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'knife', 'blade', 'explosive',
      'narcotic', 'drug', 'prescription', 'alcohol', 'liquor', 'wine', 'beer', 'tobacco',
      'cigarette', 'cigar', 'vape', 'e-cigarette', 'cbd', 'supplement', 'vitamin', 'food',
      'gold', 'silver', 'platinum', 'precious metal', 'bullion', 'loose gem', 'loose diamond',
      'unset diamond', 'gemstone', 'cryptocurrency', 'crypto', 'gift card', 'prepaid card',
      'counterfeit', 'replica', 'taxidermy', 'ivory', 'adult', 'pornographic', 'sex toy',
      'fetish',
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
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'VINTED',
    nameKeywords: [
      'knife', 'blade', 'weapon', 'firearm', 'gun', 'hazmat', 'food', 'drink', 'beverage',
      'medicine', 'medicinal', 'supplement', 'cosmetic', 'sanitary', 'tampon', 'recalled',
      'counterfeit', 'replica', 'cryptocurrency', 'crypto', 'coin', 'banknote', 'stamp',
      'fur', 'ivory', 'reptile skin', 'vape', 'e-cigarette', 'fetish', 'furniture',
    ],
    excludeKeywords: ['sealed', 'unopened', 'unused', 'new,', 'album', 'holder', 'case', 'sleeve'],
    reason: 'This category isn’t allowed on Vinted (Items Not Allowed policy).',
  },
];

function normCategory(category: string | null | undefined): string {
  return (category || '').toLowerCase();
}

/**
 * Checks whether an item is eligible to be listed on the given marketplace, per this registry.
 * Returns { eligible: true, reason: null } for any platform with no rule defined here
 * (e.g. CRAIGSLIST, GUMTREE_AU -- general marketplaces this registry doesn't gate at all).
 */
export function checkEligibility(platform: EligibilityPlatform, item: EligibilityCheckItem): EligibilityResult {
  const rule = RULES.find((r) => r.platform === platform);
  if (!rule) return { eligible: true, reason: null };

  if (rule.type === 'CATEGORY_BLOCKLIST') {
    if (rule.ebayCategoryIds && item.ebayCategoryId && rule.ebayCategoryIds.includes(item.ebayCategoryId)) {
      return { eligible: false, reason: rule.reason };
    }
    const category = normCategory(item.category);
    if (!category) return { eligible: true, reason: null }; // no data -> no reason to block, see file header
    const isBlocked = rule.nameKeywords.some((kw) => category.includes(kw));
    if (!isBlocked) return { eligible: true, reason: null };
    const isExcluded = (rule.excludeKeywords || []).some((kw) => category.includes(kw));
    if (isExcluded) return { eligible: true, reason: null };
    return { eligible: false, reason: rule.reason };
  }

  if (rule.type === 'CATEGORY_ALLOWLIST') {
    const category = normCategory(item.category);
    if (!category) return { eligible: false, reason: rule.reason }; // can't confirm -> hidden by default, see file header
    const isAllowed = rule.nameKeywords.some((kw) => category.includes(kw));
    return isAllowed ? { eligible: true, reason: null } : { eligible: false, reason: rule.reason };
  }

  // ATTRIBUTE_AGE_ALLOWLIST / PREREQUISITE_LOOKUP: reserved, no rules of these shapes exist yet.
  return { eligible: true, reason: null };
}
