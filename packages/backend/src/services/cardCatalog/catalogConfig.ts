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
 * Own switch for the TCGdex Pokemon identity ingest. Defaults to false and is separate from
 * CARD_CATALOG_ENABLED: Pokemon is served only when BOTH are on. With this off nothing about
 * Pokemon is reachable (no ingest, no lookup, no listing as an enabled game).
 */
export function isTcgdexEnabled(env: EnvLike = process.env): boolean {
  const raw = (env.CARD_CATALOG_TCGDEX_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/** True only when the master catalog switch and the TCGdex switch are both on. */
export function isPokemonServable(env: EnvLike = process.env): boolean {
  return isCatalogEnabled(env) && isTcgdexEnabled(env);
}

/**
 * Games the catalog serves. Default is MTG only (Scryfall). POKEMON is stripped from
 * CARD_CATALOG_GAMES unless CARD_CATALOG_TCGDEX_ENABLED is on (the TCGCSV route to Pokemon is
 * closed for good: TCGplayer's terms bar combining its data with others). With the TCGdex switch
 * on, POKEMON is enabled even when it is not listed, because the switch is its opt-in. YUGIOH
 * (TCGCSV) still waits on legal decision D2 and must be listed explicitly.
 */
export function getEnabledGames(env: EnvLike = process.env): CatalogGame[] {
  const raw = (env.CARD_CATALOG_GAMES ?? '').trim();
  const listed: CatalogGame[] = [];
  if (raw) {
    for (const part of raw.split(',')) {
      const g = part.trim().toUpperCase() as CatalogGame;
      if (CATALOG_GAMES.includes(g) && !listed.includes(g)) listed.push(g);
    }
  }
  const allowed = isTcgdexEnabled(env) ? listed : listed.filter((g) => g !== 'POKEMON');
  const out: CatalogGame[] = allowed.length > 0 ? allowed : ['MTG'];
  if (isTcgdexEnabled(env) && !out.includes('POKEMON')) out.push('POKEMON');
  return out;
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

// ---------------------------------------------------------------------------------------------
// TCGdex (Pokemon identity) settings
// ---------------------------------------------------------------------------------------------

export const TCGDEX_REPO_OWNER = 'tcgdex';
export const TCGDEX_REPO_NAME = 'cards-database';
/**
 * Commit of github.com/tcgdex/cards-database the ingest reads by default (master as seen on
 * 2026-10-12, confirmed to exist). Override with CARD_CATALOG_TCGDEX_REF (a 40 character commit
 * id or a tag); a moving branch name is refused so a run is always reproducible.
 */
export const TCGDEX_PINNED_REF = '4199850a6af49665db0080fa2bb9ef751750a406';

/** TCGdex language codes the ingest accepts. Dutch, Polish, Indonesian and Thai are left out: the card vocabulary has no code for them. */
export const TCGDEX_LANGUAGE_CODES: readonly string[] = [
  'en', 'fr', 'es', 'es-mx', 'it', 'pt', 'pt-br', 'pt-pt', 'de', 'ru', 'ja', 'ko', 'zh-tw', 'zh-cn',
];
/** Languages whose files live under data-asia/ in the repository (the rest live under data/). */
export const TCGDEX_ASIAN_LANGUAGE_CODES: readonly string[] = ['ja', 'ko', 'zh-tw', 'zh-cn'];
export const TCGDEX_DEFAULT_LANGUAGES: readonly string[] = ['en'];

/** CARD_CATALOG_TCGDEX_LANGUAGES: comma separated TCGdex codes, default English only. Unknown codes are dropped. */
export function getTcgdexLanguages(env: EnvLike = process.env): string[] {
  const raw = (env.CARD_CATALOG_TCGDEX_LANGUAGES ?? '').trim();
  const out: string[] = [];
  if (raw) {
    for (const part of raw.split(',')) {
      const code = part.trim().toLowerCase();
      if (TCGDEX_LANGUAGE_CODES.includes(code) && !out.includes(code)) out.push(code);
    }
  }
  return out.length > 0 ? out : Array.from(TCGDEX_DEFAULT_LANGUAGES);
}

export function getTcgdexRef(env: EnvLike = process.env): string {
  const raw = (env.CARD_CATALOG_TCGDEX_REF ?? '').trim();
  return raw || TCGDEX_PINNED_REF;
}

const MOVING_REF_NAMES = ['master', 'main', 'head', 'develop', 'dev', 'trunk'];

/** A commit id or a tag-like name; never a moving branch name. */
export function isAcceptableTcgdexRef(ref: string): boolean {
  if (/^[0-9a-f]{40}$/i.test(ref)) return true;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(ref)) return false;
  return !MOVING_REF_NAMES.includes(ref.toLowerCase());
}
