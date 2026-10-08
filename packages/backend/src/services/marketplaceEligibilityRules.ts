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
import { etsyWhenMadeQualifies } from '../config/etsyWhenMade';

export type EligibilityPlatform = 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED' | 'REVERB' | 'ETSY';

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

  /**
   * Package weight/dimensions, for the SIZE_WEIGHT_CEILING rule shape below
   * (S-SIZE-WEIGHT-CEILING-2026-09-27, Patrick-requested: "why is the extension allowing me to
   * push [oversized] items to Vinted" -- root cause was that no weight/size gating existed
   * anywhere in the codebase for ANY marketplace, confirmed by direct code search this session).
   *
   * Effective weight is packageWeightOz ?? aiPackageWeightOz -- the SAME fallback fas-vinted.js
   * and fas-mercari.js already use client-side for their own "does this fit" logic (see
   * extensionController.ts's shaped-response comments), so this eligibility check reasons about
   * the same effective number the extension will actually act on.
   *
   * Deliberately NOT gated on hasTrustedPackage()/packageConfirmedByOrganizer the way
   * extensionController.ts gates the *exposed* weight fields for Facebook's real label-purchase
   * flow -- that gate exists because a wrong guess there costs Patrick real money on a bought
   * shipping label. This file is a permissive, defense-in-depth UX filter (see file header: "not
   * the sole compliance gate -- each platform's own listing form still enforces its own rules at
   * submission time"), so an unconfirmed AI estimate is still useful signal for "don't even
   * suggest this platform." Missing data still defaults to eligible (see checkEligibility below)
   * -- same permissive-on-missing-data posture as CATEGORY_BLOCKLIST.
   */
  packageWeightOz?: number | null;
  aiPackageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageHeightIn?: number | null;

  /**
   * ETSY (ATTRIBUTE_AGE_ALLOWLIST, ADR-135 D4.2, batch E-B2). All optional; no other platform reads
   * any of these four fields, so omitting them changes nothing for existing platforms.
   *
   * etsyWhenMade: organizer-attested Etsy era value (a `when_made` enum string, see
   *   config/etsyWhenMade.ts). Unknown values are treated as missing data.
   * etsyIsCraftSupply: organizer ticked "This is a craft or party supply". Passes the rule when no
   *   releaseYear is present. It can NEVER rescue an item whose releaseYear is too recent.
   * releaseYear: four-digit release year from the card record (Item.card.releaseYear, ADR-134).
   *   When a number, it decides alone.
   * asOfYear: test injection for the year the age is measured against. Defaults to
   *   new Date().getFullYear(), the ONLY clock read in this file (done inside the ETSY handler at
   *   call time, never at import), so the registry stays deterministic under test.
   */
  etsyWhenMade?: string | null;
  etsyIsCraftSupply?: boolean | null;
  releaseYear?: number | null;
  asOfYear?: number;

  /**
   * True when the item is a bulk lot (ADR-136 Addendum C): priced per 1,000 cards and counted in cards, so no outside
   * platform can list it. When true every platform answers ineligible with BULK_LOT_ELIGIBILITY_REASON. Optional;
   * callers that do not know pass nothing and nothing changes (the item's DONT_LIST shipping override and the
   * export and send guards cover those paths).
   */
  isBulkLot?: boolean | null;
}

/** Plain reason shown when a bulk lot is checked against any platform. */
export const BULK_LOT_ELIGIBILITY_REASON = 'Bulk lots are sold by the card at your counter and on your storefront, and by the bundle on eBay. They cannot be listed on this platform.';

export interface EligibilityResult {
  eligible: boolean;
  reason: string | null;
}

