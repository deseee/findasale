/**
 * Bulk lot eBay bundles (ADR-136 Addendum C, roadmap #659). Pure functions: no database, no env, no network, no
 * imports of anything with side effects. Everything money-related is integer cents.
 *
 * MODEL
 *  A bulk lot stays ONE Item (stockTotal / stockSold are cards, Item.price is dollars per 1,000 cards). On eBay the
 *  lot is sold as fixed-size BUNDLES: the organizer picks a bundle size (for example 500 or 1,000 cards).
 *   - bundle price  = the register's price for bundleSize cards (priceCentsForCards, half up, rounded once), optionally
 *                     moved by an organizer premium or discount in basis points, rounded once (single rounding, see
 *                     computeBundlePriceCents).
 *   - listing qty   = floor(cards left / bundleSize). Below one bundle the listing is ended; it relists when stock returns.
 *   - an order of N bundles takes N x bundleSize cards from the lot through the guarded decrement (sellItemUnits).
 *
 * EBAY FACTS THIS FILE RELIES ON (full list with source URLs in ADR-136 Addendum C):
 *  - Category 183455 "Mixed Card Lots" (parent 2536 Collectible Card Games) is where bulk lots of trading cards list.
 *    Whether it is a leaf and which item specifics and condition values it accepts is verified read-only by
 *    src/scripts/verifyBulkLotEbayBundle.ts; those results are NOT confirmed until Patrick runs it.
 *  - Titles are limited to 80 characters (the existing pipeline also cuts at 80).
 *  - eBay Standard Envelope: item price up to $20, weight up to 3 oz, letter-size flat envelope. A bundle is never
 *    eligible: it weighs at least MIN_BUNDLE_WEIGHT_OZ (4 oz) by validation, and BUNDLE_NEVER_STANDARD_ENVELOPE is also
 *    passed to the shipping resolver, which then refuses the envelope outright.
 */
import { z } from 'zod';
import { priceCentsForCards, remainingCards, formatCardCount, formatCents } from './bulkLotPricing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** eBay category for bulk lots of trading cards. Leaf status is unconfirmed until the verify script runs. */
export const BULK_EBAY_CATEGORY = { id: '183455', name: 'Mixed Card Lots' } as const;

export const BUNDLE_SIZE_MIN = 100;
export const BUNDLE_SIZE_MAX = 5000;
export const DEFAULT_BUNDLE_SIZE = 1000;
/** Quick picks in the UI. Any whole number between the min and the max is allowed. */
export const BUNDLE_SIZE_PRESETS: readonly number[] = [100, 250, 500, 1000, 2500, 5000];

/** Organizer premium or discount on the derived bundle price, in basis points (100 = 1%). -50% to +100%. */
export const ADJUSTMENT_BPS_MIN = -5000;
export const ADJUSTMENT_BPS_MAX = 10000;

/** Never lower: a bundle that weighs 3 oz or less would qualify for the Standard Envelope. */
export const MIN_BUNDLE_WEIGHT_OZ = 4;
export const MAX_BUNDLE_WEIGHT_OZ = 1120;
export const MIN_BUNDLE_DIM_IN = 0.5;
export const MAX_BUNDLE_DIM_IN = 60;

/** Passed to the shipping resolver for every bundle: the Standard Envelope can never be chosen. */
export const BUNDLE_NEVER_STANDARD_ENVELOPE = true;

/** Conservative ceiling on one bundle's price, in cents ($99,999.99). eBay's own ceiling is unconfirmed. */
export const BUNDLE_MAX_PRICE_CENTS = 9_999_999;

export const EBAY_TITLE_MAX = 80;
export const BUNDLE_LANGUAGES_MAX = 30;

