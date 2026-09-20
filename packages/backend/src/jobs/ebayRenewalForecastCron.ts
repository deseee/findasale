/**
 * ebayRenewalForecastCron.ts — nightly eBay GTC renewal-date forecast.
 * ADR ebay-renewal-forecasting (2026-09-15).
 *
 * Two responsibilities, both pure local computation, zero eBay API calls
 * (per the ADR's own Decision + Constraints — this cron must never add a new
 * eBay call; if it ever needs one, that is a new, explicit, budget-aware
 * decision, not a silent addition here):
 *
 *   1. For every AVAILABLE item with a non-null ebayRenewalAnchorAt, recompute
 *      ebayNextRenewalAt as the next CALENDAR-MONTH GTC renewal boundary
 *      strictly after now — not a fixed 30-day cycle. eBay's own help page
 *      (ebay.com/help/selling/fees-credits-invoices/selling-fees, "Insertion
 *      fees", confirmed 2026-09-20) states GTC listings "renew automatically
 *      once per calendar month," so a listing anchored on the 15th renews on
 *      the 15th of each following month, not every 30 days — a fixed-30-day
 *      cycle drifts against eBay's real renewal date every cycle, since
 *      calendar months run 28-31 days. computeNextRenewal() now advances by
 *      whole calendar months (native JS Date month arithmetic) from an
 *      efficient starting guess, until strictly after `now`, clamping to the
 *      last valid day of a shorter target month per standard JS Date
 *      rollover semantics (e.g. an anchor on Jan 31 lands on Feb 28/29, not a
 *      March rollover) — eBay's own docs don't spell out this exact clamp
 *      behavior, so this is a reasoned inference (standard billing-system
 *      convention), not an eBay-confirmed rule; flagging it here the same
 *      conservative way the rest of this file flags its own inferences.
 *
 *   2. Per the UX spec's Piece 3 (ebay-markdown-budget-warnings-ux-spec-
 *      2026-09-15) and this dispatch's Dev Handoff Note #7: after recomputing,
 *      check each eBay-connected organizer's current forecast status via the
 *      same computeEbayInsertionsForecast() the live endpoint uses (single-
 *      sourced threshold logic), and fire exactly one Notification per
 *      organizer per calendar month the first time status crosses into
 *      "approaching" (>=80%) or "over" (>=100%) — never a second one later in
 *      the same month for the same organizer, and never nightly repeats while
 *      still above threshold.
 *
 *      Dedup choice (documented per this dispatch's instructions, since no
 *      schema change is in scope for this dispatch): rather than a new
 *      Organizer.ebayInsertionCapWarningNotifiedThisMonth boolean column (the
 *      UX spec's suggested shape, but a schema change this dispatch may not
 *      make), this cron dedupes by querying for an existing Notification of
 *      type 'ebay_insertion_cap_warning' for this organizer's user created
 *      since this calendar month's start — the same "query existing
 *      notifications for a recent match" dedup idiom already used by
 *      arrivalController.ts's 24h APPROACH_NOTES dedup (there via
 *      PushNotificationLog + a 24h window; here via Notification + a
 *      calendar-month window, since Notification.type is a free-text String
 *      column with zero migration cost per the UX spec's own read of the
 *      model). Functionally equivalent to a monthly notified flag, and
 *      correct by construction — it cannot drift from the month boundary the
 *      way a separately-reset boolean could.
 *
 * Staggered to run after ebayListingQueueCron (every 30 min) and
 * ebayEndedListingsSyncCron (every 4h, :00 UTC) have had a chance to settle
 * the day's listing state, and after markdownCycleCron (3:08 AM UTC) /
 * huntPassExpiryCron (3:00 AM UTC) — 3:15 AM UTC, following this codebase's
 * existing staggered-cron-minute convention (see markdownCycleCron.ts's own
 * stagger comment).
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getMonthStart } from '../lib/ebayInsertionsQuotaTracker';
import { computeEbayInsertionsForecast } from '../lib/ebayInsertionsForecast';

const CHUNK_SIZE = 50; // matches arrivalController.ts's existing chunked-write convention

/**
 * Add `months` whole calendar months to `date` (UTC), clamping to the last
 * valid day of the target month when the source day-of-month doesn't exist
 * there (e.g. Jan 31 + 1 month -> Feb 28/29, not a March 3 rollover). Uses
 * the Date.UTC(year, monthIndex+1, 0) idiom ("day 0" = last day of the
 * previous month) to compute that clamp deliberately, rather than relying on
 * JS's default overflow-rollover behavior for setUTCMonth, which would
 * silently roll Jan 31 + 1 month into early March.
 */
function addCalendarMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed
  const day = date.getUTCDate();
  const targetMonthIndex = month + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      year,
      targetMonthIndex,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Next calendar-month GTC boundary strictly after `now`, anchored at
 * `anchor`. See the file header doc comment for why calendar-month (not
 * fixed-30-day) arithmetic is correct here, and for the end-of-month clamp
 * caveat.
 */