interface CategoryBlocklistRule {
  type: 'CATEGORY_BLOCKLIST';
  platform: EligibilityPlatform;
  /** Case-insensitive, boundary-aware match against Item.category + title (see matchesBlocklistKeyword). Any match -> ineligible (unless excludeKeywords also matches). */
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

// ATTRIBUTE_AGE_ALLOWLIST (ADR-135 D4.2, batch E-B2): the first real rule of this shape, used by
// ETSY. Allowlist posture like CATEGORY_ALLOWLIST: an item is eligible only when its age can be
// confirmed to be at least minAgeYears. Only the ETSY rule below uses it; PREREQUISITE_LOOKUP is
// still a reserved stub (Discogs connector, per the 2026-08-18 Architect memo).
interface AttributeAgeAllowlistRule {
  type: 'ATTRIBUTE_AGE_ALLOWLIST';
  platform: EligibilityPlatform;
  /** Minimum age in years; the cutoff year is computed as asOfYear - minAgeYears, never hard-coded. */
  minAgeYears: number;
  reason: string;
}
interface PrerequisiteLookupRule {
  type: 'PREREQUISITE_LOOKUP';
  platform: EligibilityPlatform;
  reason: string;
}

/**
 * S-SIZE-WEIGHT-CEILING-2026-09-27 (Patrick-requested full research pass, see
 * claude/crosslister-automation-decisions-2026-09-26.md for the sourced per-marketplace matrix):
 * a hard shipping-size/weight ceiling for a platform's OWN automated shipping flow -- the one
 * this extension actually drives. Only added for platforms where exceeding the ceiling is a real
 * dead end for automated crosslisting, not merely a UX nicety, AND where the platform actually
 * has a hard weight/size cutoff at all (see the VINTED note below for a case where it does not):
 *   - POSHMARK: 15lb (raised from 10lb as of Feb 2026; carrier is now USPS Ground Advantage, not
 *     Priority Mail) -- Poshmark's Community Guidelines explicitly prohibit arranging local
 *     pickup/meetups in lieu of shipping, so there is no fallback path here either.
 *   - MERCARI: 50lb / 34"x20" (stated identically on two official pages, each with an explicit
 *     "ship on your own beyond this" fallback statement -- but "on your own" means OUTSIDE
 *     Mercari's own label-purchase flow, which is the flow this extension automates, so past this
 *     ceiling the automation has nothing left to drive). A conflicting "100lb" figure appears on
 *     one older page; flagged unreliable and not used, per the research this session.
 *
 * Deliberately NOT added for:
 *   - VINTED (REMOVED same day it was added, 2026-09-27) -- see the standalone comment above the
 *     RULES array's Vinted section for the full story: this platform has no hard weight ceiling
 *     at all, only a $100 shipping-COST cap that the extension already covers by bumping price
 *     (extensionController.ts's VINTED_SHIPPING_CAP), and the ~44lb figure originally used here
 *     was a misreading of UI copy, disproven by a real successfully-shipped arcade cabinet.
 *   - EBAY / FACEBOOK: both have a real, working local-pickup fallback with no weight ceiling of
 *     its own, so an oversized item is never a dead end on either -- eBay also supports LTL/
 *     freight-class shipping via UPS/FedEx well above USPS's ~70lb ceiling (~150lb/108" girth).
 *   - GRAILED: 20lb is a real threshold, but crossing it routes to a different self-ship XL flow
 *     INSIDE Grailed (not a dead end) rather than a hard block -- no evidence the automation can't
 *     also drive that path, so this file doesn't assume it can't and gate on it.
 *   - CRAIGSLIST / GUMTREE_AU: local-pickup-only marketplaces, no shipping-size concept at all.
 */
interface SizeWeightCeilingRule {
  type: 'SIZE_WEIGHT_CEILING';
  platform: EligibilityPlatform;
  /** Max effective weight in OUNCES (packageWeightOz ?? aiPackageWeightOz) via this platform's own automated shipping flow. Omit if this platform has no weight ceiling worth gating on. */
  maxWeightOz?: number;
  /** Max single longest side in INCHES (the largest of packageLengthIn/WidthIn/HeightIn). Omit if this platform has no documented dimension ceiling worth gating on. */
  maxLongestSideIn?: number;
  reason: string;
}

type EligibilityRule =
  | CategoryBlocklistRule
  | CategoryAllowlistRule
  | AttributeAgeAllowlistRule
  | PrerequisiteLookupRule
  | SizeWeightCeilingRule;

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
      // 2026-09-25-ROUND2 (Patrick asked for a harder second pass across all platforms, done via
      // parallel research agents re-fetching each platform's live policy text): 'firework' was
      // corroborated by secondary sources for Facebook specifically (not a direct primary quote --
      // Meta's own text folds it under "explosives" without naming it) -- cheap, zero-FP addition.
      'firework',
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
      // 2026-09-25-ROUND2: PRIMARY-sourced from transparency.meta.com's live Restricted Goods
      // and Services text (fetched fresh this session, cross-checked against an archive.org
      // snapshot dated 2026-09-21): "animal horns, organs, limbs, carcasses, taxidermy..." is
      // broader than ivory/rhino horn alone. Deliberately did NOT add bare 'tortoiseshell' or
      // 'coral' here -- both are overwhelmingly used for faux/plastic eyewear and jewelry
      // patterns in ordinary resale listings, too high a false-positive surface without a
      // dedicated exclude-list this pass didn't have time to build properly. 'scrimshaw' and
      // 'whalebone'/'baleen' are far more specific antique-material terms with no everyday
      // false-positive use.
      'scrimshaw', 'whalebone', 'baleen',
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
    // 2026-09-25-ROUND2: PRIMARY-sourced from transparency.meta.com's live Restricted Goods text
    // -- a separate, explicit "weight loss or weight gain products" and "skin whitening/bleaching
    // creams" category, not just hormonal supplements. Scoped to specific product-name phrases
    // ("diet pill", not bare "weight loss") since the agent that found this flagged bare
    // "weight loss" as high-false-positive (fitness equipment ad copy).
    nameKeywords: ['steroid', 'anabolic', 'human growth hormone', 'hgh', 'ephedra', 'dhea', 'comfrey', 'diet pill', 'skin whitening cream', 'skin bleaching cream'],
    reason: 'Facebook Marketplace does not allow listing unsafe supplements, weight-loss/skin-whitening products, or controlled hormonal products (Commerce Policy).',
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

