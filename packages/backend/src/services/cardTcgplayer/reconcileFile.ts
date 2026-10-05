/**
 * Reads a TCGplayer seller inventory export for the reconcile (ADR-137 section 5.2). The file is streamed with the
 * card intake's reader (disk spooled by the upload middleware, never held in memory as text) and each row becomes a
 * FileRow or a problem. Column names come from the intake's TCGplayer importer, the only place they are proven.
 *
 * Unlike the intake, a Total Quantity of 0 is valid here: it is how TCGplayer says "sold out".
 */
import { tcgplayerSellerImporter } from '../cardIntake/importers/tcgplayerSeller';
import { normHeader, readRow } from '../cardIntake/importers/shared';
import { proposeCondition } from '../cardIntake/conditionMap';
import { splitFoilFromCondition } from '../cardIntake/normalizeCells';
import { streamRecords } from '../cardIntake/parseSpreadsheet';
import type { ColumnMapping } from '../cardIntake/types';
import { MAX_FILE_QUANTITY, PROBLEM_SAMPLE_CAP } from './config';
import { FILE_PROBLEM_MESSAGES } from './messages';
import { FileRow } from './reconcileEngine';
import { groupKey } from './groups';

export type FileProblemCode = keyof typeof FILE_PROBLEM_MESSAGES;

export interface FileProblem {
  row: number;
  code: FileProblemCode;
  message: string;
}

export class SyncFileError extends Error {
  constructor(readonly code: 'NOT_A_TCGPLAYER_FILE') {
    super(code);
    this.name = 'SyncFileError';
    Object.setPrototypeOf(this, SyncFileError.prototype);
  }
}

export function isSyncFileError(err: unknown): err is SyncFileError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'SyncFileError';
}

export interface ParsedTcgplayerFile {
  rows: FileRow[];
  /** Capped sample. problemCount is complete. */
  problems: FileProblem[];
  problemCount: number;
  rowsTotal: number;
}

const ID_RE = /^\d{1,10}$/;
const QTY_RE = /^\d+(\.0+)?$/;
const MAX_INT32 = 2147483647;

function problem(row: number, code: FileProblemCode): FileProblem {
  return { row, code, message: FILE_PROBLEM_MESSAGES[code] };
}

/** True when the headers are those of a TCGplayer seller export we can reconcile. */
export function hasReconcileColumns(headers: readonly string[]): boolean {
  const lower = new Set(headers.map(normHeader));
  return lower.has('tcgplayer id') && lower.has('total quantity') && lower.has('condition');
}

export function parseRow(
  rowNumber: number,
  src: { tcgplayerProductId?: string; quantity?: string; condition?: string }
): { ok: true; value: FileRow } | { ok: false; problem: FileProblem } {
  const idText = (src.tcgplayerProductId ?? '').trim();
  if (!ID_RE.test(idText)) return { ok: false, problem: problem(rowNumber, 'BAD_TCGPLAYER_ID') };
  const productId = parseInt(idText, 10);
  if (!Number.isInteger(productId) || productId < 1 || productId > MAX_INT32) return { ok: false, problem: problem(rowNumber, 'BAD_TCGPLAYER_ID') };

  const qtyText = (src.quantity ?? '').trim();
  if (!QTY_RE.test(qtyText)) return { ok: false, problem: problem(rowNumber, 'BAD_QUANTITY') };
  const total = parseInt(qtyText, 10);
  if (!Number.isInteger(total) || total < 0 || total > MAX_FILE_QUANTITY) return { ok: false, problem: problem(rowNumber, 'BAD_QUANTITY') };

  const rawCondition = (src.condition ?? '').trim();
  let conditionCode: string | null = null;
  let foil = false;
  if (rawCondition !== '') {
    const split = splitFoilFromCondition(rawCondition);
    foil = split.foil;
    if (split.condition !== '') {
      const proposal = proposeCondition('tcgplayer', split.condition);
      if (!proposal.proposed || proposal.confidence !== 'EXACT') return { ok: false, problem: problem(rowNumber, 'BAD_CONDITION') };
      conditionCode = proposal.proposed;
    }
  }
  return { ok: true, value: { row: rowNumber, productId, conditionCode, foil, total, key: groupKey(productId, conditionCode, foil) } };
}

export async function parseTcgplayerFile(filePath: string, maxRows: number): Promise<ParsedTcgplayerFile> {
  const rows: FileRow[] = [];
  const problems: FileProblem[] = [];
  let problemCount = 0;
  let rowsTotal = 0;
  // State lives in an object because the header callback assigns it (a plain let would be narrowed to its first value).
  const state: { headersOk: boolean; mapping: ColumnMapping } = { headersOk: false, mapping: {} };

  const stream = streamRecords(filePath, {
    maxRows,
    onHeader: (headers) => {
      state.mapping = tcgplayerSellerImporter.mapColumns(headers);
      // A header row that is not a TCGplayer export stops here, before any row is read.
      state.headersOk = hasReconcileColumns(headers) && !!state.mapping.tcgplayerProductId && !!state.mapping.quantity && !!state.mapping.condition;
    },
  });

  for await (const item of stream) {
    if (!state.headersOk) throw new SyncFileError('NOT_A_TCGPLAYER_FILE');
    rowsTotal += 1;
    if (item.tooLong) {
      problemCount += 1;
      if (problems.length < PROBLEM_SAMPLE_CAP) problems.push(problem(item.row, 'ROW_TOO_LONG'));
      continue;
    }
    const src = readRow(item.record, state.mapping);
    const parsed = parseRow(item.row, src);
    if (parsed.ok) rows.push(parsed.value);
    else {
      problemCount += 1;
      if (problems.length < PROBLEM_SAMPLE_CAP) problems.push(parsed.problem);
    }
  }
  if (!state.headersOk) throw new SyncFileError('NOT_A_TCGPLAYER_FILE');
  return { rows, problems, problemCount, rowsTotal };
}
