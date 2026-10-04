/**
 * Preview and confirm orchestration for the card intake (ADR-134 section 4.5, batch B4).
 *
 * Stateless two-phase pipeline: preview (nothing is written) then confirm (the same file is sent again).
 * The controller owns HTTP and temp files; this module owns the decisions. Every dependency (database,
 * catalog resolve, catalog state, database size, environment) is injected, so a unit test can pass fakes
 * and importing this module touches no environment, network or database.
 *
 * Intake never calls a Vision or Haiku service, never fetches a URL and never meters any Vision or Haiku usage.
 */
import { CARD_CONDITION_CODES, CARD_GAMES, canonicalizeVocabValue } from '../../constants/cardVocabulary';
import type { CardConditionCode } from '../../constants/cardVocabulary';
import type { CatalogState, ResolveRef, ResolveResult } from '../cardCatalog/cardCatalogLookup';
import { DISABLED_STATE } from '../cardCatalog/cardCatalogLookup';
import { BatchRow, findBatch, startOrResumeBatch, toBatchSummary, BatchSummaryDto } from './batchLedger';
import { CommitDb, CommitEvent, commitPlan } from './commit';
import {
  EnvLike,
  IntakeConfig,
  ITEM_BYTES_PER_ROW,
  NO_CATALOG_SAMPLE_CAP,
  PREVIEW_ERROR_SAMPLE_CAP,
  REVIEW_ROWS_CAP,
  getIntakeConfig,
} from './config';
import { ConditionChoices, parseConditionChoices } from './conditionMap';
import { errorsCsvHeader } from './errorsCsv';
import { applyColumnOverride, detectImporter, getImporter, Importer } from './importers';
import { groupRows, nextStockTotal } from './mergeEngine';
import { API_MESSAGES, REVIEW_MESSAGES } from './messages';
import { inspectFile, IntakeFileError, sha256OfFile } from './parseSpreadsheet';
import { planFile, PlanOptions } from './planner';
import {
  ColumnMapping,
  IMPORTER_IDS,
  ImporterId,
  INTAKE_MODES,
  IntakeMode,
  IntakeSummary,
  PRICE_SOURCES,
  PlannedRow,
  PriceSource,
  ReviewReason,
  RowDecision,
} from './types';

export interface IntakeDb extends CommitDb {
  item: { findMany(args: any): Promise<any[]> };
}

export interface IntakeDeps {
  db: IntakeDb;
  resolve(refs: ResolveRef[]): Promise<ResolveResult[]>;
  getCatalogState(): Promise<CatalogState>;
  /** Database size in bytes, or null when it cannot be measured (the space guard is then skipped). */
  getDbSizeBytes(): Promise<number | null>;
  env: EnvLike;
}

// ---------------------------------------------------------------------------
// Request parameters
// ---------------------------------------------------------------------------

export interface IntakeParams {
  mode: IntakeMode | null;
  priceSource: PriceSource;
  format: ImporterId | 'auto';
  game: string | null;
  defaultCondition: CardConditionCode | null;
  columnMapping: unknown;
  conditionChoices: ConditionChoices;
  decisions: Map<number, RowDecision>;
  fileSha256: string | null;
  force: boolean;
}

export interface ApiFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

function failure(status: number, code: keyof typeof API_MESSAGES, extra?: Record<string, unknown>): ApiFailure {
  return { ok: false, status, code, message: API_MESSAGES[code], extra };
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseJsonField(raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: undefined };
  if (typeof raw === 'object') return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function parseDecisions(raw: unknown, maxRows: number): Map<number, RowDecision> | null {
  const out = new Map<number, RowDecision>();
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > maxRows + 1) return null;
  for (const [key, value] of entries) {
    if (!/^\d{1,9}$/.test(key)) return null;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    const decision: RowDecision = {};
    for (const field of Object.keys(v)) {
      if (field === 'printingId') {
        if (typeof v.printingId !== 'string' || v.printingId.length === 0 || v.printingId.length > 100) return null;
        decision.printingId = v.printingId;
      } else if (field === 'finish') {
        if (typeof v.finish !== 'string' || v.finish.length > 20) return null;
        decision.finish = v.finish;
      } else if (field === 'skip') {
        if (typeof v.skip !== 'boolean') return null;
        decision.skip = v.skip;
      } else {
        return null;
      }
    }
    out.set(parseInt(key, 10), decision);
  }
  return out;
}

