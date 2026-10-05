/**
 * bulkLotService (ADR-136, roadmap #659): database side of bulk lots for card shops.
 *
 * A bulk lot is an ordinary Item (a count of cards sold by the thousand) plus a 1:1 ItemBulkLot marker row.
 *  - The number of cards in stock is Item.stockTotal and the number sold is Item.stockSold. The atomic, guarded
 *    decrement is itemStockService.sellItemUnits (called by the register path, not by this module).
 *  - Item.price is the price per 1,000 cards, in dollars. It is converted once to integer cents (bulkLotPricing).
 *  - Purchase.bulkQuantity is the number of cards a Purchase row sold. Refunds read it.
 *
 * Design rules (same as cardRecordService):
 *  - The database client is injected (BulkLotDb), never imported, so a unit test can pass a fake. This module
 *    reads no env var and imports no Prisma client. The feature flag is read by callers (bulkLotConfig).
 *  - Input is parsed with zod schemas declared .strict(): an unknown key is rejected, never ignored.
 *  - The server, never the request body, supplies organizerId, saleId and stockSold.
 *  - Protective lookups (findBulkLotItemIds) run whether or not the flag is on, because a lot created while the
 *    flag was on must never be sold as one $/1,000 unit by a path that does not understand lots. When the lookup
 *    itself fails the answer depends on the flag: flag off, fail open (nothing can be a lot); flag on, fail closed.
 */
import { z } from 'zod';
import { CARD_ITEM_CATEGORY } from '../cardIntake/buildItem';
import {
  MAX_LOT_CARDS,
  MIN_LOT_CARDS,
  LADDER_STEPS,
  buildPriceLadder,
  formatCardCount,
  formatCents,
  formatPerCardPrice,
  parseWholeNumber,
  priceCentsForCards,
  pricePerThousandCentsFromDollars,
  remainingCards,
} from './bulkLotPricing';
import { BULK_LOT_KINDS, BULK_LOT_KIND_LABELS, DEFAULT_BULK_LOT_GAME, DEFAULT_BULK_LOT_KIND, BulkLotKind } from './bulkLotVocabulary';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BulkLotErrorCode =
  | 'BULK_DISABLED'
  | 'BULK_VALIDATION'
  | 'BULK_NOT_FOUND'
  | 'BULK_NOT_LOT'
  | 'BULK_ALREADY_LOT'
  | 'BULK_NOT_ELIGIBLE'
  | 'BULK_HAS_SALES'
  | 'BULK_TOTAL_BELOW_SOLD'
  | 'BULK_QUANTITY_REQUIRED'
  | 'BULK_CHECK_FAILED'
  | 'BULK_CHANNEL_UNSUPPORTED'
  | 'BAD_QUANTITY'
  | 'BAD_PRICE'
  | 'QUANTITY_TOO_SMALL'
  | 'NOT_AVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED';

export class BulkLotError extends Error {
  readonly status: number;
  readonly code: BulkLotErrorCode;
  readonly extra?: Record<string, unknown>;
  constructor(message: string, status: number, code: BulkLotErrorCode, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'BulkLotError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    Object.setPrototypeOf(this, BulkLotError.prototype);
  }
}

/** Duck-typed so it still works if a module is loaded twice (jest module registries). */
export function isBulkLotError(err: unknown): err is BulkLotError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'BulkLotError' && typeof (err as { code?: unknown }).code === 'string';
}

