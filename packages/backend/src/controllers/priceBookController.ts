/**
 * Price book controller (ADR-140 batch B4). Mounted at /api/price-book by the wiring batch (B9); this file mounts nothing.
 *
 *   GET    /status                      organizer, team member, or any signed in user (platform facts only): flags, limits, vocabulary
 *   GET    /book                        organizer or team member: settings plus counts ({ book: null } before the first write)
 *   PUT    /book                        organizer: create or update settings (ifVersion)
 *   POST   /book/templates              organizer: apply a starter rule set
 *   GET    /rules?family=               organizer: rules in priority order
 *   POST   /rules  PUT /rules/:id  DELETE /rules/:id  POST /rules/reorder      organizer
 *   GET    /references  PUT /references  DELETE /references/:id               organizer (typed prices, dollars in, cents out)
 *   POST   /references/from-stock  POST /references/import                    organizer (import: JSON or one multipart file)
 *   GET    /benchmarks  PUT /benchmarks  DELETE /benchmarks/:id               organizer
 *   GET    /bulk-rates?game=  PUT /bulk-rates  POST /bulk-rates/adjust        organizer
 *   POST   /buylist/quote  POST /buylist/bulk-quote                           organizer (writes nothing)
 *   POST   /suggest                     organizer or team member (at most 100 cards)
 *   PUT    /locks/:itemId  GET /locks   organizer
 *   POST   /runs/preview  GET /runs  GET /runs/:id  GET /runs/:id/items       organizer
 *   PATCH  /runs/:id/items  POST /runs/:id/apply  POST /runs/:id/undo  POST /runs/:id/cancel      organizer
 *
 * Envelope: { success: true, data } or { success: false, error, code, ...extra }. Every route except GET /status answers 404
 * PRICE_BOOK_DISABLED while CARD_PRICE_BOOK_ENABLED is off (read at call time). The organizer id always comes from the
 * logged in account (a team member resolves to the owner, and is refused on every write), never from a request. There is
 * deliberately NO requireTier: the price book is open to every tier, like card intake and bulk lots. Do not "fix" this.
 *
 * Handlers are built by createPriceBookHandlers(deps) so tests inject the in-memory fake database. The exported
 * priceBookHandlers are bound lazily to the shared Prisma client, process.env and the real side effect helpers (nothing
 * heavy is loaded until the first request). The services are pure over an injected PriceBookDb; asPriceBookDb() turns the
 * real client into that shape exactly once, in buildProductionDeps().
 *
 * Alignment with the frontend wrappers (lib/priceBook.ts is the contract), where it differs from the ADR text:
 *   - PUT /references takes game at the top level next to typed; the server merges it into typed. price is dollars.
 *   - Run item ids in PATCH /runs/:id/items are the run item ids (item ids are accepted too).
 *   - Apply and undo answer flat fields plus a summary block with changedSince, failed, undone and undoSkipped; undo reports
 *     APPLYING while rows remain, so one client loop serves both. A 409 ALREADY_APPLIED carries the same fields.
 *   - A lot run scope may carry onlyUnpriced false (the client always sends it); any other card filter is refused.
 *   - GET /status carries singular vocabulary keys (finish, rarityClass, ...) next to the plural lists, and limits.undoDays.
 */
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PriceBookError, asPriceBookDb, chunk, dollarsToCents, isPriceBookError, notFoundError, validationError } from '../services/priceBook/db';
import type { PriceBookDb, ServiceCtx } from '../services/priceBook/db';
import { INT_SETTINGS, applyTemplate, createRule, deleteRule, findBook, getBookWithCounts, listRules, reorderRules, toBookSettings, updateRule, upsertBook } from '../services/priceBook/bookService';
import { getPriceBookConfig, isPriceBookEnabled } from '../services/priceBook/config';
import type { EnvLike } from '../services/priceBook/config';
import { lotPricePerThousandCents, quoteBulkBuy } from '../services/priceBook/bulkRates';
import {
  KNOWN_GAMES,
  MAX_IMPORT_BYTES,
  MAX_NOTE_LENGTH,
  MAX_RATE_ROWS,
  adjustBulkRates,
  deleteBenchmark,
  deleteReference,
  importReferences,
  listBenchmarks,
  listBulkRates,
  listReferences,
  loadBulkRates,
  parseMoneyToCents,
  referencesFromStock,
  saveBulkRates,
  toBulkRate,
  upsertBenchmark,
  upsertReference,
} from '../services/priceBook/referenceService';
import type { PrintingResolveCandidate, PrintingResolveRef, PrintingResolveResult, PrintingResolver } from '../services/priceBook/referenceService';
import { applyLotRun, previewLotRun, undoLotRun } from '../services/priceBook/lotRunService';
import type { LotRunDeps } from '../services/priceBook/lotRunService';
import { listLocks, setLock } from '../services/priceBook/lockService';
import { applyRun, cancelRun, getRun, listRunItems, listRuns, previewRun, requireUsableBook, undoRun, updateSelection } from '../services/priceBook/runService';
import type { ApplySummary, PriceChange, RunDeps, UndoSummary } from '../services/priceBook/runService';
import { MAX_SUGGEST_CARDS, suggest } from '../services/priceBook/suggestService';
import type { SuggestRow } from '../services/priceBook/suggestService';
import { COPY, CONDITION_LABELS, DIRECTION_LABELS, FINISH_LABELS, ROUNDING_DIRECTION_NAMES, ROUNDING_NAMES, SOURCE_LABELS, TIER_LABELS, UNIT_LABELS } from '../services/priceBook/messages';
import { MAX_BULK_CARDS, PRICE_BOOK_VOCABULARY } from '../services/priceBook/vocabulary';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** Same shape as AuthRequest (middleware/auth) without importing it, so this module loads without the database client. */
export interface PbRequest extends Request {
  user?: any;
}

/** The resolved caller: id is the Organizer.id of the shop (a team member resolves to the owner). */
export interface PriceBookActor {
  id: string;
  actingUserId?: string | null;
  actorKind?: 'ORGANIZER' | 'TEAM_MEMBER';
}

export interface PriceBookControllerDeps {
  db: PriceBookDb;
  /** The environment object (process.env in production). Read at call time, never copied. */
  env: EnvLike;
  now: () => Date;
  /** Organizer or team member. Returns null after answering the request itself (401/403/404 style answers). */
  resolveActor: (req: PbRequest, res: Response) => Promise<PriceBookActor | null>;
  /** Card run dependencies: intake batch lookup, the price change hook, the card minimum, test providers. */
  run: RunDeps;
  /** Lot run dependencies bound to one organizer (the real updateBulkLot with the database and organizer already applied). */
  lotDeps: (organizerId: string) => LotRunDeps;
  /** Matches import rows to catalog printings. Optional: without it every row is saved as a typed card. */
  resolvePrintings?: PrintingResolver | null;
}

