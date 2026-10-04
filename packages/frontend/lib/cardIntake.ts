/**
 * cardIntake (ADR-134 #642, batch B8): pure logic behind the spreadsheet-first card intake screens.
 *
 * No React, no axios, no env reads, no network: plain functions, tested by lib/__tests__/cardIntake.test.ts
 * (Run: npm test, node:test through tsx). The backend (services/cardIntake, controllers/cardIntakeController.ts,
 * routes/cardIntake.ts) is the source of truth for the HTTP contract this file reads and builds:
 *
 *   GET  /api/card-intake/formats
 *   POST /api/card-intake/:saleId/preview   multipart: file, priceSource, format, game, defaultCondition, columnMapping (JSON)
 *   POST /api/card-intake/:saleId/confirm   same file again plus mode (REQUIRED, no default), fileSha256 (REQUIRED),
 *                                           conditionMapping (JSON), decisions (JSON keyed by row number), force
 *
 * Rules this file enforces:
 *  - Mode (ADD or REPLACE) has no default. confirmBlockers() keeps Import disabled until it is chosen.
 *  - A condition line the backend marked REVIEW is never confirmed for the seller: it blocks Import until the seller
 *    picks a condition or "Leave blank". Nothing here turns a word into Near Mint.
 *  - A row that needs a choice (several printings, or a finish to pick) and has no decision is never guessed: the backend
 *    skips it and lists it in the errors file. A row with no catalog match needs no choice: it is imported with the file's
 *    details. The screens say so, per kind of row.
 *  - Decisions are only ever sent for rows and printings the preview showed.
 *  - The preview lists at most REVIEW_ROWS_SHOWN_CAP rows that need a choice. The rest are counted (needsChoice.notListed),
 *    skipped at confirm, and come back in the errors file, which can be imported as a new file to choose for them.
 */
import { INTAKE_COPY, wordingForError } from './cardIntakeCopy';

// ---------------------------------------------------------------------------
// Constants and shared shapes
// ---------------------------------------------------------------------------

export type IntakeMode = 'ADD' | 'REPLACE';
export type PriceSource = 'FILE' | 'NONE';
export type ReviewReason = 'AMBIGUOUS_PRINTING' | 'NO_CATALOG_MATCH' | 'FINISH_AMBIGUOUS';

export const ALLOWED_EXTENSIONS: readonly string[] = ['.csv', '.tsv', '.txt'];
/** Step B switches to a windowed list above this many rows (ADR-134 B8 acceptance). */
export const VIRTUALIZE_ABOVE = 200;
/**
 * The backend lists at most this many rows that NEED a choice in the preview (services/cardIntake/config.ts REVIEW_ROWS_CAP).
 * Rows with no catalog match do not use this list.
 */
export const REVIEW_ROWS_SHOWN_CAP = 500;
/** The backend sends at most this many example rows with no catalog match (config.ts NO_CATALOG_SAMPLE_CAP). */
export const NO_CATALOG_SAMPLE_SHOWN_CAP = 20;
/** Candidate pickers show at most this many printings (ADR-134 section 4.5 step B). */
export const MAX_CANDIDATES = 5;

export interface VocabOption {
  code: string;
  label: string;
}

/** Used only when GET /api/cards/vocabulary could not be loaded. Same codes and labels as the backend vocabulary. */
export const CONDITION_FALLBACK: readonly VocabOption[] = [
  { code: 'NM', label: 'Near Mint' },
  { code: 'LP', label: 'Lightly Played' },
  { code: 'MP', label: 'Moderately Played' },
  { code: 'HP', label: 'Heavily Played' },
  { code: 'DMG', label: 'Damaged' },
];

export const FINISH_FALLBACK: readonly VocabOption[] = [
  { code: 'NONFOIL', label: 'Non-foil' },
  { code: 'FOIL', label: 'Foil' },
  { code: 'ETCHED', label: 'Etched foil' },
  { code: 'HOLO', label: 'Holo' },
  { code: 'REVERSE_HOLO', label: 'Reverse holo' },
];

export const GAME_FALLBACK: readonly VocabOption[] = [
  { code: 'MTG', label: 'Magic: The Gathering' },
  { code: 'POKEMON', label: 'Pokemon' },
  { code: 'YUGIOH', label: 'Yu-Gi-Oh!' },
  { code: 'LORCANA', label: 'Disney Lorcana' },
  { code: 'ONE_PIECE', label: 'One Piece Card Game' },
  { code: 'OTHER', label: 'Other' },
];

/** Fields shown first in the column chooser; the rest sit behind "Show more columns". */
export const CORE_MAPPING_FIELDS: readonly string[] = [
  'name',
  'setCode',
  'setName',
  'collectorNumber',
  'quantity',
  'finish',
  'condition',
  'language',
  'price',
  'sku',
];

export interface FormatInfo {
  id: string;
  label: string;
  hint: string;
}
export interface FieldInfo {
  value: string;
  label: string;
}
export interface FormatsInfo {
  importers: FormatInfo[];
  fields: FieldInfo[];
  limits: { maxRows: number; maxFileMb: number };
}

export interface Candidate {
  printingId: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string | null;
  finishes: string[];
  releaseYear: number | null;
  imageSmallUrl: string | null;
}

export interface ConditionLine {
  sourceValue: string;
  rowCount: number;
  proposed: string | null;
  proposedLabel: string | null;
  confidence: 'EXACT' | 'REVIEW';
}

export interface ReviewRow {
  row: number;
  reason: ReviewReason;
  message: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  noCatalogMatch: boolean;
  candidates: Candidate[];
  candidatesTruncated: boolean;
}

export interface SampleRow {
  row: number;
  status: string;
  name: string;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  quantity: number;
  finish: string | null;
  conditionCode: string | null;
  price: number | null;
  errorCode: string | null;
}

export interface PreviewErrorRow {
  row: number;
  code: string;
  message: string;
  name: string;
}

export interface FirstMerge {
  row: number;
  name: string;
  existingStock: number;
  fileQuantity: number;
  addResult: number | null;
  replaceResult: number | null;
  alreadySold: number;
}

