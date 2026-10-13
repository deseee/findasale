/**
 * Price book runs (ADR-140 sections 4, 6.8, 10.2 and 12.5): a run reprices many cards in three steps the shop controls.
 *
 *   1. previewRun    computes a suggestion for every eligible card and stores the result as a PREVIEW run. No item changes.
 *   2. applyRun      writes the ticked rows, 200 per call, with a compare and swap per card; call it until it says APPLIED
 *                    or PARTIAL. A second call after the end answers 409 ALREADY_APPLIED with the same summary.
 *   3. undoRun       puts back the old price of each applied row, but only where the item still has the price the run wrote.
 *
 * What a run never does: change a price the shop pinned (also checked again at apply), change a card that was edited, marked
 * down or listed on eBay since the preview (the row is counted CHANGED_SINCE_PREVIEW and left alone), touch a bulk lot (those
 * are lotRunService) or write anything but Item price and its side effects through priceWriteService.
 *
 * Skip reasons, first match wins: MARKED_DOWN (checked first so the real cause is named: a markdown also stamps the price
 * edit time), LOCKED (a pin), RECENT_EDIT (a hand edit inside manualLockDays), EBAY_LIVE, GRADED, NOT_AVAILABLE, then the
 * engine's own failures (NO_REFERENCE, NO_RULE, NO_RATE, NO_COST, INVALID_INPUT), then UNCHANGED.
 *
 * Tenant rule: the book is found from ctx.organizerId; a run is found with its bookId, so another organizer's run id behaves as
 * missing; every item read and write also carries the organizer id. The clock is ctx.now and the limits come from ctx.env.
 */
import { PriceBookError, chunk, dollarsToCents, isPriceBookError, notFoundError, validationError } from './db';
import type { BookRow, ItemCardRow, ItemRow, PriceBookDb, RunItemRow, RunRow, ServiceCtx, TxOptions } from './db';
import { isBookUsable, requireBook } from './bookService';
import { getPriceBookConfig } from './config';
import { isLockActive } from './lockService';
import { COPY, fill, formatShortDate, previewSummaryText, recentEditText } from './messages';
import { PRICE_ITEM_SELECT, applyOrganizerPrice } from './priceWriteService';
import type { ApplyPriceResult } from './priceWriteService';
import type { PriceBookProvider } from './providers/registry';
import { KNOWN_GAMES } from './referenceService';
import { DEFAULT_MIN_CARD_SALE_CENTS, MAX_SUGGEST_CARDS, suggest } from './suggestService';
import type { SuggestRow } from './suggestService';
import { DAY_MS, classifyRarity, isFinish, isRarityClass } from './vocabulary';
import type { ReferenceKind } from './vocabulary';

/** Rows applied or undone per call (ADR-140 section 10.2). */
export const APPLY_CHUNK_SIZE = 200;
/** Cards priced per suggestion batch (the suggestion service takes at most 100 at a time). */
export const PREVIEW_BATCH_SIZE = MAX_SUGGEST_CARDS;
export const DEFAULT_RUN_LIST_LIMIT = 20;
export const MAX_RUN_LIST_LIMIT = 50;
export const DEFAULT_ITEM_PAGE = 100;
export const MAX_ITEM_PAGE = 200;
/** One card write (claim, read, compare and swap, history) is one short transaction. */
export const ROW_TX: TxOptions = { timeout: 30000, maxWait: 10000 };
/** Storing a preview of up to 5,000 rows is one transaction, so it gets a longer timeout than the client default. */
export const PREVIEW_TX: TxOptions = { timeout: 120000, maxWait: 10000 };

/** Item statuses a card run lists. RESERVED cards are listed and skipped as NOT_AVAILABLE; sold and donated cards are not listed. */
const LISTED_STATUSES = ['AVAILABLE', 'RESERVED'];
const CARD_LISTING_TYPES = ['FIXED', 'POS'];

export const RUN_VIEWS = ['changes', 'review', 'skipped', 'unchanged', 'all'] as const;
export type RunView_ = (typeof RUN_VIEWS)[number];

// ---------------------------------------------------------------------------------------------
// Copy (ADR-140 section 11.7 rules: no banned word, no dashes, plain short words). allRunMessages() feeds the copy lint.
// ---------------------------------------------------------------------------------------------

export const RUN_COPY = {
  notAvailable: 'This card is not on the shelf right now, so it was left alone.',
  unchanged: 'The price already matches your price book.',
  lockedSincePreview: 'You locked this price after the preview, so it was left alone.',
  lockedSince: '{n} cards were locked after the preview, so we left them alone.',
  previewExpired: 'This preview is out of date. Preview again.',
  bookChanged: 'Your rules changed after this preview. Preview again.',
  countMismatch: 'The selection changed since you last looked. Preview again.',
  nothingSelected: 'Tick at least one price to apply.',
  scopeTooLarge: 'That is too many cards for one run ({count} found, {max} at most). Narrow it by sale, game, set or finish.',
  alreadyApplied: 'These prices were already applied.',
  notPreview: 'This run is no longer a preview.',
  notApplied: 'Only applied prices can be undone.',
  undoExpired: 'The undo window for this run has ended.',
  undone: 'Undid {n} prices.',
  failedRows: '{n} prices could not be saved. Try those again.',
  wrongKind: 'This is a different kind of run.',
  runNotFound: 'Run not found.',
  cancelled: 'Preview discarded.',
} as const;