  // ---- FACEBOOK LAW ENFORCEMENT / GOVERNMENT IMPERSONATION ITEMS (added 2026-09-25, while
  // answering Patrick's direct question about cross-marketplace weapon/category scrutiny) --
  // Craigslist's own prohibited-items page explicitly bans "police insignia" alongside
  // government IDs/documents, Gumtree AU's explicitly bans "government and transit badges,
  // uniforms, IDs, documents and licenses," and Vinted explicitly bans "armed-forces/police/
  // emergency-services official uniforms and badges" -- all three confirmed via direct fetch of
  // each platform's own current policy page this session. Meta's own Restricted Goods /
  // Commerce Policy pages could NOT be freshly re-fetched this session (transparency.meta.com
  // returned 404/robots-blocked on every attempt) to get an equally direct quote for Facebook
  // specifically -- flagging that honestly rather than treating this as independently confirmed.
  // Added as a precautionary, defense-in-depth measure anyway: Facebook is the one platform in
  // this registry that has ALREADY had a real account restriction from an under-scoped rule
  // (S-FB-WEAPON-COIN-FIX-2026-09-03), law-enforcement/government impersonation items are
  // essentially zero-false-positive keywords for an estate-sale business, and 3 of the other 4
  // platforms audited this session explicitly ban this exact category. Revisit/narrow only if a
  // legitimate item is ever actually blocked by this in production.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['police badge', 'police uniform', 'police insignia', 'law enforcement badge', 'military uniform', 'government id', 'security badge'],
    reason: 'Facebook Marketplace does not allow listing law enforcement, government, or military identification, badges, or uniforms (Commerce Policy, precautionary).',
  },

  // ---- FACEBOOK HISTORICAL ARTIFACTS / CULTURAL HERITAGE (added 2026-09-25-ROUND2, PRIMARY-
  // sourced from transparency.meta.com's live Restricted Goods and Services text, fetched fresh
  // this session, cross-checked against an archive.org snapshot dated 2026-09-21): "Content that
  // attempts to buy, sell, trade, donate or gift or asks for historical artifacts" -- a category
  // with ZERO prior coverage anywhere in this registry. Deliberately did NOT include bare
  // 'artifact' or 'relic' -- 'artifact' is this business's own parent company name (Artifact,
  // LLC) and 'relic' is common non-antiquity branding ("relic finish" guitars/jeans), both too
  // noisy. Scoped to specific, low-ambiguity phrasing instead.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['historical artifact', 'ancient artifact', 'archaeological artifact', 'cultural heritage artifact', 'arrowhead'],
    reason: 'Facebook Marketplace does not allow listing historical or cultural heritage artifacts (Commerce Policy).',
  },

  // ---- FACEBOOK HUMAN REMAINS (added 2026-09-25-ROUND2, PRIMARY-sourced same as above): "human
  // body parts... human fluids" -- estate sales do occasionally surface Victorian mourning/
  // hairwork jewelry and antique "oddity" curios (real human skulls/bones sold as curiosities).
  // excludeKeywords carves out the wig/hair-extension industry's explicit, common use of "human
  // hair" as a normal, legal product descriptor -- without it, 'human hair' would false-positive
  // constantly on legitimate wig/extension listings.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['human skull', 'human bone', 'human remains', 'human hair'],
    excludeKeywords: ['wig', 'hair extension', 'weave', 'ponytail extension', 'clip-in'],
    reason: 'Facebook Marketplace does not allow listing human body parts or remains (Commerce Policy).',
  },

  // ---- FACEBOOK FINANCIAL/EDUCATIONAL DOCUMENTS, VOUCHERS & COUPONS (added 2026-09-26, after
  // Patrick pushed back on the bare 'certificate'/'voucher'/'coupon' version of this rule that
  // a research agent originally proposed and this file's own audit correctly declined to add).
  // PRIMARY source (transparency.meta.com's live Restricted Goods text, same fetch as the
  // artifacts/human-remains rules above): "Vouchers and coupons... Financial documents...
  // Educational documents and professional certificates." The real risk with bare 'certificate'
  // is that it collides constantly with ordinary "certificate of authenticity" language bundled
  // into totally unrelated collectible/art/memorabilia listings -- confirmed this is a REAL
  // structural problem, not just a theoretical one: Item.category here is the eBay L1 category
  // name (schema.prisma comment: "eBay L1 category name, e.g. Home & Garden"), and both a stock
  // certificate for sale AND a signed baseball with an included certificate of authenticity would
  // realistically land in the same L1 bucket ("Collectibles"), so category-based scoping doesn't
  // separate them either -- there's no clean structural signal here, only word choice. Fix:
  // narrow to the actual compound phrases the prohibited items would be titled with instead of
  // the single generic word -- none of these collide with "certificate of authenticity."
  // (Separately, eBay does have a real, distinct L1 category for gift cards specifically
  // -- "Gift Cards & Coupons" -- which COULD be matched via ebayCategoryIds the same way the
  // FACEBOOK coin/currency rule above does, giving a cleaner signal for that one sub-piece. Not
  // built here: this whole category is low-volume for an estate-sale business, and sourcing the
  // exact category ID plus confirming it's populated on our own Item records is more engineering
  // than a low-volume edge case currently justifies. Worth doing properly if this ever becomes a
  // real recurring false-positive/false-negative problem in production.)
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'FACEBOOK',
    nameKeywords: ['stock certificate', 'share certificate', 'diploma', 'professional certificate', 'gift voucher', 'discount coupon'],
    reason: 'Facebook Marketplace does not allow listing financial documents, educational/professional certificates, or vouchers and coupons (Commerce Policy).',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18-ROUND2 (Patrick asked for a second pass -- re-verified each platform's live official policy again to check for anything the first pass missed): re-fetched craigslist.org/about/prohibited again and confirmed a
      // category not caught by the first pass: government-assistance goods (food stamps,
      // WIC vouchers). Narrow, specific phrases -- no legitimate estate-sale item is titled
      // this way.
      'food stamp', 'wic voucher',
      // 2026-09-25: closes weapon-synonym and government-impersonation gaps found while
      // answering Patrick's direct cross-marketplace scrutiny question. Weapon terms mirror
      // FACEBOOK/VINTED's already-broader coverage -- these are unambiguous self-defense/
      // martial-arts weapons (not ordinary tools like knives, which Craigslist deliberately
      // stays silent on per this rule's own header comment) so the evidence gap that justifies
      // NOT banning knives here doesn't apply to them. 'police insignia' is a direct quote from
      // craigslist.org/about/prohibited's own Government ID & Documents line ("ID cards,
      // licenses, police insignia, government documents..."), re-fetched live this session --
      // 'machete' deliberately NOT added here, same reasoning as the knife carve-out (a common
      // legitimate yard/garden tool, no comparable evidence Craigslist restricts it).
      'pepper spray', 'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'butterfly knife', 'throwing star',
      'police insignia',
      // 2026-09-25-ROUND2 (Patrick asked for a harder second pass): re-fetched
      // craigslist.org/about/prohibited AND the Terms of Use (which incorporates the prohibited
      // list by reference, confirmed no further categories there) via a dedicated research pass.
      // Found real quoted lines the first two passes missed: "unsanitized bedding/clothing" and
      // "body parts/fluids" (direct quote), "unpackaged or adulterated food or cosmetics" (direct
      // quote), and animal parts/protected species beyond ivory. Scoped to specific compound
      // phrases per the research agent's own false-positive guidance -- bare 'mattress'/
      // 'bedding'/'food'/'cosmetics' would over-block ordinary clean/new listings.
      'unsanitized', 'used mattress', 'biohazard',
      'homemade food', 'home-canned', 'opened cosmetics', 'used makeup',
      'taxidermy',
      // "US military items not demilitarized in accord with Defense Department policy" -- narrow
      // phrasing only (not bare 'military', which the rule's own original comment already
      // rejected as too noisy against legitimate military-surplus/collectible inventory).
      'ordnance', 'inert grenade', 'not demilitarized',
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
      // 2026-09-25: closes a real dagger/sword/bayonet gap found while answering Patrick's
      // direct question about cross-marketplace weapon-filter coverage -- FACEBOOK and VINTED
      // already had these tokens (this same failure class caused the original Facebook dagger
      // incident, S-FB-WEAPON-COIN-FIX-2026-09-03), GUMTREE_AU/POSHMARK/MERCARI did not.
      'dagger', 'sword', 'bayonet',
      // 2026-09-25 (same session as the dagger fix above): closes weapon-synonym gap for
      // brass knuckles/nunchucks/batons/pepper spray/butterfly knives/machetes/throwing stars --
      // re-fetched help.gumtree.com.au live this session and confirmed the Weapons category
      // (item 37) is explicitly open-ended ("including, but not limited to") and separately
      // names "martial arts weapons" as its own subcategory, which these all fall under. Unlike
      // CRAIGSLIST, Gumtree already bans ALL knives outright (no culinary exception), so
      // 'machete' is included here too -- no comparable tool/weapon tension.
      'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'pepper spray', 'butterfly knife',
      'machete', 'throwing star',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18-ROUND2 (Patrick asked for a second pass -- re-verified each platform's live official policy again to check for anything the first pass missed): re-fetched
      // help.gumtree.com.au's General posting rules again (the full 42-item Restricted
      // Categories list) and confirmed several categories the first pass missed: human
      // remains, burglary tools, government/transit/police badges-uniforms-IDs, the
      // policy's own "controlled substance" phrasing (mirrors the same fix already applied
      // to CRAIGSLIST), pesticides, and pornographic/adult material (Gumtree's own policy
      // separately bans this; the first pass only carried it for Facebook/Mercari/Poshmark).
      // 'human body part'/'human material' specifically (not bare "body part") to avoid
      // colliding with legitimate "auto body part" listings.
      'human body part', 'human material', 'burglary tool',
      'government document', 'government id', 'police badge', 'police uniform', 'military uniform',
      'controlled substance', 'pesticide', 'pornographic', 'adult',
      // 2026-09-25-ROUND2 (Patrick asked for a harder second pass): re-fetched
      // help.gumtree.com.au's full ~42-item Restricted Categories list via a dedicated research
      // pass. Found real quoted lines the first two passes missed: "Identity documents, personal
      // financial records and personal information" (broader than the 'government document'/
      // 'government id' already here -- passports/checkbooks specifically named), "Electronic
      // surveillance equipment", "radar scanners"/illegal telecom, endangered species beyond
      // ivory/rhino horn (taxidermy), and commercial tanning units.
      'identity document', 'passport', 'checkbook',
      'hidden camera', 'spy camera',
      'radar detector', 'police scanner',
      'taxidermy',
      'tanning bed',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18-ROUND2 (Patrick asked for a second pass -- re-verified each platform's live official policy again to check for anything the first pass missed): the unconfirmed lead from the
      // first pass about a possible non-fashion category expansion checked out for real:
      // grailed.com/browse/fragrance is a live, active category (designer perfume/cologne),
      // confirmed by direct fetch this session -- another false-NEGATIVE fix, same class as
      // the tracksuit/shorts fixes above. grailed.com/browse/home-goods also exists but its
      // actual contents couldn't be confirmed live and Grailed is unambiguously a fashion
      // marketplace, so a broad 'home goods' keyword was deliberately NOT added -- too high a
      // false-positive risk of letting non-fashion items through the allowlist for an
      // unconfirmed category.
      'fragrance', 'perfume', 'cologne',
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
      // 2026-09-25: closes a real dagger/sword/bayonet gap, see the GUMTREE_AU rule's comment
      // above for the full story (same fix, same reason, same session).
      'dagger', 'sword', 'bayonet',
      // 2026-09-25: closes the same weapon-synonym gap as GUMTREE_AU/MERCARI above -- Poshmark's
      // own "Firearms, weapons & knives" ban is a broad, unqualified category, and Poshmark
      // already bans ALL non-table-knife blades (see the excludeKeywords note above), so no
      // tool/weapon tension for 'machete' here either.
      'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'pepper spray', 'butterfly knife',
      'machete', 'throwing star',
      'alcohol', 'liquor', 'wine', 'beer',
    ],
    excludeKeywords: [
      'table knife', 'butter knife',
      // S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03: see FACEBOOK weapons rule's comment above.
      'gunmetal',
    ],
    reason: 'Poshmark prohibits firearms, weapons, knives, and ammunition (only dull-bladed table knives are allowed), plus alcohol (Prohibited Items Policy, v4.1).',
  },

  // ---- POSHMARK LAW ENFORCEMENT / GOVERNMENT IMPERSONATION ITEMS (added 2026-09-25, while
  // answering Patrick's direct question about cross-marketplace weapon/category scrutiny) --
  // corroborated via a secondary aggregator source summarizing Poshmark's policy under an
  // "Impersonation and Official Items" category naming police uniforms specifically
  // (listperfectly.com, cross-marketplace prohibited-items comparison, checked live this
  // session) -- the live poshmark.com/prohibited_items_policy page itself only rendered generic
  // Terms-of-Service boilerplate to this session's fetch tool (likely JS-rendered content), so
  // this is corroborated but not a direct primary-source quote the way GUMTREE_AU/VINTED/
  // CRAIGSLIST's versions of this rule are. Kept as its own rule (same reason-accuracy pattern
  // as the weapons/alcohol vs. drugs/hazmat split above) so a blocked organizer sees why.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'POSHMARK',
    // 2026-09-25-ROUND2 (Patrick asked for a harder second pass): a dedicated research pass
    // found secondary-sourced corroboration that Poshmark's real "Impersonation and Official
    // Items" category is broader than police/military alone -- also names vaccine/immunization
    // cards and airline-crew uniform impersonation. Same evidentiary tier as the rest of this
    // rule (corroborated, not a direct primary-source quote -- see this rule's header comment).
    nameKeywords: ['police badge', 'police uniform', 'law enforcement badge', 'military uniform', 'government id', 'vaccine card', 'immunization card', 'airline uniform', 'flight attendant uniform', 'pilot uniform'],
    reason: 'Poshmark prohibits impersonation and official items such as law enforcement or military badges, uniforms, government IDs, or vaccine cards (Prohibited Items Policy).',
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
      // 2026-09-25-ROUND2: this rule's own animal-products list was missing 'ivory'/'tusk'/
      // 'shark fin' -- oversight relative to every other platform in this file, which all carry
      // ivory coverage already. Corroborated via secondary sources this pass (Poshmark's own
      // blog cites "products derived from threatened or extinct species").
      'ivory', 'tusk', 'shark fin',
    ],
    reason: 'Poshmark prohibits drugs/paraphernalia, certain medical devices, hazardous materials, and endangered-animal products (Prohibited Items Policy, v4.1).',
  },

  // ---- POSHMARK HATE SYMBOLS / SANCTIONED-COUNTRY GOODS (added 2026-09-25-ROUND2) --
  // corroborated via secondary sources this pass (Poshmark's own blog + independent reseller
  // guides): a "Hate Symbols or Violence" category and a "Sanctioned or Illegal Goods by Region"
  // category (Cuba/Iran/North Korea), neither previously covered here. WWII militaria and Cuban
  // cigars are both real, if occasional, estate-sale categories -- same reasoning VINTED's
  // existing 'nazi'/'fascist symbol' keywords already use there (mirrored verbatim here for
  // consistency). Deliberately did NOT add a Native American misrepresentation keyword this pass
  // -- flagged by the research agent as a genuine legal-risk area (Indian Arts and Crafts Act)
  // but one that needs human judgment/certification-checking, not a safe auto-block keyword;
  // raised separately with Patrick rather than guessed at here.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'POSHMARK',
    nameKeywords: ['nazi', 'fascist symbol', 'cuban cigar', 'made in cuba', 'made in iran', 'made in north korea'],
    reason: 'Poshmark prohibits hate symbols/violent extremist items and goods originating from sanctioned countries (Prohibited Items Policy).',
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
      // 2026-09-25: closes a real dagger/sword/bayonet gap, see the GUMTREE_AU rule's comment
      // above (same fix, same reason, same session).
      'dagger', 'sword', 'bayonet',
      // 2026-09-25: closes the same weapon-synonym gap as GUMTREE_AU/POSHMARK above. Mercari's
      // own policy separately bans "Self defense items, including military-grade items" (already
      // reflected by the 'self defense' keyword below) -- these are the literal item names a
      // listing titled just "Brass Knuckles" or "Pepper Spray Keychain" would use, which 'self
      // defense' alone wouldn't catch. Deliberately did NOT add police/government-impersonation
      // keywords here: re-fetched mercari.com/us/help_center/prohibited_items live this session
      // and confirmed it states no police/law-enforcement/military-ID restriction at all, unlike
      // CRAIGSLIST/GUMTREE_AU/VINTED/FACEBOOK/POSHMARK above -- consistent with this file's
      // evidence-based approach, not adding an unconfirmed category here.
      'brass knuckle', 'nunchuck', 'nunchaku', 'baton', 'pepper spray', 'butterfly knife',
      'machete', 'throwing star',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18-ROUND2 (Patrick asked for a second pass -- re-verified each platform's live official policy again to check for anything the first pass missed): re-fetched
      // mercari.com/us/help_center/prohibited_items directly (the first pass used a related
      // but different help article) and found three items explicitly named in Mercari's own
      // policy that the first pass missed: stolen goods, recalled items, and used underwear
      // (Mercari's policy names "used underwear" as its own example under human materials,
      // same as Poshmark/Gumtree already carry).
      'stolen', 'recalled', 'used underwear',
      // 2026-09-25-ROUND2: corroborated secondary-sourced finding (Mercari's own help-center
      // AI-paraphrased summary names an "Offensive Content" category for hate/violence/
      // discrimination) -- mirrors VINTED's existing 'nazi'/'fascist symbol' keywords for
      // consistency. Did NOT add lithium-battery/aerosol/flammable/hazmat keywords this pass
      // despite a fresh research agent surfacing them -- re-confirms the prior deliberate
      // decision two paragraphs above (these are a Mercari SHIPPING-LABEL requirement, not a
      // listing prohibition; adding them would wrongly block sellable inventory).
      'nazi', 'fascist symbol',
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
      // 2026-09-25-ROUND2 (Patrick asked for a harder second pass): re-fetched both
      // vinted.com/help/52-items-not-allowed-on-vinted and vinted.com/catalog-rules via a
      // dedicated research pass and found real quoted categories the first two passes missed:
      // mattresses/duvets, active stock/share certificates, kids' car-seat safety items,
      // standalone refrigerants, tanning beds/massage tables/tattoo machines, pet restraint
      // devices beyond what GUMTREE_AU already carries ('shock collar'/'training collar'; Vinted
      // itself had none), used/expired batteries and power banks, and non-cycling used
      // head/face protection (Vinted only blocked cycling helmets before).
      'mattress', 'duvet',
      'stock certificate', 'share certificate',
      'car seat', 'booster seat',
      'refrigerant', 'freon',
      'tanning bed', 'massage table', 'tattoo machine',
      'choke collar', 'prong collar', 'spiked collar', 'shock collar',
      'expired battery', 'used power bank',
      'motorcycle helmet', 'ski helmet',
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
      // EXTENDED S-CROSS-MARKETPLACE-COMPLIANCE-AUDIT-2026-09-18-ROUND2 (Patrick asked for a
      // second pass -- checked vinted.com/catalog-rules, a first-party page with a different
      // presentation than the "Items not allowed" page the first pass used, and found real
      // categories the first pass missed): Nazi/fascist items (explicitly named and
      // unconditionally banned -- no legitimate carve-out, and WWII militaria is a real, if
      // occasional, estate-sale category), armed-forces/police/emergency-services official
      // uniforms and badges (specific phrasing to avoid catching ordinary school/sports/costume
      // uniforms), a full ban on bikes including electric (a real estate-sale category that
      // would otherwise slip through to Vinted only to be rejected there), and used underwear
      // (Vinted explicitly requires new-with-tags only, same restriction Poshmark/Gumtree/
      // Mercari all carry).
      'nazi', 'fascist symbol',
      'police uniform', 'police badge', 'military uniform', 'law enforcement badge',
      'bike', 'bicycle', 'used underwear',
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

  // ---- VINTED TOBACCIANA: LIGHTERS / CIGAR & CIGARETTE CASES-TINS / PIPES (added 2026-10-02) --
  // Two listings were auto-removed on 2026-10-01/02 under "Restricted items" (cigarettes/cigars/pipes):
  // a Ritmeester Pikeur "Cigar Case ... Tobacco Metal Tin" and 5 Marlboro Adventure Team lighters.
  // Vinted's written policy does NOT ban lighters or traditional-cigarette accessories, and many
  // tobacco tins, ashtrays and signs are live on Vinted (checked 2026-10-02), so this is deliberately
  // NOT a tobacco-brand/word blocklist: it covers only the item types that were actually flagged.
  // Dry-run against the production Item table (349 rows) before shipping: matches exactly those two
  // items plus one unposted cigar tin, and no item currently posted on Vinted. Plural 'lighters' only
  // (bare 'lighter' would catch accessories); cigar BOXES excluded on purpose (widely live on Vinted).
  // Ashtrays, signs, ads and plain tobacco tins are intentionally NOT blocked. Revisit if the appeal
  // or more removals show a different pattern. Mirrored in extension/fas-vinted.js.
  {
    type: 'CATEGORY_BLOCKLIST',
    platform: 'VINTED',
    nameKeywords: [
      'tobacciana:lighter', 'lighters', 'cigarette lighter', 'cigar lighter',
      'cigar case', 'cigarette case', 'cigar tin', 'cigarette tin',
      'tobacciana:pipe', 'smoking pipe', 'tobacco pipe', 'pipe tobacco',
    ],
    excludeKeywords: ['pouch', 'sticker', 'fluid', 'refill'],
    reason: 'Vinted automatically removes lighters and cigar/cigarette cases and tins as restricted tobacco items.',
  },

  // ---- VINTED MUSICAL INSTRUMENTS -- REMOVED 2026-09-27 (same day as the SIZE_WEIGHT_CEILING
  // correction above). This rule was added S-EXT-ELIGIBILITY-SUBSTRING-FIX-2026-09-03 on a
  // misreading of Vinted's own policy page. The prior session read the bullet "Musical
  // instruments for adults" (paraphrased) as "actual playable instruments, restricted to adult
  // sellers/buyers" and built a keyword list of real instrument names (guitar, piano, violin,
  // saxophone, etc.) to block.
  //
  // Root cause, evidence (this session, Patrick live report: "that's not true i see plenty of
  // musical instruments listed for sale on vinted"): re-fetched vinted.com/help/52-items-not-
  // allowed-on-vinted directly. The REAL, current bullet text is "Adult musical instruments",
  // and it sits under a "Non-Category Items" heading grouped with: Vape/heated tobacco
  // accessories, Pet electronic items, ADULT FURNITURE, Adult musical instruments, FETISH ITEMS
  // AND SEX SERVICES. Same pattern as "Adult furniture" (which does not mean "furniture for
  // grown-ups" -- it means fetish/BDSM furniture): "Adult musical instruments" is that same
  // adult-content euphemism, not a ban on guitars/pianos/violins. Confirmed by Patrick's direct,
  // repeated observation of ordinary instruments listed live on Vinted.
  //
  // No replacement rule added -- ordinary musical instruments are not restricted on Vinted.

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

  // ---- SIZE/WEIGHT CEILINGS (S-SIZE-WEIGHT-CEILING-2026-09-27) -- see the SizeWeightCeilingRule
  // interface's own comment above for why these three platforms specifically, and why
  // eBay/Facebook/Grailed/Craigslist/Gumtree AU are deliberately left out. Figures sourced this
  // session via dedicated per-platform research (official/authoritative sources cited in
  // claude/crosslister-automation-decisions-2026-09-26.md); re-verify there before changing these
  // numbers.
  // VINTED deliberately has NO SIZE_WEIGHT_CEILING rule (REMOVED 2026-09-27, same day it was
  // added -- Patrick live-caught it: a Fatal Fury Neo Geo CARTRIDGE was wrongly flagged
  // ineligible, while an actual arcade cabinet had already listed and shipped successfully on
  // Vinted). Root cause: the ~44lb/20kg figure came from reading the Small/Medium/Large
  // package-size SELECTOR's plain-English UI copy ("Large -- fits in a moving box") and wrongly
  // treating it as an enforced physical weight limit. It is not one. extensionController.ts's own
  // pre-existing ADR (eBay-freight-and-Vinted-shipping-cap-pricing, 2026-09-17, VINTED_SHIPPING_CAP)
  // already root-caused Vinted's REAL constraint: a $100 shipping-COST cap, not a weight cap --
  // when real carrier cost exceeds $100, the extension bumps the item's Vinted-specific price to
  // cover the difference (vintedPrice/vintedShippingNote) instead of blocking anything. A heavy
  // item still lists, it just costs the buyer more. The only genuine hard stop is the same
  // absolute-carrier-max (ShippingHardBlockError, ebayRateEstimateService.ts -- ~150lb/108" for
  // USPS/UPS/FedEx Ground, the same ceiling already used for eBay) computeCheapestForOrigin
  // already throws when NO modeled carrier can ship the package at all -- that would be the
  // correct signal for a Vinted SIZE_WEIGHT_CEILING, not a hardcoded number pulled from UI copy.
  // Not wired up here because checkEligibility is a synchronous, DB-free pure function and
  // computeCheapestForOrigin is async and needs real rate-table/zone data -- doing this properly
  // is a real (small) architecture task, not a one-line fix, and should not be guessed at twice in
  // one day. Flagged as a follow-up in claude/crosslister-automation-decisions-2026-09-26.md.
  {
    type: 'SIZE_WEIGHT_CEILING',
    platform: 'POSHMARK',
    maxWeightOz: 240, // 15lb, raised from 10lb as of Feb 2026 (carrier is now USPS Ground Advantage, not Priority Mail).
    reason: 'Over Poshmark\'s 15lb shipping limit -- Poshmark\'s Community Guidelines prohibit arranging local pickup/meetups in place of shipping, so this is a dead end there, not just a bad fit.',
  },
  {
    type: 'SIZE_WEIGHT_CEILING',
    platform: 'MERCARI',
    maxWeightOz: 800, // 50lb -- stated identically on two official Mercari pages, each with an explicit "ship on your own beyond this" fallback (i.e. OUTSIDE Mercari's own label flow, which is what this extension automates). A conflicting "100lb" figure on one older page is flagged unreliable and not used.
    maxLongestSideIn: 34, // 34"x20" box ceiling, same two official pages.
    reason: 'Over Mercari\'s 50lb / 34"x20" shipping ceiling -- beyond this Mercari requires shipping outside its own label flow, which this extension can\'t drive.',
  },

  // ---- ETSY (ADR-135 D4, batch E-B2) -- Etsy's Creativity Standards only allow items made or
  // designed by the seller, handpicked vintage (20+ years old), and craft or party supplies
  // (https://www.etsy.com/legal/creativity); the API Terms, Section 5 (Prohibited Behavior), bind the
  // APPLICATION not to support listings that violate them (https://www.etsy.com/legal/api).
  // v1 only lists vintage and craft supplies (who_made is always someone_else), so the rule is an
  // age allowlist: eligible only if the age can be confirmed, hidden otherwise, no organizer
  // override. Cutoff = asOfYear - minAgeYears (2006 in 2026), computed each call.
  // Decision order inside the handler (see checkEligibility): releaseYear decides alone when
  // present; else craft supply passes; else the attested era must be old enough; else no data fails.
  {
    type: 'ATTRIBUTE_AGE_ALLOWLIST',
    platform: 'ETSY',
    minAgeYears: 20,
    reason: 'Etsy only accepts items that are 20 or more years old, items you made or designed, or craft and party supplies.',
  },
];