export interface BatchSummary {
  batchId: string | null;
  mode: string;
  status: string;
  rowsTotal: number;
  committedThroughRow: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
}

export interface ColumnsPresent {
  quantity: boolean;
  price: boolean;
  condition: boolean;
  finish: boolean;
  language: boolean;
  sku: boolean;
}

export interface PreviewSummary {
  exact: number;
  ambiguous: number;
  unmatched: number;
  errors: number;
  skipped: number;
  finishAmbiguous: number;
  noCatalogMatch: number;
  willCreate: number;
  willMerge: number;
  needsPrice: number;
  review: Record<ReviewReason, number>;
  errorsByCode: Record<string, number>;
}

export type NeedsChoiceReason = 'AMBIGUOUS_PRINTING' | 'FINISH_AMBIGUOUS';

export interface NeedsChoiceByReason {
  total: number;
  listed: number;
  notListed: number;
}

/** Rows that need the seller's choice: how many, how many are listed in reviewRows, and how many are not listed. */
export interface NeedsChoice {
  total: number;
  listed: number;
  notListed: number;
  cap: number;
  byReason: Record<NeedsChoiceReason, NeedsChoiceByReason>;
}

/** Rows with no catalog match: they import with the file's details and never need a choice. */
export interface NoCatalogInfo {
  total: number;
  /** How many example rows came with the preview (they are appended to reviewRows). */
  sampleShown: number;
}

export interface PreviewData {
  fileSha256: string;
  fileName: string | null;
  detectedFormat: string;
  formatLabel: string;
  headers: string[];
  columnMapping: Record<string, string>;
  columnsPresent: ColumnsPresent;
  catalog: { catalogReady: boolean; readyGames: string[] };
  limits: { maxRows: number; maxFileMb: number };
  rowsTotal: number;
  summary: PreviewSummary;
  sample: SampleRow[];
  conditionMapping: ConditionLine[];
  /**
   * Rows to show on the review step: first the rows that need a choice (at most REVIEW_ROWS_SHOWN_CAP), then the example
   * rows with no catalog match (the reader appends noCatalog.sample, or accepts them already inside reviewRows from an
   * older backend).
   */
  reviewRows: ReviewRow[];
  /** True when some rows that need a choice are not listed in reviewRows. */
  reviewTruncated: boolean;
  needsChoice: NeedsChoice;
  noCatalog: NoCatalogInfo;
  errorRows: PreviewErrorRow[];
  firstMerge: FirstMerge | null;
  existingBatches: { ADD: BatchSummary | null; REPLACE: BatchSummary | null };
}

// ---------------------------------------------------------------------------
// Tolerant readers (never throw; a malformed body gives null or safe defaults)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function unwrap(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.data) && body.success !== false) return body.data;
  return body;
}

export function readFormats(body: unknown): FormatsInfo | null {
  const d = unwrap(body);
  if (!d) return null;
  const importers: FormatInfo[] = [];
  arr(d.importers).forEach((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string') return;
    importers.push({ id: raw.id, label: str(raw.label, raw.id), hint: str(raw.hint) });
  });
  if (importers.length === 0) return null;
  const fields: FieldInfo[] = [];
  arr(d.fields).forEach((raw) => {
    if (isRecord(raw) && typeof raw.value === 'string') fields.push({ value: raw.value, label: str(raw.label, raw.value) });
  });
  const limits = isRecord(d.limits) ? d.limits : {};
  return { importers, fields, limits: { maxRows: num(limits.maxRows, 20000), maxFileMb: num(limits.maxFileMb, 50) } };
}

function readCandidate(raw: unknown): Candidate | null {
  if (!isRecord(raw) || typeof raw.printingId !== 'string' || raw.printingId === '') return null;
  return {
    printingId: raw.printingId,
    name: str(raw.name),
    setCode: str(raw.setCode),
    setName: strOrNull(raw.setName),
    collectorNumber: strOrNull(raw.collectorNumber),
    finishes: arr(raw.finishes).filter((f): f is string => typeof f === 'string'),
    releaseYear: numOrNull(raw.releaseYear),
    imageSmallUrl: strOrNull(raw.imageSmallUrl),
  };
}

function readReviewRow(raw: unknown): ReviewRow | null {
  if (!isRecord(raw) || typeof raw.row !== 'number') return null;
  const reason = raw.reason;
  if (reason !== 'AMBIGUOUS_PRINTING' && reason !== 'NO_CATALOG_MATCH' && reason !== 'FINISH_AMBIGUOUS') return null;
  const candidates: Candidate[] = [];
  arr(raw.candidates).forEach((c) => {
    const cand = readCandidate(c);
    if (cand && candidates.length < MAX_CANDIDATES) candidates.push(cand);
  });
  return {
    row: raw.row,
    reason,
    message: str(raw.message),
    name: str(raw.name),
    setCode: strOrNull(raw.setCode),
    collectorNumber: strOrNull(raw.collectorNumber),
    noCatalogMatch: bool(raw.noCatalogMatch),
    candidates,
    candidatesTruncated: bool(raw.candidatesTruncated),
  };
}

function readBatch(raw: unknown): BatchSummary | null {
  if (!isRecord(raw)) return null;
  return {
    batchId: strOrNull(raw.batchId),
    mode: str(raw.mode),
    status: str(raw.status),
    rowsTotal: num(raw.rowsTotal),
    committedThroughRow: num(raw.committedThroughRow),
    created: num(raw.created),
    merged: num(raw.merged),
    skipped: num(raw.skipped),
    errors: num(raw.errors),
  };
}
export const readBatchSummary = readBatch;

function readCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  Object.keys(raw).forEach((k) => {
    const v = raw[k];
    if (typeof v === 'number' && isFinite(v)) Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  });
  return out;
}

function readChoiceCounts(raw: unknown, fallback: NeedsChoiceByReason): NeedsChoiceByReason {
  if (!isRecord(raw)) return fallback;
  const total = num(raw.total, fallback.total);
  const listed = Math.min(total, num(raw.listed, fallback.listed));
  return { total, listed, notListed: Math.max(0, total - listed) };
}

/**
 * Reads needsChoice. A backend that does not send it yet (older response) is read the old way: the totals come from
 * summary.review and the listed count from the rows that came with the preview.
 */
