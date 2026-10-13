/**
 * cardCatalogRefreshCron.ts -- daily refresh of the free card catalog (ADR-134 section 3.3, batch B3).
 *
 * Exports three schedule functions. NOTHING is registered at import time: the wiring batch (B9)
 * calls them from index.ts next to scheduleQuotaResetCron().
 *
 *   scheduleCardCatalogScryfallRefresh  06:23 UTC daily  MTG, Scryfall default_cards bulk file
 *   scheduleCardCatalogTcgcsvRefresh    21:10 UTC daily  Yu-Gi-Oh (Pokemon is no longer read from TCGCSV), after TCGCSV's ~20:00 UTC publish
 *   scheduleCardCatalogTcgdexRefresh    07:41 UTC daily  Pokemon identity from the pinned TCGdex archive (downloads only when the pinned ref or languages changed)
 *
 * Both jobs exit immediately unless CARD_CATALOG_ENABLED is true (read when the job RUNS, not at
 * import). The TCGCSV job additionally does nothing unless CARD_CATALOG_GAMES lists YUGIOH (legal
 * decision D2). The TCGdex job runs only when CARD_CATALOG_TCGDEX_ENABLED is ALSO true.
 * Failures never throw: they are recorded in CardDataSource and a Sentry warning is raised after
 * three in a row. The jobs only upsert, so a failed run leaves the previous rows serving. See
 * services/cardCatalog/ for the ingest rules.
 */
import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { EnvLike, isCatalogEnabled, isTcgdexEnabled } from '../services/cardCatalog/catalogConfig';
import { runScryfallIngest } from '../services/cardCatalog/scryfallIngest';
import { runTcgcsvIngest } from '../services/cardCatalog/tcgcsvIngest';
import { runTcgdexIngest } from '../services/cardCatalog/tcgdexIngest';
import type { IngestResult } from '../services/cardCatalog/types';

export const CARD_CATALOG_SCRYFALL_CRON = '23 6 * * *';
export const CARD_CATALOG_TCGCSV_CRON = '10 21 * * *';
export const CARD_CATALOG_TCGDEX_CRON = '41 7 * * *';

export interface CardCatalogJobDeps {
  env?: EnvLike;
  runScryfall?: () => Promise<IngestResult>;
  runTcgcsv?: () => Promise<IngestResult>;
  runTcgdex?: () => Promise<IngestResult>;
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

/** One TCGdex run, or null unless BOTH CARD_CATALOG_ENABLED and CARD_CATALOG_TCGDEX_ENABLED are true. */
export async function runCardCatalogTcgdexJob(deps: CardCatalogJobDeps = {}): Promise<IngestResult | null> {
  const env = deps.env ?? process.env;
  if (!isCatalogEnabled(env) || !isTcgdexEnabled(env)) return null;
  return (deps.runTcgdex ?? (() => runTcgdexIngest()))();
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
  console.log(`[card-catalog-cron] Scheduled TCGCSV refresh (${CARD_CATALOG_TCGCSV_CRON} UTC); runs only when CARD_CATALOG_ENABLED=true and CARD_CATALOG_GAMES lists YUGIOH`);
}

export function scheduleCardCatalogTcgdexRefresh(): void {
  cron.schedule(
    CARD_CATALOG_TCGDEX_CRON,
    cronGuard({ jobName: 'cardCatalogTcgdexRefresh' }, async () => {
      await runCardCatalogTcgdexJob();
    }),
  );
  console.log(`[card-catalog-cron] Scheduled TCGdex refresh (${CARD_CATALOG_TCGDEX_CRON} UTC); runs only when CARD_CATALOG_ENABLED=true and CARD_CATALOG_TCGDEX_ENABLED=true`);
}
