/**
 * cardCatalogRefreshCron.ts -- daily refresh of the free card catalog (ADR-134 section 3.3, batch B3).
 *
 * Exports two schedule functions. NOTHING is registered at import time: the wiring batch (B9)
 * calls them from index.ts next to scheduleQuotaResetCron().
 *
 *   scheduleCardCatalogScryfallRefresh  06:23 UTC daily  MTG, Scryfall default_cards bulk file
 *   scheduleCardCatalogTcgcsvRefresh    21:10 UTC daily  Pokemon and Yu-Gi-Oh, after TCGCSV's ~20:00 UTC publish
 *
 * Both jobs exit immediately unless CARD_CATALOG_ENABLED is true (read when the job RUNS, not at
 * import). The TCGCSV job additionally does nothing unless CARD_CATALOG_GAMES lists POKEMON or
 * YUGIOH (legal decision D2). Failures never throw: they are recorded in CardDataSource and a
 * Sentry warning is raised after three in a row. The jobs only upsert, so a failed run leaves the
 * previous rows serving. See services/cardCatalog/ for the ingest rules.
 */
import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { EnvLike, isCatalogEnabled } from '../services/cardCatalog/catalogConfig';
import { runScryfallIngest } from '../services/cardCatalog/scryfallIngest';
import { runTcgcsvIngest } from '../services/cardCatalog/tcgcsvIngest';
import type { IngestResult } from '../services/cardCatalog/types';

export const CARD_CATALOG_SCRYFALL_CRON = '23 6 * * *';
export const CARD_CATALOG_TCGCSV_CRON = '10 21 * * *';

export interface CardCatalogJobDeps {
  env?: EnvLike;
  runScryfall?: () => Promise<IngestResult>;
  runTcgcsv?: () => Promise<IngestResult>;
}

/** One Scryfall run, or null when the catalog is disabled. Exported for tests and manual runs. */
export async function runCardCatalogScryfallJob(deps: CardCatalogJobDeps = {}): Promise<IngestResult | null> {
  if (!isCatalogEnabled(deps.env ?? process.env)) return null;
  return (deps.runScryfall ?? (() => runScryfallIngest()))();
}

/** One TCGCSV run, or null when the catalog is disabled. The ingest itself returns DISABLED when no TCG game is enabled. */
export async function runCardCatalogTcgcsvJob(deps: CardCatalogJobDeps = {}): Promise<IngestResult | null> {
  if (!isCatalogEnabled(deps.env ?? process.env)) return null;
  return (deps.runTcgcsv ?? (() => runTcgcsvIngest()))();
}

export function scheduleCardCatalogScryfallRefresh(): void {
  cron.schedule(
    CARD_CATALOG_SCRYFALL_CRON,
    cronGuard({ jobName: 'cardCatalogScryfallRefresh' }, async () => {
      await runCardCatalogScryfallJob();
    }),
  );
  console.log(`[card-catalog-cron] Scheduled Scryfall refresh (${CARD_CATALOG_SCRYFALL_CRON} UTC); runs only when CARD_CATALOG_ENABLED=true`);
}

export function scheduleCardCatalogTcgcsvRefresh(): void {
  cron.schedule(
    CARD_CATALOG_TCGCSV_CRON,
    cronGuard({ jobName: 'cardCatalogTcgcsvRefresh' }, async () => {
      await runCardCatalogTcgcsvJob();
    }),
  );
  console.log(`[card-catalog-cron] Scheduled TCGCSV refresh (${CARD_CATALOG_TCGCSV_CRON} UTC); runs only when CARD_CATALOG_ENABLED=true and CARD_CATALOG_GAMES lists POKEMON or YUGIOH`);
}