function readNeedsChoice(raw: unknown, rows: readonly ReviewRow[], counts: Record<ReviewReason, number>, truncated: boolean): NeedsChoice {
  const listedOf = (reason: NeedsChoiceReason) => rows.filter((r) => r.reason === reason).length;
  const derive = (reason: NeedsChoiceReason): NeedsChoiceByReason => {
    const total = counts[reason];
    // An older response says only whether the list was cut off: when it was not, every row is listed.
    const listed = truncated ? Math.min(total, listedOf(reason)) : total;
    return { total, listed, notListed: Math.max(0, total - listed) };
  };
  const src = isRecord(raw) ? raw : null;
  const by = src && isRecord(src.byReason) ? src.byReason : null;
  const printing = readChoiceCounts(by ? by.AMBIGUOUS_PRINTING : null, derive('AMBIGUOUS_PRINTING'));
  const finish = readChoiceCounts(by ? by.FINISH_AMBIGUOUS : null, derive('FINISH_AMBIGUOUS'));
  const total = printing.total + finish.total;
  const listed = printing.listed + finish.listed;
  return {
    total,
    listed,
    notListed: Math.max(0, total - listed),
    cap: src ? num(src.cap, REVIEW_ROWS_SHOWN_CAP) : REVIEW_ROWS_SHOWN_CAP,
    byReason: { AMBIGUOUS_PRINTING: printing, FINISH_AMBIGUOUS: finish },
  };
}

/** Reads the preview response body. Returns null when it does not look like a preview at all. */
export function readPreview(body: unknown): PreviewData | null {
  const d = unwrap(body);
  if (!d) return null;
  const sha = str(d.fileSha256).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha) || typeof d.rowsTotal !== 'number') return null;

  const conditionMapping: ConditionLine[] = [];
  arr(d.conditionMapping).forEach((raw) => {
    if (!isRecord(raw) || typeof raw.sourceValue !== 'string') return;
    conditionMapping.push({
      sourceValue: raw.sourceValue,
      rowCount: num(raw.rowCount),
      proposed: strOrNull(raw.proposed),
      proposedLabel: strOrNull(raw.proposedLabel),
      confidence: raw.confidence === 'EXACT' ? 'EXACT' : 'REVIEW',
    });
  });

  const reviewRows: ReviewRow[] = [];
  arr(d.reviewRows).forEach((raw) => {
    const r = readReviewRow(raw);
    if (r) reviewRows.push(r);
  });
  // Example rows with no catalog match come in their own field (the list above holds only rows that need a choice).
  const noCatalogRaw = isRecord(d.noCatalog) ? d.noCatalog : {};
  arr(noCatalogRaw.sample).forEach((raw) => {
    const r = readReviewRow(raw);
    if (r && r.reason === 'NO_CATALOG_MATCH' && !reviewRows.some((x) => x.row === r.row)) reviewRows.push(r);
  });

  const sample: SampleRow[] = [];
  arr(d.sample).forEach((raw) => {
    if (!isRecord(raw) || typeof raw.row !== 'number') return;
    sample.push({
      row: raw.row,
      status: str(raw.status),
      name: str(raw.name),
      setCode: strOrNull(raw.setCode),
      setName: strOrNull(raw.setName),
      collectorNumber: strOrNull(raw.collectorNumber),
      quantity: num(raw.quantity),
      finish: strOrNull(raw.finish),
      conditionCode: strOrNull(raw.conditionCode),
      price: numOrNull(raw.price),
      errorCode: strOrNull(raw.errorCode),
    });
  });

  const errorRows: PreviewErrorRow[] = [];
  arr(d.errorRows).forEach((raw) => {
    if (!isRecord(raw) || typeof raw.row !== 'number') return;
    errorRows.push({ row: raw.row, code: str(raw.code), message: str(raw.message), name: str(raw.name) });
  });

  const s = isRecord(d.summary) ? d.summary : {};
  const rev = isRecord(s.review) ? s.review : {};
  const cp = isRecord(d.columnsPresent) ? d.columnsPresent : {};
  const cat = isRecord(d.catalog) ? d.catalog : {};
  const lim = isRecord(d.limits) ? d.limits : {};
  const eb = isRecord(d.existingBatches) ? d.existingBatches : {};
  const mapping: Record<string, string> = {};
  if (isRecord(d.columnMapping)) {
    Object.keys(d.columnMapping).forEach((k) => {
      const v = (d.columnMapping as Record<string, unknown>)[k];
      if (typeof v === 'string') Object.defineProperty(mapping, k, { value: v, enumerable: true, writable: true, configurable: true });
    });
  }

  let firstMerge: FirstMerge | null = null;
  if (isRecord(d.firstMerge)) {
    const m = d.firstMerge;
    firstMerge = {
      row: num(m.row),
      name: str(m.name),
      existingStock: num(m.existingStock),
      fileQuantity: num(m.fileQuantity),
      addResult: numOrNull(m.addResult),
      replaceResult: numOrNull(m.replaceResult),
      alreadySold: num(m.alreadySold),
    };
  }

  const reviewCounts = {
    AMBIGUOUS_PRINTING: num(rev.AMBIGUOUS_PRINTING),
    NO_CATALOG_MATCH: num(rev.NO_CATALOG_MATCH),
    FINISH_AMBIGUOUS: num(rev.FINISH_AMBIGUOUS),
  };
  const needsChoice = readNeedsChoice(d.needsChoice, reviewRows, reviewCounts, bool(d.reviewTruncated));
  const noCatalog: NoCatalogInfo = {
    total: typeof noCatalogRaw.total === 'number' && isFinite(noCatalogRaw.total) ? noCatalogRaw.total : reviewCounts.NO_CATALOG_MATCH,
    sampleShown: reviewRows.filter((r) => r.reason === 'NO_CATALOG_MATCH').length,
  };

  return {
    fileSha256: sha,
    fileName: strOrNull(d.fileName),
    detectedFormat: str(d.detectedFormat),
    formatLabel: str(d.formatLabel, str(d.detectedFormat)),
    headers: arr(d.headers).filter((h): h is string => typeof h === 'string'),
    columnMapping: mapping,
    columnsPresent: {
      quantity: bool(cp.quantity),
      price: bool(cp.price),
      condition: bool(cp.condition),
      finish: bool(cp.finish),
      language: bool(cp.language),
      sku: bool(cp.sku),
    },
    catalog: { catalogReady: cat.catalogReady !== false, readyGames: arr(cat.readyGames).filter((g): g is string => typeof g === 'string') },
    limits: { maxRows: num(lim.maxRows, 20000), maxFileMb: num(lim.maxFileMb, 50) },
    rowsTotal: d.rowsTotal as number,
    summary: {
      exact: num(s.exact),
      ambiguous: num(s.ambiguous),
      unmatched: num(s.unmatched),
      errors: num(s.errors),
      skipped: num(s.skipped),
      finishAmbiguous: num(s.finishAmbiguous),
      noCatalogMatch: num(s.noCatalogMatch),
      willCreate: num(s.willCreate),
      willMerge: num(s.willMerge),
      needsPrice: num(s.needsPrice),
      review: {
        AMBIGUOUS_PRINTING: num(rev.AMBIGUOUS_PRINTING),
        NO_CATALOG_MATCH: num(rev.NO_CATALOG_MATCH),
        FINISH_AMBIGUOUS: num(rev.FINISH_AMBIGUOUS),
      },
      errorsByCode: readCounts(s.errorsByCode),
    },
    sample,
    conditionMapping,
    reviewRows,
    reviewTruncated: needsChoice.notListed > 0 || bool(d.reviewTruncated),
    needsChoice,
    noCatalog,
    errorRows,
    firstMerge,
    existingBatches: { ADD: readBatch(eb.ADD), REPLACE: readBatch(eb.REPLACE) },
  };
}

