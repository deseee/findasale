/**
 * ebayShippingPresetService — create REAL eBay fulfillment policies ("shipping
 * presets") from inside FindA.Sale.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this service, FindA.Sale could only ever *point at* a fulfillment policy the
 * organizer had already hand-built on ebay.com (Category Overrides, the per-item
 * `Item.ebayFulfillmentPolicyOverrideId` picker, the Default Policies selects on the
 * eBay settings page). The single exception was machine-generated: the FVF-flat /
 * named-weight-tier provisioning in ebayFlatRatePolicyService.ts, which can only ever
 * emit "FindA.Sale Flat $X.XX" or "N+ lb Ground Advantage $X.XX". An organizer who
 * needed a "FEDEX GUITAR $34.99" or a "Media Mail Calculated" had to leave the product,
 * build it on eBay, come back and re-sync. This service closes that gap.
 *
 * TWO GUARDS THIS SERVICE OWNS
 * ----------------------------
 * 1. PRICE. The organizer's flat price is pre-filled from FindA.Sale's own rate engine
 *    (ebayRateEstimateService) for the weight/dimensions they enter, grossed up for
 *    eBay's 13.6% Final Value Fee on shipping exactly the way the automatic path does
 *    (computeFvfFlatRate -> roundUpToBucket -> applyCharmPricing). Any deviation below
 *    the modelled label cost net of the fee is surfaced with real numbers and must be
 *    explicitly acknowledged. This is the guard that would have caught a real
 *    "FEDEX GUITAR $34.99" priced under its actual label cost.
 *
 * 2. NAME. Routing behaviour in this codebase is derived from the policy NAME string
 *    (utils/ebayPolicyParser.ts: classifyPolicy, parseWeightTiers,
 *    parsePriceFromPolicyName, parsePriceCapFromPolicyName, the Standard Envelope
 *    matcher) and that parsed name is consumed by live surfaces — including
 *    utils/googleMerchantShipping.ts's computeItemShipping, which advertises the price
 *    parsed out of the matched rung's name on the public Google Shopping feed. A
 *    user-typed name can therefore silently de-route items or advertise the wrong
 *    shipping price. validatePresetName() runs the ORGANIZER'S name through the real
 *    parser functions (not a re-implementation) and refuses any name whose parsed
 *    meaning contradicts the policy the organizer is actually configuring, with a
 *    plain-language explanation and a parser-safe suggested name.
 *
 * All eBay API calls route through the Vercel proxy (Railway DNS cannot resolve
 * api.ebay.com) using the organizer's OWN OAuth token — same pattern as
 * ebayFlatRatePolicyService.ts / ebayCalculatedPolicyService.ts.
 */

import { prisma } from '../lib/prisma';
import {
  estimateCheapestRate,
  resolveCoverageZone,
  EBAY_SHIPPING_FVF_RATE,
  ShippingHardBlockError,
  ZoneKey,
} from './ebayRateEstimateService';
import { computeFvfFlatRate } from './ebayFlatRatePolicyService';
import { roundUpToBucket, applyCharmPricing } from '../utils/shippingPriceMath';
import { refreshEbayAccessToken, ebayProxyHeaders, ebayUserHeaders } from './ebayHttp';
import {
  classifyPolicy,
  parseWeightTiers,
  parsePolicyWeightTier,
  parsePriceFromPolicyName,
  PolicyClassification,
} from '../utils/ebayPolicyParser';

// ── Constants ────────────────────────────────────────────────────────────────

/** eBay's own maximum length for a business-policy name. */
export const EBAY_POLICY_NAME_MAX_LENGTH = 64;

/**
 * Hard ceiling on how many fulfillment policies FindA.Sale will let one organizer
 * accumulate on their eBay account. eBay itself caps business policies per
 * marketplace; this sits well under that so a runaway client loop can never fill an
 * organizer's account with junk policies. Paired with the per-user rate limiter on
 * the create route (controllers/ebayShippingPresetController.ts).
 */
export const MAX_FULFILLMENT_POLICIES_PER_ORGANIZER = 80;

/**
 * Server-side whitelist of shipping service/carrier combinations a preset may use.
 *
 * DELIBERATELY SHORT AND EVIDENCE-BASED. Every code below is one this project has
 * already proven against the live eBay API:
 *  - ShippingMethodStandard / GENERIC — the generic flat-rate domestic combo. Proven
 *    S975: carrier-specific codes (e.g. USPSGroundAdvantage) are CALCULATED-only and
 *    are rejected by eBay's LSAS for FLAT_RATE policies with errorId 216018
 *    UNKNOWN_SHIPPING_SERVICE_CODE.
 *  - USPSParcel / USPS and USPSPriority / USPS — the calculated-cost combos already
 *    provisioned in production by ebayCalculatedPolicyService.ts.
 * Other carrier codes (UPS/FedEx-specific service codes) are NOT listed because they
 * have not been verified against the live API from this codebase. Adding one is a
 * one-line change here once it has been confirmed — do not guess a code into this list.
 *
 * The client sends only the `key`; the codes never come from the request body.
 * (NO-MASS-ASSIGNMENT.)
 */
export type PresetCostType = 'FLAT_RATE' | 'CALCULATED';

export interface PresetShippingService {
  key: string;
  label: string;
  helpText: string;
  costType: PresetCostType;
  shippingServiceCode: string;
  shippingCarrierCode: string;
}

export const PRESET_SHIPPING_SERVICES: PresetShippingService[] = [
  {
    key: 'CALC_USPS_GROUND',
    label: 'USPS Ground Advantage — eBay works out the rate',
    helpText:
      "eBay calculates the real rate for each buyer's address at checkout. Recommended: the price is always current, so it can never go stale.",
    costType: 'CALCULATED',
    shippingServiceCode: 'USPSParcel',
    shippingCarrierCode: 'USPS',
  },
  {
    key: 'CALC_USPS_PRIORITY',
    label: 'USPS Priority Mail — eBay works out the rate',
    helpText:
      'Faster service. eBay still calculates the real rate for each buyer at checkout.',
    costType: 'CALCULATED',
    shippingServiceCode: 'USPSPriority',
    shippingCarrierCode: 'USPS',
  },
  {
    key: 'FLAT_STANDARD',
    label: 'Standard shipping — one flat price',
    helpText:
      'Every buyer pays the same price you set, wherever they are. Use this when you already know what the label costs.',
    costType: 'FLAT_RATE',
    shippingServiceCode: 'ShippingMethodStandard',
    shippingCarrierCode: 'GENERIC',
  },
];

