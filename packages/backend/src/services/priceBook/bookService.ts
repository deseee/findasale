/**
 * The organizer's price book: the book row, its settings, its version, and its ordered rules (ADR-140 sections 4, 6 and 7).
 *
 * Version semantics (section 4.1): PriceBook.version starts at 1 and goes up by exactly 1 for every successful change to the
 * settings, the rules, the rate card or the benchmarks (the rate card and benchmark services call bumpBookVersion). A call
 * that changes nothing does not bump. Typed references and locks do not bump it. A run preview records the version it was
 * computed with, and an apply refuses with BOOK_CHANGED when the version has moved. PriceBook.updatedAt is maintained by the
 * database on every update to the row, so it moves together with the version.
 *
 * Optimistic concurrency: a settings or rule write may carry ifVersion; a stale value gives VERSION_CONFLICT. The write itself
 * is a compare-and-swap on the version, so two writers racing on the same version cannot both win.
 *
 * Tenant rule: the book is found from ctx.organizerId; every query below carries bookId; every write is updateMany or
 * deleteMany with bookId in the where clause.
 */
import {
  PriceBookError,
  isUniqueViolation,
  notFoundError,
  validationError,
  versionConflictError,
} from './db';
import type { BookRow, PriceBookTx, RuleRow, ServiceCtx } from './db';
import { starterBuylistRules, starterRetailRules } from './buylist';
import { COPY } from './messages';
import type { BookSettings, NewPriceRule, PriceRule } from './types';
import {
  BASES,
  DEFAULT_BOOK_SETTINGS,
  FINISHES_OR_ANY,
  REFERENCE_KINDS,
  RARITY_CLASSES,
  ROUNDING_DIRECTIONS,
  ROUNDING_MODES,
  VARIANT_TOKENS,
  isFamily,
} from './vocabulary';
import type { Family } from './vocabulary';
import { isPriceBookEnabled } from './config';

export const MAX_RULES_PER_FAMILY = 100;
export const MAX_NAME_LENGTH = 80;

// ---------------------------------------------------------------------------------------------
// Settings validation
// ---------------------------------------------------------------------------------------------

interface IntSpec {
  min: number;
  max: number;
  nullable?: boolean;
}

const MONEY_MAX = 100_000_000;

/** The integer settings and the ranges the migration's CHECK constraints enforce (ADR-140 section 4.2). */
export const INT_SETTINGS: Readonly<Record<string, IntSpec>> = {
  retailPercentBps: { min: 1, max: 100000 },
  defaultFloorCents: { min: 0, max: MONEY_MAX },
  defaultCeilingCents: { min: 0, max: MONEY_MAX, nullable: true },
  condNmBps: { min: 1, max: 20000 },
  condLpBps: { min: 1, max: 20000 },
  condMpBps: { min: 1, max: 20000 },
  condHpBps: { min: 1, max: 20000 },
  condDmgBps: { min: 1, max: 20000 },
  nonEnglishBps: { min: 1, max: 20000 },
  movementReviewBps: { min: 100, max: 100000 },
  referenceWarnDays: { min: 1, max: 3650 },
  referenceMaxDays: { min: 1, max: 3650 },
  soldHistoryMinSales: { min: 1, max: 20 },
  soldHistoryMaxSales: { min: 1, max: 50 },
  soldHistoryWindowDays: { min: 7, max: 1095 },
  manualLockDays: { min: 0, max: 365 },
  buyCreditBps: { min: 10000, max: 30000 },
};

const BOOLEAN_SETTINGS = ['enabled', 'allowCatalogReference'] as const;

/** The settings a caller may send. version, id, organizerId and the timestamps are server-owned. */
export const SETTING_KEYS: readonly string[] = [
  ...BOOLEAN_SETTINGS,
  'referenceOrder',
  'defaultRoundingMode',
  'defaultRoundingDirection',
  ...Object.keys(INT_SETTINGS),
];