/** Orchestrator decision 1: price toggle defaults to the file's price when it has a price column, else blank prices. */
export function defaultPriceSource(preview: Pick<PreviewData, 'columnsPresent'>): PriceSource {
  return preview.columnsPresent.price ? 'FILE' : 'NONE';
}

// ---------------------------------------------------------------------------
// File checks and header reading (client side, before upload)
// ---------------------------------------------------------------------------

/** Returns plain wording for a file we already know the server will refuse, else null. */
export function checkChosenFile(file: { name: string; size: number }, maxFileMb: number): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (ALLOWED_EXTENSIONS.indexOf(ext) < 0) return INTAKE_COPY.fileWrongType;
  if (file.size <= 0) return INTAKE_COPY.fileEmpty;
  if (file.size > maxFileMb * 1024 * 1024) return INTAKE_COPY.fileTooBig(maxFileMb);
  return null;
}

/**
 * Header names of the first record of a CSV, TSV or semicolon file: BOM stripped, quotes honored, each name trimmed
 * (the same normalisation the backend reader applies, so the names can be sent back as a column mapping).
 */
export function parseHeaderLine(text: string): string[] {
  let t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Cut at the end of the first record, but only outside quotes.
  let inQuotes = false;
  let end = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) {
      end = i;
      break;
    }
  }
  t = t.slice(0, end);
  const delimiters = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  delimiters.forEach((d) => {
    let count = 0;
    let q = false;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '"') q = !q;
      else if (!q && t[i] === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  });
  const out: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      if (q && t[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else q = !q;
    } else if (!q && c === best) {
      out.push(cell.trim());
      cell = '';
    } else cell += c;
  }
  out.push(cell.trim());
  const seen: Record<string, boolean> = {};
  const unique: string[] = [];
  out.forEach((h) => {
    if (h === '' || has(seen, h)) return;
    Object.defineProperty(seen, h, { value: true, enumerable: true, writable: true, configurable: true });
    unique.push(h);
  });
  return unique;
}

// ---------------------------------------------------------------------------
// Request options and multipart fields
// ---------------------------------------------------------------------------

export interface IntakeOptions {
  /** 'auto' or an importer id from GET /formats. */
  format: string;
  /** '' = not set. */
  game: string;
  /** '' = not set. */
  defaultCondition: string;
  /** field -> header the seller chose ('' removes an auto-detected column). null = no override. */
  columnMapping: Record<string, string> | null;
}

export const DEFAULT_OPTIONS: IntakeOptions = { format: 'auto', game: '', defaultCondition: '', columnMapping: null };

function mappingJson(mapping: Record<string, string> | null): string | null {
  if (!mapping) return null;
  const keys = Object.keys(mapping);
  if (keys.length === 0) return null;
  return jsonObject(keys.map((k) => [k, mapping[k]] as [string, unknown]));
}

/** JSON.stringify of an object built from entries, safe for any key text (including "__proto__"). */
export function jsonObject(entries: Array<[string, unknown]>): string {
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v === undefined ? null : v)).join(',') + '}';
}

/** Text fields shared by preview and confirm. Same options both times so the row numbers line up. */
export function optionFields(options: IntakeOptions, priceSource: PriceSource): Array<[string, string]> {
  const fields: Array<[string, string]> = [['priceSource', priceSource]];
  if (options.format && options.format !== 'auto') fields.push(['format', options.format]);
  if (options.game) fields.push(['game', options.game]);
  if (options.defaultCondition) fields.push(['defaultCondition', options.defaultCondition]);
  const mapping = mappingJson(options.columnMapping);
  if (mapping) fields.push(['columnMapping', mapping]);
  return fields;
}

export function buildPreviewFields(options: IntakeOptions, priceSource: PriceSource): Array<[string, string]> {
  return optionFields(options, priceSource);
}

export interface ConfirmExtras {
  mode: IntakeMode;
  fileSha256: string;
  priceSource: PriceSource;
  conditionMapping: string;
  decisions: string;
  force: boolean;
}

export function buildConfirmFields(options: IntakeOptions, extras: ConfirmExtras): Array<[string, string]> {
  const fields = optionFields(options, extras.priceSource);
  fields.push(['mode', extras.mode]);
  fields.push(['fileSha256', extras.fileSha256]);
  fields.push(['conditionMapping', extras.conditionMapping]);
  fields.push(['decisions', extras.decisions]);
  if (extras.force) fields.push(['force', 'true']);
  return fields;
}

