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
 * eBay API calls."
 */

import { prisma } from './prisma';
import { getEbayInsertionsUsed, getNextMonthStart } from './ebayInsertionsQuotaTracker';
import { EBAY_FREE_INSERTIONS_CAP } from '../config/ebayInsertionLimits';

export type EbayInsertionsForecastStatus = 'ok' | 'approaching' | 'over';

export interface EbayInsertionsForecast {
  usedThisMonth: number;
  freeInsertionsCap: number;
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

  const [usedThisMonth, projectedRenewalsBeforeReset] = await Promise.all([
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
  ]);

  const projectedTotalUsage = usedThisMonth + projectedRenewalsBeforeReset;

  return {
    usedThisMonth,
    freeInsertionsCap: EBAY_FREE_INSERTIONS_CAP,
    projectedRenewalsBeforeReset,
    projectedTotalUsage,
    resetAt: resetAt.toISOString(),
    status: computeStatus(projectedTotalUsage, EBAY_FREE_INSERTIONS_CAP),
  };
}
