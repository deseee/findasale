/**
 * Price book vocabulary (ADR-140 section 3). Pure constants and small helpers: no env reads, no clock, no network, no
 * database. The frontend reads these lists from the backend (GET /api/price-book/status); it never hardcodes them.
 *
 * All enumerations are plain strings (repo precedent, ADR-134 section 2.2). Money in the whole price book is integer cents.
 */
import type { BookSettings } from './types';

export const FAMILIES = ['RETAIL', 'BUYLIST'] as const;
export type Family = (typeof FAMILIES)[number];

export const REFERENCE_KINDS = ['MANUAL', 'SHOP_SOLD_HISTORY', 'SHOP_BENCHMARK', 'CATALOG_REFERENCE', 'LICENSED_FEED'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const PRICE_SOURCES = [
  'MANUAL',
  'SHOP_SOLD_HISTORY',
  'SHOP_BENCHMARK',
  'CATALOG_REFERENCE',
  'LICENSED_FEED',
  'RATE_CARD',
  'FIXED_RULE',
  'COST',
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const BASES = ['REFERENCE', 'COST_PLUS', 'BULK_RATE', 'FIXED_CENTS', 'RETAIL_PRICE'] as const;
export type Basis = (typeof BASES)[number];

export const RARITY_CLASSES = ['COMMON', 'UNCOMMON', 'RARE', 'MYTHIC', 'SPECIAL', 'UNKNOWN'] as const;
export type RarityClass = (typeof RARITY_CLASSES)[number];

/** The existing card finish vocabulary (constants/cardVocabulary.ts CARD_FINISHES); a test pins the two lists together. */
export const FINISHES = ['NONFOIL', 'FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO'] as const;
export type Finish = (typeof FINISHES)[number];
/** Rate card rows and benchmarks also accept ANY. */
export const FINISHES_OR_ANY = ['NONFOIL', 'FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO', 'ANY'] as const;
export type FinishOrAny = (typeof FINISHES_OR_ANY)[number];

/** The existing condition vocabulary (CARD_CONDITION_CODES); a test pins the two lists together. */
export const CONDITION_CODES = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

export const VARIANT_TOKENS = ['NONE', 'FIRST_EDITION', 'SHADOWLESS', 'UNLIMITED', 'STAMPED'] as const;
export type VariantToken = (typeof VARIANT_TOKENS)[number];

export const ROUNDING_MODES = ['NONE', 'TIERED', 'NEAREST_5C', 'NEAREST_25C', 'NEAREST_DOLLAR', 'ENDING_99', 'KEYSTONE_49_99'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const ROUNDING_DIRECTIONS = ['NEAREST', 'UP', 'DOWN'] as const;
export type RoundingDirection = (typeof ROUNDING_DIRECTIONS)[number];

export const TIERS = ['COMMON', 'UNCOMMON', 'COMMON_UNCOMMON', 'RARE', 'MYTHIC', 'SPECIAL', 'LAND', 'MIXED'] as const;
export type Tier = (typeof TIERS)[number];

export const UNITS = ['PER_CARD', 'PER_1000'] as const;
export type Unit = (typeof UNITS)[number];

export const DIRECTIONS = ['SELL', 'BUY'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const RUN_KINDS = ['SINGLE', 'BULK', 'LOT'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** v1 prices single cards only (extension point, ADR-140 section 18). */
export const PRODUCT_TYPES = ['SINGLE'] as const;

export const BULK_LOT_KINDS = ['BULK_COMMON', 'BULK_UNCOMMON', 'BULK_COMMON_UNCOMMON', 'BULK_RARE', 'BULK_LAND', 'BULK_MIXED'] as const;
export type BulkLotKindName = (typeof BULK_LOT_KINDS)[number];

/** ADR-140 section 8.1: the fixed mapping from a bulk lot kind to a rate card tier. */
export const LOT_KIND_TIER: Record<BulkLotKindName, Tier> = {
  BULK_COMMON: 'COMMON',
  BULK_UNCOMMON: 'UNCOMMON',
  BULK_COMMON_UNCOMMON: 'COMMON_UNCOMMON',
  BULK_RARE: 'RARE',
  BULK_LAND: 'LAND',
  BULK_MIXED: 'MIXED',
};

/** Default condition percents in basis points (ADR-134 D10 placeholders kept as the starting point). */
export const DEFAULT_CONDITION_BPS: Record<ConditionCode, number> = {
  NM: 10000,
  LP: 9000,
  MP: 8000,
  HP: 6500,
  DMG: 5000,
};

export const DEFAULT_BUY_CREDIT_BPS = 12000;
/** A catalog number older than this many hours shows a warning (same figure as CARD_PRICE_STALE_HOURS default). */
export const DEFAULT_CATALOG_STALE_HOURS = 48;
/** A catalog number older than this many days is not used at all. */
export const CATALOG_MAX_AGE_DAYS = 14;
/** A sold history reference built from fewer sales than this adds the LOW_SAMPLE review reason. */
export const LOW_SAMPLE_BELOW = 3;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Bulk arithmetic bounds, the same as ADR-136 (bulkLotPricing). */
export const MAX_BULK_CARDS = 1_000_000;
export const MAX_RATE_PER_1000_CENTS = 10_000_000;
export const MAX_RATE_PER_CARD_CENTS = 100_000_000;
export const MAX_MONEY_CENTS = 100_000_000;

/** Largest signed percent change the "Move all sell rates" dialog accepts, in basis points. */
export const MIN_RATE_ADJUST_BPS = -9000;
export const MAX_RATE_ADJUST_BPS = 100000;

/** The book defaults of ADR-140 section 4.1, as one frozen object (services create a book from it; tests build on it). */
export const DEFAULT_BOOK_SETTINGS: Readonly<BookSettings> = Object.freeze({
  enabled: false,
  version: 1,
  allowCatalogReference: false,
  referenceOrder: Object.freeze([...REFERENCE_KINDS]),
  retailPercentBps: 10000,
  defaultFloorCents: 0,
  defaultCeilingCents: null,
  defaultRoundingMode: 'TIERED',
  defaultRoundingDirection: 'NEAREST',
  condNmBps: DEFAULT_CONDITION_BPS.NM,
  condLpBps: DEFAULT_CONDITION_BPS.LP,
  condMpBps: DEFAULT_CONDITION_BPS.MP,
  condHpBps: DEFAULT_CONDITION_BPS.HP,
  condDmgBps: DEFAULT_CONDITION_BPS.DMG,
  nonEnglishBps: 10000,
  movementReviewBps: 2500,
  referenceWarnDays: 90,
  referenceMaxDays: 365,
  soldHistoryMinSales: 2,
  soldHistoryMaxSales: 5,
  soldHistoryWindowDays: 180,
  manualLockDays: 14,
  buyCreditBps: DEFAULT_BUY_CREDIT_BPS,
});

function isIn<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export const isFamily = (v: unknown): v is Family => isIn(FAMILIES, v);
export const isReferenceKind = (v: unknown): v is ReferenceKind => isIn(REFERENCE_KINDS, v);
export const isPriceSource = (v: unknown): v is PriceSource => isIn(PRICE_SOURCES, v);
export const isBasis = (v: unknown): v is Basis => isIn(BASES, v);
export const isRarityClass = (v: unknown): v is RarityClass => isIn(RARITY_CLASSES, v);
export const isFinish = (v: unknown): v is Finish => isIn(FINISHES, v);
export const isFinishOrAny = (v: unknown): v is FinishOrAny => isIn(FINISHES_OR_ANY, v);
export const isConditionCode = (v: unknown): v is ConditionCode => isIn(CONDITION_CODES, v);
export const isVariantToken = (v: unknown): v is VariantToken => isIn(VARIANT_TOKENS, v);
export const isRoundingMode = (v: unknown): v is RoundingMode => isIn(ROUNDING_MODES, v);
export const isRoundingDirection = (v: unknown): v is RoundingDirection => isIn(ROUNDING_DIRECTIONS, v);
export const isTier = (v: unknown): v is Tier => isIn(TIERS, v);
export const isUnit = (v: unknown): v is Unit => isIn(UNITS, v);
export const isDirection = (v: unknown): v is Direction => isIn(DIRECTIONS, v);
export const isBulkLotKind = (v: unknown): v is BulkLotKindName => isIn(BULK_LOT_KINDS, v);

/** Shape returned by the status endpoint so the frontend never hardcodes a list. */
export const PRICE_BOOK_VOCABULARY = {
  families: FAMILIES,
  referenceKinds: REFERENCE_KINDS,
  priceSources: PRICE_SOURCES,
  bases: BASES,
  rarityClasses: RARITY_CLASSES,
  finishes: FINISHES,
  finishesOrAny: FINISHES_OR_ANY,
  conditionCodes: CONDITION_CODES,
  variantTokens: VARIANT_TOKENS,
  roundingModes: ROUNDING_MODES,
  roundingDirections: ROUNDING_DIRECTIONS,
  tiers: TIERS,
  units: UNITS,
  directions: DIRECTIONS,
  runKinds: RUN_KINDS,
  defaultConditionBps: DEFAULT_CONDITION_BPS,
} as const;

// ---------------------------------------------------------------------------------------------
// Rarity class (ADR-140 section 3.1)
// ---------------------------------------------------------------------------------------------

const MTG_RARITY = new Map<string, RarityClass>([
  ['common', 'COMMON'],
  ['uncommon', 'UNCOMMON'],
  ['rare', 'RARE'],
  ['mythic', 'MYTHIC'],
  ['special', 'SPECIAL'],
  ['bonus', 'SPECIAL'],
]);

const POKEMON_RARITY_EXACT = new Map<string, RarityClass>([
  ['common', 'COMMON'],
  ['uncommon', 'UNCOMMON'],
  ['rare', 'RARE'],
  ['rare holo', 'RARE'],
  ['holo rare', 'RARE'],
]);

const POKEMON_SPECIAL_WORDS: readonly string[] = [
  'double rare',
  'ultra rare',
  'illustration',
  'secret',
  'hyper',
  'ace spec',
  'shiny',
  'amazing',
  'radiant',
  'prism',
  'rainbow',
  'gold',
  'full art',
];

/**
 * Derives the rarity class used by rule matchers and the rate card tier. Case-insensitive, exact words first.
 * Unknown games, unknown text, empty text and "None" give UNKNOWN (a rule with a rarity class never matches UNKNOWN).
 */
export function classifyRarity(game: string | null | undefined, rarityText: string | null | undefined): RarityClass {
  const g = String(game ?? '').trim().toUpperCase();
  const text = String(rarityText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === '' || text === 'none') return 'UNKNOWN';
  if (g === 'MTG' || g === 'MAGIC') return MTG_RARITY.get(text) ?? 'UNKNOWN';
  if (g === 'POKEMON') {
    const exact = POKEMON_RARITY_EXACT.get(text);
    if (exact) return exact;
    if (POKEMON_SPECIAL_WORDS.some((word) => text.includes(word))) return 'SPECIAL';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}