/** Text fields first, the file last, field name 'file' (what the backend upload middleware reads). */
export function buildForm(fields: Array<[string, string]>, file: Blob, fileName: string, FormDataCtor: { new (): FormData } = FormData): FormData {
  const form = new FormDataCtor();
  fields.forEach(([k, v]) => form.append(k, v));
  form.append('file', file, fileName);
  return form;
}

// ---------------------------------------------------------------------------
// Step A: condition mapping
// ---------------------------------------------------------------------------

export const BLANK_CHOICE = 'BLANK';

/** Same normalisation as the backend conditionKey: trimmed, lower case, inner whitespace collapsed. */
export function conditionKey(value: string): string {
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Choices keyed by conditionKey(sourceValue). Value is a condition code or BLANK_CHOICE. A missing key means "not chosen yet". */
export type ConditionChoices = Record<string, string>;

function setKey<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}
function getKey<T>(map: Record<string, T>, key: string): T | undefined {
  return has(map, key) ? map[key] : undefined;
}

/** Lines the backend matched EXACT start chosen; REVIEW lines start empty so the seller must choose. */
export function initialConditionChoices(lines: readonly ConditionLine[]): ConditionChoices {
  const out: ConditionChoices = {};
  lines.forEach((l) => {
    if (l.confidence === 'EXACT' && l.proposed) setKey(out, conditionKey(l.sourceValue), l.proposed);
  });
  return out;
}

export function choiceFor(choices: ConditionChoices, line: Pick<ConditionLine, 'sourceValue'>): string | undefined {
  return getKey(choices, conditionKey(line.sourceValue));
}

export function setConditionChoice(choices: ConditionChoices, line: Pick<ConditionLine, 'sourceValue'>, value: string): ConditionChoices {
  const next: ConditionChoices = {};
  Object.keys(choices).forEach((k) => setKey(next, k, choices[k]));
  const key = conditionKey(line.sourceValue);
  if (value === '') {
    if (has(next, key)) delete next[key];
  } else setKey(next, key, value);
  return next;
}

/** REVIEW lines the seller has not chosen for yet. These block Import. */
export function pendingConditionLines(lines: readonly ConditionLine[], choices: ConditionChoices): ConditionLine[] {
  return lines.filter((l) => l.confidence === 'REVIEW' && choiceFor(choices, l) === undefined);
}

/** "Use every suggestion": fills every unchosen REVIEW line that has a proposal. Lines without a proposal stay for the seller. */
export function applyAllSuggestions(lines: readonly ConditionLine[], choices: ConditionChoices): ConditionChoices {
  let next = choices;
  lines.forEach((l) => {
    if (l.confidence === 'REVIEW' && l.proposed && choiceFor(next, l) === undefined) next = setConditionChoice(next, l, l.proposed);
  });
  return next;
}

/** The conditionMapping JSON for confirm: { "<source value>": "NM" | null }. null means leave the condition blank. */
export function conditionMappingJson(lines: readonly ConditionLine[], choices: ConditionChoices): string {
  const entries: Array<[string, unknown]> = [];
  lines.forEach((l) => {
    const c = choiceFor(choices, l);
    if (c === undefined) return;
    entries.push([l.sourceValue, c === BLANK_CHOICE ? null : c]);
  });
  return jsonObject(entries);
}

// ---------------------------------------------------------------------------
// Step B: ambiguous rows
// ---------------------------------------------------------------------------

export interface RowDecision {
  printingId?: string;
  finish?: string;
  skip?: boolean;
}
export type DecisionMap = Record<number, RowDecision>;
export type RowState = 'PENDING' | 'DECIDED' | 'SKIPPED' | 'INFO';

/** Mirror of the backend catalogFinishToVocab (services/cardIntake/normalizeCells.ts). */
export function catalogFinishToVocab(finish: string): string | null {
  const s = String(finish === undefined || finish === null ? '' : finish).trim().toLowerCase();
  if (s === 'nonfoil' || s === 'normal') return 'NONFOIL';
  if (s === 'foil') return 'FOIL';
  if (s === 'etched') return 'ETCHED';
  if (s === 'holo' || s === 'holofoil') return 'HOLO';
  if (s === 'reverse_holo' || s === 'reverseholo' || s === 'reverse holofoil' || s === 'reverseholofoil' || s === 'reverse holo') return 'REVERSE_HOLO';
  return null;
}

export function candidateFinishes(c: Pick<Candidate, 'finishes'>): string[] {
  const out: string[] = [];
  c.finishes.forEach((f) => {
    const v = catalogFinishToVocab(f);
    if (v && out.indexOf(v) < 0) out.push(v);
  });
  return out;
}

export function findCandidate(row: ReviewRow, printingId: string | undefined): Candidate | undefined {
  if (!printingId) return undefined;
  return row.candidates.filter((c) => c.printingId === printingId)[0];
}

/** Finish codes the seller may pick for this row right now (empty when a printing still has to be picked first). */
export function finishOptionsForRow(row: ReviewRow, decision: RowDecision | undefined): string[] {
  if (row.reason === 'FINISH_AMBIGUOUS') {
    const out: string[] = [];
    row.candidates.forEach((c) => candidateFinishes(c).forEach((f) => out.indexOf(f) < 0 && out.push(f)));
    return out.length > 0 ? out : FINISH_FALLBACK.map((f) => f.code);
  }
  if (row.reason === 'AMBIGUOUS_PRINTING') {
    const picked = findCandidate(row, decision && decision.printingId);
    return picked ? candidateFinishes(picked) : [];
  }
  return [];
}

export function rowState(row: ReviewRow, decision: RowDecision | undefined, columnsPresent: Pick<ColumnsPresent, 'finish'>): RowState {
  if (decision && decision.skip === true) return 'SKIPPED';
  if (row.reason === 'NO_CATALOG_MATCH') return 'INFO';
  if (row.reason === 'FINISH_AMBIGUOUS') return decision && decision.finish ? 'DECIDED' : 'PENDING';
  const picked = findCandidate(row, decision && decision.printingId);
  if (!picked) return 'PENDING';
  const finishes = candidateFinishes(picked);
  if (finishes.length > 1 && !(decision && decision.finish) && !columnsPresent.finish) return 'PENDING';
  return 'DECIDED';
}

