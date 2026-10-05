/**
 * bulkLotInvariants (ADR-136 Addendum B, roadmap #659): the rules that keep a bulk lot a bulk lot, and the single
 * place every OTHER entry point asks "may this item go down this path?".
 *
 * A lot is an ordinary Item (stockTotal = cards, stockSold = cards sold, price = dollars per 1,000) plus an
 * ItemBulkLot marker. The generic item form, the auction closer, the bounty flow, Facebook native sales and the
 * eBay and Etsy sold-sync all know how to move an Item, and none of them knows what a card count is. So:
 *
 *   - evaluateLotItemEdit: what the generic item update may and may not do to a lot (pure, no database).
 *   - lotChannelRefusal: lot lookup plus the plain-language refusal for a channel that cannot sell cards by the
 *     quantity (auction, bounty, Facebook native, hold-invoice paths that carry no quantity). Never throws.
 *   - lotSyncSkip: the same lookup for a sold-sync entry (eBay, Etsy) where the right response is to ignore the
 *     sale and leave a note, never to refuse a request.
 *   - lotDeleteBlocker: whether a delete would orphan cards that are out on a hold or in a hub cart.
 *
 * The lookup uses findBulkLotItemIds, so it runs regardless of the flag, fails open when the flag is off (a missing
 * table before the migration cannot break any existing path) and fails closed when it is on.
 *
 * No Prisma client and no env in this module: the database client is passed in.
 */
import { findBulkLotItemIds, isBulkLotError } from './bulkLotService';
import { pricePerThousandCentsFromDollars } from './bulkLotPricing';

export type LotInvariantCode =
  | 'BULK_USE_ADJUST'
  | 'BULK_LOT_LISTING_TYPE'
  | 'BULK_LOT_AUCTION'
  | 'BULK_LOT_STATUS'
  | 'BULK_LOT_PRICE'
  | 'BULK_LOT_CHANNEL'
  | 'BULK_LOT_BUSY'
  | 'BULK_CHECK_FAILED';

export const LOT_INVARIANT_MESSAGES: Record<Exclude<LotInvariantCode, 'BULK_LOT_CHANNEL'>, string> = {
  BULK_USE_ADJUST: 'The number of cards in a bulk lot is changed with Adjust count, so every change is recorded. Use that instead of editing the total here.',
  BULK_LOT_LISTING_TYPE: 'A bulk lot is sold by the card at a price per 1,000, so it stays a fixed price item.',
  BULK_LOT_AUCTION: 'A bulk lot cannot be an auction or a reverse auction. It sells by the card at a price per 1,000.',
  BULK_LOT_STATUS: 'The status of a bulk lot follows its card count. Use Adjust count to change how many cards are on hand.',
  BULK_LOT_PRICE: 'Enter a price per 1,000 cards above $0.00.',
  BULK_LOT_BUSY: 'This bulk lot has cards on hold or in a shopper cart. Release them first.',
  BULK_CHECK_FAILED: 'Could not check whether this item is a bulk lot. Try again in a moment.',
};

export type LotChannel = 'AUCTION' | 'BOUNTY' | 'FACEBOOK_NATIVE' | 'HOLD_INVOICE' | 'EBAY_SYNC' | 'ETSY_SYNC';

export const LOT_CHANNEL_MESSAGES: Record<LotChannel, string> = {
  AUCTION: 'A bulk lot cannot be sold at auction. It sells by the card at a price per 1,000.',
  BOUNTY: 'A bulk lot cannot be used for a request. It sells by the card at a price per 1,000.',
  FACEBOOK_NATIVE: 'A bulk lot cannot be sold through Facebook yet. Ring it up at the register.',
  HOLD_INVOICE: 'A bulk lot hold is placed with the number of cards. Use Hold cards on the lot.',
  EBAY_SYNC: 'This item is a bulk lot, so an eBay sale of it was not counted against the cards.',
  ETSY_SYNC: 'This item is a bulk lot, so an Etsy sale of it was not counted against the cards.',
};

// ---------------------------------------------------------------------------
// The generic item edit
// ---------------------------------------------------------------------------

export interface LotEditCurrent {
  stockTotal: number | null | undefined;
  stockSold: number | null | undefined;
  status: string | null | undefined;
  listingType: string | null | undefined;
}

export interface LotEditRefusal {
  status: number;
  code: LotInvariantCode;
  message: string;
  field: string;
}

/** What the caller must write on top of its own update so the lot stays a lot, whatever the form sent. */
export interface LotEditForced {
  excludeFromMarkdown: true;
  ebayShippingOverride: 'DONT_LIST';
  /** Present only when the edit carries a price: dollars per 1,000, rounded to whole cents. */
  price?: number;
}

export type LotEditDecision = { ok: true; forced: LotEditForced } | { ok: false; refusal: LotEditRefusal };

const refuse = (status: number, code: Exclude<LotInvariantCode, 'BULK_LOT_CHANNEL'>, field: string): LotEditDecision => ({
  ok: false,
  refusal: { status, code, message: LOT_INVARIANT_MESSAGES[code], field },
});

