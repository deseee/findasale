/**
 * itemStockService.ts — ADR-085 Track B, Phase 1 Step 2.
 *
 * Single shared authority for "sell N units of an Item" across every channel
 * (POS, terminal, Stripe checkout, reservations, vendor-booth, eBay). Replaces
 * the 13 independent `prisma.item.update({ data: { status: 'SOLD' } })` call
 * sites that previously existed (those are switched over in a LATER, separate
 * dispatch — this service is built and wired to eBay only in this pass).
 *
 * Item.stockTotal / Item.stockSold are the general, cross-channel stock pool —
 * distinct from:
 *  - Item.quantity ("items bundled into one AI-clustered lot" — unrelated concept)
 *  - Item.ebayQuantityAvailable / ebayQuantitySold / EbaySoldEvent (eBay-specific
 *    idempotent sale ledger, keyed on ebayOrderId+ebayLineItemId — stays as-is,
 *    calls into this service as an additional side effect, see ebaySoldSyncCron.ts)
 *
 * SECURITY: stockSold is SERVER-OWNED. It must never be added to any client-facing
 * update whitelist (see itemController.ts updateItem and the ADR-085 Track A bug
 * class this guards against). Only this service may write it.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class InsufficientStockError extends Error {
  constructor(itemId: string, requested: number, remaining: number) {
    super(
      `Cannot sell ${requested} unit(s) of item ${itemId}: only ${remaining} remaining.`
    );
    this.name = 'InsufficientStockError';
  }
}

export interface SellItemUnitsResult {
  fullySoldOut: boolean;
  remainingStock: number;
}

/**
 * Atomically sells `unitsSold` units of `itemId`, decrementing the general
 * stock pool. Uses a guarded conditional update (not read-then-write) so two
 * concurrent callers racing for the last unit can never both succeed — the
 * update's WHERE clause re-checks capacity at the database level.
 *
 * Sets Item.status = 'SOLD' once stockSold reaches stockTotal (treating a
 * null stockTotal as 1, matching today's single-unit behavior exactly).
 * Otherwise leaves status untouched (an AVAILABLE item with remaining stock
 * stays AVAILABLE) — callers must not assume this function ever sets status
 * back to AVAILABLE; it only ever moves forward toward SOLD.
 *
 * Throws InsufficientStockError if the sale would oversell — callers MUST
 * handle this (it means the caller's own earlier availability check was
 * stale, e.g. a race with another channel). Never silently no-ops.
 */
// Prisma v5: prisma is $extends-wrapped, so the client `prisma.$transaction(cb)`
// hands to `cb` is the EXTENDED transaction flavor
// (Omit<typeof prisma, ITXClientDenyList>), which is NOT assignable to the plain
// `Prisma.TransactionClient`. Accept either so every call site (base tx or the
// extended tx from an interactive transaction) type-checks. Confirmed via CI, not guessed.
type SellItemUnitsTx =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function sellItemUnits(
  itemId: string,
  unitsSold: number,
  tx?: SellItemUnitsTx
): Promise<SellItemUnitsResult> {
  if (!Number.isInteger(unitsSold) || unitsSold < 1) {
    throw new Error(`sellItemUnits: unitsSold must be a positive integer, got ${unitsSold}`);
  }

  // NOTE: explicit Prisma.TransactionClient annotation (not `const client = tx ?? prisma`)
  // is required here -- letting TS infer a PrismaClient|Prisma.TransactionClient union on
  // this variable causes a known Prisma v5 TS pitfall ("excessive stack depth comparing
  // types ItemFindUniqueArgs<...>", "This expression is not callable") once it's used with
  // $executeRaw/findUniqueOrThrow below. PrismaClient is structurally a superset of
  // Prisma.TransactionClient (same query delegates, minus lifecycle methods we don't call
  // here), so this cast is safe -- confirmed via GitHub Actions CI failure, not guessed.
  const client: Prisma.TransactionClient = (tx ?? prisma) as Prisma.TransactionClient;

  // Guarded conditional update: only matches a row where the sale fits within
  // remaining capacity. Treats stockTotal IS NULL as "total = 1" via COALESCE,
  // matching the schema default and every existing single-unit item.
  // updateMany (not update) so a WHERE-clause miss returns count:0 instead of
  // throwing a Prisma "record not found" error — that lets us distinguish
  // "item doesn't exist" from "item exists but oversold" below.
  const guarded = await client.$executeRaw`
    UPDATE "Item"
    SET "stockSold" = "stockSold" + ${unitsSold}
    WHERE "id" = ${itemId}
      AND "stockSold" + ${unitsSold} <= COALESCE("stockTotal", 1)
  `;

  if (guarded === 0) {
    // Either the item doesn't exist, or the sale would oversell. Distinguish
    // for a clearer error message (existence check is cheap and only runs on
    // the already-rare failure path).
    const existing = await client.item.findUnique({
      where: { id: itemId },
      select: { stockTotal: true, stockSold: true },
    });
    if (!existing) {
      throw new Error(`sellItemUnits: item ${itemId} not found`);
    }
    const remaining = (existing.stockTotal ?? 1) - existing.stockSold;
    throw new InsufficientStockError(itemId, unitsSold, Math.max(remaining, 0));
  }

  const updated = await client.item.findUniqueOrThrow({
    where: { id: itemId },
    select: { stockTotal: true, stockSold: true, status: true },
  });

  const total = updated.stockTotal ?? 1;
  const fullySoldOut = updated.stockSold >= total;

  if (fullySoldOut && updated.status !== 'SOLD') {
    await client.item.update({
      where: { id: itemId },
      data: { status: 'SOLD' },
    });
  } else if (!fullySoldOut && (updated.status === 'RESERVED' || updated.status === 'INVOICE_ISSUED')) {
    // Partial sale on a multi-stock item: the unit that just sold is settled, but stock
    // remains, so the item must not be left stranded at a hold/invoice-blocking status --
    // every other unit becomes permanently un-holdable otherwise (confirmed live production
    // incident, S-PAYMENT-INVOICE-GAPS-2026-08-25). Guarded on the status we just read (not a
    // bare update) so a genuinely later transition -- SOLD, AUCTION_ENDED, DONATED -- made by
    // a concurrent caller between our read and this write is never walked backwards.
    await client.item.updateMany({
      where: { id: itemId, status: updated.status },
      data: { status: 'AVAILABLE' },
    });
  }

  return {
    fullySoldOut,
    remainingStock: Math.max(total - updated.stockSold, 0),
  };
}