interface Call {
  req: PbRequest;
  res: Response;
  ctx: ServiceCtx;
  actor: PriceBookActor;
}

// ---------------------------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------------------------

const SERVER_ERROR_TEXT = 'Something went wrong. Try again in a moment.';
const VALIDATION_TEXT = 'Some of what you sent is not valid. Check it and try again.';
const FORBIDDEN_TEXT = 'Organizer access required.';
const MAX_ID_LENGTH = 100;
const LOT_PAGE = 500;

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, status: number, error: string, code: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ success: false, error, code, ...(extra ?? {}) });
}

/** The fields the client reads from one apply call, flat and again inside summary. */
export function applyView(s: ApplySummary): Record<string, unknown> {
  const flat = {
    runId: s.runId,
    status: s.status,
    applied: s.applied,
    appliedThisCall: s.appliedThisCall,
    remaining: s.remaining,
    changedSince: s.changedSincePreview,
    changedSincePreview: s.changedSincePreview,
    lockedSincePreview: s.lockedSincePreview,
    failed: s.failed,
    message: s.message,
  };
  return { ...flat, summary: { ...flat } };
}

/** Undo reports APPLYING while rows remain (the client loop is shared with apply); rawStatus keeps the service word. */
export function undoView(s: UndoSummary): Record<string, unknown> {
  const status = s.status === 'UNDOING' ? 'APPLYING' : s.status;
  const flat = {
    runId: s.runId,
    status,
    rawStatus: s.status,
    undone: s.undone,
    undoneThisCall: s.undoneThisCall,
    undoSkipped: s.undoSkipped,
    remaining: s.remaining,
    message: s.message,
  };
  return { ...flat, summary: { ...flat } };
}

function isApplySummary(v: unknown): v is ApplySummary {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.status === 'string' && typeof r.applied === 'number' && typeof r.remaining === 'number' && typeof r.changedSincePreview === 'number';
}

const RESERVED_BODY_KEYS = new Set(['success', 'error', 'code']);

/** Extra body fields for an error: the service details, flattened (a details code becomes reason), never overriding the envelope. */
function extraFor(code: string, details: unknown): Record<string, unknown> {
  if (code === 'ALREADY_APPLIED' && isApplySummary(details)) return applyView(details);
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
    if (RESERVED_BODY_KEYS.has(k)) {
      if (k === 'code' && typeof v === 'string') out.reason = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function sendError(res: Response, err: unknown, where: string): void {
  if (res.headersSent) return;
  if (isPriceBookError(err)) {
    fail(res, err.status, err.message, err.code, extraFor(err.code, err.details));
    return;
  }
  console.error(`[priceBook] ${where} error:`, err);
  fail(res, 500, SERVER_ERROR_TEXT, 'SERVER_ERROR');
}

// ---------------------------------------------------------------------------------------------
// Strict request bodies (zod). Unknown keys are refused; the services validate the values again.
// ---------------------------------------------------------------------------------------------

const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();
const str = (max: number) => z.string().max(max);
const idString = str(MAX_ID_LENGTH);
const moneyValue = z.union([z.number(), str(30)]);
const looseScalar = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

const typedCardSchema = z
  .object({ setCode: opt(str(60)), collectorNumber: opt(str(60)), cardName: opt(str(200)), setName: opt(str(200)), rarity: opt(str(60)) })
  .strict();

const bookShape: z.ZodRawShape = {
  enabled: z.boolean().optional(),
  allowCatalogReference: z.boolean().optional(),
  referenceOrder: z.array(str(40)).max(10).optional(),
  defaultRoundingMode: str(40).optional(),
  defaultRoundingDirection: str(40).optional(),
  ifVersion: z.number().int().min(1).optional(),
};
for (const key of Object.keys(INT_SETTINGS)) bookShape[key] = z.number().nullable().optional();
const bookBodySchema = z.object(bookShape).strict();

const templateBodySchema = z.object({ template: z.enum(['RETAIL_STARTER', 'BUYLIST_STARTER']) }).strict();

const RULE_FIELD_KEYS = [
  'game', 'setCode', 'rarityClass', 'rarityText', 'finish', 'language', 'variantToken', 'refMinCents', 'refMaxCents', 'basis',
  'percentBps', 'addCents', 'fixedCents', 'floorCents', 'ceilingCents', 'minMarginBps', 'roundingMode', 'roundingDirection',
  'creditBps', 'minOfferCents',
] as const;
const ruleShape: z.ZodRawShape = {
  family: z.enum(['RETAIL', 'BUYLIST']).optional(),
  name: str(200),
  enabled: z.boolean().optional(),
  ifVersion: z.number().int().min(1).optional(),
  sourceKinds: z.array(str(40)).max(10).optional(),
};
for (const key of RULE_FIELD_KEYS) ruleShape[key] = looseScalar.optional();
const ruleBodySchema = z.object(ruleShape).strict();

const reorderBodySchema = z.object({ family: z.enum(['RETAIL', 'BUYLIST']), ids: z.array(idString).max(500) }).strict();

const referenceBodySchema = z
  .object({
    printingId: opt(idString),
    typed: opt(typedCardSchema),
    game: opt(str(30)),
    finish: str(30),
    language: opt(str(20)),
    price: moneyValue,
    note: opt(str(1000)),
    asOf: opt(str(40)),
  })
  .strict();

const fromStockBodySchema = z.object({ saleId: opt(idString), game: opt(str(30)), overwrite: z.boolean().optional() }).strict();

const importBodySchema = z
  .object({
    csvText: opt(z.string()),
    rows: opt(z.array(z.record(z.union([z.string(), z.number(), z.null()]))).max(5000)),
    dryRun: z.boolean(),
    defaultGame: opt(str(30)),
  })
  .strict();
const importFieldsSchema = z.object({ dryRun: z.enum(['true', 'false', '1', '0']), defaultGame: opt(str(30)) }).strict();

const benchmarkBodySchema = z
  .object({ game: str(30), rarityClass: str(30), finish: str(30), price: moneyValue, note: opt(str(1000)), asOf: opt(str(40)) })
  .strict();

const rateRowSchema = z
  .object({
    direction: str(10),
    tier: str(30),
    finish: opt(str(30)),
    unit: str(20),
    price: z.union([z.number(), str(30), z.null()]),
    creditPrice: opt(moneyValue),
    benchmarkNote: opt(str(1000)),
    benchmarkPrice: opt(moneyValue),
    benchmarkAsOf: opt(str(40)),
  })
  .strict();
const ratesBodySchema = z
  .object({ game: str(30), rates: z.array(rateRowSchema).max(MAX_RATE_ROWS), ifVersion: z.number().int().min(1).optional(), dryRun: z.boolean().optional() })
  .strict();

const adjustBodySchema = z
  .object({
    game: str(30),
    finish: opt(str(30)),
    direction: z.enum(['SELL', 'BUY']),
    percent: z.number().min(-90).max(500),
    apply: z.boolean().optional(),
    ifVersion: z.number().int().min(1).optional(),
  })
  .strict();

const bulkQuoteBodySchema = z
  .object({
    game: str(30),
    lines: z.array(z.object({ tier: str(30), finish: opt(str(30)), cards: z.number().int().min(1).max(MAX_BULK_CARDS) }).strict()).min(1).max(50),
  })
  .strict();

const suggestCardSchema = z
  .object({
    ref: opt(str(100)),
    itemId: opt(idString),
    printingId: opt(idString),
    game: opt(str(30)),
    finish: opt(str(30)),
    conditionCode: opt(str(10)),
    language: opt(str(20)),
    quantity: opt(z.number().int().min(1).max(100000)),
    typed: opt(typedCardSchema),
  })
  .strict();
const suggestBodySchema = z.object({ family: z.enum(['RETAIL', 'BUYLIST']), cards: z.array(suggestCardSchema).min(1).max(MAX_SUGGEST_CARDS) }).strict();
const quoteBodySchema = z.object({ cards: z.array(suggestCardSchema).min(1).max(MAX_SUGGEST_CARDS) }).strict();

const lockBodySchema = z.object({ locked: z.boolean(), until: opt(str(40)) }).strict();

const runScopeSchema = z
  .object({
    saleId: opt(idString),
    game: opt(str(30)),
    setCode: opt(str(60)),
    rarityClass: opt(str(30)),
    finish: opt(str(30)),
    onlyUnpriced: z.boolean().optional(),
    intakeBatchId: opt(idString),
  })
  .strict();
const previewBodySchema = z
  .object({ kind: z.enum(['BULK', 'LOT']), scope: opt(runScopeSchema), includeMarkedDown: z.boolean().optional(), includeEbayLive: z.boolean().optional() })
  .strict();
const selectionBodySchema = z
  .object({
    selectIds: z.array(idString).max(1000).optional(),
    deselectIds: z.array(idString).max(1000).optional(),
    selectAllChanges: z.boolean().optional(),
    selectReview: z.boolean().optional(),
  })
  .strict();
const applyBodySchema = z.object({ ifBookVersion: z.number().int().min(1), expectedCount: z.number().int().min(0) }).strict();
const emptyBodySchema = z.object({}).strict();

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body === undefined || body === null ? {} : body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new PriceBookError('VALIDATION', VALIDATION_TEXT, 400, { issues });
  }
  return parsed.data;
}

