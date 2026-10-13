/**
 * Typed references, "Use my current prices", the reference price list import, benchmarks and the bulk rate card
 * (ADR-140 sections 5.2, 5.4, 5.5, 8 and 10). Every number here is the shop's own: nothing is fetched, nothing comes from
 * another source, and a file with marketplace price columns is refused (FOREIGN_PRICE_COLUMN).
 *
 * Money is integer cents. The controller converts a dollar field with parseMoneyToCents (exported here) before calling in.
 *
 * Tenant rule: the book is found from ctx.organizerId, every query carries bookId, every write is createMany, create,
 * updateMany or deleteMany with bookId in the where clause. Stock is read through ItemCard.organizerId AND Item.organizerId.
 *
 * Version rule (bookService): references and locks never bump the book version; benchmarks and the rate card do, once per
 * successful call that changed something.
 */
import {
  PriceBookError,
  chunk,
  dollarsToCents,
  isUniqueViolation,
  notFoundError,
  validationError,
  versionConflictError,
} from './db';
import type {
  BenchmarkRow,
  BulkRateRow,
  CardPrintingRow,
  ItemCardRow,
  PriceBookTx,
  ReferenceRow,
  ServiceCtx,
} from './db';
import { bumpBookVersion, defaultSettings, ensureBook, findBook, requireBook, toBookSettings } from './bookService';
import { adjustRates, rateChangeWarnings } from './bulkRates';
import type { RateAdjustment, RateChangeWarning } from './bulkRates';
import { referenceKey, variantTokensFromPrinting, variantTokensFromSetName } from './cardKey';
import { COPY, formatShortDate } from './messages';
import { roundHalfUp } from './rounding';
import type { BookSettings, BulkRate } from './types';
import {
  DIRECTIONS,
  FINISHES,
  FINISHES_OR_ANY,
  MAX_RATE_PER_1000_CENTS,
  MAX_RATE_PER_CARD_CENTS,
  RARITY_CLASSES,
  TIERS,
  UNITS,
  classifyRarity,
} from './vocabulary';
import type { RarityClass, VariantToken } from './vocabulary';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 200;
export const MAX_RATE_ROWS = 600;
const MAX_VALUE_CENTS = 100_000_000;
const MAX_CARD_NAME_LENGTH = 120;

/** The games the card record accepts (constants/cardVocabulary.ts CARD_GAMES). A test pins the two lists together. */
export const KNOWN_GAMES: readonly string[] = ['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE', 'OTHER'];

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

/**
 * Dollars to integer cents, strictly (ADR-140 section 13.5): a number, or text such as "12", "12.5", "$1,200.00". At most two
 * decimals, digits only (no exponent, no sign, no stray characters). Returns null for anything else, including a negative
 * number and anything above the money limit. Zero parses as 0; callers decide whether zero is allowed.
 */
export function parseMoneyToCents(input: unknown): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    const cents = Math.round(input * 100);
    if (Math.abs(input * 100 - cents) > 1e-6) return null;
    return cents <= MAX_VALUE_CENTS ? cents : null;
  }
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (text.startsWith('$')) text = text.slice(1).trim();
  const plain = /^\d+(\.\d{1,2})?$/.test(text);
  const grouped = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text);
  if (!plain && !grouped) return null;
  const [whole = '0', frac = ''] = text.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_VALUE_CENTS ? cents : null;
}

// ---------------------------------------------------------------------------------------------
// Card identity (shared with the providers)
// ---------------------------------------------------------------------------------------------

export interface CardIdentity {
  cardKey: string;
  game: string;
  catalogPrintingId: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  cardName: string | null;
  rarityText: string | null;
  rarityClass: RarityClass;
  variantTokens: VariantToken[];
  /** CardPrinting.source for a catalog card, null for a typed one. */
  source: string | null;
}

/** Typed (non catalog) cards: only Pokemon set names carry variants (ADR-140 section 9.1). */
export function typedVariantTokens(game: string, setName: string | null | undefined): VariantToken[] {
  return game.trim().toUpperCase() === 'POKEMON' ? variantTokensFromSetName(setName) : [];
}

export function identityFromPrinting(p: CardPrintingRow): CardIdentity {
  const variantTokens = variantTokensFromPrinting({ id: p.id, source: p.source, setName: p.setName });
  return {
    cardKey: referenceKey({ catalogPrintingId: p.id }),
    game: p.game,
    catalogPrintingId: p.id,
    setCode: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    cardName: p.name,
    rarityText: p.rarity,
    rarityClass: classifyRarity(p.game, p.rarity),
    variantTokens,
    source: p.source,
  };
}

export interface TypedCardInput {
  game: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  cardName?: string | null;
  setName?: string | null;
  rarity?: string | null;
}

export function identityFromTyped(t: TypedCardInput): CardIdentity {
  const game = t.game.trim().toUpperCase();
  const variantTokens = typedVariantTokens(game, t.setName);
  return {
    cardKey: referenceKey({
      game,
      setCode: t.setCode ?? null,
      collectorNumber: t.collectorNumber ?? null,
      cardName: t.cardName ?? null,
      variantToken: variantTokens,
    }),
    game,
    catalogPrintingId: null,
    setCode: t.setCode ? t.setCode.trim().toLowerCase() : null,
    setName: t.setName ?? null,
    collectorNumber: t.collectorNumber ?? null,
    cardName: t.cardName ?? null,
    rarityText: t.rarity ?? null,
    rarityClass: classifyRarity(game, t.rarity),
    variantTokens,
    source: null,
  };
}

/** The identity of a stock card record. A catalog card keys on its printing; a typed card on its typed fields. */
export function identityFromItemCard(c: ItemCardRow, printing?: CardPrintingRow | null): CardIdentity {
  if (c.catalogPrintingId) {
    if (printing && printing.id === c.catalogPrintingId) return identityFromPrinting(printing);
    return {
      cardKey: referenceKey({ catalogPrintingId: c.catalogPrintingId }),
      game: c.game,
      catalogPrintingId: c.catalogPrintingId,
      setCode: c.setCode,
      setName: c.setName,
      collectorNumber: c.collectorNumber,
      cardName: c.cardName,
      rarityText: c.rarity,
      rarityClass: classifyRarity(c.game, c.rarity),
      variantTokens: [],
      source: null,
    };
  }
  return identityFromTyped({
    game: c.game,
    setCode: c.setCode,
    collectorNumber: c.collectorNumber,
    cardName: c.cardName,
    setName: c.setName,
    rarity: c.rarity,
  });
}

