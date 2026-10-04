/**
 * etsyDraftSweep.ts -- resume Etsy drafts whose worker died (ADR-135 D2.3 step 5, batch E-B4 addendum a).
 *
 * runEtsyDraftWorker (etsyConnector.ts) takes NO claim of its own: it reads the row and goes. So two
 * sweeps (two replicas, or a sweep racing a restart) could both start it for the same row, creating two
 * Etsy drafts. This sweep is therefore the claim point:
 *   1. Find DRAFT_PENDING rows idle longer than ETSY_DRAFT_IDLE_MS (exported by etsyConnector), oldest
 *      first, at most ETSY_DRAFT_SWEEP_MAX_PER_RUN per run.
 *   2. Claim each with ONE conditional updateMany: where id, state DRAFT_PENDING and updatedAt equal to
 *      the value just read. The change itself is harmless (it clears lastErrorMessage and moves
 *      updatedAt to now), but it is what makes the claim exclusive: the first sweeper moves updatedAt,
 *      so a second sweeper that read the old value matches zero rows. A live worker also moves updatedAt
 *      with every step it records, so the next sweep leaves a worker that is making progress alone.
 *   3. Only when the claim count is exactly 1 does the worker run. Rows are processed one at a time.
 * Switched off (ETSY_CONNECTOR_ENABLED or ETSY_PUSH_ENABLED not 'true'): rows are left untouched so
 * they resume when the switch is back on; the worker would answer 'skipped' anyway. Never throws.
 *
 * Called from jobs/etsySoldSyncCron.ts on every tick (every 15 minutes), so no separate cron exists.
 * Known limit: a worker that makes no recorded progress for longer than ETSY_DRAFT_IDLE_MS while still
 * alive (a very slow Etsy) can be resumed in parallel; the resume path asks Etsy how many images exist
 * before uploading, which keeps the damage to at most one duplicate image.
 *
 * Import safety: no env reads, network or database access at module load.
 */

import { ETSY_DRAFT_IDLE_MS, runEtsyDraftWorker } from './etsyConnector';
import type { EtsyConnectorDeps, EtsyDraftWorkerOutcome } from './etsyConnector';
import { scrubEtsySecrets } from './etsyBudget';
import { isEtsyConnectorEnabled, isEtsyPushEnabled } from './etsyHttp';

/** Each worker run can spend up to 21 Etsy calls, so only a few rows are resumed per tick. */
export const ETSY_DRAFT_SWEEP_MAX_PER_RUN = 5;

export interface EtsyDraftSweepDeps extends EtsyConnectorDeps {
  /** Run the draft worker for one row. Defaults to runEtsyDraftWorker with these deps. */
  runWorker?: (listingRowId: string) => Promise<EtsyDraftWorkerOutcome>;
  /** Rows per run, at most ETSY_DRAFT_SWEEP_MAX_PER_RUN. */
  maxPerRun?: number;
}

export interface EtsyDraftSweepResult {
  skipped: boolean;
  /** Idle DRAFT_PENDING rows found (before claiming). */
  considered: number;
  /** Rows this sweep claimed (count 1). */
  claimed: number;
  /** Rows another sweeper claimed first (count 0). */
  lostClaim: number;
  /** Worker runs started. Always equals claimed. */
  ran: number;
  outcomes: Record<EtsyDraftWorkerOutcome, number>;
  /** Claim or worker errors (the sweep keeps going). */
  errors: number;
}

function emptyResult(skipped: boolean): EtsyDraftSweepResult {
  return {
    skipped,
    considered: 0,
    claimed: 0,
    lostClaim: 0,
    ran: 0,
    outcomes: { ready: 0, failed: 0, skipped: 0, cancelled: 0 },
    errors: 0,
  };
}

export async function sweepStaleEtsyDrafts(deps: EtsyDraftSweepDeps = {}): Promise<EtsyDraftSweepResult> {
  const env = deps.env ?? process.env;
  if (!isEtsyConnectorEnabled(env) || !isEtsyPushEnabled(env)) return emptyResult(true);
  const result = emptyResult(false);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = deps.db ?? require('../../lib/prisma').prisma;
    const now = (deps.now ?? (() => new Date()))();
    const cap = Math.max(1, Math.min(Math.floor(deps.maxPerRun ?? ETSY_DRAFT_SWEEP_MAX_PER_RUN), ETSY_DRAFT_SWEEP_MAX_PER_RUN));
    const run = deps.runWorker ?? ((id: string) => runEtsyDraftWorker(id, deps));

    const rows: Array<{ id: string; updatedAt: Date }> = await db.etsyListing.findMany({
      where: { state: 'DRAFT_PENDING', updatedAt: { lt: new Date(now.getTime() - ETSY_DRAFT_IDLE_MS) } },
      orderBy: { updatedAt: 'asc' },
      take: cap,
      select: { id: true, updatedAt: true },
    });
    result.considered = rows.length;

    for (const row of rows.slice(0, cap)) {
      let claimedHere = false;
      try {
        const claim = await db.etsyListing.updateMany({
          where: { id: row.id, state: 'DRAFT_PENDING', updatedAt: row.updatedAt },
          data: { lastErrorMessage: null, updatedAt: now },
        });
        if (claim && claim.count === 1) {
          claimedHere = true;
          result.claimed++;
        } else {
          result.lostClaim++;
        }
      } catch (err: any) {
        result.errors++;
        console.warn('[etsy-draft-sweep] claim failed:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
      }
      if (!claimedHere) continue;

      try {
        result.ran++;
        const outcome = await run(row.id);
        if (outcome in result.outcomes) result.outcomes[outcome]++;
      } catch (err: any) {
        // runEtsyDraftWorker never throws; an injected worker might.
        result.errors++;
        console.warn('[etsy-draft-sweep] worker threw:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
      }
    }
  } catch (err: any) {
    result.errors++;
    console.warn('[etsy-draft-sweep] sweep failed:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
  }
  return result;
}