/**
 * Validates the multipart text fields. Confirm requires a mode (there is NO default: 400 MODE_REQUIRED) and
 * the file hash; preview accepts both but does not need them.
 */
export function parseIntakeParams(body: Record<string, unknown>, kind: 'preview' | 'confirm', cfg: IntakeConfig): IntakeParams | ApiFailure {
  const b = body ?? {};
  const modeText = asText(b.mode).toUpperCase();
  let mode: IntakeMode | null = null;
  if (modeText === '') {
    if (kind === 'confirm') return failure(400, 'MODE_REQUIRED');
  } else if ((INTAKE_MODES as readonly string[]).includes(modeText)) {
    mode = modeText as IntakeMode;
  } else {
    return failure(400, 'BAD_MODE');
  }

  const priceText = asText(b.priceSource).toUpperCase();
  let priceSource: PriceSource = 'NONE';
  if (priceText !== '') {
    if (!(PRICE_SOURCES as readonly string[]).includes(priceText)) return failure(400, 'BAD_PRICE_SOURCE');
    priceSource = priceText as PriceSource;
  }

  const formatText = asText(b.format).toLowerCase();
  let format: ImporterId | 'auto' = 'auto';
  if (formatText !== '' && formatText !== 'auto') {
    if (!(IMPORTER_IDS as readonly string[]).includes(formatText)) return failure(400, 'BAD_FORMAT');
    format = formatText as ImporterId;
  }

  let game: string | null = null;
  const gameText = asText(b.game);
  if (gameText !== '') {
    const g = canonicalizeVocabValue(CARD_GAMES, gameText);
    if (!g) return failure(400, 'BAD_GAME');
    game = g;
  }

  let defaultCondition: CardConditionCode | null = null;
  const condText = asText(b.defaultCondition);
  if (condText !== '') {
    const c = canonicalizeVocabValue(CARD_CONDITION_CODES, condText);
    if (!c) return failure(400, 'BAD_DEFAULT_CONDITION');
    defaultCondition = c;
  }

  const mappingJson = parseJsonField(b.columnMapping);
  if (!mappingJson.ok) return failure(400, 'BAD_JSON');
  const conditionJson = parseJsonField(b.conditionMapping);
  if (!conditionJson.ok) return failure(400, 'BAD_JSON');
  const decisionsJson = parseJsonField(b.decisions);
  if (!decisionsJson.ok) return failure(400, 'BAD_JSON');

  const conditionChoices = parseConditionChoices(conditionJson.value);
  if (!conditionChoices) return failure(400, 'BAD_CONDITION_MAPPING');
  const decisions = parseDecisions(decisionsJson.value, cfg.maxRows);
  if (!decisions) return failure(400, 'BAD_DECISIONS');

  const hash = asText(b.fileSha256).toLowerCase();
  if (kind === 'confirm' && !/^[0-9a-f]{64}$/.test(hash)) return failure(400, 'FILE_HASH_REQUIRED');

  const forceText = asText(b.force).toLowerCase();
  return {
    mode,
    priceSource,
    format,
    game,
    defaultCondition,
    columnMapping: mappingJson.value,
    conditionChoices,
    decisions,
    fileSha256: hash || null,
    force: forceText === 'true' || forceText === '1',
  };
}

export function isApiFailure(v: unknown): v is ApiFailure {
  return !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false && typeof (v as { code?: unknown }).code === 'string';
}