export type SettingsPatch = Partial<Omit<BookSettings, 'version'>>;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates a partial settings object. Unknown keys, wrong types and out-of-range numbers give VALIDATION. */
export function validateSettingsPatch(input: unknown): SettingsPatch {
  if (!isPlainObject(input)) throw validationError('Settings must be an object.');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SETTING_KEYS.includes(key)) throw validationError(`Unknown setting: ${key}.`, { field: key });
    if ((BOOLEAN_SETTINGS as readonly string[]).includes(key)) {
      if (typeof value !== 'boolean') throw validationError(`${key} must be true or false.`, { field: key });
      out[key] = value;
      continue;
    }
    if (key === 'referenceOrder') {
      if (!Array.isArray(value) || value.length < 1) throw validationError('The order of price sources needs at least one source.', { field: key });
      const seen = new Set<string>();
      for (const kind of value) {
        if (typeof kind !== 'string' || !(REFERENCE_KINDS as readonly string[]).includes(kind)) {
          throw validationError('That price source is not known.', { field: key });
        }
        if (seen.has(kind)) throw validationError('A price source can be listed only once.', { field: key });
        seen.add(kind);
      }
      out[key] = [...value];
      continue;
    }
    if (key === 'defaultRoundingMode') {
      if (typeof value !== 'string' || !(ROUNDING_MODES as readonly string[]).includes(value)) throw validationError('That rounding is not known.', { field: key });
      out[key] = value;
      continue;
    }
    if (key === 'defaultRoundingDirection') {
      if (typeof value !== 'string' || !(ROUNDING_DIRECTIONS as readonly string[]).includes(value)) throw validationError('That rounding direction is not known.', { field: key });
      out[key] = value;
      continue;
    }
    const spec = INT_SETTINGS[key];
    if (spec === undefined) throw validationError(`Unknown setting: ${key}.`, { field: key });
    if (value === null && spec.nullable) {
      out[key] = null;
      continue;
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < spec.min || value > spec.max) {
      throw validationError(`${key} must be a whole number from ${spec.min} to ${spec.max}.`, { field: key, min: spec.min, max: spec.max });
    }
    out[key] = value;
  }
  return out as SettingsPatch;
}

/** The cross-field rules of the CHECK constraints, applied to the merged settings. */
export function validateMergedSettings(s: BookSettings): void {
  if (s.defaultCeilingCents !== null && s.defaultCeilingCents < s.defaultFloorCents) {
    throw validationError('The default maximum price cannot be lower than the default minimum.', { field: 'defaultCeilingCents' });
  }
  if (s.referenceMaxDays < s.referenceWarnDays) {
    throw validationError('The day count that stops using an old price cannot be lower than the day count that warns about it.', { field: 'referenceMaxDays' });
  }
  if (s.soldHistoryMaxSales < s.soldHistoryMinSales) {
    throw validationError('The most sales to use cannot be lower than the fewest sales to use.', { field: 'soldHistoryMaxSales' });
  }
}

// ---------------------------------------------------------------------------------------------
// Book rows
// ---------------------------------------------------------------------------------------------

export function toBookSettings(row: BookRow): BookSettings {
  return {
    enabled: row.enabled,
    version: row.version,
    allowCatalogReference: row.allowCatalogReference,
    referenceOrder: [...row.referenceOrder],
    retailPercentBps: row.retailPercentBps,
    defaultFloorCents: row.defaultFloorCents,
    defaultCeilingCents: row.defaultCeilingCents,
    defaultRoundingMode: row.defaultRoundingMode,
    defaultRoundingDirection: row.defaultRoundingDirection,
    condNmBps: row.condNmBps,
    condLpBps: row.condLpBps,
    condMpBps: row.condMpBps,
    condHpBps: row.condHpBps,
    condDmgBps: row.condDmgBps,
    nonEnglishBps: row.nonEnglishBps,
    movementReviewBps: row.movementReviewBps,
    referenceWarnDays: row.referenceWarnDays,
    referenceMaxDays: row.referenceMaxDays,
    soldHistoryMinSales: row.soldHistoryMinSales,
    soldHistoryMaxSales: row.soldHistoryMaxSales,
    soldHistoryWindowDays: row.soldHistoryWindowDays,
    manualLockDays: row.manualLockDays,
    buyCreditBps: row.buyCreditBps,
  };
}