export const findPresetShippingService = (key: string | null | undefined): PresetShippingService | null =>
  PRESET_SHIPPING_SERVICES.find((s) => s.key === key) ?? null;

// ── Local proxy URL helper ───────────────────────────────────────────────────
// services/ebayHttp.ts's exported ebayProxyUrl does NOT encode the path, which breaks
// as soon as the path carries its own query string (`?marketplace_id=...&limit=...`) —
// the `&` would be read as a second proxy query param. ebayFlatRatePolicyService.ts
// keeps its own encoded copy for exactly this reason; this matches it.
const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${encodeURIComponent(path)}`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PresetInput {
  name: string;
  /** Optional short label the UI used to build the suggested name; used to rebuild it. */
  label?: string | null;
  serviceKey: string;
  /** Flat buyer price, USD. Required for FLAT_RATE unless freeShipping is on. */
  flatPrice?: number | null;
  /** Extra charge per additional item in the same order, USD. FLAT_RATE only. */
  additionalItemPrice?: number | null;
  /** Business days between sale and shipment. */
  handlingDays: number;
  /** Optional routing/pricing input — see the note in validatePresetName. */
  maxWeightOz?: number | null;
  maxLengthIn?: number | null;
  maxWidthIn?: number | null;
  maxHeightIn?: number | null;
  freeShipping: boolean;
  localPickup: boolean;
  /** CALCULATED only: flat handling charge added on top of eBay's calculated rate. */
  handlingCharge?: number | null;
  /** Set true to create anyway when the price is below the modelled label cost. */
  acknowledgeBelowCost?: boolean;
}

export interface PresetNameIssue {
  code: string;
  field: 'name' | 'flatPrice' | 'maxWeightOz' | 'general';
  message: string;
  /**
   * 'error'  — the name or configuration would make FindA.Sale do the wrong thing.
   *            Blocks creation.
   * 'notice' — the configuration is valid, but there is something worth knowing
   *            before committing to it. Never blocks.
   * Absent means 'error'.
   */
  severity?: 'error' | 'notice';
}

export interface PresetNameValidation {
  ok: boolean;
  issues: PresetNameIssue[];
  /** What ebayPolicyParser.classifyPolicy() makes of the submitted name. */
  classification: PolicyClassification;
  /** Plain-language description of what that classification does to routing. */
  classificationMeaning: string;
  /** Price the parser reads out of the name, if any. */
  parsedPrice: number | null;
  /** Weight ceiling the parser reads out of the name, in ounces, if any. */
  parsedMaxOz: number | null;
  /** A name that is guaranteed to parse consistently with this configuration. */
  suggestedName: string;
}

export interface PresetRateEstimate {
  available: boolean;
  /** Set when available === false — plain-language reason. */
  unavailableReason?: string;
  weightOz: number | null;
  carrier?: string;
  zone?: string;
  basis?: string;
  /** The modelled real label cost, USD. */
  labelCost?: number;
  /** What FindA.Sale's automatic path would charge the buyer for this package. */
  suggestedBuyerPrice?: number;
  /** CALCULATED presets: handling charge that offsets eBay's fee on shipping. */
  suggestedHandlingCharge?: number;
  fvfRate: number;
  /** Where the ship-from location behind `zone` came from. Never omitted when
   *  available === true, so no surface can present a priced estimate without also
   *  being able to say what it was priced FROM. */
  originBasis?: PresetOriginBasis;
  /** The 5-digit origin ZIP the zone was resolved from, when there was one. */
  originZip?: string | null;
  /** Plain-language provenance note. Set whenever originBasis is anything other than
   *  'sale-zip' -- i.e. whenever the organizer should know the number is approximate
   *  and how to make it exact. */
  originNote?: string;
}

export interface PresetPriceCheck {
  enteredPrice: number;
  labelCost: number;
  /** What the organizer keeps after eBay's 13.6% fee on the shipping charge. */
  netToSeller: number;
  /** labelCost - netToSeller, when positive. */
  shortfall: number;
  belowCost: boolean;
}

export interface LivePresetRow {
  fulfillmentPolicyId: string;
  name: string;
  description: string | null;
  classification: PolicyClassification;
  classificationLabel: string;
  costType: string | null;
  parsedPrice: number | null;
  parsedMaxOz: number | null;
  freeShipping: boolean;
  localPickup: boolean;
  handlingDays: number | null;
  /** Items whose LIVE eBay offer currently uses this policy (Item.ebayFulfillmentPolicyId). */
  usedByItemCount: number;
  /** Items pinned to this policy by the organizer (Item.ebayFulfillmentPolicyOverrideId). */
  pinnedByItemCount: number;
}

// ── Classification meaning (plain language, for inline explanation) ──────────

const CLASSIFICATION_MEANING: Record<PolicyClassification, string> = {
  'weight-tier':
    'FindA.Sale reads this name as a weight range, so items up to that weight can be routed to it automatically and your Google Shopping listings advertise the price in the name.',
  'standard-envelope':
    "FindA.Sale reads this name as an eBay Standard Envelope policy and will send light, low-priced items to it. eBay's Standard Envelope program has to be set up on eBay itself.",
  'local-pickup':
    'FindA.Sale reads this name as pickup-only and will never use it for an item that has to be shipped.',
  'free-shipping':
    'FindA.Sale reads this name as free shipping and treats it as a last resort, because you absorb the cost.',
  calculated:
    "FindA.Sale reads this name as eBay working out the rate at checkout, and skips it when it is matching items by weight.",
  'category-specific':
    'FindA.Sale reads this name as a special-case policy. It is only used when you point a category or an item at it.',
  international: 'FindA.Sale reads this name as international shipping.',
  unknown:
    'FindA.Sale does not read any routing meaning from this name. It is only used when you point a category or an item at it.',
};

export const classificationLabel = (c: PolicyClassification): string => {
  switch (c) {
    case 'weight-tier':
      return 'By weight';
    case 'standard-envelope':
      return 'eBay Standard Envelope';
    case 'local-pickup':
      return 'Local pickup';
    case 'free-shipping':
      return 'Free shipping';
    case 'calculated':
      return 'Calculated at checkout';
    case 'category-specific':
      return 'Special case';
    case 'international':
      return 'International';
    default:
      return 'No routing rule';
  }
};

// ── Suggested (parser-safe) name ─────────────────────────────────────────────

/**
 * Strip anything from a user-typed label that would give the parser a meaning we did
 * not intend: dollar amounts, weight tokens, "under $X" price caps, envelope wording.
 */
const sanitizeLabel = (raw: string | null | undefined, opts?: { stripPickup?: boolean }): string => {
  let out = (raw ?? '')
    .replace(/\$\s*\d+(?:\.\d{1,2})?/g, ' ')
    .replace(/\bunder\b/gi, ' ')
    .replace(/\b\d+\s*\+?\s*(oz|ounce|ounces|lb|lbs|pound|pounds)\b/gi, ' ')
    .replace(/\bstd\.?\s*env(elope)?\b/gi, ' ')
    .replace(/\bstandard\s*envelope\b/gi, ' ')
    // Also strip the two tokens buildSuggestedName appends itself, so re-suggesting a
    // name we already suggested is a no-op ("Media Mail Calculated" must not become
    // "Media Mail Calculated Calculated"). Bare "Shipping" is deliberately NOT stripped
    // -- it is a legitimate label word ("Flat Shipping $9.99").
    .replace(/\bcalculated\b/gi, ' ')
    .replace(/\bfree\s+shipping\b/gi, ' ');
  if (opts?.stripPickup) {
    // Without this, "Local Pickup ONLY" with local pickup switched OFF produced a
    // suggested name that still classified as local-pickup, i.e. a one-click "fix"
    // that fixed nothing.
    out = out.replace(/\blocal\s*pick\s*-?\s*up\b/gi, ' ').replace(/\bpick\s*-?\s*up\b/gi, ' ');
    out = out.replace(/^\s*only\b/i, ' ').replace(/\bonly\s*$/i, ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
};

/** "16 lb" when the ceiling is a whole number of pounds, otherwise "40oz". Both parse exactly. */
const weightToken = (maxWeightOz: number): string =>
  maxWeightOz >= 16 && maxWeightOz % 16 === 0 ? `${maxWeightOz / 16} lb` : `${maxWeightOz}oz`;

export function buildSuggestedName(input: {
  label?: string | null;
  name?: string | null;
  costType: PresetCostType;
  freeShipping: boolean;
  localPickup?: boolean;
  maxWeightOz?: number | null;
  flatPrice?: number | null;
}): string {
  const label = sanitizeLabel(input.label || input.name, { stripPickup: input.localPickup !== true }) || '';
  const price = typeof input.flatPrice === 'number' && input.flatPrice > 0 ? input.flatPrice : 0;

  let composed: string;
  if (input.freeShipping) {
    composed = `${label || 'Domestic'} Free Shipping`;
  } else if (input.costType === 'CALCULATED') {
    composed = `${label || 'Domestic'} Calculated`;
  } else if (input.maxWeightOz != null && input.maxWeightOz > 0) {
    composed = `${weightToken(input.maxWeightOz)} ${label || 'Ground Advantage'} $${price.toFixed(2)}`;
  } else {
    composed = `${label || 'Flat Shipping'} $${price.toFixed(2)}`;
  }

  composed = composed.replace(/\s+/g, ' ').trim();
  if (composed.length <= EBAY_POLICY_NAME_MAX_LENGTH) return composed;

  // Too long: shorten the label rather than the trailing price, which is load-bearing
  // (parsePriceFromPolicyName reads the LAST dollar amount in the name).
  const overflow = composed.length - EBAY_POLICY_NAME_MAX_LENGTH;
  const shortLabel = label.slice(0, Math.max(1, label.length - overflow - 1)).trim();
  return buildSuggestedName({ ...input, label: shortLabel, name: null });
}

// ── Name safety validation ───────────────────────────────────────────────────

/**
 * Which classifications are acceptable for the configuration the organizer chose.
 * Mirrors classifyPolicy's own precedence: local-pickup, then Standard Envelope, then
 * free-shipping, then calculated, then weight-tier, then category-specific/unknown.
 */
function allowedClassifications(input: {
  costType: PresetCostType;
  freeShipping: boolean;
  localPickup: boolean;
  maxWeightOz?: number | null;
}): PolicyClassification[] {
  const allowed: PolicyClassification[] = [];
  // Local pickup is an ADD-ON flag in this form (the policy still carries a shipping
  // option), so a pickup-flavoured name is permitted but never required.
  if (input.localPickup) allowed.push('local-pickup');
  if (input.freeShipping) {
    allowed.push('free-shipping');
  } else if (input.costType === 'CALCULATED') {
    allowed.push('calculated');
  } else if (input.maxWeightOz != null && input.maxWeightOz > 0) {
    // A max weight has two possible meanings: "price this package for me" and "route
    // items up to this weight here". Only the second needs a weight in the name, and
    // only the organizer knows which they meant, so a special-case name is allowed —
    // validatePresetName raises a non-blocking notice instead. Blocking here would stop
    // someone building a "FEDEX GUITAR" preset just because they measured the guitar.
    allowed.push('weight-tier', 'category-specific', 'unknown');
  } else {
    allowed.push('category-specific', 'unknown');
  }
  return allowed;
}

export function validatePresetName(input: PresetInput): PresetNameValidation {
  const issues: PresetNameIssue[] = [];
  const name = (input.name ?? '').trim();
  const service = findPresetShippingService(input.serviceKey);
  const costType: PresetCostType = service?.costType ?? 'FLAT_RATE';
  const flatPrice = input.freeShipping ? 0 : Number(input.flatPrice ?? 0);

  const classification = classifyPolicy(name || 'x');
  const parsedPrice = parsePriceFromPolicyName(name);
  // parseWeightTiers is the REAL router entry point, so this is what routing will
  // actually see. parsePolicyWeightTier gives the un-promoted ceiling for an "N+ lb"
  // name (parseWeightTiers promotes the heaviest plus-tier to unbounded, which is a
  // property of the whole ladder, not of this one name).
  const routerTier = parseWeightTiers([{ fulfillmentPolicyId: '__preview__', name }])[0] ?? null;
  const rawTier = parsePolicyWeightTier(name);
  const parsedMaxOz = rawTier ? rawTier.maxOz : routerTier ? routerTier.maxOz : null;

  const rawSuggestedName = buildSuggestedName({
    label: input.label,
    name,
    costType,
    freeShipping: input.freeShipping,
    localPickup: input.localPickup,
    maxWeightOz: input.maxWeightOz,
    flatPrice,
  });
  // C: a reserved-envelope name cannot be repaired by stripping tokens out of it --
  // "3oz under $20 Ebay Std Env $1.65" reduces to "3oz Ebay $1.65", which is not a
  // name anyone wants. Offer nothing rather than a nonsense one-click fix.
  const suggestedName = classification === 'standard-envelope' ? '' : rawSuggestedName;

  if (!name) {
    issues.push({ code: 'NAME_REQUIRED', field: 'name', message: 'Give this preset a name.' });
  }
  if (name.length > EBAY_POLICY_NAME_MAX_LENGTH) {
    issues.push({
      code: 'NAME_TOO_LONG',
      field: 'name',
      message: `eBay allows ${EBAY_POLICY_NAME_MAX_LENGTH} characters in a policy name. This one is ${name.length}.`,
    });
  }

  const allowed = allowedClassifications({
    costType,
    freeShipping: input.freeShipping,
    localPickup: input.localPickup,
    maxWeightOz: input.maxWeightOz,
  });

  if (name && !allowed.includes(classification)) {
    if (classification === 'standard-envelope') {
      issues.push({
        code: 'NAME_ENVELOPE_RESERVED',
        field: 'name',
        message:
          'Names containing "Standard Envelope" or "Std Env" are reserved. ' +
          CLASSIFICATION_MEANING['standard-envelope'] +
          ' Pick a different name.',
      });
    } else {
      issues.push({
        code: 'NAME_CLASSIFICATION_MISMATCH',
        field: 'name',
        message:
          `This name does not match what you set up. ${CLASSIFICATION_MEANING[classification]} ` +
          `Rename it — "${suggestedName}" matches your settings.`,
      });
    }
  }

  if (name && /under\s*\$/i.test(name)) {
    issues.push({
      code: 'NAME_PRICE_CAP',
      field: 'name',
      message:
        'Remove "under $..." from the name. FindA.Sale reads that as an item price limit for eBay\'s Standard Envelope program, and it can be mistaken for the shipping price.',
    });
  }

  // Price consistency: the name's LAST dollar amount is what the parser (and the
  // Google Shopping feed) reads as this policy's shipping price.
  if (input.freeShipping && parsedPrice != null) {
    issues.push({
      code: 'NAME_PRICE_ON_FREE',
      field: 'name',
      message: `The name says $${parsedPrice.toFixed(2)}, but this preset is free shipping. Take the price out of the name.`,
    });
  } else if (costType === 'CALCULATED' && parsedPrice != null) {
    issues.push({
      code: 'NAME_PRICE_ON_CALCULATED',
      field: 'name',
      message: `The name says $${parsedPrice.toFixed(2)}, but eBay works out this rate at checkout, so there is no fixed price. Take the price out of the name.`,
    });
  } else if (costType === 'FLAT_RATE' && !input.freeShipping) {
    if (parsedPrice != null && Math.abs(parsedPrice - flatPrice) > 0.005) {
      issues.push({
        code: 'NAME_PRICE_MISMATCH',
        field: 'name',
        message: `The name says $${parsedPrice.toFixed(2)} but you set the price to $${flatPrice.toFixed(2)}. Your Google Shopping listings quote the price in the name, so these have to match.`,
      });
    }
    if (parsedPrice == null && classification === 'weight-tier') {
      issues.push({
        code: 'NAME_PRICE_MISSING',
        field: 'name',
        message: `Put the price in the name, at the end — for example "${suggestedName}". Weight-based presets advertise the price from their name on your Google Shopping listings.`,
      });
    }
  }

  // Weight consistency.
  if (classification === 'weight-tier') {
    if (input.maxWeightOz == null || !(input.maxWeightOz > 0)) {
      issues.push({
        code: 'NAME_WEIGHT_WITHOUT_LIMIT',
        field: 'maxWeightOz',
        message:
          'The name states a weight, so FindA.Sale will route items to this preset by weight. Set the max weight to the same figure, or take the weight out of the name.',
      });
    } else if (parsedMaxOz != null && parsedMaxOz !== input.maxWeightOz) {
      issues.push({
        code: 'NAME_WEIGHT_MISMATCH',
        field: 'name',
        message: `The name works out to ${parsedMaxOz} oz but you set the max weight to ${input.maxWeightOz} oz. Items are routed by the figure in the name, so these have to match — "${suggestedName}" does.`,
      });
    }
  } else if (
    input.maxWeightOz != null &&
    input.maxWeightOz > 0 &&
    !input.freeShipping &&
    costType === 'FLAT_RATE' &&
    // Only nag when the policy would otherwise be inert. A pickup-flavoured or
    // free-shipping name is a deliberate choice; a max weight there is just the figure
    // used to price the package, not a routing instruction.
    (classification === 'unknown' || classification === 'category-specific')
  ) {
    issues.push({
      code: 'NAME_MISSING_WEIGHT',
      field: 'name',
      severity: 'notice',
      message: `Heads up: nothing will be sent here automatically by weight, because the name does not state one. That is fine if you plan to point a category or an item at it. If you wanted it used for everything up to ${input.maxWeightOz} oz, name it "${suggestedName}".`,
    });
  }

  return {
    ok: issues.every((i) => i.severity === 'notice'),
    issues,
    classification,
    classificationMeaning: CLASSIFICATION_MEANING[classification],
    parsedPrice,
    parsedMaxOz,
    suggestedName,
  };
}

// ── Configuration validation (non-name) ──────────────────────────────────────

export function validatePresetConfig(input: PresetInput): PresetNameIssue[] {
  const issues: PresetNameIssue[] = [];
  const service = findPresetShippingService(input.serviceKey);
  if (!service) {
    issues.push({ code: 'SERVICE_UNKNOWN', field: 'general', message: 'Pick a shipping service.' });
    return issues;
  }
  if (input.freeShipping && service.costType === 'CALCULATED') {
    issues.push({
      code: 'FREE_WITH_CALCULATED',
      field: 'general',
      message: 'Free shipping and "eBay works out the rate" cannot be combined. Pick one.',
    });
  }
  if (service.costType === 'FLAT_RATE' && !input.freeShipping) {
    const price = Number(input.flatPrice ?? NaN);
    if (!Number.isFinite(price) || price <= 0) {
      issues.push({ code: 'PRICE_REQUIRED', field: 'flatPrice', message: 'Enter what the buyer pays for shipping.' });
    } else if (price > 999) {
      issues.push({ code: 'PRICE_TOO_HIGH', field: 'flatPrice', message: 'That price looks wrong. Keep it under $999.' });
    }
  }
  const addl = Number(input.additionalItemPrice ?? 0);
  if (!Number.isFinite(addl) || addl < 0 || addl > 999) {
    issues.push({
      code: 'ADDITIONAL_PRICE_INVALID',
      field: 'general',
      message: 'The extra-item price has to be $0 or more, and under $999.',
    });
  }
  const days = Number(input.handlingDays);
  if (!Number.isInteger(days) || days < 0 || days > 30) {
    issues.push({ code: 'HANDLING_INVALID', field: 'general', message: 'Handling time has to be between 0 and 30 days.' });
  }
  if (input.maxWeightOz != null) {
    const oz = Number(input.maxWeightOz);
    if (!Number.isFinite(oz) || oz <= 0 || oz > 150 * 16) {
      issues.push({ code: 'WEIGHT_INVALID', field: 'maxWeightOz', message: 'Max weight has to be between 1 oz and 150 lb.' });
    }
  }
  for (const [field, value] of [
    ['length', input.maxLengthIn],
    ['width', input.maxWidthIn],
    ['height', input.maxHeightIn],
  ] as Array<[string, number | null | undefined]>) {
    if (value == null) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 130) {
      issues.push({ code: 'DIMS_INVALID', field: 'general', message: `The ${field} has to be between 1 and 130 inches.` });
    }
  }
  const handling = Number(input.handlingCharge ?? 0);
  if (!Number.isFinite(handling) || handling < 0 || handling > 999) {
    issues.push({ code: 'HANDLING_CHARGE_INVALID', field: 'general', message: 'The handling charge has to be $0 or more, and under $999.' });
  }
  return issues;
}

// ── Rate engine pre-fill ─────────────────────────────────────────────

/**
 * Where a preset estimate's ship-from location came from, best to worst.
 *
 *   'sale-zip'               the ZIP of one of the organizer's real sales -- the SAME
 *                            signal every live listing-pricing path uses. Exact.
 *   'organizer-address-zip'  a 5-digit ZIP parsed off Organizer.address. Right region,
 *                            but it is the business address, not necessarily where a
 *                            given sale ships from.
 *   'organizer-latlng'       geocoded profile coordinates. Same caveat, coarser.
 *   'worst-case-fallback'    nothing at all was on file. See WORST_CASE_ZONE.
 */
export type PresetOriginBasis =
  | 'sale-zip'
  | 'organizer-address-zip'
  | 'organizer-latlng'
  | 'worst-case-fallback';

/**
 * Local copy of the rate service's zone ordering, used ONLY to pick the max of several
 * candidate zones. The rate service owns the zone->price mapping; this array encodes
 * nothing but "z8 is farther than z7". Kept local rather than imported because
 * ebayRateEstimateService does not export its ZONE_ORDER.
 */
const ZONE_ORDER_LOCAL: ZoneKey[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'];
function worseZone(a: ZoneKey, b: ZoneKey): ZoneKey {
  return ZONE_ORDER_LOCAL.indexOf(a) >= ZONE_ORDER_LOCAL.indexOf(b) ? a : b;
}

/**
 * The zone used when we genuinely cannot determine the organizer's ship-from location.
 *
 * WHY THE MOST EXPENSIVE ZONE, AND NOT A MIDDLE ONE. The old behaviour here passed
 * `zip: null` with a null lat/lng, which bottomed out in coverageZoneForOrigin's final
 * `else` branch at a "conservative" z6. z6 is not conservative -- it is conservative
 * only in the sense of being mid-table, and for a flat-rate preset that is precisely
 * backwards. A zone guess that is too LOW under-states the label cost, which
 *   (a) pre-fills the organizer's price below what the label will actually cost, and
 *   (b) feeds checkPriceAgainstEngine() in createPreset(), so the below-cost guard
 *       compares the organizer's price against a fake-cheap label and cheerfully
 *       PASSES a price that loses money on every sale.
 * A guard that under-states cost is worse than no guard, because it launders a bad
 * price as an approved one. Erring high costs the organizer nothing (they can lower
 * it, and the form tells them why it is high); erring low costs them real money
 * silently, on every single order, until they notice.
 *
 * z8 is the worst real CONUS zone, and it is what ZIP1_MAX_ZONE already assigns to 6 of
 * the 10 leading ZIP digits -- so this is not a pathological number, it is the normal
 * answer for most of the country.
 */
const WORST_CASE_ZONE: ZoneKey = 'z8';

const ORIGIN_NOTE: Record<PresetOriginBasis, string | undefined> = {
  'sale-zip': undefined,
  'organizer-address-zip':
    "Priced from the ZIP in your business address. If you ship from somewhere else, the real cost can differ \u2014 add the sale's address and this will use it.",
  'organizer-latlng':
    'Priced from your profile location rather than a sale address, so treat this as a close estimate.',
  'worst-case-fallback':
    "We don't know where you ship from yet, so this is priced to the most expensive part of the country \u2014 your real cost is likely lower. Add a sale with an address to get an exact number.",
};

interface ResolvedPresetOrigin {
  basis: PresetOriginBasis;
  zip: string | null;
  zone: ZoneKey;
}

/** First 5-digit ZIP-looking token at the end of a free-text US address, if any. */
function zipFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  return m ? m[1] : null;
}

function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = String(zip).replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

/**
 * Resolve the ship-from origin for an ACCOUNT-WIDE preset.
 *
 * An eBay fulfillment policy is not scoped to one sale -- it applies to every item the
 * organizer lists. So when an organizer ships from several ZIPs, the honest price for a
 * single flat-rate preset is the one that covers the WORST of them, for exactly the
 * reason coverageZoneForOrigin already prices to the farthest CONUS destination: a flat
 * rate is one price for all buyers, so it must never be short.
 *
 * Precedence deliberately mirrors coverageZoneForOrigin's own documented order (ZIP
 * first, lat/lng only as a fallback). Before this, estimatePresetRate hardcoded
 * `zip: null` and passed only the organizer's lat/lng -- which meant the ONE surface
 * whose entire job is guarding the price was also the ONE surface not using the sale
 * ZIP that every live pricing path uses.
 */
async function resolvePresetOrigin(organizerId: string): Promise<ResolvedPresetOrigin> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    // Organizer has NO ZIP column (verified against schema.prisma) -- the ZIP lives on
    // Sale.zip (required, non-null there). `address` is a required free-text field and
    // usually ends in a ZIP, which makes it a usable second-choice signal.
    select: {
      lat: true,
      lng: true,
      address: true,
      sales: {
        where: { deletedAt: null },
        select: { zip: true },
      },
    },
  });

  // 1. Real sale ZIPs -- the same signal the live listing paths price from.
  const saleZips = Array.from(
    new Set(
      (organizer?.sales ?? [])
        .map((sale) => normalizeZip(sale.zip))
        .filter((zip): zip is string => zip !== null)
    )
  );
  if (saleZips.length > 0) {
    const zones = await Promise.all(saleZips.map((zip) => resolveCoverageZone({ zip })));
    let zone = zones[0];
    let zip = saleZips[0];
    zones.forEach((candidate, i) => {
      if (worseZone(zone, candidate) === candidate && candidate !== zone) {
        zone = candidate;
        zip = saleZips[i];
      }
    });
    return { basis: 'sale-zip', zip, zone };
  }

  // 2. ZIP parsed off the organizer's business address.
  const addressZip = normalizeZip(zipFromAddress(organizer?.address));
  if (addressZip) {
    return {
      basis: 'organizer-address-zip',
      zip: addressZip,
      zone: await resolveCoverageZone({ zip: addressZip }),
    };
  }

  // 3. Geocoded profile coordinates.
  if (organizer?.lat != null && organizer?.lng != null && !isNaN(organizer.lat) && !isNaN(organizer.lng)) {
    return {
      basis: 'organizer-latlng',
      zip: null,
      zone: await resolveCoverageZone({ lat: organizer.lat, lng: organizer.lng }),
    };
  }

  // 4. Nothing on file. Price high and SAY SO -- never silently price low.
  return { basis: 'worst-case-fallback', zip: null, zone: WORST_CASE_ZONE };
}

/**
 * Price a hypothetical package through FindA.Sale's own rate engine and return the
 * number the automatic path would use, so the create form can pre-fill it.
 *
 * Read-only: no eBay call, no DB write. Same pricing pipeline as ensureFvfFlatRatePolicy
 * (resolve coverage zone -> estimateCheapestRate -> computeFvfFlatRate ->
 * roundUpToBucket -> applyCharmPricing) so the suggested price can never disagree with
 * what the automatic path would have charged for the same package.
 *
 * Zone resolution is done here rather than by handing an origin to
 * computeCheapestForOrigin, because a preset is account-wide and may have several
 * candidate origins (see resolvePresetOrigin). computeCheapestForOrigin is exactly
 * `resolveCoverageZone` + `estimateCheapestRate`; this calls the same two exported
 * functions in the same order, so no pricing math is duplicated -- only the choice of
 * WHICH zone differs.
 */
export async function estimatePresetRate(
  organizerId: string,
  input: {
    weightOz: number;
    lengthIn?: number | null;
    widthIn?: number | null;
    heightIn?: number | null;
    packageType?: string | null;
  }
): Promise<PresetRateEstimate> {
  const base: PresetRateEstimate = {
    available: false,
    weightOz: input.weightOz ?? null,
    fvfRate: EBAY_SHIPPING_FVF_RATE,
  };

  if (!Number.isFinite(input.weightOz) || input.weightOz <= 0) {
    return { ...base, unavailableReason: 'Enter the package weight to see a suggested price.' };
  }

  const origin = await resolvePresetOrigin(organizerId);

  const dims =
    input.lengthIn && input.widthIn && input.heightIn
      ? { length: Number(input.lengthIn), width: Number(input.widthIn), height: Number(input.heightIn) }
      : null;

  try {
    const cheapest = estimateCheapestRate({
      weightOz: input.weightOz,
      dims,
      zone: origin.zone,
      packageType: input.packageType ?? null,
      categoryId: null,
      priceUsd: null,
    });

    const bucketedRate = roundUpToBucket(cheapest.rate);
    const suggestedBuyerPrice = applyCharmPricing(roundUpToBucket(computeFvfFlatRate(cheapest.rate)));
    const suggestedHandlingCharge = round2(computeFvfFlatRate(bucketedRate) - bucketedRate);

    return {
      available: true,
      weightOz: input.weightOz,
      carrier: cheapest.carrier,
      zone: cheapest.zone,
      basis: cheapest.basis,
      labelCost: round2(cheapest.rate),
      suggestedBuyerPrice,
      suggestedHandlingCharge,
      fvfRate: EBAY_SHIPPING_FVF_RATE,
      originBasis: origin.basis,
      originZip: origin.zip,
      originNote: ORIGIN_NOTE[origin.basis],
    };
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      return {
        ...base,
        unavailableReason:
          'This package is bigger or heavier than any carrier will take, so there is no rate to suggest. Ship it freight or offer local pickup.',
      };
    }
    return {
      ...base,
      unavailableReason: 'Could not work out a suggested price right now. You can still set your own.',
    };
  }
}

/**
 * The below-cost guard. eBay charges its Final Value Fee on the shipping the buyer
 * pays, so an organizer who charges exactly the label cost still loses 13.6% of it.
 */
export function checkPriceAgainstEngine(enteredPrice: number, labelCost: number): PresetPriceCheck {
  const netToSeller = round2(enteredPrice * (1 - EBAY_SHIPPING_FVF_RATE));
  const shortfall = round2(Math.max(0, labelCost - netToSeller));
  return {
    enteredPrice: round2(enteredPrice),
    labelCost: round2(labelCost),
    netToSeller,
    shortfall,
    belowCost: shortfall > 0,
  };
}

// ── eBay policy list ─────────────────────────────────────────────────────────

interface RawEbayPolicy {
  fulfillmentPolicyId: string;
  name: string;
  description?: string;
  localPickup?: boolean;
  handlingTime?: { unit?: string; value?: number };
  shippingOptions?: Array<{
    costType?: string;
    shippingServices?: Array<{ freeShipping?: boolean }>;
  }>;
}

async function fetchLivePolicies(accessToken: string): Promise<RawEbayPolicy[]> {
  const res = await fetch(
    ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
    { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
  );
  if (!res.ok) {
    throw new Error(`eBay returned ${res.status} when listing your shipping policies.`);
  }
  const data = (await res.json()) as any;
  return Array.isArray(data?.fulfillmentPolicies) ? data.fulfillmentPolicies : [];
}

/**
 * Every live fulfillment policy on the organizer's eBay account, with the
 * classification/price/weight FindA.Sale actually parses out of its name, plus how
 * many of this organizer's items are on it.
 */
export async function listPresets(organizerId: string): Promise<LivePresetRow[]> {
  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    throw new Error('Could not reach your eBay account. Reconnect eBay and try again.');
  }
  const policies = await fetchLivePolicies(accessToken);

  const ownedItems = { OR: [{ organizerId }, { sale: { organizerId } }] };

  const [liveCounts, pinnedCounts] = await Promise.all([
    prisma.item.groupBy({
      by: ['ebayFulfillmentPolicyId'],
      where: { AND: [ownedItems, { ebayFulfillmentPolicyId: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.item.groupBy({
      by: ['ebayFulfillmentPolicyOverrideId'],
      where: { AND: [ownedItems, { ebayFulfillmentPolicyOverrideId: { not: null } }] },
      _count: { _all: true },
    }),
  ]);

  const liveByPolicy = new Map<string, number>();
  for (const row of liveCounts) {
    if (row.ebayFulfillmentPolicyId) liveByPolicy.set(row.ebayFulfillmentPolicyId, row._count._all);
  }
  const pinnedByPolicy = new Map<string, number>();
  for (const row of pinnedCounts) {
    if (row.ebayFulfillmentPolicyOverrideId)
      pinnedByPolicy.set(row.ebayFulfillmentPolicyOverrideId, row._count._all);
  }

  return policies.map((p) => {
    const classification = classifyPolicy(p.name || '');
    const tier = parsePolicyWeightTier(p.name || '');
    const option = Array.isArray(p.shippingOptions) ? p.shippingOptions[0] : undefined;
    return {
      fulfillmentPolicyId: p.fulfillmentPolicyId,
      name: p.name,
      description: p.description ?? null,
      classification,
      classificationLabel: classificationLabel(classification),
      costType: option?.costType ?? null,
      parsedPrice: parsePriceFromPolicyName(p.name || ''),
      parsedMaxOz: tier ? tier.maxOz : null,
      freeShipping: Boolean(option?.shippingServices?.some((s) => s?.freeShipping)),
      localPickup: Boolean(p.localPickup),
      handlingDays: typeof p.handlingTime?.value === 'number' ? p.handlingTime.value : null,
      usedByItemCount: liveByPolicy.get(p.fulfillmentPolicyId) ?? 0,
      pinnedByItemCount: pinnedByPolicy.get(p.fulfillmentPolicyId) ?? 0,
    };
  });
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreatePresetResult {
  ok: boolean;
  /** Present when ok === false. */
  issues?: PresetNameIssue[];
  /** Present when the create was blocked by the below-cost guard. */
  priceCheck?: PresetPriceCheck;
  policy?: LivePresetRow;
  adopted?: boolean;
}

/**
 * Create a real eBay fulfillment policy for this organizer.
 *
 * Order of operations is deliberate: validate config -> validate name -> confirm the
 * name is not already taken -> confirm the organizer is under the policy ceiling ->
 * run the below-cost guard -> only then call eBay. Nothing reaches eBay until every
 * local check has passed, so a rejected attempt costs zero external calls.
 */
export async function createPreset(organizerId: string, input: PresetInput): Promise<CreatePresetResult> {
  const configIssues = validatePresetConfig(input);
  if (configIssues.length > 0) return { ok: false, issues: configIssues };

  const service = findPresetShippingService(input.serviceKey)!;
  const nameCheck = validatePresetName(input);
  if (!nameCheck.ok) return { ok: false, issues: nameCheck.issues };

  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    return {
      ok: false,
      issues: [
        {
          code: 'EBAY_UNREACHABLE',
          field: 'general',
          message: 'Could not reach your eBay account. Reconnect eBay and try again.',
        },
      ],
    };
  }

  const name = input.name.trim();
  const existing = await fetchLivePolicies(accessToken);

  if (existing.length >= MAX_FULFILLMENT_POLICIES_PER_ORGANIZER) {
    return {
      ok: false,
      issues: [
        {
          code: 'POLICY_LIMIT_REACHED',
          field: 'general',
          message: `Your eBay account already has ${existing.length} shipping policies, which is as many as FindA.Sale will create. Delete one on eBay before adding another.`,
        },
      ],
    };
  }

  const duplicate = existing.find((p) => p.name === name);
  if (duplicate) {
    return {
      ok: false,
      issues: [
        {
          code: 'NAME_DUPLICATE',
          field: 'name',
          message: `You already have a shipping policy called "${name}". Pick a different name, or use the existing one.`,
        },
      ],
    };
  }

  // Below-cost guard (the FEDEX-GUITAR guard). Only meaningful for a flat price with a
  // package to model — a calculated preset has no fixed price to check.
  let priceCheck: PresetPriceCheck | undefined;
  if (service.costType === 'FLAT_RATE' && !input.freeShipping && input.maxWeightOz) {
    const estimate = await estimatePresetRate(organizerId, {
      weightOz: input.maxWeightOz,
      lengthIn: input.maxLengthIn,
      widthIn: input.maxWidthIn,
      heightIn: input.maxHeightIn,
    });
    if (estimate.available && estimate.labelCost != null) {
      priceCheck = checkPriceAgainstEngine(Number(input.flatPrice ?? 0), estimate.labelCost);
      if (priceCheck.belowCost && input.acknowledgeBelowCost !== true) {
        return {
          ok: false,
          priceCheck,
          issues: [
            {
              code: 'PRICE_BELOW_COST',
              field: 'flatPrice',
              // The origin note matters here specifically: when the label cost was
              // priced from the worst-case fallback (no ZIP on file anywhere), the
              // organizer needs to know THAT is why the number looks high, or the
              // guard reads as broken and gets acknowledged away reflexively.
              message:
                `At $${priceCheck.enteredPrice.toFixed(2)} you keep $${priceCheck.netToSeller.toFixed(2)} after eBay's fee on shipping, but the label for this package costs about $${priceCheck.labelCost.toFixed(2)} — you would pay $${priceCheck.shortfall.toFixed(2)} out of pocket on every sale. Raise the price, or confirm you meant to.` +
                (estimate.originNote ? ` ${estimate.originNote}` : ''),
            },
          ],
        };
      }
    }
  }

  const handlingDays = Math.max(0, Math.min(30, Math.round(Number(input.handlingDays))));
  const flatPrice = input.freeShipping ? 0 : Number(input.flatPrice ?? 0);
  const additional = Number(input.additionalItemPrice ?? 0);

  const shippingOption: Record<string, any> = {
    optionType: 'DOMESTIC',
    costType: service.costType,
    shippingServices: [
      {
        shippingServiceCode: service.shippingServiceCode,
        shippingCarrierCode: service.shippingCarrierCode,
        sortOrder: 1,
        freeShipping: input.freeShipping === true,
      },
    ],
  };

  if (service.costType === 'FLAT_RATE') {
    shippingOption.shippingServices[0].shippingCost = { value: flatPrice.toFixed(2), currency: 'USD' };
    shippingOption.shippingServices[0].additionalShippingCost = {
      value: additional.toFixed(2),
      currency: 'USD',
    };
  } else {
    // packageHandlingCost is a sibling of costType at the shippingOptions level, NOT
    // nested inside a shippingService — see ebayCalculatedPolicyService.ts. eBay does
    // not accept it together with free shipping, which validatePresetConfig blocks.
    const handlingCharge = Number(input.handlingCharge ?? 0);
    if (handlingCharge > 0) {
      shippingOption.packageHandlingCost = { value: handlingCharge.toFixed(2), currency: 'USD' };
    }
  }

  const body: Record<string, any> = {
    name,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { unit: 'DAY', value: handlingDays },
    shippingOptions: [shippingOption],
  };
  if (input.localPickup === true) body.localPickup = true;

  let createdId: string | null = null;
  let adopted = false;

  try {
    const res = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy'), {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      createdId = data?.fulfillmentPolicyId ?? null;
      console.log(`[eBay Preset] created organizer=${organizerId} policy=${createdId} costType=${service.costType}`);
    } else {
      const errText = await res.text();
      if (errText.includes('20400') || /already exists/i.test(errText)) {
        const after = await fetchLivePolicies(accessToken);
        createdId = after.find((p) => p.name === name)?.fulfillmentPolicyId ?? null;
        adopted = createdId != null;
      }
      if (!createdId) {
        console.warn(
          `[eBay Preset] create failed organizer=${organizerId} status=${res.status} err=${errText.slice(0, 300)}`
        );
        return {
          ok: false,
          issues: [
            {
              code: 'EBAY_REJECTED',
              field: 'general',
              message: `eBay would not accept this preset (${res.status}). Check the name and price, then try again.`,
            },
          ],
        };
      }
    }
  } catch (err: any) {
    console.warn(`[eBay Preset] create error organizer=${organizerId}`, err?.message ?? err);
    return {
      ok: false,
      issues: [
        { code: 'EBAY_UNREACHABLE', field: 'general', message: 'Could not reach eBay just now. Try again in a moment.' },
      ],
    };
  }

  const classification = classifyPolicy(name);
  const tier = parsePolicyWeightTier(name);

  return {
    ok: true,
    adopted,
    priceCheck,
    policy: {
      fulfillmentPolicyId: createdId!,
      name,
      description: null,
      classification,
      classificationLabel: classificationLabel(classification),
      costType: service.costType,
      parsedPrice: parsePriceFromPolicyName(name),
      parsedMaxOz: tier ? tier.maxOz : null,
      freeShipping: input.freeShipping === true,
      localPickup: input.localPickup === true,
      handlingDays,
      usedByItemCount: 0,
      pinnedByItemCount: 0,
    },
  };
}

/**
 * Confirm a policy id really belongs to this organizer's own eBay account before we
 * let anything be bound to it. Stops one organizer pinning an item to a policy id
 * belonging to another seller (OWNERSHIP / TENANT-ISOLATION).
 */
export async function organizerOwnsPolicy(organizerId: string, policyId: string): Promise<boolean> {
  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) return false;
  const policies = await fetchLivePolicies(accessToken);
  return policies.some((p) => p.fulfillmentPolicyId === policyId);
}