/** Plain-language text for every code. No exclamation marks, no dashes, no jargon. */
export const BULK_LOT_MESSAGES: Record<BulkLotErrorCode, string> = {
  BULK_DISABLED: 'Bulk lots are not turned on for this shop yet.',
  BULK_VALIDATION: 'Some of the bulk lot details need another look.',
  BULK_NOT_FOUND: 'That item was not found.',
  BULK_NOT_LOT: 'That item is not a bulk lot.',
  BULK_ALREADY_LOT: 'That item is already a bulk lot.',
  BULK_NOT_ELIGIBLE: 'Only a fixed price item that is still available and not listed on eBay can become a bulk lot.',
  BULK_HAS_SALES: 'This item has already sold, so it cannot become a bulk lot.',
  BULK_TOTAL_BELOW_SOLD: 'The total cannot be lower than the number of cards already sold.',
  BULK_QUANTITY_REQUIRED: 'Enter how many cards to sell from this bulk lot.',
  BULK_CHECK_FAILED: 'Could not check whether this item is a bulk lot. Try again in a moment.',
  BULK_CHANNEL_UNSUPPORTED: 'Bulk lots can be sold at the register with cash, Venmo or Zelle. Other payment methods are not available for bulk lots yet.',
  BAD_QUANTITY: 'Enter a whole number of cards, 1 or more.',
  BAD_PRICE: 'This bulk lot does not have a valid price per 1,000 cards.',
  QUANTITY_TOO_SMALL: 'That many cards rounds to less than one cent at this price. Sell a larger quantity.',
  NOT_AVAILABLE: 'This bulk lot is sold out or not available.',
  INSUFFICIENT_STOCK: 'There are not enough cards left in this bulk lot.',
  PRICE_CHANGED: 'The price changed since this was added. Re-check the quantity and total.',
};

export function bulkLotError(code: BulkLotErrorCode, status: number, extra?: Record<string, unknown>): BulkLotError {
  return new BulkLotError(BULK_LOT_MESSAGES[code], status, code, extra);
}

// ---------------------------------------------------------------------------
// Database shape (what a fake must provide) and selects
// ---------------------------------------------------------------------------

export interface BulkLotDb {
  item: {
    findUnique(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  itemBulkLot: {
    findMany(args: any): Promise<any[]>;
  };
}

const LOT_ITEM_SELECT = {
  id: true,
  saleId: true,
  organizerId: true,
  title: true,
  description: true,
  price: true,
  status: true,
  isActive: true,
  draftStatus: true,
  stockTotal: true,
  stockSold: true,
  photoUrls: true,
  bulkLot: { select: { game: true, lotKind: true } },
} as const;

// ---------------------------------------------------------------------------
// zod schemas (.strict(): unknown keys are an error)
// ---------------------------------------------------------------------------

const totalCardsField = z
  .number({ invalid_type_error: 'Enter the number of cards as a whole number.', required_error: 'Enter the number of cards.' })
  .int('Enter the number of cards as a whole number.')
  .min(MIN_LOT_CARDS, `A bulk lot holds at least ${MIN_LOT_CARDS} cards.`)
  .max(MAX_LOT_CARDS, `A bulk lot holds at most ${formatCardCount(MAX_LOT_CARDS)} cards.`);

const pricePerThousandField = z
  .number({ invalid_type_error: 'Enter the price per 1,000 cards in dollars.', required_error: 'Enter the price per 1,000 cards.' })
  .refine((v) => pricePerThousandCentsFromDollars(v) !== null, 'Enter a price per 1,000 cards above $0.00.');

const lotKindField = z.string().refine((v) => (BULK_LOT_KINDS as readonly string[]).includes(v), 'Pick a lot type from the list.');

export const EnableLotSchema = z
  .object({
    totalCards: totalCardsField,
    pricePerThousand: pricePerThousandField,
    lotKind: lotKindField.optional(),
  })
  .strict();
export type EnableLotInput = z.infer<typeof EnableLotSchema>;

export const CreateLotItemSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a name for the lot.').max(80, 'Keep the name to 80 characters.'),
    totalCards: totalCardsField,
    pricePerThousand: pricePerThousandField,
    lotKind: lotKindField.optional(),
  })
  .strict();
export type CreateLotItemInput = z.infer<typeof CreateLotItemSchema>;

