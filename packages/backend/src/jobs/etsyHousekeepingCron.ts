/**
 * etsyHousekeepingCron.ts -- daily Etsy upkeep (ADR-135 D1.7, D5.3, D5.6, D7.5, section 6). Batch B1.
 *
 * One run, in order:
 *   1. Kill switch: ETSY_CONNECTOR_ENABLED must be exactly 'true' or the whole run returns early.
 *   2. Prune EtsyOAuthState rows that expired more than a day ago.
 *   3. Prune EtsyApiCall rows older than 48 hours.
 *   4. Token keepalive: every ACTIVE ETSY account whose lastRefreshedAt is older than 30 days gets a
 *      BACKGROUND-priority refresh (getValidEtsyAccessToken) so the 90-day refresh token never lapses
 *      silently. One account failing never blocks the others.
 *   5. Budget log line and Sentry thresholds (80 percent warning, 95 percent error, at most hourly).
 *   6. Taxonomy refresh trigger: when the newest EtsyTaxonomyNode is older than 7 days (or the table
 *      is empty) call deps.refreshTaxonomy. The taxonomy service belongs to batch B3, so the wiring
 *      batch passes its refresher in; without one this run only logs that a refresh is due.
 *   7. Commercial Access trigger check (D7.5): logs `[etsy-commercial-trigger] <which>` and raises a
 *      Sentry info event when 25 or more ACTIVE accounts have live listings, the peak rolling 24 hour
 *      usage reaches 60 percent of the observed daily limit, or a QPD block has been recorded.
 *      LIMITS OF THIS CHECK: EtsyApiCall rows are kept 48 hours, so the 7-day peak in D7.5 is
 *      approximated by the peak over the retained window; EtsyApiState keeps only the latest block
 *      reason, so "ever observed" is approximated by blockedReason = 'QPD'; condition (d) (Etsy says a
 *      Personal Access app may not serve other sellers, test T13) is a human finding and is not
 *      automated.
 *
 * Exports a schedule function; it is NOT registered here. The wiring batch calls
 * startEtsyHousekeepingCron() from index.ts (schedule '23 4 * * *', wrapped in cronGuard).
 *
 * Import safety: no env reads or network at module load; everything is injectable through deps.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import {
  ETSY_STATE_ID,
  captureEtsyEvent,
  pruneEtsyApiCalls,
  reportEtsyBudget,
  scrubEtsySecrets,
} from '../services/marketplace/etsyBudget';
import type { EtsyEnv } from '../services/marketplace/etsyBudget';
import { isEtsyConnectorEnabled } from '../services/marketplace/etsyHttp';
import { getValidEtsyAccessToken } from '../services/marketplace/etsyAuth';
import { pruneExpiredEtsyOAuthStates } from '../services/marketplace/etsyOAuthState';

export const ETSY_HOUSEKEEPING_SCHEDULE = '23 4 * * *';
export const ETSY_KEEPALIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const ETSY_KEEPALIVE_MAX_PER_RUN = 100;
export const ETSY_TAXONOMY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ETSY_COMMERCIAL_ACCOUNTS_TRIGGER = 25;
export const ETSY_COMMERCIAL_PEAK_RATIO = 0.6;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface EtsyHousekeepingDeps {
  /** Prisma-shaped client. Defaults to the shared client, loaded lazily. */
  db?: any;
  env?: EtsyEnv;
  now?: () => Date;
  /** Refresh one organizer's token at BACKGROUND priority. Defaults to getValidEtsyAccessToken. */
  keepaliveToken?: (organizerId: string) => Promise<unknown>;
  /** Refresh the taxonomy cache (batch B3's service). Optional until the wiring batch supplies it. */
  refreshTaxonomy?: () => Promise<void>;
  pruneOAuthStates?: () => Promise<number>;
  pruneApiCalls?: () => Promise<number>;
  reportBudget?: () => Promise<unknown>;
}

export interface EtsyHousekeepingResult {
  skipped: boolean;
  prunedOAuthStates: number;
  prunedApiCalls: number;
  keepaliveChecked: number;
  keepaliveRefreshed: number;
  keepaliveFailed: number;
  taxonomyDue: boolean;
  taxonomyRefreshed: boolean;
  commercialTriggers: string[];
}

function getDb(deps: EtsyHousekeepingDeps): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../lib/prisma').prisma;
}

/**
 * Pure: peak number of calls in any rolling 24 hour window, sampled at each of the last 24 hourly
 * marks. Needs call times from the last 48 hours (the retention window).
 */
export function computePeakRolling24h(callTimes: Date[], now: Date): number {
  const times = callTimes.map((d) => d.getTime());
  let peak = 0;
  for (let k = 0; k <= 24; k++) {
    const end = now.getTime() - k * HOUR_MS;
    const start = end - DAY_MS;
    let n = 0;
    for (const t of times) if (t > start && t <= end) n++;
    if (n > peak) peak = n;
  }
  return peak;
}

export interface CommercialTriggerInput {
  accountsWithLiveListings: number;
  peak24h: number;
  limitPerDay: number | null;
  blockedReason: string | null;
}

/** Pure: which D7.5 conditions hold. */
export function evaluateCommercialTriggers(i: CommercialTriggerInput): string[] {
  const out: string[] = [];
  if (i.accountsWithLiveListings >= ETSY_COMMERCIAL_ACCOUNTS_TRIGGER) {
    out.push(`accounts-with-live-listings=${i.accountsWithLiveListings}`);
  }
  if (i.limitPerDay && i.limitPerDay > 0 && i.peak24h >= Math.ceil(i.limitPerDay * ETSY_COMMERCIAL_PEAK_RATIO)) {
    out.push(`peak-24h-usage=${i.peak24h}-of-${i.limitPerDay}`);
  }
  if (i.blockedReason === 'QPD') out.push('qpd-block-recorded');
  return out;
}

