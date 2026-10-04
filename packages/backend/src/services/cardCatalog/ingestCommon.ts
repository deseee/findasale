/**
 * Pieces shared by the Scryfall and TCGCSV ingest jobs: dependency resolution, the database-space
 * guard, failure bookkeeping and alerting. No top-level env reads and no network calls.
 */
import * as Sentry from '@sentry/node';
import type { CatalogSourceId, CatalogStore, IngestResult } from './types';
import { EnvLike, getDbSoftLimitMb } from './catalogConfig';
import { HttpGet, RateLimitedError } from './httpClient';
import { truncate } from './normalize';

export interface IngestDeps {
  store: CatalogStore;
  httpGet: HttpGet;
  now: () => Date;
  env: EnvLike;
  /** Raises an operator alert (Sentry warning by default). Must never throw. */
  alert: (message: string) => void;
  /** Waits between TCGCSV requests (tests replace it with a recorder). */
  sleep: (ms: number) => Promise<void>;
}

/** Sentry warning; swallows any failure because Sentry may not be initialised (same pattern as cronGuard). */
export function defaultAlert(message: string): void {
  try {
    Sentry.captureMessage(message, 'warning');
  } catch {
    // Sentry not ready: nothing else to do.
  }
}

export const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function emptyResult(source: CatalogSourceId): IngestResult {
  return { source, status: 'OK', rowsRead: 0, rowsSkipped: 0, printingsChanged: 0, pricesChanged: 0 };
}

/**
 * Database-space guard (ADR section 3.2): when pg_database_size exceeds DB_SOFT_LIMIT_MB the run is
 * skipped before any network call, recorded as SKIPPED_DB_SPACE and alerted. Returns the finished
 * result when the run must stop, or null when there is room.
 */
export async function checkDbSpaceOrSkip(source: CatalogSourceId, deps: IngestDeps): Promise<IngestResult | null> {
  const limitMb = getDbSoftLimitMb(deps.env);
  const sizeMb = await deps.store.getDbSizeMb();
  if (sizeMb === null || sizeMb <= limitMb) return null;
  const message = `Card catalog ${source} refresh skipped: database is ${Math.round(sizeMb)} MB, above DB_SOFT_LIMIT_MB=${limitMb}`;
  await deps.store.recordRun(source, { status: 'SKIPPED_DB_SPACE', now: deps.now(), error: truncate(message, 500) });
  deps.alert(message);
  return { ...emptyResult(source), status: 'SKIPPED_DB_SPACE', error: message };
}

/**
 * Records a failed run (previous rows stay untouched: the jobs never delete), raises an alert at
 * three consecutive failures, and returns the result object. Never throws.
 */
export async function failRun(source: CatalogSourceId, deps: IngestDeps, err: unknown, partial: IngestResult): Promise<IngestResult> {
  const raw = err instanceof Error ? err.message : String(err);
  const message = err instanceof RateLimitedError ? `${raw} (stopped, no retry; next run is the next scheduled day)` : raw;
  const result: IngestResult = { ...partial, status: 'FAILED', error: truncate(message, 500) };
  try {
    const { consecutiveFailures } = await deps.store.recordRun(source, { status: 'FAILED', now: deps.now(), error: result.error });
    result.consecutiveFailures = consecutiveFailures;
    if (consecutiveFailures >= 3) {
      deps.alert(`Card catalog ${source} refresh has failed ${consecutiveFailures} times in a row: ${result.error}`);
    }
  } catch (recordErr) {
    console.error(`[card-catalog] could not record ${source} failure:`, recordErr instanceof Error ? recordErr.message : recordErr);
  }
  console.error(`[card-catalog] ${source} refresh FAILED: ${result.error}`);
  return result;
}