/** Maps a reader error to an HTTP failure. */
export function fileErrorToFailure(err: IntakeFileError): ApiFailure {
  if (err.code === 'TOO_MANY_ROWS') return failure(413, 'TOO_MANY_ROWS', { limit: err.detail.limit });
  if (err.code === 'EMPTY_FILE') return failure(400, 'EMPTY_FILE');
  if (err.code === 'NOT_A_CSV_FILE') return failure(400, 'NOT_A_CSV_FILE');
  return failure(400, 'PARSE_ERROR', err.detail.line ? { line: err.detail.line } : undefined);
}

// ---------------------------------------------------------------------------
// Shared file setup
// ---------------------------------------------------------------------------

interface FileSetup {
  importer: Importer;
  mapping: ColumnMapping;
  headers: string[];
  delimiter: string;
  rowCount: number;
  game: { value: string; source: 'FILE' | 'IMPORTER' | 'REQUEST' | 'DEFAULT' };
}

async function setupFile(filePath: string, params: IntakeParams, cfg: IntakeConfig): Promise<FileSetup | ApiFailure> {
  let shape;
  try {
    shape = await inspectFile(filePath, cfg.maxRows);
  } catch (err) {
    if (err instanceof IntakeFileError || (err as { name?: string })?.name === 'IntakeFileError') {
      return fileErrorToFailure(err as IntakeFileError);
    }
    throw err;
  }
  const importer = params.format === 'auto' ? detectImporter(shape.headers) : getImporter(params.format);
  const checked = applyColumnOverride(importer.mapColumns(shape.headers), params.columnMapping, shape.headers);
  if (!checked.ok) return failure(400, 'BAD_COLUMN_MAPPING');
  if (!checked.mapping.name) return failure(400, 'NO_NAME_COLUMN');
  const game = checked.mapping.game
    ? { value: params.game ?? 'MTG', source: 'FILE' as const }
    : importer.defaultGame
      ? { value: importer.defaultGame, source: 'IMPORTER' as const }
      : params.game
        ? { value: params.game, source: 'REQUEST' as const }
        : { value: 'MTG', source: 'DEFAULT' as const };
  return { importer, mapping: checked.mapping, headers: shape.headers, delimiter: shape.delimiter, rowCount: shape.rowCount, game };
}

async function safeCatalogState(deps: IntakeDeps): Promise<CatalogState> {
  try {
    return await deps.getCatalogState();
  } catch {
    // The catalog is optional: if its tables are missing or unreadable, intake still works with manual details.
    return DISABLED_STATE;
  }
}

