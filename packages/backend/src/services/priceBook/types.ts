/**
 * Price book types (ADR-140 sections 4.1, 5.1, 6.1). Types only: no runtime code, no imports of anything outside this
 * directory. Fields that come straight from database columns are typed as plain strings and validated at
 * run time by the engine, so a service can pass a row without a cast.
 */
import type { PriceSource, ReferenceKind, RarityClass } from './vocabulary';

export type EnvLike = Record<string, string | undefined>;

/** The scalar settings of a PriceBook row (ADR-140 section 4.1). The engine reads percents from here, never from a constant. */
export interface BookSettings {
  enabled: boolean;
  version: number;
  allowCatalogReference: boolean;
  referenceOrder: readonly string[];
  retailPercentBps: number;
  defaultFloorCents: number;
  defaultCeilingCents: number | null;
  defaultRoundingMode: string;
  defaultRoundingDirection: string;
  condNmBps: number;
  condLpBps: number;
  condMpBps: number;
  condHpBps: number;
  condDmgBps: number;
  nonEnglishBps: number;
  movementReviewBps: number;
  referenceWarnDays: number;
  referenceMaxDays: number;
  soldHistoryMinSales: number;
  soldHistoryMaxSales: number;
  soldHistoryWindowDays: number;
  manualLockDays: number;
  buyCreditBps: number;
}

/** One PriceBookRule row (ADR-140 section 4.1) without bookId and timestamps. */
export interface PriceRule {
  id: string;
  family: string;
  name: string;
  priority: number;
  enabled: boolean;
  productType?: string | null;
  game?: string | null;
  setCode?: string | null;
  rarityClass?: string | null;
  rarityText?: string | null;
  finish?: string | null;
  language?: string | null;
  variantToken?: string | null;
  refMinCents?: number | null;
  refMaxCents?: number | null;
  sourceKinds?: readonly string[] | null;
  basis: string;
  percentBps: number;
  addCents: number;
  fixedCents?: number | null;
  floorCents?: number | null;
  ceilingCents?: number | null;
  minMarginBps?: number | null;
  roundingMode?: string | null;
  roundingDirection?: string | null;
  creditBps?: number | null;
  minOfferCents?: number | null;
}

/** A rule before it has an id (starter templates). */
export type NewPriceRule = Omit<PriceRule, 'id'>;

/** One PriceBookBulkRate row (ADR-140 section 4.1). Money is integer cents; PER_1000 rates are cents per 1,000 cards. */
export interface BulkRate {
  direction: string;
  game: string;
  tier: string;
  finish: string;
  unit: string;
  rateCents: number;
  creditRateCents?: number | null;
  benchmarkNote?: string | null;
  benchmarkRateCents?: number | null;
  benchmarkAsOf?: Date | null;
}

export interface ReferenceCandidate {
  kind: ReferenceKind;
  /** Near Mint equivalent for this finish and language, integer cents, greater than zero. */
  valueCents: number;
  /** When the number was true (sale date, typed date, catalog price time). */
  asOf: Date | null;
  /** 'SHOP' | 'SCRYFALL' | a licensed provider id; shown in the popover. */
  origin: string;
  /** Plain words: 'Your typed price', 'Your last 3 sales (median)'. */
  label: string;
  /** Sold history only. */
  sampleCount?: number;
  /** The shop's own typed note, shown exactly as typed (the UI escapes it). */
  note?: string | null;
  /**
   * The finish this number is for. Absent means the provider already matched it to the card. A different finish than
   * the card's is never used (the engine never converts one finish into another); a benchmark may be 'ANY'.
   */
  finish?: string;
  /** The language this number is for. Absent means it already matches the card. An English number may serve another language. */
  language?: string;
}

export type LockKind = 'PIN' | 'RECENT_EDIT';

