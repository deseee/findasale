/**
 * Shared types for the spreadsheet-first card intake (ADR-134 #642, batch B4).
 * Type declarations and plain constants only: no env reads, no imports with side effects.
 */
import type { CardCreateData } from '../cardRecordService';

export const INTAKE_MODES = ['ADD', 'REPLACE'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export const PRICE_SOURCES = ['FILE', 'NONE'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const IMPORTER_IDS = ['manabox', 'moxfield', 'tcgplayer_seller', 'tcgplayer_app', 'generic'] as const;
export type ImporterId = (typeof IMPORTER_IDS)[number];

/** Canonical fields an importer can read from a spreadsheet row. Maps field -> source header. */
export const SOURCE_FIELDS = [
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
  'scryfallId',
  'tcgplayerProductId',
  'cost',
  'costCurrency',
  'game',
  'rarity',
  'grader',
  'grade',
  'certNumber',
] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];
export type ColumnMapping = Partial<Record<SourceField, string>>;

/** One spreadsheet record as read from the file: original header -> cell text. */
export type SourceRecord = Record<string, string>;

/** Row-level error codes (ADR-134 section 4.8, plus the codes added by B4, see report). */
export const ROW_ERROR_CODES = [
  'MISSING_NAME',
  'BAD_QUANTITY',
  'BAD_PRICE',
  'AMBIGUOUS_PRINTING',
  'UNKNOWN_FINISH',
  'CONDITION_UNMAPPED',
  'SKU_CONFLICT',
  'GRADED_MISSING_GRADE',
  'CERT_TOO_LONG',
  'ROW_TOO_LONG',
  'INVALID_DECISION',
  'INVALID_CARD_DATA',
] as const;
export type RowErrorCode = (typeof ROW_ERROR_CODES)[number];

export interface RowErrorInfo {
  code: RowErrorCode;
  field: string | null;
  message: string;
}

/** Why a row needs the seller's attention. NO_CATALOG_MATCH rows still import with the file's details. */
export type ReviewReason = 'AMBIGUOUS_PRINTING' | 'NO_CATALOG_MATCH' | 'FINISH_AMBIGUOUS';

export interface CandidateDto {
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

/** Seller decision for one row (confirm body, keyed by row number). */
export interface RowDecision {
  printingId?: string;
  finish?: string;
  skip?: boolean;
}

export type ResolutionStatus = 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';

/** The normalized, validated view of one spreadsheet row, ready for grouping and writing. */
export interface PlannedRow {
  row: number;
  /** OK rows are written; SKIP rows were skipped by the seller; ERROR rows are reported and never written. */
  status: 'OK' | 'SKIP' | 'ERROR';
  error?: RowErrorInfo;
  resolution: ResolutionStatus;
  review: ReviewReason | null;
  noCatalogMatch: boolean;
  candidates: CandidateDto[];
  truncatedCandidates: boolean;
  /** Final card columns for an OK row (as cardRecordService produced them, plus the intake overrides). */
  card?: CardCreateData;
  dedupKey?: string;
  quantity: number;
  price: number | null;
  costBasis: number | null;
  sku: string | null;
  warnings: string[];
  source: SourceRecord;
  /** Display values for the review screen. */
  display: { name: string; setCode: string | null; collectorNumber: string | null };
}

export interface IntakeSummary {
  rowsTotal: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  noCatalogMatch: number;
  needsPrice: number;
  warnings: Record<string, number>;
}
