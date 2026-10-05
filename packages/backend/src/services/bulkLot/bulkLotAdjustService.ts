/**
 * bulkLotAdjustService (ADR-136 Addendum B, roadmap #659): recount and adjust the card count of a bulk lot, with a
 * history row for every change.
 *
 * The card count of a lot is Item.stockTotal (all cards ever put in) minus Item.stockSold (cards sold, plus cards on a
 * hold or in a hub cart, which are taken from the lot when they are set aside). "On hand" is total minus sold. The
 * generic item form can no longer change the total (services/bulkLot/bulkLotInvariants.ts refuses it) and the PATCH
 * route refuses totalCards and addCards; this is the one way to change the count by hand.
 *
 *   RECOUNT      the number given is the cards on hand now (counted by hand).        total = sold + number
 *   CORRECTION   same arithmetic, for fixing a wrong count entered earlier.          total = sold + number
 *   DAMAGE       the number given is how many cards to take out (damaged or lost).   total = total - number
 *   ADDED_STOCK  the number given is how many cards were added to the lot.           total = total + number
 *
 * The write is a compare-and-swap on the observed stockTotal and stockSold inside one transaction together with the
 * BulkLotAdjustment row, so a register sale landing between the read and the write can never be lost under a stale
 * count, and the history can never disagree with the stock. DAMAGE and ADDED_STOCK are relative, so on a lost race they
 * re-read and try again (up to 3 times); RECOUNT and CORRECTION are statements about "now", so on a lost race the
 * organizer is told the count changed and looks again.
 *
 * Status follows the count: 0 on hand turns an AVAILABLE lot SOLD, cards on hand turn a SOLD lot AVAILABLE. A hidden or
 * deleted lot is never touched. A RECOUNT that matches the current count is allowed and recorded (the shop counted and it
 * was right); any other adjustment that changes nothing is refused.
 *
 * No Prisma client in this module: the database client is passed in. afterChange (optional) is called after the commit
 * and must never be allowed to fail the adjustment.
 */
import { z } from 'zod';
import { BulkLotDb, bulkLotError, getOrganizerLot, OrganizerBulkLotView } from './bulkLotService';
import { MAX_LOT_CARDS, remainingCards } from './bulkLotPricing';

export const ADJUST_REASONS = ['RECOUNT', 'DAMAGE', 'CORRECTION', 'ADDED_STOCK'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export type BulkAdjustErrorCode =
  | 'BULK_ADJUST_BAD_COUNT'
  | 'BULK_ADJUST_NO_CHANGE'
  | 'BULK_ADJUST_CONFLICT'
  | 'BULK_ADJUST_TOO_MANY'
  | 'BULK_ADJUST_TOO_BIG';

export const BULK_ADJUST_MESSAGES: Record<BulkAdjustErrorCode, string> = {
  BULK_ADJUST_BAD_COUNT: 'Enter a whole number of cards that works with the cards on hand.',
  BULK_ADJUST_NO_CHANGE: 'That is the same count as now. Change the number or cancel.',
  BULK_ADJUST_CONFLICT: 'The card count changed while you were editing. Look at the new count and try again.',
  BULK_ADJUST_TOO_MANY: 'That is more cards than are on hand.',
  BULK_ADJUST_TOO_BIG: 'A bulk lot holds at most 1,000,000 cards.',
};

export class BulkAdjustError extends Error {
  readonly status: number;
  readonly code: BulkAdjustErrorCode;
  readonly extra?: Record<string, unknown>;
  constructor(code: BulkAdjustErrorCode, status: number, extra?: Record<string, unknown>) {
    super(BULK_ADJUST_MESSAGES[code]);
    this.name = 'BulkAdjustError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    Object.setPrototypeOf(this, BulkAdjustError.prototype);
  }
}

export function isBulkAdjustError(err: unknown): err is BulkAdjustError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'BulkAdjustError' && typeof (err as { code?: unknown }).code === 'string';
}

export const AdjustSchema = z
  .object({
    reason: z.enum(ADJUST_REASONS, { errorMap: () => ({ message: 'Pick a reason from the list.' }) }),
    cards: z
      .number({ invalid_type_error: 'Enter the number of cards as a whole number.', required_error: 'Enter the number of cards.' })
      .int('Enter the number of cards as a whole number.')
      .min(0, 'Enter the number of cards as a whole number.')
      .max(MAX_LOT_CARDS, 'A bulk lot holds at most 1,000,000 cards.'),
    note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  })
  .strict();
export type AdjustInput = z.infer<typeof AdjustSchema>;

