/**
 * The one place the price book writes an item price (ADR-140 section 12.5).
 *
 * buildPriceUpdate() reproduces, field by field, what the organizer price block of itemController.updateItem puts in its
 * update object (price, priceUpdatedAt, the eBay sync reopening, the rarity badge, the markdown anchor, the original price
 * anchor, userEditedFields, the eBay hold list and lastEditedAt). applyOrganizerPrice() adds the compare and swap that makes a
 * bulk run safe: the write happens only if the item is still what the preview saw, and it also writes one ItemPriceHistory row.
 *
 * Differences from updateItem on purpose (each is pinned by priceBookPriceWrite.test.ts):
 *   - A call whose price does not change writes nothing at all. updateItem can still heal a rarity, an original price or a
 *     failed eBay sync on a same price resave; the price book never does, because an unchanged row is never applied.
 *   - One ItemPriceHistory row is written per change (updateItem writes none).
 * Not done here, because they are not item columns and belong to the caller: the immediate eBay push, the price drop alert and
 * the Standard Envelope shipping resync. The run services hand every change to an injected onPriceChanged hook for those.
 *
 * Pure apart from the writes it is given: no clock (now is an argument), no environment, no client import.
 */
import { dollarsToCents } from './db';
import type { ItemRow, PriceBookTx, Select } from './db';

/** The Item columns a price write needs. Reads that feed applyOrganizerPrice use this select (an Item row is very wide). */
export const PRICE_ITEM_SELECT: Select = {
  id: true,
  organizerId: true,
  title: true,
  price: true,
  costBasis: true,
  status: true,
  listingType: true,
  draftStatus: true,
  saleId: true,
  quantity: true,
  stockTotal: true,
  priceUpdatedAt: true,
  deletedAt: true,
  createdAt: true,
  markdownApplied: true,
  priceBeforeMarkdown: true,
  originalPrice: true,
  rarity: true,
  ebayListingId: true,
  ebayOfferId: true,
  ebaySyncState: true,
  ebaySyncAttempts: true,
  ebaySyncHeldAt: true,
  ebayHeldFields: true,
  userEditedFields: true,
  lastEditedAt: true,
};

/** The price of an item can differ from the preview by less than this without counting as a change (updateItem uses the same). */
export const PRICE_EPSILON_DOLLARS = 0.005;

/**
 * Rarity badge from a price in dollars. The same four tiers as assignRarity in itemController (not exported there):
 * 500 and up LEGENDARY, 75 and up RARE, 25 and up UNCOMMON, otherwise COMMON. A test reads the controller source to pin them.
 */
export function rarityForPrice(price: number | null | undefined): string {
  if (!price || price < 25) return 'COMMON';
  if (price >= 500) return 'LEGENDARY';
  if (price >= 75) return 'RARE';
  return 'UNCOMMON';
}

export interface PriceUpdate {
  /** True when the price moved by half a cent or more (or went to or from null), the controller's own test. */
  priceChanged: boolean;
  /** The columns an update of this price sets. Always carries price. */
  data: Record<string, unknown>;
}

function hasEbayListing(item: ItemRow): boolean {
  return Boolean(item.ebayOfferId || item.ebayListingId);
}

function visiblePriceDiffers(existing: number | null, next: number | null): boolean {
  if (existing === null || next === null) return existing !== next;
  return Math.abs(existing - next) >= 1e-9;
}

/**
 * The update the organizer price block would build for this item and a new price (null clears the price).
 * newPriceCents is integer cents; null clears the price, as a blank price does in updateItem (a text 0 stays 0 there, so it does here).
 */
export function buildPriceUpdate(item: ItemRow, newPriceCents: number | null, now: Date): PriceUpdate {
  const nextPrice: number | null = newPriceCents === null ? null : newPriceCents / 100;
  const current: number | null = item.price !== null && item.price !== undefined ? Number(item.price) : null;
  const priceChanged = nextPrice === null || current === null ? nextPrice !== current : Math.abs(nextPrice - current) >= PRICE_EPSILON_DOLLARS;

  const data: Record<string, unknown> = { price: nextPrice };
  const edited: string[] = [];

  if (priceChanged) data.priceUpdatedAt = now;

  const listed = hasEbayListing(item);
  const failedSync = item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL';
  if (listed && (priceChanged || failedSync)) {
    data.ebaySyncState = 'PENDING';
    data.ebaySyncAttempts = 0;
  }
  if (priceChanged) edited.push('price');

  const nextRarity = rarityForPrice(nextPrice);
  if (nextRarity !== item.rarity && (priceChanged || item.rarity === 'COMMON')) data.rarity = nextRarity;

  if (priceChanged && nextPrice && nextPrice > 0 && !item.markdownApplied) {
    data.priceBeforeMarkdown = nextPrice;
    data.markdownApplied = false;
  }
  if (priceChanged || item.originalPrice === null || item.originalPrice === undefined) {
    data.originalPrice = nextPrice && nextPrice > 0 ? nextPrice : null;
  }

  // An item whose eBay sync is on hold keeps the hold; the new price joins the list of held fields so "Update eBay now"
  // pushes it. A price book change never starts a hold and never lifts one.
  const priceReopen = !priceChanged && listed && failedSync;
  if (listed && item.ebaySyncHeldAt) {
    data.ebaySyncHeldAt = item.ebaySyncHeldAt;
    const held = Array.from(item.ebayHeldFields ?? []);
    if (nextPrice !== null && (priceChanged || priceReopen)) held.push('price');
    data.ebayHeldFields = Array.from(new Set(held));
  }

  if (edited.length > 0) data.userEditedFields = Array.from(new Set([...(item.userEditedFields ?? []), ...edited]));

  // lastEditedAt: the organizer edit stamp (utils/organizerEdit): any change of a listed field, price among them.
  if (visiblePriceDiffers(current, nextPrice)) data.lastEditedAt = now;

  return { priceChanged, data };
}

