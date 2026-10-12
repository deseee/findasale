/**
 * Commit bridge for the card scan (ADR-138 section 2.2, batch B3): turns the organizer's READY entries into stock
 * through the SAME pipeline as the spreadsheet intake (planRecords in strict mode, startOrResumeBatch, commitPlan).
 * Nothing here writes an Item or a card column on its own.
 *
 * Three steps:
 *  1. Freeze. The session is claimed as COMMITTING and the selected entries are marked COMMITTING, then the selection
 *     is read again. If a decision slipped in between, the manifest is rebuilt, so the manifest hash always describes
 *     exactly the frozen entries. Edits to a COMMITTING entry are refused by the guard in sessionService.
 *  2. Plan and write. Entries become records (row number = the entry's seq), the planner validates them with the
 *     one card writer, the ledger batch is opened or resumed under (organizerId, saleId, manifest hash, mode), and
 *     commitPlan writes in chunks. The ledger key makes a retry resume instead of writing twice.
 *  3. Mark. Entries become COMMITTED (with the batch id) or ERROR (the planner or the commit rejected the row). The
 *     session closes when every entry is committed, otherwise it goes back to OPEN.
 *
 * An interrupted commit is resumed by calling commit again: COMMITTING entries stay eligible and the same manifest
 * reopens the same ledger batch. No recognizer, HTTP client or paid service is imported here.
 */
import { getDbSoftLimitMb } from '../cardCatalog/catalogConfig';
import type { CatalogState } from '../cardCatalog/cardCatalogLookup';
import type { CatalogGame } from '../cardCatalog/types';
import { readErrorSample, startOrResumeBatch, toBatchSummary } from '../cardIntake/batchLedger';
import type { BatchRow } from '../cardIntake/batchLedger';
import { commitPlan } from '../cardIntake/commit';
import type { CommitEvent } from '../cardIntake/commit';
import { ITEM_BYTES_PER_ROW } from '../cardIntake/config';
import { genericImporter } from '../cardIntake/importers/generic';
import { groupRows } from '../cardIntake/mergeEngine';
import { planRecords } from '../cardIntake/planner';
import type { PlanOptions } from '../cardIntake/planner';
import { INTAKE_MODES } from '../cardIntake/types';
import type { IntakeMode, PlannedRow } from '../cardIntake/types';
import {
  SCAN_COLUMN_MAPPING,
  SCAN_HEADERS,
  buildPrintingResolver,
  buildStreamedRecords,
  computeManifestHash,
  iterateRecords,
  selectReadyEntries,
} from './entryRecords';
import type { CommitEntry, CommitSelection } from './entryRecords';
import { apiFail, loadPrintingMap, loadSession, nowOf, sessionDefaults, toEntryRow } from './sessionService';
import type { ScanDeps, ScanResult, ScanSessionRow } from './sessionService';
import type { ScanEntryRow, ScanNotCommitted } from './types';

export interface CommitInput {
  organizerId: string;
  sessionId: string;
  /** ADD or REPLACE. There is no default: the organizer chooses. */
  mode: string | null | undefined;
  /**
   * Accepted for the contract of the spreadsheet intake and IGNORED: forcing would reset the ledger and write the same
   * cards a second time. A finished commit is never repeated.
   */
  force?: boolean;
  /** True when the caller went away; checked between chunks (the commit then stops and can be resumed). */
  shouldCancel?: () => boolean;
  /** Progress and row error events of the shared commit. */
  emit?: (event: CommitEvent) => void | Promise<void>;
}

export interface CommitSummaryDto {
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  needsPrice: number;
}

export interface CommitFailedEntry {
  entryId: string;
  code: string;
  message: string;
}

export interface CommitData {
  batchId: string;
  /** CANCELLED: the caller went away part way; call commit again to finish. */
  status: 'COMPLETED' | 'CANCELLED';
  resumed: boolean;
  summary: CommitSummaryDto;
  notCommitted: ScanNotCommitted[];
  failed: CommitFailedEntry[];
}

const ID_CHUNK = 500;
const PARALLEL_WRITES = 25;
const MAX_FREEZE_PASSES = 3;
const ERROR_CODE_MAX_CHARS = 40;

function chunksOf<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < list.length; start += size) out.push(list.slice(start, start + size));
  return out;
}