function normText(text: string | null | undefined): string {
  return (text || '').toLowerCase();
}

// S-SIZE-WEIGHT-CEILING-2026-09-27: same packageWeightOz ?? aiPackageWeightOz effective-weight
// fallback fas-vinted.js/fas-mercari.js already use client-side (see EligibilityCheckItem's own
// comment above) -- a positive, finite number only; anything else (null/undefined/0/NaN) means
// "no usable weight data" and SIZE_WEIGHT_CEILING below falls through to eligible, same permissive
// posture as CATEGORY_BLOCKLIST's own missing-data handling.
function effectiveWeightOz(item: EligibilityCheckItem): number | null {
  const raw = item.packageWeightOz ?? item.aiPackageWeightOz;
  const n = Number(raw);
  return raw != null && isFinite(n) && n > 0 ? n : null;
}

// Longest single side of whatever dimensions are actually present -- deliberately not "all three
// or nothing," since a partial measurement (e.g. length known, width/height not) is still real
// signal that this item won't fit a small flat-rate envelope.
function effectiveLongestSideIn(item: EligibilityCheckItem): number | null {
  const dims = [item.packageLengthIn, item.packageWidthIn, item.packageHeightIn]
    .map((d) => (d != null && isFinite(Number(d)) && Number(d) > 0 ? Number(d) : null))
    .filter((d): d is number => d != null);
  return dims.length ? Math.max(...dims) : null;
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
// CATEGORY_BLOCKLIST was originally left on plain substring matching for exactly that reason (the
// weapons rules rely on 'gun' matching INSIDE compound words like "shotgun"/"handgun"/"airgun");
// that left the same bug class live there ('wine' inside "WINElight", found 2026-10-08) and it is now
// fixed at the root by matchesBlocklistKeyword below, which is boundary-aware but keeps those
// compounds via an explicit, documented affix table instead of blind substring matching.
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

// ---------------------------------------------------------------------------------------------
// S-ELIGIBILITY-BOUNDARY-MATCH-2026-10-08: boundary-aware CATEGORY_BLOCKLIST keyword matching.
//
// Root cause (evidence-confirmed 2026-10-08): checkEligibility's CATEGORY_BLOCKLIST branch used
// plain `haystack.includes(kw)`. The vinyl LP "Grover Washington, Jr. Winelight ... 1980" (category
// "Music") was ruled ineligible on FACEBOOK/CRAIGSLIST/POSHMARK/MERCARI because the alcohol keyword
// 'wine' substring-matched inside "Winelight". Every earlier fix for this bug class was piecemeal
// (add a word to excludeKeywords, or switch ONE rule shape -- the Grailed allowlist -- to
// hasWholeWordMatch). This replaces the substring test for ALL blocklist nameKeywords.
//
// Rules, applied identically to every keyword on every platform:
//  1. Both haystack and keyword are lower-cased and every run of non-letter/non-digit characters
//     (spaces, hyphens, slashes, commas, apostrophes, ampersands...) collapses to one space. The
//     one deliberate exception is ':' which is kept (the Vinted 'tobacciana:lighter' category-key
//     style keywords contain it). So 'e-cigarette' matches "E-Cigarette", "e cigarette",
//     "ecigarette", and 'sex toy' matches "Sex-Toys" / "sextoy".
//  2. The keyword must START at a token start and END at a token end (whole word / phrase).
//     "Winelight", "Beerbohm", "Swinelike", "CAPitol", "Ammonite", "Coincidence" no longer match
//     'wine'/'beer'/'cap'/'ammo'/'coin'.
//  3. The LAST word tolerates ordinary inflection: s/es, d/ed, ing, y->ies/ied, silent-e drop
//     (vape->vaping), doubled final consonant (gun->gunned/gunning, drug->drugged), and f/fe->ves
//     (knife->knives).
//  4. Compounds that real data uses glued together are NOT lost: KW_COMPOUND_PREFIXES /
//     KW_COMPOUND_SUFFIXES below list them per keyword ('gun' -> shotgun, handgun, airgun,
//     gunpowder, gunshot...; 'knife' -> pocketknife, jackknife; 'wine' -> wineglass, winery...).
//     These are the ONLY places where a keyword may match inside a longer word, and each entry is a
//     deliberate stem the old substring behaviour relied on. To block a new glued compound, add it
//     here rather than loosening the matcher.
//  Keywords in multi-word phrases may also appear glued ("giftcard", "stungun").
//
// excludeKeywords were deliberately NOT converted: an exclude only ever turns a block into
// "eligible", so making it stricter (boundary-aware) would make MORE items blocked, and several
// entries are intentional stems/fragments ('mount', 'case', 'display', 'gunmetal', 'seashell').
// Left as plain substring; revisit per-rule if a real false-NEGATIVE-by-carve-out shows up.
// ---------------------------------------------------------------------------------------------
const KW_COMPOUND_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  gun: ['shot', 'hand', 'air', 'machine', 'sub', 'pop', 'spear', 'flare', 'tommy', 'bb', 'pellet', 'cap'],
  knife: ['pocket', 'jack', 'pen', 'bowie', 'hunting', 'throwing', 'butcher'],
  sword: ['broad', 'long', 'short', 'great', 'back'],
  bike: ['e', 'motor', 'dirt', 'mini', 'pit', 'mountain', 'road', 'push', 'trail'],
  food: ['sea', 'pet', 'fast', 'baby', 'junk', 'health', 'soul', 'dog', 'cat'],
  vitamin: ['multi'],
  coin: ['bit', 'alt', 'doge', 'lite'],
  shell: ['tortoise', 'turtle', 'sea'],
  fur: ['faux', 'real'],
};
const KW_COMPOUND_SUFFIXES: Readonly<Record<string, readonly string[]>> = {
  gun: [
    'powder', 'shot', 'shots', 'smith', 'smiths', 'smithing', 'stock', 'fire', 'sight', 'sights',
    'point', 'boat', 'runner', 'runners', 'slinger', 'belt', 'safe', 'case', 'rack', 'cabinet',
    'holster', 'oil', 'sling', 'barrel', 'ship',
  ],
  sword: ['man', 'men', 'play', 'stick', 'smith'],
  blade: ['smith', 'smiths'],
  ammo: ['box', 'boxes', 'can', 'cans', 'pouch', 'belt'],
  weapon: ['ry'],
  coin: ['age'],
  wine: [
    'glass', 'glasses', 'bottle', 'bottles', 'rack', 'racks', 'cooler', 'cellar', 'barrel', 'opener',
    'decanter', 'cork', 'stopper', 'tasting', 'maker', 'press', 'fridge', 'bag', 'tote', 'label',
    'crate', 'box', 'cabinet', 'charm', 'ry', 'ries',
  ],
  beer: [
    'stein', 'steins', 'mug', 'mugs', 'glass', 'glasses', 'bottle', 'bottles', 'can', 'cans', 'tap',
    'keg', 'kegs', 'cooler', 'sign', 'signs', 'opener', 'coaster', 'coasters', 'tray', 'pong',
    'fridge', 'maker',
  ],
  cigar: ['illo', 'illos'],
  tobacco: ['nist', 'nists'],
  alcohol: ['ic', 'ics'],
  vape: ['r', 'rs', 'juice', 'pen', 'pens'],
  counterfeit: ['er', 'ers'],
  'government id': ['entification', 'entity'],
};

