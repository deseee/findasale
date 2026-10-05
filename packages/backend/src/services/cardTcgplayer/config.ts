/**
 * TCGplayer round trip switches and limits (ADR-137, roadmap #660). Every function reads the environment when
 * CALLED, never at import time, so a test can pass its own env object.
 *
 * The round trip needs BOTH flags: the existing card catalog flag (CARD_CATALOG_ENABLED, ADR-134, already on in
 * production) and its own flag, CARD_TCGPLAYER_SYNC_ENABLED, which defaults to off. With either one off every route
 * here answers "not available" and nothing is read or written.
 */
import { isCatalogEnabled } from '../cardCatalog/catalogConfig';
import type { EnvLike } from '../cardIntake/config';

export const TCGPLAYER_SYNC_FLAG = 'CARD_TCGPLAYER_SYNC_ENABLED';

export function isTcgplayerSyncEnabled(env: EnvLike = process.env): boolean {
  const raw = (env[TCGPLAYER_SYNC_FLAG] ?? '').trim().toLowerCase();
  const on = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  return on && isCatalogEnabled(env);
}

/** Items read per database page when a sale's card stock is loaded. */
export const LOAD_PAGE_SIZE = 2000;
/** Item ids sent in one database update when pending or baseline values are saved. */
export const WRITE_CHUNK_SIZE = 1000;
/** Cards listed in one response (counts are always complete, lists are capped). */
export const LIST_CAP = 500;
/** File problems listed in one response (the count is complete). */
export const PROBLEM_SAMPLE_CAP = 200;
/** Item ids accepted by one register check. */
export const REGISTER_CHECK_MAX_ITEMS = 100;
/** Largest quantity a TCGplayer file row may carry (same ceiling as the card intake). */
export const MAX_FILE_QUANTITY = 10000;
/** Time allowed for one card's database transaction during a reconcile. */
export const GROUP_TX_TIMEOUT_MS = 15000;