function parseMode(raw: string | null | undefined): IntakeMode | null {
  const text = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return (INTAKE_MODES as readonly string[]).includes(text) ? (text as IntakeMode) : null;
}

interface Snapshot {
  entries: ScanEntryRow[];
  selection: CommitSelection;
}

/** Reads every entry of the session and picks the committable ones (readiness is recomputed, stored status ignored). */
async function snapshot(deps: ScanDeps, session: ScanSessionRow): Promise<Snapshot> {
  const raws = await deps.db.cardScanEntry.findMany({
    where: { sessionId: session.id, organizerId: session.organizerId },
    orderBy: { seq: 'asc' },
  });
  const entries = raws.map(toEntryRow);
  const printings = await loadPrintingMap(deps, entries.map((e) => e.printingId));
  return { entries, selection: selectReadyEntries(entries, sessionDefaults(session), printings) };
}

async function markCommitting(deps: ScanDeps, session: ScanSessionRow, ids: readonly string[]): Promise<void> {
  for (const part of chunksOf(ids, ID_CHUNK)) {
    await deps.db.cardScanEntry.updateMany({
      where: {
        id: { in: part },
        sessionId: session.id,
        organizerId: session.organizerId,
        status: { in: ['NEEDS_REVIEW', 'READY', 'ERROR', 'COMMITTING'] },
      },
      data: { status: 'COMMITTING', errorCode: null },
    });
  }
}

