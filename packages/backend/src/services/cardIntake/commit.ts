/**
 * Chunked commit for the card intake (ADR-134 sections 4.6 and 4.7, batch B4).
 *
 * The planned rows are written in chunks of 100 rows. Each chunk is ONE interactive transaction that
 *   1. takes pg_advisory_xact_lock(hashtext(saleId)), so two imports into one sale serialize,
 *   2. re-reads the batch cursor and skips the chunk if another run already committed it,
 *   3. looks up existing AVAILABLE items of THIS sale (by dedupKey and by sku) and merges or creates,
 *   4. advances committedThroughRow and the counters in the same transaction.
 * A browser disconnect (shouldCancel) stops after the current chunk and marks the batch CANCELLED; sending
 * the same file again resumes from committedThroughRow with no duplicate Items.
 *
 * Only the card record write path of cardRecordService is used for card columns (planner.ts builds them
 * with buildCardCreateData and computeDedupKey); this module never writes ItemCard on its own.
 * The database client is injected; no Prisma code is imported here. No Vision, Haiku or network service is used.
 */
import { CHUNK_SIZE, CHUNK_TX_TIMEOUT_MS } from './config';
import { ERROR_SAMPLE_CAP } from './config';
import { BatchRow, ErrorSampleEntry, LedgerDb, markBatch, mergeErrorSample } from './batchLedger';
import { buildNewItemData } from './buildItem';
import { errorsCsvLine } from './errorsCsv';
import { Group, MAX_STOCK_TOTAL, chooseTarget, groupRows, nextStockTotal } from './mergeEngine';
import { ROW_ERROR_MESSAGES } from './messages';
import type { IntakeMode, PlannedRow, RowErrorInfo } from './types';