function computeNextRenewal(anchor: Date, now: Date): Date {
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const monthsBetween = (nowYear - anchorYear) * 12 + (nowMonth - anchorMonth);
  // Efficient starting guess: at least 1 month ahead, so a same-or-earlier
  // anchor day-of-month this calendar month doesn't return a past date.
  let monthsAdded = Math.max(1, monthsBetween);
  let candidate = addCalendarMonthsUtc(anchor, monthsAdded);
  // Bounded walk forward in case the starting guess still lands at/before
  // `now` (e.g. anchor's day-of-month this month is later than now's day).
  while (candidate.getTime() <= now.getTime()) {
    monthsAdded += 1;
    candidate = addCalendarMonthsUtc(anchor, monthsAdded);
  }
  return candidate;
}

/**
 * Step 1: recompute ebayNextRenewalAt for every eligible item.
 * Pure arithmetic over already-stored data — no eBay API calls.
 */
async function recomputeRenewalForecasts(): Promise<{ checked: number; updated: number }> {
  const now = new Date();

  const items = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      ebayRenewalAnchorAt: { not: null },
    },
    select: { id: true, ebayRenewalAnchorAt: true, ebayNextRenewalAt: true },
  });

  let updated = 0;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        // Guarded by the where-clause above, but TS doesn't narrow through
        // Prisma's nullable select type.
        if (!item.ebayRenewalAnchorAt) return;
        const nextRenewal = computeNextRenewal(item.ebayRenewalAnchorAt, now);
        if (item.ebayNextRenewalAt && item.ebayNextRenewalAt.getTime() === nextRenewal.getTime()) {
          return; // already correct — skip the write
        }
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayNextRenewalAt: nextRenewal },
        });
        updated++;
      })
    );
  }

  return { checked: items.length, updated };
}

/**
 * Step 2: per eBay-connected organizer, check whether their forecast just
 * crossed the 80% "approaching" threshold this month, and if so — and only
 * if not already notified this month — fire exactly one Notification.
 */
async function checkApproachingCapWarnings(): Promise<{ organizersChecked: number; notified: number }> {
  // Same "which organizers need eBay-related nightly processing" query shape
  // as ebayEndedListingsSyncCron.ts, for consistency with this codebase's
  // existing convention.
  const connections = await prisma.ebayConnection.findMany({
    where: {
      organizer: {
        sales: {
          some: {
            items: {
              some: { ebayListingId: { not: null }, status: 'AVAILABLE' },
            },
          },
        },
      },
    },
    select: { organizerId: true },
  });

  const monthStart = getMonthStart();
  let notified = 0;

  for (const { organizerId } of connections) {
    try {
      const forecast = await computeEbayInsertionsForecast(organizerId);
      if (forecast.status === 'ok') continue; // not approaching/over — nothing to notify

      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        select: { userId: true },
      });
      if (!organizer) continue;

      const alreadyNotifiedThisMonth = await prisma.notification.findFirst({
        where: {
          userId: organizer.userId,
          type: 'ebay_insertion_cap_warning',
          createdAt: { gte: monthStart },
        },
        select: { id: true },
      });
      if (alreadyNotifiedThisMonth) continue; // one per organizer per month, full stop

      await prisma.notification.create({
        data: {
          userId: organizer.userId,
          type: 'ebay_insertion_cap_warning',
          title: 'Approaching your free eBay insertion limit',
          body: `You're projected to use ~${forecast.projectedTotalUsage} of your ${forecast.freeInsertionsCap} free eBay insertions this month. New listings past that will incur eBay's insertion fee.`,
          link: '/organizer/platforms',
          notificationChannel: 'IN_APP',
        },
      });
      notified++;
      console.log(
        `[eBay Renewal Forecast] organizer=${organizerId} status=${forecast.status} projected=${forecast.projectedTotalUsage}/${forecast.freeInsertionsCap} — cap-warning notification sent`
      );
    } catch (error) {
      console.error(`[eBay Renewal Forecast] Failed cap-warning check for organizer ${organizerId}:`, error);
      // Continue — one organizer's failure shouldn't block the rest
    }
  }

  return { organizersChecked: connections.length, notified };
}

async function runEbayRenewalForecastCron(): Promise<void> {
  const { checked, updated } = await recomputeRenewalForecasts();
  console.log(`[eBay Renewal Forecast] Recomputed ebayNextRenewalAt: ${checked} eligible items checked, ${updated} updated`);

  const { organizersChecked, notified } = await checkApproachingCapWarnings();
  console.log(`[eBay Renewal Forecast] Cap-warning check: ${organizersChecked} eBay-connected organizers checked, ${notified} notified`);
}

export function startEbayRenewalForecastCron(): void {
  // 15 3 * * * = 3:15 AM UTC daily — staggered after huntPassExpiryCron (3:00)
  // and markdownCycleCron (3:08), and after ebayListingQueueCron/
  // ebayEndedListingsSyncCron have settled the day's listing state.
  cron.schedule('15 3 * * *', cronGuard({ jobName: 'ebayRenewalForecastCron' }, async () => {
    console.log('[eBay Renewal Forecast] Starting nightly forecast run...');
    await runEbayRenewalForecastCron();
  }));
  console.log('[eBay Renewal Forecast] Cron registered — runs daily at 3:15 AM UTC');
}