function planOptions(setup: FileSetup, params: IntakeParams, cfg: IntakeConfig, catalog: CatalogState, organizerId: string, strict: boolean): PlanOptions {
  return {
    importer: setup.importer,
    mapping: setup.mapping,
    defaultGame: setup.game.value,
    priceSource: params.priceSource,
    defaultCondition: params.defaultCondition,
    conditionChoices: params.conditionChoices,
    strict,
    decisions: params.decisions,
    organizerId,
    catalog,
    maxRows: cfg.maxRows,
  };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewInput {
  filePath: string;
  fileName: string | null;
  saleId: string;
  /** The sale's organizer id, taken from the database, never from the request. */
  organizerId: string;
  params: IntakeParams;
}

const MERGE_LOOKUP_CHUNK = 500;

export async function runPreview(deps: IntakeDeps, input: PreviewInput): Promise<{ ok: true; data: Record<string, unknown> } | ApiFailure> {
  const cfg = getIntakeConfig(deps.env);
  const { params } = input;
  const fileSha256 = await sha256OfFile(input.filePath);
  const setup = await setupFile(input.filePath, params, cfg);
  if (isApiFailure(setup)) return setup;
  const catalog = await safeCatalogState(deps);

  const counts = { exact: 0, ambiguous: 0, unmatched: 0, errors: 0, skipped: 0, finishAmbiguous: 0, noCatalogMatch: 0 };
  const reviewCounts: Record<ReviewReason, number> = { AMBIGUOUS_PRINTING: 0, NO_CATALOG_MATCH: 0, FINISH_AMBIGUOUS: 0 };
  const errorsByCode: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const errorRows: Array<Record<string, unknown>> = [];
  // reviewRows holds ONLY rows that need a choice (several printings, or a finish to pick), capped at REVIEW_ROWS_CAP.
  // Rows with no catalog match import with the file's details and need no choice: they are counted, and a small
  // sample is sent, but they never use the capped list.
  const reviewRows: Array<Record<string, unknown>> = [];
  const noCatalogSample: Array<Record<string, unknown>> = [];
  const needsChoiceListed: Record<'AMBIGUOUS_PRINTING' | 'FINISH_AMBIGUOUS', number> = { AMBIGUOUS_PRINTING: 0, FINISH_AMBIGUOUS: 0 };
  const sample: Array<Record<string, unknown>> = [];
  let reviewTruncated = false;
  const groups = new Map<string, { firstRow: number; name: string; quantity: number; price: number | null; rows: number }>();
  let unkeyed = 0;

  const plan = await planFile(
    input.filePath,
    planOptions(setup, params, cfg, catalog, input.organizerId, false),
    { resolve: deps.resolve },
    (row: PlannedRow) => {
      if (row.status === 'ERROR' && row.error) {
        counts.errors += 1;
        errorsByCode[row.error.code] = (errorsByCode[row.error.code] ?? 0) + 1;
        if (errorRows.length < PREVIEW_ERROR_SAMPLE_CAP) {
          errorRows.push({ row: row.row, code: row.error.code, field: row.error.field, message: row.error.message, name: row.display.name });
        }
      } else if (row.status === 'SKIP') {
        counts.skipped += 1;
      } else {
        if (row.resolution === 'EXACT') counts.exact += 1;
        else if (row.resolution === 'AMBIGUOUS') counts.ambiguous += 1;
        else counts.unmatched += 1;
        for (const w of row.warnings) warnings[w] = (warnings[w] ?? 0) + 1;
        if (row.noCatalogMatch) counts.noCatalogMatch += 1;
        if (row.review) {
          reviewCounts[row.review] += 1;
          if (row.review === 'FINISH_AMBIGUOUS') counts.finishAmbiguous += 1;
          const reviewDto = () => ({
            row: row.row,
            state: 'REVIEW',
            reason: row.review,
            message: REVIEW_MESSAGES[row.review as ReviewReason],
            name: row.display.name,
            setCode: row.display.setCode,
            collectorNumber: row.display.collectorNumber,
            noCatalogMatch: row.noCatalogMatch,
            candidates: row.candidates,
            candidatesTruncated: row.truncatedCandidates,
          });
          if (row.review === 'NO_CATALOG_MATCH') {
            if (noCatalogSample.length < NO_CATALOG_SAMPLE_CAP) noCatalogSample.push(reviewDto());
          } else if (reviewRows.length < REVIEW_ROWS_CAP) {
            reviewRows.push(reviewDto());
            needsChoiceListed[row.review] += 1;
          } else reviewTruncated = true;
        }
        if (row.dedupKey) {
          const g = groups.get(row.dedupKey);
          if (!g) groups.set(row.dedupKey, { firstRow: row.row, name: row.display.name, quantity: row.quantity, price: row.price, rows: 1 });
          else {
            g.quantity += row.quantity;
            g.rows += 1;
            if (g.price === null && row.price !== null) g.price = row.price;
          }
        } else unkeyed += 1;
      }
      if (sample.length < 10) {
        sample.push({
          row: row.row,
          status: row.status,
          name: row.display.name,
          setCode: row.card?.setCode ?? row.display.setCode,
          setName: row.card?.setName ?? null,
          collectorNumber: row.card?.collectorNumber ?? row.display.collectorNumber,
          quantity: row.quantity,
          finish: row.card?.finish ?? null,
          conditionCode: row.card?.conditionCode ?? null,
          language: row.card?.language ?? null,
          grader: row.card?.grader ?? null,
          grade: row.card?.grade ?? null,
          price: row.price,
          sku: row.sku,
          resolution: row.resolution,
          review: row.review,
          errorCode: row.error?.code ?? null,
        });
      }
    }
  );

  // Which keyed groups would merge into an existing item of this sale (AVAILABLE, not deleted).
  const keys = Array.from(groups.keys());
  const existing = new Map<string, { stockTotal: number | null; stockSold: number }>();
  for (let i = 0; i < keys.length; i += MERGE_LOOKUP_CHUNK) {
    const found = await deps.db.item.findMany({
      where: { saleId: input.saleId, status: 'AVAILABLE', deletedAt: null, card: { is: { dedupKey: { in: keys.slice(i, i + MERGE_LOOKUP_CHUNK) } } } },
      select: { createdAt: true, stockTotal: true, stockSold: true, card: { select: { dedupKey: true } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const it of found) {
      const k = it.card?.dedupKey;
      if (k && !existing.has(k)) existing.set(k, { stockTotal: it.stockTotal ?? null, stockSold: it.stockSold ?? 0 });
    }
  }
  let willMerge = 0;
  let needsPrice = 0;
  let duplicateGroups = 0;
  let firstMerge: Record<string, unknown> | null = null;
  for (const [key, g] of groups) {
    if (g.price === null) needsPrice += 1;
    if (g.rows > 1) duplicateGroups += 1;
    const ex = existing.get(key);
    if (!ex) continue;
    willMerge += 1;
    if (!firstMerge || g.firstRow < (firstMerge.row as number)) {
      const stock = ex.stockTotal ?? 1;
      firstMerge = {
        row: g.firstRow,
        name: g.name,
        existingStock: stock,
        fileQuantity: g.quantity,
        addResult: nextStockTotal('ADD', ex, g.quantity),
        replaceResult: nextStockTotal('REPLACE', ex, g.quantity),
        alreadySold: ex.stockSold,
      };
    }
  }
  if (duplicateGroups > 0) warnings.DUPLICATE_IN_FILE_MERGED = duplicateGroups;

  const [addBatch, replaceBatch] = await Promise.all(
    (INTAKE_MODES as readonly IntakeMode[]).map((mode) =>
      findBatch(deps.db, { organizerId: input.organizerId, saleId: input.saleId, fileSha256, mode })
    )
  );
  const summaryOf = (b: BatchRow | null): BatchSummaryDto | null => (b ? toBatchSummary(b) : null);
  const choiceTotal = (reason: 'AMBIGUOUS_PRINTING' | 'FINISH_AMBIGUOUS') => ({
    total: reviewCounts[reason],
    listed: needsChoiceListed[reason],
    notListed: reviewCounts[reason] - needsChoiceListed[reason],
  });
  const needsChoiceTotal = reviewCounts.AMBIGUOUS_PRINTING + reviewCounts.FINISH_AMBIGUOUS;
  const conditionLines = [...plan.conditionLines].sort((a, b) => b.rowCount - a.rowCount || a.sourceValue.localeCompare(b.sourceValue));

  return {
    ok: true,
    data: {
      fileSha256,
      fileName: input.fileName,
      detectedFormat: setup.importer.id,
      formatLabel: setup.importer.label,
      headers: setup.headers,
      columnMapping: setup.mapping,
      game: setup.game,
      columnsPresent: {
        quantity: !!setup.mapping.quantity,
        price: !!setup.mapping.price,
        condition: !!setup.mapping.condition,
        finish: !!setup.mapping.finish,
        language: !!setup.mapping.language,
        sku: !!setup.mapping.sku,
      },
      priceSource: params.priceSource,
      catalog: { catalogReady: catalog.catalogReady, readyGames: catalog.readyGames, dataAsOf: catalog.dataAsOf },
      limits: { maxRows: cfg.maxRows, maxFileMb: Math.round(cfg.maxFileBytes / (1024 * 1024)) },
      rowsTotal: plan.rowsTotal,
      summary: {
        exact: counts.exact,
        ambiguous: counts.ambiguous,
        unmatched: counts.unmatched,
        errors: counts.errors,
        skipped: counts.skipped,
        finishAmbiguous: counts.finishAmbiguous,
        noCatalogMatch: counts.noCatalogMatch,
        willCreate: keys.length - willMerge,
        willMerge,
        notYetKeyed: unkeyed,
        needsPrice,
        review: reviewCounts,
        errorsByCode,
        warnings,
      },
      sample,
      conditionMapping: conditionLines,
      conditionReviewCount: conditionLines.filter((l) => l.confidence === 'REVIEW').length,
      reviewRows,
      reviewTruncated,
      // Rows that need a choice: how many there are, how many are in reviewRows, and how many are not listed. A row that
      // is not listed gets no choice and is skipped at confirm (row error AMBIGUOUS_PRINTING or UNKNOWN_FINISH).
      needsChoice: {
        total: needsChoiceTotal,
        listed: reviewRows.length,
        notListed: needsChoiceTotal - reviewRows.length,
        cap: REVIEW_ROWS_CAP,
        byReason: { AMBIGUOUS_PRINTING: choiceTotal('AMBIGUOUS_PRINTING'), FINISH_AMBIGUOUS: choiceTotal('FINISH_AMBIGUOUS') },
      },
      // Rows with no catalog match: they are imported with the file's details and never need a choice.
      noCatalog: {
        total: reviewCounts.NO_CATALOG_MATCH,
        importsAnyway: true,
        sampleCap: NO_CATALOG_SAMPLE_CAP,
        sample: noCatalogSample,
      },
      errorRows,
      firstMerge,
      existingBatches: { ADD: summaryOf(addBatch), REPLACE: summaryOf(replaceBatch) },
    },
  };
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

export interface ConfirmInput {
  filePath: string;
  fileName: string | null;
  saleId: string;
  organizerId: string;
  params: IntakeParams;
}

export interface PreparedConfirm {
  ok: true;
  input: ConfirmInput;
  setup: FileSetup;
  cfg: IntakeConfig;
  fileSha256: string;
  mode: IntakeMode;
}

/**
 * Everything that can fail with a plain JSON status before any byte is streamed or written:
 * hash check (409 FILE_CHANGED), row cap (413 TOO_MANY_ROWS), already applied (409), database space (409).
 */
export async function prepareConfirm(deps: IntakeDeps, input: ConfirmInput): Promise<PreparedConfirm | ApiFailure> {
  const cfg = getIntakeConfig(deps.env);
  const { params } = input;
  if (!params.mode) return failure(400, 'MODE_REQUIRED');
  const fileSha256 = await sha256OfFile(input.filePath);
  if (params.fileSha256 !== fileSha256) return failure(409, 'FILE_CHANGED');

  const setup = await setupFile(input.filePath, params, cfg);
  if (isApiFailure(setup)) return setup;

  const existing = await findBatch(deps.db, { organizerId: input.organizerId, saleId: input.saleId, fileSha256, mode: params.mode });
  if (existing && existing.status === 'COMPLETED' && !params.force) {
    return { ok: false, status: 409, code: 'ALREADY_APPLIED', message: API_MESSAGES.ALREADY_APPLIED, extra: { summary: toBatchSummary(existing) } };
  }

  const sizeBytes = await deps.getDbSizeBytes();
  if (sizeBytes !== null) {
    const projectedMb = (sizeBytes + setup.rowCount * ITEM_BYTES_PER_ROW) / (1024 * 1024);
    if (projectedMb > cfg.dbSoftLimitMb) return failure(409, 'DB_SPACE_LOW');
  }
  return { ok: true, input, setup, cfg, fileSha256, mode: params.mode };
}

export interface ConfirmDone {
  type: 'done';
  status: 'COMPLETED' | 'CANCELLED';
  /** null when the client left before anything was written. */
  batchId: string | null;
  resumed: boolean;
  summary: IntakeSummary;
  errorsCsvHeader: string;
}

/**
 * Plans every row (strict), opens or resumes the ledger batch, then commits in chunks while emitting NDJSON
 * events through `emit`. Throws on an unexpected failure (the controller turns it into a fatal event; the
 * batch is left FAILED and can be resumed by sending the same file again).
 */
export async function executeConfirm(
  deps: IntakeDeps,
  prepared: PreparedConfirm,
  hooks: { emit: (event: CommitEvent | { type: 'progress'; phase: 'reading'; processed: number; total: number }) => void | Promise<void>; shouldCancel: () => boolean }
): Promise<ConfirmDone> {
  const { input, setup, cfg, fileSha256, mode } = prepared;
  const catalog = await safeCatalogState(deps);
  const total = setup.rowCount;
  await hooks.emit({ type: 'progress', phase: 'reading', processed: 0, total });

  const rows: PlannedRow[] = [];
  await planFile(
    input.filePath,
    planOptions(setup, input.params, cfg, catalog, input.organizerId, true),
    { resolve: deps.resolve },
    async (row) => {
      rows.push(row);
      if (rows.length % 500 === 0) await hooks.emit({ type: 'progress', phase: 'reading', processed: rows.length, total });
    }
  );

  if (hooks.shouldCancel()) {
    // The client left while the file was being read: nothing has been written yet.
    return {
      type: 'done',
      status: 'CANCELLED',
      batchId: null,
      resumed: false,
      summary: summaryFor({ rowsTotal: rows.length, createdCount: 0, mergedCount: 0, skippedCount: 0, errorCount: 0 } as BatchRow, rows, {}),
      errorsCsvHeader: errorsCsvHeader(setup.headers),
    };
  }

  const started = await startOrResumeBatch(
    deps.db,
    { organizerId: input.organizerId, saleId: input.saleId, fileSha256, mode },
    { rowsTotal: rows.length, fileName: input.fileName, force: input.params.force }
  );
  if (started.kind === 'ALREADY_APPLIED') {
    // Another request finished the same file while this one was reading it.
    return {
      type: 'done',
      status: 'COMPLETED',
      batchId: started.batch.id,
      resumed: false,
      summary: summaryFor(started.batch, rows, {}),
      errorsCsvHeader: errorsCsvHeader(setup.headers),
    };
  }

  const outcome = await commitPlan({
    db: deps.db,
    batch: started.batch,
    saleId: input.saleId,
    organizerId: input.organizerId,
    mode,
    rows,
    headers: setup.headers,
    shouldCancel: hooks.shouldCancel,
    emit: hooks.emit as (e: CommitEvent) => void | Promise<void>,
  });
  return {
    type: 'done',
    status: outcome.status,
    batchId: outcome.batch.id,
    resumed: started.resumed,
    summary: summaryFor(outcome.batch, rows, outcome.warnings),
    errorsCsvHeader: errorsCsvHeader(setup.headers),
  };
}

function summaryFor(batch: BatchRow, rows: readonly PlannedRow[], warnings: Record<string, number>): IntakeSummary {
  const groups = groupRows(rows);
  let needsPrice = 0;
  for (const g of groups.values()) if (g.price === null) needsPrice += 1;
  let noCatalogMatch = 0;
  const rowWarnings: Record<string, number> = { ...warnings };
  for (const r of rows) {
    if (r.status !== 'OK') continue;
    if (r.noCatalogMatch) noCatalogMatch += 1;
    for (const w of r.warnings) rowWarnings[w] = (rowWarnings[w] ?? 0) + 1;
  }
  return {
    rowsTotal: batch.rowsTotal,
    created: batch.createdCount,
    merged: batch.mergedCount,
    skipped: batch.skippedCount,
    errors: batch.errorCount,
    noCatalogMatch,
    needsPrice,
    warnings: rowWarnings,
  };
}
