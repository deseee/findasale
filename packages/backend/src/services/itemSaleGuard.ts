/**
 * itemSaleGuard.ts — ADR-098 (2026-07-29): atomic, race-safe "commit a sale"
 * guard, closing the double-sell gap confirmed on item "Borosilicate Glass
 * Tubing, Clear 12mm OD, ABR Imagery AR12" (sold online AND in person the
 * same day).
 *
 * Root cause (ADR-098 §3): two of the four code paths that can move
 * Item.status into a committed/sale-completing state did NOT guard the write
 * — terminalController.ts and reservationController.ts already do (copy their
 * pattern, don't reinvent it; see ADR-098 §2.2/§2.3). This service brings
 * itemController.ts's updateItem and posController.ts's invoice-creation
 * endpoints up to the same standard via a single shared helper, so there is
 * exactly one place this logic can drift out of sync in the future.
 *
 * Option B from the ADR (no schema migration): use Postgres's own atomicity
 * via a conditional `updateMany` — the WHERE (current status must be one of
 * fromStatuses) and the SET (new status) happen as ONE atomic statement at the
 * database level, so two concurrent requests racing for the same item can
 * never both succeed. This is read-then-write-as-one-op, not
 * read-check-then-separately-write (which is what left the original gap
 * exploitable under true concurrency).
 *
 * SECURITY: this is the ONLY function that should ever write a sale-completing
 * status transition (SOLD / INVOICE_ISSUED) outside of terminalController.ts
 * and reservationController.ts (already correct, left alone per ADR-098 §2.4).
 * Do not bypass this with a raw `prisma.item.update({ data: { status: ... } })`
 * at any new or existing call site that commits a sale.
 */

import { Item, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Thrown when commitItemSale() cannot legally perform the requested
 * transition — either because another request already won the race (the
 * atomic updateMany matched zero rows), or because a PAID Purchase already
 * exists for this item (defense-in-depth: catches the case where Item.status
 * itself is stale/wrong but a real completed sale already exists).
 *
 * Call sites MUST catch this and respond 409 Conflict with a clear,
 * user-facing message — never let it fall through to a generic 500.
 */
export class ItemAlreadyCommittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItemAlreadyCommittedError';
  }
}

/**
 * Atomically transition an item into a "committed" (sale-completing) status.
 * Returns the updated item on success. Throws ItemAlreadyCommittedError if the
 * item was not in an allowed prior state (i.e., someone else already sold or
 * invoiced it) or if a PAID Purchase already exists for it.
 *
 * @param itemId       The Item to transition.
 * @param toStatus     The sale-completing status to write. 'SOLD' for a direct
 *                      sale (itemController.ts updateItem's manual "mark sold"
 *                      path). 'INVOICE_ISSUED' for the POS hold-to-invoice
 *                      flows (posController.ts createCombinedInvoice /
 *                      sendHoldInvoice), matching the existing INVOICE_ISSUED
 *                      value reservationController.ts's own hold-to-pay path
 *                      already writes (see ADR-098 §2.1) — this does NOT flip
 *                      the item to SOLD; the actual sale is still finalized
 *                      by the Stripe webhook once payment is captured. Writing
 *                      INVOICE_ISSUED here (instead of leaving Item.status
 *                      untouched) is what makes the guard race-safe: a mere
 *                      read-only precondition check would re-open the exact
 *                      TOCTOU window this ADR exists to close.
 * @param fromStatuses The set of statuses this transition is legal FROM
 *                      (defaults to ['AVAILABLE']). Pass
 *                      ['AVAILABLE', 'RESERVED'] for flows that also need to
 *                      cover an item currently held via placeHold (which sets
 *                      Item.status = 'RESERVED' at hold-creation time).
 */
// Prisma v5: prisma is $extends-wrapped, so prisma.$transaction(cb) hands `cb` the
// EXTENDED transaction flavor, which is NOT assignable to the plain
// Prisma.TransactionClient — accept either so every call site (base client or an
// interactive-transaction client passed in by a caller batching multiple items into
// one atomic commit) type-checks. Same pattern as itemStockService.ts's sellItemUnits.
type CommitItemSaleTx =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * @param tx Optional transaction client. Pass this when committing MULTIPLE items as
 *           part of one logical operation (e.g. posController.ts createCombinedInvoice's
 *           multi-item cart) so that if any one item loses the race, the whole batch
 *           rolls back together instead of leaving some items transitioned and others not.
 *           Omit it for a single-item commit (e.g. itemController.ts updateItem,
 *           posController.ts sendHoldInvoice) — each call then runs as its own atomic
 *           statement against the shared Prisma singleton.
 */
export async function commitItemSale(
  itemId: string,
  toStatus: 'SOLD' | 'INVOICE_ISSUED',
  fromStatuses: string[] = ['AVAILABLE'],
  tx?: CommitItemSaleTx,
): Promise<Item> {
  const client: Prisma.TransactionClient = (tx ?? prisma) as Prisma.TransactionClient;

  // Defense-in-depth: reject if a PAID Purchase already exists for this item,
  // even if Item.status itself is somehow stale/wrong (e.g. a prior bug left
  // it at AVAILABLE despite a completed sale).
  // isTestTransaction exclusion (2026-08-29): a test-transaction Purchase (terminalController.ts's
  // cash-payment safety net, reservationController.ts's RECORD/markSold path) is deliberately
  // written as PAID while leaving Item.status untouched -- no real inventory was consumed -- so it
  // must never be mistaken here for a real completed sale that should block this item's real commit.
  const existingPaidPurchase = await client.purchase.findFirst({
    where: { itemId, status: 'PAID', isTestTransaction: false },
    select: { id: true },
  });
  if (existingPaidPurchase) {
    throw new ItemAlreadyCommittedError(`Item ${itemId} already has a completed purchase`);
  }

  // Atomic condition + write — race-safe at the Postgres level. The WHERE
  // clause (status must currently be one of fromStatuses) and the SET (new
  // status) are evaluated as a single statement, so two concurrent callers
  // can never both match and both succeed.
  const result = await client.item.updateMany({
    where: { id: itemId, status: { in: fromStatuses } },
    data: { status: toStatus },
  });

  if (result.count === 0) {
    throw new ItemAlreadyCommittedError(`Item ${itemId} is not in an allowed state for this transition`);
  }

  return client.item.findUniqueOrThrow({ where: { id: itemId } });
}