export const UpdateLotSchema = z
  .object({
    /** Set the total number of cards in the lot (must not be below the number already sold). */
    totalCards: totalCardsField.optional(),
    /** Add this many cards to the lot (a restock). */
    addCards: z
      .number({ invalid_type_error: 'Enter the cards to add as a whole number.' })
      .int('Enter the cards to add as a whole number.')
      .min(1, 'Add at least 1 card.')
      .max(MAX_LOT_CARDS, `Add at most ${formatCardCount(MAX_LOT_CARDS)} cards at a time.`)
      .optional(),
    pricePerThousand: pricePerThousandField.optional(),
    lotKind: lotKindField.optional(),
  })
  .strict()
  .refine((v) => v.totalCards === undefined || v.addCards === undefined, { message: 'Set the total or add cards, not both.', path: ['addCards'] })
  .refine((v) => v.totalCards !== undefined || v.addCards !== undefined || v.pricePerThousand !== undefined || v.lotKind !== undefined, {
    message: 'Nothing to change.',
  });
export type UpdateLotInput = z.infer<typeof UpdateLotSchema>;

export const QuoteSchema = z
  .object({
    quantity: z.union([z.number(), z.string()]),
  })
  .strict();

function parseWith<T>(schema: z.ZodType<T, any, any>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const text = issues.map((i) => i.message).join(' ') || BULK_LOT_MESSAGES.BULK_VALIDATION;
    throw new BulkLotError(text, 400, 'BULK_VALIDATION', { issues });
  }
  return result.data;
}

export const parseEnableLot = (raw: unknown): EnableLotInput => parseWith(EnableLotSchema, raw);
export const parseCreateLotItem = (raw: unknown): CreateLotItemInput => parseWith(CreateLotItemSchema, raw);
export const parseUpdateLot = (raw: unknown): UpdateLotInput => parseWith(UpdateLotSchema, raw);

// ---------------------------------------------------------------------------
// Views (pure). The browser never does pricing arithmetic: every figure it shows is built here.
// ---------------------------------------------------------------------------

export interface LadderRowView {
  cards: number;
  cardsLabel: string;
  cents: number;
  priceLabel: string;
  isAll: boolean;
}

export interface BulkLotView {
  itemId: string;
  saleId: string | null;
  title: string;
  description: string | null;
  game: string;
  lotKind: string;
  lotKindLabel: string;
  pricePerThousandCents: number | null;
  pricePerThousandLabel: string | null;
  perCardLabel: string | null;
  totalCards: number;
  soldCards: number;
  remainingCards: number;
  remainingLabel: string;
  soldOut: boolean;
  /** True when a register or shopper can buy from it right now. */
  available: boolean;
  ladder: LadderRowView[];
  photoUrl: string | null;
}

export interface OrganizerBulkLotView extends BulkLotView {
  status: string;
  isActive: boolean;
  draftStatus: string | null;
}

/** Row shape returned by LOT_ITEM_SELECT. */
export interface LotItemRow {
  id: string;
  saleId?: string | null;
  title: string;
  description?: string | null;
  price?: number | null;
  status: string;
  isActive?: boolean;
  draftStatus?: string | null;
  stockTotal?: number | null;
  stockSold?: number | null;
  photoUrls?: string[] | null;
  bulkLot?: { game?: string | null; lotKind?: string | null } | null;
}

function labelForKind(kind: string): string {
  return (BULK_LOT_KIND_LABELS as Record<string, string>)[kind] ?? BULK_LOT_KIND_LABELS[DEFAULT_BULK_LOT_KIND];
}

export function toBulkLotView(row: LotItemRow): BulkLotView {
  const total = typeof row.stockTotal === 'number' ? row.stockTotal : 1;
  const sold = typeof row.stockSold === 'number' ? row.stockSold : 0;
  const remaining = remainingCards(row.stockTotal, row.stockSold);
  const cents = pricePerThousandCentsFromDollars(row.price);
  const soldOut = remaining < 1 || row.status === 'SOLD';
  const kind = row.bulkLot?.lotKind ?? DEFAULT_BULK_LOT_KIND;
  const ladder: LadderRowView[] =
    cents !== null && !soldOut
      ? buildPriceLadder(cents, remaining, LADDER_STEPS).map((r) => ({
          cards: r.cards,
          cardsLabel: formatCardCount(r.cards),
          cents: r.cents,
          priceLabel: formatCents(r.cents),
          isAll: r.isAll,
        }))
      : [];
  return {
    itemId: row.id,
    saleId: row.saleId ?? null,
    title: row.title,
    description: row.description ?? null,
    game: row.bulkLot?.game ?? DEFAULT_BULK_LOT_GAME,
    lotKind: kind,
    lotKindLabel: labelForKind(kind),
    pricePerThousandCents: cents,
    pricePerThousandLabel: cents !== null ? `${formatCents(cents)} per 1,000 cards` : null,
    perCardLabel: cents !== null ? `${formatPerCardPrice(cents)} per card` : null,
    totalCards: total,
    soldCards: sold,
    remainingCards: remaining,
    remainingLabel: soldOut ? 'Sold out' : `${formatCardCount(remaining)} cards available`,
    soldOut,
    available: !soldOut && cents !== null && row.status === 'AVAILABLE',
    ladder,
    photoUrl: Array.isArray(row.photoUrls) && row.photoUrls.length > 0 ? row.photoUrls[0] : null,
  };
}