/** True when the picked printing comes in several finishes and the file gives no finish column to rely on. */
export function finishRequired(row: ReviewRow, decision: RowDecision | undefined, columnsPresent: Pick<ColumnsPresent, 'finish'>): boolean {
  if (row.reason === 'FINISH_AMBIGUOUS') return true;
  if (row.reason !== 'AMBIGUOUS_PRINTING') return false;
  const picked = findCandidate(row, decision && decision.printingId);
  return !!picked && candidateFinishes(picked).length > 1 && !columnsPresent.finish;
}

function copyDecisions(map: DecisionMap): DecisionMap {
  const out: DecisionMap = {};
  Object.keys(map).forEach((k) => {
    out[Number(k)] = { ...map[Number(k)] };
  });
  return out;
}

export function chooseCandidate(map: DecisionMap, row: ReviewRow, printingId: string): DecisionMap {
  const picked = findCandidate(row, printingId);
  if (!picked) return map;
  const next = copyDecisions(map);
  const prev = next[row.row] || {};
  const finishes = candidateFinishes(picked);
  const keepFinish = prev.finish && finishes.indexOf(prev.finish) >= 0 && finishes.length > 1 ? prev.finish : undefined;
  const d: RowDecision = { printingId };
  if (keepFinish) d.finish = keepFinish;
  next[row.row] = d;
  return next;
}

export function chooseFinish(map: DecisionMap, row: ReviewRow, finish: string): DecisionMap {
  const next = copyDecisions(map);
  const prev = next[row.row] || {};
  const d: RowDecision = {};
  if (prev.printingId) d.printingId = prev.printingId;
  if (finish) d.finish = finish;
  if (d.printingId || d.finish) next[row.row] = d;
  else delete next[row.row];
  return next;
}

export function setSkip(map: DecisionMap, row: ReviewRow, skip: boolean): DecisionMap {
  const next = copyDecisions(map);
  if (skip) next[row.row] = { skip: true };
  else delete next[row.row];
  return next;
}

export interface BulkResult {
  map: DecisionMap;
  changed: number;
}

/** "Skip every row here that has no choice": only rows still waiting for a choice. */
export function applySkipToGroup(rows: readonly ReviewRow[], map: DecisionMap, reason: ReviewReason, columnsPresent: Pick<ColumnsPresent, 'finish'>): BulkResult {
  const next = copyDecisions(map);
  let changed = 0;
  rows.forEach((r) => {
    if (r.reason !== reason) return;
    if (rowState(r, map[r.row], columnsPresent) !== 'PENDING') return;
    next[r.row] = { skip: true };
    changed += 1;
  });
  return { map: changed ? next : map, changed };
}

/**
 * "Use the same printing set in every row where it is one of the choices": for rows still waiting, with exactly one candidate
 * from the same set code as the printing the seller picked. A row where the set matches several printings is left alone.
 */
export function applySameSet(rows: readonly ReviewRow[], map: DecisionMap, sourceRow: ReviewRow, printingId: string): BulkResult {
  const source = findCandidate(sourceRow, printingId);
  if (!source || !source.setCode) return { map, changed: 0 };
  const set = source.setCode.toLowerCase();
  const next = copyDecisions(map);
  let changed = 0;
  rows.forEach((r) => {
    if (r.row === sourceRow.row || r.reason !== 'AMBIGUOUS_PRINTING') return;
    const d = map[r.row];
    if (d && (d.skip || d.printingId)) return;
    const matches = r.candidates.filter((c) => c.setCode.toLowerCase() === set);
    if (matches.length !== 1) return;
    next[r.row] = { printingId: matches[0].printingId };
    changed += 1;
  });
  return { map: changed ? next : map, changed };
}

/** "Use <finish> in every row here that offers it": rows in the group still waiting for a finish. */
export function applyFinishToGroup(
  rows: readonly ReviewRow[],
  map: DecisionMap,
  reason: ReviewReason,
  finish: string,
  columnsPresent: Pick<ColumnsPresent, 'finish'>
): BulkResult {
  const next = copyDecisions(map);
  let changed = 0;
  rows.forEach((r) => {
    if (r.reason !== reason) return;
    const d = map[r.row];
    if (rowState(r, d, columnsPresent) !== 'PENDING') return;
    if (finishOptionsForRow(r, d).indexOf(finish) < 0) return;
    const cur = next[r.row] || {};
    next[r.row] = { ...cur, finish };
    changed += 1;
  });
  return { map: changed ? next : map, changed };
}

export interface GroupCounts {
  total: number;
  pending: number;
  decided: number;
  skipped: number;
}

export function groupCounts(rows: readonly ReviewRow[], map: DecisionMap, reason: ReviewReason, columnsPresent: Pick<ColumnsPresent, 'finish'>): GroupCounts {
  const out: GroupCounts = { total: 0, pending: 0, decided: 0, skipped: 0 };
  rows.forEach((r) => {
    if (r.reason !== reason) return;
    out.total += 1;
    const s = rowState(r, map[r.row], columnsPresent);
    if (s === 'PENDING') out.pending += 1;
    else if (s === 'SKIPPED') out.skipped += 1;
    else out.decided += 1;
  });
  return out;
}

/** Rows that need a choice and have none: the backend skips these and reports them. */
export function pendingRowCount(rows: readonly ReviewRow[], map: DecisionMap, columnsPresent: Pick<ColumnsPresent, 'finish'>): number {
  let n = 0;
  rows.forEach((r) => {
    if (rowState(r, map[r.row], columnsPresent) === 'PENDING') n += 1;
  });
  return n;
}

export function skippedRowCount(rows: readonly ReviewRow[], map: DecisionMap): number {
  let n = 0;
  rows.forEach((r) => {
    if (map[r.row] && map[r.row].skip === true) n += 1;
  });
  return n;
}