/** Basis points of the book's condition multiplier for a code; null for a code that is not one of the five. */
export function conditionBpsOf(book: BookSettings, code: string | null | undefined): number | null {
  switch ((code ?? 'NM').trim().toUpperCase()) {
    case 'NM':
      return book.condNmBps;
    case 'LP':
      return book.condLpBps;
    case 'MP':
      return book.condMpBps;
    case 'HP':
      return book.condHpBps;
    case 'DMG':
      return book.condDmgBps;
    default:
      return null;
  }
}

/** A price at a condition to its Near Mint equivalent: price / multiplier, half up. Null for an unknown condition code. */
export function nearMintEquivalentCents(cents: number, code: string | null | undefined, book: BookSettings): number | null {
  const bps = conditionBpsOf(book, code);
  if (bps === null || bps <= 0) return null;
  return roundHalfUp(cents * 10000, bps);
}

const LANGUAGE_PATTERN = /^[a-z]{2,8}$/;

function cleanNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw validationError('A note must be text.', { field: 'note' });
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t.length > MAX_NOTE_LENGTH) throw validationError(`A note can be at most ${MAX_NOTE_LENGTH} characters.`, { field: 'note' });
  return t;
}

function cleanAsOf(raw: unknown, now: Date): Date {
  if (raw === undefined || raw === null) return now;
  const d = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null;
  if (d === null || Number.isNaN(d.getTime())) throw validationError('The date is not valid.', { field: 'asOf' });
  if (d.getTime() > now.getTime() + 24 * 60 * 60 * 1000) throw validationError('The date cannot be in the future.', { field: 'asOf' });
  return d;
}

// ---------------------------------------------------------------------------------------------
// Typed references (MANUAL)
// ---------------------------------------------------------------------------------------------

export interface UpsertReferenceInput {
  printingId?: string | null;
  typed?: TypedCardInput | null;
  finish: string;
  language?: string | null;
  valueCents: number;
  note?: string | null;
  asOf?: Date | string | null;
}

function cleanGame(raw: unknown): string {
  const g = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!KNOWN_GAMES.includes(g)) throw validationError('That game is not known.', { field: 'game' });
  return g;
}

function cleanFinish(raw: unknown): string {
  const f = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!(FINISHES as readonly string[]).includes(f)) throw validationError('That finish is not known.', { field: 'finish' });
  return f;
}

function cleanLanguage(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return 'en';
  const l = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!LANGUAGE_PATTERN.test(l)) throw validationError('That language is not known.', { field: 'language' });
  return l;
}

function cleanValueCents(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1 || raw > MAX_VALUE_CENTS) {
    throw validationError('The price must be more than zero and at most $1,000,000.00.', { field: 'valueCents' });
  }
  return raw;
}

function truncate(text: string | null, max: number): string | null {
  return text === null ? null : text.slice(0, max);
}

interface ReferenceTarget {
  identity: CardIdentity;
  printing: CardPrintingRow | null;
}

async function resolveReferenceTarget(db: PriceBookTx, input: UpsertReferenceInput): Promise<ReferenceTarget> {
  const hasPrinting = typeof input.printingId === 'string' && input.printingId.trim() !== '';
  const hasTyped = input.typed !== undefined && input.typed !== null;
  if (hasPrinting === hasTyped) throw validationError('Give either a catalog card or the card details, not both.', { field: 'printingId' });
  if (hasPrinting) {
    const printing = await db.cardPrinting.findFirst({ where: { id: (input.printingId as string).trim() } });
    if (!printing) throw validationError('That card is not in the catalog.', { field: 'printingId' });
    return { identity: identityFromPrinting(printing), printing };
  }
  const typed = input.typed as TypedCardInput;
  const game = cleanGame(typed.game);
  const cardName = typeof typed.cardName === 'string' && typed.cardName.trim() !== '' ? typed.cardName.trim().slice(0, MAX_CARD_NAME_LENGTH) : null;
  const setCode = typeof typed.setCode === 'string' && typed.setCode.trim() !== '' ? typed.setCode.trim() : null;
  const collectorNumber = typeof typed.collectorNumber === 'string' && typed.collectorNumber.trim() !== '' ? typed.collectorNumber.trim() : null;
  if (cardName === null && !(setCode !== null && collectorNumber !== null)) {
    throw validationError('Add a card name, or a set code and collector number.', { field: 'cardName' });
  }
  const identity = identityFromTyped({ game, setCode, collectorNumber, cardName, setName: typed.setName ?? null, rarity: typed.rarity ?? null });
  return { identity, printing: null };
}

export interface UpsertReferenceResult {
  reference: ReferenceRow;
  created: boolean;
}

/** Saves the shop's own Near Mint price for one card, one finish, one language. The server computes the card key. */
export async function upsertReference(ctx: ServiceCtx, input: UpsertReferenceInput): Promise<UpsertReferenceResult> {
  const finish = cleanFinish(input.finish);
  const language = cleanLanguage(input.language);
  const valueCents = cleanValueCents(input.valueCents);
  const note = cleanNote(input.note);
  const asOf = cleanAsOf(input.asOf, ctx.now);
  const target = await resolveReferenceTarget(ctx.db, input);
  if (target.printing && target.printing.finishes.length > 0 && !target.printing.finishes.includes(finish)) {
    throw validationError('This card does not come in that finish.', { field: 'finish' });
  }
  const book = await ensureBook(ctx);
  const id = target.identity;
  const fields = {
    catalogPrintingId: id.catalogPrintingId,
    game: id.game,
    cardName: truncate(id.cardName, MAX_CARD_NAME_LENGTH),
    setCode: id.setCode,
    setName: id.setName,
    collectorNumber: id.collectorNumber,
    valueCents,
    note,
    asOf,
    enteredByUserId: ctx.userId ?? null,
  };
  const keyWhere = { bookId: book.id, cardKey: id.cardKey, finish, language };

  const update = async (): Promise<ReferenceRow | null> => {
    const existing = await ctx.db.priceBookReference.findFirst({ where: keyWhere });
    if (!existing) return null;
    await ctx.db.priceBookReference.updateMany({ where: { id: existing.id, bookId: book.id }, data: fields });
    const fresh = await ctx.db.priceBookReference.findFirst({ where: { id: existing.id, bookId: book.id } });
    return fresh;
  };

  const updated = await update();
  if (updated) return { reference: updated, created: false };
  try {
    const row = await ctx.db.priceBookReference.create({ data: { ...keyWhere, ...fields } });
    return { reference: row, created: true };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const raced = await update();
      if (raced) return { reference: raced, created: false };
    }
    throw e;
  }
}

