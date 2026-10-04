/**
 * Intake limits and switches (ADR-134 sections 4.3 and 13.1). Every function reads the environment
 * when CALLED, never at import time, so importing this module has no side effects and a test can
 * pass its own env object.
 */
import { getDbSoftLimitMb } from '../cardCatalog/catalogConfig';

export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_MAX_ROWS = 20000;
export const DEFAULT_MAX_FILE_MB = 50;
/** Measured Item size per row (ADR-134 section 4.3, db-space-accounting-2026-08-09.md). */
export const ITEM_BYTES_PER_ROW = 6144;
export const MAX_QUANTITY = 10000;
export const CHUNK_SIZE = 100;
export const RESOLVE_BATCH_SIZE = 500;
/**
 * Preview lists at most this many rows that NEED a choice (several printings, or a finish to pick). Rows with no
 * catalog match never use this list: they are imported with the file's own details whether or not anyone looks at them.
 */
export const REVIEW_ROWS_CAP = 500;
/** Preview sends this many example rows with no catalog match, next to the full count. */
export const NO_CATALOG_SAMPLE_CAP = 20;
export const ERROR_SAMPLE_CAP = 200;
export const PREVIEW_ERROR_SAMPLE_CAP = 200;
export const MAX_ROW_CHARS = 8000;
export const CHUNK_TX_TIMEOUT_MS = 30000;
export const STALE_TEMP_FILE_MS = 60 * 60 * 1000;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export interface IntakeConfig {
  maxRows: number;
  maxFileBytes: number;
  dbSoftLimitMb: number;
}

export function getIntakeConfig(env: EnvLike = process.env): IntakeConfig {
  return {
    maxRows: positiveInt(env.CARD_INTAKE_MAX_ROWS, DEFAULT_MAX_ROWS),
    maxFileBytes: positiveInt(env.CARD_INTAKE_MAX_FILE_MB, DEFAULT_MAX_FILE_MB) * 1024 * 1024,
    dbSoftLimitMb: getDbSoftLimitMb(env),
  };
}
