/**
 * CardIntakeBatch ledger (ADR-134 section 4.6). One row per (organizerId, saleId, fileSha256, mode).
 * The cursor committedThroughRow is advanced inside the same transaction as each chunk's writes (see
 * commit.ts), so a resend resumes exactly where the last committed chunk ended and cannot duplicate an Item.
 *
 * The database client is injected (LedgerDb); this module imports no Prisma code.
 */
import { ERROR_SAMPLE_CAP } from './config';
import type { IntakeMode } from './types';

export type BatchStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface BatchRow {
  id: string;
  organizerId: string;
  saleId: string;
  fileSha256: string;
  fileName: string | null;
  mode: string;
  status: string;
  rowsTotal: number;
  committedThroughRow: number;
  createdCount: number;
  mergedCount: number;
  skippedCount: number;
  errorCount: number;
  errorSample: unknown;
}

export interface BatchKey {
  organizerId: string;
  saleId: string;
  fileSha256: string;
  mode: IntakeMode;
}

export interface LedgerDb {
  cardIntakeBatch: {
    findUnique(args: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface ErrorSampleEntry {
  row: number;
  code: string;
  message: string;
}

function uniqueWhere(key: BatchKey) {
  return { organizerId_saleId_fileSha256_mode: { organizerId: key.organizerId, saleId: key.saleId, fileSha256: key.fileSha256, mode: key.mode } };
}

export function findBatch(db: LedgerDb, key: BatchKey): Promise<BatchRow | null> {
  return db.cardIntakeBatch.findUnique({ where: uniqueWhere(key) });
}

/** The error sample as a bounded array (the column is Json and only ever read whole). */
export function readErrorSample(value: unknown): ErrorSampleEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e === 'object' && typeof (e as any).row === 'number')
    .slice(0, ERROR_SAMPLE_CAP)
    .map((e: any) => ({ row: e.row, code: String(e.code ?? ''), message: String(e.message ?? '').slice(0, 300) }));
}

export function mergeErrorSample(existing: unknown, added: ErrorSampleEntry[]): ErrorSampleEntry[] {
  return [...readErrorSample(existing), ...added].slice(0, ERROR_SAMPLE_CAP);
}

export type StartOutcome =
  | { kind: 'ALREADY_APPLIED'; batch: BatchRow }
  | { kind: 'STARTED'; batch: BatchRow; resumed: boolean };

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

/**
 * Finds or creates the batch for this file and mode.
 *  - No batch: create it RUNNING at row 0.
 *  - COMPLETED and not forced: ALREADY_APPLIED (an accidental double click cannot double an ADD).
 *  - forced: the same ledger row is reset to RUNNING at row 0 with zeroed counters (the unique key allows
 *    one row per file and mode, so "a new batch" is the same row started over).
 *  - RUNNING, CANCELLED or FAILED and not forced: resumed from committedThroughRow.
 */
export async function startOrResumeBatch(
  db: LedgerDb,
  key: BatchKey,
  info: { rowsTotal: number; fileName: string | null; force: boolean }
): Promise<StartOutcome> {
  const existing = await findBatch(db, key);
  if (!existing) {
    try {
      const created: BatchRow = await db.cardIntakeBatch.create({
        data: { ...key, fileName: info.fileName, status: 'RUNNING', rowsTotal: info.rowsTotal },
      });
      return { kind: 'STARTED', batch: created, resumed: false };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await findBatch(db, key);
      if (!raced) throw err;
      return resumeExisting(db, raced, info);
    }
  }
  return resumeExisting(db, existing, info);
}

async function resumeExisting(
  db: LedgerDb,
  existing: BatchRow,
  info: { rowsTotal: number; fileName: string | null; force: boolean }
): Promise<StartOutcome> {
  if (info.force) {
    const reset: BatchRow = await db.cardIntakeBatch.update({
      where: { id: existing.id },
      data: {
        status: 'RUNNING',
        rowsTotal: info.rowsTotal,
        fileName: info.fileName,
        committedThroughRow: 0,
        createdCount: 0,
        mergedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errorSample: null,
      },
    });
    return { kind: 'STARTED', batch: reset, resumed: false };
  }
  if (existing.status === 'COMPLETED') return { kind: 'ALREADY_APPLIED', batch: existing };
  const resumed: BatchRow = await db.cardIntakeBatch.update({
    where: { id: existing.id },
    data: { status: 'RUNNING', rowsTotal: info.rowsTotal },
  });
  return { kind: 'STARTED', batch: resumed, resumed: existing.committedThroughRow > 0 };
}

export function markBatch(db: LedgerDb, id: string, status: BatchStatus): Promise<BatchRow> {
  return db.cardIntakeBatch.update({ where: { id }, data: { status } });
}

export interface BatchSummaryDto {
  batchId: string;
  mode: string;
  status: string;
  rowsTotal: number;
  committedThroughRow: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
}

export function toBatchSummary(batch: BatchRow): BatchSummaryDto {
  return {
    batchId: batch.id,
    mode: batch.mode,
    status: batch.status,
    rowsTotal: batch.rowsTotal,
    committedThroughRow: batch.committedThroughRow,
    created: batch.createdCount,
    merged: batch.mergedCount,
    skipped: batch.skippedCount,
    errors: batch.errorCount,
  };
}