export interface CardInput {
  /** 'p:<printingId>' or 's:...' (cardKey.ts). */
  cardKey: string;
  game: string;
  setCode?: string | null;
  rarityText?: string | null;
  rarityClass: RarityClass;
  finish: string;
  language: string;
  /** Null only for graded cards. */
  conditionCode: string | null;
  /** [] or e.g. ['FIRST_EDITION'] (cardKey.ts). */
  variantTokens: readonly string[];
  graded: boolean;
  /** v1 prices SINGLE only; anything else gives UNSUPPORTED_PRODUCT. Default SINGLE. */
  productType?: string | null;
  /** Line total only; default 1. */
  quantity?: number;
  /** Item.costBasis x 100 when known. */
  costCents?: number | null;
  currentPriceCents?: number | null;
  /** The reference used by the last applied run for this item. */
  previousReferenceCents?: number | null;
  lock?: { kind: LockKind; until: Date | null } | null;
}

export interface EngineConfig {
  /** Used only to measure the age of a reference and the expiry of a lock. */
  now: Date;
  /** 99, injected from MIN_CARD_SALE_CENTS by the caller. */
  minCardSaleCents: number;
  family: 'RETAIL' | 'BUYLIST';
  /** Catalog numbers older than this show a warning. Default 48 (CARD_PRICE_STALE_HOURS). */
  catalogStaleHours?: number;
}

export interface EngineInput {
  card: CardInput;
  candidates: readonly ReferenceCandidate[];
  rules: readonly PriceRule[];
  book: BookSettings;
  rates?: readonly BulkRate[];
  config: EngineConfig;
}

export type SuggestionCode =
  | 'NO_REFERENCE'
  | 'NO_RULE'
  | 'NO_COST'
  | 'NO_RATE'
  | 'GRADED_NOT_SUPPORTED'
  | 'UNSUPPORTED_PRODUCT'
  | 'INVALID_INPUT'
  | 'BELOW_MIN_OFFER';

export type WarningCode =
  | 'BELOW_CARD_MINIMUM'
  | 'REFERENCE_OLD'
  | 'REFERENCE_TOO_OLD'
  | 'CATALOG_ESTIMATE'
  | 'RANGE_CONFLICT';

export type ReviewReason =
  | 'LARGE_MOVE'
  | 'HIT_FLOOR'
  | 'HIT_CEILING'
  | 'BELOW_COST'
  | 'REFERENCE_MOVED'
  | 'LOW_SAMPLE'
  | 'REFERENCE_OLD';

export type TraceStep =
  | 'REFERENCE'
  | 'RATE_CARD'
  | 'FIXED'
  | 'COST'
  | 'RETAIL_PRICE'
  | 'PERCENT'
  | 'CONDITION'
  | 'LANGUAGE'
  | 'ADD'
  | 'COST_FLOOR'
  | 'FLOOR_APPLIED'
  | 'CEILING_APPLIED'
  | 'ROUND'
  | 'CLAMP_AFTER_ROUND'
  | 'RESULT_FLOOR'
  | 'CREDIT';

export interface TraceLine {
  step: TraceStep;
  label: string;
  beforeCents: number | null;
  afterCents: number | null;
}

export interface SuggestionWarning {
  code: WarningCode;
  message: string;
}

export interface PriceSuggestion {
  ok: boolean;
  code?: SuggestionCode;
  family: 'RETAIL' | 'BUYLIST';
  /** Retail price, or buylist cash offer. */
  priceCents: number | null;
  /** Buylist only. */
  creditCents?: number | null;
  /** priceCents x quantity. */
  lineCents?: number | null;
  /** Buylist only: creditCents x quantity. */
  creditLineCents?: number | null;
  priceSource: PriceSource | null;
  /** ISO. */
  priceAsOf: string | null;
  referenceCents: number | null;
  referenceOrigin: string | null;
  referenceLabel: string | null;
  referenceNote?: string | null;
  referenceSampleCount?: number | null;
  rule: { id: string | null; name: string; bookVersion: number; isDefault: boolean } | null;
  unchanged: boolean;
  /** False when locked or ok is false. */
  applyAllowed: boolean;
  lockedReason: LockKind | null;
  review: { required: boolean; reasons: ReviewReason[]; movePercent: number | null };
  warnings: SuggestionWarning[];
  trace: TraceLine[];
  /** The rounding the engine used, so the buylist credit can be rounded the same way. */
  roundingUsed?: { mode: string; direction: string } | null;
  /** Plain words from explain(). */
  why: string;
}
