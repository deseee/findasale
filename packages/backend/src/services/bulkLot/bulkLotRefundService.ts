/**
 * bulkLotRefundService (ADR-136 Addendum B, roadmap #659): returning cards to a bulk lot when a bulk sale row is
 * refunded, in whole or in part.
 *
 * Model. A bulk sale row (Purchase.bulkQuantity = N cards, Purchase.amount = C dollars) can be refunded in several
 * steps. Purchase.bulkRefundedQuantity is the running count of cards already put back on the lot by earlier refunds
 * of that row. Each refund works out a TARGET running count and moves the column up to it with a compare-and-swap:
 *   - the refund that brings the cumulative refunded money up to the whole amount (a full refund) targets N, so the
 *     last refund always hands back exactly the cards still outstanding;
 *   - an explicit card refund ("take 500 of the 1,500 cards back") targets prior + 500;
 *   - a refund that only names money targets floor(N * refundedCentsSoFar / C), so the shop never gives back more
 *     cards than the money implies.
 * Because the target is a function of CUMULATIVE state, never of one request, replaying the same refund computes the
 * same target, finds the column already there and returns a zero delta: the cards can never go back twice. Two refunds
 * racing each read the same prior value; one wins the compare-and-swap, the other re-reads and finds its work done or
 * moves only the remainder. Everything runs inside one database transaction with the stock write, so "counted as
 * returned but not put back" cannot persist.
 *
 * Pure functions use BigInt for the products: cards (up to 1,000,000) times cents (up to 10 billion for a whole lot)
 * exceeds 2^53.
 *
 * This module imports no Prisma client and no env: the database client is passed in (BulkRefundTx), so a unit test can
 * hand it a fake and the refund services can hand it their own transaction client.
 */

export type BulkRefundSource = 'ORGANIZER' | 'ADMIN' | 'DISPUTE' | 'SQUARE_RECONCILE';

export type BulkRefundErrorCode = 'BULK_REFUND_NOT_BULK' | 'BULK_REFUND_BAD_CARDS' | 'BULK_REFUND_TOO_MANY' | 'BULK_REFUND_TOO_SMALL' | 'BULK_REFUND_DONE';

export class BulkRefundError extends Error {
  readonly status: number;
  readonly code: BulkRefundErrorCode;
  readonly extra?: Record<string, unknown>;
  constructor(message: string, status: number, code: BulkRefundErrorCode, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'BulkRefundError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    Object.setPrototypeOf(this, BulkRefundError.prototype);
  }
}

export function isBulkRefundError(err: unknown): err is BulkRefundError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'BulkRefundError' && typeof (err as { code?: unknown }).code === 'string';
}

export const BULK_REFUND_MESSAGES: Record<BulkRefundErrorCode, string> = {
  BULK_REFUND_NOT_BULK: 'That sale is not a bulk lot sale.',
  BULK_REFUND_BAD_CARDS: 'Enter a whole number of cards to take back, 1 or more.',
  BULK_REFUND_TOO_MANY: 'That is more cards than are still out on this sale.',
  BULK_REFUND_TOO_SMALL: 'That many cards is worth less than one cent of this sale. Take back more cards.',
  BULK_REFUND_DONE: 'All of the cards on this sale have already been taken back.',
};

export function bulkRefundError(code: BulkRefundErrorCode, status: number, extra?: Record<string, unknown>): BulkRefundError {
  return new BulkRefundError(BULK_REFUND_MESSAGES[code], status, code, extra);
}

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

function toBig(n: number): bigint {
  return BigInt(Math.trunc(n));
}

/** floor(a * b / c) for non-negative integers, exact (BigInt). Returns 0 when c is not positive. */
export function mulDivFloor(a: number, b: number, c: number): number {
  if (!(c > 0) || !(a > 0) || !(b > 0)) return 0;
  return Number((toBig(a) * toBig(b)) / toBig(c));
}

/** round-half-up(a * b / c) for non-negative integers, exact (BigInt). Returns 0 when c is not positive. */
export function mulDivHalfUp(a: number, b: number, c: number): number {
  if (!(c > 0) || !(a > 0) || !(b > 0)) return 0;
  return Number((toBig(a) * toBig(b) * 2n + toBig(c)) / (toBig(c) * 2n));
}

