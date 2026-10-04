/**
 * Shared types for the card catalog data layer (ADR-134 section 3, batch B3).
 * Pure type declarations: no runtime code, no imports with side effects.
 */

export type CatalogGame = 'MTG' | 'POKEMON' | 'YUGIOH';
export type CatalogSourceId = 'SCRYFALL' | 'TCGCSV';

/** Values stored in CardDataSource.lastStatus. */
export type RunStatus = 'OK' | 'FAILED' | 'SKIPPED_UNCHANGED' | 'SKIPPED_DB_SPACE';

/** One row of the CardPrinting table (id encodes the source: 'SCRYFALL:<uuid>' or 'TCGCSV:<productId>'). */
export interface PrintingRow {
  id: string;
  source: CatalogSourceId;
  game: CatalogGame;
  name: string;
  nameNorm: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  rarity: string | null;
  releaseYear: number | null;
  finishes: string[];
  scryfallId: string | null;
  tcgplayerProductId: number | null;
  cardmarketId: number | null;
  imageSmallUrl: string | null;
  imageNormalUrl: string | null;
}

/** One row of the CardPrice table. Prices are decimal strings with two places ('0.25') or null. */
export interface PriceRow {
  printingId: string;
  usd: string | null;
  usdFoil: string | null;
  usdEtched: string | null;
  usdReverse: string | null;
  asOf: Date;
}

export interface FinishUpdate {
  id: string;
  finishes: string[];
}

/** Mirror of the CardDataSource model (schema.prisma). */
export interface SourceState {
  source: CatalogSourceId;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  sourceVersion: string | null;
  rowsUpserted: number;
  consecutiveFailures: number;
}

export interface RunRecord {
  status: RunStatus;
  now: Date;
  error?: string | null;
  /** Only meaningful for OK and SKIPPED_UNCHANGED. */
  sourceVersion?: string | null;
  rowsUpserted?: number;
}

/**
 * Persistence boundary of the ingest jobs. The default implementation (catalogStore.ts) talks to
 * Postgres; tests inject an in-memory implementation.
 *
 * upsertPrintings, upsertPrices and updateFinishes return the number of rows that were actually
 * inserted or changed. A row whose values are identical to what is stored is NOT rewritten
 * (no dead-tuple churn), so a repeat run over identical data returns 0.
 */
export interface CatalogStore {
  /** Current database size in megabytes, or null when it cannot be measured. */
  getDbSizeMb(): Promise<number | null>;
  upsertPrintings(rows: PrintingRow[]): Promise<number>;
  upsertPrices(rows: PriceRow[]): Promise<number>;
  updateFinishes(rows: FinishUpdate[]): Promise<number>;
  getSource(source: CatalogSourceId): Promise<SourceState | null>;
  /** Records the outcome of a run and returns the resulting consecutiveFailures. */
  recordRun(source: CatalogSourceId, record: RunRecord): Promise<{ consecutiveFailures: number }>;
  /** Distinct lower-cased setCodes that already have TCGCSV printings for a game. */
  loadedSetCodes(game: CatalogGame): Promise<Set<string>>;
}

export interface IngestResult {
  source: CatalogSourceId;
  status: RunStatus | 'DISABLED';
  rowsRead: number;
  rowsSkipped: number;
  printingsChanged: number;
  pricesChanged: number;
  error?: string;
  consecutiveFailures?: number;
  detail?: Record<string, unknown>;
}
