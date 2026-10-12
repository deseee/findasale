/**
 * facebookNativeSaleService.ts — shared "commit a Facebook-detected sale" cascade.
 *
 * Extracted from extensionController.ts's markItemSoldOnFacebook (2026-09-20, ADR-131)
 * so the same commit-and-cascade logic can be called from more than one signal source
 * without copy-pasting it a third time. This is now the SECOND real call site of the
 * "caller-supplied soldVia" shape routes/internal.ts's `/mark-item-sold-elsewhere` route
 * already established (see that route's own comment, ~internal.ts:1171) — this helper
 * generalizes that same shape into a reusable function rather than route-only logic.
 *
 * Call sites (as of ADR-131):
 *  - extensionController.ts markItemSoldOnFacebook -- soldVia='FB_NATIVE' (DOM-scan
 *    detection: the content script matched a "Sold"/"View Order" card on Facebook's own
 *    selling page).
 *  - services/facebookMarketplaceEmailSoldDetection.ts processFacebookMarketplaceOrderEmail
 *    -- soldVia='FB_EMAIL_ORDER' (order-confirmation email detection, ADR-131). New as of
 *    this change; see that file for the vendor-agnostic parsing/matching core.
 *  - routes/internal.ts /mark-item-sold-elsewhere -- caller-supplied soldVia (2026-09-23: its
 *    inline copy of this cascade was replaced by a call to this helper).
 *  - services/platformSoldDetectionService.ts -- soldVia='MERCARI' (Mercari sold email) and
 *    'FB_EMAIL_ORDER' title fallback (2026-09-23).
 *  - jobs/discogsSoldSyncCron.ts -- soldVia='DISCOGS', skipWithdraw ['DISCOGS'] (2026-09-23).
 *  - jobs/reverbSoldSyncCron.ts -- soldVia='REVERB', skipWithdraw ['REVERB'] (2026-09-23).
 *  - ADR-135 (2026-10-03): the default (skipWithdraw omitted) now also withdraws the item's Etsy listing;
 *    a future Etsy-driven caller passes skipWithdraw ['ETSY'] (etsySoldService does its own SOLD path today).
 *  - services/vintedSoldDetectionService.ts processVintedSoldReport -- soldVia='VINTED'
 *    (2026-09-23, extension wardrobe sold-detection; closes the item's VINTED listing record
 *    itself before calling this, since this helper touches no MarketplaceListingJob rows).
 *
 * Deliberately does NOT call notifyFacebookExportedItemSold for either call site: that
 * hook's job is telling the extension to go remove the matching Facebook listing, which
 * is meaningless here -- the sale happened ON Facebook, so there's nothing left to remove
 * there (see markItemSoldOnFacebook's original header comment, preserved at its call site).
 *
 * SECURITY: this function does NOT check item ownership. Callers are responsible for
 * authorization before calling this (markItemSoldOnFacebook verifies assertItemOwned;
 * the future email job resolves itemId server-side from a matched MarketplaceListingJob
 * row, not from any user-supplied input, same trust model as /mark-item-sold-elsewhere).
 */

import { prisma } from '../lib/prisma';
import { commitItemSale, ItemAlreadyCommittedError } from './itemSaleGuard';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from './shopifyService';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from './marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from './marketplace/etsyConnector';
import { sellItemUnits } from './itemStockService';
import { syncMarketplaceStock } from './marketplaceStockSyncService';
import { lotChannelRefusal } from './bulkLot/bulkLotInvariants'; // ADR-136 Addendum B (#659): a bulk lot is never marked SOLD by a sale seen elsewhere
import { isBulkLotsEnabled } from './bulkLot/bulkLotConfig';
import { soldEmailStaleReason, soldEmailAlreadyApplied, soldRowMessage, getSoldEmailSource, parseSoldRowSentAtMs } from './soldEmailSourceGuard'; // 2026-10-12: an e-mail replayed after marker loss / relist must not consume a unit twice
import { isReportOfCancelledReopenedSale } from './saleReopenGuard'; // reopen-sale (2026-10-10): a sold signal for a sale the organizer reopened must not re-sell it