function queryString(req: Request, name: string): string | undefined {
  const v = req.query[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw validationError(`${name} must be text.`, { field: name });
  const t = v.trim();
  return t === '' ? undefined : t;
}

function idParam(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) throw notFoundError();
  return value;
}

/** Dollars from the client (number or text) to integer cents with the strict two decimal parser. */
function moneyField(value: unknown, field: string): number {
  const cents = parseMoneyToCents(value);
  if (cents === null) throw validationError('That amount is not valid. Use dollars and cents, for example 12.50.', { field });
  return cents;
}

function optionalMoney(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return moneyField(value, field);
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

function omitBook<T extends object>(row: T): Omit<T, 'bookId'> {
  const copy = { ...(row as Record<string, unknown>) };
  delete copy.bookId;
  return copy as Omit<T, 'bookId'>;
}

function entries(codes: readonly string[], labels?: Record<string, string>): Array<{ code: string; label: string }> {
  return codes.map((code) => ({ code, label: labels?.[code] ?? code }));
}

/** The vocabulary the screens read: singular keys with { code, label } entries, plus the plural lists of the services. */
export function buildVocabulary(): Record<string, unknown> {
  const v = PRICE_BOOK_VOCABULARY;
  return {
    ...v,
    family: entries(v.families),
    referenceKind: entries(v.referenceKinds, SOURCE_LABELS),
    priceSource: entries(v.priceSources, SOURCE_LABELS),
    basis: entries(v.bases),
    rarityClass: entries(v.rarityClasses),
    finish: entries(v.finishesOrAny, FINISH_LABELS),
    variantToken: entries(v.variantTokens),
    conditionCode: entries(v.conditionCodes, CONDITION_LABELS),
    roundingMode: entries(v.roundingModes, ROUNDING_NAMES),
    roundingDirection: entries(v.roundingDirections, ROUNDING_DIRECTION_NAMES),
    tier: entries(v.tiers, TIER_LABELS),
    unit: entries(v.units, UNIT_LABELS),
    direction: entries(v.directions, DIRECTION_LABELS),
    runKind: entries(v.runKinds),
  };
}

export function buildLimits(env: EnvLike): Record<string, number> {
  const cfg = getPriceBookConfig(env);
  return {
    undoDays: cfg.undoDays,
    previewMinutes: cfg.previewMinutes,
    maxRunItems: cfg.maxRunItems,
    historyDays: cfg.historyDays,
    suggestMaxCards: MAX_SUGGEST_CARDS,
    referencesPageMax: 100,
    runItemsPageMax: 200,
    bulkRatesMaxRows: MAX_RATE_ROWS,
    rulesMaxPerFamily: 100,
    noteMaxChars: MAX_NOTE_LENGTH,
    importMaxRows: 5000,
    importMaxBytes: MAX_IMPORT_BYTES,
  };
}

/** One suggestion row in the shape of ADR-140 section 10.1. A failure carries only the facts the client may show. */
export function suggestionView(row: SuggestRow): Record<string, unknown> {
  const s = row.suggestion;
  if (!s.ok || s.priceCents === null) {
    return { ref: row.ref, itemId: row.itemId, ok: false, code: s.code ?? 'INVALID_INPUT', priceCents: null, price: null, applyAllowed: false, why: s.why };
  }
  return { ref: row.ref, itemId: row.itemId, ...s, price: s.priceCents / 100, currency: 'USD', card: row.card };
}

// ---------------------------------------------------------------------------------------------
// Catalog printing resolver (the import's PrintingResolver), built over injected catalog functions
// ---------------------------------------------------------------------------------------------

export interface CatalogResolveRef {
  ref: string;
  game: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  name?: string | null;
  language?: string | null;
  finish?: string | null;
}

export interface CatalogResolveResult {
  ref: string;
  status: 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';
  candidates: Array<{
    id: string;
    source?: string | null;
    game: string;
    name: string;
    setCode: string;
    setName?: string | null;
    collectorNumber?: string | null;
    language?: string | null;
    rarity?: string | null;
    finishes?: string[];
  }>;
}

export interface CatalogResolveIo {
  /** The games the catalog is ready to answer for (a game that is not served answers UNMATCHED, with no query). */
  readyGames: () => Promise<string[]>;
  isCatalogGame: (game: string) => boolean;
  /** At most 500 refs per call (cardCatalogLookup.RESOLVE_MAX_REFS). */
  resolve: (refs: CatalogResolveRef[]) => Promise<CatalogResolveResult[]>;
}

export const CATALOG_RESOLVE_GROUP = 500;

/** Wraps the catalog resolver. Candidates keep only the identity fields: the price block of a printing never reaches the price book. */
export function createCatalogPrintingResolver(io: CatalogResolveIo): PrintingResolver {
  return async (refs: PrintingResolveRef[]): Promise<PrintingResolveResult[]> => {
    const ready = await io.readyGames();
    const servable = refs.filter((r) => io.isCatalogGame(r.game) && ready.includes(r.game));
    const answered = new Map<string, PrintingResolveResult>();
    for (const part of chunk(servable, CATALOG_RESOLVE_GROUP)) {
      const results = await io.resolve(
        part.map((r) => ({
          ref: r.ref,
          game: r.game,
          setCode: r.setCode ?? null,
          collectorNumber: r.collectorNumber ?? null,
          name: r.name ?? null,
          language: r.language ?? null,
          finish: r.finish ?? null,
        }))
      );
      for (const res of results) {
        const candidates: PrintingResolveCandidate[] = res.candidates.map((c) => ({
          id: c.id,
          source: c.source ?? null,
          game: c.game,
          name: c.name,
          setCode: c.setCode,
          setName: c.setName ?? null,
          collectorNumber: c.collectorNumber ?? null,
          language: c.language ?? null,
          rarity: c.rarity ?? null,
          finishes: Array.isArray(c.finishes) ? [...c.finishes] : [],
        }));
        answered.set(res.ref, { ref: res.ref, status: res.status, candidates });
      }
    }
    return refs.map((r) => answered.get(r.ref) ?? { ref: r.ref, status: 'UNMATCHED' as const, candidates: [] });
  };
}

// ---------------------------------------------------------------------------------------------
// After a price change: the effects that are not item columns (same helpers and order as itemController.updateItem)
// ---------------------------------------------------------------------------------------------

export interface PriceChangedItem {
  id: string;
  organizerId: string | null;
  saleId: string | null;
  title: string | null;
  ebayOfferId: string | null;
  ebayListingId: string | null;
  ebayCategoryId: string | null;
  ebaySyncHeldAt: Date | null;
  ebayContentDirtyAt: Date | null;
}

export interface PriceChangedIo {
  loadItem: (itemId: string) => Promise<PriceChangedItem | null>;
  /** pushItemToEbay with trigger SAVE. hold true records a held attempt and makes no eBay call. */
  pushToEbay: (args: { itemId: string; organizerId: string; fields: string[]; hold: boolean; dirtyBefore: Date | null }) => Promise<unknown>;
  /** notifyPriceDropAlerts(itemId, oldPrice, newPrice). */
  notifyPriceDrop: (itemId: string, oldPrice: number | null, newPrice: number | null) => Promise<unknown>;
  /** The live sale feed event (PRICE_DROP). */
  emitPriceDropEvent: (item: PriceChangedItem, newPrice: number) => void;
  /** updateShopifyProductFields(itemId, { price }). */
  pushToShopify: (itemId: string, price: number) => Promise<unknown>;
  invalidateCommandCenter: (organizerId: string) => Promise<unknown>;
  isPinnedCardCategory: (categoryId: string | null) => boolean;
  /** standardEnvelopePriceCrossing(before, after). */
  envelopeCrossing: (before: number | null, after: number | null) => boolean;
  warn: (message: string, err: unknown) => void;
}

export type PriceChangedHook = ((change: PriceChange) => void) & { idle: () => Promise<void> };

/**
 * RunDeps.onPriceChanged. Reproduces what itemController.updateItem does after a price change besides the item columns
 * (priceWriteService already wrote those): the immediate eBay push (held items record a held attempt), the Standard Envelope
 * shipping resync for a card that crosses 20 dollars, the price drop alert and live feed event, the Shopify price and the
 * command center cache. Best effort: every step is guarded and logged, nothing throws, and the run never waits for it. The
 * work is queued and runs one change at a time, so a 200 row apply cannot open 200 marketplace calls at once.
 */
export function createPriceChangedHook(io: PriceChangedIo): PriceChangedHook {
  let tail: Promise<void> = Promise.resolve();

  const step = async (label: string, change: PriceChange, fn: () => Promise<unknown> | void): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      io.warn(`[priceBook] ${label} failed for item ${change.itemId}:`, err);
    }
  };

  const work = async (change: PriceChange): Promise<void> => {
    let item: PriceChangedItem | null = null;
    try {
      item = await io.loadItem(change.itemId);
    } catch (err) {
      io.warn(`[priceBook] could not read item ${change.itemId} after a price change:`, err);
      return;
    }
    if (!item || item.organizerId !== change.organizerId) return;
    const found = item;

    if (found.ebayOfferId || found.ebayListingId) {
      const fields = ['price'];
      if (io.isPinnedCardCategory(found.ebayCategoryId) && io.envelopeCrossing(change.oldPrice, change.newPrice)) fields.push('shipping');
      const held = found.ebaySyncHeldAt !== null && found.ebaySyncHeldAt !== undefined;
      if (held) {
        await step('eBay held record', change, () =>
          io.pushToEbay({ itemId: found.id, organizerId: change.organizerId, fields, hold: true, dirtyBefore: found.ebayContentDirtyAt ?? null })
        );
      } else if (found.ebayOfferId) {
        await step('eBay push', change, () =>
          io.pushToEbay({ itemId: found.id, organizerId: change.organizerId, fields, hold: false, dirtyBefore: found.ebayContentDirtyAt ?? null })
        );
      }
    }

    const dropped = change.oldPrice !== null && change.newPrice !== null && change.newPrice < change.oldPrice;
    if (dropped) {
      await step('price drop alert', change, () => io.notifyPriceDrop(change.itemId, change.oldPrice, change.newPrice));
      if (found.saleId && change.newPrice !== null) {
        const newPrice = change.newPrice;
        await step('live feed event', change, () => io.emitPriceDropEvent(found, newPrice));
      }
    }

    if (change.newPrice !== null && change.newPrice !== change.oldPrice) {
      const price = change.newPrice;
      await step('Shopify price', change, () => io.pushToShopify(change.itemId, price));
    }
    await step('command center cache', change, () => io.invalidateCommandCenter(change.organizerId));
  };

  const hook = ((change: PriceChange): void => {
    tail = tail.then(() => work(change)).catch((err) => io.warn('[priceBook] price change effects failed:', err));
  }) as PriceChangedHook;
  hook.idle = () => tail;
  return hook;
}