/**
 * Default package data (estimates the organizer must confirm; nothing here is ever treated as confirmed).
 *  - One standard MTG card weighs 0.064 oz (1.814 g) and is 0.012 in thick (draftsim.com/mtg-card-size).
 *  - BCW 800-count box: exterior 15 3/8 x 3 1/8 x 4 1/4 in, 0.29 lb (4.64 oz), interior 14 1/8 x 2 3/4 x 3 3/4 in
 *    (bcwsupplies.com/800-card-storage-box-2-piece). 14.125 in of interior at 0.012 in per unsleeved card is about
 *    1,170 cards, so 1,100 per box leaves a margin.
 *  - Outer carton, tape and filler: PACKING_OZ is an assumption, not a sourced figure.
 */
export const CARD_WEIGHT_OZ = 0.064;
export const BOX_CARD_CAPACITY = 1100;
export const BOX_TARE_OZ = 4.64;
export const BOX_LENGTH_IN = 15.375;
export const BOX_WIDTH_IN = 3.125;
export const BOX_HEIGHT_IN = 4.25;
export const PACKING_OZ = 8;
export const PACKING_ALLOWANCE_IN = 1;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BulkEbayErrorCode =
  | 'BUNDLE_DISABLED'
  | 'BUNDLE_VALIDATION'
  | 'BUNDLE_NOT_FOUND'
  | 'BUNDLE_NOT_LOT'
  | 'BUNDLE_NOT_ENABLED'
  | 'BUNDLE_BELOW_ONE'
  | 'BUNDLE_PRICE_INVALID'
  | 'BUNDLE_PRICE_TOO_HIGH'
  | 'BUNDLE_PACKAGE_UNCONFIRMED'
  | 'BUNDLE_NOT_CONNECTED'
  | 'BUNDLE_EBAY_FAILED';

export class BulkEbayError extends Error {
  readonly code: BulkEbayErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: BulkEbayErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BulkEbayError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isBulkEbayError(err: unknown): err is BulkEbayError {
  return err instanceof BulkEbayError;
}

export const BULK_EBAY_MESSAGES: Record<BulkEbayErrorCode, string> = {
  BUNDLE_DISABLED: 'eBay bundles for bulk lots are not turned on yet.',
  BUNDLE_VALIDATION: 'Some of the bundle settings are not valid.',
  BUNDLE_NOT_FOUND: 'That lot was not found.',
  BUNDLE_NOT_LOT: 'That item is not a bulk lot.',
  BUNDLE_NOT_ENABLED: 'Turn on eBay bundles for this lot first, and choose a bundle size.',
  BUNDLE_BELOW_ONE: 'This lot has fewer cards left than one bundle.',
  BUNDLE_PRICE_INVALID: 'Set a price per 1,000 cards above $0.00 before listing bundles on eBay.',
  BUNDLE_PRICE_TOO_HIGH: 'This bundle would be priced above the limit this app sends to eBay. Choose a smaller bundle size or a discount.',
  BUNDLE_PACKAGE_UNCONFIRMED: 'Confirm the box weight and size for this bundle before listing. Weigh a packed bundle and enter the real numbers.',
  BUNDLE_NOT_CONNECTED: 'Connect your eBay account first.',
  BUNDLE_EBAY_FAILED: 'eBay did not accept the change. Nothing was changed on your counter stock.',
};

/** Shown when the bundle size is changed while the eBay listing for the old size is live. */
export const BUNDLE_SIZE_LOCKED_MESSAGE =
  'This lot has a live eBay listing for the current bundle size. Turn eBay bundles off so the listing ends, then change the size and turn it back on. Changing it while buyers can still order the old bundle would count their orders wrongly.';

// ---------------------------------------------------------------------------
// Settings (zod, strict: an unknown key is an error)
// ---------------------------------------------------------------------------

/** "-5" or "12.5" percent to integer basis points, rounded once. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

const cleanText = (s: string): string => s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();

const dimField = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number.` })
    .min(MIN_BUNDLE_DIM_IN, `${label} must be at least ${MIN_BUNDLE_DIM_IN} inches.`)
    .max(MAX_BUNDLE_DIM_IN, `${label} must be at most ${MAX_BUNDLE_DIM_IN} inches.`);

export const BundleSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    bundleSize: z
      .number({ invalid_type_error: 'Enter the bundle size as a whole number of cards.', required_error: 'Enter the bundle size.' })
      .int('Enter the bundle size as a whole number of cards.')
      .min(BUNDLE_SIZE_MIN, `A bundle holds at least ${formatCardCount(BUNDLE_SIZE_MIN)} cards.`)
      .max(BUNDLE_SIZE_MAX, `A bundle holds at most ${formatCardCount(BUNDLE_SIZE_MAX)} cards.`),
    /** Premium (positive) or discount (negative) on the derived bundle price, in percent. 0 = the register price. */
    adjustmentPercent: z
      .number({ invalid_type_error: 'Enter the premium or discount as a number.' })
      .min(bpsToPercent(ADJUSTMENT_BPS_MIN), 'A discount can be at most 50%.')
      .max(bpsToPercent(ADJUSTMENT_BPS_MAX), 'A premium can be at most 100%.')
      .optional(),
    ebayTitle: z.string().transform(cleanText).refine((v) => v.length <= EBAY_TITLE_MAX, `The eBay title can be at most ${EBAY_TITLE_MAX} characters.`).nullable().optional(),
    condition: z.enum(['USED', 'NEW']).optional(),
    language: z.string().transform(cleanText).refine((v) => v.length >= 2 && v.length <= BUNDLE_LANGUAGES_MAX, 'Enter the card language, for example English.').optional(),
    weightOz: z
      .number({ invalid_type_error: 'Weight must be a number of ounces.' })
      .min(MIN_BUNDLE_WEIGHT_OZ, `A packed bundle weighs at least ${MIN_BUNDLE_WEIGHT_OZ} oz.`)
      .max(MAX_BUNDLE_WEIGHT_OZ, `A packed bundle weighs at most ${MAX_BUNDLE_WEIGHT_OZ} oz.`)
      .optional(),
    lengthIn: dimField('Length').optional(),
    widthIn: dimField('Width').optional(),
    heightIn: dimField('Height').optional(),
    dimsConfirmed: z.boolean().optional(),
  })
  .strict();