export interface CommitFacebookNativeSaleResult {
  ok: true;
  /** true when the item was already SOLD (this call, a prior poll cycle, or any other
   * channel) -- an idempotent no-op, never an error. false on a genuine fresh transition. */
  alreadyCommitted: boolean;
  /** true when a multi-quantity item sold ONE unit and still has stock: the item stays AVAILABLE,
   * only the sold platform's listing was closed. Absent/false for a whole-item SOLD transition. */
  partial?: boolean;
  /** Units left after a partial sale (only set when `partial` is true). */
  remainingStock?: number;
  /** ADR-136 Addendum B (#659): true when the item is a bulk lot. Nothing was changed (alreadyCommitted is true so every
   * caller treats it as a no-op); the sale is not countable against a card count from here. */
  bulkLotIgnored?: boolean;
  /** true (with alreadyCommitted) when THIS exact marketplace listing id already consumed a unit earlier (a REMOVE/REMOVED
   * sold_on_<platform> row carries it). The sale IS counted, so a bundle/wardrobe retry may treat it as resolved. */
  alreadyCounted?: boolean;
  /** Why a unit-sale call changed nothing (diagnostics only; never changes behavior). */
  noopReason?: string;
}

/** Platforms whose listings are tracked as MarketplaceListingJob rows, so a live POST/POSTED row
 * doubles as the "this unit's sale not yet counted" idempotency key for a unit sale. */
export type UnitSalePlatform = 'VINTED' | 'MERCARI' | 'POSHMARK' | 'GRAILED' | 'FACEBOOK';

/**
 * Atomically transitions `itemId` to SOLD (via the ADR-098 commitItemSale guard,
 * AVAILABLE -> SOLD only) and, on a genuine fresh transition, tags it with `soldVia`
 * and fires the same cross-channel withdrawal calls every other SOLD-transition call
 * site uses (eBay, Shopify, Discogs, Reverb -- fire-and-forget, never blocking the caller).
 *
 * Idempotent: a repeat call for an item already SOLD (via this same channel or any
 * other) resolves to `{ ok: true, alreadyCommitted: true }` rather than throwing --
 * callers must NOT treat ItemAlreadyCommittedError as an error condition themselves,
 * this function already absorbs it.
 *
 * @param itemId  The Item to transition. Caller is responsible for authorization --
 *                see SECURITY note above.
 * @param soldVia Free-form tag written to Item.lastSoldVia on a fresh transition only
 *                (never re-stamped on an idempotent repeat). Known values as of
 *                ADR-131: 'FB_NATIVE' (DOM-scan detection), 'FB_EMAIL_ORDER' (order-
 *                confirmation email detection). Item.lastSoldVia is a plain String? --
 *                no enum, no migration needed to add another value.
 */
export interface CommitFacebookNativeSaleOptions {
  /** Server-side withdrawals to skip because the sale happened ON that channel (its listing
   * already closed there). 2026-09-23: the Discogs order poll passes ['DISCOGS'] so it never
   * tries to DELETE the Discogs listing that just sold; the Reverb order poll passes ['REVERB'] for the
   * same reason. ADR-135: 'ETSY' skips the Etsy withdraw. Omitted = withdraw from all five. */
  skipWithdraw?: Array<'EBAY' | 'SHOPIFY' | 'DISCOGS' | 'REVERB' | 'ETSY'>;
  /** The per-listing marketplace the sale happened on (2026-09-30, S-MULTI-QTY-SOLD-ELSEWHERE).
   * When set AND the item holds more than one unit (stockTotal > 1), the sale is a UNIT sale: one
   * unit comes off stock, only THIS platform's listing row is closed, and the item stays AVAILABLE
   * (other platforms keep their listings; the sold platform reads as not-listed so it re-queues).
   * The full SOLD cascade runs only when the last unit sells. Single-unit items ignore it. */
  soldOnPlatform?: {
    platform: UnitSalePlatform;
    remoteListingId?: string | null;
    /** The sold listing id was read from the marketplace's own ORDER for a fresh sold notice (Vinted bundle order),
     * not from a wardrobe that keeps re-reporting old sold listings. Skips ONLY the relist-after-sale guard below,
     * which exists to tell a stale wardrobe re-report from a new sale; an order names exactly the listings that sold. */
    trustedOrder?: boolean;
    /** Only with trustedOrder: creation time of the order's notice. A sold_on_<platform> REMOVE row written at/after it (e.g. by the
     * sold-email retry) is treated as this order's own sale already counted. Absent = any such row within the last 14 days. */
    orderCreatedAt?: Date;
  };
}