// ---------------------------------------------------------------------------------------------
// The handlers
// ---------------------------------------------------------------------------------------------

function toInt(text: string, field: string): number {
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw validationError(`${field} must be a whole number.`, { field });
  return n;
}

function lotScope(scope: z.infer<typeof runScopeSchema> | null | undefined): { saleId?: string | null } {
  if (!scope) return {};
  for (const key of ['game', 'setCode', 'rarityClass', 'finish', 'intakeBatchId'] as const) {
    const v = scope[key];
    if (v !== null && v !== undefined && v !== '') throw validationError('A lot run can be limited by sale only.', { field: key });
  }
  if (scope.onlyUnpriced === true) throw validationError('A lot run can be limited by sale only.', { field: 'onlyUnpriced' });
  return { saleId: scope.saleId ?? null };
}

export function createPriceBookHandlers(deps: PriceBookControllerDeps) {
  const enabled = (): boolean => isPriceBookEnabled(deps.env);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 5, parts: 8 } });

  function disabled(res: Response): void {
    fail(res, 404, COPY.disabled, 'PRICE_BOOK_DISABLED');
  }

  /** The first middleware of every route but GET /status. */
  function flagGate(_req: Request, res: Response, next: NextFunction): void {
    if (enabled()) {
      next();
      return;
    }
    disabled(res);
  }

  function ctxFor(actor: PriceBookActor, req: PbRequest): ServiceCtx {
    return { db: deps.db, organizerId: actor.id, now: deps.now(), env: deps.env, userId: actor.actingUserId ?? req.user?.id ?? null };
  }

  /**
   * Wraps one handler: the flag (again, so a router that forgot the gate still answers 404), the actor, the owner rule for
   * writes (a team member is refused on everything but the read routes), the service context and the error mapping.
   */
  function handle(name: string, mode: 'read' | 'owner', fn: (call: Call) => Promise<void>) {
    return async (req: PbRequest, res: Response): Promise<void> => {
      try {
        if (!enabled()) {
          disabled(res);
          return;
        }
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        if (mode === 'owner' && actor.actorKind === 'TEAM_MEMBER') {
          fail(res, 403, FORBIDDEN_TEXT, 'FORBIDDEN');
          return;
        }
        await fn({ req, res, ctx: ctxFor(actor, req), actor });
      } catch (err) {
        sendError(res, err, name);
      }
    };
  }

  const minCardSale = (): { minCardSaleCents?: number } => (deps.run.minCardSaleCents !== undefined ? { minCardSaleCents: deps.run.minCardSaleCents } : {});
  const testProviders = (): { providers?: NonNullable<RunDeps['providers']> } => (deps.run.providers ? { providers: deps.run.providers } : {});

  // ---- status, book, templates ------------------------------------------------------------

  /** Open to any signed in user: platform facts only. The shop's own book facts are added when the caller resolves to a shop. */
  async function hStatus(req: PbRequest, res: Response): Promise<void> {
    try {
      const cfg = getPriceBookConfig(deps.env);
      let book: Awaited<ReturnType<typeof findBook>> = null;
      if (cfg.enabled) {
        const quiet: any = {};
        quiet.status = () => quiet;
        quiet.json = () => quiet;
        const actor = await deps.resolveActor(req, quiet as Response);
        if (actor) book = await findBook(deps.db, actor.id);
      }
      ok(res, {
        enabled: cfg.enabled,
        bookExists: book !== null,
        bookEnabled: book !== null && book.enabled === true,
        catalogReference: { platformOn: cfg.catalogReferenceEnabled, bookOptedIn: book !== null && book.allowCatalogReference === true },
        limits: buildLimits(deps.env),
        vocabulary: buildVocabulary(),
      });
    } catch (err) {
      sendError(res, err, 'status');
    }
  }

  const hGetBook = handle('getBook', 'read', async ({ ctx, res }) => {
    const { book, counts } = await getBookWithCounts(ctx);
    ok(res, { book: book ? { ...book, counts } : null, counts });
  });

  const hPutBook = handle('putBook', 'owner', async ({ ctx, req, res }) => {
    const { ifVersion, ...patch } = parseBody(bookBodySchema, req.body);
    const result = await upsertBook(ctx, patch, ifVersion);
    const full = await getBookWithCounts(ctx);
    ok(res, { book: { ...(full.book ?? result.book), counts: full.counts }, created: result.created, changed: result.changed, counts: full.counts }, result.created ? 201 : 200);
  });

  const hApplyTemplate = handle('applyTemplate', 'owner', async ({ ctx, req, res }) => {
    const { template } = parseBody(templateBodySchema, req.body);
    const result = await applyTemplate(ctx, template);
    ok(res, { label: result.label, rules: result.rules.map(omitBook) }, 201);
  });

  // ---- rules ------------------------------------------------------------------------------

  const hListRules = handle('listRules', 'owner', async ({ ctx, req, res }) => {
    const rows = await listRules(ctx, queryString(req, 'family'));
    ok(res, { rules: rows.map(omitBook) });
  });

  const hCreateRule = handle('createRule', 'owner', async ({ ctx, req, res }) => {
    const { ifVersion, ...rule } = parseBody(ruleBodySchema, req.body);
    if (ifVersion !== undefined) throw validationError('ifVersion is for changing a rule, not adding one.', { field: 'ifVersion' });
    ok(res, { rule: omitBook(await createRule(ctx, rule)) }, 201);
  });

  const hUpdateRule = handle('updateRule', 'owner', async ({ ctx, req, res }) => {
    const id = idParam(req.params.id);
    const { family, ifVersion, ...fields } = parseBody(ruleBodySchema, req.body);
    const existing = (await listRules(ctx)).find((r) => r.id === id);
    if (!existing) throw notFoundError();
    if (family !== undefined && family !== existing.family) throw validationError('A rule cannot move to the other list.', { field: 'family' });
    ok(res, { rule: omitBook(await updateRule(ctx, id, fields, ifVersion)) });
  });

  const hDeleteRule = handle('deleteRule', 'owner', async ({ ctx, req, res }) => {
    await deleteRule(ctx, idParam(req.params.id));
    ok(res, { deleted: true });
  });

  const hReorderRules = handle('reorderRules', 'owner', async ({ ctx, req, res }) => {
    const { family, ids } = parseBody(reorderBodySchema, req.body);
    ok(res, { rules: (await reorderRules(ctx, family, ids)).map(omitBook) });
  });

  // ---- references -------------------------------------------------------------------------

  const referenceView = (row: { valueCents: number }): Record<string, unknown> => ({ ...omitBook(row), price: row.valueCents / 100 });

  const hListReferences = handle('listReferences', 'owner', async ({ ctx, req, res }) => {
    const limit = queryString(req, 'limit');
    const olderThan = queryString(req, 'olderThanDays');
    const game = queryString(req, 'game');
    const q = queryString(req, 'q');
    const cursor = queryString(req, 'cursor');
    const page = await listReferences(ctx, {
      ...(game !== undefined ? { game } : {}),
      ...(q !== undefined ? { q } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit: toInt(limit, 'limit') } : {}),
      ...(olderThan !== undefined ? { olderThanDays: toInt(olderThan, 'olderThanDays') } : {}),
    });
    ok(res, { references: page.rows.map(referenceView), nextCursor: page.nextCursor });
  });

  const hPutReference = handle('putReference', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(referenceBodySchema, req.body);
    const valueCents = moneyField(body.price, 'price');
    // The client sends game next to typed; the service wants it inside typed. A catalog card carries its own game.
    const typed = body.typed ? { ...body.typed, game: body.game ?? '' } : null;
    const { reference, created } = await upsertReference(ctx, {
      printingId: body.printingId ?? null,
      typed,
      finish: body.finish,
      language: body.language ?? null,
      valueCents,
      note: body.note ?? null,
      asOf: body.asOf ?? null,
    });
    ok(res, { reference: referenceView(reference), created }, created ? 201 : 200);
  });

  const hDeleteReference = handle('deleteReference', 'owner', async ({ ctx, req, res }) => {
    await deleteReference(ctx, idParam(req.params.id));
    ok(res, { deleted: true });
  });

  const hFromStock = handle('referencesFromStock', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(fromStockBodySchema, req.body);
    const result = await referencesFromStock(ctx, { saleId: body.saleId ?? null, game: body.game ?? null, overwrite: body.overwrite === true });
    const skipped = Object.values(result.skipped).reduce((sum, n) => sum + n, 0);
    // skipped is the total (the screen reads a number); the per reason counts stay available as skippedDetail.
    ok(res, { ...result, skipped, skippedDetail: result.skipped });
  });

  /** Optional multipart upload for the import (one file, memory, 2 MB). A JSON request passes straight through. */
  function importUpload(req: Request, res: Response, next: NextFunction): void {
    upload.single('file')(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') fail(res, 400, 'This file is too large. The limit is 2 MB.', 'VALIDATION', { reason: 'FILE_TOO_LARGE' });
      else fail(res, 400, VALIDATION_TEXT, 'VALIDATION');
    });
  }

  const hImport = handle('importReferences', 'owner', async ({ ctx, req, res }) => {
    let csvText: string | null = null;
    let rows: Array<Record<string, string | number | null>> | null = null;
    let dryRun: boolean;
    let defaultGame: string | null = null;
    if (req.file) {
      const fields = parseBody(importFieldsSchema, req.body);
      csvText = req.file.buffer.toString('utf8');
      dryRun = fields.dryRun === 'true' || fields.dryRun === '1';
      defaultGame = fields.defaultGame ?? null;
    } else {
      const body = parseBody(importBodySchema, req.body);
      csvText = body.csvText ?? null;
      rows = body.rows ?? null;
      dryRun = body.dryRun;
      defaultGame = body.defaultGame ?? null;
    }
    const summary = await importReferences(ctx, { csvText, rows, dryRun, defaultGame, resolver: deps.resolvePrintings ?? null });
    ok(res, { ...summary, created: summary.saved ? summary.willCreate : 0, updated: summary.saved ? summary.willUpdate : 0 });
  });

  // ---- benchmarks -------------------------------------------------------------------------

  const benchmarkView = (row: { valueCents: number }): Record<string, unknown> => ({ ...omitBook(row), price: row.valueCents / 100 });

  const hListBenchmarks = handle('listBenchmarks', 'owner', async ({ ctx, res }) => {
    ok(res, { benchmarks: (await listBenchmarks(ctx)).map(benchmarkView) });
  });

  const hPutBenchmark = handle('putBenchmark', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(benchmarkBodySchema, req.body);
    const { benchmark, created } = await upsertBenchmark(ctx, {
      game: body.game,
      rarityClass: body.rarityClass,
      finish: body.finish,
      valueCents: moneyField(body.price, 'price'),
      note: body.note ?? null,
      asOf: body.asOf ?? null,
    });
    ok(res, { benchmark: benchmarkView(benchmark), created }, created ? 201 : 200);
  });

  const hDeleteBenchmark = handle('deleteBenchmark', 'owner', async ({ ctx, req, res }) => {
    await deleteBenchmark(ctx, idParam(req.params.id));
    ok(res, { deleted: true });
  });

  // ---- bulk rate card ---------------------------------------------------------------------

  function knownGame(raw: string): string {
    const game = raw.trim().toUpperCase();
    if (!KNOWN_GAMES.includes(game)) throw validationError('That game is not known.', { field: 'game' });
    return game;
  }

  const hGetBulkRates = handle('getBulkRates', 'owner', async ({ ctx, req, res }) => {
    const raw = queryString(req, 'game');
    const game = raw === undefined ? undefined : knownGame(raw);
    const book = await findBook(ctx.db, ctx.organizerId);
    const rows = await listBulkRates(ctx, game);
    const rates = rows.map(toBulkRate);
    // The lots of this organizer next to the rate card price each would get, so the screen can show the gap.
    const lotRows = await ctx.db.itemBulkLot.findMany({
      where: { organizerId: ctx.organizerId, ...(game !== undefined ? { game } : {}) },
      orderBy: { itemId: 'asc' },
      take: LOT_PAGE,
    });
    const ids = lotRows.map((l) => l.itemId);
    const items = ids.length === 0 ? [] : await ctx.db.item.findMany({ where: { id: { in: ids }, organizerId: ctx.organizerId, deletedAt: null, status: { in: ['AVAILABLE', 'RESERVED'] } }, select: { id: true, title: true, price: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const lots = lotRows
      .filter((l) => byId.has(l.itemId))
      .map((l) => {
        const item = byId.get(l.itemId);
        return {
          itemId: l.itemId,
          title: item ? item.title : '',
          lotKind: l.lotKind,
          currentPerThousandCents: item ? dollarsToCents(item.price) : null,
          rateCardPerThousandCents: lotPricePerThousandCents(rates, { game: l.game, lotKind: l.lotKind }),
        };
      });
    ok(res, { rates: rows.map(omitBook), lots, version: book ? book.version : null });
  });

  const hPutBulkRates = handle('putBulkRates', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(ratesBodySchema, req.body);
    const rates = body.rates.map((r) => ({
      direction: r.direction,
      tier: r.tier,
      finish: r.finish ?? 'ANY',
      unit: r.unit,
      rateCents: r.price === null ? null : moneyField(r.price, 'price'),
      creditRateCents: optionalMoney(r.creditPrice, 'creditPrice'),
      benchmarkNote: r.benchmarkNote,
      benchmarkRateCents: optionalMoney(r.benchmarkPrice, 'benchmarkPrice'),
      benchmarkAsOf: r.benchmarkAsOf,
    }));
    ok(res, await saveBulkRates(ctx, { game: body.game, rates, ...(body.ifVersion !== undefined ? { ifVersion: body.ifVersion } : {}), dryRun: body.dryRun === true }));
  });

  const hAdjustBulkRates = handle('adjustBulkRates', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(adjustBodySchema, req.body);
    ok(
      res,
      await adjustBulkRates(ctx, {
        game: body.game,
        finish: body.finish ?? null,
        direction: body.direction,
        percentBps: Math.round(body.percent * 100),
        apply: body.apply === true,
        ...(body.ifVersion !== undefined ? { ifVersion: body.ifVersion } : {}),
      })
    );
  });

  // ---- suggestions and quotes (they answer only while the shop's own switch is on) ----------

  async function priceCards(ctx: ServiceCtx, family: 'RETAIL' | 'BUYLIST', cards: unknown): Promise<Record<string, unknown>> {
    await requireUsableBook(ctx);
    const out = await suggest(ctx, cards, { family, ...minCardSale(), ...testProviders() });
    return { bookVersion: out.bookVersion, results: out.results.map(suggestionView), unavailable: out.unavailable };
  }

  const hSuggest = handle('suggest', 'read', async ({ ctx, req, res }) => {
    const body = parseBody(suggestBodySchema, req.body);
    ok(res, await priceCards(ctx, body.family, body.cards));
  });

  const hBuylistQuote = handle('buylistQuote', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(quoteBodySchema, req.body);
    ok(res, await priceCards(ctx, 'BUYLIST', body.cards));
  });

  const hBuylistBulkQuote = handle('buylistBulkQuote', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(bulkQuoteBodySchema, req.body);
    const game = knownGame(body.game);
    const book = await requireUsableBook(ctx);
    const rates = (await loadBulkRates(ctx.db, book.id, game)).map(toBulkRate);
    const result = quoteBulkBuy(
      rates,
      { buyCreditBps: toBookSettings(book).buyCreditBps },
      body.lines.map((l) => ({ direction: 'BUY', game, tier: l.tier.trim().toUpperCase(), finish: (l.finish ?? 'ANY').trim().toUpperCase(), cards: l.cards }))
    );
    ok(res, { ...result, bookVersion: book.version });
  });

  // ---- locks ------------------------------------------------------------------------------

  const hPutLock = handle('putLock', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(lockBodySchema, req.body);
    ok(res, await setLock(ctx, idParam(req.params.itemId), { locked: body.locked, ...(body.until ? { until: body.until } : {}) }));
  });

  const hListLocks = handle('listLocks', 'owner', async ({ ctx, req, res }) => {
    ok(res, { locks: await listLocks(ctx, queryString(req, 'limit')) });
  });

  // ---- runs -------------------------------------------------------------------------------

  const hPreviewRun = handle('previewRun', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(previewBodySchema, req.body);
    if (body.kind === 'LOT') {
      ok(res, await previewLotRun(ctx, { kind: 'LOT', scope: lotScope(body.scope), includeMarkedDown: body.includeMarkedDown, includeEbayLive: body.includeEbayLive }));
      return;
    }
    ok(res, await previewRun(ctx, body, deps.run));
  });

  const hListRuns = handle('listRuns', 'owner', async ({ ctx, req, res }) => {
    ok(res, { runs: await listRuns(ctx, queryString(req, 'limit')) });
  });

  const hGetRun = handle('getRun', 'owner', async ({ ctx, req, res }) => {
    ok(res, { run: await getRun(ctx, idParam(req.params.id)) });
  });

  const hListRunItems = handle('listRunItems', 'owner', async ({ ctx, req, res }) => {
    const view = queryString(req, 'view');
    const cursor = queryString(req, 'cursor');
    const limit = queryString(req, 'limit');
    ok(res, await listRunItems(ctx, idParam(req.params.id), { ...(view !== undefined ? { view } : {}), ...(cursor !== undefined ? { cursor } : {}), ...(limit !== undefined ? { limit } : {}) }));
  });

  /** The client sends run item ids; the service filters by item id. Both kinds of id are accepted, only this run's rows count. */
  async function itemIdsOf(ctx: ServiceCtx, runId: string, ids: readonly string[] | undefined): Promise<string[]> {
    if (!ids || ids.length === 0) return [];
    const rows = await ctx.db.priceBookRunItem.findMany({ where: { runId, OR: [{ id: { in: [...ids] } }, { itemId: { in: [...ids] } }] }, select: { itemId: true } });
    return rows.map((r) => r.itemId);
  }

  const hPatchRunItems = handle('patchRunItems', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(selectionBodySchema, req.body);
    const run = await getRun(ctx, idParam(req.params.id));
    const selectIds = await itemIdsOf(ctx, run.id, body.selectIds);
    const deselectIds = await itemIdsOf(ctx, run.id, body.deselectIds);
    ok(
      res,
      await updateSelection(ctx, run.id, {
        ...(selectIds.length > 0 ? { selectIds } : {}),
        ...(deselectIds.length > 0 ? { deselectIds } : {}),
        ...(body.selectAllChanges !== undefined ? { selectAllChanges: body.selectAllChanges } : {}),
        ...(body.selectReview !== undefined ? { selectReview: body.selectReview } : {}),
      })
    );
  });

  const hApplyRun = handle('applyRun', 'owner', async ({ ctx, req, res }) => {
    const body = parseBody(applyBodySchema, req.body);
    const run = await getRun(ctx, idParam(req.params.id));
    const summary = run.kind === 'LOT' ? await applyLotRun(ctx, run.id, body, deps.lotDeps(ctx.organizerId)) : await applyRun(ctx, run.id, body, deps.run);
    ok(res, applyView(summary));
  });

  const hUndoRun = handle('undoRun', 'owner', async ({ ctx, req, res }) => {
    parseBody(emptyBodySchema, req.body);
    const run = await getRun(ctx, idParam(req.params.id));
    const summary = run.kind === 'LOT' ? await undoLotRun(ctx, run.id, deps.lotDeps(ctx.organizerId)) : await undoRun(ctx, run.id, deps.run);
    ok(res, undoView(summary));
  });

  const hCancelRun = handle('cancelRun', 'owner', async ({ ctx, req, res }) => {
    parseBody(emptyBodySchema, req.body);
    ok(res, { run: await cancelRun(ctx, idParam(req.params.id)) });
  });

  return {
    flagGate,
    importUpload,
    status: hStatus,
    getBook: hGetBook,
    putBook: hPutBook,
    applyTemplate: hApplyTemplate,
    listRules: hListRules,
    createRule: hCreateRule,
    updateRule: hUpdateRule,
    deleteRule: hDeleteRule,
    reorderRules: hReorderRules,
    listReferences: hListReferences,
    putReference: hPutReference,
    deleteReference: hDeleteReference,
    referencesFromStock: hFromStock,
    importReferences: hImport,
    listBenchmarks: hListBenchmarks,
    putBenchmark: hPutBenchmark,
    deleteBenchmark: hDeleteBenchmark,
    getBulkRates: hGetBulkRates,
    putBulkRates: hPutBulkRates,
    adjustBulkRates: hAdjustBulkRates,
    buylistQuote: hBuylistQuote,
    buylistBulkQuote: hBuylistBulkQuote,
    suggest: hSuggest,
    putLock: hPutLock,
    listLocks: hListLocks,
    previewRun: hPreviewRun,
    listRuns: hListRuns,
    getRun: hGetRun,
    listRunItems: hListRunItems,
    patchRunItems: hPatchRunItems,
    applyRun: hApplyRun,
    undoRun: hUndoRun,
    cancelRun: hCancelRun,
  };
}

