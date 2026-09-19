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

export type EligibilityPlatform = 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED' | 'REVERB';

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
  /** If a nameKeywords match is ALSO explained by one of these (e.g. "tee" matching a plumbing
   * "Union TEE" fitting, or "clothing" matching a "Clothing Rack" retail fixture), the match doesn't
   * count -- same carve-out pattern as CategoryBlocklistRule.excludeKeywords, just inverted: here it
   * takes an item OUT of "eligible" instead of OUT of "blocked". */
  excludeKeywords?: readonly string[];
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
    // Extended S-FB-COMPLIANCE-AUDIT-2026-09-18 (Patrick-requested full Commerce Policy
    // deep-dive, see claude_docs/audits/facebook-marketplace-compliance-audit-2026-09-18.md):
    // Meta's real-money/cash-equivalent ban is enforced in practice against bullion sold by
    // metal weight too, not just face-value currency -- sellers report bullion/precious-metal
    // listings getting removed even when clearly framed as collectible. Adding the same risk
    // posture already applied to coins. Reuses the exact same excludeKeywords carve-out below
    // (tube/holder/etc.) so bullion storage accessories stay eligible.
    nameKeywords: [
      'coin', 'currency', 'paper money',
      'bullion', 'silver bar', 'gold bar', 'silver round', 'gold round', 'troy ounce',
    ],
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
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: bare 'gun'/'blade' keywords above are
      // substring-matched (see checkEligibility), so compound words that merely CONTAIN them were
      // false-blocked -- confirmed live via real Artifact-sale items: "...Gunmetal Black" golf club
      // and "Bladerunner Inline Skates" (brand name). Neither is a weapon. Excluding the specific
      // false-positive words rather than rewriting the matcher to word-boundary regex, which would
      // also stop matching real compound weapon terms like "shotgun"/"handgun"/"airgun".
      'gunmetal', 'bladerunner',
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

  // ---- FACEBOOK SUPPLEMENTS/UNSAFE HEALTH PRODUCTS (added S-FB-COMPLIANCE-AUDIT-2026-09-18,
  // Patrick-requested full Commerce Policy deep-dive after the 2026-09-03 dagger/weapons account
  // restriction -- see claude_docs/audits/facebook-marketplace-compliance-audit-2026-09-18.md).
  // Meta's Restricted Goods policy explicitly names anabolic steroids, human growth hormone, and
  // several specific unsafe supplement ingredients. Low volume for an estate-sale business but a
  // real category (vintage medicine cabinets, old supplement stock) and cheap/low-false-positive
  // to add -- these terms essentially never appear in ordinary resale listings for other reasons.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['steroid', 'anabolic', 'human growth hormone', 'hgh', 'ephedra', 'dhea', 'comfrey'],
    reason: 'Facebook Marketplace does not allow listing unsafe supplements or controlled hormonal products (Commerce Policy).',
  },

  // ---- FACEBOOK RECALLED PRODUCTS (added S-FB-COMPLIANCE-AUDIT-2026-09-18) -- Meta bans listing
  // items subject to an official safety recall. Relevant to estate-sale inventory (old baby gear,
  // recalled small appliances). Scoped to explicit recall language only, not a guess at which
  // products are recalled (that would need an external recall database, out of scope here).
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['recalled', 'recall notice', 'subject to recall'],
    reason: 'Facebook Marketplace does not allow listing products subject to a safety recall (Commerce Policy).',
  },

  // ---- FACEBOOK HAZARDOUS MATERIALS (added S-FB-COMPLIANCE-AUDIT-2026-09-18) -- mirrors the
  // hazmat keyword CRAIGSLIST already has below; Facebook had none despite banning the same
  // category (flammable liquids, toxic chemicals, radioactive materials, damaged/swollen
  // batteries -- the last two are a real estate-sale/electronics-resale hazard).
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['hazmat', 'flammable', 'toxic chemical', 'radioactive', 'damaged battery', 'swollen battery'],
    reason: 'Facebook Marketplace does not allow listing hazardous materials (Commerce Policy).',
  },

  // ---- FACEBOOK GAMBLING (added S-FB-COMPLIANCE-AUDIT-2026-09-18) -- lottery tickets, raffle
  // entries, and casino chips/services are explicitly restricted by Meta.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['lottery ticket', 'raffle ticket', 'casino chip'],
    reason: 'Facebook Marketplace does not allow listing lottery tickets, raffle entries, or gambling-related items (Commerce Policy).',
  },

  // ---- FACEBOOK COUNTERFEIT/REPLICA/STOLEN GOODS (added S-FB-COMPLIANCE-AUDIT-2026-09-18) --
  // CRAIGSLIST already has this category below; Facebook's own Commerce Policy bans it too
  // (counterfeit/knockoff goods, stolen property) but had no rule at all. 'replica' is
  // deliberately included WITHOUT an excludeKeywords carve-out for things like "replica jersey" --
  // unlike the weapons rule's culinary-knife carve-out (a clear, narrow, unambiguous safe case),
  // there is no comparably narrow and common legitimate "replica" usage in estate/yard-sale
  // resale inventory to justify one, and erring toward blocking matches this audit's stated bar
  // ("false negatives are unacceptable") for a platform-ban-risk category. Revisit with a real
  // carve-out only if false positives are actually observed in production.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['counterfeit', 'replica', 'knockoff', 'bootleg', 'stolen'],
    reason: 'Facebook Marketplace does not allow listing counterfeit, replica, or stolen goods (Commerce Policy).',
  },

  // ---- FACEBOOK GIFT CARDS/DIGITAL GOODS/EVENT TICKETS (added S-FB-COMPLIANCE-AUDIT-2026-09-18)
  // -- Meta restricts/bans gift card resale, digital goods and subscription/account resale
  // (streaming, game, software-license accounts), and unauthorized event-ticket resale.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['gift card', 'streaming account', 'game account', 'software key', 'digital download', 'event ticket resale'],
    reason: 'Facebook Marketplace does not allow listing gift cards, digital goods/accounts, or resold event tickets (Commerce Policy).',
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
    // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (companion pass to the
    // Facebook-specific audit the same day, see claude_docs/audits/cross-marketplace-
    // compliance-audit-2026-09-18.md) -- re-fetched craigslist.org/about/prohibited live.
    // Added: gambling (lottery/raffle/slot machines), gift/ticket transfer-restricted items,
    // government documents, burglary tools/altered serial numbers, stud service. Also widened
    // 'hazmat'->'hazardous material' and 'narcotic'->'controlled substance' to match the
    // policy's own broader phrasing. Deliberately SKIPPED: "undemilitarized military items"
    // (no reliable way to keyword-detect demilitarized vs. not from title/category text --
    // ordinary military-surplus/collectible items are common, legitimate estate-sale
    // inventory) and "adulterated food/cosmetics"/"medical devices" (low volume/relevance for
    // this business, not worth the false-positive surface).
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'gunpowder', 'firework', 'explosive',
      'stun gun', 'spear gun', 'taser',
      'prescription', 'narcotic', 'controlled substance',
      'alcohol', 'liquor', 'wine', 'beer', 'tobacco', 'cigarette', 'cigar',
      'recalled', 'hazmat', 'hazardous material',
      'ivory',
      'counterfeit', 'replica', 'pirated',
      'stolen',
      'lottery ticket', 'raffle ticket', 'slot machine', 'gambling',
      'gift card', 'government document', 'birth certificate',
      'burglary tool', 'altered serial number', 'stud service',
    ],
    // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above --
    // same bare-'gun'-substring false positive applies here (e.g. "...Gunmetal..." golf clubs).
    excludeKeywords: ['gunmetal'],
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
    // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
    // cross-marketplace-compliance-audit-2026-09-18.md) -- re-fetched help.gumtree.com.au's
    // General posting rules live. Added: gambling, supplement/vitamin (mirrors FACEBOOK's
    // supplement rule), recalled products, used/rebuilt/mercury batteries, electric dog
    // training/shock collars, nitrous-oxide slang terms. Deliberately SKIPPED as low-relevance
    // for an estate-sale platform: single-use plastics, MLM merchandise, dating/massage
    // services, stocks/securities/crypto -- real Gumtree restrictions, but not worth the
    // false-positive surface for this business's inventory mix.
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
      'nitrous oxide', 'nang', 'cream charger',
      'lottery', 'sweepstakes', 'slot machine', 'gambling',
      'supplement', 'vitamin', 'recalled',
      'used battery', 'rebuilt battery', 'mercury battery',
      'shock collar', 'training collar',
    ],
    // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above --
    // same bare-'gun'-substring false positive applies here.
    excludeKeywords: ['gunmetal'],
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
      'sandal', 'bag', 'backpack', 'wallet', 'belt', 'accessory', 'accessories', 'jewelry', 'jewellery', 'watch',
      'sunglasses', 'hat', 'cap', 'beanie', 'scarf', 'scarves', 'glove', 'sock', 'underwear', 'swimwear',
      'romper', 'jumpsuit',
      // BUG FIX 2026-08-23 (Patrick-reported live: "Bored Ape Yacht Club Adidas Tracksuit" incorrectly
      // flagged "may not fit this marketplace" for Grailed). Root-caused via direct code read: this is
      // a substring allowlist against item.category, and the item's real category is "Tracksuits &
      // Sets" (confirmed against fas-grailed.js's own GRAILED_CATEGORY_OVERRIDES entry for the same
      // category string) -- 'tracksuit' was simply missing from the list, a genuine fashion item with
      // no other keyword match. Added the missing term plus its common sibling, both obviously
      // fashion/apparel and equally likely to be missed the same way.
      'tracksuit', 'sweatpant',
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18: real Grailed sub-categories
      // (grailed.com taxonomy, confirmed live) with no keyword match at all -- these are
      // false-NEGATIVE fixes (wrongly hiding legitimate fashion listings), not a compliance
      // risk, same class of bug as the tracksuit fix above.
      'short', 'shorts', 'blazer', 'tuxedo', 'vest', 'polo', 'tank', 'jersey', 'legging',
      'tie', 'glasses', 'slip-on',
    ],
    // BUG FIX 2026-09-05, two rounds (Patrick-reported live, re-tested each time against real
    // items): plain substring matching let several nameKeywords above false-positive on clearly
    // non-fashion products two DIFFERENT ways.
    // Round 1 -- WHOLE-WORD conceptual collisions (a real, correctly-spelled word used in an
    // unrelated sense): "John Guest...Union TEE" (a plumbing push-fit fitting) matched 'tee';
    // "H-Rack Grid Hanger Brackets" (ebayCategoryName "Clothing Racks") matched 'clothing'; "TCL Cool
    // Carry Insulated Backpack Cooler" matched 'backpack'; "Foam Swim Cuffs with Belts" matched
    // 'belt'. Same bug class as the VINTED "musical instrument"/"Musical Instruments & Gear"
    // collision fixed 2026-09-03. Fixed with the excludeKeywords below -- word-boundary matching
    // (round 2) does NOT help here since e.g. "clothing" in "Clothing Rack" is the exact same
    // complete word as "clothing" the fashion keyword, just used in an unrelated sense.
    // Round 2 -- keywords EMBEDDED inside unrelated longer words, found after round 1 was already
    // live: 'tee' matched inside "Stainless STEEl"/"...STEEl RH Good Grips"; 'cap' matched inside
    // "CAPitol Records" (two vinyl LPs); 'hat' matched inside "THAT Latin Feeling" (a third vinyl
    // LP); 'bag' matched inside "Poly BAGged" (a sealed comic book). Fixed at the matcher level --
    // see hasWholeWordMatch's own comment above checkEligibility -- which is also why 'accessor'
    // was replaced with the real complete words 'accessory'/'accessories' just above: a bare
    // 'accessor' prefix can never satisfy a \b...\b whole-word match against "accessories".
    // NOTE: 'hat' matching a golf tournament/memorabilia hat (ebayCategoryName "Balls",
    // ebayCategoryId 27280 -- itself a separate, isolated AI category-suggestion miss, not this
    // file's bug) was deliberately NOT excluded here -- real fashion hats/caps are common, legitimate
    // Grailed listings, and there's no reliable keyword to separate "golf memorabilia hat" from
    // "streetwear cap" without risking hiding genuine fashion items. That one stays a known
    // soft-heuristic gap, not silently patched over.
    excludeKeywords: [
      'push-fit', 'push to connect', // plumbing fittings (e.g. "Union TEE") -- not a t-shirt
      'clothing rack', 'garment rack', // retail fixtures -- not clothing itself
      'cooler', // "Backpack Cooler" -- a cooler, not a fashion backpack
      'training aid', // "Swim Cuffs with Belts" -- swim gear, not a fashion belt
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18: same false-positive class as
      // the fixes above, applied to the new 'vest'-adjacent keyword 'belt' risk noted this audit.
      'belt sander', 'conveyor belt', 'seatbelt',
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
    // RESOLVED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (Patrick decision 2026-09-18):
    // re-fetched Poshmark's Prohibited Items Policy live -- current version is v4.1, "Effective
    // August 27 2026", which lists Electronics under "Restricted Items" (allowed if factory-reset),
    // NOT "Prohibited". CONFIRMED KEPT as the intentional default anyway: factory-reset status
    // can't be verified from listing category/title text, so there's no reliable way to only let
    // through the electronics Poshmark's own policy would actually allow -- staying blocked avoids
    // guessing. Poshmark's Electronics is also a curated/vetted catalog per their 2021 policy post,
    // not a general secondhand-electronics category, which was the original reasoning for this
    // block. Added 'used sock' (policy also bans used socks, not just used underwear).
    nameKeywords: [
      'food', 'opened beauty', 'used beauty', 'opened cosmetic', 'used cosmetic',
      'used personal care', 'used underwear', 'used sock', 'counterfeit', 'replica', 'recalled',
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
    // RESOLVED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (Patrick decision 2026-09-18):
    // flagged this session that Poshmark's v4.1 policy states the knife exception narrowly as
    // "table knives" only, while the old excludeKeywords (kitchen/cutlery/multitool) were broader
    // than that -- exempting ordinary chef/kitchen knives Poshmark's own policy does not exempt.
    // Given the whole reason this audit chain exists is an account-strike risk from an
    // under-restricted weapon rule (the original Facebook dagger incident), tightened this to
    // match the policy's actual "table knives" (dull blade) exception instead of leaving the
    // broader, more permissive exclude in place. Real behavior change: ordinary kitchen/chef
    // knives, cutlery sets, and multitools are now blocked on Poshmark same as any other knife --
    // only literal table/butter knives are exempt.
    nameKeywords: [
      'weapon', 'firearm', 'gun', 'ammo', 'ammunition', 'knife', 'switchblade',
      'alcohol', 'liquor', 'wine', 'beer',
    ],
    excludeKeywords: [
      'table knife', 'butter knife',
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above.
      'gunmetal',
    ],
    reason: 'Poshmark prohibits firearms, weapons, knives, and ammunition (only dull-bladed table knives are allowed), plus alcohol (Prohibited Items Policy, v4.1).',
  },

  // ---- POSHMARK DRUGS/HAZMAT/MEDICAL/ANIMAL PRODUCTS (added S-CROSS-MARKETPLACE-COMPLIANCE-
  // AUDIT-2026-09-18, see claude_docs/audits/cross-marketplace-compliance-audit-2026-09-18.md) --
  // v4.1 policy (poshmark.com/prohibited_items_policy, effective 2026-08-27) separately bans
  // drugs/tobacco/paraphernalia, certain medical devices, hazardous materials, and endangered-
  // animal-derived products -- none of which the rules above cover at all. Split into its own
  // rule (same pattern as the weapons/alcohol split above) so the shown reason is accurate.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'POSHMARK',
    nameKeywords: [
      'drug', 'cannabis', 'hemp', 'cbd', 'paraphernalia', 'baby formula',
      'medical device', 'contact lens', 'breast pump', 'pill press',
      'hazardous material', 'aerosol', 'combustible', 'pesticide', 'radioactive',
      'turtle shell', 'pangolin', 'big cat fur',
    ],
    reason: 'Poshmark prohibits drugs/paraphernalia, certain medical devices, hazardous materials, and endangered-animal products (Prohibited Items Policy, v4.1).',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
      // cross-marketplace-compliance-audit-2026-09-18.md) -- re-fetched Mercari's Prohibited
      // Items page live. Deliberately did NOT add hazmat/battery/aerosol/flammable-liquid
      // keywords -- confirmed those are a Mercari SHIPPING-LABEL requirement, not a listing
      // prohibition (items ARE sellable with the right hazmat shipping label); adding them here
      // would wrongly block sellable inventory. Used specific phrases ("stock certificate" not
      // bare "security", "warranty contract" not bare "warranty") to avoid false-positiving on
      // common resale items like security cameras/systems or extended-warranty paperwork.
      'live animal', 'human body part', 'human material',
      'account credential', 'login information', 'malware', 'virus', 'spyware',
      'digital download', 'ebook', 'in-game item', 'dropship',
      'stock certificate', 'bond certificate', 'insurance policy', 'warranty contract',
      'mystery purchase', 'mod chip',
    ],
    excludeKeywords: [
      'kitchen', 'cutlery', 'multitool', 'multi-tool', 'butter knife',
      'ring', 'necklace', 'bracelet', 'earring', 'pendant', 'jewelry', 'jewellery', 'mounted',
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above.
      'gunmetal', 'bladerunner',
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
      'counterfeit', 'replica', 'bootleg', 'cryptocurrency', 'crypto', 'coin', 'banknote', 'stamp',
      'fur', 'ivory', 'reptile skin', 'shell', 'vape', 'e-cigarette', 'fetish', 'furniture',
      // Confirmed on Vinted's own page this session, not previously covered:
      'cycling helmet', 'safety harness', 'heated tobacco',
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18 (see claude_docs/audits/
      // cross-marketplace-compliance-audit-2026-09-18.md): archaeological/cultural-heritage
      // artifacts, cleaning chemicals, used piercings, live animals, and stolen/blocked
      // electronics devices -- all confirmed on Vinted's current "Items not allowed" page with
      // zero prior keyword coverage. NOTE: the plain 'furniture' keyword above is technically
      // broader than Vinted's real "adult furniture only" ban, but left as-is -- Vinted has no
      // general furniture category to begin with, so this is moot in practice.
      'archaeological artifact', 'cultural heritage artifact', 'detergent', 'cleaning chemical',
      'used piercing', 'live animal', 'jailbroken', 'carrier blocked', 'imei blocked',
      // 'musical instrument' REMOVED S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03 -- it matched
      // FindA.Sale's own umbrella category label "Musical Instruments & Gear" as a substring
      // ("instrument" inside "instruments"), so it blocked the ENTIRE category including gear/
      // accessories (guitar straps, cables, tuners, pickups, amps, cases, effects pedals -- 11 of
      // 13 real items live-queried this session were gear, not instruments). Vinted's real policy
      // (vinted.com/help/52-items-not-allowed-on-vinted, fetched live this session) says "Musical
      // instruments for adults" -- actual instruments only. Replaced with a dedicated, narrower
      // rule below that targets real instrument words and excludes gear/accessory terms.
    ],
    excludeKeywords: [
      'sealed', 'unopened', 'unused', 'new,', 'album', 'holder', 'case', 'sleeve',
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: Vinted's coin/currency excludeKeywords was
      // missing several accessory words the FACEBOOK coin rule already carries (see that rule) --
      // confirmed live: "BCW Dime Coin Tubes" (ebayCategoryName "Coin Tubes") was wrongly blocked
      // because 'tube' wasn't excluded (its "Quarter" sibling escaped only by luck, via a
      // differently-mapped category "Holders" that happened to hit the existing 'holder' exclude).
      'tube', 'capsule', 'slab', 'flip', 'display', 'mount', 'folder', 'box', 'organizer', 'storage',
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18: Vinted explicitly allows NEW
      // water filter cartridges (only used/refrigerant-adjacent ones are banned) -- excluded here
      // rather than added as a block. Also excluding common jewelry/craft uses of 'shell' (the
      // new animal-product keyword added below) so seashell jewelry/decor isn't wrongly caught.
      'water filter', 'seashell', 'shell necklace', 'shell jewelry',
    ],
    reason: 'This category isn’t allowed on Vinted (Items Not Allowed policy).',
  },

  // ---- VINTED MUSICAL INSTRUMENTS (added S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03) -- split out
  // of the general VINTED rule above, which used a single overbroad 'musical instrument' keyword
  // that matched FindA.Sale's own "Musical Instruments & Gear" category label itself (see that
  // rule's comment). Vinted's real policy (fetched live this session) bans "Musical instruments for
  // adults" -- actual playable instruments, not gear/accessories. nameKeywords below list real
  // instrument-family words (word-anchored where practical); excludeKeywords carves out the
  // accessory/gear terms confirmed live in Artifact's real "Musical Instruments & Gear" items this
  // session (speaker, pickup, cable, strap, tuner, amplifier, case, effects pedal) so those stay
  // listable -- only the actual instruments (e.g. "Fanned Frets 6 Strings Headless Electric
  // Guitar", "Yamaha F-325 Acoustic Guitar") are blocked, per policy.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'VINTED',
    nameKeywords: [
      'guitar', 'piano', 'violin', 'viola', 'cello', 'double bass', 'upright bass',
      'drum kit', 'drum set', 'saxophone', 'trumpet', 'trombone', 'clarinet', 'flute',
      'banjo', 'ukulele', 'mandolin', 'harmonica', 'accordion', 'synthesizer', 'keyboard piano',
      'harp', 'bagpipe', 'cornet', 'french horn', 'tuba', 'oboe', 'bassoon', 'xylophone',
    ],
    excludeKeywords: [
      'strap', 'amplifier', 'combo amplifier', 'speaker', 'pickup', 'cable', 'tuner', 'case',
      'pedal', 'effects', 'stand', 'string set', 'capo', 'gig bag', 'pedalboard', 'pedal board',
    ],
    reason: 'Vinted does not allow listing musical instruments (Items Not Allowed policy).',
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
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above --
      // same bare-'gun'/'blade'-substring false positives apply here (confirmed live: a golf club
      // titled "...Gunmetal Black" and "Bladerunner Inline Skates", a brand name).
      'gunmetal', 'bladerunner',
    ],
    reason: 'Vinted prohibits all sharp knives and bladed tools with a pointed tip (including kitchen knives), plus firearms, ammunition, and other weapons (Items Not Allowed policy). Only dull/rounded table knives and sealed electric or cartridge razors are allowed.',
  },

  // ---- REVERB (added 2026-09-14, ADR addendum -- Patrick explicitly rejected excluding Reverb
  // from this registry, "make it just like every other site"). Sourced live this session:
  // reverb.com/page/prohibited-items-policy and help.reverb.com/hc/en-us/articles/115014277407
  // ("Listing Guidelines: Prohibited Items and Actions") -- Reverb allows musical instruments,
  // gear, accessories, home audio equipment, and recording equipment/setups; prohibits non-music
  // general electronics (standalone computers, phones, tablets -- though computer bundles paired
  // with recording setups and mp3 players as home audio ARE allowed), IP/trademark violations,
  // and hate content. Allowlist, not blocklist -- same reasoning as GRAILED above (Reverb's
  // entire business is this one vertical; enumerating every non-music category to block would be
  // unreliable).
  //
  // Kept in lockstep with the SERVER-SIDE gate that actually blocks the real push, not
  // reconstructed independently from raw keyword guessing: reverbMarketplaceController.ts's
  // pushItemToReverb already hard-gates on `item.category === 'Musical Instruments & Gear'`
  // (REVERB_ELIGIBLE_CATEGORY, added 2026-09-02 after a live Patrick-reported bug where the
  // "Push to Reverb" action showed up on unrelated items). Matching that exact category string
  // here -- rather than the broader per-word instrument/gear keyword lists used by the VINTED
  // musical-instrument rules above -- means the collapsed-row ELIGIBLE dot can never promise a
  // push that the real endpoint would then reject with a 422. A looser keyword allowlist would
  // risk exactly that: showing ELIGIBLE for an item the actual push route refuses.
  {
    type: 'CATEGORY_ALLOWLIST',
    platform: 'REVERB',
    nameKeywords: ['musical instruments & gear'],
    reason: 'Reverb is for musical instruments & gear only (Listing Guidelines: Prohibited Items and Actions).',
  },
];