/** What the public pages and the public API may show: the price and the cards available, never the lot's total or sold counts. */
export type PublicBulkLotView = Omit<BulkLotView, 'totalCards' | 'soldCards'>;

export function toPublicBulkLotView(row: LotItemRow): PublicBulkLotView {
  const { totalCards: _totalCards, soldCards: _soldCards, ...publicView } = toBulkLotView(row);
  return publicView;
}

export function toOrganizerBulkLotView(row: LotItemRow): OrganizerBulkLotView {
  return { ...toBulkLotView(row), status: row.status, isActive: row.isActive !== false, draftStatus: row.draftStatus ?? null };
}

// ---------------------------------------------------------------------------
// Line planning (pure). Used by the register path and by the quote endpoint.
// ---------------------------------------------------------------------------

export interface PlannedBulkLine {
  cards: number;
  cents: number;
  pricePerThousandCents: number;
}

/**
 * Validates one register line for a lot and prices it. `quantity` is whatever the request carried (number or
 * digit string). `clientAmountDollars` is the total the register displayed for the line; when it is given and does
 * not equal the server price to the cent, the line is refused with PRICE_CHANGED (the price list or the lot
 * changed under the cashier). Pass null to skip that comparison (the quote endpoint).
 */
export function planBulkLine(
  row: Pick<LotItemRow, 'price' | 'status' | 'stockTotal' | 'stockSold'>,
  quantity: unknown,
  clientAmountDollars: number | null
): PlannedBulkLine {
  if (row.status !== 'AVAILABLE') throw bulkLotError('NOT_AVAILABLE', 400);
  const cards = parseWholeNumber(quantity);
  if (cards === null || cards < 1) throw bulkLotError('BAD_QUANTITY', 400);
  const pricePerThousandCents = pricePerThousandCentsFromDollars(row.price);
  if (pricePerThousandCents === null) throw bulkLotError('BAD_PRICE', 400);
  const remaining = remainingCards(row.stockTotal, row.stockSold);
  if (remaining < 1) throw bulkLotError('NOT_AVAILABLE', 400);
  if (cards > remaining) throw bulkLotError('INSUFFICIENT_STOCK', 409, { remaining });
  const priced = priceCentsForCards(cards, pricePerThousandCents);
  if (!priced.ok) {
    throw bulkLotError(priced.code === 'BAD_PRICE' ? 'BAD_PRICE' : priced.code === 'QUANTITY_TOO_SMALL' ? 'QUANTITY_TOO_SMALL' : 'BAD_QUANTITY', 400);
  }
  if (clientAmountDollars !== null) {
    const clientCents = Math.round(clientAmountDollars * 100);
    if (!Number.isFinite(clientCents) || clientCents !== priced.cents) {
      throw bulkLotError('PRICE_CHANGED', 409, { expectedCents: priced.cents });
    }
  }
  return { cards, cents: priced.cents, pricePerThousandCents };
}

// ---------------------------------------------------------------------------
// Protective lookup
// ---------------------------------------------------------------------------