export type BundleSettingsInput = z.infer<typeof BundleSettingsSchema>;

export function parseBundleSettings(raw: unknown): BundleSettingsInput {
  const parsed = BundleSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  throw new BulkEbayError('BUNDLE_VALIDATION', 400, first?.message || BULK_EBAY_MESSAGES.BUNDLE_VALIDATION, {
    field: first?.path?.join('.') || undefined,
  });
}

// ---------------------------------------------------------------------------
// Price and quantity
// ---------------------------------------------------------------------------

export type BundlePriceResult = { ok: true; cents: number } | { ok: false; code: 'BUNDLE_PRICE_INVALID' | 'BUNDLE_PRICE_TOO_HIGH' };

/**
 * Price of ONE bundle in cents.
 *
 * With adjustmentBps = 0 this is exactly priceCentsForCards(bundleSize, P): floor((size * P + 500) / 1000). With an
 * adjustment it is rounded ONCE, half up, from the exact value size * P * (10000 + bps) / 10,000,000, never from an
 * already-rounded register price (two roundings could disagree by a cent). Safe integer range: size <= 5,000,
 * P <= 10,000,000 and (10000 + bps) <= 20,000 give at most 1e15, below 2^53.
 */
export function computeBundlePriceCents(bundleSize: number, pricePerThousandCents: number | null | undefined, adjustmentBps = 0): BundlePriceResult {
  if (!Number.isSafeInteger(bundleSize) || bundleSize < BUNDLE_SIZE_MIN || bundleSize > BUNDLE_SIZE_MAX) {
    return { ok: false, code: 'BUNDLE_PRICE_INVALID' };
  }
  if (typeof pricePerThousandCents !== 'number') return { ok: false, code: 'BUNDLE_PRICE_INVALID' };
  const base = priceCentsForCards(bundleSize, pricePerThousandCents);
  if (!base.ok) return { ok: false, code: 'BUNDLE_PRICE_INVALID' };
  if (!Number.isSafeInteger(adjustmentBps) || adjustmentBps < ADJUSTMENT_BPS_MIN || adjustmentBps > ADJUSTMENT_BPS_MAX) {
    return { ok: false, code: 'BUNDLE_PRICE_INVALID' };
  }
  const cents = Math.floor((bundleSize * pricePerThousandCents * (10000 + adjustmentBps) + 5_000_000) / 10_000_000);
  if (cents < 1) return { ok: false, code: 'BUNDLE_PRICE_INVALID' };
  if (cents > BUNDLE_MAX_PRICE_CENTS) return { ok: false, code: 'BUNDLE_PRICE_TOO_HIGH' };
  return { ok: true, cents };
}