export function allRunMessages(): string[] {
  const out: string[] = Object.values(RUN_COPY).map((s) => s);
  out.push(fill(RUN_COPY.lockedSince, { n: 3 }), fill(RUN_COPY.scopeTooLarge, { count: 6000, max: 5000 }), fill(RUN_COPY.undone, { n: 4 }), fill(RUN_COPY.failedRows, { n: 2 }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type SkipReason =
  | 'LOCKED'
  | 'RECENT_EDIT'
  | 'MARKED_DOWN'
  | 'EBAY_LIVE'
  | 'GRADED'
  | 'NOT_AVAILABLE'
  | 'NO_REFERENCE'
  | 'NO_RULE'
  | 'NO_RATE'
  | 'NO_COST'
  | 'INVALID_INPUT'
  | 'UNCHANGED'
  | 'LOCKED_SINCE_PREVIEW';

/** A run item before it has an id and a run. */
export type NewRunItem = Omit<RunItemRow, 'id' | 'runId'>;

export interface RunScope {
  saleId: string | null;
  game: string | null;
  setCode: string | null;
  rarityClass: string | null;
  finish: string | null;
  onlyUnpriced: boolean;
  intakeBatchId: string | null;
}

export interface RunFlags {
  includeMarkedDown: boolean;
  includeEbayLive: boolean;
}

export interface PriceChange {
  runId: string;
  kind: 'APPLY' | 'UNDO';
  itemId: string;
  organizerId: string;
  oldPriceCents: number | null;
  newPriceCents: number | null;
  /** Dollars, as Item.price holds them. */
  oldPrice: number | null;
  newPrice: number | null;
  /** True when the item has an eBay listing or offer id. */
  ebayListed: boolean;
}

export interface RunDeps {
  /** Resolves an intake batch id to its sale and start time; null when it is not this organizer's. Needed only for intakeBatchId. */
  resolveIntakeBatch?: (organizerId: string, batchId: string) => Promise<{ saleId: string | null; createdAt: Date } | null>;
  /** Called after a price change commits (best effort, errors ignored): price drop alerts, an immediate marketplace push. */
  onPriceChanged?: (change: PriceChange) => void | Promise<void>;
  minCardSaleCents?: number;
  /** Tests only; production uses the registry. */
  providers?: readonly PriceBookProvider[];
}

export interface RunCounts {
  eligible: number;
  changes: number;
  unchanged: number;
  skipped: number;
  review: number;
}

export interface RunView {
  id: string;
  kind: string;
  status: string;
  bookVersion: number;
  scope: RunScope & RunFlags;
  counts: RunCounts;
  appliedCount: number;
  undoneCount: number;
  createdAt: string;
  expiresAt: string;
  appliedAt: string | null;
  undoneAt: string | null;
  summary: string;
}

export interface RunItemView {
  id: string;
  itemId: string;
  title: string;
  /** Dollars. For a lot run these are dollars per 1,000 cards. */
  oldPrice: number | null;
  newPrice: number | null;
  oldPriceCents: number | null;
  newPriceCents: number | null;
  changePercent: number | null;
  state: string;
  selected: boolean;
  skipReason: string | null;
  priceSource: string | null;
  referenceOrigin: string | null;
  referenceCents: number | null;
  conditionCode: string | null;
  finish: string | null;
  ruleName: string | null;
  why: string | null;
  warnings: string[];
  reviewReasons: string[];
}

export interface PreviewResult {
  run: RunView;
  items: RunItemView[];
  nextCursor: string | null;
  /** Reference sources that failed while the preview was computed; their numbers are missing from every row. */
  unavailable: ReferenceKind[];
}

export interface ApplySummary {
  runId: string;
  status: 'APPLYING' | 'APPLIED' | 'PARTIAL';
  applied: number;
  appliedThisCall: number;
  remaining: number;
  changedSincePreview: number;
  lockedSincePreview: number;
  failed: number;
  /** Plain words for the shop; empty while the run is still applying. */
  message: string;
}

export interface UndoSummary {
  runId: string;
  status: 'UNDOING' | 'UNDONE';
  undone: number;
  undoneThisCall: number;
  undoSkipped: number;
  remaining: number;
  message: string;
}

/** What one writer does with one row. Both writers (cards, lots) set the row's own state. */
export interface RunRowWriter {
  applyRow(ctx: ServiceCtx, run: RunRow, row: RunItemRow): Promise<'APPLIED' | 'CHANGED' | 'RACED'>;
  undoRow(ctx: ServiceCtx, run: RunRow, row: RunItemRow): Promise<'UNDONE' | 'SKIPPED' | 'RACED'>;
}

// ---------------------------------------------------------------------------------------------
// Input parsing (the controller's strict body check is a first line of defense; this is the second)
// ---------------------------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function assertKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw validationError(`Unknown field: ${key}.`, { field: key, in: where });
  }
}

export function optString(v: unknown, field: string, max = 100): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw validationError(`${field} must be text.`, { field });
  const t = v.trim();
  if (t === '') return null;
  if (t.length > max) throw validationError(`${field} is too long.`, { field });
  return t;
}

export function optBool(v: unknown, field: string): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw validationError(`${field} must be true or false.`, { field });
  return v;
}

const KNOWN_GAME_SET: readonly string[] = KNOWN_GAMES;

function parseScope(raw: unknown, allowed: readonly string[]): RunScope {
  if (raw === undefined || raw === null) raw = {};
  if (!isPlainObject(raw)) throw validationError('scope must be an object.', { field: 'scope' });
  assertKeys(raw, allowed, 'scope');
  const game = optString(raw.game, 'game', 30);
  if (game !== null && !KNOWN_GAME_SET.includes(game.toUpperCase())) throw validationError('That game is not known.', { field: 'game' });
  const finish = optString(raw.finish, 'finish', 30);
  if (finish !== null && !isFinish(finish.toUpperCase())) throw validationError('That finish is not known.', { field: 'finish' });
  const rarityClass = optString(raw.rarityClass, 'rarityClass', 30);
  if (rarityClass !== null && !isRarityClass(rarityClass.toUpperCase())) throw validationError('That rarity is not known.', { field: 'rarityClass' });
  const setCode = optString(raw.setCode, 'setCode', 30);
  const onlyUnpriced = optBool(raw.onlyUnpriced, 'onlyUnpriced');
  const intakeBatchId = optString(raw.intakeBatchId, 'intakeBatchId');
  if (intakeBatchId !== null && !onlyUnpriced) throw validationError('An intake batch can be used only with "only cards without a price".', { field: 'intakeBatchId' });
  return {
    saleId: optString(raw.saleId, 'saleId'),
    game: game === null ? null : game.toUpperCase(),
    setCode: setCode === null ? null : setCode.toLowerCase(),
    rarityClass: rarityClass === null ? null : rarityClass.toUpperCase(),
    finish: finish === null ? null : finish.toUpperCase(),
    onlyUnpriced,
    intakeBatchId,
  };
}

export const CARD_SCOPE_KEYS = ['saleId', 'game', 'setCode', 'rarityClass', 'finish', 'onlyUnpriced', 'intakeBatchId'] as const;

function parseCardPreview(raw: unknown): { scope: RunScope; flags: RunFlags } {
  if (!isPlainObject(raw)) throw validationError('Send an object.');
  assertKeys(raw, ['kind', 'scope', 'includeMarkedDown', 'includeEbayLive'], 'body');
  if (raw.kind !== 'BULK') throw validationError('kind must be BULK for a card run.', { field: 'kind' });
  return {
    scope: parseScope(raw.scope, CARD_SCOPE_KEYS),
    flags: { includeMarkedDown: optBool(raw.includeMarkedDown, 'includeMarkedDown'), includeEbayLive: optBool(raw.includeEbayLive, 'includeEbayLive') },
  };
}

export interface ApplyInput {
  ifBookVersion: number;
  expectedCount: number;
}

function parseApplyInput(raw: unknown): ApplyInput {
  if (!isPlainObject(raw)) throw validationError('Send an object.');
  assertKeys(raw, ['ifBookVersion', 'expectedCount'], 'body');
  const v = raw.ifBookVersion;
  const c = raw.expectedCount;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw validationError('ifBookVersion must be a whole number.', { field: 'ifBookVersion' });
  if (typeof c !== 'number' || !Number.isSafeInteger(c) || c < 0) throw validationError('expectedCount must be a whole number.', { field: 'expectedCount' });
  return { ifBookVersion: v, expectedCount: c };
}