export interface BulkRowFacts {
  /** Cards the row sold (Purchase.bulkQuantity). */
  soldCards: number;
  /** What the row charged, in cents (Purchase.amount * 100, rounded). */
  purchaseCents: number;
  /** Cards already put back by earlier refunds of this row (Purchase.bulkRefundedQuantity). */
  returnedCards: number;
  /** Money already refunded on this row, in cents (Purchase.refundedAmount * 100, rounded). */
  refundedCents: number;
}

/**
 * Target running count of returned cards after a refund that names money. `cumulativeRefundedCents` is the money
 * refunded on the row INCLUDING this refund. A refund that reaches the whole amount (or a row refunded in full the
 * legacy way) targets every card; otherwise floor(cards * money / amount).
 */
export function targetCardsForMoney(facts: Pick<BulkRowFacts, 'soldCards' | 'purchaseCents'>, cumulativeRefundedCents: number): number {
  const { soldCards, purchaseCents } = facts;
  if (!(soldCards > 0)) return 0;
  if (!(purchaseCents > 0)) return cumulativeRefundedCents > 0 ? soldCards : 0;
  if (cumulativeRefundedCents >= purchaseCents) return soldCards;
  return Math.min(mulDivFloor(soldCards, Math.max(0, cumulativeRefundedCents), purchaseCents), soldCards);
}

/** Money (cents, cumulative) that corresponds to `targetCards` cards back: half up, and the whole amount for all of them. */
export function centsForCardTarget(facts: Pick<BulkRowFacts, 'soldCards' | 'purchaseCents'>, targetCards: number): number {
  const { soldCards, purchaseCents } = facts;
  if (targetCards >= soldCards) return purchaseCents;
  return mulDivHalfUp(purchaseCents, Math.max(0, targetCards), soldCards);
}

export interface ExplicitCardsPlan {
  /** Cards added by this refund. */
  cards: number;
  /** Running count of returned cards after it. */
  targetCards: number;
  /** Money this refund pays, in cents (never below one cent). */
  cents: number;
  /** True when the refund brings the row to fully refunded (every card back and every cent paid). */
  isFull: boolean;
}

/**
 * Plans "take `cards` more cards back": validates the count against what is still out, and works out the money for
 * exactly those cards, consistently with the cent rounding used when the sale was priced: the money is the
 * difference between the cumulative half-up share for the new running count and what was already refunded, so the
 * pieces always add up to the whole amount and the last piece is exact.
 */
export function planExplicitCardRefund(facts: BulkRowFacts, cardsRaw: unknown): ExplicitCardsPlan {
  const cards = typeof cardsRaw === 'number' && Number.isSafeInteger(cardsRaw) ? cardsRaw : typeof cardsRaw === 'string' && /^\d{1,9}$/.test(cardsRaw.replace(/[\s,]/g, '')) ? Number(cardsRaw.replace(/[\s,]/g, '')) : NaN;
  if (!Number.isSafeInteger(cards) || cards < 1) throw bulkRefundError('BULK_REFUND_BAD_CARDS', 400);
  const outstanding = Math.max(0, facts.soldCards - facts.returnedCards);
  if (outstanding < 1) throw bulkRefundError('BULK_REFUND_DONE', 409);
  if (cards > outstanding) throw bulkRefundError('BULK_REFUND_TOO_MANY', 400, { outstanding });
  const targetCards = facts.returnedCards + cards;
  const cumulativeCents = centsForCardTarget(facts, targetCards);
  const cents = cumulativeCents - facts.refundedCents;
  const remainingCents = Math.max(0, facts.purchaseCents - facts.refundedCents);
  if (cents < 1) throw bulkRefundError('BULK_REFUND_TOO_SMALL', 400);
  if (cents > remainingCents) throw bulkRefundError('BULK_REFUND_TOO_SMALL', 400, { remainingCents });
  const isFull = targetCards >= facts.soldCards && cents === remainingCents;
  return { cards, targetCards, cents, isFull };
}

// ---------------------------------------------------------------------------
// Database helper
// ---------------------------------------------------------------------------

