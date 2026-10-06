/**
 * bulkLotPackService (ADR-136 Addendum E, roadmap #659): selling a bulk lot in fixed-size PACKS.
 *
 * What lives here: the lot-aware PLANNING that the hub cart, the shopper hold and the online checkout share. The pure math is in
 * bulkLotPacks.ts; this module adds the stock and status checks and the request parsing. It imports no Prisma client (the
 * database client is passed in) and reads no env var (callers pass the flag), same rules as bulkLotService.
 *
 * One rule matters more than the rest: the SERVER prices every pack line, from the lot's own price and pack size, at the moment
 * the line is taken. The browser may send the dollars it showed (`amount`); a difference of even one cent is PRICE_CHANGED.
 */
import { pricePerThousandCentsFromDollars, remainingCards } from './bulkLotPricing';
import { BulkLineRequest, BulkLotDb, LotItemRow, PlannedBulkLine, bulkLotError } from './bulkLotService';
import type { CartLotRequest, LotItemForCart } from './bulkLotBoothCartService';
import { PackView, buildPackView, cardsForPacks, packLineCents, packPriceCents, packsAvailable, parsePackCount, parsePackSize } from './bulkLotPacks';

/** A priced pack line. `cards` and `cents` are what the stock decrement and the money use; the rest is for display. */
export interface PackPlan extends PlannedBulkLine {
  packs: number;
  packSize: number;
  /** Price of ONE pack in cents. cents = packs * packCents. */
  packCents: number;
}

export type PackPlanRow = Pick<LotItemRow, 'price' | 'status' | 'stockTotal' | 'stockSold'>;

/**
 * Validates `packsRaw` packs of a pack-enabled lot and prices them. Throws BulkLotError:
 *   NOT_AVAILABLE (lot not for sale, or no cards left), BULK_PACK_COUNT (not a whole number from 1 to 50),
 *   BAD_PRICE / QUANTITY_TOO_SMALL / BULK_PACK_INVALID / BULK_PACK_TOO_PRICEY (the lot's price or pack size cannot be priced),
 *   INSUFFICIENT_STOCK 409 (extras: remaining cards and packsAvailable, so a screen can say how many packs are left),
 *   PRICE_CHANGED 409 (extras: expectedCents).
 * `clientAmountDollars` is the total the screen showed for the whole line; null skips that comparison.
 */
export function planPackLine(row: PackPlanRow, packSize: number | null | undefined, packsRaw: unknown, clientAmountDollars: number | null): PackPlan {
  const size = parsePackSize(packSize);
  if (size === null) throw bulkLotError('BULK_NOT_PACK', 409);
  if (row.status !== 'AVAILABLE') throw bulkLotError('NOT_AVAILABLE', 400);
  const packs = parsePackCount(packsRaw);
  if (packs === null) throw bulkLotError('BULK_PACK_COUNT', 400);
  const pricePerThousandCents = pricePerThousandCentsFromDollars(row.price);
  if (pricePerThousandCents === null) throw bulkLotError('BAD_PRICE', 400);
  const one = packPriceCents(size, pricePerThousandCents);
  if (!one.ok) throw bulkLotError(one.code, 400);
  const remaining = remainingCards(row.stockTotal, row.stockSold);
  if (remaining < 1) throw bulkLotError('NOT_AVAILABLE', 400);
  const left = packsAvailable(remaining, size);
  if (packs > left) throw bulkLotError('INSUFFICIENT_STOCK', 409, { remaining, packsAvailable: left });
  const cards = cardsForPacks(packs, size);
  if (cards === null) throw bulkLotError('BULK_PACK_COUNT', 400);
  const cents = packLineCents(packs, one.cents);
  if (clientAmountDollars !== null) {
    const clientCents = Math.round(clientAmountDollars * 100);
    if (!Number.isFinite(clientCents) || clientCents !== cents) throw bulkLotError('PRICE_CHANGED', 409, { expectedCents: cents });
  }
  return { cards, cents, pricePerThousandCents, packs, packSize: size, packCents: one.cents };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Pack size of each lot among `itemIds`: itemId -> pack size, or null when the lot is not sold in packs. An item that is not a lot
 * is absent from the map. Same failure rule as findBulkLotItemIds: flag on, a failed lookup is BULK_CHECK_FAILED 503 (a pack lot
 * must never be sold by the card because a lookup hiccuped); flag off, an empty map.
 */
export async function loadLotPackSizes(db: Pick<BulkLotDb, 'itemBulkLot'>, itemIds: ReadonlyArray<string | null | undefined>, flagOn: boolean): Promise<Map<string, number | null>> {
  const ids = Array.from(new Set(itemIds.filter((v): v is string => typeof v === 'string' && v.length > 0)));
  const out = new Map<string, number | null>();
  if (ids.length === 0) return out;
  try {
    const rows = await db.itemBulkLot.findMany({ where: { itemId: { in: ids } }, select: { itemId: true, packSize: true } });
    for (const r of rows as Array<{ itemId: string; packSize?: number | null }>) out.set(r.itemId, parsePackSize(r.packSize));
    return out;
  } catch (err) {
    if (flagOn) {
      console.error('[bulkLot] pack size lookup failed (failing closed, flag on):', err);
      throw bulkLotError('BULK_CHECK_FAILED', 503);
    }
    console.warn('[bulkLot] pack size lookup failed (failing open, flag off):', err);
    return new Map<string, number | null>();
  }
}

// ---------------------------------------------------------------------------
// Request parsing (hub cart)
// ---------------------------------------------------------------------------

export interface PackLineRequest {
  itemId: string;
  /** Whole packs, 1 to 50 (default 1 when the request leaves it out). */
  packs: number;
  /** Dollars the screen showed for the line, or null. */
  amount: number | null;
}

/** Reads the `packLines` array of a hub cart add. Absent means none. A bad count is BULK_PACK_COUNT, a bad shape BULK_VALIDATION. */
export function parsePackLineRequests(raw: unknown): PackLineRequest[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 200) throw bulkLotError('BULK_VALIDATION', 400);
  const seen = new Set<string>();
  const out: PackLineRequest[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') throw bulkLotError('BULK_VALIDATION', 400);
    const e = entry as Record<string, unknown>;
    if (typeof e.itemId !== 'string' || !e.itemId || seen.has(e.itemId)) throw bulkLotError('BULK_VALIDATION', 400);
    const packs = e.packs === undefined || e.packs === null ? 1 : parsePackCount(e.packs);
    if (packs === null) throw bulkLotError('BULK_PACK_COUNT', 400);
    const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : null;
    seen.add(e.itemId);
    out.push({ itemId: e.itemId, packs, amount });
  }
  return out;
}

