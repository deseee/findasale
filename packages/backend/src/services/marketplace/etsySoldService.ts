/**
 * etsySoldService.ts -- record a sale that happened ON Etsy (ADR-135 D6.3, batch E-B4, acceptance 3).
 *
 * recordEtsySale behaves like the eBay sold sync (jobs/ebaySoldSyncCron.ts), which is how a Reverb or
 * eBay sale reaches stock and notifications today:
 *   1. Ledger row first. EtsySoldEvent has a unique transactionId, so the same Etsy transaction seen
 *      twice (webhook plus poll, or poll overlap) is an alreadyRecorded no-op and changes stock once.
 *   2. sellItemUnits (services/itemStockService.ts) draws the units from the shared stock pool. It
 *      guards capacity in SQL and flips Item.status to SOLD when the last unit goes. If it reports
 *      InsufficientStockError (real money changed hands on Etsy but the pool disagrees) the sale is
 *      NOT dropped: the units are clamped to what remains, and when nothing remains the sale is
 *      recorded as an oversell and the organizer is told so they can cancel or refund one order.
 *   3. Fully sold out: EtsyListing.state is set to 'SOLD' FIRST, so withdrawEtsyListingIfExists (reached
 *      through fanOutItemSoldWithdrawals) self-guards and never tries to delete the listing that just
 *      sold. Then Item.lastSoldVia = 'ETSY', then fanOutItemSoldWithdrawals(itemId, 'etsy-sold') pulls
 *      the item from every other channel.
 *   4. Units remain: syncMarketplaceStock(itemId, { fullySoldOut:false, remainingStock }) revises the
 *      eBay count; the other channels stay live; Etsy keeps its own count (EtsyListing.syncedQuantity
 *      is lowered to match, so the quantity reconcile does not push a count Etsy already has).
 *   5. The organizer gets a notification through the shared createNotification helper.
 *
 * If the stock step itself throws (database error), the ledger row is deleted again so the next poll
 * can record the sale; once stock has moved the ledger row is never rolled back.
 *
 * processEtsyTransactions maps Etsy transactions to FindA.Sale items. A listing is found only through
 * EtsyListing (etsyListingId plus shopId, plus organizerId when known): a transaction for a listing
 * we did not create has no row and is counted unmatched. Only the five fields from etsyReceipts.ts are
 * ever written, in the exact shape asserted by the tests; buyer data never reaches this file.
 *
 * Import safety: no env reads, network or database access at module load. The heavy services (stock,
 * fan-out, notifications, eBay count sync) are loaded lazily with require inside the default
 * implementations, and every dependency can be injected through the deps argument. Nothing here throws.
 */

import type { EtsyConnectorDeps } from './etsyConnector';
import type { EtsyReceiptTransaction } from './etsyReceipts';
import { ETSY_MAX_TRANSACTION_QUANTITY } from './etsyReceipts';
import { scrubEtsySecrets } from './etsyBudget';

export type EtsySaleSource = 'WEBHOOK' | 'POLL';

/** Organizer-facing notification copy. The copy-lint test (etsySyncCopyLint.test.ts) enforces the house word rules. */
export const ETSY_SOLD_MESSAGES = {
  title: 'Item sold on Etsy',
  soldOut: (itemTitle: string): string =>
    `"${cleanTitle(itemTitle)}" sold on Etsy and has been marked as sold. It is being removed from your other marketplaces.`,
  partial: (itemTitle: string, units: number, remaining: number): string =>
    `${units === 1 ? 'One unit' : `${units} units`} of "${cleanTitle(itemTitle)}" sold on Etsy. ${remaining} remaining.`,
  oversold: (itemTitle: string): string =>
    `"${cleanTitle(itemTitle)}" sold on Etsy, but it had already sold somewhere else. Check your orders so you can cancel or refund one of them.`,
} as const;

