/**
 * cardRecordService (ADR-134 #640, batch B2): the ONLY writer of the ItemCard table.
 *
 * Every card write in the app (item create/update through itemController, the item-card routes, and
 * later the intake commit) goes through this module so that validation, dedupKey, lockedFields and the
 * grader/condition rule are applied in exactly one place.
 *
 * Design rules (ADR-134 sections 2.4, 2.5, 11):
 *  - Input is parsed by a zod schema declared .strict(): an unknown key is rejected with
 *    CARD_VALIDATION (HTTP 400), never ignored. The server, never the request body, supplies itemId,
 *    organizerId, dedupKey, catalogPrintingId and lockedFields.
 *  - lockedFields: any card field present in the input whose value differs from the stored value is
 *    added to lockedFields. applyPrintingTx writes catalog values only into fields not in lockedFields.
 *  - conditionCode must be null when a grader is set (graded cards are described by grader and grade).
 *  - releaseYear is a whole year 1900 to 2100 (or null = unknown).
 *  - No paid AI call is made anywhere in this module.
 *
 * Import safety: this module imports only crypto, zod and the pure vocabulary constants. It reads no
 * env var and makes no network or database call at import time. The database client is injected
 * (CardDb), never imported, so a unit test can pass a fake.
 */
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  CARD_GAMES,
  CARD_PRODUCT_TYPES,
  CARD_LANGUAGES,
  CARD_FINISHES,
  CARD_CONDITION_CODES,
  CARD_GRADERS,
  CARD_GRADES,
  canonicalizeVocabValue,
} from '../constants/cardVocabulary';

// ---------------------------------------------------------------------------
// Fields, selects and types
// ---------------------------------------------------------------------------