export interface ListReferencesArgs {
  game?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  /** Only references typed or confirmed more than this many days ago ("Older than 90 days"). */
  olderThanDays?: number;
}

export interface ListReferencesResult {
  rows: ReferenceRow[];
  nextCursor: string | null;
}

export async function listReferences(ctx: ServiceCtx, args: ListReferencesArgs = {}): Promise<ListReferencesResult> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) return { rows: [], nextCursor: null };
  const limit = Math.min(100, Math.max(1, Number.isSafeInteger(args.limit) ? (args.limit as number) : 50));
  const where: Record<string, unknown> = { bookId: book.id };
  if (args.game) where.game = args.game.trim().toUpperCase();
  if (args.cursor) where.id = { gt: args.cursor };
  if (args.olderThanDays !== undefined) {
    if (!Number.isSafeInteger(args.olderThanDays) || args.olderThanDays < 1) throw validationError('The day count must be a whole number above zero.', { field: 'olderThanDays' });
    where.asOf = { lt: new Date(ctx.now.getTime() - args.olderThanDays * 24 * 60 * 60 * 1000) };
  }
  const q = (args.q ?? '').trim();
  if (q !== '') {
    const contains = { contains: q, mode: 'insensitive' };
    where.OR = [{ cardName: contains }, { setCode: contains }, { collectorNumber: contains }];
  }
  const rows = await ctx.db.priceBookReference.findMany({ where, orderBy: { id: 'asc' }, take: limit + 1 });
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: more ? (page[page.length - 1] as ReferenceRow).id : null };
}

export async function deleteReference(ctx: ServiceCtx, referenceId: string): Promise<void> {
  const book = await requireBook(ctx);
  const res = await ctx.db.priceBookReference.deleteMany({ where: { id: referenceId, bookId: book.id } });
  if (res.count !== 1) throw notFoundError();
}

// ---------------------------------------------------------------------------------------------
// "Use my current prices" (section 5.4)
// ---------------------------------------------------------------------------------------------

export interface FromStockArgs {
  saleId?: string | null;
  game?: string | null;
  overwrite?: boolean;
}

export interface FromStockResult {
  /** Card records looked at. */
  considered: number;
  created: number;
  /** Existing references replaced (overwrite only). */
  updated: number;
  skipped: {
    /** Not on the shelf: sold, donated, an auction, or archived. */
    notForSale: number;
    /** Bulk lots (priced per 1,000 by the rate card). */
    lot: number;
    /** A card record that is not a single card. */
    notCard: number;
    graded: number;
    /** No price, a zero price, or a price the price book cannot use. */
    noPrice: number;
    noFinish: number;
    noCondition: number;
    /** A reference for that card, finish and language already exists (overwrite false). */
    existing: number;
    /** Another card of the same stock already supplied this reference. */
    duplicate: number;
  };
}

const STOCK_STATUSES = ['AVAILABLE', 'RESERVED'];
const STOCK_CARD_LIMIT = 50000;

/**
 * Creates a MANUAL reference for every priced single card in the organizer's stock that does not have one: the Near Mint
 * equivalent of the item price (price / condition multiplier, half up). Items that are sold, auction, lots, graded, unpriced
 * or without a finish are skipped and counted. overwrite true replaces existing references. The first reprice at 100 percent
 * then reproduces the shop's own prices.
 *
 * Items without a card record are never visited, so they are not counted (a mixed shop's non-card items would swamp the
 * numbers). Items in draft are included: the price on an item is the organizer's own number.
 */
export async function referencesFromStock(ctx: ServiceCtx, args: FromStockArgs = {}): Promise<FromStockResult> {
  const book = await ensureBook(ctx);
  const settings = toBookSettings(book);
  const overwrite = args.overwrite === true;
  const result: FromStockResult = {
    considered: 0,
    created: 0,
    updated: 0,
    skipped: { notForSale: 0, lot: 0, notCard: 0, graded: 0, noPrice: 0, noFinish: 0, noCondition: 0, existing: 0, duplicate: 0 },
  };

  const cardWhere: Record<string, unknown> = { organizerId: ctx.organizerId };
  if (args.game) cardWhere.game = args.game.trim().toUpperCase();
  const cards = await ctx.db.itemCard.findMany({ where: cardWhere, orderBy: { itemId: 'asc' }, take: STOCK_CARD_LIMIT });

  const itemWhereBase: Record<string, unknown> = { organizerId: ctx.organizerId, deletedAt: null };
  if (args.saleId) itemWhereBase.saleId = args.saleId;
  const itemsById = new Map<string, Awaited<ReturnType<PriceBookTx['item']['findMany']>>[number]>();
  for (const ids of chunk(cards.map((c) => c.itemId), 1000)) {
    const rows = await ctx.db.item.findMany({ where: { ...itemWhereBase, id: { in: ids } } });
    for (const r of rows) itemsById.set(r.id, r);
  }
  const lotItemIds = new Set<string>();
  for (const ids of chunk(Array.from(itemsById.keys()), 1000)) {
    const lots = await ctx.db.itemBulkLot.findMany({ where: { itemId: { in: ids } } });
    for (const l of lots) lotItemIds.add(l.itemId);
  }

  // Printings of catalog cards, for the finish list and the identity.
  const printingIds = Array.from(new Set(cards.filter((c) => c.catalogPrintingId && itemsById.has(c.itemId)).map((c) => c.catalogPrintingId as string)));
  const printings = new Map<string, CardPrintingRow>();
  for (const ids of chunk(printingIds, 1000)) {
    for (const p of await ctx.db.cardPrinting.findMany({ where: { id: { in: ids } } })) printings.set(p.id, p);
  }

  interface Candidate {
    identity: CardIdentity;
    finish: string;
    language: string;
    valueCents: number;
  }
  const candidates = new Map<string, Candidate>();
  for (const card of cards) {
    const item = itemsById.get(card.itemId);
    if (!item) continue; // another sale, or not this organizer's item
    result.considered += 1;
    if (lotItemIds.has(item.id)) {
      result.skipped.lot += 1;
      continue;
    }
    if (!STOCK_STATUSES.includes(item.status) || (item.listingType !== null && !['FIXED', 'POS'].includes(item.listingType))) {
      result.skipped.notForSale += 1;
      continue;
    }
    if (card.productType !== 'SINGLE') {
      result.skipped.notCard += 1;
      continue;
    }
    if (card.grader && card.grader.trim() !== '') {
      result.skipped.graded += 1;
      continue;
    }
    const priceCents = dollarsToCents(item.price);
    if (priceCents === null || priceCents < 1) {
      result.skipped.noPrice += 1;
      continue;
    }
    const finish = (card.finish ?? '').trim().toUpperCase();
    if (!(FINISHES as readonly string[]).includes(finish)) {
      result.skipped.noFinish += 1;
      continue;
    }
    const nm = nearMintEquivalentCents(priceCents, card.conditionCode, settings);
    if (nm === null) {
      result.skipped.noCondition += 1;
      continue;
    }
    if (nm < 1 || nm > MAX_VALUE_CENTS) {
      result.skipped.noPrice += 1;
      continue;
    }
    const printing = card.catalogPrintingId ? printings.get(card.catalogPrintingId) ?? null : null;
    const identity = identityFromItemCard(card, printing);
    const language = (card.language ?? 'en').trim().toLowerCase() || 'en';
    const key = `${identity.cardKey}|${finish}|${language}`;
    if (candidates.has(key)) {
      result.skipped.duplicate += 1;
      continue;
    }
    candidates.set(key, { identity, finish, language, valueCents: nm });
  }

  // Existing references for those keys.
  const existing = new Map<string, ReferenceRow>();
  const keys = Array.from(new Set(Array.from(candidates.values()).map((c) => c.identity.cardKey)));
  for (const part of chunk(keys, 500)) {
    for (const r of await ctx.db.priceBookReference.findMany({ where: { bookId: book.id, cardKey: { in: part } } })) {
      existing.set(`${r.cardKey}|${r.finish}|${r.language}`, r);
    }
  }

  const note = `From my stock on ${formatShortDate(ctx.now.toISOString()) ?? 'today'}`;
  const toCreate: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const [key, c] of candidates) {
    const fields = {
      catalogPrintingId: c.identity.catalogPrintingId,
      game: c.identity.game,
      cardName: truncate(c.identity.cardName, MAX_CARD_NAME_LENGTH),
      setCode: c.identity.setCode,
      setName: c.identity.setName,
      collectorNumber: c.identity.collectorNumber,
      valueCents: c.valueCents,
      note,
      asOf: ctx.now,
      enteredByUserId: ctx.userId ?? null,
    };
    const have = existing.get(key);
    if (have) {
      if (overwrite) toUpdate.push({ id: have.id, data: fields });
      else result.skipped.existing += 1;
    } else {
      toCreate.push({ bookId: book.id, cardKey: c.identity.cardKey, finish: c.finish, language: c.language, ...fields });
    }
  }
  await ctx.db.$transaction(async (tx) => {
    for (const part of chunk(toCreate, 500)) await tx.priceBookReference.createMany({ data: part });
    for (const u of toUpdate) await tx.priceBookReference.updateMany({ where: { id: u.id, bookId: book.id }, data: u.data });
  });
  result.created = toCreate.length;
  result.updated = toUpdate.length;
  return result;
}

