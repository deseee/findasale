/**
 * bulkLotOfflineService (ADR-136 Addendum B, roadmap #659): what an offline-queued register sale of a bulk lot becomes
 * when the device comes back online.
 *
 * A queued cash sale carries, per lot line, the cards sold (`quantity`) and the dollars the register showed (`amount`).
 * On replay the server prices the line again (cards x price per 1,000, half up to the cent, once), so a lot repriced or
 * partly sold while the device was offline can never be sold at the old price or oversold. processCashSaleCore already
 * refuses such a line with PRICE_CHANGED or INSUFFICIENT_STOCK and takes nothing. This module answers the other half:
 * telling the organizer exactly WHAT changed, for EVERY lot line of the sale, in a shape the sync queue can show.
 *
 *   previewOfflineBulkLines  reads each lot line fresh and returns { conflicts }: one entry per line that no longer
 *                            sells as queued (title, cards asked for, the price the register showed, the price now,
 *                            the cards left, a plain reason). Nothing is written.
 *   BULK_CONFLICT_MESSAGE    the one-line failure the queue shows above the per-line detail.
 *
 * A replay of a sale that was already recorded (same clientTransactionId) is never previewed: the caller checks that
 * first, because a recorded sale correctly shows fewer cards on hand than it asked for.
 *
 * No Prisma client and no env in this module: the database client is passed in.
 */
import {
  BULK_LOT_MESSAGES,
  BulkLotDb,
  BulkLotErrorCode,
  findBulkLotItemIds,
  isBulkLotError,
  planBulkLine,
} from './bulkLotService';
import { remainingCards } from './bulkLotPricing';

export const BULK_CONFLICT_CODE = 'BULK_CONFLICT';
export const BULK_CONFLICT_MESSAGE = 'Some bulk lot lines changed while this device was offline. Nothing was charged or taken from the lot. Review the lines and ring the sale up again.';

export interface OfflineLine {
  itemId?: string;
  amount?: number;
  quantity?: number | string;
}

export interface BulkConflict {
  itemId: string;
  title: string;
  /** What went wrong, a bulk lot code (PRICE_CHANGED, INSUFFICIENT_STOCK, NOT_AVAILABLE, ...). */
  code: BulkLotErrorCode;
  /** Plain-language reason, from the shared bulk lot copy. */
  message: string;
  /** Cards the queued sale asked for, or null when the queued quantity was not a whole number. */
  requestedCards: number | null;
  /** Cents the register showed for the line, or null when it sent none. */
  clientCents: number | null;
  /** Cents the server prices the line at now, or null when it cannot be priced (sold out, no price). */
  expectedCents: number | null;
  /** Cards on hand in the lot now. */
  remainingCards: number;
}

export interface OfflineBulkPreview {
  conflicts: BulkConflict[];
  /** How many lines of the sale are lots (0 means the sale is a plain item sale and nothing was checked). */
  lotLines: number;
}

function toCents(amount: unknown): number | null {
  return typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function requestedCardsOf(quantity: unknown): number | null {
  const n = typeof quantity === 'number' ? quantity : typeof quantity === 'string' && /^\d{1,9}$/.test(quantity.trim()) ? Number(quantity.trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export async function previewOfflineBulkLines(
  db: Pick<BulkLotDb, 'item' | 'itemBulkLot'>,
  params: { items: ReadonlyArray<OfflineLine>; flagOn: boolean }
): Promise<OfflineBulkPreview> {
  const ids = params.items.map((l) => l.itemId).filter((v): v is string => typeof v === 'string' && v.length > 0);
  // Throws BULK_CHECK_FAILED with the flag on: the caller treats that as retryable.
  const lotIds = await findBulkLotItemIds(db, ids, params.flagOn);
  if (lotIds.size === 0) return { conflicts: [], lotLines: 0 };

  const rows = await db.item.findMany({
    where: { id: { in: Array.from(lotIds) } },
    select: { id: true, title: true, price: true, status: true, stockTotal: true, stockSold: true },
  });
  const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));
  const conflicts: BulkConflict[] = [];
  let lotLines = 0;

  for (const line of params.items) {
    if (!line.itemId || !lotIds.has(line.itemId)) continue;
    lotLines += 1;
    const row = byId.get(line.itemId);
    const base = {
      itemId: line.itemId,
      title: String(row?.title ?? 'Bulk lot'),
      requestedCards: requestedCardsOf(line.quantity),
      clientCents: toCents(line.amount),
      remainingCards: row ? remainingCards(row.stockTotal, row.stockSold) : 0,
    };
    const conflict = (code: BulkLotErrorCode, expectedCents: number | null): void => {
      conflicts.push({ ...base, code, message: BULK_LOT_MESSAGES[code], expectedCents });
    };
    if (!params.flagOn) {
      conflict('BULK_DISABLED', null);
      continue;
    }
    if (line.quantity === undefined || line.quantity === null) {
      conflict('BULK_QUANTITY_REQUIRED', null);
      continue;
    }
    if (!row) {
      conflict('BULK_NOT_FOUND', null);
      continue;
    }
    try {
      planBulkLine(row, line.quantity, typeof line.amount === 'number' ? line.amount : null);
    } catch (err) {
      if (!isBulkLotError(err)) throw err;
      const expected = typeof err.extra?.expectedCents === 'number' ? (err.extra.expectedCents as number) : null;
      conflict(err.code, expected);
    }
  }
  return { conflicts, lotLines };
}

/** Is this one of the codes a bulk line can fail with (so the queue should show the per-line detail)? */
export function isBulkLineCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  return code.startsWith('BULK_') || code === 'PRICE_CHANGED' || code === 'INSUFFICIENT_STOCK' || code === 'NOT_AVAILABLE' || code === 'BAD_QUANTITY' || code === 'BAD_PRICE' || code === 'QUANTITY_TOO_SMALL';
}
