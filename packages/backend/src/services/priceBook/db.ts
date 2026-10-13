/**
 * The structural database shape the price book services use (ADR-140 sections 4 and 15.2), plus the shared service
 * context and error type.
 *
 * Nothing in the price book imports the database client package. Each service takes a PriceBookDb, the resolved organizer
 * id and an injected clock, so the services run against an in-memory fake in tests (__tests__/__fixtures__/priceBookFakes.ts)
 * and against the real client in production. The one place the real client is turned into this shape is asPriceBookDb()
 * below; the controller of batch B4 calls it exactly once.
 *
 * Tenant rule for every service in this directory: the book is found from the organizer id, every child query carries
 * bookId, and every write goes through updateMany or deleteMany with bookId in the where clause (never a bare id), so a
 * row of another organizer's book can neither be read nor changed even if its id is known.
 */
import type { CardRefKey } from './providers/types';
import type { EnvLike } from './types';

export type Where = Record<string, unknown>;
export type Select = Record<string, boolean>;
export type OrderBy = Record<string, 'asc' | 'desc'>;

export interface FindArgs {
  where?: Where;
  select?: Select;
  orderBy?: OrderBy | OrderBy[];
  take?: number;
  skip?: number;
}

export interface ReadModel<Row> {
  findMany(args?: FindArgs): Promise<Row[]>;
  findFirst(args?: FindArgs): Promise<Row | null>;
  count(args?: { where?: Where }): Promise<number>;
}

export interface WriteModel<Row> extends ReadModel<Row> {
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  createMany(args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }): Promise<{ count: number }>;
  updateMany(args: { where: Where; data: Record<string, unknown> }): Promise<{ count: number }>;
  deleteMany(args: { where: Where }): Promise<{ count: number }>;
}

// ---------------------------------------------------------------------------------------------
// Rows (only the columns the services read; every select names exactly these)
// ---------------------------------------------------------------------------------------------