// ---------------------------------------------------------------------------------------------
// Reference price list import (section 5.5)
// ---------------------------------------------------------------------------------------------

/** The only column headers that are read. */
export const IMPORT_HEADERS = ['set code', 'collector number', 'name', 'game', 'finish', 'language', 'price', 'note'] as const;
const FOREIGN_WORDS = ['market', 'low', 'mid', 'trend', 'direct', 'tcg'];

const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[\s_]+/g, ' ').trim();

/** True for a header that looks like a marketplace price column. */
export function isForeignPriceHeader(header: string): boolean {
  const n = normalizeHeader(header).replace(/ /g, '');
  return FOREIGN_WORDS.some((w) => n.includes(w));
}

/** A small RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF, a leading byte order mark, blank lines skipped. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || (row[0] ?? '').trim() !== '') rows.push(row);
    row = [];
    sawAny = false;
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === ',') {
      endField();
      sawAny = true;
    } else if (ch === '\r') {
      if (src.charAt(i + 1) === '\n') i += 1;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
      sawAny = true;
    }
  }
  if (sawAny || field !== '' || row.length > 0) endRow();
  return rows;
}

export interface ImportRowInput {
  setCode?: unknown;
  collectorNumber?: unknown;
  name?: unknown;
  game?: unknown;
  finish?: unknown;
  language?: unknown;
  price?: unknown;
  note?: unknown;
}

const ROW_KEY_TO_HEADER: Record<string, (typeof IMPORT_HEADERS)[number]> = {
  setCode: 'set code',
  collectorNumber: 'collector number',
  name: 'name',
  game: 'game',
  finish: 'finish',
  language: 'language',
  price: 'price',
  note: 'note',
};

/** What the printing resolver is asked, one entry per row that has a set code and number or a name. */
export interface PrintingResolveRef {
  ref: string;
  game: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  name?: string | null;
  language?: string | null;
  finish?: string | null;
}

export interface PrintingResolveCandidate {
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
}

export interface PrintingResolveResult {
  ref: string;
  status: 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';
  candidates: PrintingResolveCandidate[];
}

/**
 * Matches rows to catalog printings. The controller wires the existing catalog resolver (cardCatalogLookup.resolveRefs) here;
 * it answers at most 500 refs per call, so the service sends them in groups of 500. A resolver is optional: without one every
 * row is saved as a typed card.
 */
export type PrintingResolver = (refs: PrintingResolveRef[]) => Promise<PrintingResolveResult[]>;

export interface ImportArgs {
  csvText?: string | null;
  rows?: ImportRowInput[] | null;
  dryRun: boolean;
  /** Game for rows that name none. Default MTG. */
  defaultGame?: string | null;
  resolver?: PrintingResolver | null;
}

export interface ImportSummary {
  dryRun: boolean;
  rowCount: number;
  willCreate: number;
  willUpdate: number;
  /** Rows saved as typed cards because no single catalog printing matched. */
  unresolved: number;
  duplicatesInFile: number;
  /** row is the spreadsheet row number for a CSV (the header is row 1) and the position (from 1) for a list of rows. */
  rejected: Array<{ row: number; reason: string }>;
  saved: boolean;
}

const FINISH_SYNONYMS: Record<string, string> = {
  NONFOIL: 'NONFOIL',
  NON_FOIL: 'NONFOIL',
  NORMAL: 'NONFOIL',
  FOIL: 'FOIL',
  ETCHED: 'ETCHED',
  ETCHED_FOIL: 'ETCHED',
  HOLO: 'HOLO',
  HOLOFOIL: 'HOLO',
  REVERSE_HOLO: 'REVERSE_HOLO',
  REVERSE: 'REVERSE_HOLO',
  REVERSEHOLO: 'REVERSE_HOLO',
};