function normText(text: string | null | undefined): string {
  return (text || '').toLowerCase();
}

// BUG FIX 2026-09-05 round 2 (Patrick-reported live, re-tested after the round-1 excludeKeywords
// fix above): round 1 only addressed WHOLE-WORD conceptual collisions (a real word used in an
// unrelated sense, e.g. "clothing" inside "Clothing Rack"). It did NOT catch a worse, separate class
// of bug: plain substring matching also fires when a short keyword is merely EMBEDDED inside an
// unrelated longer word. DB-confirmed this session, after round 1 was already live: 'tee' matched
// inside "Stainless STEEl" and "...STEEl RH Good Grips" (a homebrewing chiller and a golf club set);
// 'cap' matched inside "CAPitol Records" (two separate vinyl LPs); 'hat' matched inside "THAT Latin
// Feeling" (a third vinyl LP); 'bag' matched inside "Poly BAGged" (a sealed comic book) -- none of
// these five items have anything to do with fashion. Scoped to CATEGORY_ALLOWLIST only (Grailed) --
// CATEGORY_BLOCKLIST's existing plain-substring behavior is intentionally left untouched, since the
// FACEBOOK/CRAIGSLIST/GUMTREE_AU/VINTED weapons rules above deliberately rely on 'gun' matching
// INSIDE compound words like "shotgun"/"handgun"/"airgun" (see that rule's own comment) -- a
// blanket word-boundary rewrite would silently stop catching those.
function hasWholeWordMatch(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Tolerate a common plural suffix (s/es) after the keyword -- e.g. 'shoe' must still match
  // "Sneakers"/"Shoes"/"Boots", not just the bare singular -- without this, word-boundary matching
  // (which fixes the steel/capitol/that/polybagged false positives above) would itself introduce a
  // NEW false-NEGATIVE regression on ordinary plural fashion listings. Does not cover the one true
  // irregular plural in this file, 'scarf' -> 'scarves' (f -> v); 'scarves' is listed as its own
  // separate keyword below instead.
  return new RegExp(`\\b${escaped}(e?s)?\\b`, 'i').test(haystack);
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
      // Whole-word match for nameKeywords (see hasWholeWordMatch's own comment) -- excludeKeywords
      // stays plain substring since every entry there is already a multi-word phrase or a term that
      // only ever appears as a genuine standalone token in real data (no embedded-substring risk).
      const isAllowed = rule.nameKeywords.some((kw) => hasWholeWordMatch(haystack, kw));
      const isExcluded = (rule.excludeKeywords || []).some((kw) => haystack.includes(kw));
      if (!isAllowed || isExcluded) return { eligible: false, reason: rule.reason };
    }

    // ATTRIBUTE_AGE_ALLOWLIST / PREREQUISITE_LOOKUP: reserved, no rules of these shapes exist yet
    // -- no-op, neither blocks nor requires anything.
  }

  return { eligible: true, reason: null };
}