// ---------------------------------------------------------------------------------------------
// Run lookup, expiry, views
// ---------------------------------------------------------------------------------------------

const fail = (code: string, message: string, status = 409, details?: unknown): PriceBookError => new PriceBookError(code, message, status, details);

/** The run of this book, or a not found error (another organizer's run id is indistinguishable from a missing one). */
export async function requireRun(ctx: ServiceCtx, bookId: string, runId: unknown): Promise<RunRow> {
  if (typeof runId !== 'string' || runId.trim() === '' || runId.length > 100) throw notFoundError(RUN_COPY.runNotFound);
  const run = await ctx.db.priceBookRun.findFirst({ where: { id: runId, bookId } });
  if (!run) throw notFoundError(RUN_COPY.runNotFound);
  if (run.status === 'PREVIEW' && run.expiresAt.getTime() <= ctx.now.getTime()) {
    await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId, status: 'PREVIEW' }, data: { status: 'EXPIRED' } });
    return { ...run, status: 'EXPIRED' };
  }
  return run;
}

async function expireStalePreviews(db: PriceBookDb, bookId: string, now: Date): Promise<void> {
  const stale = await db.priceBookRun.count({ where: { bookId, status: 'PREVIEW', expiresAt: { lte: now } } });
  if (stale > 0) await db.priceBookRun.updateMany({ where: { bookId, status: 'PREVIEW', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
}

export function toRunView(run: RunRow): RunView {
  const counts: RunCounts = {
    eligible: run.previewCount,
    changes: run.changeCount,
    unchanged: run.unchangedCount,
    skipped: run.skippedCount,
    review: run.reviewCount,
  };
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    bookVersion: run.bookVersion,
    scope: {
      saleId: run.scopeSaleId,
      game: run.scopeGame,
      setCode: run.scopeSetCode,
      rarityClass: run.scopeRarityClass,
      finish: run.scopeFinish,
      onlyUnpriced: run.onlyUnpriced,
      intakeBatchId: null,
      includeMarkedDown: run.includeMarkedDown,
      includeEbayLive: run.includeEbayLive,
    },
    counts,
    appliedCount: run.appliedCount,
    undoneCount: run.undoneCount,
    createdAt: run.createdAt.toISOString(),
    expiresAt: run.expiresAt.toISOString(),
    appliedAt: run.appliedAt ? run.appliedAt.toISOString() : null,
    undoneAt: run.undoneAt ? run.undoneAt.toISOString() : null,
    summary: previewSummaryText(counts.changes, counts.unchanged, counts.skipped, counts.review),
  };
}

function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

export function toRunItemView(row: RunItemRow): RunItemView {
  let changePercent: number | null = null;
  if (row.oldPriceCents !== null && row.oldPriceCents > 0 && row.newPriceCents !== null) {
    changePercent = Math.round(((row.newPriceCents - row.oldPriceCents) / row.oldPriceCents) * 1000) / 10;
  }
  return {
    id: row.id,
    itemId: row.itemId,
    title: row.itemTitle,
    oldPrice: centsToDollars(row.oldPriceCents),
    newPrice: centsToDollars(row.newPriceCents),
    oldPriceCents: row.oldPriceCents,
    newPriceCents: row.newPriceCents,
    changePercent,
    state: row.state,
    selected: row.selected,
    skipReason: row.skipReason,
    priceSource: row.priceSource,
    referenceOrigin: row.referenceOrigin,
    referenceCents: row.referenceCents,
    conditionCode: row.conditionCode,
    finish: row.finish,
    ruleName: row.ruleName,
    why: row.whyText,
    warnings: row.warnings,
    reviewReasons: row.reviewReasons,
  };
}

export async function getRun(ctx: ServiceCtx, runId: unknown): Promise<RunView> {
  const book = await requireBook(ctx);
  return toRunView(await requireRun(ctx, book.id, runId));
}

export interface ListRunItemsArgs {
  view?: unknown;
  cursor?: unknown;
  limit?: unknown;
}

export interface RunItemPage {
  items: RunItemView[];
  nextCursor: string | null;
}

function viewWhere(view: RunView_): Record<string, unknown> {
  switch (view) {
    case 'changes':
      return { state: { not: 'SKIPPED' }, reviewReasons: { isEmpty: true } };
    case 'review':
      return { state: { not: 'SKIPPED' }, reviewReasons: { isEmpty: false } };
    case 'unchanged':
      return { state: 'SKIPPED', skipReason: 'UNCHANGED' };
    case 'skipped':
      return { state: 'SKIPPED', skipReason: { not: 'UNCHANGED' } };
    default:
      return {};
  }
}

/** One page of a run's rows, in item id order. The cursor is the number of rows already seen. */
export async function listRunItems(ctx: ServiceCtx, runId: unknown, args: ListRunItemsArgs = {}): Promise<RunItemPage> {
  const book = await requireBook(ctx);
  const run = await requireRun(ctx, book.id, runId);
  const view = args.view === undefined || args.view === null || args.view === '' ? 'changes' : args.view;
  if (typeof view !== 'string' || !(RUN_VIEWS as readonly string[]).includes(view)) throw validationError('That view is not known.', { field: 'view' });
  let offset = 0;
  if (args.cursor !== undefined && args.cursor !== null && args.cursor !== '') {
    const n = Number(args.cursor);
    if (!Number.isSafeInteger(n) || n < 0) throw validationError('That cursor is not valid.', { field: 'cursor' });
    offset = n;
  }
  let limit = DEFAULT_ITEM_PAGE;
  if (args.limit !== undefined && args.limit !== null && args.limit !== '') {
    const n = Number(args.limit);
    if (!Number.isSafeInteger(n) || n < 1) throw validationError(`limit must be a whole number from 1 to ${MAX_ITEM_PAGE}.`, { field: 'limit' });
    limit = Math.min(n, MAX_ITEM_PAGE);
  }
  const rows = await ctx.db.priceBookRunItem.findMany({
    where: { runId: run.id, ...viewWhere(view as RunView_) },
    orderBy: { itemId: 'asc' },
    skip: offset,
    take: limit + 1,
  });
  const more = rows.length > limit;
  return { items: rows.slice(0, limit).map(toRunItemView), nextCursor: more ? String(offset + limit) : null };
}

/** Recent runs, newest first, with the lazy housekeeping of ADR-140 section 4.4 (expired previews, old run items). */
export async function listRuns(ctx: ServiceCtx, limitRaw?: unknown): Promise<RunView[]> {
  const book = await requireBook(ctx).catch((e: unknown) => {
    if (isPriceBookError(e) && e.code === 'NOT_FOUND') return null;
    throw e;
  });
  if (!book) return [];
  let limit = DEFAULT_RUN_LIST_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
    const n = Number(limitRaw);
    if (!Number.isSafeInteger(n) || n < 1) throw validationError(`limit must be a whole number from 1 to ${MAX_RUN_LIST_LIMIT}.`, { field: 'limit' });
    limit = Math.min(n, MAX_RUN_LIST_LIMIT);
  }
  await expireStalePreviews(ctx.db, book.id, ctx.now);
  await purgeOldRunItems(ctx, book.id);
  const runs = await ctx.db.priceBookRun.findMany({ where: { bookId: book.id }, orderBy: { createdAt: 'desc' }, take: limit });
  return runs.map(toRunView);
}

/** Deletes the rows of runs older than CARD_PRICE_BOOK_HISTORY_DAYS. The run summaries stay. */
async function purgeOldRunItems(ctx: ServiceCtx, bookId: string): Promise<void> {
  const cfg = getPriceBookConfig(ctx.env);
  const cutoff = new Date(ctx.now.getTime() - cfg.historyDays * DAY_MS);
  const old = await ctx.db.priceBookRun.findMany({ where: { bookId, createdAt: { lt: cutoff } }, take: 50 });
  if (old.length === 0) return;
  const ids = old.map((r) => r.id);
  const left = await ctx.db.priceBookRunItem.count({ where: { runId: { in: ids } } });
  if (left > 0) await ctx.db.priceBookRunItem.deleteMany({ where: { runId: { in: ids } } });
}

// ---------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------

interface Eligible {
  item: ItemRow;
  card: ItemCardRow;
}

async function loadEligible(ctx: ServiceCtx, scope: RunScope, intake: { saleId: string | null; createdAt: Date } | null): Promise<Eligible[]> {
  if (intake && intake.saleId && scope.saleId && intake.saleId !== scope.saleId) return [];
  const cardWhere: Record<string, unknown> = { organizerId: ctx.organizerId, productType: 'SINGLE' };
  if (scope.game) cardWhere.game = scope.game;
  if (scope.finish) cardWhere.finish = scope.finish;
  const cards = await ctx.db.itemCard.findMany({ where: cardWhere, orderBy: { itemId: 'asc' } });
  const byItem = new Map<string, ItemCardRow>();
  for (const c of cards) {
    if (byItem.has(c.itemId)) continue;
    if (scope.setCode && (c.setCode ?? '').toLowerCase() !== scope.setCode) continue;
    if (scope.rarityClass && classifyRarity(c.game, c.rarity) !== scope.rarityClass) continue;
    byItem.set(c.itemId, c);
  }
  // A bulk lot is never in a card run, whatever else its rows say.
  const lots = new Set<string>();
  for (const l of await ctx.db.itemBulkLot.findMany({ where: { organizerId: ctx.organizerId } })) lots.add(l.itemId);
  const ids = Array.from(byItem.keys()).filter((id) => !lots.has(id));

  const and: Array<Record<string, unknown>> = [];
  if (scope.onlyUnpriced) and.push({ OR: [{ price: null }, { price: { lte: 0 } }] });
  const base: Record<string, unknown> = {
    organizerId: ctx.organizerId,
    deletedAt: null,
    status: { in: LISTED_STATUSES },
    listingType: { in: CARD_LISTING_TYPES },
  };
  const saleId = scope.saleId ?? intake?.saleId ?? null;
  if (saleId) base.saleId = saleId;
  if (intake) base.createdAt = { gte: intake.createdAt };
  if (and.length > 0) base.AND = and;

  const out: Eligible[] = [];
  for (const part of chunk(ids, 1000)) {
    const items = await ctx.db.item.findMany({ where: { ...base, id: { in: part } }, select: PRICE_ITEM_SELECT });
    for (const item of items) {
      const card = byItem.get(item.id);
      if (card) out.push({ item, card });
    }
  }
  out.sort((a, b) => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  return out;
}

function baseRow(item: ItemRow, card: ItemCardRow, version: number): NewRunItem {
  return {
    itemId: item.id,
    itemTitle: (item.title || 'Card').slice(0, 200),
    oldPriceCents: dollarsToCents(item.price),
    newPriceCents: null,
    state: 'SKIPPED',
    selected: false,
    skipReason: null,
    priceSource: null,
    referenceOrigin: null,
    referenceCents: null,
    referenceAsOf: null,
    ruleId: null,
    ruleName: null,
    conditionCode: card.conditionCode,
    finish: card.finish,
    warnings: [],
    reviewReasons: [],
    whyText: null,
    bookVersion: version,
    appliedAt: null,
    undoneAt: null,
  };
}

function skipped(base: NewRunItem, reason: SkipReason, why: string): NewRunItem {
  return { ...base, state: 'SKIPPED', selected: false, skipReason: reason, whyText: why.slice(0, 500) };
}

function failureSkip(code: string | undefined): [SkipReason, string] {
  switch (code) {
    case 'NO_REFERENCE':
      return ['NO_REFERENCE', COPY.noSuggestion];
    case 'NO_RULE':
      return ['NO_RULE', COPY.noRule];
    case 'NO_RATE':
      return ['NO_RATE', COPY.noRate];
    case 'NO_COST':
      return ['NO_COST', COPY.noCost];
    case 'UNSUPPORTED_PRODUCT':
      return ['INVALID_INPUT', COPY.unsupportedProduct];
    default:
      return ['INVALID_INPUT', COPY.invalidInput];
  }
}

function asOfDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The pure decision for one card: a pending change or a skip with its reason, in the documented order. */
export function decideCardRow(item: ItemRow, card: ItemCardRow, s: SuggestRow | undefined, flags: RunFlags, version: number): NewRunItem {
  const base = baseRow(item, card, version);
  if (item.markdownApplied && !flags.includeMarkedDown) return skipped(base, 'MARKED_DOWN', COPY.markedDown);
  if (!s) return skipped(base, 'NOT_AVAILABLE', RUN_COPY.notAvailable);
  const sg = s.suggestion;
  const row: NewRunItem = {
    ...base,
    conditionCode: s.card.conditionCode ?? base.conditionCode,
    finish: s.card.finish ?? base.finish,
  };
  if (sg.lockedReason === 'PIN') return skipped(row, 'LOCKED', COPY.locked);
  // A markdown stamps the price edit time, so with "include marked down cards" the stamp is not a hand edit.
  if (sg.lockedReason === 'RECENT_EDIT' && !item.markdownApplied) {
    return skipped(row, 'RECENT_EDIT', recentEditText(formatShortDate(item.priceUpdatedAt ? item.priceUpdatedAt.toISOString() : null)));
  }
  if ((item.ebayListingId || item.ebayOfferId) && !flags.includeEbayLive) return skipped(row, 'EBAY_LIVE', COPY.ebayLive);
  if (s.card.graded || sg.code === 'GRADED_NOT_SUPPORTED') return skipped(row, 'GRADED', COPY.gradedNotSupported);
  if (item.status !== 'AVAILABLE') return skipped(row, 'NOT_AVAILABLE', RUN_COPY.notAvailable);
  if (!sg.ok || sg.priceCents === null) {
    const [reason, why] = failureSkip(sg.code);
    return skipped(row, reason, why);
  }
  if (sg.unchanged) return skipped({ ...row, newPriceCents: sg.priceCents, priceSource: sg.priceSource }, 'UNCHANGED', RUN_COPY.unchanged);
  const reasons = sg.review.reasons.map((r) => String(r));
  return {
    ...row,
    newPriceCents: sg.priceCents,
    state: 'PENDING',
    selected: reasons.length === 0,
    skipReason: null,
    priceSource: sg.priceSource,
    referenceOrigin: sg.referenceOrigin,
    referenceCents: sg.referenceCents,
    referenceAsOf: asOfDate(sg.priceAsOf),
    ruleId: sg.rule ? sg.rule.id : null,
    ruleName: sg.rule ? sg.rule.name.slice(0, 80) : null,
    warnings: sg.warnings.map((w) => String(w.code)),
    reviewReasons: reasons,
    whyText: sg.why.slice(0, 500),
  };
}

interface BatchPrices {
  byItem: Map<string, SuggestRow>;
  version: number | null;
  unavailable: ReferenceKind[];
}

/** Prices one batch through the same suggestion service the editor uses, so a run number equals a single suggestion. */
async function priceBatch(ctx: ServiceCtx, batch: Eligible[], flags: RunFlags, deps: RunDeps): Promise<BatchPrices> {
  const out: BatchPrices = { byItem: new Map(), version: null, unavailable: [] };
  const toPrice = batch.filter((e) => !(e.item.markdownApplied && !flags.includeMarkedDown));
  if (toPrice.length === 0) return out;
  const options = {
    family: 'RETAIL' as const,
    minCardSaleCents: deps.minCardSaleCents ?? DEFAULT_MIN_CARD_SALE_CENTS,
    ...(deps.providers ? { providers: deps.providers } : {}),
  };
  const price = async (list: Eligible[]): Promise<void> => {
    const res = await suggest(ctx, list.map((e) => ({ itemId: e.item.id, ref: e.item.id })), options);
    out.version = res.bookVersion;
    for (const k of res.unavailable) if (!out.unavailable.includes(k)) out.unavailable.push(k);
    for (const r of res.results) if (r.itemId) out.byItem.set(r.itemId, r);
  };
  try {
    await price(toPrice);
  } catch (e) {
    // An item deleted while the preview runs makes the batch answer not found; price the cards one by one instead.
    if (!isPriceBookError(e) || e.code !== 'NOT_FOUND') throw e;
    for (const one of toPrice) {
      try {
        await price([one]);
      } catch (e2) {
        if (!isPriceBookError(e2) || e2.code !== 'NOT_FOUND') throw e2;
      }
    }
  }
  return out;
}

export interface NewRunSpec {
  kind: 'BULK' | 'LOT';
  scope: Pick<RunScope, 'saleId' | 'game' | 'setCode' | 'rarityClass' | 'finish' | 'onlyUnpriced'>;
  flags: RunFlags;
}

export function countRows(rows: readonly NewRunItem[]): RunCounts {
  let changes = 0;
  let unchanged = 0;
  let skippedN = 0;
  let review = 0;
  for (const r of rows) {
    if (r.state === 'PENDING') {
      changes += 1;
      if (r.reviewReasons.length > 0) review += 1;
    } else if (r.skipReason === 'UNCHANGED') unchanged += 1;
    else skippedN += 1;
  }
  return { eligible: rows.length, changes, unchanged, skipped: skippedN, review };
}

/** Stores a computed preview: the run and all its rows in one transaction. Shared by the card and lot previews. */
export async function createPreviewRun(ctx: ServiceCtx, book: BookRow, spec: NewRunSpec, rows: NewRunItem[]): Promise<RunRow> {
  const cfg = getPriceBookConfig(ctx.env);
  if (rows.length > cfg.maxRunItems) {
    throw new PriceBookError('SCOPE_TOO_LARGE', fill(RUN_COPY.scopeTooLarge, { count: rows.length, max: cfg.maxRunItems }), 400, { count: rows.length, max: cfg.maxRunItems });
  }
  const counts = countRows(rows);
  const expiresAt = new Date(ctx.now.getTime() + cfg.previewMinutes * 60 * 1000);
  return ctx.db.$transaction(async (tx) => {
    const run = await tx.priceBookRun.create({
      data: {
        bookId: book.id,
        kind: spec.kind,
        status: 'PREVIEW',
        scopeSaleId: spec.scope.saleId,
        scopeGame: spec.scope.game,
        scopeSetCode: spec.scope.setCode,
        scopeRarityClass: spec.scope.rarityClass,
        scopeFinish: spec.scope.finish,
        onlyUnpriced: spec.scope.onlyUnpriced,
        includeMarkedDown: spec.flags.includeMarkedDown,
        includeEbayLive: spec.flags.includeEbayLive,
        bookVersion: book.version,
        previewCount: counts.eligible,
        changeCount: counts.changes,
        unchangedCount: counts.unchanged,
        skippedCount: counts.skipped,
        reviewCount: counts.review,
        createdByUserId: ctx.userId ?? null,
        createdAt: ctx.now,
        expiresAt,
      },
    });
    for (const part of chunk(rows, APPLY_CHUNK_SIZE)) {
      await tx.priceBookRunItem.createMany({ data: part.map((r) => ({ ...r, runId: run.id })) });
    }
    return run;
  }, PREVIEW_TX);
}

/** The first page of a freshly stored preview, in the shape of ADR-140 section 10.2. */
export async function previewResult(ctx: ServiceCtx, run: RunRow, unavailable: ReferenceKind[]): Promise<PreviewResult> {
  const page = await listRunItems(ctx, run.id, { view: 'changes', limit: MAX_ITEM_PAGE });
  return { run: toRunView(run), items: page.items, nextCursor: page.nextCursor, unavailable };
}

/** Requires a usable book (the organizer switch and the platform switch) for creating a new preview. */
export async function requireUsableBook(ctx: ServiceCtx): Promise<BookRow> {
  const book = await requireBook(ctx);
  if (!isBookUsable(ctx.env, book)) throw new PriceBookError('PRICE_BOOK_DISABLED', COPY.disabled, 404);
  return book;
}

/**
 * Computes and stores a card run preview. Eligible cards: this organizer's, AVAILABLE or RESERVED, fixed price or POS listing,
 * with a card record of product type SINGLE, not a bulk lot. Everything else is not listed. Writes only the run and its rows.
 */
export async function previewRun(ctx: ServiceCtx, input: unknown, deps: RunDeps = {}): Promise<PreviewResult> {
  const parsed = parseCardPreview(input);
  const book = await requireUsableBook(ctx);
  const cfg = getPriceBookConfig(ctx.env);

  let intake: { saleId: string | null; createdAt: Date } | null = null;
  if (parsed.scope.intakeBatchId) {
    if (!deps.resolveIntakeBatch) throw validationError('Intake batches are not available here.', { field: 'intakeBatchId' });
    intake = await deps.resolveIntakeBatch(ctx.organizerId, parsed.scope.intakeBatchId);
    if (!intake) throw notFoundError('Intake batch not found.');
  }

  const eligible = await loadEligible(ctx, parsed.scope, intake);
  if (eligible.length > cfg.maxRunItems) {
    throw new PriceBookError('SCOPE_TOO_LARGE', fill(RUN_COPY.scopeTooLarge, { count: eligible.length, max: cfg.maxRunItems }), 400, { count: eligible.length, max: cfg.maxRunItems });
  }

  const rows: NewRunItem[] = [];
  const unavailable: ReferenceKind[] = [];
  for (const batch of chunk(eligible, PREVIEW_BATCH_SIZE)) {
    const priced = await priceBatch(ctx, batch, parsed.flags, deps);
    if (priced.version !== null && priced.version !== book.version) throw fail('BOOK_CHANGED', RUN_COPY.bookChanged);
    for (const k of priced.unavailable) if (!unavailable.includes(k)) unavailable.push(k);
    for (const e of batch) rows.push(decideCardRow(e.item, e.card, priced.byItem.get(e.item.id), parsed.flags, book.version));
  }

  const run = await createPreviewRun(ctx, book, { kind: 'BULK', scope: parsed.scope, flags: parsed.flags }, rows);
  return previewResult(ctx, run, unavailable);
}

// ---------------------------------------------------------------------------------------------
// Selection and cancel (PREVIEW only)
// ---------------------------------------------------------------------------------------------

export interface SelectionResult {
  selected: number;
  changes: number;
}

function idList(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 1000) throw validationError(`${field} must be a list of at most 1000 ids.`, { field });
  for (const id of v) if (typeof id !== 'string' || id === '' || id.length > 100) throw validationError(`${field} must hold item ids.`, { field });
  return v as string[];
}

/** Ticks or unticks rows of a preview. Only PENDING rows can be ticked; a skipped row can never be applied. */
export async function updateSelection(ctx: ServiceCtx, runId: unknown, input: unknown): Promise<SelectionResult> {
  if (!isPlainObject(input)) throw validationError('Send an object.');
  assertKeys(input, ['selectIds', 'deselectIds', 'selectAllChanges', 'selectReview'], 'body');
  const selectIds = idList(input.selectIds, 'selectIds');
  const deselectIds = idList(input.deselectIds, 'deselectIds');
  for (const f of ['selectAllChanges', 'selectReview'] as const) {
    if (input[f] !== undefined && typeof input[f] !== 'boolean') throw validationError(`${f} must be true or false.`, { field: f });
  }
  if (selectIds.length === 0 && deselectIds.length === 0 && input.selectAllChanges === undefined && input.selectReview === undefined) {
    throw validationError('Nothing to change.');
  }
  const book = await requireBook(ctx);
  const run = await requireRun(ctx, book.id, runId);
  if (run.status === 'EXPIRED') throw fail('PREVIEW_EXPIRED', RUN_COPY.previewExpired);
  if (run.status !== 'PREVIEW') throw fail('RUN_NOT_PREVIEW', RUN_COPY.notPreview);

  const pending = { runId: run.id, state: 'PENDING' };
  if (typeof input.selectAllChanges === 'boolean') {
    await ctx.db.priceBookRunItem.updateMany({ where: { ...pending, reviewReasons: { isEmpty: true } }, data: { selected: input.selectAllChanges } });
  }
  if (typeof input.selectReview === 'boolean') {
    await ctx.db.priceBookRunItem.updateMany({ where: { ...pending, reviewReasons: { isEmpty: false } }, data: { selected: input.selectReview } });
  }
  if (selectIds.length > 0) await ctx.db.priceBookRunItem.updateMany({ where: { ...pending, itemId: { in: selectIds } }, data: { selected: true } });
  if (deselectIds.length > 0) await ctx.db.priceBookRunItem.updateMany({ where: { ...pending, itemId: { in: deselectIds } }, data: { selected: false } });
  return {
    selected: await ctx.db.priceBookRunItem.count({ where: { ...pending, selected: true } }),
    changes: await ctx.db.priceBookRunItem.count({ where: pending }),
  };
}

/** Discards a preview. Nothing was written to any item, so nothing is undone. */
export async function cancelRun(ctx: ServiceCtx, runId: unknown): Promise<RunView> {
  const book = await requireBook(ctx);
  const run = await requireRun(ctx, book.id, runId);
  if (run.status === 'EXPIRED') throw fail('PREVIEW_EXPIRED', RUN_COPY.previewExpired);
  const res = await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id, status: 'PREVIEW' }, data: { status: 'CANCELLED' } });
  if (res.count !== 1) throw fail('RUN_NOT_PREVIEW', RUN_COPY.notPreview);
  return toRunView({ ...run, status: 'CANCELLED' });
}