function importFinish(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (t === '') return 'NONFOIL';
  return FINISH_SYNONYMS[t] ?? null;
}

function rowText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

interface ParsedRow {
  rowNumber: number;
  game: string;
  setCode: string | null;
  collectorNumber: string | null;
  name: string | null;
  finish: string;
  language: string;
  valueCents: number;
  note: string | null;
}

function rowsFromCsv(csvText: string): { rows: ImportRowInput[]; firstRowNumber: number } {
  if (Buffer.byteLength(csvText, 'utf8') > MAX_IMPORT_BYTES) {
    throw validationError('This file is too large. The limit is 2 MB.', { code: 'FILE_TOO_LARGE' });
  }
  const table = parseCsv(csvText);
  const header = table[0];
  if (!header) throw validationError('The file is empty.', { code: 'EMPTY_FILE' });
  const names = header.map(normalizeHeader);
  for (const h of header) {
    if (isForeignPriceHeader(h)) throw new PriceBookError('FOREIGN_PRICE_COLUMN', COPY.foreignFile, 400);
  }
  const index = new Map<string, number>();
  names.forEach((n, i) => {
    if ((IMPORT_HEADERS as readonly string[]).includes(n) && !index.has(n)) index.set(n, i);
  });
  if (!index.has('price')) throw validationError('The file needs a Price column.', { code: 'MISSING_COLUMNS' });
  if (!index.has('name') && !(index.has('set code') && index.has('collector number'))) {
    throw validationError('The file needs a Name column, or Set code and Collector number columns.', { code: 'MISSING_COLUMNS' });
  }
  const dataRows = table.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw validationError(`This file has more than ${MAX_IMPORT_ROWS} rows. Split it and import it in parts.`, { code: 'TOO_MANY_ROWS' });
  }
  const cell = (r: string[], h: string): string | undefined => {
    const i = index.get(h);
    return i === undefined ? undefined : r[i];
  };
  const rows: ImportRowInput[] = dataRows.map((r) => ({
    setCode: cell(r, 'set code'),
    collectorNumber: cell(r, 'collector number'),
    name: cell(r, 'name'),
    game: cell(r, 'game'),
    finish: cell(r, 'finish'),
    language: cell(r, 'language'),
    price: cell(r, 'price'),
    note: cell(r, 'note'),
  }));
  return { rows, firstRowNumber: 2 };
}

function rowsFromList(list: ImportRowInput[]): { rows: ImportRowInput[]; firstRowNumber: number } {
  if (!Array.isArray(list)) throw validationError('rows must be a list.', { field: 'rows' });
  if (list.length > MAX_IMPORT_ROWS) {
    throw validationError(`You can import at most ${MAX_IMPORT_ROWS} rows at once.`, { code: 'TOO_MANY_ROWS' });
  }
  for (const row of list) {
    if (typeof row !== 'object' || row === null) throw validationError('Each row must be an object.', { field: 'rows' });
    for (const key of Object.keys(row)) {
      if (isForeignPriceHeader(key) && !(key in ROW_KEY_TO_HEADER)) throw new PriceBookError('FOREIGN_PRICE_COLUMN', COPY.foreignFile, 400);
    }
  }
  return { rows: list, firstRowNumber: 1 };
}

/**
 * Imports the shop's own price list (5,000 rows, 2 MB). Nothing else in the file is read. A header that looks like a
 * marketplace price column rejects the whole file (FOREIGN_PRICE_COLUMN). dryRun true returns the counts and writes nothing;
 * rows that cannot be used are listed with plain reasons. A row that does not match exactly one catalog printing is saved as a
 * typed card. Within the file, a later row for the same card, finish and language replaces an earlier one.
 */