/** Titles go into an email body: drop angle brackets and cap the length. */
function cleanTitle(title: string): string {
  return String(title ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Your item';
}

export interface EtsySaleNotice {
  organizerId: string;
  item: { id: string; title: string; saleId: string | null };
  kind: 'sold-out' | 'partial' | 'oversold';
  units: number;
  remainingStock: number;
}

export interface EtsyStockOutcome {
  fullySoldOut: boolean;
  remainingStock: number;
}

export interface EtsySoldDeps extends EtsyConnectorDeps {
  /** Draw units from the shared stock pool. Defaults to itemStockService.sellItemUnits. */
  sellItemUnits?: (itemId: string, units: number) => Promise<EtsyStockOutcome>;
  /** Revise the eBay count after a partial sale. Defaults to marketplaceStockSyncService.syncMarketplaceStock. */
  syncStock?: (itemId: string, outcome: EtsyStockOutcome) => Promise<unknown>;
  /** Pull the item from every other channel. Defaults to soldFanOutService.fanOutItemSoldWithdrawals. */
  fanOut?: (itemId: string, source: string) => void;
  /** Tell the organizer. Defaults to createNotification (in-app plus email). */
  notify?: (notice: EtsySaleNotice) => Promise<void>;
}

type Db = any;

function getDb(deps: EtsySoldDeps): Db {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../../lib/prisma').prisma;
}
const getNow = (deps: EtsySoldDeps): Date => (deps.now ?? (() => new Date()))();

function defaultSellItemUnits(itemId: string, units: number): Promise<EtsyStockOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../itemStockService').sellItemUnits(itemId, units);
}
function defaultSyncStock(itemId: string, outcome: EtsyStockOutcome): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../marketplaceStockSyncService').syncMarketplaceStock(itemId, outcome);
}
function defaultFanOut(itemId: string, source: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../soldFanOutService').fanOutItemSoldWithdrawals(itemId, source);
}
async function defaultNotify(db: Db, notice: EtsySaleNotice): Promise<void> {
  const organizer = await db.organizer.findUnique({ where: { id: notice.organizerId }, select: { userId: true } });
  if (!organizer?.userId) return;
  const body =
    notice.kind === 'sold-out'
      ? ETSY_SOLD_MESSAGES.soldOut(notice.item.title)
      : notice.kind === 'oversold'
      ? ETSY_SOLD_MESSAGES.oversold(notice.item.title)
      : ETSY_SOLD_MESSAGES.partial(notice.item.title, notice.units, notice.remainingStock);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createNotification } = require('../../lib/notificationService');
  await createNotification({
    userId: organizer.userId,
    type: 'SALE_UPDATE',
    title: ETSY_SOLD_MESSAGES.title,
    body,
    link: notice.item.saleId ? `/organizer/sales/${notice.item.saleId}` : `/organizer/inventory`,
    sendEmail: true,
  });
}

const DIGITS = /^[1-9]\d{0,17}$/;

export interface RecordEtsySaleArgs {
  organizerId: string;
  itemId: string;
  etsyListingId: string;
  transactionId: string;
  receiptId: string;
  quantity: number;
  soldAt: Date;
  source: EtsySaleSource;
}

export type RecordEtsySaleStatus = 'recorded' | 'alreadyRecorded' | 'invalid' | 'failed';

export interface RecordEtsySaleResult {
  status: RecordEtsySaleStatus;
  /** False when the ledger row was written but the item row no longer exists. */
  itemFound?: boolean;
  fullySoldOut?: boolean;
  /** True when the item had no stock left, so the sale was recorded without moving stock. */
  oversold?: boolean;
  unitsApplied?: number;
  remainingStock?: number;
}

function isInsufficientStock(err: any): boolean {
  return err?.name === 'InsufficientStockError';
}

function safeMessage(err: any, deps: EtsySoldDeps): string {
  return scrubEtsySecrets(err?.message || String(err), deps.env ?? process.env);
}

/**
 * Record one Etsy transaction. Never throws. See the file header for the exact order of effects.
 */