/** The whitelist of card fields a client (or an importer) may supply. Nothing else is ever accepted. */
export const CARD_FIELDS = [
  'game',
  'productType',
  'cardName',
  'setCode',
  'setName',
  'collectorNumber',
  'language',
  'finish',
  'rarity',
  'conditionCode',
  'grader',
  'grade',
  'certNumber',
  'releaseYear',
  'scryfallId',
  'tcgplayerProductId',
  'cardmarketId',
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/**
 * Card block returned inside PUBLIC item responses (getItemById). Deliberately excludes
 * lockedFields, dedupKey, organizerId, itemId and catalogPrintingId.
 */
export const CARD_PUBLIC_SELECT = {
  game: true,
  productType: true,
  cardName: true,
  setCode: true,
  setName: true,
  collectorNumber: true,
  language: true,
  finish: true,
  rarity: true,
  conditionCode: true,
  grader: true,
  grade: true,
  certNumber: true,
  releaseYear: true,
  scryfallId: true,
  tcgplayerProductId: true,
  cardmarketId: true,
} as const;

/**
 * Card block returned to the OWNING organizer (edit read, item-card routes). Adds lockedFields and
 * catalogPrintingId. Still never dedupKey or organizerId.
 */
export const CARD_EDIT_SELECT = {
  ...CARD_PUBLIC_SELECT,
  catalogPrintingId: true,
  lockedFields: true,
} as const;

export interface CardFieldValues {
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
  grade: string | null;
  certNumber: string | null;
  releaseYear: number | null;
  scryfallId: string | null;
  tcgplayerProductId: number | null;
  cardmarketId: number | null;
}

/** Columns written when a card row is created (nested under Item.create, or ItemCard.create). */
export interface CardCreateData extends CardFieldValues {
  organizerId: string | null;
  catalogPrintingId: string | null;
  dedupKey: string;
  lockedFields: string[];
}

/** Columns written when an existing card row is updated. */
export interface CardUpdateData extends CardFieldValues {
  organizerId: string | null;
  dedupKey: string;
  lockedFields: string[];
}

/** The subset of a stored ItemCard row this module reads. */
export interface StoredCard {
  game?: string | null;
  productType?: string | null;
  cardName?: string | null;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  finish?: string | null;
  rarity?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  releaseYear?: number | null;
  scryfallId?: string | null;
  tcgplayerProductId?: number | null;
  cardmarketId?: number | null;
  catalogPrintingId?: string | null;
  lockedFields?: string[] | null;
}

/**
 * Minimal database surface this module needs. Callers pass the Prisma client (or a transaction
 * client) cast to this type; tests pass a fake. Args are loosely typed on purpose so this module
 * never depends on the generated Prisma client types.
 */
export interface CardDb {
  itemCard: {
    findUnique(args: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  cardPrinting: {
    findUnique(args: any): Promise<any>;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface CardIssue {
  path: string;
  message: string;
}

export class CardValidationError extends Error {
  readonly code = 'CARD_VALIDATION';
  readonly status = 400;
  readonly issues: CardIssue[];
  constructor(issues: CardIssue[]) {
    super(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ') || 'Invalid card data.');
    this.name = 'CardValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, CardValidationError.prototype);
  }
}

export class CardNotFoundError extends Error {
  readonly code = 'CARD_NOT_FOUND';
  readonly status = 404;
  constructor(message = 'Card record not found.') {
    super(message);
    this.name = 'CardNotFoundError';
    Object.setPrototypeOf(this, CardNotFoundError.prototype);
  }
}

/** Duck-typed so it still works if a module is loaded twice (jest module registries). */
export function isCardValidationError(err: unknown): err is CardValidationError {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'CARD_VALIDATION';
}

export function isCardNotFoundError(err: unknown): err is CardNotFoundError {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'CARD_NOT_FOUND';
}

/** JSON body for a 400 caused by a CardValidationError. `message` is kept for the item routes' style. */
export function cardValidationBody(err: CardValidationError): { error: string; message: string; code: 'CARD_VALIDATION'; issues: CardIssue[] } {
  return { error: err.message, message: err.message, code: 'CARD_VALIDATION', issues: err.issues };
}

// ---------------------------------------------------------------------------
// zod schema (.strict(): unknown keys are an error)
// ---------------------------------------------------------------------------

// Strip control characters (a NUL byte makes Postgres reject the row) and trim.
const cleanString = (v: unknown): unknown =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim() : v;
const nullIfEmpty = (v: unknown): unknown => {
  const c = cleanString(v);
  return c === '' ? null : c;
};

const freeText = (max: number) => z.preprocess(nullIfEmpty, z.string().max(max, `Must be ${max} characters or fewer.`).nullable().optional());

function vocabField<T extends string>(list: readonly T[], label: string) {
  return z
    .preprocess((v) => (typeof v === 'number' ? String(v) : nullIfEmpty(v)), z.string().nullable().optional())
    .transform((v, ctx) => {
      if (v === undefined || v === null) return v;
      const canonical = canonicalizeVocabValue(list, v);
      if (canonical === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown ${label} "${v.slice(0, 40)}".` });
        return z.NEVER;
      }
      return canonical;
    });
}

const intField = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        const c = String(cleanString(v));
        if (c === '') return null;
        if (/^-?\d+$/.test(c)) return Number(c);
        return v;
      }
      return v;
    },
    z.number({ invalid_type_error: message }).int(message).min(min, message).max(max, message).nullable().optional()
  );

const CardInputSchema = z
  .object({
    game: vocabField(CARD_GAMES, 'game'),
    productType: vocabField(CARD_PRODUCT_TYPES, 'product type'),
    cardName: freeText(200),
    setCode: freeText(20).transform((v) => (typeof v === 'string' ? v.toLowerCase() : v)),
    setName: freeText(200),
    collectorNumber: freeText(20),
    language: vocabField(CARD_LANGUAGES, 'language'),
    finish: vocabField(CARD_FINISHES, 'finish'),
    rarity: freeText(40),
    conditionCode: vocabField(CARD_CONDITION_CODES, 'condition'),
    grader: vocabField(CARD_GRADERS, 'grader'),
    grade: vocabField(CARD_GRADES, 'grade'),
    certNumber: freeText(30), // eBay maximum is 30 characters (ItemCard.certNumber is VarChar(30))
    releaseYear: intField(1900, 2100, 'releaseYear must be a whole year between 1900 and 2100.'),
    scryfallId: z.preprocess(
      nullIfEmpty,
      z.string().max(64).regex(/^[A-Za-z0-9-]+$/, 'scryfallId has invalid characters.').nullable().optional()
    ),
    tcgplayerProductId: intField(1, 2147483647, 'tcgplayerProductId must be a positive whole number.'),
    cardmarketId: intField(1, 2147483647, 'cardmarketId must be a positive whole number.'),
  })
  .strict();

export type CardInput = z.infer<typeof CardInputSchema>;

/**
 * Parse and normalize a card object from a request body, an importer or a multipart field.
 * A JSON string is accepted (multipart item creation sends the card as a string field).
 * Throws CardValidationError (code CARD_VALIDATION) on any problem, including an unknown key.
 */
export function parseCardInput(raw: unknown): CardInput {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new CardValidationError([{ path: '', message: 'card must be a JSON object.' }]);
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CardValidationError([{ path: '', message: 'card must be an object.' }]);
  }
  const result = CardInputSchema.safeParse(value);
  if (!result.success) {
    throw new CardValidationError(result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// dedupKey (ADR-134 section 2.4)
// ---------------------------------------------------------------------------

/** Lowercase, accent-stripped, punctuation-free name used inside the dedup key. */
export function normalizeCardName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "138/195" -> "138"; leading zeros dropped from a purely numeric numerator ("007" -> "7"). */
export function collectorNumerator(collectorNumber: string | null | undefined): string {
  const numerator = (collectorNumber ?? '').split('/')[0].trim().toLowerCase();
  return numerator.replace(/^0+(?=\d)/, '');
}

export interface DedupInput {
  game: string;
  catalogPrintingId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  cardName?: string | null;
  language?: string | null;
  finish?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
}

/**
 * dedupKey = sha1( game | printingId-or-(setCode|collectorNumberNumerator|nameNorm) | language | finish |
 * conditionCode-or-("G:" grader "|" grade "|" certNumber) ), lowercased, hex, first 40 characters.
 * A graded card with a cert number can never collide with another card. Only this function computes it.
 */
export function computeDedupKey(input: DedupInput): string {
  const printing = input.catalogPrintingId
    ? `p:${input.catalogPrintingId}`
    : `s:${(input.setCode ?? '').toLowerCase()}|${collectorNumerator(input.collectorNumber)}|${normalizeCardName(input.cardName)}`;
  const condition = input.grader
    ? `G:${input.grader}|${input.grade ?? ''}|${(input.certNumber ?? '').toUpperCase()}`
    : input.conditionCode ?? '';
  const raw = [input.game, printing, input.language ?? '', input.finish ?? '', condition].join('|').toLowerCase();
  return createHash('sha1').update(raw).digest('hex').slice(0, 40);
}

// ---------------------------------------------------------------------------
// Planning a write (pure: no database)
// ---------------------------------------------------------------------------

interface Draft {
  game: string | null;
  productType: string | null;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: string | null;
  rarity: string | null;
  conditionCode: string | null;
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  releaseYear: number | null;
  scryfallId: string | null;
  tcgplayerProductId: number | null;
  cardmarketId: number | null;
}

function draftFromStored(existing: StoredCard | null | undefined): Draft {
  const e = existing ?? {};
  return {
    game: e.game ?? null,
    productType: e.productType ?? 'SINGLE',
    cardName: e.cardName ?? null,
    setCode: e.setCode ?? null,
    setName: e.setName ?? null,
    collectorNumber: e.collectorNumber ?? null,
    language: e.language ?? null,
    finish: e.finish ?? null,
    rarity: e.rarity ?? null,
    conditionCode: e.conditionCode ?? null,
    grader: e.grader ?? null,
    grade: e.grade ?? null,
    certNumber: e.certNumber ?? null,
    releaseYear: e.releaseYear ?? null,
    scryfallId: e.scryfallId ?? null,
    tcgplayerProductId: e.tcgplayerProductId ?? null,
    cardmarketId: e.cardmarketId ?? null,
  };
}

function uniqueFieldOrder(fields: Iterable<string>): string[] {
  const set = new Set(fields);
  // Stable order: whitelist order first, so the same data always yields the same array.
  return (CARD_FIELDS as readonly string[]).filter((f) => set.has(f));
}

function assertCardRules(draft: Draft): CardFieldValues {
  const issues: CardIssue[] = [];
  if (!draft.game) issues.push({ path: 'game', message: 'game is required.' });
  if (!draft.productType) issues.push({ path: 'productType', message: 'productType cannot be cleared.' });
  if (draft.grader && draft.conditionCode) {
    issues.push({
      path: 'conditionCode',
      message: 'A graded card cannot also have a condition. Clear conditionCode when a grader is set.',
    });
  }
  if (issues.length > 0) throw new CardValidationError(issues);
  return draft as CardFieldValues;
}

export interface CardWritePlan {
  values: CardFieldValues;
  dedupKey: string;
  lockedFields: string[];
  changedFields: string[];
}

/**
 * Merge a parsed patch over the stored row (or over nothing, on create) and apply every rule.
 * Fields absent from the patch (undefined) keep their stored value; null clears a field.
 * Any field in the patch whose value differs from the stored value joins lockedFields.
 */
export function planCardWrite(existing: StoredCard | null | undefined, patch: CardInput): CardWritePlan {
  const draft = draftFromStored(existing);
  const changed: string[] = [];
  for (const field of CARD_FIELDS) {
    const next = (patch as Record<string, unknown>)[field];
    if (next === undefined) continue;
    const prev = (draft as unknown as Record<string, unknown>)[field];
    if (next !== prev) changed.push(field);
    (draft as unknown as Record<string, unknown>)[field] = next;
  }
  const values = assertCardRules(draft);
  const lockedFields = uniqueFieldOrder([...(existing?.lockedFields ?? []), ...changed]);
  const dedupKey = computeDedupKey({ ...values, catalogPrintingId: existing?.catalogPrintingId ?? null });
  return { values, dedupKey, lockedFields, changedFields: changed };
}

/**
 * Data for a card row created together with its Item (nested write: prisma.item.create({ data: {
 * card: { create: data } } })). Validates fully; throws CardValidationError (game is required).
 */
export function buildCardCreateData(raw: unknown, organizerId: string | null = null): CardCreateData {
  const patch = parseCardInput(raw);
  const plan = planCardWrite(null, patch);
  return {
    ...plan.values,
    organizerId,
    catalogPrintingId: null,
    dedupKey: plan.dedupKey,
    lockedFields: plan.lockedFields,
  };
}

/**
 * Data for a nested upsert on Item.update: prisma.item.update({ data: { card: { upsert: { create, update } } } }).
 * `existing` is the stored ItemCard row, or null when the item has no card yet.
 */
export function buildCardNestedUpsert(
  existing: StoredCard | null | undefined,
  raw: unknown,
  organizerId: string | null
): { create: CardCreateData; update: CardUpdateData } {
  const patch = parseCardInput(raw);
  const plan = planCardWrite(existing, patch);
  return {
    create: {
      ...plan.values,
      organizerId,
      catalogPrintingId: existing?.catalogPrintingId ?? null,
      dedupKey: plan.dedupKey,
      lockedFields: plan.lockedFields,
    },
    update: {
      ...plan.values,
      organizerId,
      dedupKey: plan.dedupKey,
      lockedFields: plan.lockedFields,
    },
  };
}

// ---------------------------------------------------------------------------
// Writers that take a database client
// ---------------------------------------------------------------------------

export interface CardWriteContext {
  itemId: string;
  organizerId: string | null;
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

/**
 * Create or update the ItemCard for an item from a request-shaped object (the PUT route and the
 * intake commit). The caller has already verified that ctx.organizerId owns ctx.itemId.
 * Returns the stored card as CARD_EDIT_SELECT shapes it.
 */
export async function upsertItemCardTx(db: CardDb, ctx: CardWriteContext, raw: unknown): Promise<any> {
  const patch = parseCardInput(raw);

  const write = async (): Promise<any> => {
    const existing = await db.itemCard.findUnique({ where: { itemId: ctx.itemId } });
    const plan = planCardWrite(existing, patch);
    if (!existing) {
      return db.itemCard.create({
        data: {
          itemId: ctx.itemId,
          organizerId: ctx.organizerId,
          ...plan.values,
          dedupKey: plan.dedupKey,
          lockedFields: plan.lockedFields,
        },
        select: CARD_EDIT_SELECT,
      });
    }
    return db.itemCard.update({
      where: { itemId: ctx.itemId },
      data: {
        organizerId: ctx.organizerId,
        ...plan.values,
        dedupKey: plan.dedupKey,
        lockedFields: plan.lockedFields,
      },
      select: CARD_EDIT_SELECT,
    });
  };

  try {
    return await write();
  } catch (err) {
    // Two concurrent first saves for one item: the loser hits the itemId unique index. Retry once as an update.
    if (isUniqueViolation(err)) return write();
    throw err;
  }
}

// --- apply-printing --------------------------------------------------------

const SCRYFALL_FINISH_TO_VOCAB: Record<string, string> = {
  nonfoil: 'NONFOIL',
  foil: 'FOIL',
  etched: 'ETCHED',
};

/** Card fields that come from a catalog printing (and are therefore subject to lockedFields). */
const CATALOG_FIELDS: readonly CardField[] = [
  'game',
  'cardName',
  'setCode',
  'setName',
  'collectorNumber',
  'language',
  'finish',
  'rarity',
  'releaseYear',
  'scryfallId',
  'tcgplayerProductId',
  'cardmarketId',
];

interface CatalogPrintingRow {
  id: string;
  game?: string | null;
  name?: string | null;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  rarity?: string | null;
  releaseYear?: number | null;
  finishes?: string[] | null;
  scryfallId?: string | null;
  tcgplayerProductId?: number | null;
  cardmarketId?: number | null;
}

const ApplyPrintingSchema = z
  .object({
    printingId: z.string().min(1).max(100),
    // Fields to unlock and refresh from the catalog ("reset to catalog value" in the editor).
    resetFields: z.array(z.string().max(40)).max(CARD_FIELDS.length).optional(),
  })
  .strict();

export type ApplyPrintingInput = z.infer<typeof ApplyPrintingSchema>;

export function parseApplyPrintingInput(raw: unknown): ApplyPrintingInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CardValidationError([{ path: '', message: 'Body must be an object.' }]);
  }
  const result = ApplyPrintingSchema.safeParse(raw);
  if (!result.success) {
    throw new CardValidationError(result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const reset = result.data.resetFields ?? [];
  const unknown = reset.filter((f) => !(CATALOG_FIELDS as readonly string[]).includes(f));
  if (unknown.length > 0) {
    throw new CardValidationError([{ path: 'resetFields', message: `Cannot reset: ${unknown.join(', ')}.` }]);
  }
  return result.data;
}

function catalogValues(printing: CatalogPrintingRow): Partial<Record<CardField, string | number | null>> {
  const game = canonicalizeVocabValue(CARD_GAMES, printing.game);
  if (!game) {
    throw new CardValidationError([{ path: 'printingId', message: 'This catalog printing is for a game that is not supported.' }]);
  }
  const out: Partial<Record<CardField, string | number | null>> = {
    game,
    cardName: printing.name ?? null,
    setCode: printing.setCode ? printing.setCode.toLowerCase() : null,
    setName: printing.setName ?? null,
    collectorNumber: printing.collectorNumber ?? null,
    rarity: printing.rarity ?? null,
    releaseYear:
      typeof printing.releaseYear === 'number' && Number.isInteger(printing.releaseYear) && printing.releaseYear >= 1900 && printing.releaseYear <= 2100
        ? printing.releaseYear
        : null,
    scryfallId: printing.scryfallId ?? null,
    tcgplayerProductId: printing.tcgplayerProductId ?? null,
    cardmarketId: printing.cardmarketId ?? null,
  };
  // Language and finish describe the seller's copy. Only fill them when the catalog is unambiguous.
  const language = canonicalizeVocabValue(CARD_LANGUAGES, printing.language);
  if (language) out.language = language;
  const finishes = (printing.finishes ?? []).map((f) => SCRYFALL_FINISH_TO_VOCAB[String(f).toLowerCase()]).filter(Boolean);
  if (finishes.length === 1) out.finish = finishes[0];
  return out;
}

/**
 * Copy a catalog printing into the item's card, skipping every field in lockedFields (fields the seller
 * typed). resetFields unlocks and refreshes the named fields. Catalog values never add to lockedFields.
 * Creates the card when the item has none. Throws CardNotFoundError when the printing does not exist.
 */
export async function applyPrintingTx(db: CardDb, ctx: CardWriteContext, raw: unknown): Promise<any> {
  const input = parseApplyPrintingInput(raw);
  const printing: CatalogPrintingRow | null = await db.cardPrinting.findUnique({ where: { id: input.printingId } });
  if (!printing) throw new CardNotFoundError('Catalog printing not found.');
  const fromCatalog = catalogValues(printing);

  const existing: StoredCard | null = await db.itemCard.findUnique({ where: { itemId: ctx.itemId } });
  const reset = new Set(input.resetFields ?? []);
  const locked = new Set((existing?.lockedFields ?? []).filter((f) => !reset.has(f)));

  const draft = draftFromStored(existing);
  for (const field of CATALOG_FIELDS) {
    if (locked.has(field)) continue;
    if (!(field in fromCatalog)) continue;
    (draft as unknown as Record<string, unknown>)[field] = fromCatalog[field];
  }
  const values = assertCardRules(draft);
  const lockedFields = uniqueFieldOrder(locked);
  const dedupKey = computeDedupKey({ ...values, catalogPrintingId: printing.id });

  if (!existing) {
    return db.itemCard.create({
      data: {
        itemId: ctx.itemId,
        organizerId: ctx.organizerId,
        ...values,
        catalogPrintingId: printing.id,
        dedupKey,
        lockedFields,
      },
      select: CARD_EDIT_SELECT,
    });
  }
  return db.itemCard.update({
    where: { itemId: ctx.itemId },
    data: {
      organizerId: ctx.organizerId,
      ...values,
      catalogPrintingId: printing.id,
      dedupKey,
      lockedFields,
    },
    select: CARD_EDIT_SELECT,
  });
}