export async function importReferences(ctx: ServiceCtx, args: ImportArgs): Promise<ImportSummary> {
  const hasCsv = typeof args.csvText === 'string' && args.csvText !== '';
  const hasRows = Array.isArray(args.rows);
  if (hasCsv === hasRows) throw validationError('Send either a file or a list of rows.', { field: 'csvText' });
  const { rows, firstRowNumber } = hasCsv ? rowsFromCsv(args.csvText as string) : rowsFromList(args.rows as ImportRowInput[]);
  const defaultGame = args.defaultGame ? cleanGame(args.defaultGame) : 'MTG';

  const rejected: Array<{ row: number; reason: string }> = [];
  const parsed: ParsedRow[] = [];
  rows.forEach((raw, i) => {
    const rowNumber = firstRowNumber + i;
    const reject = (reason: string) => rejected.push({ row: rowNumber, reason });
    const priceText = rawPrice(raw.price);
    const name = rowText(raw.name);
    const setCode = rowText(raw.setCode);
    const collectorNumber = rowText(raw.collectorNumber);
    if (name === '' && !(setCode !== '' && collectorNumber !== '')) return reject('Add a card name, or a set code and collector number.');
    const gameText = rowText(raw.game).toUpperCase().replace(/[\s-]+/g, '_');
    const game = gameText === '' ? defaultGame : gameText === 'MAGIC' ? 'MTG' : gameText;
    if (!KNOWN_GAMES.includes(game)) return reject('The game is not recognized.');
    const finish = importFinish(rowText(raw.finish));
    if (finish === null) return reject('The finish is not recognized.');
    const languageText = rowText(raw.language).toLowerCase();
    const language = languageText === '' ? 'en' : languageText;
    if (!LANGUAGE_PATTERN.test(language)) return reject('The language is not recognized.');
    const cents = parseMoneyToCents(priceText);
    if (cents === null) return reject('The price must be in dollars with at most two decimals.');
    if (cents < 1) return reject('The price must be more than zero.');
    const noteText = rowText(raw.note);
    if (noteText.length > MAX_NOTE_LENGTH) return reject(`The note is longer than ${MAX_NOTE_LENGTH} characters.`);
    parsed.push({
      rowNumber,
      game,
      setCode: setCode === '' ? null : setCode.toLowerCase(),
      collectorNumber: collectorNumber === '' ? null : collectorNumber,
      name: name === '' ? null : name.slice(0, MAX_CARD_NAME_LENGTH),
      finish,
      language,
      valueCents: cents,
      note: noteText === '' ? null : noteText,
    });
  });

  // Resolve rows to catalog printings.
  const resolved = new Map<number, PrintingResolveCandidate>();
  if (args.resolver && parsed.length > 0) {
    const refs: PrintingResolveRef[] = parsed.map((p) => ({
      ref: String(p.rowNumber),
      game: p.game,
      setCode: p.setCode,
      collectorNumber: p.collectorNumber,
      name: p.name,
      language: p.language,
      finish: p.finish,
    }));
    for (const part of chunk(refs, 500)) {
      const results = await args.resolver(part);
      for (const r of results) {
        const only = r.candidates[0];
        if (r.status === 'EXACT' && r.candidates.length === 1 && only) resolved.set(Number(r.ref), only);
      }
    }
  }

  interface Target {
    row: ParsedRow;
    identity: CardIdentity;
  }
  const targets = new Map<string, Target>();
  let unresolved = 0;
  let duplicatesInFile = 0;
  for (const row of parsed) {
    const printing = resolved.get(row.rowNumber);
    let identity: CardIdentity;
    if (printing) {
      const printingRow: CardPrintingRow = {
        id: printing.id,
        source: printing.source ?? '',
        game: printing.game,
        name: printing.name,
        setCode: printing.setCode,
        setName: printing.setName ?? null,
        collectorNumber: printing.collectorNumber ?? null,
        language: printing.language ?? null,
        rarity: printing.rarity ?? null,
        finishes: printing.finishes ?? [],
      };
      if (printingRow.finishes.length > 0 && !printingRow.finishes.includes(row.finish)) {
        rejected.push({ row: row.rowNumber, reason: 'This card does not come in that finish.' });
        continue;
      }
      identity = identityFromPrinting(printingRow);
    } else {
      unresolved += 1;
      identity = identityFromTyped({ game: row.game, setCode: row.setCode, collectorNumber: row.collectorNumber, cardName: row.name });
    }
    const key = `${identity.cardKey}|${row.finish}|${row.language}`;
    if (targets.has(key)) {
      duplicatesInFile += 1;
      if (!printing) unresolved -= 1;
    }
    targets.set(key, { row, identity });
  }
  rejected.sort((a, b) => a.row - b.row);

  // Existing references.
  const book = args.dryRun ? await findBook(ctx.db, ctx.organizerId) : await ensureBook(ctx);
  const existing = new Map<string, ReferenceRow>();
  if (book) {
    const keys = Array.from(new Set(Array.from(targets.values()).map((t) => t.identity.cardKey)));
    for (const part of chunk(keys, 500)) {
      for (const r of await ctx.db.priceBookReference.findMany({ where: { bookId: book.id, cardKey: { in: part } } })) {
        existing.set(`${r.cardKey}|${r.finish}|${r.language}`, r);
      }
    }
  }
  let willCreate = 0;
  let willUpdate = 0;
  const toCreate: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const [key, t] of targets) {
    const fields = {
      catalogPrintingId: t.identity.catalogPrintingId,
      game: t.identity.game,
      cardName: truncate(t.identity.cardName, MAX_CARD_NAME_LENGTH),
      setCode: t.identity.setCode,
      setName: t.identity.setName,
      collectorNumber: t.identity.collectorNumber,
      valueCents: t.row.valueCents,
      note: t.row.note,
      asOf: ctx.now,
      enteredByUserId: ctx.userId ?? null,
    };
    const have = existing.get(key);
    if (have) {
      willUpdate += 1;
      toUpdate.push({ id: have.id, data: fields });
    } else {
      willCreate += 1;
      toCreate.push({ bookId: book ? book.id : '', cardKey: t.identity.cardKey, finish: t.row.finish, language: t.row.language, ...fields });
    }
  }

  const summary: ImportSummary = {
    dryRun: args.dryRun === true,
    rowCount: rows.length,
    willCreate,
    willUpdate,
    unresolved,
    duplicatesInFile,
    rejected,
    saved: false,
  };
  if (args.dryRun === true || !book) return summary;

  await ctx.db.$transaction(async (tx) => {
    for (const part of chunk(toCreate, 500)) await tx.priceBookReference.createMany({ data: part });
    for (const u of toUpdate) await tx.priceBookReference.updateMany({ where: { id: u.id, bookId: book.id }, data: u.data });
  });
  summary.saved = true;
  return summary;
}

function rawPrice(v: unknown): unknown {
  return typeof v === 'string' ? v.trim() : v;
}

// ---------------------------------------------------------------------------------------------
// Benchmarks (SHOP_BENCHMARK)
// ---------------------------------------------------------------------------------------------

export async function listBenchmarks(ctx: ServiceCtx): Promise<BenchmarkRow[]> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) return [];
  return ctx.db.priceBookBenchmark.findMany({ where: { bookId: book.id }, orderBy: [{ game: 'asc' }, { rarityClass: 'asc' }, { finish: 'asc' }] });
}

export interface UpsertBenchmarkInput {
  game: string;
  rarityClass: string;
  finish: string;
  valueCents: number;
  note?: string | null;
  asOf?: Date | string | null;
}

/** Upserts by (game, rarity class, finish). Bumps the book version when anything changed. */
export async function upsertBenchmark(ctx: ServiceCtx, input: UpsertBenchmarkInput): Promise<{ benchmark: BenchmarkRow; created: boolean }> {
  const game = cleanGame(input.game);
  const rarityClass = typeof input.rarityClass === 'string' ? input.rarityClass.trim().toUpperCase() : '';
  if (!(RARITY_CLASSES as readonly string[]).includes(rarityClass) || rarityClass === 'UNKNOWN') {
    throw validationError('That kind of card is not known.', { field: 'rarityClass' });
  }
  const finish = typeof input.finish === 'string' ? input.finish.trim().toUpperCase() : '';
  if (!(FINISHES_OR_ANY as readonly string[]).includes(finish)) throw validationError('That finish is not known.', { field: 'finish' });
  const valueCents = cleanValueCents(input.valueCents);
  const note = cleanNote(input.note);
  const asOf = cleanAsOf(input.asOf, ctx.now);
  const book = await ensureBook(ctx);
  const where = { bookId: book.id, game, rarityClass, finish };

  return ctx.db.$transaction(async (tx) => {
    const have = await tx.priceBookBenchmark.findFirst({ where });
    if (have) {
      const same = have.valueCents === valueCents && have.note === note && have.asOf.getTime() === asOf.getTime();
      if (!same) {
        await tx.priceBookBenchmark.updateMany({ where: { id: have.id, bookId: book.id }, data: { valueCents, note, asOf } });
        await bumpBookVersion(tx, book.id);
      }
      const fresh = await tx.priceBookBenchmark.findFirst({ where: { id: have.id, bookId: book.id } });
      if (!fresh) throw notFoundError();
      return { benchmark: fresh, created: false };
    }
    const row = await tx.priceBookBenchmark.create({ data: { ...where, valueCents, note, asOf } });
    await bumpBookVersion(tx, book.id);
    return { benchmark: row, created: true };
  });
}