/**
 * ADR-136 Addendum A (2026-10-05, #659): the transaction-capable variant of the guarded decrement, used to sell N
 * units (for a bulk lot, N cards) INSIDE a database transaction together with the Purchase row that records the sale.
 *
 * Differences from sellItemUnits (which is left exactly as it was for every other caller):
 *  - ONE statement. The capacity guard, the stockSold increment and the status change are a single UPDATE ... RETURNING,
 *    so there is no moment in which stockSold has reached stockTotal while status still says AVAILABLE, and no second
 *    read to race with. sellItemUnits does the increment, a read, then a separate status write.
 *  - `tx` is required (the caller owns the transaction, so a failure anywhere in it rolls this decrement back with the
 *    rest; nothing has to be given back by hand).
 *  - It never writes the legacy "RESERVED or INVOICE_ISSUED back to AVAILABLE" status on a partial sale unless the item
 *    is in one of those two states (same rule as sellItemUnits), and it moves to SOLD only when the last unit goes.
 *
 * Throws InsufficientStockError when the sale would oversell (the UPDATE matched no row and the item exists), and a plain
 * Error when the item does not exist. A caller inside a transaction treats both as "abort the whole transaction".
 */
export async function sellItemUnitsInTransaction(
  tx: SellItemUnitsTx,
  itemId: string,
  unitsSold: number
): Promise<SellItemUnitsResult> {
  if (!Number.isInteger(unitsSold) || unitsSold < 1) {
    throw new Error(`sellItemUnitsInTransaction: unitsSold must be a positive integer, got ${unitsSold}`);
  }
  // Same explicit annotation as sellItemUnits (Prisma v5 union-type pitfall, see the comment there).
  const client: Prisma.TransactionClient = tx as Prisma.TransactionClient;

  const rows = await client.$queryRaw<Array<{ stockTotal: number | null; stockSold: number; status: string }>>`
    UPDATE "Item"
    SET "stockSold" = "stockSold" + ${unitsSold},
        "status" = CASE
          WHEN "stockSold" + ${unitsSold} >= COALESCE("stockTotal", 1) THEN 'SOLD'
          WHEN "status" IN ('RESERVED', 'INVOICE_ISSUED') THEN 'AVAILABLE'
          ELSE "status"
        END
    WHERE "id" = ${itemId}
      AND "stockSold" + ${unitsSold} <= COALESCE("stockTotal", 1)
    RETURNING "stockTotal", "stockSold", "status"
  `;

  if (!rows || rows.length === 0) {
    const existing = await client.item.findUnique({
      where: { id: itemId },
      select: { stockTotal: true, stockSold: true },
    });
    if (!existing) {
      throw new Error(`sellItemUnitsInTransaction: item ${itemId} not found`);
    }
    const remaining = (existing.stockTotal ?? 1) - existing.stockSold;
    throw new InsufficientStockError(itemId, unitsSold, Math.max(remaining, 0));
  }

  const row = rows[0];
  const total = row.stockTotal ?? 1;
  const sold = Number(row.stockSold);
  return {
    fullySoldOut: sold >= total,
    remainingStock: Math.max(total - sold, 0),
  };
}