/** Puts entries that dropped out of a re-read selection back into review. */
async function unfreeze(deps: ScanDeps, session: ScanSessionRow, ids: readonly string[]): Promise<void> {
  for (const part of chunksOf(ids, ID_CHUNK)) {
    await deps.db.cardScanEntry.updateMany({
      where: { id: { in: part }, sessionId: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
      data: { status: 'NEEDS_REVIEW' },
    });
  }
}

/** Hands the session back to the organizer when a commit stopped before writing anything. */
async function releaseSession(deps: ScanDeps, session: ScanSessionRow): Promise<void> {
  try {
    const stillFrozen = await deps.db.cardScanEntry.count({
      where: { sessionId: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
    });
    if (stillFrozen > 0) return;
    await deps.db.cardScanSession.updateMany({
      where: { id: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
      data: { status: 'OPEN', commitMode: null, commitManifestSha256: null, lastActivityAt: nowOf(deps) },
    });
  } catch {
    // The session stays COMMITTING; calling commit again resumes or releases it.
  }
}

/** The catalog state handed to the planner: exactly the games whose chosen printings the resolver can answer. */
function plannerCatalog(items: readonly CommitEntry[]): CatalogState {
  const games = Array.from(new Set(items.filter((i) => i.printing).map((i) => (i.printing as { game: string }).game)));
  return {
    enabled: true,
    catalogReady: true,
    readyGames: games as CatalogGame[],
    dataAsOf: { SCRYFALL: null, TCGCSV: null },
    sources: [],
  };
}

function planOptions(organizerId: string, items: readonly CommitEntry[]): PlanOptions {
  return {
    importer: genericImporter,
    mapping: SCAN_COLUMN_MAPPING,
    defaultGame: 'MTG',
    priceSource: 'FILE',
    defaultCondition: null,
    conditionChoices: new Map(),
    strict: true,
    decisions: new Map(),
    organizerId,
    catalog: plannerCatalog(items),
    maxRows: Math.max(items.length, 1),
  };
}

function needsPriceCount(rows: readonly PlannedRow[]): number {
  let count = 0;
  for (const group of groupRows(rows).values()) if (group.price === null) count += 1;
  return count;
}

async function summaryOfBatch(deps: ScanDeps, organizerId: string, batchId: string | null): Promise<Record<string, unknown> | undefined> {
  if (!batchId) return undefined;
  try {
    const row = (await deps.db.cardIntakeBatch.findUnique({ where: { id: batchId } })) as BatchRow | null;
    if (!row || row.organizerId !== organizerId) return undefined;
    return { summary: toBatchSummary(row) };
  } catch {
    return undefined;
  }
}

interface RowFailure {
  code: string;
  message: string;
}

/** Step 3: entries become COMMITTED or ERROR, then the session closes (all committed) or returns to OPEN. */
async function finalizeEntries(
  deps: ScanDeps,
  session: ScanSessionRow,
  items: readonly CommitEntry[],
  batchId: string,
  failures: ReadonlyMap<number, RowFailure>
): Promise<CommitFailedEntry[]> {
  const failed: CommitFailedEntry[] = [];
  const okIds: string[] = [];
  const failedWrites: Array<{ id: string; code: string }> = [];
  for (const item of items) {
    const failure = failures.get(item.entry.seq);
    if (failure) {
      failed.push({ entryId: item.entry.id, code: failure.code, message: failure.message });
      failedWrites.push({ id: item.entry.id, code: failure.code.slice(0, ERROR_CODE_MAX_CHARS) });
    } else {
      okIds.push(item.entry.id);
    }
  }
  for (const part of chunksOf(okIds, ID_CHUNK)) {
    await deps.db.cardScanEntry.updateMany({
      where: { id: { in: part }, sessionId: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
      data: { status: 'COMMITTED', committedBatchId: batchId, errorCode: null },
    });
  }
  for (const part of chunksOf(failedWrites, PARALLEL_WRITES)) {
    await Promise.all(
      part.map((f) =>
        deps.db.cardScanEntry.updateMany({
          where: { id: f.id, sessionId: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
          data: { status: 'ERROR', errorCode: f.code },
        })
      )
    );
  }
  const open = await deps.db.cardScanEntry.count({
    where: { sessionId: session.id, organizerId: session.organizerId, status: { not: 'COMMITTED' } },
  });
  await deps.db.cardScanSession.updateMany({
    where: { id: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
    data: { status: open === 0 ? 'CLOSED' : 'OPEN', commitMode: null, commitManifestSha256: null, lastActivityAt: nowOf(deps) },
  });
  return failed;
}

/**
 * Adds the session's READY entries to the sale's stock. See the file comment for the three steps. Failures:
 * 400 MODE_REQUIRED, 404 SESSION_NOT_FOUND, 409 MODE_MISMATCH, 409 SESSION_NOT_OPEN, 409 ALREADY_APPLIED (with the
 * summary), 409 NOTHING_READY, 409 DB_SPACE_LOW, 409 ENTRY_CHANGED (the queue kept changing while it was frozen),
 * 500 SERVER_ERROR (the cards stay saved; calling commit again resumes).
 */
export async function commitSession(deps: ScanDeps, input: CommitInput): Promise<ScanResult<CommitData>> {
  const mode = parseMode(input.mode);
  if (!mode) return apiFail(400, 'MODE_REQUIRED');
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  if (session.status === 'DISCARDED') return apiFail(409, 'SESSION_NOT_OPEN');
  if (session.status === 'COMMITTING' && session.commitMode && session.commitMode !== mode) return apiFail(409, 'MODE_MISMATCH');

  // The sale must still be the caller's (the session row alone is not trusted to say so).
  const sale = await deps.db.sale.findUnique({ where: { id: session.saleId }, select: { id: true, organizerId: true } });
  if (!sale || sale.organizerId !== session.organizerId) return apiFail(404, 'SALE_NOT_FOUND');

  let current = await snapshot(deps, session);
  if (current.selection.ready.length === 0) {
    const committed = current.entries.find((e) => e.status === 'COMMITTED' && e.committedBatchId);
    if (current.selection.notCommitted.length === 0 && committed) {
      return apiFail(409, 'ALREADY_APPLIED', await summaryOfBatch(deps, session.organizerId, committed.committedBatchId));
    }
    return apiFail(409, 'NOTHING_READY', { notCommitted: current.selection.notCommitted });
  }

  // Database space guard, the same arithmetic as the spreadsheet confirm.
  const sizeBytes = await deps.getDbSizeBytes();
  if (sizeBytes !== null) {
    const projectedMb = (sizeBytes + current.selection.ready.length * ITEM_BYTES_PER_ROW) / (1024 * 1024);
    if (projectedMb > getDbSoftLimitMb(deps.env)) return apiFail(409, 'DB_SPACE_LOW');
  }

  try {
    // Step 1: claim the session, then freeze the selected entries until the manifest matches what is frozen.
    const claimed = await deps.db.cardScanSession.updateMany({
      where: { id: session.id, organizerId: session.organizerId, status: { in: ['OPEN', 'COMMITTING'] } },
      data: { status: 'COMMITTING', commitMode: mode, lastActivityAt: nowOf(deps) },
    });
    if (claimed.count === 0) return apiFail(409, 'SESSION_NOT_OPEN');

    let hash = computeManifestHash(session.id, mode, current.selection.ready);
    let frozen = false;
    for (let pass = 0; pass < MAX_FREEZE_PASSES && !frozen; pass += 1) {
      const ids = current.selection.ready.map((i) => i.entry.id);
      await markCommitting(deps, session, ids);
      const again = await snapshot(deps, session);
      const againHash = computeManifestHash(session.id, mode, again.selection.ready);
      if (againHash === hash) {
        current = again;
        frozen = true;
        break;
      }
      const keep = new Set(again.selection.ready.map((i) => i.entry.id));
      await unfreeze(deps, session, ids.filter((id) => !keep.has(id)));
      current = again;
      hash = againHash;
      if (current.selection.ready.length === 0) {
        await releaseSession(deps, session);
        return apiFail(409, 'NOTHING_READY', { notCommitted: current.selection.notCommitted });
      }
    }
    if (!frozen) {
      await unfreeze(deps, session, current.selection.ready.map((i) => i.entry.id));
      await releaseSession(deps, session);
      return apiFail(409, 'ENTRY_CHANGED');
    }
    await deps.db.cardScanSession.updateMany({
      where: { id: session.id, organizerId: session.organizerId, status: 'COMMITTING' },
      data: { commitManifestSha256: hash },
    });

    // Step 2: plan with the shared planner, open or resume the ledger batch, write in chunks.
    const items = current.selection.ready;
    const rows: PlannedRow[] = [];
    await planRecords(
      iterateRecords(buildStreamedRecords(items)),
      planOptions(session.organizerId, items),
      { resolve: buildPrintingResolver(items) },
      (row) => {
        rows.push(row);
      }
    );
    const started = await startOrResumeBatch(
      deps.db,
      { organizerId: session.organizerId, saleId: session.saleId, fileSha256: hash, mode },
      { rowsTotal: rows.length, fileName: `Scan: ${session.label ?? 'cards'}`, force: false }
    );

    const failures = new Map<number, RowFailure>();
    for (const row of rows) {
      if (row.status === 'ERROR' && row.error) failures.set(row.row, { code: row.error.code, message: row.error.message });
    }
    let batch: BatchRow = started.batch;
    let status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED';
    let resumed = false;
    if (started.kind === 'STARTED') {
      resumed = started.resumed;
      const outcome = await commitPlan({
        db: deps.db,
        batch: started.batch,
        saleId: session.saleId,
        organizerId: session.organizerId,
        mode,
        rows,
        headers: Object.values(SCAN_HEADERS),
        shouldCancel: input.shouldCancel ?? (() => false),
        emit: async (event: CommitEvent) => {
          if (event.type === 'rowError') failures.set(event.row, { code: event.code, message: event.message });
          if (input.emit) await input.emit(event);
        },
      });
      batch = outcome.batch;
      status = outcome.status;
    }
    // A ledger batch that was already COMPLETED while its entries still read COMMITTING (the previous run stopped
    // before step 3) is finished here without writing anything.
    for (const sample of readErrorSample(batch.errorSample)) {
      if (!failures.has(sample.row)) failures.set(sample.row, { code: sample.code, message: sample.message });
    }

    const summary: CommitSummaryDto = {
      created: batch.createdCount,
      merged: batch.mergedCount,
      skipped: batch.skippedCount,
      errors: batch.errorCount,
      needsPrice: needsPriceCount(rows),
    };
    if (status === 'CANCELLED') {
      return { ok: true, data: { batchId: batch.id, status, resumed, summary, notCommitted: current.selection.notCommitted, failed: [] } };
    }

    // Step 3: mark the entries.
    const failed = await finalizeEntries(deps, session, items, batch.id, failures);
    return { ok: true, data: { batchId: batch.id, status, resumed, summary, notCommitted: current.selection.notCommitted, failed } };
  } catch (err) {
    // The entries stay COMMITTING and the ledger batch keeps its cursor, so calling commit again resumes.
    console.error('[cardScan] commit stopped:', err instanceof Error ? err.message : 'unknown error');
    return apiFail(500, 'SERVER_ERROR');
  }
}