/** Window used for the closed-by-email-sale rule when the order carries no creation time. */
const CLOSED_BY_EMAIL_SALE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Relist-without-POSTED-row rule: an e-mail sent more than this after the last sold_on_<platform> REMOVE row's reference time is a new sale. Also
 * the slack that keeps a bundle notice / e-mail pair for the SAME sale (sent a little after the row) from counting twice. */
export const NEW_EMAIL_SALE_TOLERANCE_MS = 10 * 60 * 1000;

/** True when the item holds more than one unit, i.e. a sale elsewhere is a unit sale, not a SOLD. */
export async function isMultiStockItem(itemId: string): Promise<boolean> {
  const it = await prisma.item.findUnique({ where: { id: itemId }, select: { stockTotal: true } });
  return (it?.stockTotal ?? 1) > 1;
}

function fanOutWithdrawals(itemId: string, soldVia: string, skip: Set<string>): void {
  if (!skip.has('EBAY')) {
    endEbayListingIfExists(itemId).catch((err: any) =>
      console.warn(`[eBay] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
    );
  }
  if (!skip.has('SHOPIFY')) {
    markShopifyItemSold(itemId).catch((err: any) =>
      console.warn(`[Shopify] mark-sold-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
    );
  }
  if (!skip.has('DISCOGS')) {
    withdrawDiscogsListingIfExists(itemId).catch((err: any) =>
      console.warn(`[Discogs] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
    );
  }
  if (!skip.has('REVERB')) {
    withdrawReverbListingIfExists(itemId).catch((err: any) =>
      console.warn(`[Reverb] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
    );
  }
  if (!skip.has('ETSY')) {
    withdrawEtsyListingIfExists(itemId).catch((err: any) =>
      console.warn(`[Etsy] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
    );
  }
}

type UnitSaleOutcome =
  | { kind: 'single' }
  | { kind: 'noop'; reason: string; counted?: boolean }
  | { kind: 'sold'; fullySoldOut: boolean; remainingStock: number };

/**
 * Multi-unit sale on one per-listing marketplace. Returns null when the item is single-unit (caller
 * falls through to the whole-item SOLD path). Everything that decides "is this sale new?" happens
 * inside one transaction holding the Item row lock, so a sold email and a wardrobe report racing
 * for the same sale can never both take a unit:
 *  - idempotency key = the platform's LIVE (latest non-REMOVE/SKIPPED) POST/POSTED row; the sale
 *    consumes it by writing REMOVE/REMOVED in the same transaction as the stock decrement;
 *  - a report that carries a listing id which belongs to an OLDER listing than the live row (the
 *    platform's wardrobe keeps re-reporting a sold listing after a relist) is a no-op.
 */
async function commitPlatformUnitSale(
  itemId: string,
  soldVia: string,
  sold: NonNullable<CommitFacebookNativeSaleOptions['soldOnPlatform']>,
  skip: Set<string>,
): Promise<CommitFacebookNativeSaleResult | null> {
  const { platform } = sold;
  const reportedId = String(sold.remoteListingId ?? '').trim();

  const outcome: UnitSaleOutcome = await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as any;
    const rows: Array<{ status: string; stockTotal: number | null }> = await tx.$queryRaw`
      SELECT "status"::text AS "status", "stockTotal" FROM "Item" WHERE "id" = ${itemId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row || (row.stockTotal ?? 1) <= 1) return { kind: 'single' } as UnitSaleOutcome;
    if (!['AVAILABLE', 'RESERVED', 'INVOICE_ISSUED'].includes(row.status)) return { kind: 'noop', reason: `item_status_${row.status}` } as UnitSaleOutcome;

    // Did THIS listing id already consume a unit? (REMOVE/REMOVED sold_on_* row stamped with it by a previous unit sale.)
    const alreadyCountedFor = async (): Promise<boolean> => {
      if (!reportedId) return false;
      const hit = await tx.marketplaceListingJob.findFirst({
        where: { itemId, platform, action: 'REMOVE', status: 'REMOVED', remoteListingId: reportedId, lastErrorMessage: { startsWith: 'sold_on_' } },
        select: { id: true },
      });
      return !!hit;
    };

    const live = await tx.marketplaceListingJob.findFirst({
      where: { itemId, platform, NOT: { action: 'REMOVE', status: 'SKIPPED' } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, status: true, remoteListingId: true, createdAt: true, lastErrorMessage: true },
    });
    // NEW-SALE-AFTER-LAST-REMOVE (2026-10-12, Nickel Coin Tube / dragonballzdad): a multi-unit listing can sell again on the platform with NO
    // POSTED row recorded (relisted on Vinted without the app writing a POST). The latest row is then the previous unit sale's sold_on_<platform>
    // REMOVE row, and the old rule read that as "already counted" and dropped a genuine new sale. Only for a sold E-MAIL (sent date known, not a
    // trustedOrder bundle): if the e-mail was sent more than the tolerance AFTER that REMOVE row's reference time (the sent date recorded on it by
    // an earlier e-mail sale, else its createdAt), it cannot be the sale that row recorded, so it consumes a unit exactly once (the REMOVE row
    // written below carries this e-mail's sent date + source tag, which the next e-mail is compared against and the replay guard recognises).
    const emailSentMs = getSoldEmailSource()?.sentAt?.getTime();
    let newEmailSaleAfterLastRemove = false;
    if (
      !sold.trustedOrder &&
      emailSentMs !== undefined &&
      !Number.isNaN(emailSentMs) &&
      live &&
      live.action === 'REMOVE' &&
      live.status === 'REMOVED' &&
      String(live.lastErrorMessage ?? '').startsWith(`sold_on_${platform.toLowerCase()}`) &&
      live.createdAt
    ) {
      const refMs = parseSoldRowSentAtMs(live.lastErrorMessage) ?? new Date(live.createdAt).getTime();
      if (!Number.isNaN(refMs) && emailSentMs > refMs + NEW_EMAIL_SALE_TOLERANCE_MS) newEmailSaleAfterLastRemove = true;
    }
    if (!newEmailSaleAfterLastRemove && (!live || live.action !== 'POST' || live.status !== 'POSTED')) {
      // CLOSED-BY-EMAIL-SALE (2026-10-12, Nickel Coin Tube bundle): for a fresh ORDER (trustedOrder) the sold-email retry may have
      // already recorded this very sale and closed the listing (latest row = REMOVE/REMOVED sold_on_<platform>, no Vinted id on it),
      // so exactReported-id counting cannot see it. Treat it as already counted: no stock change, no row. A genuine second sale
      // of a relisted item has a live POSTED row as the latest row and never reaches this branch.
      if (
        sold.trustedOrder &&
        live &&
        live.action === 'REMOVE' &&
        live.status === 'REMOVED' &&
        String(live.lastErrorMessage ?? '').startsWith(`sold_on_${platform.toLowerCase()}`) &&
        live.createdAt &&
        new Date(live.createdAt).getTime() >=
          (sold.orderCreatedAt ? new Date(sold.orderCreatedAt).getTime() : Date.now() - CLOSED_BY_EMAIL_SALE_WINDOW_MS)
      ) {
        return { kind: 'noop', reason: 'closed_by_email_sale', counted: true } as UnitSaleOutcome;
      }
      return { kind: 'noop', reason: 'no_live_posted_row', counted: await alreadyCountedFor() } as UnitSaleOutcome;
    }

    if (reportedId && live && !newEmailSaleAfterLastRemove) {
      if (live.remoteListingId) {
        if (live.remoteListingId !== reportedId) {
          return { kind: 'noop', reason: 'reported_id_differs_from_live_row_id', counted: await alreadyCountedFor() } as UnitSaleOutcome;
        }
      } else {
        // Any row (POST or the REMOVE row a unit sale writes, see below) that already carries this listing id
        // means the reported sale belongs to an earlier listing, not the live one.
        const older = await tx.marketplaceListingJob.findFirst({
          where: { itemId, platform, remoteListingId: reportedId },
          select: { id: true, action: true, status: true, lastErrorMessage: true },
        });
        if (older) {
          const counted = older.action === 'REMOVE' && older.status === 'REMOVED' && String(older.lastErrorMessage ?? '').startsWith('sold_on_');
          return { kind: 'noop', reason: 'reported_id_on_older_row', counted } as UnitSaleOutcome;
        }
        // RELIST-AFTER-SALE GUARD (2026-10-12, Dime Tube): the live row has no recorded Vinted id and a unit
        // sale was already consumed (sold_on_<platform> REMOVE row) BEFORE this live row was created, i.e. the
        // organizer relisted (or marked it posted by hand) after a sale. The wardrobe keeps reporting the OLD
        // sold listing, whose id was never recorded, so the report cannot be told apart from a sale of the
        // new listing. Without this guard that stale report consumed the freshly relisted row (and a second
        // unit), flipping the item back to "not listed" so it was offered for push again while it was live.
        // The email path (no id) and a captured id still sell the new listing normally.
        // trustedOrder (2026-10-12, Vinted bundle orders): the id comes from the order of a fresh sold notice, so it cannot be a
        // stale wardrobe re-report; every other guard (live-id mismatch, id already on a row, count refusal) still applies.
        if (live.createdAt && !sold.trustedOrder) {
          const priorUnitSale = await tx.marketplaceListingJob.findFirst({
            where: {
              itemId,
              platform,
              action: 'REMOVE',
              status: 'REMOVED',
              lastErrorMessage: { startsWith: 'sold_on_' },
              createdAt: { lt: live.createdAt },
            },
            select: { id: true },
          });
          if (priorUnitSale) return { kind: 'noop', reason: 'relist_after_sale_guard' } as UnitSaleOutcome;
        }
      }
    }

    await tx.marketplaceListingJob.create({
      data: {
        itemId,
        action: 'REMOVE',
        status: 'REMOVED',
        platform,
        lastAttemptAt: new Date(),
        // With a poller e-mail context this is `sold_on_<platform>|src:<hash of the e-mail's marker key>` so the same e-mail is recognised later.
        lastErrorMessage: soldRowMessage(`sold_on_${platform.toLowerCase()}`),
        // Remember WHICH listing sold (when reported) so a repeat report of it is recognised as already counted.
        remoteListingId: reportedId || null,
      },
    });
    const r = await sellItemUnits(itemId, 1, tx);
    return { kind: 'sold', fullySoldOut: r.fullySoldOut, remainingStock: r.remainingStock } as UnitSaleOutcome;
  });

  if (outcome.kind === 'single') return null;
  if (outcome.kind === 'noop') {
    return { ok: true, alreadyCommitted: true, noopReason: outcome.reason, ...(outcome.counted ? { alreadyCounted: true } : {}) };
  }

  if (!outcome.fullySoldOut) {
    // Stock remains: keep the item AVAILABLE, shrink eBay's count, leave every other listing live.
    syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock: outcome.remainingStock }).catch((err: any) =>
      console.warn(`[StockSync] revise-on-partial (${soldVia}) failed for item ${itemId}:`, err?.message)
    );
    return { ok: true, alreadyCommitted: false, partial: true, remainingStock: outcome.remainingStock };
  }

  // Last unit gone: same as any other sold-elsewhere SOLD (sellItemUnits already set status).
  await prisma.item.update({ where: { id: itemId }, data: { lastSoldVia: soldVia } });
  fanOutWithdrawals(itemId, soldVia, skip);
  return { ok: true, alreadyCommitted: false };
}

export async function commitFacebookNativeSale(
  itemId: string,
  soldVia: string,
  options: CommitFacebookNativeSaleOptions = {},
): Promise<CommitFacebookNativeSaleResult> {
  // ADR-136 Addendum B (#659): a bulk lot has no "sold" state a single outside sale can reach (it sells by card quantity),
  // so an outside sale signal for a lot is ignored. A failed lookup with the flag on throws so the caller retries later
  // instead of marking a lot SOLD.
  const lotRefusal = await lotChannelRefusal(prisma as any, itemId, 'FACEBOOK_NATIVE', isBulkLotsEnabled());
  if (lotRefusal) {
    if (lotRefusal.code === 'BULK_CHECK_FAILED') throw new Error('BULK_CHECK_FAILED');
    console.warn(`[commitFacebookNativeSale] item ${itemId} is a bulk lot, ignoring sold signal (${soldVia})`);
    return { ok: true, alreadyCommitted: true, bulkLotIgnored: true };
  }
  // reopen-sale (2026-10-10): the organizer reopened this item after the sale was cancelled on the marketplace. The
  // marketplace can keep reporting that cancelled listing as sold; ignore a report that names it (see saleReopenGuard).
  if (await isReportOfCancelledReopenedSale(itemId, soldVia, options.soldOnPlatform?.remoteListingId)) {
    console.warn(`[commitFacebookNativeSale] item ${itemId} was reopened after a cancelled sale, ignoring sold signal (${soldVia})`);
    return { ok: true, alreadyCommitted: true };
  }
  // Sold-e-mail replay guard (2026-10-12, see soldEmailSourceGuard.ts): only active inside the poller's e-mail context.
  if (options.soldOnPlatform) {
    const stale = await soldEmailStaleReason(itemId, options.soldOnPlatform.platform);
    if (stale) {
      console.warn(`[commitFacebookNativeSale] item ${itemId}: ignoring sold e-mail (${stale}) on ${options.soldOnPlatform.platform}`);
      return { ok: true, alreadyCommitted: true };
    }
    if (await soldEmailAlreadyApplied(itemId, options.soldOnPlatform.platform)) {
      console.warn(`[commitFacebookNativeSale] item ${itemId}: this sold e-mail already consumed a unit on ${options.soldOnPlatform.platform}, ignoring replay`);
      return { ok: true, alreadyCommitted: true };
    }
  }
  const skip = new Set<string>(options.skipWithdraw ?? []);
  if (options.soldOnPlatform) {
    const unit = await commitPlatformUnitSale(itemId, soldVia, options.soldOnPlatform, skip);
    if (unit) return unit;
  }
  try {
    await commitItemSale(itemId, 'SOLD', ['AVAILABLE']);
  } catch (err: any) {
    if (err instanceof ItemAlreadyCommittedError) {
      return { ok: true, alreadyCommitted: true };
    }
    throw err;
  }

  await prisma.item.update({ where: { id: itemId }, data: { lastSoldVia: soldVia } });

  fanOutWithdrawals(itemId, soldVia, skip);

  return { ok: true, alreadyCommitted: false };
}