export interface AdjustDb extends BulkLotDb {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  bulkLotAdjustment: {
    create(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
  };
}

export interface AdjustCtx {
  organizerId: string;
  actorUserId: string;
}

export interface AdjustmentView {
  id: string;
  itemId: string;
  reason: string;
  beforeCount: number;
  afterCount: number;
  totalBefore: number;
  totalAfter: number;
  note: string | null;
  createdAt: string;
}

export interface AdjustResult {
  adjustment: AdjustmentView;
  lot: OrganizerBulkLotView | null;
}

function parseAdjust(raw: unknown): AdjustInput {
  const parsed = AdjustSchema.safeParse(raw);
  if (!parsed.success) {
    throw bulkLotError('BULK_VALIDATION', 400, { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  return parsed.data;
}

/** Pure: the count on hand after an adjustment, or the reason it cannot be made. */
export function planAdjustment(
  reason: AdjustReason,
  entered: number,
  total: number,
  sold: number
): { onHandBefore: number; onHandAfter: number; totalAfter: number } {
  const onHandBefore = remainingCards(total, sold);
  let onHandAfter: number;
  if (reason === 'RECOUNT' || reason === 'CORRECTION') {
    onHandAfter = entered;
  } else if (reason === 'DAMAGE') {
    if (entered < 1) throw new BulkAdjustError('BULK_ADJUST_BAD_COUNT', 400);
    if (entered > onHandBefore) throw new BulkAdjustError('BULK_ADJUST_TOO_MANY', 400, { onHand: onHandBefore });
    onHandAfter = onHandBefore - entered;
  } else {
    if (entered < 1) throw new BulkAdjustError('BULK_ADJUST_BAD_COUNT', 400);
    onHandAfter = onHandBefore + entered;
  }
  const totalAfter = sold + onHandAfter;
  if (totalAfter > MAX_LOT_CARDS) throw new BulkAdjustError('BULK_ADJUST_TOO_BIG', 400);
  if (onHandAfter === onHandBefore && reason !== 'RECOUNT') throw new BulkAdjustError('BULK_ADJUST_NO_CHANGE', 409);
  return { onHandBefore, onHandAfter, totalAfter };
}

function toView(row: any): AdjustmentView {
  return {
    id: String(row.id),
    itemId: String(row.itemId),
    reason: String(row.reason),
    beforeCount: Number(row.beforeCount),
    afterCount: Number(row.afterCount),
    totalBefore: Number(row.totalBefore),
    totalAfter: Number(row.totalAfter),
    note: row.note ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
  };
}

const MAX_ATTEMPTS = 3;

export async function adjustBulkLot(
  db: AdjustDb,
  ctx: AdjustCtx,
  itemId: string,
  rawInput: unknown,
  hooks: { afterChange?: (itemId: string, why: string) => void | Promise<void> } = {}
): Promise<AdjustResult> {
  const input = parseAdjust(rawInput);
  const note = input.note && input.note.length > 0 ? input.note : null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const row = await db.item.findUnique({
      where: { id: itemId },
      select: { id: true, organizerId: true, status: true, stockTotal: true, stockSold: true, bulkLot: { select: { id: true } } },
    });
    // Another organizer's item looks exactly like a missing one.
    if (!row || row.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
    if (!row.bulkLot) throw bulkLotError('BULK_NOT_LOT', 409);

    const total = Math.max(0, Number(row.stockTotal ?? 0));
    const sold = Math.max(0, Number(row.stockSold ?? 0));
    const plan = planAdjustment(input.reason, input.cards, total, sold);

    const nextStatus = plan.onHandAfter === 0 && row.status === 'AVAILABLE' ? 'SOLD' : plan.onHandAfter > 0 && row.status === 'SOLD' ? 'AVAILABLE' : null;

    const created: any = await db.$transaction(async (tx: any) => {
      const swapped = await tx.item.updateMany({
        where: { id: itemId, organizerId: ctx.organizerId, stockTotal: row.stockTotal, stockSold: row.stockSold },
        data: { stockTotal: plan.totalAfter, ...(nextStatus ? { status: nextStatus } : {}) },
      });
      if (swapped.count !== 1) return null;
      return tx.bulkLotAdjustment.create({
        data: {
          itemId,
          organizerId: ctx.organizerId,
          actorUserId: ctx.actorUserId,
          reason: input.reason,
          beforeCount: plan.onHandBefore,
          afterCount: plan.onHandAfter,
          totalBefore: total,
          totalAfter: plan.totalAfter,
          note,
        },
      });
    });

    if (created) {
      try {
        await hooks.afterChange?.(itemId, 'adjust');
      } catch (err) {
        console.warn('[bulkLot] afterChange hook failed (ignored):', err instanceof Error ? err.message : err);
      }
      const lot = await getOrganizerLot(db, { organizerId: ctx.organizerId }, itemId);
      return { adjustment: toView(created), lot };
    }
    // Lost the race. A statement about "now" (a recount) cannot be silently re-applied to a different count.
    if (input.reason === 'RECOUNT' || input.reason === 'CORRECTION' || attempt === MAX_ATTEMPTS) {
      throw new BulkAdjustError('BULK_ADJUST_CONFLICT', 409);
    }
  }
  throw new BulkAdjustError('BULK_ADJUST_CONFLICT', 409);
}

/** Newest first. Scoped to the caller's own lot (anything else is the same 404 as a missing lot). */
export async function listAdjustments(db: AdjustDb, ctx: { organizerId: string }, itemId: string, limit = 50): Promise<AdjustmentView[]> {
  const row = await db.item.findUnique({ where: { id: itemId }, select: { id: true, organizerId: true, bulkLot: { select: { id: true } } } });
  if (!row || row.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (!row.bulkLot) throw bulkLotError('BULK_NOT_LOT', 409);
  const rows = await db.bulkLotAdjustment.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, Math.trunc(limit))),
  });
  return rows.map(toView);
}