/** Number of whole bundles that can be offered from the cards left. */
export function bundleQuantity(remaining: number, bundleSize: number): number {
  if (!Number.isSafeInteger(remaining) || remaining < 1) return 0;
  if (!Number.isSafeInteger(bundleSize) || bundleSize < 1) return 0;
  return Math.floor(remaining / bundleSize);
}

/** Cards taken from the lot by an order of `bundles` bundles. Null when the figures are not whole positive numbers. */
export function cardsForBundles(bundles: number, bundleSize: number): number | null {
  if (!Number.isSafeInteger(bundles) || bundles < 1) return null;
  if (!Number.isSafeInteger(bundleSize) || bundleSize < 1) return null;
  const cards = bundles * bundleSize;
  return Number.isSafeInteger(cards) ? cards : null;
}

// ---------------------------------------------------------------------------
// Package defaults and validation
// ---------------------------------------------------------------------------

export interface BundlePackage {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

const ceilHalf = (x: number): number => Math.ceil(x * 2) / 2;
const ceilTenth = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;

/**
 * Suggested packed weight and outer dimensions for a bundle of `bundleSize` unsleeved standard cards in BCW 800-count
 * boxes (see the constants above for sources). Weight is rounded UP to 0.1 oz and dimensions up to the next half inch,
 * so a rate quoted from them is never short. These are suggestions only: the organizer weighs a real packed bundle
 * and confirms (dimsConfirmed), and the push refuses until they have.
 */
export function suggestBundlePackage(bundleSize: number): BundlePackage {
  const size = Number.isSafeInteger(bundleSize) && bundleSize > 0 ? bundleSize : DEFAULT_BUNDLE_SIZE;
  const boxes = Math.max(1, Math.ceil(size / BOX_CARD_CAPACITY));
  const weight = size * CARD_WEIGHT_OZ + boxes * BOX_TARE_OZ + PACKING_OZ;
  return {
    weightOz: Math.max(ceilTenth(weight), MIN_BUNDLE_WEIGHT_OZ),
    lengthIn: ceilHalf(BOX_LENGTH_IN + PACKING_ALLOWANCE_IN),
    widthIn: ceilHalf(BOX_WIDTH_IN * boxes + PACKING_ALLOWANCE_IN),
    heightIn: ceilHalf(BOX_HEIGHT_IN + PACKING_ALLOWANCE_IN),
  };
}

/** A plain-language reason the package is not usable, or null. */
export function validateBundlePackage(pkg: Partial<BundlePackage>): string | null {
  const w = pkg.weightOz;
  if (typeof w !== 'number' || !Number.isFinite(w)) return 'Enter the packed weight in ounces.';
  if (w < MIN_BUNDLE_WEIGHT_OZ) return `A packed bundle weighs at least ${MIN_BUNDLE_WEIGHT_OZ} oz.`;
  if (w > MAX_BUNDLE_WEIGHT_OZ) return `A packed bundle weighs at most ${MAX_BUNDLE_WEIGHT_OZ} oz.`;
  for (const [label, v] of [['length', pkg.lengthIn], ['width', pkg.widthIn], ['height', pkg.heightIn]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return `Enter the box ${label} in inches.`;
    if (v < MIN_BUNDLE_DIM_IN || v > MAX_BUNDLE_DIM_IN) return `The box ${label} must be between ${MIN_BUNDLE_DIM_IN} and ${MAX_BUNDLE_DIM_IN} inches.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Listing text
// ---------------------------------------------------------------------------

const GAME_LABELS: Readonly<Record<string, string>> = {
  MTG: 'Magic: The Gathering',
  POKEMON: 'Pokemon',
  YUGIOH: 'Yu-Gi-Oh!',
  LORCANA: 'Disney Lorcana',
  ONE_PIECE: 'One Piece',
};

/** Item specific "Game" value per game code (first live value seen 2026-10-04 in 183454; same spelling is tried in 183455). */
const GAME_ASPECT_VALUES: Readonly<Record<string, string>> = {
  MTG: 'Magic: The Gathering',
  POKEMON: 'Pokémon TCG',
  YUGIOH: 'Yu-Gi-Oh! TCG',
  LORCANA: 'Disney Lorcana TCG',
  ONE_PIECE: 'One Piece CCG',
};

const KIND_TITLE_PHRASE: Readonly<Record<string, string>> = {
  BULK_COMMON: 'Commons',
  BULK_UNCOMMON: 'Uncommons',
  BULK_COMMON_UNCOMMON: 'Commons & Uncommons',
  BULK_RARE: 'Rares',
  BULK_LAND: 'Basic Lands',
  BULK_MIXED: 'Mixed Cards',
};

const KIND_DESCRIPTION_PHRASE: Readonly<Record<string, string>> = {
  BULK_COMMON: 'commons',
  BULK_UNCOMMON: 'uncommons',
  BULK_COMMON_UNCOMMON: 'commons and uncommons',
  BULK_RARE: 'rares',
  BULK_LAND: 'basic lands',
  BULK_MIXED: 'a mix of commons, uncommons and rares',
};

export function gameLabel(game: string | null | undefined): string {
  const code = typeof game === 'string' ? game.trim().toUpperCase() : '';
  return GAME_LABELS[code] ?? (code ? code : GAME_LABELS.MTG);
}

export function gameAspectValue(game: string | null | undefined): string {
  const code = typeof game === 'string' ? game.trim().toUpperCase() : '';
  return GAME_ASPECT_VALUES[code] ?? gameLabel(game);
}

/**
 * eBay title for a bundle, at most 80 characters, for example "1000 Card Bulk Lot - Magic: The Gathering - Commons &
 * Uncommons". An organizer-written title wins (cleaned, cut to 80). When the generated one is too long it drops the
 * last part first.
 */
export function bundleTitle(args: { bundleSize: number; game?: string | null; lotKind?: string | null; ebayTitle?: string | null }): string {
  const custom = typeof args.ebayTitle === 'string' ? cleanText(args.ebayTitle) : '';
  if (custom) return custom.slice(0, EBAY_TITLE_MAX).trim();
  const parts = [`${args.bundleSize} Card Bulk Lot`, gameLabel(args.game)];
  const kind = typeof args.lotKind === 'string' ? KIND_TITLE_PHRASE[args.lotKind] : undefined;
  if (kind) parts.push(kind);
  let title = parts.join(' - ');
  while (title.length > EBAY_TITLE_MAX && parts.length > 1) {
    parts.pop();
    title = parts.join(' - ');
  }
  return title.slice(0, EBAY_TITLE_MAX).trim();
}

/** Plain, honest description (small HTML the existing sanitizer allows). No sizes or prices from the counter are shown. */
export function bundleDescription(args: { bundleSize: number; game?: string | null; lotKind?: string | null; language?: string | null }): string {
  const size = formatCardCount(args.bundleSize);
  const game = gameLabel(args.game);
  const kind = (typeof args.lotKind === 'string' && KIND_DESCRIPTION_PHRASE[args.lotKind]) || 'cards';
  const language = cleanText(args.language || 'English') || 'English';
  return [
    `<p><strong>${size} ${game} cards: ${kind}.</strong></p>`,
    `<p>This listing is for one bundle of ${size} cards. The cards are a random selection from the lot type named above, so you cannot choose specific cards and duplicates are possible. Cards are not graded and may show play wear.</p>`,
    '<ul>',
    `<li>Cards per bundle: ${size}</li>`,
    `<li>Language: ${language}</li>`,
    '<li>Shipped in a card storage box</li>',
    '</ul>',
    '<p>If you buy more than one bundle, each bundle is packed on its own and may repeat cards from another bundle.</p>',
  ].join('\n');
}

export function bundleConditionNote(): string {
  return 'Unsorted bulk cards in mixed played condition. Not graded. Random selection, not checked one by one.';
}

/** Tags the existing aspect builder turns into item specifics ("Key:Value"). */
export function bundleTags(args: { game?: string | null; language?: string | null }): string[] {
  const tags = [`Game:${gameAspectValue(args.game)}`];
  const language = cleanText(args.language || 'English') || 'English';
  tags.push(`Language:${language}`);
  return tags;
}

// ---------------------------------------------------------------------------
// The in-memory overlay applied to an Item just before the eBay push pipeline reads it
// ---------------------------------------------------------------------------

export interface BundleRow {
  enabled: boolean;
  bundleSize: number;
  adjustmentBps: number;
  ebayTitle: string | null;
  condition: string;
  language: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  dimsConfirmed: boolean;
}

export interface BundleOverlay {
  title: string;
  description: string;
  /** Dollars (the pipeline reads Item.price as dollars and sends price.toFixed(2)). */
  price: number;
  /** Bundles listed: the pipeline sends Math.max(stockTotal - stockSold, 1) as the eBay quantity. */
  stockTotal: number;
  stockSold: number;
  condition: string;
  conditionGrade: null;
  conditionNotes: string;
  tags: string[];
  ebayCategoryId: string;
  ebayCategoryName: string;
  ebaySecondaryCategoryId: null;
  ebaySubtitle: null;
  packageWeightOz: number;
  packageLengthIn: number;
  packageWidthIn: number;
  packageHeightIn: number;
  packageType: null;
  packageConfirmedByOrganizer: true;
  /** The lot is stored with DONT_LIST (keeps it away from the extension and Google Merchant); eBay sees it as shippable. */
  ebayShippingOverride: null;
  allowBestOffer: false;
  upc: null;
  ean: null;
  isbn: null;
  mpn: null;
  brand: null;
  ebayEpid: null;
  neverStandardEnvelope: true;
}

export type BundleRefusalCode = Extract<BulkEbayErrorCode, 'BUNDLE_NOT_ENABLED' | 'BUNDLE_BELOW_ONE' | 'BUNDLE_PRICE_INVALID' | 'BUNDLE_PRICE_TOO_HIGH' | 'BUNDLE_PACKAGE_UNCONFIRMED'>;
export type BundleOverlayResult =
  | { ok: true; overlay: BundleOverlay; bundles: number; priceCents: number }
  | { ok: false; code: BundleRefusalCode; message: string };

export interface BundleOverlayInput {
  stockTotal: number | null | undefined;
  stockSold: number | null | undefined;
  pricePerThousandCents: number | null | undefined;
  lot: { game?: string | null; lotKind?: string | null };
  bundle: BundleRow | null | undefined;
}

/**
 * What the eBay push should see for a bulk lot, or the reason it must not be pushed. Never lists a bundle the lot
 * cannot fill, never uses an unconfirmed package, never uses a price it cannot derive.
 */
export function buildBundleOverlay(input: BundleOverlayInput): BundleOverlayResult {
  const b = input.bundle;
  if (!b || !b.enabled) return { ok: false, code: 'BUNDLE_NOT_ENABLED', message: BULK_EBAY_MESSAGES.BUNDLE_NOT_ENABLED };
  const remaining = remainingCards(input.stockTotal, input.stockSold);
  const bundles = bundleQuantity(remaining, b.bundleSize);
  if (bundles < 1) {
    return {
      ok: false,
      code: 'BUNDLE_BELOW_ONE',
      message: `This lot has ${formatCardCount(remaining)} cards left, which is fewer than one ${formatCardCount(b.bundleSize)}-card bundle. Add stock or choose a smaller bundle size.`,
    };
  }
  const price = computeBundlePriceCents(b.bundleSize, input.pricePerThousandCents, b.adjustmentBps);
  if (!price.ok) return { ok: false, code: price.code, message: BULK_EBAY_MESSAGES[price.code] };
  const pkgProblem = validateBundlePackage(b);
  if (!b.dimsConfirmed || pkgProblem) {
    return { ok: false, code: 'BUNDLE_PACKAGE_UNCONFIRMED', message: pkgProblem ?? BULK_EBAY_MESSAGES.BUNDLE_PACKAGE_UNCONFIRMED };
  }
  return {
    ok: true,
    bundles,
    priceCents: price.cents,
    overlay: {
      title: bundleTitle({ bundleSize: b.bundleSize, game: input.lot.game, lotKind: input.lot.lotKind, ebayTitle: b.ebayTitle }),
      description: bundleDescription({ bundleSize: b.bundleSize, game: input.lot.game, lotKind: input.lot.lotKind, language: b.language }),
      price: price.cents / 100,
      stockTotal: bundles,
      stockSold: 0,
      condition: b.condition === 'NEW' ? 'NEW' : 'USED',
      conditionGrade: null,
      conditionNotes: bundleConditionNote(),
      tags: bundleTags({ game: input.lot.game, language: b.language }),
      ebayCategoryId: BULK_EBAY_CATEGORY.id,
      ebayCategoryName: BULK_EBAY_CATEGORY.name,
      ebaySecondaryCategoryId: null,
      ebaySubtitle: null,
      packageWeightOz: b.weightOz,
      packageLengthIn: b.lengthIn,
      packageWidthIn: b.widthIn,
      packageHeightIn: b.heightIn,
      packageType: null,
      packageConfirmedByOrganizer: true,
      ebayShippingOverride: null,
      allowBestOffer: false,
      upc: null,
      ean: null,
      isbn: null,
      mpn: null,
      brand: null,
      ebayEpid: null,
      neverStandardEnvelope: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Sync planning: what to do on eBay given the lot's current stock
// ---------------------------------------------------------------------------

export type BundleSyncAction = 'NONE' | 'END' | 'RELIST' | 'REVISE';
export type BundleSyncReason =
  | 'DISABLED'
  | 'NOT_LISTED'
  | 'NOT_SELLABLE'
  | 'PRICE_INVALID'
  | 'BELOW_ONE_BUNDLE'
  | 'ALREADY_ENDED'
  | 'RESTOCKED'
  | 'QUANTITY_CHANGED'
  | 'PRICE_CHANGED'
  | 'IN_SYNC';

export interface BundleSyncInput {
  enabled: boolean;
  bundleSize: number;
  adjustmentBps: number;
  pricePerThousandCents: number | null | undefined;
  stockTotal: number | null | undefined;
  stockSold: number | null | undefined;
  /** False when the Item is deleted, sold out by status, hidden or still a draft. */
  itemSellable: boolean;
  /** The Item has an eBay offer (ebayOfferId) that this app created. */
  hasListing: boolean;
  /** This app ended the listing because there was nothing to sell; relist when stock returns. */
  endedForStock: boolean;
  listedQty: number | null | undefined;
  listedPriceCents: number | null | undefined;
}

export interface BundleSyncPlan {
  action: BundleSyncAction;
  reason: BundleSyncReason;
  wantedQty: number;
  wantedPriceCents: number | null;
  qtyChanged: boolean;
  priceChanged: boolean;
}

/**
 * The single decision table used by every caller (the sweep, the hooks, the organizer's Sync button):
 *   not enabled and live                -> END (and relist later if it is turned back on)
 *   never listed                        -> NONE (a first listing is always an explicit organizer action)
 *   live and below one bundle           -> END
 *   ended by us and one bundle is back  -> RELIST
 *   live and quantity or price differ   -> REVISE
 *   anything else                       -> NONE
 */
export function planBundleSync(input: BundleSyncInput): BundleSyncPlan {
  const priceRes = computeBundlePriceCents(input.bundleSize, input.pricePerThousandCents, input.adjustmentBps);
  const wantedPriceCents = priceRes.ok ? priceRes.cents : null;
  const stockQty = bundleQuantity(remainingCards(input.stockTotal, input.stockSold), input.bundleSize);
  const wantedQty = input.itemSellable && priceRes.ok ? stockQty : 0;
  const live = input.hasListing && !input.endedForStock;
  const base = { wantedQty, wantedPriceCents, qtyChanged: false, priceChanged: false };

  if (!input.enabled) {
    return live ? { ...base, action: 'END', reason: 'DISABLED' } : { ...base, action: 'NONE', reason: input.hasListing ? 'ALREADY_ENDED' : 'NOT_LISTED' };
  }
  if (!input.hasListing) return { ...base, action: 'NONE', reason: 'NOT_LISTED' };

  if (wantedQty < 1) {
    if (input.endedForStock) return { ...base, action: 'NONE', reason: 'ALREADY_ENDED' };
    const reason: BundleSyncReason = !input.itemSellable ? 'NOT_SELLABLE' : !priceRes.ok ? 'PRICE_INVALID' : 'BELOW_ONE_BUNDLE';
    return { ...base, action: 'END', reason };
  }

  if (input.endedForStock) return { ...base, action: 'RELIST', reason: 'RESTOCKED', qtyChanged: true, priceChanged: true };

  const listedQty = typeof input.listedQty === 'number' ? input.listedQty : null;
  const listedPrice = typeof input.listedPriceCents === 'number' ? input.listedPriceCents : null;
  // An offer exists but this app never recorded a successful listing (a first push that stopped before it published):
  // there is nothing live to revise. The organizer lists it explicitly.
  if (listedQty === null || listedPrice === null) return { ...base, action: 'NONE', reason: 'NOT_LISTED' };
  const qtyChanged = listedQty !== wantedQty;
  const priceChanged = listedPrice !== wantedPriceCents;
  if (qtyChanged || priceChanged) {
    return { ...base, action: 'REVISE', reason: qtyChanged ? 'QUANTITY_CHANGED' : 'PRICE_CHANGED', qtyChanged, priceChanged };
  }
  return { ...base, action: 'NONE', reason: 'IN_SYNC' };
}

// ---------------------------------------------------------------------------
// Words for the organizer
// ---------------------------------------------------------------------------

/** "2 bundles of 1,000 cards (2,000 cards) sold on eBay." */
export function describeBundleSale(bundles: number, bundleSize: number): string {
  const cards = cardsForBundles(bundles, bundleSize);
  const noun = bundles === 1 ? 'bundle' : 'bundles';
  if (cards === null) return `${bundles} ${noun} sold on eBay.`;
  return `${bundles} ${noun} of ${formatCardCount(bundleSize)} cards (${formatCardCount(cards)} cards) sold on eBay.`;
}

/** One line for the organizer screen: what is listed and at what price. */
export function describeBundleListing(bundleSize: number, bundles: number, priceCents: number | null): string {
  const noun = bundles === 1 ? 'bundle' : 'bundles';
  const price = priceCents === null ? '' : ` at ${formatCents(priceCents)} each`;
  return `${formatCardCount(bundles)} ${noun} of ${formatCardCount(bundleSize)} cards${price}`;
}