/** The default settings as a mutable object (a new book, and the "no book yet" case). */
export function defaultSettings(): BookSettings {
  return { ...DEFAULT_BOOK_SETTINGS, referenceOrder: [...DEFAULT_BOOK_SETTINGS.referenceOrder] };
}

/** What the API shows for a book. */
export interface BookView extends BookSettings {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export function toBookView(row: BookRow): BookView {
  return { id: row.id, ...toBookSettings(row), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** The organizer's book, or null before the first write. Never creates anything. */
export async function findBook(db: PriceBookTx, organizerId: string): Promise<BookRow | null> {
  return db.priceBook.findFirst({ where: { organizerId } });
}

export async function requireBook(ctx: ServiceCtx): Promise<BookRow> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) throw notFoundError('Your price book is not set up yet.');
  return book;
}

async function createBook(ctx: ServiceCtx, settings: BookSettings): Promise<BookRow> {
  const { version: _version, ...rest } = settings;
  void _version;
  return ctx.db.priceBook.create({
    data: { organizerId: ctx.organizerId, ...rest, referenceOrder: [...settings.referenceOrder], version: 1 },
  });
}

/** Finds the organizer's book or creates the default one (off, version 1). Used by every write that needs a book. */
export async function ensureBook(ctx: ServiceCtx): Promise<BookRow> {
  const existing = await findBook(ctx.db, ctx.organizerId);
  if (existing) return existing;
  try {
    return await createBook(ctx, defaultSettings());
  } catch (e) {
    if (isUniqueViolation(e)) {
      const raced = await findBook(ctx.db, ctx.organizerId);
      if (raced) return raced;
    }
    throw e;
  }
}

/** Adds 1 to the book's version inside the caller's transaction. */
export async function bumpBookVersion(tx: PriceBookTx, bookId: string): Promise<void> {
  const res = await tx.priceBook.updateMany({ where: { id: bookId }, data: { version: { increment: 1 } } });
  if (res.count !== 1) throw notFoundError('Your price book is not set up yet.');
}

/** The book answers suggestions only when the platform switch AND the organizer switch are on (ADR-140 section 13.1). */
export function isBookUsable(env: Record<string, string | undefined>, book: Pick<BookRow, 'enabled'> | null): boolean {
  return book !== null && book.enabled === true && isPriceBookEnabled(env);
}

export interface UpsertBookResult {
  book: BookView;
  created: boolean;
  changed: boolean;
}

/**
 * Creates the book on the first call, otherwise updates the settings. patch is validated here (the controller's strict body
 * check is a second line of defense). ifVersion, when given, must equal the current version.
 */
export async function upsertBook(ctx: ServiceCtx, patchInput: unknown, ifVersion?: number): Promise<UpsertBookResult> {
  const patch = validateSettingsPatch(patchInput);
  const existing = await findBook(ctx.db, ctx.organizerId);

  if (!existing) {
    const merged: BookSettings = { ...defaultSettings(), ...patch } as BookSettings;
    validateMergedSettings(merged);
    try {
      const created = await createBook(ctx, merged);
      return { book: toBookView(created), created: true, changed: true };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Another request created the book first: fall through and update it.
    }
  }

  const current = existing ?? (await requireBook(ctx));
  if (ifVersion !== undefined && ifVersion !== current.version) throw versionConflictError();

  const currentSettings = toBookSettings(current);
  const merged = { ...currentSettings, ...patch } as BookSettings;
  validateMergedSettings(merged);

  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    const before = (currentSettings as unknown as Record<string, unknown>)[key];
    const after = (merged as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[key] = after;
  }
  if (Object.keys(changes).length === 0) return { book: toBookView(current), created: false, changed: false };

  const res = await ctx.db.priceBook.updateMany({
    where: { id: current.id, organizerId: ctx.organizerId, version: current.version },
    data: { ...changes, version: { increment: 1 } },
  });
  if (res.count !== 1) throw versionConflictError();
  const fresh = await requireBook(ctx);
  return { book: toBookView(fresh), created: false, changed: true };
}

export interface BookCounts {
  rules: number;
  references: number;
  benchmarks: number;
  bulkRates: number;
  locks: number;
}

/** GET /book: the settings plus counts. Creates nothing; book is null until the first write. */
export async function getBookWithCounts(ctx: ServiceCtx): Promise<{ book: BookView | null; counts: BookCounts | null }> {
  const row = await findBook(ctx.db, ctx.organizerId);
  if (!row) return { book: null, counts: null };
  const where = { bookId: row.id };
  const [rules, references, benchmarks, bulkRates, locks] = await Promise.all([
    ctx.db.priceBookRule.count({ where }),
    ctx.db.priceBookReference.count({ where }),
    ctx.db.priceBookBenchmark.count({ where }),
    ctx.db.priceBookBulkRate.count({ where }),
    ctx.db.priceBookLock.count({ where }),
  ]);
  return { book: toBookView(row), counts: { rules, references, benchmarks, bulkRates, locks } };
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

export function toPriceRule(row: RuleRow): PriceRule {
  return {
    id: row.id,
    family: row.family,
    name: row.name,
    priority: row.priority,
    enabled: row.enabled,
    productType: row.productType,
    game: row.game,
    setCode: row.setCode,
    rarityClass: row.rarityClass,
    rarityText: row.rarityText,
    finish: row.finish,
    language: row.language,
    variantToken: row.variantToken,
    refMinCents: row.refMinCents,
    refMaxCents: row.refMaxCents,
    sourceKinds: [...row.sourceKinds],
    basis: row.basis,
    percentBps: row.percentBps,
    addCents: row.addCents,
    fixedCents: row.fixedCents,
    floorCents: row.floorCents,
    ceilingCents: row.ceilingCents,
    minMarginBps: row.minMarginBps,
    roundingMode: row.roundingMode,
    roundingDirection: row.roundingDirection,
    creditBps: row.creditBps,
    minOfferCents: row.minOfferCents,
  };
}

/** The editable fields of a rule, normalized and ready to store. */
export interface RuleFields {
  name: string;
  enabled?: boolean;
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

const RULE_INPUT_KEYS = [
  'name', 'enabled', 'game', 'setCode', 'rarityClass', 'rarityText', 'finish', 'language', 'variantToken', 'refMinCents',
  'refMaxCents', 'sourceKinds', 'basis', 'percentBps', 'addCents', 'fixedCents', 'floorCents', 'ceilingCents', 'minMarginBps',
  'roundingMode', 'roundingDirection', 'creditBps', 'minOfferCents',
] as const;

function optString(input: Record<string, unknown>, key: string, max: number, transform: (s: string) => string): string | null {
  const v = input[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw validationError(`${key} must be text.`, { field: key });
  const t = transform(v.trim());
  if (t.length === 0) return null;
  if (t.length > max) throw validationError(`${key} is too long.`, { field: key });
  return t;
}

function optInt(input: Record<string, unknown>, key: string, min: number, max: number): number | null {
  const v = input[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    throw validationError(`${key} must be a whole number from ${min} to ${max}.`, { field: key });
  }
  return v;
}

function optEnum(input: Record<string, unknown>, key: string, list: readonly string[]): string | null {
  const v = input[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !list.includes(v.trim().toUpperCase())) throw validationError(`${key} is not a known value.`, { field: key });
  return v.trim().toUpperCase();
}

/**
 * Validates the editable fields of a rule against the CHECK constraints of ADR-140 section 4.2. Unknown keys are refused.
 * family is the rule's family (fixed at creation). Returns the fields normalized (upper case words, null for blank).
 */
export function validateRuleFields(inputRaw: unknown, family: Family): RuleFields {
  if (!isPlainObject(inputRaw)) throw validationError('A rule must be an object.');
  const input = inputRaw;
  for (const key of Object.keys(input)) {
    if (!(RULE_INPUT_KEYS as readonly string[]).includes(key)) throw validationError(`Unknown rule field: ${key}.`, { field: key });
  }
  const nameRaw = input.name;
  if (typeof nameRaw !== 'string' || nameRaw.trim().length === 0 || nameRaw.trim().length > MAX_NAME_LENGTH) {
    throw validationError(`A rule needs a name of 1 to ${MAX_NAME_LENGTH} characters.`, { field: 'name' });
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw validationError('enabled must be true or false.', { field: 'enabled' });

  const rarityClass = optEnum(input, 'rarityClass', RARITY_CLASSES.filter((r) => r !== 'UNKNOWN'));
  const finish = optEnum(input, 'finish', FINISHES_OR_ANY);
  const variantToken = optEnum(input, 'variantToken', VARIANT_TOKENS);
  const basis = typeof input.basis === 'string' ? input.basis.trim().toUpperCase() : 'REFERENCE';
  if (!(BASES as readonly string[]).includes(basis)) throw validationError('That starting point is not known.', { field: 'basis' });
  if (basis === 'RETAIL_PRICE' && family !== 'BUYLIST') throw validationError('Only a buying rule can start from your shelf price.', { field: 'basis' });

  const game = optString(input, 'game', 20, (s) => s.toUpperCase());
  if (game !== null && !/^[A-Z0-9_]+$/.test(game)) throw validationError('game is not a known value.', { field: 'game' });
  const language = optString(input, 'language', 8, (s) => s.toLowerCase());
  if (language !== null && !/^[a-z]{2,8}$/.test(language)) throw validationError('language is not a known value.', { field: 'language' });

  const sourceKindsRaw = input.sourceKinds;
  let sourceKinds: string[] = [];
  if (sourceKindsRaw !== undefined && sourceKindsRaw !== null) {
    if (!Array.isArray(sourceKindsRaw) || sourceKindsRaw.length > REFERENCE_KINDS.length) throw validationError('sourceKinds must be a short list.', { field: 'sourceKinds' });
    for (const k of sourceKindsRaw) {
      if (typeof k !== 'string' || !(REFERENCE_KINDS as readonly string[]).includes(k)) throw validationError('That price source is not known.', { field: 'sourceKinds' });
    }
    sourceKinds = Array.from(new Set(sourceKindsRaw as string[]));
  }

  const percentBps = input.percentBps === undefined ? 10000 : optInt(input, 'percentBps', 0, 100000);
  if (percentBps === null) throw validationError('percentBps is required.', { field: 'percentBps' });
  const addCents = input.addCents === undefined ? 0 : optInt(input, 'addCents', -1_000_000, 1_000_000);
  if (addCents === null) throw validationError('addCents must be a number.', { field: 'addCents' });

  const fields: RuleFields = {
    name: nameRaw.trim(),
    game,
    setCode: optString(input, 'setCode', 20, (s) => s.toLowerCase()),
    rarityClass,
    rarityText: optString(input, 'rarityText', 60, (s) => s),
    finish,
    language,
    variantToken,
    refMinCents: optInt(input, 'refMinCents', 0, MONEY_MAX),
    refMaxCents: optInt(input, 'refMaxCents', 0, MONEY_MAX),
    sourceKinds,
    basis,
    percentBps,
    addCents,
    fixedCents: optInt(input, 'fixedCents', 1, MONEY_MAX),
    floorCents: optInt(input, 'floorCents', 0, MONEY_MAX),
    ceilingCents: optInt(input, 'ceilingCents', 0, MONEY_MAX),
    minMarginBps: optInt(input, 'minMarginBps', -10000, 1_000_000),
    roundingMode: optEnum(input, 'roundingMode', ROUNDING_MODES),
    roundingDirection: optEnum(input, 'roundingDirection', ROUNDING_DIRECTIONS),
    creditBps: optInt(input, 'creditBps', 10000, 30000),
    minOfferCents: optInt(input, 'minOfferCents', 0, MONEY_MAX),
  };
  if (input.enabled !== undefined) fields.enabled = input.enabled as boolean;

  if (basis === 'FIXED_CENTS' && fields.fixedCents === null) throw validationError('A fixed price rule needs a price.', { field: 'fixedCents' });
  if (fields.refMinCents !== null && fields.refMaxCents !== null && fields.refMinCents > fields.refMaxCents) {
    throw validationError('The lowest price in the range cannot be above the highest.', { field: 'refMinCents' });
  }
  if (fields.floorCents !== null && fields.ceilingCents !== null && fields.floorCents > fields.ceilingCents) {
    throw validationError('The minimum price cannot be above the maximum.', { field: 'floorCents' });
  }
  if (family !== 'BUYLIST' && (fields.creditBps !== null || fields.minOfferCents !== null)) {
    throw validationError('Store credit and minimum offer are for buying rules only.', { field: 'creditBps' });
  }
  return fields;
}

function requireFamily(family: unknown): Family {
  if (!isFamily(family)) throw validationError('family must be RETAIL or BUYLIST.', { field: 'family' });
  return family;
}

export async function listRules(ctx: ServiceCtx, family?: string): Promise<RuleRow[]> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) return [];
  const where: Record<string, unknown> = { bookId: book.id };
  if (family !== undefined) where.family = requireFamily(family);
  return ctx.db.priceBookRule.findMany({ where, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
}

/** The rules the engine uses: every enabled rule of the book (both families), mapped to the engine's shape. */
export async function loadEngineRules(db: PriceBookTx, bookId: string): Promise<PriceRule[]> {
  const rows = await db.priceBookRule.findMany({ where: { bookId, enabled: true }, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
  return rows.map(toPriceRule);
}

/** Creates a rule at the end of its family. Max 100 per family. Bumps the book version. */
export async function createRule(ctx: ServiceCtx, input: unknown): Promise<RuleRow> {
  if (!isPlainObject(input)) throw validationError('A rule must be an object.');
  const { family: familyRaw, ...rest } = input;
  const family = requireFamily(familyRaw);
  const fields = validateRuleFields(rest, family);
  const book = await ensureBook(ctx);
  return ctx.db.$transaction(async (tx) => {
    const existing = await tx.priceBookRule.findMany({ where: { bookId: book.id, family }, select: { priority: true } });
    if (existing.length >= MAX_RULES_PER_FAMILY) {
      throw new PriceBookError('LIMIT_REACHED', `You can have at most ${MAX_RULES_PER_FAMILY} rules in each list.`, 409);
    }
    const last = existing.reduce((m, r) => Math.max(m, r.priority), 0);
    const priority = Math.min(10000, last + 10);
    const { enabled, ...data } = fields;
    const row = await tx.priceBookRule.create({
      data: { bookId: book.id, family, productType: 'SINGLE', priority, enabled: enabled ?? true, ...data },
    });
    await bumpBookVersion(tx, book.id);
    return row;
  });
}

/** Replaces the editable fields of a rule (family and priority stay). ifVersion is the book version the editor loaded. */
export async function updateRule(ctx: ServiceCtx, ruleId: string, input: unknown, ifVersion?: number): Promise<RuleRow> {
  const book = await requireBook(ctx);
  if (ifVersion !== undefined && ifVersion !== book.version) throw versionConflictError();
  return ctx.db.$transaction(async (tx) => {
    const rule = await tx.priceBookRule.findFirst({ where: { id: ruleId, bookId: book.id } });
    if (!rule) throw notFoundError();
    const fields = validateRuleFields(input, requireFamily(rule.family));
    const { enabled, ...data } = fields;
    const res = await tx.priceBookRule.updateMany({
      where: { id: ruleId, bookId: book.id },
      data: { ...data, enabled: enabled ?? rule.enabled },
    });
    if (res.count !== 1) throw notFoundError();
    await bumpBookVersion(tx, book.id);
    const fresh = await tx.priceBookRule.findFirst({ where: { id: ruleId, bookId: book.id } });
    if (!fresh) throw notFoundError();
    return fresh;
  });
}

export async function deleteRule(ctx: ServiceCtx, ruleId: string): Promise<void> {
  const book = await requireBook(ctx);
  await ctx.db.$transaction(async (tx) => {
    const res = await tx.priceBookRule.deleteMany({ where: { id: ruleId, bookId: book.id } });
    if (res.count !== 1) throw notFoundError();
    await bumpBookVersion(tx, book.id);
  });
}

/** ids must be exactly the family's rule ids, in the new order. Rewrites priorities 10, 20, 30... in one transaction. */
export async function reorderRules(ctx: ServiceCtx, familyRaw: unknown, ids: unknown): Promise<RuleRow[]> {
  const family = requireFamily(familyRaw);
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw validationError('ids must be a list of rule ids.', { field: 'ids' });
  const book = await requireBook(ctx);
  return ctx.db.$transaction(async (tx) => {
    const current = await tx.priceBookRule.findMany({ where: { bookId: book.id, family }, select: { id: true } });
    const have = new Set(current.map((r) => r.id));
    const given = ids as string[];
    if (given.length !== have.size || new Set(given).size !== given.length || given.some((i) => !have.has(i))) {
      throw validationError('The list must contain each of your rules exactly once.', { field: 'ids' });
    }
    for (let i = 0; i < given.length; i += 1) {
      const id = given[i] as string;
      await tx.priceBookRule.updateMany({ where: { id, bookId: book.id, family }, data: { priority: (i + 1) * 10 } });
    }
    if (given.length > 0) await bumpBookVersion(tx, book.id);
    return tx.priceBookRule.findMany({ where: { bookId: book.id, family }, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
  });
}

export type TemplateName = 'RETAIL_STARTER' | 'BUYLIST_STARTER';

export interface TemplateResult {
  label: string;
  rules: RuleRow[];
}

function ruleCreateData(bookId: string, rule: NewPriceRule): Record<string, unknown> {
  return {
    bookId,
    family: rule.family,
    name: rule.name,
    priority: rule.priority,
    enabled: rule.enabled,
    productType: 'SINGLE',
    game: rule.game ?? null,
    setCode: rule.setCode ?? null,
    rarityClass: rule.rarityClass ?? null,
    rarityText: rule.rarityText ?? null,
    finish: rule.finish ?? null,
    language: rule.language ?? null,
    variantToken: rule.variantToken ?? null,
    refMinCents: rule.refMinCents ?? null,
    refMaxCents: rule.refMaxCents ?? null,
    sourceKinds: [...(rule.sourceKinds ?? [])],
    basis: rule.basis,
    percentBps: rule.percentBps,
    addCents: rule.addCents,
    fixedCents: rule.fixedCents ?? null,
    floorCents: rule.floorCents ?? null,
    ceilingCents: rule.ceilingCents ?? null,
    minMarginBps: rule.minMarginBps ?? null,
    roundingMode: rule.roundingMode ?? null,
    roundingDirection: rule.roundingDirection ?? null,
    creditBps: rule.creditBps ?? null,
    minOfferCents: rule.minOfferCents ?? null,
  };
}

/** Applies a starter rule set, only when that family has no rules (TEMPLATE_NEEDS_EMPTY otherwise). */
export async function applyTemplate(ctx: ServiceCtx, template: unknown): Promise<TemplateResult> {
  if (template !== 'RETAIL_STARTER' && template !== 'BUYLIST_STARTER') throw validationError('That starting point is not known.', { field: 'template' });
  const family: Family = template === 'RETAIL_STARTER' ? 'RETAIL' : 'BUYLIST';
  const starter = template === 'RETAIL_STARTER' ? starterRetailRules() : starterBuylistRules();
  const book = await ensureBook(ctx);
  return ctx.db.$transaction(async (tx) => {
    const count = await tx.priceBookRule.count({ where: { bookId: book.id, family } });
    if (count > 0) {
      throw new PriceBookError('TEMPLATE_NEEDS_EMPTY', 'A starting point can only be added when you have no rules in that list yet.', 409);
    }
    await tx.priceBookRule.createMany({ data: starter.map((r) => ruleCreateData(book.id, r)) });
    await bumpBookVersion(tx, book.id);
    const rules = await tx.priceBookRule.findMany({ where: { bookId: book.id, family }, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
    return { label: COPY.starterLabel, rules };
  });
}