/**
 * Rows that need a choice but are not listed (the backend lists at most REVIEW_ROWS_SHOWN_CAP of them), so the seller cannot
 * choose for them. The backend skips them at confirm (no choice, no guess) and they come back in the errors file.
 * Rows with no catalog match never count here: they are imported with the file's details.
 */
export function hiddenReviewCount(preview: PreviewData): number {
  return Math.max(0, preview.needsChoice.notListed);
}

/** Rows in the file with no catalog match: all of them are imported with the file's details, listed or not. */
export function noCatalogTotal(preview: PreviewData): number {
  return Math.max(preview.noCatalog.total, preview.noCatalog.sampleShown);
}

/** True when the example list of rows with no catalog match shows fewer rows than the file has. */
export function noCatalogSampleIsPartial(preview: PreviewData): boolean {
  return preview.noCatalog.total > preview.noCatalog.sampleShown;
}

/** The decisions JSON for confirm: only rows the preview showed, only printings and finishes it offered. */
export function decisionsJson(rows: readonly ReviewRow[], map: DecisionMap): string {
  const entries: Array<[string, unknown]> = [];
  rows
    .slice()
    .sort((a, b) => a.row - b.row)
    .forEach((r) => {
      const d = map[r.row];
      if (!d) return;
      if (d.skip === true) {
        entries.push([String(r.row), { skip: true }]);
        return;
      }
      const out: RowDecision = {};
      if (d.printingId && findCandidate(r, d.printingId)) out.printingId = d.printingId;
      if (d.finish && catalogFinishAllowed(d.finish)) out.finish = d.finish;
      if (out.printingId || out.finish) entries.push([String(r.row), out]);
    });
  return jsonObject(entries);
}

function catalogFinishAllowed(finish: string): boolean {
  return FINISH_FALLBACK.some((f) => f.code === finish);
}

// ---------------------------------------------------------------------------
// Step D: confirm gating, merge wording, earlier batches
// ---------------------------------------------------------------------------

export type BlockerCode = 'NO_PREVIEW' | 'NO_ROWS' | 'MODE' | 'CONDITIONS' | 'BUSY';
export interface Blocker {
  code: BlockerCode;
  message: string;
}

export interface GateInput {
  preview: PreviewData | null;
  mode: IntakeMode | null;
  conditionChoices: ConditionChoices;
  busy: boolean;
}

export function importableRowCount(preview: PreviewData): number {
  return Math.max(0, preview.rowsTotal - preview.summary.errors - preview.summary.skipped);
}

/** Every reason Import is disabled, in the order the seller should fix them. Empty means the button is enabled. */
export function confirmBlockers(input: GateInput): Blocker[] {
  const out: Blocker[] = [];
  if (!input.preview) {
    out.push({ code: 'NO_PREVIEW', message: INTAKE_COPY.blockNothing });
    return out;
  }
  if (input.busy) out.push({ code: 'BUSY', message: INTAKE_COPY.blockBusy });
  if (importableRowCount(input.preview) <= 0) out.push({ code: 'NO_ROWS', message: INTAKE_COPY.blockNothing });
  const pending = pendingConditionLines(input.preview.conditionMapping, input.conditionChoices).length;
  if (pending > 0) out.push({ code: 'CONDITIONS', message: INTAKE_COPY.blockConditions(pending) });
  if (input.mode !== 'ADD' && input.mode !== 'REPLACE') out.push({ code: 'MODE', message: INTAKE_COPY.blockMode });
  return out;
}

export function canConfirm(input: GateInput): boolean {
  return confirmBlockers(input).length === 0;
}

export function modeExampleText(firstMerge: FirstMerge | null): string {
  if (!firstMerge) return INTAKE_COPY.modeNoExample;
  return INTAKE_COPY.modeExample(firstMerge.name || 'This card', firstMerge.existingStock, firstMerge.fileQuantity, firstMerge.addResult, firstMerge.replaceResult);
}

export type EarlierBatch = { kind: 'none' } | { kind: 'resume'; done: number; total: number } | { kind: 'completed'; summary: BatchSummary };

/** What the ledger already knows about this file with the chosen mode (preview.existingBatches). */
export function earlierBatchFor(preview: PreviewData, mode: IntakeMode | null): EarlierBatch {
  if (!mode) return { kind: 'none' };
  const b = preview.existingBatches[mode];
  if (!b) return { kind: 'none' };
  if (b.status === 'COMPLETED') return { kind: 'completed', summary: b };
  if (b.committedThroughRow <= 0) return { kind: 'none' };
  return { kind: 'resume', done: b.committedThroughRow, total: b.rowsTotal };
}

// ---------------------------------------------------------------------------
// Errors file and failures
// ---------------------------------------------------------------------------

/**
 * errors.csv = errorsCsvHeader + one csvLine per rowError (ADR-134 section 4.5 step 7). The server already escaped every
 * cell (formula-safe). A byte order mark is added so a spreadsheet app opens accented card names correctly; the importer
 * strips it, so the file can be fixed and imported unchanged.
 */
export function buildErrorsCsv(header: string, lines: readonly string[]): string {
  return '﻿' + header + '\n' + lines.join('\n') + (lines.length ? '\n' : '');
}

export interface IntakeFailure {
  kind: 'http' | 'network' | 'aborted';
  status: number | null;
  code: string;
  /** The server's own `error` text when it sent one, else our wording. */
  message: string;
  help: string;
  extra: Record<string, unknown> | null;
  /** Present on 409 ALREADY_APPLIED. */
  summary: BatchSummary | null;
}

