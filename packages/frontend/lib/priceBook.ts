/**
 * priceBook (ADR-140 batch B6): types that mirror the /api/price-book contract (ADR-140 section 10), the readers that
 * turn response bodies into safe shapes, the builders for every request body, and the typed API wrappers.
 *
 * No React and no env reads. The wrappers use the shared axios instance from lib/api (the same instance the card screens
 * use), passed in through createPriceBookApi so lib/__tests__/priceBook.test.ts runs with a fake. Run: npm test
 *
 * Rules this file keeps (ADR-140 sections 2, 10 and 11):
 *  - The browser does NO pricing arithmetic. Every price, rule choice, source and explanation comes from the server. The only
 *    arithmetic anywhere in the price book library is display math (cents to dollars for a field, a percent gap shown from
 *    two numbers it was given) in priceBookRules.ts.
 *  - Request bodies are built from fixed key lists, because the server parses every body with a strict schema and answers
 *    400 VALIDATION on an unknown key. The server supplies bookId, organizerId, bookVersion and createdByUserId; this file
 *    never sends them, nor version, state or selected on a run row.
 *  - Readers never throw. A malformed body gives null or safe defaults.
 *
 * Wire shapes (envelope: success { success: true, data }, failure { success: false, error, code, ...extra }):
 *   GET  /api/price-book/status            PUT  /api/price-book/book            GET  /api/price-book/book
 *   POST /api/price-book/book/templates    GET|POST|PUT|DELETE /api/price-book/rules[/:id]   POST /rules/reorder
 *   GET|PUT|DELETE /api/price-book/references[/:id]   POST /references/from-stock   POST /references/import
 *   GET|PUT|DELETE /api/price-book/benchmarks[/:id]
 *   GET|PUT /api/price-book/bulk-rates     POST /bulk-rates/adjust
 *   POST /api/price-book/buylist/quote     POST /buylist/bulk-quote             POST /suggest
 *   PUT  /api/price-book/locks/:itemId     GET /locks
 *   POST /runs/preview   GET /runs   GET /runs/:id   GET|PATCH /runs/:id/items   POST /runs/:id/apply|undo|cancel
 */
import api from './api';
import { wordingForPriceBookError } from './priceBookCopy';

// ---------------------------------------------------------------------------
// Vocabulary types (ADR-140 section 3). The lists themselves come from GET /status, never from this file.
// ---------------------------------------------------------------------------

export type PriceBookFamily = 'RETAIL' | 'BUYLIST';
export type ReferenceKind = 'MANUAL' | 'SHOP_SOLD_HISTORY' | 'SHOP_BENCHMARK' | 'CATALOG_REFERENCE' | 'LICENSED_FEED';
export type PriceSource = ReferenceKind | 'RATE_CARD' | 'FIXED_RULE' | 'COST';
export type RuleBasis = 'REFERENCE' | 'COST_PLUS' | 'BULK_RATE' | 'FIXED_CENTS' | 'RETAIL_PRICE';
export type RarityClass = 'COMMON' | 'UNCOMMON' | 'RARE' | 'MYTHIC' | 'SPECIAL' | 'UNKNOWN';
export type VariantToken = 'NONE' | 'FIRST_EDITION' | 'SHADOWLESS' | 'UNLIMITED' | 'STAMPED';
export type RoundingMode = 'NONE' | 'TIERED' | 'NEAREST_5C' | 'NEAREST_25C' | 'NEAREST_DOLLAR' | 'ENDING_99' | 'KEYSTONE_49_99';
export type RoundingDirection = 'NEAREST' | 'UP' | 'DOWN';
export type BulkTier = 'COMMON' | 'UNCOMMON' | 'COMMON_UNCOMMON' | 'RARE' | 'MYTHIC' | 'SPECIAL' | 'LAND' | 'MIXED';
export type BulkUnit = 'PER_CARD' | 'PER_1000';
export type BulkDirection = 'SELL' | 'BUY';
export type RunKind = 'SINGLE' | 'BULK' | 'LOT';
export type RunStatus = 'PREVIEW' | 'APPLYING' | 'APPLIED' | 'PARTIAL' | 'UNDONE' | 'EXPIRED' | 'CANCELLED';
export type RunItemState = 'PENDING' | 'APPLIED' | 'SKIPPED' | 'CHANGED_SINCE_PREVIEW' | 'UNDONE' | 'UNDO_SKIPPED' | 'FAILED';
export type RunItemSkipReason =
  | 'LOCKED' | 'RECENT_EDIT' | 'MARKED_DOWN' | 'EBAY_LIVE' | 'NO_REFERENCE' | 'NO_RULE' | 'NO_RATE' | 'GRADED' | 'NOT_AVAILABLE' | 'UNCHANGED';
export type SuggestionCode =
  | 'NO_REFERENCE' | 'NO_RULE' | 'NO_COST' | 'NO_RATE' | 'GRADED_NOT_SUPPORTED' | 'UNSUPPORTED_PRODUCT' | 'INVALID_INPUT' | 'BELOW_MIN_OFFER';
export type ReviewReason = 'LARGE_MOVE' | 'HIT_FLOOR' | 'HIT_CEILING' | 'BELOW_COST' | 'REFERENCE_MOVED' | 'LOW_SAMPLE' | 'REFERENCE_OLD';
export type LockedReason = 'PIN' | 'RECENT_EDIT';
export type RunViewName = 'changes' | 'unchanged' | 'skipped' | 'review';
export type StarterTemplate = 'RETAIL_STARTER' | 'BUYLIST_STARTER';

/** ADR-140 section 10.3. */
export type PriceBookErrorCode =
  | 'PRICE_BOOK_DISABLED' | 'VALIDATION' | 'FOREIGN_PRICE_COLUMN' | 'SCOPE_TOO_LARGE' | 'VERSION_CONFLICT' | 'BOOK_CHANGED'
  | 'PREVIEW_EXPIRED' | 'COUNT_MISMATCH' | 'NOTHING_SELECTED' | 'ALREADY_APPLIED' | 'TEMPLATE_NEEDS_EMPTY' | 'RUN_NOT_PREVIEW'
  | 'LIMIT_REACHED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'SERVER_ERROR';

/** Server limits (ADR-140 section 10). GET /status can report other values; these are the documented ones. */
export const SUGGEST_MAX_CARDS = 100;
export const REFERENCES_PAGE_MAX = 100;
export const RUN_ITEMS_PAGE_MAX = 200;
export const BULK_RATES_MAX_ROWS = 600;
export const ADJUST_PERCENT_MIN = -90;
export const ADJUST_PERCENT_MAX = 500;
export const RULES_MAX_PER_FAMILY = 100;
export const NOTE_MAX_CHARS = 200;
export const RULE_NAME_MAX_CHARS = 80;

