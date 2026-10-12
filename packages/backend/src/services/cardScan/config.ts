/**
 * Card scan limits and switches (ADR-138 sections 3.5, 9, 11 and 18). Every function reads the environment
 * when CALLED, never at import time, so importing this module has no side effects and a test can pass its
 * own env object (the same pattern as cardIntake/config.ts).
 */
import type { EnvLike } from '../cardCatalog/catalogConfig';

export type { EnvLike };

export const DEFAULT_DAILY_CAP = 3000;
export const DEFAULT_MONTHLY_CEILING_USD = 15;
export const DEFAULT_MAX_ENTRIES = 2000;
export const DEFAULT_MAX_FRAME_KB = 1536;
export const DEFAULT_DUP_WINDOW_MS = 3000;
export const DEFAULT_INGEST_MAX_CARDS = 5;

/** Fixed limits (not environment driven). */
export const MAX_OPEN_SESSIONS_PER_SALE = 5;
export const MAX_BULK_IDS = 200;
export const MAX_PAGE_ENTRIES = 200;
export const SESSION_LABEL_MAX_CHARS = 60;
export const MAX_CANDIDATES = 5;
/** A frame may be re-read once for the same placement when the first reading found nothing usable. */
export const MAX_PLACEMENT_ATTEMPTS = 2;
export const OPEN_SESSION_IDLE_DAYS = 30;
export const CLOSED_SESSION_RETENTION_DAYS = 14;

export type ScanMode = 'HAIKU_ONLY' | 'OCR_PLUS_HAIKU';

function flag(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface ScanConfig {
  /** Master switch for the frame route. Manual add, edits and commit stay available when it is off. */
  enabled: boolean;
  /** Provider id as configured (lower case). The provider registry fails closed on a value it does not know. */
  provider: string;
  mode: ScanMode;
  dailyCap: number;
  monthlyCeilingUsd: number;
  maxEntries: number;
  maxFrameBytes: number;
  dupWindowMs: number;
  ingestEnabled: boolean;
  ingestMaxCards: number;
}

export function getScanConfig(env: EnvLike = process.env): ScanConfig {
  const provider = (env.CARD_SCAN_PROVIDER ?? '').trim().toLowerCase();
  const mode: ScanMode = (env.CARD_SCAN_MODE ?? '').trim().toUpperCase() === 'OCR_PLUS_HAIKU' ? 'OCR_PLUS_HAIKU' : 'HAIKU_ONLY';
  return {
    enabled: flag(env.CARD_SCAN_ENABLED),
    provider: provider || 'haiku-card',
    mode,
    dailyCap: positiveInt(env.CARD_SCAN_DAILY_CAP, DEFAULT_DAILY_CAP),
    monthlyCeilingUsd: positiveNumber(env.CARD_SCAN_MONTHLY_CEILING_USD, DEFAULT_MONTHLY_CEILING_USD),
    maxEntries: positiveInt(env.CARD_SCAN_MAX_ENTRIES, DEFAULT_MAX_ENTRIES),
    maxFrameBytes: positiveInt(env.CARD_SCAN_MAX_FRAME_KB, DEFAULT_MAX_FRAME_KB) * 1024,
    dupWindowMs: positiveInt(env.CARD_SCAN_DUP_WINDOW_MS, DEFAULT_DUP_WINDOW_MS),
    ingestEnabled: flag(env.CARD_SCAN_INGEST_ENABLED),
    ingestMaxCards: positiveInt(env.CARD_SCAN_INGEST_MAX_CARDS, DEFAULT_INGEST_MAX_CARDS),
  };
}