export type PriceBookHandlers = ReturnType<typeof createPriceBookHandlers>;

/** Every key of the handlers object. A test pins this list to the keys the factory returns. */
export const PRICE_BOOK_HANDLER_NAMES = [
  'flagGate', 'importUpload', 'status', 'getBook', 'putBook', 'applyTemplate', 'listRules', 'createRule', 'updateRule', 'deleteRule',
  'reorderRules', 'listReferences', 'putReference', 'deleteReference', 'referencesFromStock', 'importReferences', 'listBenchmarks',
  'putBenchmark', 'deleteBenchmark', 'getBulkRates', 'putBulkRates', 'adjustBulkRates', 'buylistQuote', 'buylistBulkQuote', 'suggest',
  'putLock', 'listLocks', 'previewRun', 'listRuns', 'getRun', 'listRunItems', 'patchRunItems', 'applyRun', 'undoRun', 'cancelRun',
] as const;

// ---------------------------------------------------------------------------------------------
// Production wiring (everything that needs the database client, the marketplaces or the catalog is loaded here, on first use)
// ---------------------------------------------------------------------------------------------

type Loose = (...args: any[]) => any;

/** Turns the real Prisma client and the real helpers into the injected dependencies. Called once, on the first request. */
export function buildProductionDeps(): PriceBookControllerDeps {
  const { prisma } = require('../lib/prisma') as { prisma: any };
  const pos = require('../utils/posAuth') as { resolveOrganizerOrTeamMember: Loose };
  const bulk = require('../services/bulkLot/bulkLotService') as { updateBulkLot: Loose };
  const fees = require('../utils/feeCalculator') as { MIN_CARD_SALE_CENTS: number };
  const lookup = require('../services/cardCatalog/cardCatalogLookup') as { loadCatalogState: Loose; resolveRefs: Loose; isCatalogGame: Loose };
  const catalogStore = require('../services/cardCatalog/catalogStore') as { getCatalogDb: Loose };
  const ebay = require('../services/ebayItemPushService') as { pushItemToEbay: Loose };
  const alerts = require('../services/priceDropService') as { notifyPriceDropAlerts: Loose };
  const shopify = require('../services/shopifyService') as { updateShopifyProductFields: Loose };
  const commandCenter = require('../services/commandCenterService') as { invalidateCommandCenterCache: Loose };
  const feed = require('../services/liveFeedService') as { pushEvent: Loose };
  const socket = require('../lib/socket') as { getIO: Loose };
  const cardCategories = require('../config/cardEbayCategories') as { isPinnedCardCategoryId: Loose; standardEnvelopePriceCrossing: Loose };

  const db = asPriceBookDb(prisma);
  const env = process.env;

  const onPriceChanged = createPriceChangedHook({
    loadItem: (itemId) =>
      prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, organizerId: true, saleId: true, title: true, ebayOfferId: true, ebayListingId: true, ebayCategoryId: true, ebaySyncHeldAt: true, ebayContentDirtyAt: true },
      }),
    pushToEbay: ({ itemId, organizerId, fields, hold, dirtyBefore }) =>
      ebay.pushItemToEbay({ itemId, organizerId, trigger: 'SAVE', fields, ...(hold ? { hold: true } : { dirtyBefore }) }),
    notifyPriceDrop: (itemId, oldPrice, newPrice) => alerts.notifyPriceDropAlerts(itemId, oldPrice, newPrice),
    emitPriceDropEvent: (item, newPrice) => {
      feed.pushEvent(socket.getIO(), item.saleId, { type: 'PRICE_DROP', itemTitle: item.title, amount: newPrice, saleId: item.saleId, timestamp: new Date() });
    },
    pushToShopify: (itemId, price) => shopify.updateShopifyProductFields(itemId, { price }),
    invalidateCommandCenter: (organizerId) => commandCenter.invalidateCommandCenterCache(organizerId),
    isPinnedCardCategory: (categoryId) => Boolean(cardCategories.isPinnedCardCategoryId(categoryId)),
    envelopeCrossing: (before, after) => Boolean(cardCategories.standardEnvelopePriceCrossing(before, after)),
    warn: (message, err) => console.warn(message, err instanceof Error ? err.message : err),
  });

  const resolvePrintings = createCatalogPrintingResolver({
    readyGames: async () => {
      const state = (await lookup.loadCatalogState(catalogStore.getCatalogDb, env)) as { readyGames?: string[] };
      return Array.isArray(state.readyGames) ? state.readyGames : [];
    },
    isCatalogGame: (game) => Boolean(lookup.isCatalogGame(game)),
    resolve: (refs) => lookup.resolveRefs(refs, catalogStore.getCatalogDb(), env),
  });

  return {
    db,
    env,
    now: () => new Date(),
    resolveActor: (req, res) => pos.resolveOrganizerOrTeamMember(req, res, { requireStripe: false }),
    run: {
      minCardSaleCents: fees.MIN_CARD_SALE_CENTS,
      onPriceChanged,
      resolveIntakeBatch: async (organizerId, batchId) => {
        const batch = (await prisma.cardIntakeBatch.findFirst({ where: { id: batchId, organizerId }, select: { saleId: true, createdAt: true } })) as { saleId: string | null; createdAt: Date } | null;
        return batch ? { saleId: batch.saleId, createdAt: batch.createdAt } : null;
      },
    },
    // A lot price goes through the real updateBulkLot (dollars per 1,000), as bulkLotController.update does, with no extra effects.
    lotDeps: (organizerId) => ({ updateBulkLot: (itemId, input) => bulk.updateBulkLot(prisma, { organizerId }, itemId, input) }),
    resolvePrintings,
  };
}

let live: PriceBookHandlers | null = null;

function liveHandlers(): PriceBookHandlers {
  if (!live) live = createPriceBookHandlers(buildProductionDeps());
  return live;
}

function lazyHandlers(): PriceBookHandlers {
  const out: Record<string, unknown> = {};
  for (const name of PRICE_BOOK_HANDLER_NAMES) {
    out[name] = (...args: unknown[]) => (liveHandlers() as unknown as Record<string, Loose>)[name](...args);
  }
  return out as unknown as PriceBookHandlers;
}

/** The handlers bound to the shared Prisma client and process.env. Nothing is loaded until the first request. */
export const priceBookHandlers: PriceBookHandlers = lazyHandlers();