/**
 * The subset of `itemIds` that are bulk lots. Safe to call with an empty list (returns an empty set without a query).
 * Runs regardless of the feature flag. On a database error: flag off, returns an empty set (fail open, so a
 * missing table before the migration is applied cannot break any existing sale path); flag on, throws
 * BULK_CHECK_FAILED (fail closed, so a lot is never sold as a single unit because a lookup hiccuped).
 */
export async function findBulkLotItemIds(db: Pick<BulkLotDb, 'itemBulkLot'>, itemIds: ReadonlyArray<string | null | undefined>, flagOn: boolean): Promise<Set<string>> {
  const ids = Array.from(new Set(itemIds.filter((v): v is string => typeof v === 'string' && v.length > 0)));
  if (ids.length === 0) return new Set<string>();
  try {
    const rows = await db.itemBulkLot.findMany({ where: { itemId: { in: ids } }, select: { itemId: true } });
    return new Set(rows.map((r: { itemId: string }) => r.itemId));
  } catch (err) {
    if (flagOn) {
      console.error('[bulkLot] lot lookup failed (failing closed, flag on):', err);
      throw bulkLotError('BULK_CHECK_FAILED', 503);
    }
    console.warn('[bulkLot] lot lookup failed (failing open, flag off):', err);
    return new Set<string>();
  }
}

/** Throws BULK_CHANNEL_UNSUPPORTED when any of `itemIds` is a bulk lot. Used by every channel that cannot sell lots. */
export async function assertNoBulkLots(db: Pick<BulkLotDb, 'itemBulkLot'>, itemIds: ReadonlyArray<string | null | undefined>, flagOn: boolean): Promise<void> {
  const lots = await findBulkLotItemIds(db, itemIds, flagOn);
  if (lots.size > 0) throw bulkLotError('BULK_CHANNEL_UNSUPPORTED', 409);
}

/**
 * Controller-friendly form of assertNoBulkLots: returns null when the channel may proceed, or the HTTP refusal
 * ({ status, message, code }) to send back. Never throws.
 */
export async function bulkChannelRefusal(
  db: Pick<BulkLotDb, 'itemBulkLot'>,
  itemIds: ReadonlyArray<string | null | undefined>,
  flagOn: boolean
): Promise<{ status: number; message: string; code: BulkLotErrorCode } | null> {
  try {
    await assertNoBulkLots(db, itemIds, flagOn);
    return null;
  } catch (err) {
    if (isBulkLotError(err)) return { status: err.status, message: err.message, code: err.code };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stock release (compensation and restock helpers)
// ---------------------------------------------------------------------------

/**
 * Puts `cards` cards back into a lot after a reservation that did not become a sale. Atomic decrement guarded so
 * stockSold never goes below zero; if the lot had been marked SOLD it returns to AVAILABLE when stock is left.
 */
export async function releaseBulkLotUnits(db: Pick<BulkLotDb, 'item'>, itemId: string, cards: number): Promise<void> {
  if (!Number.isSafeInteger(cards) || cards < 1) return;
  const dec = await db.item.updateMany({ where: { id: itemId, stockSold: { gte: cards } }, data: { stockSold: { decrement: cards } } });
  if (dec.count === 0) {
    // stockSold is lower than what we are returning (it was changed elsewhere). Floor at zero.
    await db.item.updateMany({ where: { id: itemId, stockSold: { gt: 0 } }, data: { stockSold: 0 } });
  }
  const row = await db.item.findUnique({ where: { id: itemId }, select: { status: true, stockTotal: true, stockSold: true } });
  if (row && row.status === 'SOLD' && remainingCards(row.stockTotal, row.stockSold) > 0) {
    await db.item.updateMany({ where: { id: itemId, status: 'SOLD' }, data: { status: 'AVAILABLE' } });
  }
}

// ---------------------------------------------------------------------------
// Organizer writes
// ---------------------------------------------------------------------------

export interface OrganizerCtx {
  organizerId: string;
}

/** Turns an existing card item into a bulk lot (one nested write: stock, price and the marker row together). */
export async function enableBulkLot(db: BulkLotDb, ctx: OrganizerCtx, itemId: string, rawInput: unknown): Promise<OrganizerBulkLotView> {
  const input = parseEnableLot(rawInput);
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      organizerId: true,
      status: true,
      listingType: true,
      stockSold: true,
      ebayListingId: true,
      ebayOfferId: true,
      card: { select: { id: true } },
      bulkLot: { select: { id: true } },
    },
  });
  // Another organizer's item looks exactly like a missing one.
  if (!item || item.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (item.bulkLot) throw bulkLotError('BULK_ALREADY_LOT', 409);
  if (!item.card) throw bulkLotError('BULK_NOT_ELIGIBLE', 409);
  if ((item.stockSold ?? 0) > 0) throw bulkLotError('BULK_HAS_SALES', 409);
  if (item.status !== 'AVAILABLE' || (item.listingType && item.listingType !== 'FIXED' && item.listingType !== 'POS') || item.ebayListingId || item.ebayOfferId) {
    throw bulkLotError('BULK_NOT_ELIGIBLE', 409);
  }
  const cents = pricePerThousandCentsFromDollars(input.pricePerThousand) as number;
  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      stockTotal: input.totalCards,
      price: cents / 100,
      ebayShippingOverride: 'DONT_LIST',
      bulkLot: {
        create: {
          organizerId: ctx.organizerId,
          game: DEFAULT_BULK_LOT_GAME,
          lotKind: (input.lotKind as BulkLotKind | undefined) ?? DEFAULT_BULK_LOT_KIND,
        },
      },
    },
    select: LOT_ITEM_SELECT,
  });
  return toOrganizerBulkLotView(updated);
}