export async function recordEtsySale(args: RecordEtsySaleArgs, deps: EtsySoldDeps = {}): Promise<RecordEtsySaleResult> {
  const valid =
    typeof args.organizerId === 'string' &&
    args.organizerId.length > 0 &&
    typeof args.itemId === 'string' &&
    args.itemId.length > 0 &&
    args.itemId.length <= 100 &&
    DIGITS.test(String(args.etsyListingId)) &&
    DIGITS.test(String(args.transactionId)) &&
    DIGITS.test(String(args.receiptId)) &&
    Number.isInteger(args.quantity) &&
    args.quantity >= 1 &&
    args.quantity <= ETSY_MAX_TRANSACTION_QUANTITY &&
    args.soldAt instanceof Date &&
    !Number.isNaN(args.soldAt.getTime()) &&
    (args.source === 'WEBHOOK' || args.source === 'POLL');
  if (!valid) return { status: 'invalid' };

  const db = getDb(deps);
  const sell = deps.sellItemUnits ?? defaultSellItemUnits;
  const syncStock = deps.syncStock ?? defaultSyncStock;
  const fanOut = deps.fanOut ?? defaultFanOut;
  const notify = deps.notify ?? ((n: EtsySaleNotice) => defaultNotify(db, n));
  const { organizerId, itemId, quantity } = args;

  // 1. Ledger row (the idempotency guard). Exactly these fields, nothing from the buyer.
  try {
    await db.etsySoldEvent.create({
      data: {
        transactionId: String(args.transactionId),
        receiptId: String(args.receiptId),
        etsyListingId: String(args.etsyListingId),
        itemId,
        quantity,
        soldAt: args.soldAt,
        source: args.source,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') return { status: 'alreadyRecorded' };
    console.error('[Etsy Sold] could not write the sale ledger row:', safeMessage(err, deps));
    return { status: 'failed' };
  }

  let stockMoved = false;
  try {
    // 2. The item, scoped to the organizer that owns the Etsy listing.
    const item: any =
      (await db.item.findFirst({
        where: { id: itemId, OR: [{ organizerId }, { sale: { organizerId } }] },
        select: { id: true, title: true, saleId: true, status: true, stockTotal: true, stockSold: true },
      })) ?? null;
    if (!item) {
      console.warn(`[Etsy Sold] item ${itemId} not found for transaction ${args.transactionId}; ledger row kept`);
      return { status: 'recorded', itemFound: false };
    }

    // 3. Stock.
    let outcome: EtsyStockOutcome;
    let unitsApplied = quantity;
    let oversold = false;
    try {
      outcome = await sell(itemId, quantity);
    } catch (err: any) {
      if (!isInsufficientStock(err)) throw err;
      const fresh: any = (await db.item.findUnique({ where: { id: itemId }, select: { stockTotal: true, stockSold: true } })) ?? item;
      const remaining = Math.max((fresh.stockTotal ?? 1) - (fresh.stockSold ?? 0), 0);
      console.error(
        `[Etsy Sold] STOCK POOL DESYNC for item ${itemId}: Etsy confirmed a sale of ${quantity} but ${remaining} unit(s) remain in the pool. Clamping.`
      );
      if (remaining > 0) {
        outcome = await sell(itemId, Math.min(remaining, quantity));
        unitsApplied = Math.min(remaining, quantity);
      } else {
        outcome = { fullySoldOut: true, remainingStock: 0 };
        unitsApplied = 0;
        oversold = true;
      }
    }
    stockMoved = unitsApplied > 0;

    // 4. Fully sold out, or units remain.
    if (outcome.fullySoldOut) {
      // Listing state FIRST so the withdraw self-guard sees SOLD and leaves the listing that just sold alone.
      await db.etsyListing.updateMany({
        where: { itemId, organizerId },
        data: { state: 'SOLD', endedAt: getNow(deps) },
      });
      if (!oversold) {
        await db.item.updateMany({ where: { id: itemId }, data: { lastSoldVia: 'ETSY' } });
        try {
          fanOut(itemId, 'etsy-sold');
        } catch (err: any) {
          console.warn(`[Etsy Sold] fan-out failed for item ${itemId}:`, safeMessage(err, deps));
        }
      }
    } else {
      Promise.resolve(syncStock(itemId, { fullySoldOut: false, remainingStock: outcome.remainingStock })).catch((err: any) =>
        console.warn(`[Etsy Sold] eBay quantity sync failed for item ${itemId}:`, safeMessage(err, deps))
      );
      // Etsy lowered its own count by the units it sold; keep our record of what Etsy holds in step.
      await db.etsyListing.updateMany({
        where: { itemId, organizerId, syncedQuantity: { not: null } },
        data: { syncedQuantity: outcome.remainingStock },
      });
    }

    // 5. Tell the organizer.
    try {
      await notify({
        organizerId,
        item: { id: item.id, title: String(item.title ?? ''), saleId: item.saleId ?? null },
        kind: oversold ? 'oversold' : outcome.fullySoldOut ? 'sold-out' : 'partial',
        units: unitsApplied > 0 ? unitsApplied : quantity,
        remainingStock: outcome.remainingStock,
      });
    } catch (err: any) {
      console.error(`[Etsy Sold] could not notify organizer ${organizerId} for item ${itemId}:`, safeMessage(err, deps));
    }

    console.log(
      `[Etsy Sold] item ${itemId}: transaction ${args.transactionId} (${args.source}) recorded, ${unitsApplied} unit(s)` +
        `${outcome.fullySoldOut ? ', now sold out' : `, ${outcome.remainingStock} remaining`}${oversold ? ', OVERSOLD' : ''}`
    );
    return {
      status: 'recorded',
      itemFound: true,
      fullySoldOut: outcome.fullySoldOut,
      oversold,
      unitsApplied,
      remainingStock: outcome.remainingStock,
    };
  } catch (err: any) {
    console.error(`[Etsy Sold] recording transaction ${args.transactionId} failed:`, safeMessage(err, deps));
    if (!stockMoved) {
      // Nothing moved: free the transaction id so the next poll can try again.
      try {
        await db.etsySoldEvent.deleteMany({ where: { transactionId: String(args.transactionId) } });
      } catch (rollbackErr: any) {
        console.error('[Etsy Sold] could not roll back the ledger row:', safeMessage(rollbackErr, deps));
      }
      return { status: 'failed' };
    }
    return { status: 'recorded', itemFound: true, unitsApplied: quantity };
  }
}

export interface EtsyTransactionsOutcome {
  recorded: number;
  alreadyRecorded: number;
  /** Transactions for a listing FindA.Sale has no EtsyListing row for. */
  unmatched: number;
  invalid: number;
  failed: number;
}

/**
 * Record each transaction against the item its Etsy listing belongs to. The lookup is by etsyListingId
 * and shopId (and organizerId when the caller knows it). Never throws; a lookup error counts as failed.
 */
export async function processEtsyTransactions(
  args: { shopId: string; organizerId?: string; transactions: EtsyReceiptTransaction[]; source: EtsySaleSource },
  deps: EtsySoldDeps = {}
): Promise<EtsyTransactionsOutcome> {
  const out: EtsyTransactionsOutcome = { recorded: 0, alreadyRecorded: 0, unmatched: 0, invalid: 0, failed: 0 };
  const db = getDb(deps);
  for (const tx of args.transactions) {
    try {
      const listing: any =
        (await db.etsyListing.findFirst({
          where: {
            etsyListingId: tx.listingId,
            shopId: args.shopId,
            ...(args.organizerId ? { organizerId: args.organizerId } : {}),
          },
          select: { organizerId: true, itemId: true },
        })) ?? null;
      if (!listing) {
        out.unmatched++;
        continue;
      }
      const r = await recordEtsySale(
        {
          organizerId: listing.organizerId,
          itemId: listing.itemId,
          etsyListingId: tx.listingId,
          transactionId: tx.transactionId,
          receiptId: tx.receiptId,
          quantity: tx.quantity,
          soldAt: tx.paidAt,
          source: args.source,
        },
        deps
      );
      if (r.status === 'recorded') out.recorded++;
      else if (r.status === 'alreadyRecorded') out.alreadyRecorded++;
      else if (r.status === 'invalid') out.invalid++;
      else out.failed++;
    } catch (err: any) {
      out.failed++;
      console.error('[Etsy Sold] transaction lookup failed:', safeMessage(err, deps));
    }
  }
  return out;
}