// ---------------------------------------------------------------------------------------------
// Apply and undo (generic loops; the card and lot writers plug in)
// ---------------------------------------------------------------------------------------------

/** Items of this chunk that carry a pin that has not expired. */
export async function activePins(db: PriceBookDb, bookId: string, itemIds: readonly string[], now: Date): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(Array.from(new Set(itemIds)), 1000)) {
    for (const l of await db.priceBookLock.findMany({ where: { bookId, itemId: { in: part } } })) if (isLockActive(l, now)) out.add(l.itemId);
  }
  return out;
}

async function countState(db: PriceBookDb, runId: string, where: Record<string, unknown>): Promise<number> {
  return db.priceBookRunItem.count({ where: { runId, ...where } });
}

async function summarizeApply(db: PriceBookDb, run: RunRow, appliedThisCall: number, status: ApplySummary['status']): Promise<ApplySummary> {
  const applied = await countState(db, run.id, { state: 'APPLIED' });
  const remaining = await countState(db, run.id, { state: 'PENDING', selected: true });
  const changed = await countState(db, run.id, { state: 'CHANGED_SINCE_PREVIEW' });
  const locked = await countState(db, run.id, { state: 'SKIPPED', skipReason: 'LOCKED_SINCE_PREVIEW' });
  const failed = await countState(db, run.id, { state: 'FAILED' });
  let message = '';
  if (status !== 'APPLYING') {
    const parts = [fill(COPY.applied, { n: applied })];
    if (changed > 0) parts.push(fill(COPY.changedSince, { n: changed }));
    if (locked > 0) parts.push(fill(RUN_COPY.lockedSince, { n: locked }));
    if (failed > 0) parts.push(fill(RUN_COPY.failedRows, { n: failed }));
    message = parts.join(' ');
  }
  return { runId: run.id, status, applied, appliedThisCall, remaining, changedSincePreview: changed, lockedSincePreview: locked, failed, message };
}