/** Creates a new lot item directly in a sale the caller owns (the caller has already verified sale ownership). */
export async function createBulkLotItem(db: BulkLotDb, ctx: OrganizerCtx & { saleId: string }, rawInput: unknown): Promise<OrganizerBulkLotView> {
  const input = parseCreateLotItem(rawInput);
  const cents = pricePerThousandCentsFromDollars(input.pricePerThousand) as number;
  const created = await db.item.create({
    data: {
      saleId: ctx.saleId,
      organizerId: ctx.organizerId,
      title: input.title,
      description: `Bulk lot. Sold by the card at ${formatCents(cents)} per 1,000 cards.`,
      price: cents / 100,
      originalPrice: cents / 100,
      category: CARD_ITEM_CATEGORY,
      condition: 'USED',
      status: 'AVAILABLE',
      draftStatus: 'PUBLISHED',
      embedding: [],
      photoUrls: [],
      listingType: 'FIXED',
      stockTotal: input.totalCards,
      ebayShippingOverride: 'DONT_LIST',
      bulkLot: {
        create: {
          organizerId: ctx.organizerId,
          game: DEFAULT_BULK_LOT_GAME,
          lotKind: (input.lotKind as BulkLotKind | undefined) ?? DEFAULT_BULK_LOT_KIND,
        },
      },
    },
    select: LOT_ITEM_SELECT,
  });
  return toOrganizerBulkLotView(created);
}