export async function deleteBenchmark(ctx: ServiceCtx, benchmarkId: string): Promise<void> {
  const book = await requireBook(ctx);
  await ctx.db.$transaction(async (tx) => {
    const res = await tx.priceBookBenchmark.deleteMany({ where: { id: benchmarkId, bookId: book.id } });
    if (res.count !== 1) throw notFoundError();
    await bumpBookVersion(tx, book.id);
  });
}

// ---------------------------------------------------------------------------------------------
// Bulk rate card (section 8): persistence of the grid; the arithmetic lives in bulkRates.ts
// ---------------------------------------------------------------------------------------------

export function toBulkRate(row: BulkRateRow): BulkRate {
  return {
    direction: row.direction,
    game: row.game,
    tier: row.tier,
    finish: row.finish,
    unit: row.unit,
    rateCents: row.rateCents,
    creditRateCents: row.creditRateCents,
    benchmarkNote: row.benchmarkNote,
    benchmarkRateCents: row.benchmarkRateCents,
    benchmarkAsOf: row.benchmarkAsOf,
  };
}

/** Every rate of the book, for the engine (BULK_RATE basis) and the lot run. */
export async function loadBulkRates(db: PriceBookTx, bookId: string, game?: string): Promise<BulkRateRow[]> {
  const where: Record<string, unknown> = { bookId };
  if (game) where.game = game.trim().toUpperCase();
  return db.priceBookBulkRate.findMany({ where, orderBy: [{ direction: 'asc' }, { tier: 'asc' }, { finish: 'asc' }, { unit: 'asc' }] });
}

export async function listBulkRates(ctx: ServiceCtx, game?: string): Promise<BulkRateRow[]> {
  const book = await findBook(ctx.db, ctx.organizerId);
  if (!book) return [];
  return loadBulkRates(ctx.db, book.id, game);
}

export interface BulkRateInput {
  direction: string;
  tier: string;
  finish?: string | null;
  unit: string;
  /** Cents per card or per 1,000 cards. Null deletes the cell. */
  rateCents: number | null;
  /** BUY only. Undefined keeps the stored value, null clears it. */
  creditRateCents?: number | null;
  benchmarkNote?: string | null;
  benchmarkRateCents?: number | null;
  benchmarkAsOf?: Date | string | null;
}

export interface SaveBulkRatesArgs {
  game: string;
  rates: BulkRateInput[];
  ifVersion?: number;
  /** True returns the counts and warnings and writes nothing. */
  dryRun?: boolean;
}

export interface SaveBulkRatesResult {
  dryRun: boolean;
  created: number;
  updated: number;
  deleted: number;
  /** created + updated + deleted: the number in "Saved. 14 rates changed." */
  changed: number;
  warnings: RateChangeWarning[];
  version: number | null;
}

interface CleanRate {
  direction: string;
  tier: string;
  finish: string;
  unit: string;
  rateCents: number | null;
  creditRateCents: number | null | undefined;
  benchmarkNote: string | null | undefined;
  benchmarkRateCents: number | null | undefined;
  benchmarkAsOf: Date | null | undefined;
}

function cleanRateInput(input: BulkRateInput, now: Date): CleanRate {
  const direction = String(input.direction ?? '').trim().toUpperCase();
  if (!(DIRECTIONS as readonly string[]).includes(direction)) throw validationError('Choose We sell or We buy.', { field: 'direction' });
  const tier = String(input.tier ?? '').trim().toUpperCase();
  if (!(TIERS as readonly string[]).includes(tier)) throw validationError('That kind of bulk is not known.', { field: 'tier' });
  const finish = String(input.finish ?? 'ANY').trim().toUpperCase() || 'ANY';
  if (!(FINISHES_OR_ANY as readonly string[]).includes(finish)) throw validationError('That finish is not known.', { field: 'finish' });
  const unit = String(input.unit ?? '').trim().toUpperCase();
  if (!(UNITS as readonly string[]).includes(unit)) throw validationError('Choose per card or per 1,000.', { field: 'unit' });
  const max = unit === 'PER_1000' ? MAX_RATE_PER_1000_CENTS : MAX_RATE_PER_CARD_CENTS;
  let rateCents: number | null = null;
  if (input.rateCents !== null) {
    if (typeof input.rateCents !== 'number' || !Number.isSafeInteger(input.rateCents) || input.rateCents < 1 || input.rateCents > max) {
      throw validationError('A rate must be more than zero and within the limit for its unit.', { field: 'rateCents' });
    }
    rateCents = input.rateCents;
  }
  let creditRateCents: number | null | undefined = undefined;
  if (input.creditRateCents !== undefined) {
    if (input.creditRateCents === null) creditRateCents = null;
    else {
      if (direction !== 'BUY') throw validationError('A store credit rate is for the buying side only.', { field: 'creditRateCents' });
      if (typeof input.creditRateCents !== 'number' || !Number.isSafeInteger(input.creditRateCents) || input.creditRateCents < 0 || input.creditRateCents > max) {
        throw validationError('The store credit rate is not valid.', { field: 'creditRateCents' });
      }
      creditRateCents = input.creditRateCents;
    }
  }
  let benchmarkRateCents: number | null | undefined = undefined;
  if (input.benchmarkRateCents !== undefined) {
    if (input.benchmarkRateCents === null) benchmarkRateCents = null;
    else {
      if (typeof input.benchmarkRateCents !== 'number' || !Number.isSafeInteger(input.benchmarkRateCents) || input.benchmarkRateCents < 1 || input.benchmarkRateCents > max) {
        throw validationError('The noted rate is not valid.', { field: 'benchmarkRateCents' });
      }
      benchmarkRateCents = input.benchmarkRateCents;
    }
  }
  const benchmarkNote = input.benchmarkNote === undefined ? undefined : cleanNote(input.benchmarkNote);
  let benchmarkAsOf: Date | null | undefined = undefined;
  if (input.benchmarkAsOf !== undefined) benchmarkAsOf = input.benchmarkAsOf === null ? null : cleanAsOf(input.benchmarkAsOf, now);
  return { direction, tier, finish, unit, rateCents, creditRateCents, benchmarkNote, benchmarkRateCents, benchmarkAsOf };
}

const sameDate = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());

/**
 * Saves the cells of one game's grid in one transaction with one version bump. A cell with rateCents null is deleted; a cell
 * that is not in the request is left alone. Returns the rates that moved by more than 50 percent or look like a decimal slip,
 * so the screen can ask before saving (call with dryRun true first).
 */