// ---------------------------------------------------------------------------
// Data shapes (ADR-140 sections 4.1 and 10)
// ---------------------------------------------------------------------------

export interface VocabEntry {
  code: string;
  label: string;
}
/** Keyed by the vocabulary name, for example "finish", "tier" or "roundingMode". */
export type PriceBookVocabulary = Record<string, VocabEntry[]>;

export interface PriceBookStatus {
  enabled: boolean;
  bookExists: boolean;
  bookEnabled: boolean;
  catalogReference: { platformOn: boolean; bookOptedIn: boolean };
  limits: Record<string, number>;
  vocabulary: PriceBookVocabulary;
}

export const UNKNOWN_PRICE_BOOK_STATUS: PriceBookStatus = {
  enabled: false,
  bookExists: false,
  bookEnabled: false,
  catalogReference: { platformOn: false, bookOptedIn: false },
  limits: {},
  vocabulary: {},
};

/** The settings columns of PriceBook (section 4.1) that the shop can change. */
export interface PriceBookSettings {
  enabled: boolean;
  allowCatalogReference: boolean;
  referenceOrder: string[];
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

export interface PriceBookView extends PriceBookSettings {
  version: number;
  /** Row counts the server may send with the book (rules, references and so on). */
  counts: Record<string, number>;
}

/** The matcher and action fields of a rule (section 4.1). null or missing means "any" for a matcher. */
export interface PriceBookRuleFields {
  game: string | null;
  setCode: string | null;
  rarityClass: string | null;
  rarityText: string | null;
  finish: string | null;
  language: string | null;
  variantToken: string | null;
  refMinCents: number | null;
  refMaxCents: number | null;
  sourceKinds: string[];
  basis: string;
  percentBps: number;
  addCents: number;
  fixedCents: number | null;
  floorCents: number | null;
  ceilingCents: number | null;
  minMarginBps: number | null;
  roundingMode: string | null;
  roundingDirection: string | null;
  creditBps: number | null;
  minOfferCents: number | null;
}

export interface PriceBookRule extends PriceBookRuleFields {
  id: string;
  family: PriceBookFamily;
  name: string;
  priority: number;
  enabled: boolean;
  productType: string;
}

/** What the shop sends to create or replace a rule. Everything except family and name is optional. */
export type PriceBookRuleInput = Partial<PriceBookRuleFields> & {
  family: PriceBookFamily;
  name: string;
  enabled?: boolean;
};

export interface PriceBookReferenceRow {
  id: string;
  cardKey: string;
  catalogPrintingId: string | null;
  game: string;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  finish: string;
  language: string;
  valueCents: number;
  note: string | null;
  asOf: string | null;
}

export interface PriceBookBenchmarkRow {
  id: string;
  game: string;
  rarityClass: string;
  finish: string;
  valueCents: number;
  note: string | null;
  asOf: string | null;
}

export interface BulkRateCell {
  direction: string;
  game: string | null;
  tier: string;
  finish: string;
  unit: string;
  rateCents: number;
  creditRateCents: number | null;
  benchmarkNote: string | null;
  benchmarkRateCents: number | null;
  benchmarkAsOf: string | null;
}

export interface BulkLotRow {
  itemId: string;
  title: string;
  lotKind: string;
  currentPerThousandCents: number | null;
  rateCardPerThousandCents: number | null;
}

export interface PriceBookLockRow {
  itemId: string;
  reason: string;
  priceCentsAtLock: number | null;
  lockedUntil: string | null;
  createdAt: string | null;
}

export interface SuggestTrace {
  step: string;
  label: string;
  beforeCents: number | null;
  afterCents: number | null;
}

export interface SuggestWarning {
  code: string;
  message: string;
}

export interface SuggestRuleRef {
  id: string | null;
  name: string;
  bookVersion: number;
  isDefault: boolean;
}

export interface SuggestReview {
  required: boolean;
  reasons: string[];
  movePercent: number | null;
}

/** One result of POST /suggest (section 10.1). A failure carries only ok, code, priceCents null, applyAllowed false and why. */
export interface PriceSuggestionResult {
  ref?: string;
  ok: boolean;
  code?: SuggestionCode;
  priceCents: number | null;
  price?: number | null;
  currency?: string;
  creditCents?: number | null;
  lineCents?: number | null;
  priceSource?: PriceSource | null;
  priceAsOf?: string | null;
  referenceCents?: number | null;
  referenceOrigin?: string | null;
  referenceLabel?: string | null;
  rule?: SuggestRuleRef | null;
  unchanged?: boolean;
  applyAllowed?: boolean;
  lockedReason?: LockedReason | null;
  review?: SuggestReview;
  warnings?: SuggestWarning[];
  trace?: SuggestTrace[];
  why?: string;
}

/** The additive "priceBook" block on the legacy GET /api/cards/suggested-price answer (section 12.1). Every field is optional. */
export type PriceBookResultBlock = Partial<PriceSuggestionResult>;

export interface SuggestResponse {
  bookVersion: number | null;
  results: PriceSuggestionResult[];
}

export interface RunCounts {
  eligible: number;
  changes: number;
  unchanged: number;
  skipped: number;
  review: number;
}

export interface PriceBookRunSummary {
  id: string;
  kind: string;
  status: string;
  bookVersion: number | null;
  createdAt: string | null;
  expiresAt: string | null;
  appliedCount: number;
  undoneCount: number;
  counts: RunCounts;
}

export interface PriceBookRunItem {
  id: string;
  itemId: string;
  title: string;
  oldPrice: number | null;
  newPrice: number | null;
  changePercent: number | null;
  state: string;
  selected: boolean;
  priceSource: string | null;
  skipReason: string | null;
  why: string;
  warnings: string[];
  reviewReasons: string[];
}

export interface RunPreviewResponse {
  run: PriceBookRunSummary;
  items: PriceBookRunItem[];
  nextCursor: string | null;
}

/** One call of apply or undo: { status: 'APPLYING', applied, remaining } until the last call (section 10.2). */
export interface RunProgress {
  status: string;
  applied: number;
  remaining: number;
  changedSince: number;
  failed: number;
  undone: number;
  undoSkipped: number;
}

// ---------------------------------------------------------------------------
// Small readers (never throw)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function strList(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string');
}
/** Cents from a cents field, else from a dollars field, else null. Display conversion only. */
function centsFrom(r: Rec, centsKey: string, dollarsKey: string): number | null {
  const c = numOrNull(r[centsKey]);
  if (c !== null) return Math.round(c);
  const d = numOrNull(r[dollarsKey]);
  return d === null ? null : Math.round(d * 100);
}