async function summarizeUndo(db: PriceBookDb, run: RunRow, undoneThisCall: number, status: UndoSummary['status']): Promise<UndoSummary> {
  const undone = await countState(db, run.id, { state: 'UNDONE' });
  const undoSkipped = await countState(db, run.id, { state: 'UNDO_SKIPPED' });
  const remaining = await countState(db, run.id, { state: 'APPLIED' });
  let message = '';
  if (status === 'UNDONE') {
    const parts = [fill(RUN_COPY.undone, { n: undone })];
    if (undoSkipped > 0) parts.push(fill(COPY.undoSkipped, { n: undoSkipped }));
    message = parts.join(' ');
  }
  return { runId: run.id, status, undone, undoneThisCall, undoSkipped, remaining, message };
}

/**
 * Applies the next chunk of selected rows of a run of the given kind. The first call (status PREVIEW) checks the preview is
 * still valid (not expired, same book version, the number of ticked rows is the one the shop confirmed) and moves the run to
 * APPLYING; later calls continue it. Rows are claimed one by one (PENDING to APPLIED) so two calls at once cannot apply a row
 * twice; a row the writer cannot apply is counted, never forced.
 */
export async function applyRunWith(ctx: ServiceCtx, runId: unknown, input: unknown, kind: 'BULK' | 'LOT', writer: RunRowWriter): Promise<ApplySummary> {
  const args = parseApplyInput(input);
  const book = await requireBook(ctx);
  const run = await requireRun(ctx, book.id, runId);
  if (run.kind !== kind) throw fail('WRONG_RUN_KIND', RUN_COPY.wrongKind, 400);
  if (run.status === 'APPLIED' || run.status === 'PARTIAL') {
    throw fail('ALREADY_APPLIED', RUN_COPY.alreadyApplied, 409, await summarizeApply(ctx.db, run, 0, run.status));
  }
  if (run.status === 'EXPIRED') throw fail('PREVIEW_EXPIRED', RUN_COPY.previewExpired);
  if (run.status !== 'PREVIEW' && run.status !== 'APPLYING') throw fail('RUN_NOT_PREVIEW', RUN_COPY.notPreview);

  if (run.status === 'PREVIEW') {
    if (args.ifBookVersion !== book.version || run.bookVersion !== book.version) throw fail('BOOK_CHANGED', RUN_COPY.bookChanged);
    const ticked = await countState(ctx.db, run.id, { state: 'PENDING', selected: true });
    if (ticked === 0) throw fail('NOTHING_SELECTED', RUN_COPY.nothingSelected);
    if (ticked !== args.expectedCount) throw fail('COUNT_MISMATCH', RUN_COPY.countMismatch);
    await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id, status: 'PREVIEW' }, data: { status: 'APPLYING' } });
  }

  const rows = await ctx.db.priceBookRunItem.findMany({
    where: { runId: run.id, state: 'PENDING', selected: true },
    orderBy: { itemId: 'asc' },
    take: APPLY_CHUNK_SIZE,
  });
  const pinned = await activePins(ctx.db, book.id, rows.map((r) => r.itemId), ctx.now);
  let appliedThisCall = 0;
  for (const row of rows) {
    if (pinned.has(row.itemId)) {
      await ctx.db.priceBookRunItem.updateMany({
        where: { id: row.id, runId: run.id, state: 'PENDING' },
        data: { state: 'SKIPPED', skipReason: 'LOCKED_SINCE_PREVIEW', selected: false, whyText: RUN_COPY.lockedSincePreview },
      });
      continue;
    }
    try {
      const outcome = await writer.applyRow(ctx, run, row);
      if (outcome === 'APPLIED') appliedThisCall += 1;
    } catch (e) {
      void e;
      await ctx.db.priceBookRunItem.updateMany({
        where: { id: row.id, runId: run.id, state: { in: ['PENDING', 'APPLIED'] } },
        data: { state: 'FAILED', appliedAt: null },
      });
    }
  }

  const progress = await summarizeApply(ctx.db, run, appliedThisCall, 'APPLYING');
  if (progress.remaining > 0) {
    await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id }, data: { appliedCount: progress.applied } });
    return progress;
  }
  const status = progress.changedSincePreview + progress.lockedSincePreview + progress.failed > 0 ? 'PARTIAL' : 'APPLIED';
  await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id }, data: { status, appliedCount: progress.applied, appliedAt: ctx.now } });
  return summarizeApply(ctx.db, run, appliedThisCall, status);
}

