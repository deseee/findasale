/**
 * Environment-driven configuration for the card catalog (ADR-134 section 13.1, plus the
 * orchestrator override of 2026-10-03 for DB_SOFT_LIMIT_MB).
 *
 * Every function reads the environment when CALLED (never at import time), so importing this
 * module has no side effects and tests can pass their own env object.
 */
import type { CatalogGame } from './types';

export type EnvLike = Record<string, string | undefined>;

/** Orchestrator override: 4000, not the ADR's stale 900 (live DB about 1.4 GB of a 4.88 GB volume on 2026-10-03). */
export const DEFAULT_DB_SOFT_LIMIT_MB = 4000;
export const DEFAULT_PRICE_STALE_HOURS = 48;
export const DEFAULT_USER_AGENT = 'FindASale/1.0 (card catalog)';

export const CATALOG_GAMES: readonly CatalogGame[] = ['MTG', 'POKEMON', 'YUGIOH'];

/** TCGCSV (tcgcsv.com/tcgplayer) category ids, verified against /tcgplayer/categories on 2026-10-03. */
export const TCGCSV_CATEGORY_IDS: Record<'POKEMON' | 'YUGIOH', number> = {
  POKEMON: 3,
  YUGIOH: 2,
};

/** Master switch. Defaults to false: with it off no job runs and every route answers catalogReady:false. */
export function isCatalogEnabled(env: EnvLike = process.env): boolean {
  const raw = (env.CARD_CATALOG_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/**
 * Games the catalog serves. Default is MTG only (Scryfall); Pokemon and Yu-Gi-Oh (TCGCSV) must be
 * listed explicitly, which waits on legal decision D2.
 */
export function getEnabledGames(env: EnvLike = process.env): CatalogGame[] {
  const raw = (env.CARD_CATALOG_GAMES ?? '').trim();
  if (!raw) return ['MTG'];
  const out: CatalogGame[] = [];
  for (const part of raw.split(',')) {
    const g = part.trim().toUpperCase() as CatalogGame;
    if (CATALOG_GAMES.includes(g) && !out.includes(g)) out.push(g);
  }
  return out.length > 0 ? out : ['MTG'];
}

export function getUserAgent(env: EnvLike = process.env): string {
  const raw = (env.CARD_DATA_USER_AGENT ?? '').trim();
  return raw || DEFAULT_USER_AGENT;
}

export function getDbSoftLimitMb(env: EnvLike = process.env): number {
  const n = Number((env.DB_SOFT_LIMIT_MB ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DB_SOFT_LIMIT_MB;
}

export function getPriceStaleHours(env: EnvLike = process.env): number {
  const n = Number((env.CARD_PRICE_STALE_HOURS ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE_STALE_HOURS;
}
