/**
 * ebayInsertionsForecast.ts — shared forecast calculation for the eBay free-
 * insertion cap. ADR ebay-renewal-forecasting (2026-09-15).
 *
 * Single source of truth for both:
 *   - GET /api/organizers/me/ebay-insertions-forecast (organizerEbayForecastController.ts)
 *   - ebayRenewalForecastCron.ts's own nightly 80%-crossing notification check
 * per the UX spec's explicit rationale for keeping status-threshold logic
 * backend-computed exactly once rather than duplicated (ebay-markdown-budget-
 * warnings-ux-spec-2026-09-15.md, Data Preflight — "Severity/threshold").
 *
 * Pure local computation, zero eBay API calls, per the ADR's own Decision
 * section and Constraint: "The forecast cron and endpoint must not add new
 * eBay API calls." freeInsertionsCap (2026-09-20 update) now comes from
 * getCachedEbayFreeInsertionsCap() -- a real per-organizer number when
 * available, cached by ebayStoreSubscriptionService.ts, but still only ever
 * a DB read from this file's perspective -- this constraint still holds.
 */

import { prisma } from './prisma';
import { getEbayInsertionsUsed, getNextMonthStart } from './ebayInsertionsQuotaTracker';
import { getCachedEbayFreeInsertionsCap } from '../services/ebayStoreSubscriptionService';

export type EbayInsertionsForecastStatus = 'ok' | 'approaching' | 'over';

export interface EbayInsertionsForecast {
  usedThisMonth: number;
  freeInsertionsCap: number;
  // ADR ebay-store-tier-cap (2026-09-20): 'CACHED' means freeInsertionsCap is a
  // real, eBay-confirmed number for this organizer's actual Store subscription
  // tier (see services/ebayStoreSubscriptionService.ts); 'ESTIMATED' means no
  // live lookup has succeeded yet for this organizer, so freeInsertionsCap is
  // the flat fallback guess -- surfaced here (not hidden) so the UI can be
  // honest about which one it's showing.
  capSource: 'CACHED' | 'ESTIMATED';
  projectedRenewalsBeforeReset: number;
  projectedTotalUsage: number;
  resetAt: string; // ISO string
  status: EbayInsertionsForecastStatus;
}

// Matches platformStatsService.ts's ebayWarningLevel() thresholds (>=1.0 / >=0.8)
// for visual-language consistency with the existing EbayLimitBar, per the UX
// spec's Dev Handoff Notes #1.
function computeStatus(projectedTotalUsage: number, cap: number): EbayInsertionsForecastStatus {
  if (cap <= 0) return 'ok'; // defensive — cap is a positive constant today, guards future misconfiguration
  const pct = projectedTotalUsage / cap;
  if (pct >= 1.0) return 'over';
  if (pct >= 0.8) return 'approaching';
  return 'ok';
}

/**
 * Computes the eBay free-insertion forecast for one organizer.
 *
 * projectedRenewalsBeforeReset counts AVAILABLE eBay-listed items whose
 * nightly-computed ebayNextRenewalAt falls before the organizer's next
 * monthly reset boundary — per the ADR's Decision section. A null
 * ebayNextRenewalAt (item never anchored, or the forecast cron hasn't run
 * yet since this item's anchor was set) degrades gracefully to "not counted"
 * rather than a crash or an over-count, per the ADR's own Playbook.
 */
export async function computeEbayInsertionsForecast(organizerId: string): Promise<EbayInsertionsForecast> {
  const resetAt = getNextMonthStart();

  // getCachedEbayFreeInsertionsCap is a pure DB read -- no eBay API call --
  // per this file's own "zero eBay API calls" constraint (see
  // ebayStoreSubscriptionService.ts's header comment for where the live
  // lookup that populates this cache actually runs instead).
  const [usedThisMonth, projectedRenewalsBeforeReset, capResult] = await Promise.all([
    getEbayInsertionsUsed(organizerId),
    prisma.item.count({
      where: {
        status: 'AVAILABLE',
        ebayNextRenewalAt: { not: null, lt: resetAt },
        OR: [
          { organizerId },
          { sale: { organizerId } },
        ],
      },
    }),
    getCachedEbayFreeInsertionsCap(organizerId),
  ]);

  const freeInsertionsCap = capResult.cap;
  const projectedTotalUsage = usedThisMonth + projectedRenewalsBeforeReset;

  return {
    usedThisMonth,
    freeInsertionsCap,
    capSource: capResult.source,
    projectedRenewalsBeforeReset,
    projectedTotalUsage,
    resetAt: resetAt.toISOString(),
    status: computeStatus(projectedTotalUsage, freeInsertionsCap),
  };
}