/**
 * Undoes the next chunk of applied rows. A row is restored only where the item still has the price the run wrote (the writer
 * checks); a row that was changed since, or pinned since, is left alone and counted as UNDO_SKIPPED. Calling it again after the
 * run is UNDONE answers the same final summary. The window is CARD_PRICE_BOOK_UNDO_DAYS from the end of the apply.
 */
export async function undoRunWith(ctx: ServiceCtx, runId: unknown, kind: 'BULK' | 'LOT', writer: RunRowWriter): Promise<UndoSummary> {
  const book = await requireBook(ctx);
  const run = await requireRun(ctx, book.id, runId);
  if (run.kind !== kind) throw fail('WRONG_RUN_KIND', RUN_COPY.wrongKind, 400);
  if (run.status === 'UNDONE') return summarizeUndo(ctx.db, run, 0, 'UNDONE');
  if (run.status !== 'APPLIED' && run.status !== 'PARTIAL') throw fail('RUN_NOT_APPLIED', RUN_COPY.notApplied);

  const started = (await countState(ctx.db, run.id, { state: { in: ['UNDONE', 'UNDO_SKIPPED'] } })) > 0;
  if (!started) {
    const cfg = getPriceBookConfig(ctx.env);
    const end = run.appliedAt ? run.appliedAt.getTime() + cfg.undoDays * DAY_MS : 0;
    if (ctx.now.getTime() > end) throw fail('UNDO_EXPIRED', RUN_COPY.undoExpired);
  }

  const rows = await ctx.db.priceBookRunItem.findMany({ where: { runId: run.id, state: 'APPLIED' }, orderBy: { itemId: 'asc' }, take: APPLY_CHUNK_SIZE });
  const pinned = await activePins(ctx.db, book.id, rows.map((r) => r.itemId), ctx.now);
  let undoneThisCall = 0;
  for (const row of rows) {
    if (pinned.has(row.itemId)) {
      await ctx.db.priceBookRunItem.updateMany({ where: { id: row.id, runId: run.id, state: 'APPLIED' }, data: { state: 'UNDO_SKIPPED' } });
      continue;
    }
    try {
      const outcome = await writer.undoRow(ctx, run, row);
      if (outcome === 'UNDONE') undoneThisCall += 1;
    } catch (e) {
      void e;
      await ctx.db.priceBookRunItem.updateMany({
        where: { id: row.id, runId: run.id, state: { in: ['APPLIED', 'UNDONE'] } },
        data: { state: 'UNDO_SKIPPED', undoneAt: null },
      });
    }
  }

  const progress = await summarizeUndo(ctx.db, run, undoneThisCall, 'UNDOING');
  if (progress.remaining > 0) {
    await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id }, data: { undoneCount: progress.undone } });
    return progress;
  }
  await ctx.db.priceBookRun.updateMany({ where: { id: run.id, bookId: book.id }, data: { status: 'UNDONE', undoneCount: progress.undone, undoneAt: ctx.now } });
  return summarizeUndo(ctx.db, run, undoneThisCall, 'UNDONE');
}