export interface ApplyPriceArgs {
  /** The item as just read (with PRICE_ITEM_SELECT columns). Side effects are derived from it. */
  item: ItemRow;
  /** New price in integer cents; null clears the price (undo of a run on an unpriced card). */
  newPriceCents: number | null;
  runId: string;
  now: Date;
  /** What the item must still look like for the write to go ahead. */
  expect: {
    /** The price the preview (or the run) saw, in cents. Null means no price. */
    priceCents: number | null;
    /** The item must not have had a price stamp after this instant. Null skips that check. */
    notEditedAfter: Date | null;
  };
  /** History note. Default: "Price book run <id>". */
  historyNote?: string;
}

export type ApplyPriceResult =
  | { status: 'APPLIED'; oldPriceCents: number | null; newPriceCents: number | null }
  | { status: 'UNCHANGED' }
  | { status: 'CHANGED_SINCE_PREVIEW' };

const sameCents = (a: number | null, b: number | null): boolean => a === b;

/**
 * Writes one item price with compare and swap. Order of the checks: the item must still be this organizer's, not deleted and
 * AVAILABLE; its price must still be the expected one; it must not have been price stamped after expect.notEditedAfter (a hand
 * edit or a markdown). The write itself is an updateMany whose where clause repeats those facts (and the eBay and markdown
 * state the update was derived from), so a change that lands between the read and the write makes the count zero and the row
 * is reported CHANGED_SINCE_PREVIEW, never overwritten. A price that does not change is UNCHANGED and writes nothing.
 */
export async function applyOrganizerPrice(tx: PriceBookTx, args: ApplyPriceArgs): Promise<ApplyPriceResult> {
  const { item, newPriceCents, runId, now, expect } = args;
  const currentCents = dollarsToCents(item.price);

  if (item.deletedAt || item.status !== 'AVAILABLE') return { status: 'CHANGED_SINCE_PREVIEW' };
  if (!sameCents(currentCents, expect.priceCents)) return { status: 'CHANGED_SINCE_PREVIEW' };
  if (expect.notEditedAfter && item.priceUpdatedAt && item.priceUpdatedAt.getTime() > expect.notEditedAfter.getTime()) {
    return { status: 'CHANGED_SINCE_PREVIEW' };
  }

  const built = buildPriceUpdate(item, newPriceCents, now);
  if (!built.priceChanged) return { status: 'UNCHANGED' };

  const where: Record<string, unknown> = {
    id: item.id,
    organizerId: item.organizerId,
    deletedAt: null,
    status: 'AVAILABLE',
    markdownApplied: item.markdownApplied ?? false,
    ebayListingId: item.ebayListingId ?? null,
    ebayOfferId: item.ebayOfferId ?? null,
    price:
      currentCents === null
        ? null
        : { gte: currentCents / 100 - PRICE_EPSILON_DOLLARS, lt: currentCents / 100 + PRICE_EPSILON_DOLLARS },
  };
  if (expect.notEditedAfter) {
    where.AND = [{ OR: [{ priceUpdatedAt: null }, { priceUpdatedAt: { lte: expect.notEditedAfter } }] }];
  }

  const res = await tx.item.updateMany({ where, data: built.data });
  if (res.count !== 1) return { status: 'CHANGED_SINCE_PREVIEW' };

  await tx.itemPriceHistory.create({
    data: {
      itemId: item.id,
      price: newPriceCents === null ? 0 : newPriceCents / 100,
      changedBy: 'organizer',
      note: args.historyNote ?? `Price book run ${runId}`,
    },
  });
  return { status: 'APPLIED', oldPriceCents: currentCents, newPriceCents };
}