export async function runEtsyHousekeeping(deps: EtsyHousekeepingDeps = {}): Promise<EtsyHousekeepingResult> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const result: EtsyHousekeepingResult = {
    skipped: false,
    prunedOAuthStates: 0,
    prunedApiCalls: 0,
    keepaliveChecked: 0,
    keepaliveRefreshed: 0,
    keepaliveFailed: 0,
    taxonomyDue: false,
    taxonomyRefreshed: false,
    commercialTriggers: [],
  };

  if (!isEtsyConnectorEnabled(env)) {
    console.log('[etsy-housekeeping] ETSY_CONNECTOR_ENABLED is not true; skipping');
    return { ...result, skipped: true };
  }
  const db = getDb(deps);

  // 2 and 3: prune
  result.prunedOAuthStates = await (deps.pruneOAuthStates ?? (() => pruneExpiredEtsyOAuthStates({ db, now: deps.now })))();
  result.prunedApiCalls = await (deps.pruneApiCalls ?? (() => pruneEtsyApiCalls({ db, now: deps.now, env })))();

  // 4: token keepalive for idle accounts
  const keepalive =
    deps.keepaliveToken ??
    ((organizerId: string) => getValidEtsyAccessToken(organizerId, { db, env, now: deps.now }, { priority: 'BACKGROUND' }));
  const idle: Array<{ organizerId: string }> = await db.marketplaceAccount.findMany({
    where: { platform: 'ETSY', status: 'ACTIVE', lastRefreshedAt: { lt: new Date(now.getTime() - ETSY_KEEPALIVE_AFTER_MS) } },
    select: { organizerId: true },
    take: ETSY_KEEPALIVE_MAX_PER_RUN,
  });
  for (const { organizerId } of idle) {
    result.keepaliveChecked++;
    try {
      await keepalive(organizerId);
      result.keepaliveRefreshed++;
    } catch (err: any) {
      result.keepaliveFailed++;
      console.warn(`[etsy-housekeeping] keepalive failed for organizer ${organizerId}:`, err?.code || scrubEtsySecrets(err?.message || String(err), env));
    }
  }

  // 5: budget log and alerts
  try {
    await (deps.reportBudget ?? (() => reportEtsyBudget({ db, now: deps.now, env })))();
  } catch (err: any) {
    console.warn('[etsy-housekeeping] budget report failed:', scrubEtsySecrets(err?.message || String(err), env));
  }

  // 6: taxonomy refresh trigger
  const newest = await db.etsyTaxonomyNode.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } });
  const fetchedAt: Date | null = newest?.fetchedAt ?? null;
  result.taxonomyDue = !(fetchedAt instanceof Date) || now.getTime() - fetchedAt.getTime() > ETSY_TAXONOMY_MAX_AGE_MS;
  if (result.taxonomyDue) {
    if (deps.refreshTaxonomy) {
      try {
        await deps.refreshTaxonomy();
        result.taxonomyRefreshed = true;
      } catch (err: any) {
        console.warn('[etsy-housekeeping] taxonomy refresh failed:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
      }
    } else {
      console.log('[etsy-housekeeping] taxonomy refresh is due but no refresher is wired');
    }
  }

  // 7: Commercial Access trigger check
  try {
    const accounts: Array<{ organizerId: string }> = await db.marketplaceAccount.findMany({
      where: { platform: 'ETSY', status: 'ACTIVE' },
      select: { organizerId: true },
    });
    let accountsWithLiveListings = 0;
    if (accounts.length > 0) {
      const groups: unknown[] = await db.etsyListing.groupBy({
        by: ['organizerId'],
        where: { state: 'ACTIVE', organizerId: { in: accounts.map((a) => a.organizerId) } },
      });
      accountsWithLiveListings = groups.length;
    }
    const rows: Array<{ at: Date }> = await db.etsyApiCall.findMany({
      where: { at: { gt: new Date(now.getTime() - 2 * DAY_MS) } },
      select: { at: true },
    });
    const state = await db.etsyApiState.findUnique({ where: { id: ETSY_STATE_ID } });
    result.commercialTriggers = evaluateCommercialTriggers({
      accountsWithLiveListings,
      peak24h: computePeakRolling24h(rows.map((r) => r.at), now),
      limitPerDay: state?.limitPerDay ?? null,
      blockedReason: state?.blockedReason ?? null,
    });
    if (result.commercialTriggers.length > 0) {
      const which = result.commercialTriggers.join(', ');
      console.log(`[etsy-commercial-trigger] ${which}`);
      captureEtsyEvent('info', `Etsy Commercial Access request trigger: ${which}`, {
        area: 'budget',
        step: 'commercial-trigger',
      }, env);
    }
  } catch (err: any) {
    console.warn('[etsy-housekeeping] commercial trigger check failed:', scrubEtsySecrets(err?.message || String(err), env));
  }

  return result;
}

/**
 * Schedule the daily run. Not called anywhere in this batch: the wiring batch invokes it from index.ts.
 */
export function startEtsyHousekeepingCron(deps: EtsyHousekeepingDeps = {}): void {
  cron.schedule(
    ETSY_HOUSEKEEPING_SCHEDULE,
    cronGuard({ jobName: 'etsyHousekeepingCron' }, async () => {
      await runEtsyHousekeeping(deps);
    })
  );
  console.log('[etsy-housekeeping] Cron registered, runs daily at 04:23');
}