// ---------------------------------------------------------------------------------------------
// The card writer
// ---------------------------------------------------------------------------------------------

async function notify(deps: RunDeps, change: PriceChange): Promise<void> {
  if (!deps.onPriceChanged) return;
  try {
    await deps.onPriceChanged(change);
  } catch (e) {
    void e; // a failed alert never undoes a price
  }
}

/** Writes card prices through priceWriteService, one short transaction per row. */
export function createCardRowWriter(deps: RunDeps = {}): RunRowWriter {
  return {
    async applyRow(ctx, run, row) {
      const done = await ctx.db.$transaction(async (tx): Promise<{ outcome: 'APPLIED' | 'CHANGED' | 'RACED'; change: PriceChange | null }> => {
        const claim = await tx.priceBookRunItem.updateMany({
          where: { id: row.id, runId: run.id, state: 'PENDING', selected: true },
          data: { state: 'APPLIED', appliedAt: ctx.now },
        });
        if (claim.count !== 1) return { outcome: 'RACED', change: null };
        const item = await tx.item.findFirst({ where: { id: row.itemId, organizerId: ctx.organizerId, deletedAt: null }, select: PRICE_ITEM_SELECT });
        let result: ApplyPriceResult = { status: 'CHANGED_SINCE_PREVIEW' };
        // A card that was marked down or listed on eBay after the preview is left alone unless the run said to include those.
        const markedSince = Boolean(item && item.markdownApplied && !run.includeMarkedDown);
        const listedSince = Boolean(item && (item.ebayListingId || item.ebayOfferId) && !run.includeEbayLive);
        if (item && row.newPriceCents !== null && !markedSince && !listedSince) {
          result = await applyOrganizerPrice(tx, {
            item,
            newPriceCents: row.newPriceCents,
            runId: run.id,
            now: ctx.now,
            expect: { priceCents: row.oldPriceCents, notEditedAfter: run.createdAt },
          });
        }
        if (result.status === 'APPLIED' && item) {
          return {
            outcome: 'APPLIED',
            change: {
              runId: run.id,
              kind: 'APPLY',
              itemId: item.id,
              organizerId: ctx.organizerId,
              oldPriceCents: result.oldPriceCents,
              newPriceCents: result.newPriceCents,
              oldPrice: centsToDollars(result.oldPriceCents),
              newPrice: centsToDollars(result.newPriceCents),
              ebayListed: Boolean(item.ebayListingId || item.ebayOfferId),
            },
          };
        }
        await tx.priceBookRunItem.updateMany({ where: { id: row.id, runId: run.id }, data: { state: 'CHANGED_SINCE_PREVIEW', appliedAt: null } });
        return { outcome: 'CHANGED', change: null };
      }, ROW_TX);
      if (done.change) await notify(deps, done.change);
      return done.outcome;
    },

    async undoRow(ctx, run, row) {
      const done = await ctx.db.$transaction(async (tx): Promise<{ outcome: 'UNDONE' | 'SKIPPED' | 'RACED'; change: PriceChange | null }> => {
        const claim = await tx.priceBookRunItem.updateMany({
          where: { id: row.id, runId: run.id, state: 'APPLIED' },
          data: { state: 'UNDONE', undoneAt: ctx.now },
        });
        if (claim.count !== 1) return { outcome: 'RACED', change: null };
        const item = await tx.item.findFirst({ where: { id: row.itemId, organizerId: ctx.organizerId, deletedAt: null }, select: PRICE_ITEM_SELECT });
        let result: ApplyPriceResult = { status: 'CHANGED_SINCE_PREVIEW' };
        if (item) {
          result = await applyOrganizerPrice(tx, {
            item,
            newPriceCents: row.oldPriceCents,
            runId: run.id,
            now: ctx.now,
            // The run wrote the price and stamped the item at its apply time; a later stamp is somebody else's edit.
            expect: { priceCents: row.newPriceCents, notEditedAfter: row.appliedAt },
            historyNote: `Price book undo of run ${run.id}`,
          });
        }
        if (result.status === 'APPLIED' && item) {
          return {
            outcome: 'UNDONE',
            change: {
              runId: run.id,
              kind: 'UNDO',
              itemId: item.id,
              organizerId: ctx.organizerId,
              oldPriceCents: result.oldPriceCents,
              newPriceCents: result.newPriceCents,
              oldPrice: centsToDollars(result.oldPriceCents),
              newPrice: centsToDollars(result.newPriceCents),
              ebayListed: Boolean(item.ebayListingId || item.ebayOfferId),
            },
          };
        }
        await tx.priceBookRunItem.updateMany({ where: { id: row.id, runId: run.id }, data: { state: 'UNDO_SKIPPED', undoneAt: null } });
        return { outcome: 'SKIPPED', change: null };
      }, ROW_TX);
      if (done.change) await notify(deps, done.change);
      return done.outcome;
    },
  };
}

/** Applies the next chunk of a card run (kind BULK). Lot runs use lotRunService.applyLotRun. */
export function applyRun(ctx: ServiceCtx, runId: unknown, input: unknown, deps: RunDeps = {}): Promise<ApplySummary> {
  return applyRunWith(ctx, runId, input, 'BULK', createCardRowWriter(deps));
}

/** Undoes the next chunk of a card run (kind BULK). Lot runs use lotRunService.undoLotRun. */
export function undoRun(ctx: ServiceCtx, runId: unknown, deps: RunDeps = {}): Promise<UndoSummary> {
  return undoRunWith(ctx, runId, 'BULK', createCardRowWriter(deps));
}