const keywordRegexCache = new Map<string, RegExp>();

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lower-case; every run of non-letter/non-digit characters (except ':') becomes one space. */
function normForKeywordMatch(text: string | null | undefined): string {
  return (text || '').toLowerCase().replace(/[^\p{L}\p{N}:]+/gu, ' ').trim();
}

function buildKeywordRegex(keyword: string): RegExp | null {
  const norm = normForKeywordMatch(keyword);
  if (!norm) return null;
  const words = norm.split(' ');
  const first = words[0];
  const last = words[words.length - 1];

  const pre = KW_COMPOUND_PREFIXES[norm];
  const preGroup = pre && pre.length ? `(?:${pre.map(escapeRegex).join('|')})?` : '';

  // Tail alternatives appended directly to the LAST word (all optional).
  const tails: string[] = ['e?s', 'e?d', 'ing'];
  const lastC = last.charAt(last.length - 1);
  if (lastC && /[a-z]/.test(lastC)) tails.push(`${escapeRegex(lastC)}(?:ed|ing)`); // gun->gunned, drug->drugged
  const post = KW_COMPOUND_SUFFIXES[norm];
  if (post) for (const t of post) tails.push(escapeRegex(t));
  const alts: string[] = [`${escapeRegex(last)}(?:${tails.join('|')})?`];
  if (last.endsWith('y') && last.length > 1) alts.push(`${escapeRegex(last.slice(0, -1))}(?:ies|ied)`); // currency->currencies
  if (last.endsWith('e') && last.length > 2) alts.push(`${escapeRegex(last.slice(0, -1))}(?:ing|ed)`); // vape->vaping
  if (last.endsWith('fe') && last.length > 3) alts.push(`${escapeRegex(last.slice(0, -2))}ves`); // knife->knives
  else if (last.endsWith('f') && last.length > 3) alts.push(`${escapeRegex(last.slice(0, -1))}ves`); // scarf->scarves
  const lastPart = `(?:${alts.join('|')})`;

  let body: string;
  if (words.length === 1) {
    body = `${preGroup}${lastPart}`;
  } else {
    const mid = words.slice(1, -1).map(escapeRegex);
    body = [`${preGroup}${escapeRegex(first)}`, ...mid, lastPart].join(' ?');
  }
  return new RegExp(`(?:^| )${body}(?= |$)`, 'u');
}