export interface BookRow {
  id: string;
  organizerId: string;
  enabled: boolean;
  version: number;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleRow {
  id: string;
  bookId: string;
  family: string;
  name: string;
  priority: number;
  enabled: boolean;
  productType: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceRow {
  id: string;
  bookId: string;
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
  asOf: Date;
  enteredByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BenchmarkRow {
  id: string;
  bookId: string;
  game: string;
  rarityClass: string;
  finish: string;
  valueCents: number;
  note: string | null;
  asOf: Date;
  updatedAt: Date;
}

export interface BulkRateRow {
  id: string;
  bookId: string;
  direction: string;
  game: string;
  tier: string;
  finish: string;
  unit: string;
  rateCents: number;
  creditRateCents: number | null;
  benchmarkNote: string | null;
  benchmarkRateCents: number | null;
  benchmarkAsOf: Date | null;
  updatedAt: Date;
}

export interface LockRow {
  id: string;
  bookId: string;
  itemId: string;
  reason: string;
  priceCentsAtLock: number | null;
  lockedUntil: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface RunRow {
  id: string;
  bookId: string;
  kind: string;
  status: string;
  scopeSaleId: string | null;
  scopeGame: string | null;
  scopeSetCode: string | null;
  scopeRarityClass: string | null;
  scopeFinish: string | null;
  onlyUnpriced: boolean;
  includeMarkedDown: boolean;
  includeEbayLive: boolean;
  bookVersion: number;
  previewCount: number;
  changeCount: number;
  unchangedCount: number;
  skippedCount: number;
  reviewCount: number;
  appliedCount: number;
  undoneCount: number;
  createdByUserId: string | null;
  createdAt: Date;
  expiresAt: Date;
  appliedAt: Date | null;
  undoneAt: Date | null;
}

export interface RunItemRow {
  id: string;
  runId: string;
  itemId: string;
  itemTitle: string;
  oldPriceCents: number | null;
  newPriceCents: number | null;
  state: string;
  selected: boolean;
  skipReason: string | null;
  priceSource: string | null;
  referenceOrigin: string | null;
  referenceCents: number | null;
  referenceAsOf: Date | null;
  ruleId: string | null;
  ruleName: string | null;
  conditionCode: string | null;
  finish: string | null;
  warnings: string[];
  reviewReasons: string[];
  whyText: string | null;
  bookVersion: number;
  appliedAt: Date | null;
  undoneAt: Date | null;
}

/** The Item columns the price book reads. Item.price is dollars (Float); the price book converts at the edges. */
export interface ItemRow {
  id: string;
  organizerId: string | null;
  title: string;
  price: number | null;
  costBasis: number | null;
  status: string;
  listingType: string | null;
  draftStatus: string | null;
  saleId: string | null;
  quantity: number | null;
  stockTotal: number | null;
  priceUpdatedAt: Date | null;
  deletedAt: Date | null;
  // Columns the price write (priceWriteService) and the run services read. Optional so a row built without them still fits;
  // a missing value reads as null, false or an empty list. Every read that needs them names them in PRICE_ITEM_SELECT.
  createdAt?: Date | null;
  markdownApplied?: boolean;
  priceBeforeMarkdown?: number | null;
  originalPrice?: number | null;
  rarity?: string | null;
  ebayListingId?: string | null;
  ebayOfferId?: string | null;
  ebaySyncState?: string | null;
  ebaySyncAttempts?: number | null;
  ebaySyncHeldAt?: Date | null;
  ebayHeldFields?: string[];
  userEditedFields?: string[];
  lastEditedAt?: Date | null;
}

export interface ItemCardRow {
  id: string;
  itemId: string;
  organizerId: string | null;
  game: string;
  productType: string;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: string | null;
  rarity: string | null;
  conditionCode: string | null;
  grader: string | null;
  catalogPrintingId: string | null;
}

export interface ItemBulkLotRow {
  itemId: string;
  organizerId: string | null;
  game: string;
  lotKind: string;
  packSize: number | null;
}

/** The eBay bundle settings of a bulk lot (read only: the lot run notes that a bundle price follows the lot price). */
export interface ItemBulkLotEbayBundleRow {
  itemId: string;
  organizerId: string | null;
  enabled: boolean;
  bundleSize: number;
}

export interface PurchaseRow {
  id: string;
  itemId: string | null;
  /** Dollars, already net of a cashier discount. */
  amount: number;
  status: string;
  source: string;
  isTestTransaction: boolean;
  bulkQuantity: number | null;
  refundedAmount: number | null;
  discountAmountCents: number | null;
  cashierDiscretionAmountCents: number | null;
  createdAt: Date;
}

export interface CardPrintingRow {
  id: string;
  source: string;
  game: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  rarity: string | null;
  finishes: string[];
}

/** A catalog price row. The money columns are decimals (a number, a string or a Decimal object); read them with toCentsOrNull. */
export interface CardPriceRow {
  printingId: string;
  usd: unknown;
  usdFoil: unknown;
  usdEtched: unknown;
  usdReverse: unknown;
  asOf: Date;
}

// ---------------------------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------------------------

export interface PriceBookTx {
  priceBook: WriteModel<BookRow>;
  priceBookRule: WriteModel<RuleRow>;
  priceBookReference: WriteModel<ReferenceRow>;
  priceBookBenchmark: WriteModel<BenchmarkRow>;
  priceBookBulkRate: WriteModel<BulkRateRow>;
  priceBookLock: WriteModel<LockRow>;
  priceBookRun: WriteModel<RunRow>;
  priceBookRunItem: WriteModel<RunItemRow>;
  item: WriteModel<ItemRow>;
  itemCard: ReadModel<ItemCardRow>;
  itemBulkLot: ReadModel<ItemBulkLotRow>;
  itemBulkLotEbayBundle: ReadModel<ItemBulkLotEbayBundleRow>;
  itemPriceHistory: Pick<WriteModel<{ id: string }>, 'create'>;
  purchase: ReadModel<PurchaseRow>;
  cardPrinting: ReadModel<CardPrintingRow>;
  cardPrice: ReadModel<CardPriceRow>;
}

/** Interactive transaction options (milliseconds). Bulk writes pass a longer timeout than the client default of 5 seconds. */
export interface TxOptions {
  timeout?: number;
  maxWait?: number;
}

export interface PriceBookDb extends PriceBookTx {
  $transaction<T>(fn: (tx: PriceBookTx) => Promise<T>, options?: TxOptions): Promise<T>;
}

/** The single place the real database client is turned into the structural shape. Called once, by the controller wiring. */
export function asPriceBookDb(client: unknown): PriceBookDb {
  return client as PriceBookDb;
}

/**
 * One card as the providers are asked about it: the B2 CardRefKey plus the facts the benchmark and catalog providers need
 * (rarity class for a benchmark, graded so the catalog is never used for a graded card). Assignable to CardRefKey.
 */
export interface ProviderCard extends CardRefKey {
  rarityClass?: string | null;
  graded?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Context and errors
// ---------------------------------------------------------------------------------------------

export interface ServiceCtx {
  db: PriceBookDb;
  /** The authenticated organizer's id, already resolved (a team member resolves to the owner). Never taken from a body. */
  organizerId: string;
  /** Injected clock. Services never read the system clock. */
  now: Date;
  /** The environment object; callers pass process.env. */
  env: EnvLike;
  userId?: string | null;
}

export class PriceBookError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'PriceBookError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isPriceBookError = (e: unknown): e is PriceBookError => e instanceof PriceBookError;

export const validationError = (message: string, details?: unknown): PriceBookError => new PriceBookError('VALIDATION', message, 400, details);
export const notFoundError = (message = 'Not found.'): PriceBookError => new PriceBookError('NOT_FOUND', message, 404);
export const versionConflictError = (): PriceBookError =>
  new PriceBookError('VERSION_CONFLICT', 'Your price book changed since you opened it. Reload and try again.', 409);

/** True for a unique constraint failure from the database (code P2002) or from the fake. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

// ---------------------------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------------------------

/** Splits a list into chunks of at most size items. */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Item.price (dollars, Float) to integer cents. Null for a missing, non-finite or negative price. */
export function dollarsToCents(price: number | null | undefined): number | null {
  if (price === null || price === undefined || typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100);
}

/** A decimal column value (number, string or a Decimal object) to integer cents. Null when missing, not finite or not above zero. */
export function toCentsOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') n = Number(value);
  else {
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    n = typeof maybe.toNumber === 'function' ? maybe.toNumber() : Number(String(value));
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
