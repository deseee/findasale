/**
 * Pure merge logic for the card intake (ADR-134 section 4.6). No database, no I/O.
 *
 *  - In-file duplicates (same dedupKey twice) are summed before the database step; the first
 *    non-blank price, cost and sku win; the first row of the group is the one that is written.
 *  - ADD:     stockTotal = stockTotal + qty   (a null or single-unit stockTotal counts as 1)
 *  - REPLACE: stockTotal = max(qty, stockSold)  (never below what has already sold)
 *  - stockSold is never written (itemStockService owns it).
 *  - Merge target: the oldest matching Item of this sale (AVAILABLE and not deleted, which the caller's
 *    query guarantees; SOLD items are never merge targets).
 */
import type { IntakeMode, PlannedRow } from './types';

export const MAX_STOCK_TOTAL = 2_000_000_000;

export interface Group {
  key: string;
  firstRow: number;
  rows: number[];
  quantity: number;
  price: number | null;
  costBasis: number | null;
  sku: string | null;
}

/** Groups the OK rows of a plan by dedupKey, in file order. */
export function groupRows(rows: Iterable<PlannedRow>): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.status !== 'OK' || !row.dedupKey) continue;
    const g = groups.get(row.dedupKey);
    if (!g) {
      groups.set(row.dedupKey, {
        key: row.dedupKey,
        firstRow: row.row,
        rows: [row.row],
        quantity: row.quantity,
        price: row.price,
        costBasis: row.costBasis,
        sku: row.sku,
      });
      continue;
    }
    g.rows.push(row.row);
    g.quantity += row.quantity;
    if (g.price === null && row.price !== null) g.price = row.price;
    if (g.costBasis === null && row.costBasis !== null) g.costBasis = row.costBasis;
    if (g.sku === null && row.sku !== null) g.sku = row.sku;
  }
  return groups;
}

export interface StockState {
  stockTotal: number | null;
  stockSold: number;
}

/** The new stockTotal for a merge. Returns null when the result would be out of range. */
export function nextStockTotal(mode: IntakeMode, current: StockState, quantity: number): number | null {
  const sold = Number.isFinite(current.stockSold) ? current.stockSold : 0;
  const next = mode === 'ADD' ? (current.stockTotal ?? 1) + quantity : Math.max(quantity, sold);
  return Number.isSafeInteger(next) && next >= 0 && next <= MAX_STOCK_TOTAL ? next : null;
}

export interface TargetCandidate {
  id: string;
  createdAt: Date | string | number;
}

/** The oldest candidate, and whether there was more than one. */
export function chooseTarget<T extends TargetCandidate>(candidates: readonly T[] | undefined): { target: T | null; multiple: boolean } {
  if (!candidates || candidates.length === 0) return { target: null, multiple: false };
  const sorted = [...candidates].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { target: sorted[0], multiple: sorted.length > 1 };
}