export interface CommitTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  item: {
    findMany(args: any): Promise<any[]>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  cardIntakeBatch: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface CommitDb extends LedgerDb {
  $transaction<T>(fn: (tx: CommitTx) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}

export interface ProgressEvent {
  type: 'progress';
  phase: 'writing';
  processed: number;
  total: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
}

export interface RowErrorEvent {
  type: 'rowError';
  row: number;
  code: string;
  field: string | null;
  message: string;
  source: Record<string, string>;
  csvLine: string;
  /** True when this error is re-sent for a row before the resume point (it was already counted). */
  replayed?: boolean;
}

export type CommitEvent = ProgressEvent | RowErrorEvent;

export interface CommitParams {
  db: CommitDb;
  batch: BatchRow;
  saleId: string;
  organizerId: string;
  mode: IntakeMode;
  /** Every row of the file in file order (OK, SKIP and ERROR rows). */
  rows: readonly PlannedRow[];
  headers: readonly string[];
  shouldCancel: () => boolean;
  emit: (event: CommitEvent) => void | Promise<void>;
}

export interface CommitOutcome {
  status: 'COMPLETED' | 'CANCELLED';
  batch: BatchRow;
  /** Warning code -> number of rows or groups (DUPLICATE_IN_FILE_MERGED, MULTIPLE_MATCHES, ...). */
  warnings: Record<string, number>;
}

interface ChunkResult {
  skippedChunk: boolean;
  batch: BatchRow;
  rowErrors: RowErrorEvent[];
  warnings: Record<string, number>;
}

function rowErrorEvent(row: PlannedRow, error: RowErrorInfo, headers: readonly string[], replayed = false): RowErrorEvent {
  const event: RowErrorEvent = {
    type: 'rowError',
    row: row.row,
    code: error.code,
    field: error.field,
    message: error.message,
    source: row.source,
    csvLine: errorsCsvLine(headers, row.source, error.message),
  };
  if (replayed) event.replayed = true;
  return event;
}

function bump(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

interface ExistingItem {
  id: string;
  createdAt: Date | string;
  stockTotal: number | null;
  stockSold: number;
  sku: string | null;
  card: { dedupKey: string } | null;
}

const ITEM_SELECT = {
  id: true,
  createdAt: true,
  stockTotal: true,
  stockSold: true,
  sku: true,
  card: { select: { dedupKey: true } },
} as const;

async function commitChunk(
  tx: CommitTx,
  p: CommitParams,
  chunk: readonly PlannedRow[],
  groups: Map<string, Group>,
  warnedGroups: Set<string>
): Promise<ChunkResult> {
  const lastRow = chunk[chunk.length - 1].row;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.saleId}))`;
  const fresh: BatchRow | null = await tx.cardIntakeBatch.findUnique({ where: { id: p.batch.id } });
  if (!fresh) throw new Error('Intake batch disappeared');
  if (fresh.committedThroughRow >= lastRow) {
    return { skippedChunk: true, batch: fresh, rowErrors: [], warnings: {} };
  }
  const todo = chunk.filter((r) => r.row > fresh.committedThroughRow);

  // Prefetch every possible merge target of this chunk: existing, available, undeleted items of THIS sale.
  const keys: string[] = [];
  const skus: string[] = [];
  for (const r of todo) {
    if (r.status !== 'OK' || !r.dedupKey) continue;
    const g = groups.get(r.dedupKey);
    if (!g || g.firstRow !== r.row) continue;
    keys.push(r.dedupKey);
    if (g.sku) skus.push(g.sku);
  }
  const byKey = new Map<string, ExistingItem[]>();
  const bySku = new Map<string, ExistingItem>();
  const register = (item: ExistingItem) => {
    if (item.card?.dedupKey) {
      const list = byKey.get(item.card.dedupKey) ?? [];
      if (!list.some((i) => i.id === item.id)) list.push(item);
      byKey.set(item.card.dedupKey, list);
    }
    if (item.sku && !bySku.has(item.sku)) bySku.set(item.sku, item);
  };
  if (keys.length > 0) {
    const found: ExistingItem[] = await tx.item.findMany({
      where: { saleId: p.saleId, status: 'AVAILABLE', deletedAt: null, card: { is: { dedupKey: { in: keys } } } },
      select: ITEM_SELECT,
    });
    found.forEach(register);
  }
  if (skus.length > 0) {
    const found: ExistingItem[] = await tx.item.findMany({
      where: { saleId: p.saleId, status: 'AVAILABLE', deletedAt: null, sku: { in: skus } },
      select: ITEM_SELECT,
    });
    found.forEach(register);
  }

  let created = 0;
  let merged = 0;
  let skipped = 0;
  let errors = 0;
  const rowErrors: RowErrorEvent[] = [];
  const sample: ErrorSampleEntry[] = [];
  const warnings: Record<string, number> = {};
  const fail = (row: PlannedRow, error: RowErrorInfo) => {
    errors += 1;
    rowErrors.push(rowErrorEvent(row, error, p.headers));
    sample.push({ row: row.row, code: error.code, message: error.message });
  };

  for (const r of todo) {
    if (r.status === 'ERROR' && r.error) {
      fail(r, r.error);
      continue;
    }
    if (r.status === 'SKIP') {
      skipped += 1;
      continue;
    }
    if (r.status !== 'OK' || !r.dedupKey || !r.card) continue;
    const g = groups.get(r.dedupKey);
    if (!g) continue;
    if (g.firstRow !== r.row) {
      // A later duplicate: its quantity is already part of the group's first row.
      merged += 1;
      continue;
    }
    if (g.rows.length > 1 && !warnedGroups.has(g.key)) {
      warnedGroups.add(g.key);
      bump(warnings, 'DUPLICATE_IN_FILE_MERGED');
    }

    // Find the target. A matching sku points at its Item; it must be the same card or the row fails.
    let target: ExistingItem | null = null;
    if (g.sku && bySku.has(g.sku)) {
      const bySkuItem = bySku.get(g.sku) as ExistingItem;
      if (bySkuItem.card?.dedupKey !== g.key) {
        fail(r, { code: 'SKU_CONFLICT', field: 'sku', message: ROW_ERROR_MESSAGES.SKU_CONFLICT });
        continue;
      }
      target = bySkuItem;
    } else {
      const choice = chooseTarget(byKey.get(g.key));
      target = choice.target;
      if (choice.multiple) bump(warnings, 'MULTIPLE_MATCHES');
    }

    if (target) {
      const next = nextStockTotal(p.mode, { stockTotal: target.stockTotal, stockSold: target.stockSold }, g.quantity);
      if (next === null) {
        fail(r, { code: 'BAD_QUANTITY', field: 'quantity', message: ROW_ERROR_MESSAGES.BAD_QUANTITY });
        continue;
      }
      if (next !== target.stockTotal) {
        await tx.item.update({ where: { id: target.id }, data: { stockTotal: next } });
        target.stockTotal = next;
      }
      merged += 1;
      continue;
    }

    if (g.quantity > MAX_STOCK_TOTAL) {
      fail(r, { code: 'BAD_QUANTITY', field: 'quantity', message: ROW_ERROR_MESSAGES.BAD_QUANTITY });
      continue;
    }
    const createdItem = await tx.item.create({
      data: buildNewItemData({
        saleId: p.saleId,
        organizerId: p.organizerId,
        card: r.card,
        quantity: g.quantity,
        price: g.price,
        costBasis: g.costBasis,
        sku: g.sku,
      }),
      select: ITEM_SELECT,
    });
    created += 1;
    if (createdItem && createdItem.id) {
      register({
        id: createdItem.id,
        createdAt: createdItem.createdAt ?? new Date(),
        stockTotal: createdItem.stockTotal ?? g.quantity,
        stockSold: createdItem.stockSold ?? 0,
        sku: createdItem.sku ?? g.sku,
        card: { dedupKey: g.key },
      });
    }
  }

  const updated: BatchRow = await tx.cardIntakeBatch.update({
    where: { id: p.batch.id },
    data: {
      committedThroughRow: lastRow,
      createdCount: fresh.createdCount + created,
      mergedCount: fresh.mergedCount + merged,
      skippedCount: fresh.skippedCount + skipped,
      errorCount: fresh.errorCount + errors,
      errorSample: mergeErrorSample(fresh.errorSample, sample).slice(0, ERROR_SAMPLE_CAP),
    },
  });
  return { skippedChunk: false, batch: updated, rowErrors, warnings };
}

/**
 * Writes the plan in chunks. Resumes from batch.committedThroughRow. Rows before the resume point that
 * failed during planning are re-sent as rowError events with replayed:true (they were already counted),
 * so a full errors.csv can still be built after an interrupted run.
 */
export async function commitPlan(p: CommitParams): Promise<CommitOutcome> {
  const groups = groupRows(p.rows);
  const warnedGroups = new Set<string>();
  const warnings: Record<string, number> = {};
  const total = p.rows.length;
  let batch = p.batch;

  // Replay planning-stage errors that lie before the resume point.
  for (const r of p.rows) {
    if (r.row > batch.committedThroughRow) break;
    if (r.status === 'ERROR' && r.error) await p.emit(rowErrorEvent(r, r.error, p.headers, true));
  }

  const remaining = p.rows.filter((r) => r.row > batch.committedThroughRow);
  let processed = total - remaining.length;
  for (let start = 0; start < remaining.length; start += CHUNK_SIZE) {
    const chunk = remaining.slice(start, start + CHUNK_SIZE);
    let result: ChunkResult;
    try {
      result = await p.db.$transaction((tx) => commitChunk(tx, p, chunk, groups, warnedGroups), {
        timeout: CHUNK_TX_TIMEOUT_MS,
        maxWait: 5000,
      });
    } catch (err) {
      await markBatch(p.db, batch.id, 'FAILED').catch(() => undefined);
      throw err;
    }
    batch = result.batch;
    for (const [k, v] of Object.entries(result.warnings)) bump(warnings, k, v);
    for (const e of result.rowErrors) await p.emit(e);
    processed = total - remaining.length + start + chunk.length;
    await p.emit({
      type: 'progress',
      phase: 'writing',
      processed: Math.min(processed, total),
      total,
      created: batch.createdCount,
      merged: batch.mergedCount,
      skipped: batch.skippedCount,
      errors: batch.errorCount,
    });
    if (start + CHUNK_SIZE < remaining.length && p.shouldCancel()) {
      batch = await markBatch(p.db, batch.id, 'CANCELLED');
      return { status: 'CANCELLED', batch, warnings };
    }
  }

  batch = await markBatch(p.db, batch.id, 'COMPLETED');
  return { status: 'COMPLETED', batch, warnings };
}