/**
 * Boundary-aware CATEGORY_BLOCKLIST keyword test (see the block comment above). `haystack` may be
 * raw text (it is normalized here). Exported so the regression suite can pin the behaviour.
 */
export function matchesBlocklistKeyword(haystack: string, keyword: string): boolean {
  let re = keywordRegexCache.get(keyword);
  if (re === undefined) {
    re = buildKeywordRegex(keyword) || /(?!)/u;
    keywordRegexCache.set(keyword, re);
  }
  return re.test(normForKeywordMatch(haystack));
}

/** Read-only view of every CATEGORY_BLOCKLIST rule's keywords, for regression tests / audits. */
export function listBlocklistKeywords(): { platform: EligibilityPlatform; keywords: readonly string[]; excludeKeywords: readonly string[] }[] {
  return RULES.filter((r): r is CategoryBlocklistRule => r.type === 'CATEGORY_BLOCKLIST').map((r) => ({
    platform: r.platform,
    keywords: r.nameKeywords,
    excludeKeywords: r.excludeKeywords || [],
  }));
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
  if (item.isBulkLot === true) return { eligible: false, reason: BULK_LOT_ELIGIBILITY_REASON };
  const rules = RULES.filter((r) => r.platform === platform);
  if (rules.length === 0) return { eligible: true, reason: null };

  for (const rule of rules) {
    if (rule.type === 'CATEGORY_BLOCKLIST') {
      if (rule.ebayCategoryIds && item.ebayCategoryId && rule.ebayCategoryIds.includes(item.ebayCategoryId)) {
        return { eligible: false, reason: rule.reason };
      }
      const haystack = buildHaystack(item);
      if (!haystack) continue; // no data -> no reason to block on this rule, see file header
      // S-ELIGIBILITY-BOUNDARY-MATCH-2026-10-08: boundary-aware (was haystack.includes(kw), which
      // matched 'wine' inside "Winelight") -- see matchesBlocklistKeyword.
      const isBlocked = rule.nameKeywords.some((kw) => matchesBlocklistKeyword(haystack, kw));
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

    if (rule.type === 'SIZE_WEIGHT_CEILING') {
      const weightOz = effectiveWeightOz(item);
      if (rule.maxWeightOz != null && weightOz != null && weightOz > rule.maxWeightOz) {
        return { eligible: false, reason: rule.reason };
      }
      const longestSideIn = effectiveLongestSideIn(item);
      if (rule.maxLongestSideIn != null && longestSideIn != null && longestSideIn > rule.maxLongestSideIn) {
        return { eligible: false, reason: rule.reason };
      }
      // No usable weight/dimension data on the item -> nothing to block on this rule, same
      // permissive missing-data posture as CATEGORY_BLOCKLIST above.
    }

    if (rule.type === 'ATTRIBUTE_AGE_ALLOWLIST') {
      // ADR-135 D4.2. The only clock read in this file; item.asOfYear overrides it for tests.
      const asOfYear = item.asOfYear ?? new Date().getFullYear();
      const cutoffYear = asOfYear - rule.minAgeYears;
      // (1) A card record's own release year decides alone. A craft-supply tick cannot override it.
      if (typeof item.releaseYear === 'number' && isFinite(item.releaseYear)) {
        if (item.releaseYear <= cutoffYear) continue;
        return { eligible: false, reason: rule.reason };
      }
      // (2) Organizer says it is a craft or party supply.
      if (item.etsyIsCraftSupply === true) continue;
      // (3) Attested era must be a known Etsy era whose whole range is old enough.
      if (etsyWhenMadeQualifies(item.etsyWhenMade, asOfYear, rule.minAgeYears)) continue;
      // (4) No usable data (or too recent): ineligible. Allowlist posture, same asymmetry as
      // CATEGORY_ALLOWLIST: if the age cannot be confirmed, the item is hidden.
      return { eligible: false, reason: rule.reason };
    }

    // PREREQUISITE_LOOKUP: reserved, no rules of this shape exist yet -- no-op, neither blocks nor
    // requires anything.
  }

  return { eligible: true, reason: null };
}
