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
      `Cannot sell ${requested} unit(s) of item ${itemId} — only ${remaining} remaining.`
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
export async function sellItemUnits(
  itemId: string,
  unitsSold: number,
  tx?: Prisma.TransactionClient
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
  }

  return {
    fullySoldOut,
    remainingStock: Math.max(total - updated.stockSold, 0),
  };
}