/** Restock, set the total, change the price per 1,000 or the lot type. */
export async function updateBulkLot(db: BulkLotDb, ctx: OrganizerCtx, itemId: string, rawInput: unknown): Promise<OrganizerBulkLotView> {
  const input = parseUpdateLot(rawInput);
  const existing = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, organizerId: true, status: true, stockTotal: true, stockSold: true, bulkLot: { select: { id: true } } },
  });
  if (!existing || existing.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (!existing.bulkLot) throw bulkLotError('BULK_NOT_LOT', 409);

  const data: Record<string, unknown> = {};
  if (input.pricePerThousand !== undefined) {
    data.price = (pricePerThousandCentsFromDollars(input.pricePerThousand) as number) / 100;
  }

  // Stock changes are guarded at the database: the WHERE clause re-checks stockSold, so a register sale landing
  // between our read and this write can never push the total below what has sold.
  let newTotal: number | null = null;
  if (input.totalCards !== undefined) newTotal = input.totalCards;
  if (input.addCards !== undefined) newTotal = (existing.stockTotal ?? 1) + input.addCards;
  if (newTotal !== null) {
    if (newTotal > MAX_LOT_CARDS) throw bulkLotError('BULK_VALIDATION', 400);
    const guarded = await db.item.updateMany({
      where: { id: itemId, organizerId: ctx.organizerId, stockSold: { lte: newTotal } },
      data: { stockTotal: newTotal },
    });
    if (guarded.count === 0) throw bulkLotError('BULK_TOTAL_BELOW_SOLD', 409);
    // A lot that had sold out comes back on sale when the new total leaves cards.
    if (existing.status === 'SOLD') {
      const row = await db.item.findUnique({ where: { id: itemId }, select: { stockTotal: true, stockSold: true } });
      if (row && remainingCards(row.stockTotal, row.stockSold) > 0) {
        await db.item.updateMany({ where: { id: itemId, status: 'SOLD' }, data: { status: 'AVAILABLE' } });
      }
    }
  }

  if (input.lotKind !== undefined) {
    data.bulkLot = { update: { lotKind: input.lotKind } };
  }
  const hasMore = Object.keys(data).length > 0;
  const finalRow = hasMore
    ? await db.item.update({ where: { id: itemId }, data, select: LOT_ITEM_SELECT })
    : await db.item.findUnique({ where: { id: itemId }, select: LOT_ITEM_SELECT });
  if (!finalRow) throw bulkLotError('BULK_NOT_FOUND', 404);
  return toOrganizerBulkLotView(finalRow);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One lot for the item editor and the register, scoped to the caller's own items. */
export async function getOrganizerLot(db: BulkLotDb, ctx: OrganizerCtx, itemId: string): Promise<OrganizerBulkLotView | null> {
  const row = await db.item.findUnique({ where: { id: itemId }, select: LOT_ITEM_SELECT });
  if (!row || row.organizerId !== ctx.organizerId || !row.bulkLot) return null;
  return toOrganizerBulkLotView(row);
}

/** Every lot in a sale for its organizer (includes hidden and drafts). */
export async function listOrganizerLots(db: BulkLotDb, ctx: OrganizerCtx & { saleId: string }): Promise<OrganizerBulkLotView[]> {
  const rows = await db.item.findMany({
    where: { saleId: ctx.saleId, organizerId: ctx.organizerId, bulkLot: { isNot: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: LOT_ITEM_SELECT,
  });
  return rows.map(toOrganizerBulkLotView);
}

/**
 * Lots for the public page. `publicFilter` is PUBLIC_ITEM_FILTER, passed in by the controller so this module imports
 * no Prisma client. Public output (toPublicBulkLotView) carries no organizerId, no stockSold and no stockTotal: only the
 * cards available.
 */
export async function listPublicLots(db: BulkLotDb, saleId: string, publicFilter: Record<string, unknown>): Promise<PublicBulkLotView[]> {
  const rows = await db.item.findMany({
    where: { saleId, bulkLot: { isNot: null }, ...publicFilter },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: LOT_ITEM_SELECT,
  });
  return rows.map(toPublicBulkLotView);
}

export async function getPublicLot(db: BulkLotDb, itemId: string, publicFilter: Record<string, unknown>): Promise<PublicBulkLotView | null> {
  const rows = await db.item.findMany({
    where: { id: itemId, bulkLot: { isNot: null }, ...publicFilter },
    take: 1,
    select: LOT_ITEM_SELECT,
  });
  return rows.length > 0 ? toPublicBulkLotView(rows[0]) : null;
}

/** Organizer-side quote for one line. Reads only; never reserves stock. */
export async function quoteBulkLine(db: BulkLotDb, ctx: OrganizerCtx, itemId: string, rawQuantity: unknown): Promise<{ itemId: string; cards: number; cents: number; amount: number; remainingCards: number }> {
  const row = await db.item.findUnique({ where: { id: itemId }, select: LOT_ITEM_SELECT });
  if (!row || row.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (!row.bulkLot) throw bulkLotError('BULK_NOT_LOT', 409);
  const plan = planBulkLine(row, rawQuantity, null);
  return { itemId, cards: plan.cards, cents: plan.cents, amount: plan.cents / 100, remainingCards: remainingCards(row.stockTotal, row.stockSold) };
}