/** { success: true, data: X } gives X; a body without the envelope is returned as it is. */
export function unwrapBody(body: unknown): unknown {
  const r = rec(body);
  if (r && 'data' in r && r.data !== undefined && r.data !== null) return r.data;
  return body;
}

function dataRec(body: unknown): Rec {
  return rec(unwrapBody(body)) || {};
}

function listFrom(body: unknown, key: string): unknown[] {
  const data = unwrapBody(body);
  if (Array.isArray(data)) return data;
  const r = rec(data);
  return r ? arr(r[key]) : [];
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function readVocabEntries(v: unknown): VocabEntry[] {
  const out: VocabEntry[] = [];
  arr(v).forEach((x) => {
    if (typeof x === 'string' && x) {
      out.push({ code: x, label: x });
      return;
    }
    const r = rec(x);
    if (r && typeof r.code === 'string' && r.code) out.push({ code: r.code, label: str(r.label, r.code) });
  });
  return out;
}

export function readVocabulary(raw: unknown): PriceBookVocabulary {
  const r = rec(raw);
  const out: PriceBookVocabulary = {};
  if (!r) return out;
  Object.keys(r).forEach((k) => {
    const entries = readVocabEntries(r[k]);
    if (entries.length > 0) out[k] = entries;
  });
  return out;
}

export function readStatus(body: unknown): PriceBookStatus {
  const r = dataRec(body);
  if (typeof r.enabled !== 'boolean') return { ...UNKNOWN_PRICE_BOOK_STATUS, catalogReference: { ...UNKNOWN_PRICE_BOOK_STATUS.catalogReference } };
  const cat = rec(r.catalogReference) || {};
  const limits: Record<string, number> = {};
  const lim = rec(r.limits) || {};
  Object.keys(lim).forEach((k) => {
    const n = numOrNull(lim[k]);
    if (n !== null) limits[k] = n;
  });
  return {
    enabled: r.enabled,
    bookExists: bool(r.bookExists),
    bookEnabled: bool(r.bookEnabled),
    catalogReference: { platformOn: bool(cat.platformOn), bookOptedIn: bool(cat.bookOptedIn) },
    limits,
    vocabulary: readVocabulary(r.vocabulary),
  };
}

const SETTINGS_NUMBER_KEYS = [
  'retailPercentBps', 'defaultFloorCents', 'condNmBps', 'condLpBps', 'condMpBps', 'condHpBps', 'condDmgBps', 'nonEnglishBps',
  'movementReviewBps', 'referenceWarnDays', 'referenceMaxDays', 'soldHistoryMinSales', 'soldHistoryMaxSales',
  'soldHistoryWindowDays', 'manualLockDays', 'buyCreditBps',
] as const;

/** GET /book. { book: null } until the first write gives null. */
export function readBook(body: unknown): PriceBookView | null {
  const data = dataRec(body);
  const b = rec(data.book);
  if (!b) return null;
  const counts: Record<string, number> = {};
  const c = rec(b.counts) || rec(data.counts) || {};
  Object.keys(c).forEach((k) => {
    const n = numOrNull(c[k]);
    if (n !== null) counts[k] = n;
  });
  const view: Rec = {
    enabled: bool(b.enabled),
    allowCatalogReference: bool(b.allowCatalogReference),
    referenceOrder: strList(b.referenceOrder),
    defaultCeilingCents: numOrNull(b.defaultCeilingCents),
    defaultRoundingMode: str(b.defaultRoundingMode, 'TIERED'),
    defaultRoundingDirection: str(b.defaultRoundingDirection, 'NEAREST'),
    version: num(b.version, 1),
    counts,
  };
  SETTINGS_NUMBER_KEYS.forEach((k) => {
    view[k] = num(b[k]);
  });
  return view as unknown as PriceBookView;
}

function readRule(raw: unknown): PriceBookRule | null {
  const r = rec(raw);
  if (!r || typeof r.id !== 'string' || (r.family !== 'RETAIL' && r.family !== 'BUYLIST')) return null;
  return {
    id: r.id,
    family: r.family,
    name: str(r.name),
    priority: num(r.priority),
    enabled: bool(r.enabled, true),
    productType: str(r.productType, 'SINGLE'),
    game: strOrNull(r.game),
    setCode: strOrNull(r.setCode),
    rarityClass: strOrNull(r.rarityClass),
    rarityText: strOrNull(r.rarityText),
    finish: strOrNull(r.finish),
    language: strOrNull(r.language),
    variantToken: strOrNull(r.variantToken),
    refMinCents: numOrNull(r.refMinCents),
    refMaxCents: numOrNull(r.refMaxCents),
    sourceKinds: strList(r.sourceKinds),
    basis: str(r.basis, 'REFERENCE'),
    percentBps: num(r.percentBps, 10000),
    addCents: num(r.addCents),
    fixedCents: numOrNull(r.fixedCents),
    floorCents: numOrNull(r.floorCents),
    ceilingCents: numOrNull(r.ceilingCents),
    minMarginBps: numOrNull(r.minMarginBps),
    roundingMode: strOrNull(r.roundingMode),
    roundingDirection: strOrNull(r.roundingDirection),
    creditBps: numOrNull(r.creditBps),
    minOfferCents: numOrNull(r.minOfferCents),
  };
}

export function readRuleResponse(body: unknown): PriceBookRule | null {
  const d = dataRec(body);
  return readRule(d.rule !== undefined ? d.rule : d);
}

/** Rules in the order the server sent them (priority order). Rows that do not parse are dropped. */
export function readRules(body: unknown): PriceBookRule[] {
  const out: PriceBookRule[] = [];
  listFrom(body, 'rules').forEach((x) => {
    const r = readRule(x);
    if (r) out.push(r);
  });
  return out;
}

export function readReferences(body: unknown): { references: PriceBookReferenceRow[]; nextCursor: string | null } {
  const data = dataRec(body);
  const references: PriceBookReferenceRow[] = [];
  listFrom(body, 'references').forEach((x) => {
    const r = rec(x);
    const cents = r ? centsFrom(r, 'valueCents', 'price') : null;
    if (!r || typeof r.id !== 'string' || cents === null) return;
    references.push({
      id: r.id,
      cardKey: str(r.cardKey),
      catalogPrintingId: strOrNull(r.catalogPrintingId),
      game: str(r.game),
      cardName: strOrNull(r.cardName),
      setCode: strOrNull(r.setCode),
      setName: strOrNull(r.setName),
      collectorNumber: strOrNull(r.collectorNumber),
      finish: str(r.finish),
      language: str(r.language, 'en'),
      valueCents: cents,
      note: strOrNull(r.note),
      asOf: strOrNull(r.asOf),
    });
  });
  return { references, nextCursor: strOrNull(data.nextCursor) };
}

export function readBenchmarks(body: unknown): PriceBookBenchmarkRow[] {
  const out: PriceBookBenchmarkRow[] = [];
  listFrom(body, 'benchmarks').forEach((x) => {
    const r = rec(x);
    const cents = r ? centsFrom(r, 'valueCents', 'price') : null;
    if (!r || typeof r.id !== 'string' || cents === null) return;
    out.push({
      id: r.id,
      game: str(r.game),
      rarityClass: str(r.rarityClass),
      finish: str(r.finish, 'ANY'),
      valueCents: cents,
      note: strOrNull(r.note),
      asOf: strOrNull(r.asOf),
    });
  });
  return out;
}

export function readBulkRates(body: unknown): { rates: BulkRateCell[]; lots: BulkLotRow[]; version: number | null } {
  const data = dataRec(body);
  const rates: BulkRateCell[] = [];
  arr(data.rates).forEach((x) => {
    const r = rec(x);
    const cents = r ? centsFrom(r, 'rateCents', 'price') : null;
    if (!r || cents === null) return;
    rates.push({
      direction: str(r.direction),
      game: strOrNull(r.game),
      tier: str(r.tier),
      finish: str(r.finish, 'ANY'),
      unit: str(r.unit),
      rateCents: cents,
      creditRateCents: centsFrom(r, 'creditRateCents', 'creditPrice'),
      benchmarkNote: strOrNull(r.benchmarkNote),
      benchmarkRateCents: centsFrom(r, 'benchmarkRateCents', 'benchmarkPrice'),
      benchmarkAsOf: strOrNull(r.benchmarkAsOf),
    });
  });
  const lots: BulkLotRow[] = [];
  arr(data.lots).forEach((x) => {
    const r = rec(x);
    if (!r || typeof r.itemId !== 'string') return;
    lots.push({
      itemId: r.itemId,
      title: str(r.title),
      lotKind: str(r.lotKind),
      currentPerThousandCents: numOrNull(r.currentPerThousandCents),
      rateCardPerThousandCents: numOrNull(r.rateCardPerThousandCents),
    });
  });
  return { rates, lots, version: numOrNull(data.version) };
}

/** Read one suggestion result. A row without a boolean "ok" is not a result. */
export function readSuggestionResult(raw: unknown): PriceSuggestionResult | null {
  const r = rec(raw);
  if (!r || typeof r.ok !== 'boolean') return null;
  const rule = rec(r.rule);
  const review = rec(r.review);
  const out: PriceSuggestionResult = {
    ok: r.ok,
    priceCents: numOrNull(r.priceCents),
    applyAllowed: bool(r.applyAllowed),
    warnings: [],
    trace: [],
  };
  if (typeof r.ref === 'string') out.ref = r.ref;
  if (typeof r.code === 'string') out.code = r.code as SuggestionCode;
  if (numOrNull(r.price) !== null) out.price = r.price as number;
  if (typeof r.currency === 'string') out.currency = r.currency;
  if (numOrNull(r.creditCents) !== null) out.creditCents = r.creditCents as number;
  if (numOrNull(r.lineCents) !== null) out.lineCents = r.lineCents as number;
  if (typeof r.priceSource === 'string') out.priceSource = r.priceSource as PriceSource;
  if (typeof r.priceAsOf === 'string') out.priceAsOf = r.priceAsOf;
  if (numOrNull(r.referenceCents) !== null) out.referenceCents = r.referenceCents as number;
  if (typeof r.referenceOrigin === 'string') out.referenceOrigin = r.referenceOrigin;
  if (typeof r.referenceLabel === 'string') out.referenceLabel = r.referenceLabel;
  if (rule) {
    out.rule = { id: strOrNull(rule.id), name: str(rule.name), bookVersion: num(rule.bookVersion), isDefault: bool(rule.isDefault) };
  }
  if (typeof r.unchanged === 'boolean') out.unchanged = r.unchanged;
  if (r.lockedReason === 'PIN' || r.lockedReason === 'RECENT_EDIT') out.lockedReason = r.lockedReason;
  if (review) out.review = { required: bool(review.required), reasons: strList(review.reasons), movePercent: numOrNull(review.movePercent) };
  out.warnings = arr(r.warnings).reduce<SuggestWarning[]>((acc, w) => {
    const wr = rec(w);
    if (wr && typeof wr.code === 'string') acc.push({ code: wr.code, message: str(wr.message) });
    return acc;
  }, []);
  out.trace = arr(r.trace).reduce<SuggestTrace[]>((acc, t) => {
    const tr = rec(t);
    if (tr && typeof tr.label === 'string') {
      acc.push({ step: str(tr.step), label: tr.label, beforeCents: numOrNull(tr.beforeCents), afterCents: numOrNull(tr.afterCents) });
    }
    return acc;
  }, []);
  if (typeof r.why === 'string') out.why = r.why;
  return out;
}

export function readSuggestResponse(body: unknown): SuggestResponse {
  const data = dataRec(body);
  const results: PriceSuggestionResult[] = [];
  arr(data.results).forEach((x) => {
    const one = readSuggestionResult(x);
    if (one) results.push(one);
  });
  return { bookVersion: numOrNull(data.bookVersion), results };
}

function readRunCounts(raw: unknown): RunCounts {
  const c = rec(raw) || {};
  return { eligible: num(c.eligible), changes: num(c.changes), unchanged: num(c.unchanged), skipped: num(c.skipped), review: num(c.review) };
}

export function readRunSummary(raw: unknown): PriceBookRunSummary | null {
  const r = rec(raw);
  if (!r || typeof r.id !== 'string') return null;
  return {
    id: r.id,
    kind: str(r.kind),
    status: str(r.status),
    bookVersion: numOrNull(r.bookVersion),
    createdAt: strOrNull(r.createdAt),
    expiresAt: strOrNull(r.expiresAt),
    appliedCount: num(r.appliedCount),
    undoneCount: num(r.undoneCount),
    counts: readRunCounts(r.counts),
  };
}

function readRunItem(raw: unknown): PriceBookRunItem | null {
  const r = rec(raw);
  if (!r || typeof r.id !== 'string' || typeof r.itemId !== 'string') return null;
  return {
    id: r.id,
    itemId: r.itemId,
    title: str(r.title),
    oldPrice: numOrNull(r.oldPrice),
    newPrice: numOrNull(r.newPrice),
    changePercent: numOrNull(r.changePercent),
    state: str(r.state),
    selected: bool(r.selected),
    priceSource: strOrNull(r.priceSource),
    skipReason: strOrNull(r.skipReason),
    why: str(r.why),
    warnings: strList(r.warnings),
    reviewReasons: strList(r.reviewReasons),
  };
}

export function readRunItems(body: unknown): { items: PriceBookRunItem[]; nextCursor: string | null } {
  const data = dataRec(body);
  const items: PriceBookRunItem[] = [];
  listFrom(body, 'items').forEach((x) => {
    const one = readRunItem(x);
    if (one) items.push(one);
  });
  return { items, nextCursor: strOrNull(data.nextCursor) };
}

/** POST /runs/preview. Returns null when the body has no run. */
export function readRunPreview(body: unknown): RunPreviewResponse | null {
  const data = dataRec(body);
  const run = readRunSummary(data.run);
  if (!run) return null;
  return { run, items: readRunItems({ data: { items: data.items } }).items, nextCursor: strOrNull(data.nextCursor) };
}

export function readRunList(body: unknown): PriceBookRunSummary[] {
  const out: PriceBookRunSummary[] = [];
  listFrom(body, 'runs').forEach((x) => {
    const one = readRunSummary(x);
    if (one) out.push(one);
  });
  return out;
}

export function readLocks(body: unknown): PriceBookLockRow[] {
  const out: PriceBookLockRow[] = [];
  listFrom(body, 'locks').forEach((x) => {
    const r = rec(x);
    if (!r || typeof r.itemId !== 'string') return;
    out.push({
      itemId: r.itemId,
      reason: str(r.reason, 'PIN'),
      priceCentsAtLock: numOrNull(r.priceCentsAtLock),
      lockedUntil: strOrNull(r.lockedUntil),
      createdAt: strOrNull(r.createdAt),
    });
  });
  return out;
}

/** The body of one apply or undo call. Returns null when it has no status. */
export function readRunProgress(body: unknown): RunProgress | null {
  const r = dataRec(body);
  const summary = rec(r.summary) || r;
  if (typeof r.status !== 'string' && typeof summary.status !== 'string') return null;
  return {
    status: str(r.status, str(summary.status)),
    applied: num(summary.applied, num(r.applied)),
    remaining: num(summary.remaining, num(r.remaining)),
    changedSince: num(summary.changedSince, num(r.changedSince)),
    failed: num(summary.failed, num(r.failed)),
    undone: num(summary.undone, num(r.undone)),
    undoSkipped: num(summary.undoSkipped, num(r.undoSkipped)),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface PriceBookError {
  status: number | null;
  code: string;
  /** Plain wording from priceBookCopy.ts. The server's raw text is never shown. */
  message: string;
  /** Extra fields the server sent with the failure (for example a count with SCOPE_TOO_LARGE). */
  extra: Record<string, unknown>;
}

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
  500: 'SERVER_ERROR',
};

/** Turn any thrown value (an axios error, a network failure, an Error) into plain wording and a code. */
export function readPriceBookError(err: unknown): PriceBookError {
  const e = rec(err);
  const response = e ? rec(e.response) : null;
  if (!response) {
    return { status: null, code: 'NETWORK_ERROR', message: wordingForPriceBookError('NETWORK_ERROR'), extra: {} };
  }
  const status = typeof response.status === 'number' ? response.status : null;
  const data = rec(response.data) || {};
  let code = typeof data.code === 'string' && data.code ? data.code : '';
  if (!code && status !== null && Object.prototype.hasOwnProperty.call(STATUS_CODES, status)) code = STATUS_CODES[status];
  if (!code) code = 'UNKNOWN';
  const extra: Record<string, unknown> = {};
  Object.keys(data).forEach((k) => {
    if (k !== 'success' && k !== 'error' && k !== 'code') extra[k] = data[k];
  });
  return { status, code, message: wordingForPriceBookError(code), extra };
}

// ---------------------------------------------------------------------------
// Request bodies (fixed key lists)
// ---------------------------------------------------------------------------

function put(out: Rec, key: string, value: unknown): void {
  if (value !== undefined) out[key] = value;
}

function cleanString(v: unknown, max?: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return max !== undefined ? t.slice(0, max) : t;
}

const SETTINGS_KEYS: readonly string[] = [
  'enabled', 'allowCatalogReference', 'referenceOrder', 'retailPercentBps', 'defaultFloorCents', 'defaultCeilingCents',
  'defaultRoundingMode', 'defaultRoundingDirection', 'condNmBps', 'condLpBps', 'condMpBps', 'condHpBps', 'condDmgBps',
  'nonEnglishBps', 'movementReviewBps', 'referenceWarnDays', 'referenceMaxDays', 'soldHistoryMinSales', 'soldHistoryMaxSales',
  'soldHistoryWindowDays', 'manualLockDays', 'buyCreditBps',
];

/** PUT /book: only the settings columns and ifVersion. id, organizerId, version and the dates are never sent. */
export function buildBookBody(patch: Partial<PriceBookSettings>, ifVersion?: number | null): Rec {
  const src = patch as Rec;
  const out: Rec = {};
  SETTINGS_KEYS.forEach((k) => {
    if (src[k] !== undefined) out[k] = src[k];
  });
  if (typeof ifVersion === 'number') out.ifVersion = ifVersion;
  return out;
}

const RULE_KEYS: readonly string[] = [
  'game', 'setCode', 'rarityClass', 'rarityText', 'finish', 'language', 'variantToken', 'refMinCents', 'refMaxCents', 'sourceKinds',
  'basis', 'percentBps', 'addCents', 'fixedCents', 'floorCents', 'ceilingCents', 'minMarginBps', 'roundingMode', 'roundingDirection',
  'creditBps', 'minOfferCents',
];

/** POST /rules and PUT /rules/:id: the matcher and action fields. priority, id and bookId are never sent. */
export function buildRuleBody(rule: PriceBookRuleInput, ifVersion?: number | null): Rec {
  const src = rule as unknown as Rec;
  const out: Rec = { family: rule.family, name: cleanString(rule.name, RULE_NAME_MAX_CHARS) || '' };
  if (typeof rule.enabled === 'boolean') out.enabled = rule.enabled;
  RULE_KEYS.forEach((k) => {
    if (src[k] !== undefined) out[k] = src[k];
  });
  if (typeof ifVersion === 'number') out.ifVersion = ifVersion;
  return out;
}

export function buildReorderBody(family: PriceBookFamily, ids: string[]): Rec {
  return { family, ids: ids.slice() };
}

export interface TypedCardInput {
  setCode?: string;
  collectorNumber?: string;
  cardName?: string;
  setName?: string;
  rarity?: string;
}

function buildTyped(typed: TypedCardInput | null | undefined): Rec | undefined {
  if (!typed) return undefined;
  const out: Rec = {};
  (['setCode', 'collectorNumber', 'cardName', 'setName', 'rarity'] as const).forEach((k) => {
    const v = cleanString(typed[k]);
    if (v !== undefined) out[k] = v;
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface SuggestCardInput {
  ref: string;
  itemId?: string | null;
  printingId?: string | null;
  game?: string | null;
  finish: string;
  conditionCode?: string | null;
  language?: string | null;
  quantity?: number | null;
  typed?: TypedCardInput | null;
}

function buildSuggestCard(c: SuggestCardInput): Rec {
  const out: Rec = { ref: c.ref };
  put(out, 'itemId', cleanString(c.itemId));
  put(out, 'printingId', cleanString(c.printingId));
  put(out, 'game', cleanString(c.game));
  out.finish = c.finish;
  put(out, 'conditionCode', cleanString(c.conditionCode));
  put(out, 'language', cleanString(c.language));
  if (typeof c.quantity === 'number' && Number.isInteger(c.quantity) && c.quantity >= 1) out.quantity = c.quantity;
  put(out, 'typed', buildTyped(c.typed));
  return out;
}

/** POST /suggest and the buylist quote. At most 100 cards per call; use chunkSuggestCards for more. */
export function buildSuggestBody(family: PriceBookFamily, cards: SuggestCardInput[]): Rec {
  return { family, cards: cards.slice(0, SUGGEST_MAX_CARDS).map(buildSuggestCard) };
}

export function buildBuylistQuoteBody(cards: SuggestCardInput[]): Rec {
  return { cards: cards.slice(0, SUGGEST_MAX_CARDS).map(buildSuggestCard) };
}

export function chunkSuggestCards<T>(cards: T[], size = SUGGEST_MAX_CARDS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < cards.length; i += size) out.push(cards.slice(i, i + size));
  return out;
}

export interface ReferenceInput {
  printingId?: string | null;
  typed?: TypedCardInput | null;
  /** Needed with a typed card; a catalog printing carries its own game. */
  game?: string | null;
  finish: string;
  language: string;
  priceCents: number;
  note?: string | null;
  asOf?: string | null;
}

/** PUT /references. The price goes out in dollars, the way the server reads it. */
export function buildReferenceBody(input: ReferenceInput): Rec {
  const out: Rec = {};
  put(out, 'printingId', cleanString(input.printingId));
  put(out, 'typed', buildTyped(input.typed));
  put(out, 'game', cleanString(input.game));
  out.finish = input.finish;
  out.language = input.language;
  out.price = input.priceCents / 100;
  put(out, 'note', cleanString(input.note, NOTE_MAX_CHARS));
  put(out, 'asOf', cleanString(input.asOf));
  return out;
}

export interface BenchmarkInput {
  game: string;
  rarityClass: string;
  finish: string;
  priceCents: number;
  note?: string | null;
  asOf?: string | null;
}

export function buildBenchmarkBody(input: BenchmarkInput): Rec {
  const out: Rec = { game: input.game, rarityClass: input.rarityClass, finish: input.finish, price: input.priceCents / 100 };
  put(out, 'note', cleanString(input.note, NOTE_MAX_CHARS));
  put(out, 'asOf', cleanString(input.asOf));
  return out;
}

export function buildFromStockBody(opts: { saleId?: string | null; game?: string | null; overwrite: boolean }): Rec {
  const out: Rec = {};
  put(out, 'saleId', cleanString(opts.saleId));
  put(out, 'game', cleanString(opts.game));
  out.overwrite = opts.overwrite === true;
  return out;
}

export function buildImportBody(opts: { csvText?: string | null; rows?: Array<Record<string, string>> | null; dryRun: boolean }): Rec {
  const out: Rec = {};
  if (typeof opts.csvText === 'string' && opts.csvText.length > 0) out.csvText = opts.csvText;
  else if (opts.rows) out.rows = opts.rows;
  out.dryRun = opts.dryRun === true;
  return out;
}

export interface BulkRateInput {
  direction: string;
  tier: string;
  finish: string;
  unit: string;
  /** null deletes the cell. */
  priceCents: number | null;
  creditPriceCents?: number | null;
  benchmarkNote?: string | null;
  benchmarkPriceCents?: number | null;
  benchmarkAsOf?: string | null;
}

/** PUT /bulk-rates. Returns null when there are more than 600 rows, so the caller can say so instead of sending a cut-off grid. */
export function buildBulkRatesBody(game: string, rates: BulkRateInput[], ifVersion?: number | null): Rec | null {
  if (rates.length > BULK_RATES_MAX_ROWS) return null;
  const rows = rates.map((r) => {
    const row: Rec = { direction: r.direction, tier: r.tier, finish: r.finish, unit: r.unit, price: r.priceCents === null ? null : r.priceCents / 100 };
    if (typeof r.creditPriceCents === 'number') row.creditPrice = r.creditPriceCents / 100;
    put(row, 'benchmarkNote', cleanString(r.benchmarkNote, NOTE_MAX_CHARS));
    if (typeof r.benchmarkPriceCents === 'number') row.benchmarkPrice = r.benchmarkPriceCents / 100;
    put(row, 'benchmarkAsOf', cleanString(r.benchmarkAsOf));
    return row;
  });
  const out: Rec = { game, rates: rows };
  if (typeof ifVersion === 'number') out.ifVersion = ifVersion;
  return out;
}

/** POST /bulk-rates/adjust. Returns null when the percent is outside -90 to 500. */
export function buildAdjustBody(opts: {
  game: string;
  finish?: string | null;
  direction: BulkDirection;
  percent: number;
  apply: boolean;
}): Rec | null {
  if (!Number.isFinite(opts.percent) || opts.percent < ADJUST_PERCENT_MIN || opts.percent > ADJUST_PERCENT_MAX) return null;
  const out: Rec = { game: opts.game };
  put(out, 'finish', cleanString(opts.finish));
  out.direction = opts.direction;
  out.percent = opts.percent;
  out.apply = opts.apply === true;
  return out;
}

export function buildBulkQuoteBody(game: string, lines: Array<{ tier: string; finish: string; cards: number }>): Rec {
  return { game, lines: lines.map((l) => ({ tier: l.tier, finish: l.finish, cards: l.cards })) };
}

export function buildLockBody(opts: { locked: boolean; until?: string | null }): Rec {
  const out: Rec = { locked: opts.locked === true };
  if (opts.locked) put(out, 'until', cleanString(opts.until));
  return out;
}

export interface RunScope {
  saleId?: string | null;
  game?: string | null;
  setCode?: string | null;
  rarityClass?: string | null;
  finish?: string | null;
  onlyUnpriced?: boolean;
  intakeBatchId?: string | null;
}

/** POST /runs/preview. intakeBatchId goes out only together with onlyUnpriced (section 10.2). */
export function buildRunPreviewBody(opts: {
  kind: 'BULK' | 'LOT';
  scope?: RunScope;
  includeMarkedDown?: boolean;
  includeEbayLive?: boolean;
}): Rec {
  const s = opts.scope || {};
  const scope: Rec = {};
  put(scope, 'saleId', cleanString(s.saleId));
  put(scope, 'game', cleanString(s.game));
  put(scope, 'setCode', cleanString(s.setCode));
  put(scope, 'rarityClass', cleanString(s.rarityClass));
  put(scope, 'finish', cleanString(s.finish));
  scope.onlyUnpriced = s.onlyUnpriced === true;
  if (s.onlyUnpriced === true) put(scope, 'intakeBatchId', cleanString(s.intakeBatchId));
  return { kind: opts.kind, scope, includeMarkedDown: opts.includeMarkedDown === true, includeEbayLive: opts.includeEbayLive === true };
}

export function buildRunItemsPatch(opts: {
  selectIds?: string[];
  deselectIds?: string[];
  selectAllChanges?: boolean;
  selectReview?: boolean;
}): Rec {
  const out: Rec = {};
  if (opts.selectIds && opts.selectIds.length > 0) out.selectIds = opts.selectIds.slice();
  if (opts.deselectIds && opts.deselectIds.length > 0) out.deselectIds = opts.deselectIds.slice();
  if (typeof opts.selectAllChanges === 'boolean') out.selectAllChanges = opts.selectAllChanges;
  if (typeof opts.selectReview === 'boolean') out.selectReview = opts.selectReview;
  return out;
}

export function buildApplyBody(opts: { ifBookVersion: number; expectedCount: number }): Rec {
  return { ifBookVersion: opts.ifBookVersion, expectedCount: opts.expectedCount };
}

function clampLimit(limit: number | undefined, max: number): number | undefined {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return undefined;
  return Math.max(1, Math.min(max, Math.floor(limit)));
}

export function buildReferencesParams(opts: { game?: string; q?: string; cursor?: string | null; limit?: number }): Rec {
  const out: Rec = {};
  put(out, 'game', cleanString(opts.game));
  put(out, 'q', cleanString(opts.q));
  put(out, 'cursor', cleanString(opts.cursor));
  put(out, 'limit', clampLimit(opts.limit, REFERENCES_PAGE_MAX));
  return out;
}

export function buildRunItemsParams(opts: { view?: RunViewName; cursor?: string | null; limit?: number }): Rec {
  const out: Rec = {};
  put(out, 'view', opts.view);
  put(out, 'cursor', cleanString(opts.cursor));
  put(out, 'limit', clampLimit(opts.limit, RUN_ITEMS_PAGE_MAX));
  return out;
}

// ---------------------------------------------------------------------------
// API wrappers
// ---------------------------------------------------------------------------

/** The part of the shared axios instance this file uses, so tests can pass a fake. */
export interface PriceBookHttp {
  get(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: unknown }>;
  post(url: string, body?: unknown): Promise<{ data: unknown }>;
  put(url: string, body?: unknown): Promise<{ data: unknown }>;
  patch(url: string, body?: unknown): Promise<{ data: unknown }>;
  delete(url: string): Promise<{ data: unknown }>;
}

const BASE = '/price-book';

function seg(id: string): string {
  return encodeURIComponent(id);
}

export function createPriceBookApi(http: PriceBookHttp) {
  return {
    async getStatus(): Promise<PriceBookStatus> {
      return readStatus((await http.get(`${BASE}/status`)).data);
    },
    async getBook(): Promise<PriceBookView | null> {
      return readBook((await http.get(`${BASE}/book`)).data);
    },
    async putBook(patch: Partial<PriceBookSettings>, ifVersion?: number | null): Promise<PriceBookView | null> {
      return readBook((await http.put(`${BASE}/book`, buildBookBody(patch, ifVersion))).data);
    },
    async applyTemplate(template: StarterTemplate): Promise<unknown> {
      return unwrapBody((await http.post(`${BASE}/book/templates`, { template })).data);
    },
    async listRules(family?: PriceBookFamily): Promise<PriceBookRule[]> {
      return readRules((await http.get(`${BASE}/rules`, family ? { params: { family } } : undefined)).data);
    },
    async createRule(rule: PriceBookRuleInput): Promise<PriceBookRule | null> {
      return readRuleResponse((await http.post(`${BASE}/rules`, buildRuleBody(rule))).data);
    },
    async updateRule(id: string, rule: PriceBookRuleInput, ifVersion?: number | null): Promise<PriceBookRule | null> {
      return readRuleResponse((await http.put(`${BASE}/rules/${seg(id)}`, buildRuleBody(rule, ifVersion))).data);
    },
    async deleteRule(id: string): Promise<void> {
      await http.delete(`${BASE}/rules/${seg(id)}`);
    },
    async reorderRules(family: PriceBookFamily, ids: string[]): Promise<PriceBookRule[]> {
      return readRules((await http.post(`${BASE}/rules/reorder`, buildReorderBody(family, ids))).data);
    },
    async listReferences(opts: { game?: string; q?: string; cursor?: string | null; limit?: number } = {}) {
      return readReferences((await http.get(`${BASE}/references`, { params: buildReferencesParams(opts) })).data);
    },
    async putReference(input: ReferenceInput): Promise<unknown> {
      return unwrapBody((await http.put(`${BASE}/references`, buildReferenceBody(input))).data);
    },
    async deleteReference(id: string): Promise<void> {
      await http.delete(`${BASE}/references/${seg(id)}`);
    },
    async referencesFromStock(opts: { saleId?: string | null; game?: string | null; overwrite: boolean }): Promise<unknown> {
      return unwrapBody((await http.post(`${BASE}/references/from-stock`, buildFromStockBody(opts))).data);
    },
    async importReferences(opts: { csvText?: string | null; rows?: Array<Record<string, string>> | null; dryRun: boolean }): Promise<unknown> {
      return unwrapBody((await http.post(`${BASE}/references/import`, buildImportBody(opts))).data);
    },
    async listBenchmarks(): Promise<PriceBookBenchmarkRow[]> {
      return readBenchmarks((await http.get(`${BASE}/benchmarks`)).data);
    },
    async putBenchmark(input: BenchmarkInput): Promise<unknown> {
      return unwrapBody((await http.put(`${BASE}/benchmarks`, buildBenchmarkBody(input))).data);
    },
    async deleteBenchmark(id: string): Promise<void> {
      await http.delete(`${BASE}/benchmarks/${seg(id)}`);
    },
    async getBulkRates(game: string) {
      return readBulkRates((await http.get(`${BASE}/bulk-rates`, { params: { game } })).data);
    },
    /** Resolves to null without a request when the grid is over 600 rows. */
    async putBulkRates(game: string, rates: BulkRateInput[], ifVersion?: number | null): Promise<unknown> {
      const body = buildBulkRatesBody(game, rates, ifVersion);
      if (!body) return null;
      return unwrapBody((await http.put(`${BASE}/bulk-rates`, body)).data);
    },
    /** Resolves to null without a request when the percent is outside -90 to 500. */
    async adjustBulkRates(opts: { game: string; finish?: string | null; direction: BulkDirection; percent: number; apply: boolean }): Promise<unknown> {
      const body = buildAdjustBody(opts);
      if (!body) return null;
      return unwrapBody((await http.post(`${BASE}/bulk-rates/adjust`, body)).data);
    },
    async buylistQuote(cards: SuggestCardInput[]): Promise<SuggestResponse> {
      return readSuggestResponse((await http.post(`${BASE}/buylist/quote`, buildBuylistQuoteBody(cards))).data);
    },
    async buylistBulkQuote(game: string, lines: Array<{ tier: string; finish: string; cards: number }>): Promise<unknown> {
      return unwrapBody((await http.post(`${BASE}/buylist/bulk-quote`, buildBulkQuoteBody(game, lines))).data);
    },
    async suggest(family: PriceBookFamily, cards: SuggestCardInput[]): Promise<SuggestResponse> {
      return readSuggestResponse((await http.post(`${BASE}/suggest`, buildSuggestBody(family, cards))).data);
    },
    async putLock(itemId: string, opts: { locked: boolean; until?: string | null }): Promise<unknown> {
      return unwrapBody((await http.put(`${BASE}/locks/${seg(itemId)}`, buildLockBody(opts))).data);
    },
    async listLocks(limit?: number): Promise<PriceBookLockRow[]> {
      const params: Rec = {};
      put(params, 'limit', clampLimit(limit, 200));
      return readLocks((await http.get(`${BASE}/locks`, { params })).data);
    },
    async previewRun(opts: { kind: 'BULK' | 'LOT'; scope?: RunScope; includeMarkedDown?: boolean; includeEbayLive?: boolean }) {
      return readRunPreview((await http.post(`${BASE}/runs/preview`, buildRunPreviewBody(opts))).data);
    },
    async listRuns(): Promise<PriceBookRunSummary[]> {
      return readRunList((await http.get(`${BASE}/runs`)).data);
    },
    async getRun(id: string): Promise<PriceBookRunSummary | null> {
      const d = dataRec((await http.get(`${BASE}/runs/${seg(id)}`)).data);
      return readRunSummary(d.run !== undefined ? d.run : d);
    },
    async listRunItems(id: string, opts: { view?: RunViewName; cursor?: string | null; limit?: number } = {}) {
      return readRunItems((await http.get(`${BASE}/runs/${seg(id)}/items`, { params: buildRunItemsParams(opts) })).data);
    },
    async patchRunItems(id: string, opts: { selectIds?: string[]; deselectIds?: string[]; selectAllChanges?: boolean; selectReview?: boolean }): Promise<unknown> {
      return unwrapBody((await http.patch(`${BASE}/runs/${seg(id)}/items`, buildRunItemsPatch(opts))).data);
    },
    async applyRun(id: string, opts: { ifBookVersion: number; expectedCount: number }): Promise<RunProgress | null> {
      return readRunProgress((await http.post(`${BASE}/runs/${seg(id)}/apply`, buildApplyBody(opts))).data);
    },
    async undoRun(id: string): Promise<RunProgress | null> {
      return readRunProgress((await http.post(`${BASE}/runs/${seg(id)}/undo`, {})).data);
    },
    async cancelRun(id: string): Promise<void> {
      await http.post(`${BASE}/runs/${seg(id)}/cancel`, {});
    },
  };
}

export type PriceBookApi = ReturnType<typeof createPriceBookApi>;

/** The wrappers wired to the shared axios instance (baseURL /api, cookies, CSRF header and session refresh already there). */
export const priceBookApi: PriceBookApi = createPriceBookApi(api);

// ---------------------------------------------------------------------------
// "Repeat until done" loops for apply and undo (section 10.2)
// ---------------------------------------------------------------------------

export const RUN_LOOP_MAX_CALLS = 100;

/**
 * Call apply or undo again and again until the status is no longer APPLYING. Stops with a BAD_RESPONSE error when a call
 * makes no progress (so a stuck run cannot loop forever) or after RUN_LOOP_MAX_CALLS calls. A 409 ALREADY_APPLIED that
 * carries a final status is returned as the result (a double click or a retry is safe).
 */
export async function runUntilDone(
  call: () => Promise<RunProgress | null>,
  opts: { maxCalls?: number; onProgress?: (p: RunProgress) => void } = {}
): Promise<RunProgress> {
  const max = opts.maxCalls && opts.maxCalls > 0 ? opts.maxCalls : RUN_LOOP_MAX_CALLS;
  let previous: RunProgress | null = null;
  for (let i = 0; i < max; i += 1) {
    let progress: RunProgress | null;
    try {
      progress = await call();
    } catch (err) {
      const known = readPriceBookError(err);
      const fromBody = known.code === 'ALREADY_APPLIED' ? readRunProgress({ data: known.extra }) : null;
      if (fromBody && fromBody.status !== 'APPLYING') return fromBody;
      throw err;
    }
    if (!progress) throw badResponse();
    if (opts.onProgress) opts.onProgress(progress);
    if (progress.status !== 'APPLYING') return progress;
    if (previous && progress.remaining >= previous.remaining && progress.applied <= previous.applied) throw badResponse();
    previous = progress;
  }
  throw badResponse();
}

function badResponse(): Error {
  const e = new Error(wordingForPriceBookError('BAD_RESPONSE'));
  (e as Error & { code?: string }).code = 'BAD_RESPONSE';
  return e;
}