/** What a transaction client (or a fake) must provide. */
export interface BulkRefundTx {
  purchase: {
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  item: {
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  bulkLotRefund: {
    create(args: any): Promise<any>;
  };
}

export interface ApplyBulkReturnArgs {
  purchaseId: string;
  itemId: string;
  soldCards: number;
  /** Running count of returned cards to move the row to. Clamped to [0, soldCards]. */
  targetCards: number;
  /** Money this refund paid, in cents (audit). */
  cents: number;
  source: BulkRefundSource;
  actorUserId?: string | null;
  /** Client replay key or null. The audit row's key defaults to the target, so one target never gets two rows. */
  idempotencyKey?: string | null;
  /** A test transaction never took stock, so it gives none back (the column still moves). */
  isTestTransaction?: boolean;
}

export interface ApplyBulkReturnResult {
  /** Cards this call moved the running count by (0 on a replay). */
  deltaCards: number;
  /** Cards actually put back into the lot's stock by this call (0 for a test transaction). */
  stockReturned: number;
  /** Running count after this call. */
  cumulativeCards: number;
  /** True when nothing was written because the row was already at or past the target. */
  replay: boolean;
}

const MAX_CAS_ATTEMPTS = 4;

/**
 * Moves Purchase.bulkRefundedQuantity up to the target with a compare-and-swap and puts exactly the difference back on
 * the lot (guarded: never below zero, never more than was sold). Call it inside the same transaction as the refund's
 * other writes. Never moves the count down.
 */
export async function applyBulkRefundReturn(tx: BulkRefundTx, args: ApplyBulkReturnArgs): Promise<ApplyBulkReturnResult> {
  const target = Math.max(0, Math.min(Math.trunc(args.targetCards), Math.trunc(args.soldCards)));
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const row = await tx.purchase.findUnique({ where: { id: args.purchaseId }, select: { bulkRefundedQuantity: true } });
    const current = Math.max(0, Number(row?.bulkRefundedQuantity) || 0);
    if (current >= target) return { deltaCards: 0, stockReturned: 0, cumulativeCards: current, replay: true };

    const swapped = await tx.purchase.updateMany({
      where: { id: args.purchaseId, bulkRefundedQuantity: current },
      data: { bulkRefundedQuantity: target },
    });
    if (swapped.count !== 1) continue; // another refund moved it first: re-read and recompute our remainder

    const delta = target - current;
    let stockReturned = 0;
    if (!args.isTestTransaction) {
      // Guarded decrement: stockSold never goes below zero. If it is lower than what we return (it was edited by a
      // recount), floor it at zero rather than fail the refund.
      const dec = await tx.item.updateMany({ where: { id: args.itemId, stockSold: { gte: delta } }, data: { stockSold: { decrement: delta } } });
      if (dec.count === 1) {
        stockReturned = delta;
      } else {
        const item = await tx.item.findUnique({ where: { id: args.itemId }, select: { stockSold: true } });
        const sold = Math.max(0, Number(item?.stockSold) || 0);
        if (sold > 0) {
          await tx.item.updateMany({ where: { id: args.itemId, stockSold: sold }, data: { stockSold: 0 } });
          stockReturned = sold;
        }
      }
      // A lot that had sold out comes back on sale once cards are back. Only SOLD -> AVAILABLE, never walks a later
      // transition (hidden, deleted) backwards.
      const after = await tx.item.findUnique({ where: { id: args.itemId }, select: { status: true, stockTotal: true, stockSold: true } });
      if (after && after.status === 'SOLD' && Math.max(0, (Number(after.stockTotal) || 1) - (Number(after.stockSold) || 0)) > 0) {
        await tx.item.updateMany({ where: { id: args.itemId, status: 'SOLD' }, data: { status: 'AVAILABLE' } });
      }
    }

    await tx.bulkLotRefund.create({
      data: {
        purchaseId: args.purchaseId,
        itemId: args.itemId,
        cardsReturned: stockReturned,
        cumulativeCards: target,
        cents: Math.max(0, Math.trunc(args.cents)),
        source: args.source,
        actorUserId: args.actorUserId ?? null,
        idempotencyKey: args.idempotencyKey ?? `cum:${target}`,
      },
    });
    return { deltaCards: delta, stockReturned, cumulativeCards: target, replay: false };
  }
  // Four lost races in a row is not a real situation; fail loudly so the caller's transaction rolls back.
  throw new Error(`applyBulkRefundReturn: could not move bulkRefundedQuantity for purchase ${args.purchaseId} (contention)`);
}