export async function saveBulkRates(ctx: ServiceCtx, args: SaveBulkRatesArgs): Promise<SaveBulkRatesResult> {
  const game = cleanGame(args.game);
  if (!Array.isArray(args.rates)) throw validationError('rates must be a list.', { field: 'rates' });
  if (args.rates.length > MAX_RATE_ROWS) throw validationError(`You can save at most ${MAX_RATE_ROWS} rates at once.`, { field: 'rates' });
  const cleaned = args.rates.map((r) => cleanRateInput(r, ctx.now));
  const seen = new Set<string>();
  for (const c of cleaned) {
    const k = `${c.direction}|${c.tier}|${c.finish}|${c.unit}`;
    if (seen.has(k)) throw validationError('Each rate can be listed only once.', { field: 'rates' });
    seen.add(k);
  }
  const dryRun = args.dryRun === true;
  const book = dryRun ? await findBook(ctx.db, ctx.organizerId) : await ensureBook(ctx);
  if (book && args.ifVersion !== undefined && args.ifVersion !== book.version) throw versionConflictError();

  const run = async (tx: PriceBookTx): Promise<SaveBulkRatesResult> => {
    const current = book ? await loadBulkRates(tx, book.id, game) : [];
    const byKey = new Map(current.map((r) => [`${r.direction}|${r.tier}|${r.finish}|${r.unit}`, r]));
    let created = 0;
    let updated = 0;
    let deleted = 0;
    const toCreate: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
    const toDelete: string[] = [];
    const after: BulkRate[] = [];
    for (const c of cleaned) {
      const have = byKey.get(`${c.direction}|${c.tier}|${c.finish}|${c.unit}`);
      if (c.rateCents === null) {
        if (have) {
          deleted += 1;
          toDelete.push(have.id);
        }
        continue;
      }
      const next = {
        rateCents: c.rateCents,
        creditRateCents: c.creditRateCents === undefined ? (have ? have.creditRateCents : null) : c.creditRateCents,
        benchmarkNote: c.benchmarkNote === undefined ? (have ? have.benchmarkNote : null) : c.benchmarkNote,
        benchmarkRateCents: c.benchmarkRateCents === undefined ? (have ? have.benchmarkRateCents : null) : c.benchmarkRateCents,
        benchmarkAsOf: c.benchmarkAsOf === undefined ? (have ? have.benchmarkAsOf : null) : c.benchmarkAsOf,
      };
      after.push({ direction: c.direction, game, tier: c.tier, finish: c.finish, unit: c.unit, ...next });
      if (!have) {
        created += 1;
        toCreate.push({ bookId: book ? book.id : '', direction: c.direction, game, tier: c.tier, finish: c.finish, unit: c.unit, ...next });
      } else if (
        have.rateCents !== next.rateCents ||
        have.creditRateCents !== next.creditRateCents ||
        have.benchmarkNote !== next.benchmarkNote ||
        have.benchmarkRateCents !== next.benchmarkRateCents ||
        !sameDate(have.benchmarkAsOf, next.benchmarkAsOf)
      ) {
        updated += 1;
        toUpdate.push({ id: have.id, data: next });
      }
    }
    const warnings = rateChangeWarnings(current.map(toBulkRate), after);
    const changed = created + updated + deleted;
    if (dryRun || !book) return { dryRun, created, updated, deleted, changed, warnings, version: book ? book.version : null };
    if (toCreate.length > 0) await tx.priceBookBulkRate.createMany({ data: toCreate });
    for (const u of toUpdate) await tx.priceBookBulkRate.updateMany({ where: { id: u.id, bookId: book.id }, data: u.data });
    for (const id of toDelete) await tx.priceBookBulkRate.deleteMany({ where: { id, bookId: book.id } });
    if (changed > 0) await bumpBookVersion(tx, book.id);
    const fresh = await tx.priceBook.findFirst({ where: { id: book.id } });
    return { dryRun, created, updated, deleted, changed, warnings, version: fresh ? fresh.version : book.version };
  };
  return dryRun ? run(ctx.db) : ctx.db.$transaction(run);
}

export interface AdjustBulkRatesArgs {
  game: string;
  finish?: string | null;
  direction: string;
  /** Signed change in basis points: -1000 is minus 10 percent. */
  percentBps: number;
  apply: boolean;
  ifVersion?: number;
}

export interface AdjustBulkRatesResult {
  applied: boolean;
  changes: RateAdjustment[];
  unchangedCount: number;
  version: number | null;
}

/** "Move all sell rates": the before and after for one game, direction and optional finish. apply true saves them. */
export async function adjustBulkRates(ctx: ServiceCtx, args: AdjustBulkRatesArgs): Promise<AdjustBulkRatesResult> {
  const game = cleanGame(args.game);
  const finish = args.finish ? String(args.finish).trim().toUpperCase() : null;
  if (finish !== null && !(FINISHES_OR_ANY as readonly string[]).includes(finish)) throw validationError('That finish is not known.', { field: 'finish' });
  const book = args.apply ? await ensureBook(ctx) : await findBook(ctx.db, ctx.organizerId);
  if (book && args.ifVersion !== undefined && args.ifVersion !== book.version) throw versionConflictError();
  const rows = book ? await loadBulkRates(ctx.db, book.id, game) : [];
  const result = adjustRates(rows.map(toBulkRate), { percentBps: args.percentBps, direction: args.direction, game, finish });
  if (!result.ok) {
    throw validationError(result.code === 'BAD_PERCENT' ? 'The change must be from minus 90 percent to plus 1,000 percent.' : 'Choose We sell or We buy.', { code: result.code });
  }
  if (!args.apply || !book || result.changes.length === 0) {
    return { applied: false, changes: result.changes, unchangedCount: result.unchangedCount, version: book ? book.version : null };
  }
  const version = await ctx.db.$transaction(async (tx) => {
    for (const c of result.changes) {
      await tx.priceBookBulkRate.updateMany({
        where: { bookId: book.id, direction: c.direction, game: c.game, tier: c.tier, finish: c.finish, unit: c.unit },
        data: { rateCents: c.afterCents, creditRateCents: c.creditAfterCents },
      });
    }
    await bumpBookVersion(tx, book.id);
    const fresh = await tx.priceBook.findFirst({ where: { id: book.id } });
    return fresh ? fresh.version : book.version + 1;
  });
  return { applied: true, changes: result.changes, unchangedCount: result.unchangedCount, version };
}

/** The defaults, for a caller that needs book settings before a book exists. */
export function settingsOrDefault(book: Parameters<typeof toBookSettings>[0] | null): BookSettings {
  return book ? toBookSettings(book) : defaultSettings();
}
