/**
 * Price book switches and limits (ADR-140 section 13.1). Every function reads the environment object it is GIVEN, so
 * importing this module has no side effects and a test can pass its own object. Callers pass process.env.
 */
import type { EnvLike } from './types';

export type { EnvLike };

export const DEFAULT_PREVIEW_MINUTES = 30;
export const DEFAULT_UNDO_DAYS = 7;
export const DEFAULT_MAX_RUN_ITEMS = 5000;
export const DEFAULT_HISTORY_DAYS = 90;

/** The one switch that governs every use of catalog price numbers (ADR-140 section 12.2). */
export const CATALOG_SWITCH_NAME = 'CARD_CATALOG_PRICE_REFERENCE_ENABLED';

const ON_WORDS = ['true', '1', 'yes', 'on'];
const OFF_WORDS = ['false', '0', 'no', 'off'];

/** True for true, 1, yes, on (any case). Anything else, including unset, is false. */
export function flagOn(raw: string | undefined): boolean {
  return ON_WORDS.includes((raw ?? '').trim().toLowerCase());
}

/** A switch that is on unless it is set to false, 0, no or off. Unset means on. */
export function switchOnUnlessOff(raw: string | undefined): boolean {
  return !OFF_WORDS.includes((raw ?? '').trim().toLowerCase());
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export interface PriceBookConfig {
  /** CARD_PRICE_BOOK_ENABLED, default false. */
  enabled: boolean;
  /** CARD_CATALOG_PRICE_REFERENCE_ENABLED, default true (unset means on, so nothing changes silently). */
  catalogReferenceEnabled: boolean;
  previewMinutes: number;
  undoDays: number;
  maxRunItems: number;
  historyDays: number;
}

export function isPriceBookEnabled(env: EnvLike): boolean {
  return flagOn(env.CARD_PRICE_BOOK_ENABLED);
}

export function isCatalogPriceReferenceEnabled(env: EnvLike): boolean {
  return switchOnUnlessOff(env[CATALOG_SWITCH_NAME]);
}

export function getPriceBookConfig(env: EnvLike): PriceBookConfig {
  return {
    enabled: isPriceBookEnabled(env),
    catalogReferenceEnabled: isCatalogPriceReferenceEnabled(env),
    previewMinutes: positiveInt(env.CARD_PRICE_BOOK_RUN_PREVIEW_MINUTES, DEFAULT_PREVIEW_MINUTES),
    undoDays: positiveInt(env.CARD_PRICE_BOOK_UNDO_DAYS, DEFAULT_UNDO_DAYS),
    maxRunItems: positiveInt(env.CARD_PRICE_BOOK_MAX_RUN_ITEMS, DEFAULT_MAX_RUN_ITEMS),
    historyDays: positiveInt(env.CARD_PRICE_BOOK_HISTORY_DAYS, DEFAULT_HISTORY_DAYS),
  };
}