function codeForStatus(status: number): string {
  if (status === 401) return 'SESSION_ENDED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'SALE_NOT_FOUND';
  if (status === 413) return 'FILE_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

/** Turns an HTTP failure into display values. Body shape from the backend: { success:false, error, code, ...extra }. */
export function failureFromResponse(status: number, body: unknown): IntakeFailure {
  const b = isRecord(body) ? body : null;
  const serverCode = b && typeof b.code === 'string' ? b.code : null;
  const serverText = b && typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : null;
  const code = serverCode || codeForStatus(status);
  const wording = wordingForError(code);
  let extra: Record<string, unknown> | null = null;
  if (b) {
    const rest: Record<string, unknown> = {};
    Object.keys(b).forEach((k) => {
      if (k !== 'success' && k !== 'error' && k !== 'code') rest[k] = b[k];
    });
    if (Object.keys(rest).length > 0) extra = rest;
  }
  return {
    kind: 'http',
    status,
    code,
    message: serverText || wording.message,
    help: wording.help,
    extra,
    summary: extra && isRecord(extra.summary) ? readBatch(extra.summary) : null,
  };
}

export function networkFailure(): IntakeFailure {
  const w = wordingForError('NETWORK_ERROR');
  return { kind: 'network', status: null, code: 'NETWORK_ERROR', message: w.message, help: w.help, extra: null, summary: null };
}

export function abortedFailure(): IntakeFailure {
  const w = wordingForError('CANCELLED');
  return { kind: 'aborted', status: null, code: 'CANCELLED', message: w.message, help: w.help, extra: null, summary: null };
}

/** Axios errors (the preview call) and fetch errors (the confirm call) both end up here. */
export function failureFromError(err: unknown): IntakeFailure {
  const e = err as { name?: string; code?: string; response?: { status?: number; data?: unknown } } | null;
  if (e && (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED')) return abortedFailure();
  if (e && e.response && typeof e.response.status === 'number') return failureFromResponse(e.response.status, e.response.data);
  return networkFailure();
}

/** Failures whose fix is a different file or different column choices, shown inline on the upload step. */
export function needsColumnChooser(code: string): boolean {
  return code === 'NO_NAME_COLUMN' || code === 'BAD_COLUMN_MAPPING';
}

// ---------------------------------------------------------------------------
// Remembered choices (a closed tab can pick up where it left off on the same device)
// ---------------------------------------------------------------------------

/**
 * Choices kept on this device per sale and file so a closed tab can pick up where it left off. The mode (add or replace) is
 * deliberately NOT kept: the seller chooses it every time (ADR-134 D12, no default).
 */
export interface SavedChoices {
  v: 1;
  priceSource: PriceSource | null;
  conditions: Record<string, string>;
  decisions: Record<string, RowDecision>;
}

export function savedChoicesKey(saleId: string, fileSha256: string): string {
  return 'fas-card-intake:' + saleId + ':' + fileSha256;
}

export function serializeSavedChoices(state: { priceSource: PriceSource | null; conditions: ConditionChoices; decisions: DecisionMap }): string {
  const decisions: Record<string, RowDecision> = {};
  Object.keys(state.decisions).forEach((k) => {
    decisions[k] = state.decisions[Number(k)];
  });
  return JSON.stringify({ v: 1, priceSource: state.priceSource, conditions: state.conditions, decisions });
}

export function parseSavedChoices(text: string | null | undefined): SavedChoices | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== 1) return null;
  const conditions: Record<string, string> = {};
  if (isRecord(raw.conditions)) {
    Object.keys(raw.conditions).forEach((k) => {
      const v = (raw.conditions as Record<string, unknown>)[k];
      if (typeof v === 'string') setKey(conditions, k, v);
    });
  }
  const decisions: Record<string, RowDecision> = {};
  if (isRecord(raw.decisions)) {
    Object.keys(raw.decisions).forEach((k) => {
      const v = (raw.decisions as Record<string, unknown>)[k];
      if (!/^\d{1,9}$/.test(k) || !isRecord(v)) return;
      const d: RowDecision = {};
      if (typeof v.printingId === 'string') d.printingId = v.printingId;
      if (typeof v.finish === 'string') d.finish = v.finish;
      if (v.skip === true) d.skip = true;
      decisions[k] = d;
    });
  }
  return {
    v: 1,
    priceSource: raw.priceSource === 'FILE' || raw.priceSource === 'NONE' ? raw.priceSource : null,
    conditions,
    decisions,
  };
}

/** Keeps only what still applies to this preview: known condition words, shown rows, offered printings. */
export function restoreChoices(
  saved: SavedChoices | null,
  preview: PreviewData
): { priceSource: PriceSource | null; conditions: ConditionChoices; decisions: DecisionMap } {
  const conditions = initialConditionChoices(preview.conditionMapping);
  const decisions: DecisionMap = {};
  if (!saved) return { priceSource: null, conditions, decisions };
  const validCodes = CONDITION_FALLBACK.map((c) => c.code);
  let nextConditions = conditions;
  preview.conditionMapping.forEach((line) => {
    const v = getKey(saved.conditions, conditionKey(line.sourceValue));
    if (v === undefined) return;
    if (v === BLANK_CHOICE || validCodes.indexOf(v) >= 0) nextConditions = setConditionChoice(nextConditions, line, v);
  });
  preview.reviewRows.forEach((row) => {
    const d = has(saved.decisions, String(row.row)) ? saved.decisions[String(row.row)] : undefined;
    if (!d) return;
    if (d.skip) {
      decisions[row.row] = { skip: true };
      return;
    }
    const out: RowDecision = {};
    if (d.printingId && findCandidate(row, d.printingId)) out.printingId = d.printingId;
    if (d.finish && finishOptionsForRow(row, out).indexOf(d.finish) >= 0) out.finish = d.finish;
    if (out.printingId || out.finish) decisions[row.row] = out;
  });
  return { priceSource: saved.priceSource, conditions: nextConditions, decisions };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function optionLabel(list: readonly VocabOption[], code: string | null | undefined): string {
  if (!code) return '';
  const hit = list.filter((e) => e.code === code)[0];
  return hit ? hit.label : code;
}

/** "Set name (CODE) #12, 2019" with whatever parts exist. */
export function candidateTitle(c: Candidate): string {
  const set = c.setName ? c.setName + (c.setCode ? ' (' + c.setCode.toUpperCase() + ')' : '') : c.setCode ? c.setCode.toUpperCase() : 'Unknown set';
  const num = c.collectorNumber ? ' #' + c.collectorNumber : '';
  const year = c.releaseYear ? ', ' + c.releaseYear : '';
  return set + num + year;
}

export function reviewRowsByReason(rows: readonly ReviewRow[], reason: ReviewReason): ReviewRow[] {
  return rows.filter((r) => r.reason === reason);
}