/**
 * Refuses a hub cart add that sends a lot the wrong way: a free-quantity line (bulkLines) for a lot that is sold in packs
 * (BULK_PACK_ONLY), or a pack line for a lot that has no pack size (BULK_NOT_PACK). `packSizes` comes from loadLotPackSizes.
 */
export function assertLotLinesMatchPacks(args: { freeItemIds: ReadonlyArray<string>; packItemIds: ReadonlyArray<string>; packSizes: ReadonlyMap<string, number | null> }): void {
  for (const id of args.freeItemIds) {
    const size = args.packSizes.get(id);
    if (typeof size === 'number') throw bulkLotError('BULK_PACK_ONLY', 409, { itemId: id });
  }
  for (const id of args.packItemIds) {
    const size = args.packSizes.get(id);
    if (typeof size !== 'number') throw bulkLotError('BULK_NOT_PACK', 409, { itemId: id });
  }
}

/**
 * The hub cart's lot requests for reserveCartLotLines: a pack line carries a planner that prices whole packs from the lot's pack
 * size (planPackLine), a free quantity line is priced by the existing planBulkLine inside reserveCartLotLines. A pack line
 * wins when the same item somehow appears in both lists (the controller has already refused that).
 */
export function toCartLotRequests(args: {
  lots: ReadonlyArray<{ item: LotItemForCart; vendorBoothId: string }>;
  freeRequests: ReadonlyArray<BulkLineRequest>;
  packRequests: ReadonlyArray<PackLineRequest>;
  packSizes: ReadonlyMap<string, number | null>;
}): CartLotRequest[] {
  const freeByItem = new Map(args.freeRequests.map((r) => [r.itemId, r]));
  const packByItem = new Map(args.packRequests.map((r) => [r.itemId, r]));
  return args.lots.map((l) => {
    const packReq = packByItem.get(l.item.id);
    if (packReq) {
      return {
        item: l.item,
        vendorBoothId: l.vendorBoothId,
        quantity: packReq.packs,
        amountDollars: packReq.amount,
        planner: (row: LotItemForCart) => planPackLine(row, args.packSizes.get(row.id) ?? null, packReq.packs, packReq.amount),
      };
    }
    const free = freeByItem.get(l.item.id);
    return { item: l.item, vendorBoothId: l.vendorBoothId, quantity: free ? free.quantity : undefined, amountDollars: free ? free.amount : null };
  });
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** The pack fields a hub register search result and the price list show for one lot, from the lot's own row. */
export function packViewForRow(row: Pick<LotItemRow, 'price' | 'status' | 'stockTotal' | 'stockSold'>, packSize: number | null | undefined): PackView {
  return buildPackView({
    packSize,
    pricePerThousandCents: pricePerThousandCentsFromDollars(row.price),
    remaining: remainingCards(row.stockTotal, row.stockSold),
    status: row.status,
  });
}