/** The edit page sends every key on every save, so "unset" means null, empty, false or zero, not just missing. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false || value === 0) return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v !== '' && v !== 'false' && v !== '0' && v !== 'null';
  }
  return true;
}

const AUCTION_KEYS = ['auctionStartPrice', 'auctionReservePrice', 'bidIncrement', 'auctionEndTime', 'reverseAuction', 'reverseDailyDrop', 'reverseFloorPrice', 'reverseStartDate'] as const;

/**
 * What a generic item update may do to a lot. A lot's card count, status, listing type and auction fields are not
 * editable here (a resave that sends the CURRENT value is fine, the form sends everything). The eBay shipping
 * override and the markdown exclusion are not refused, they are forced (see LotEditForced), because the markdown
 * cycle would otherwise reprice a per-1,000 price with a 0.99 floor and eBay would otherwise list the lot as one item.
 */
export function evaluateLotItemEdit(body: Record<string, unknown> | null | undefined, current: LotEditCurrent): LotEditDecision {
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.stockTotal !== undefined && b.stockTotal !== null && b.stockTotal !== '') {
    const requested = Number(b.stockTotal);
    if (!Number.isFinite(requested) || requested !== (current.stockTotal ?? 1)) return refuse(409, 'BULK_USE_ADJUST', 'stockTotal');
  }

  if (b.listingType !== undefined && b.listingType !== null && b.listingType !== '') {
    const lt = String(b.listingType);
    if (lt !== current.listingType && lt !== 'FIXED' && lt !== 'POS') return refuse(409, 'BULK_LOT_LISTING_TYPE', 'listingType');
  }

  for (const key of AUCTION_KEYS) {
    if (isSet(b[key])) return refuse(409, 'BULK_LOT_AUCTION', key);
  }

  if (b.status !== undefined && b.status !== null && b.status !== '' && b.status !== current.status) {
    return refuse(409, 'BULK_LOT_STATUS', 'status');
  }

  const forced: LotEditForced = { excludeFromMarkdown: true, ebayShippingOverride: 'DONT_LIST' };
  if (b.price !== undefined) {
    const dollars = typeof b.price === 'number' ? b.price : typeof b.price === 'string' && b.price.trim() !== '' ? Number(b.price) : NaN;
    const cents = pricePerThousandCentsFromDollars(dollars);
    if (cents === null) return refuse(400, 'BULK_LOT_PRICE', 'price');
    forced.price = cents / 100;
  }
  return { ok: true, forced };
}

// ---------------------------------------------------------------------------
// Lookups used by the other entry points
// ---------------------------------------------------------------------------

export type LotLookupDb = Parameters<typeof findBulkLotItemIds>[0];

export interface LotChannelRefusal {
  status: number;
  code: 'BULK_LOT_CHANNEL' | 'BULK_CHECK_FAILED';
  message: string;
  channel: LotChannel;
}

/**
 * null when `itemId` is not a lot (the path may proceed); otherwise the refusal to send. Never throws: a lookup
 * failure with the flag on is a 503 BULK_CHECK_FAILED refusal (fail closed), with the flag off it is "not a lot".
 */
export async function lotChannelRefusal(
  db: LotLookupDb,
  itemId: string | null | undefined,
  channel: LotChannel,
  flagOn: boolean
): Promise<LotChannelRefusal | null> {
  if (!itemId) return null;
  try {
    const lots = await findBulkLotItemIds(db, [itemId], flagOn);
    if (lots.has(itemId)) return { status: 409, code: 'BULK_LOT_CHANNEL', message: LOT_CHANNEL_MESSAGES[channel], channel };
    return null;
  } catch (err) {
    if (isBulkLotError(err) && err.code === 'BULK_CHECK_FAILED') {
      return { status: 503, code: 'BULK_CHECK_FAILED', message: LOT_INVARIANT_MESSAGES.BULK_CHECK_FAILED, channel };
    }
    throw err;
  }
}

/**
 * For a sold-sync entry (eBay or Etsy reported a sale of an item): true when the item is a lot, so the caller skips
 * the stock draw and records a note. A failed lookup returns true when the flag is on (do not sell a card count as
 * one unit) and false when it is off.
 */
export async function lotSyncSkip(db: LotLookupDb, itemId: string | null | undefined, flagOn: boolean): Promise<boolean> {
  if (!itemId) return false;
  const refusal = await lotChannelRefusal(db, itemId, 'EBAY_SYNC', flagOn);
  return refusal !== null;
}

export interface LotBusyDb {
  bulkLotHold: { count(args: any): Promise<number> };
  boothCartBulkLine: { count(args: any): Promise<number> };
}

/** True when a delete would leave cards out on an active hold or in a hub cart with nothing to hand them back to. */
export async function lotDeleteBlocker(db: LotBusyDb, itemId: string, flagOn = true): Promise<boolean> {
  try {
    const [holds, lines] = await Promise.all([
      db.bulkLotHold.count({ where: { itemId, status: 'ACTIVE' } }),
      db.boothCartBulkLine.count({ where: { itemId, status: 'RESERVED' } }),
    ]);
    return holds > 0 || lines > 0;
  } catch (err) {
    // Flag off: the follow-up tables may not exist yet (migration not applied), nothing can be on hold, so do not block.
    if (flagOn) throw err;
    return false;
  }
}
