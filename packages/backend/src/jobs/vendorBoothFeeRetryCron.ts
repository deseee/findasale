/**
 * vendorBoothFeeRetryCron.ts — booth-rent auto-pay dunning sweep (2026-09-14).
 *
 * Companion to jobs/vendorBoothFeeBillingCron.ts (the monthly first-attempt billing run),
 * per claude_docs/feature-notes/booth-rent-autopay-square-design-2026-09-13.md §6.3. The
 * Stripe-era cron never retried a failed charge at all -- one attempt, terminal FAILED,
 * done. This is new ground for booth rent: a daily sweep that re-attempts any
 * VendorBoothFeeCharge sitting in FAILED_RETRYING whose nextRetryAt has arrived, using the
 * SAME charge row (never creates a new VendorBoothFeeCharge -- this is a retry of an
 * existing charge attempt, not a new billing period).
 *
 * Retry/dunning cadence (resolved default, design doc §9 item 1): 2 retries at +3 and +7
 * days after the ORIGINAL failed attempt, then FAILED_FINAL (3 attempts total) -- see
 * vendorBoothFeeBillingCron.ts's BOOTH_FEE_RETRY_DELAYS_DAYS/computeNextBoothFeeRetryAt,
 * reused here rather than a second, driftable copy of the same policy.
 *
 * Runs daily at 07:00 UTC -- an hour after the monthly billing run's 06:00 UTC slot (only
 * overlaps on the 1st of the month) to avoid any same-day race between "bill this new
 * period" and "retry a charge that failed a few days ago."
 *
 * §8.6 edge case: a booth can be rejected/cancelled/soft-deleted while a FAILED_RETRYING
 * row still has a future nextRetryAt. This sweep joins back to VendorBooth and skips (marks
 * CANCELLED, not FAILED_FINAL -- "we tried and failed" is a different fact from "there was
 * nothing left to try") any row whose booth is no longer CONFIRMED or has deletedAt set.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { notifyBoothRentChargeFailed, notifyBoothRentChargeFailedFinal, notifyBoothRentCharged } from '../services/vendorBoothLifecycleNotificationService';
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError } from '../services/squarePaymentService';
import { chargeVendorBoothFeeOnHubOwnerAccount } from '../services/squareVendorBoothCartService';
import { computeNextBoothFeeRetryAt, MAX_BOOTH_FEE_ATTEMPTS } from './vendorBoothFeeBillingCron';

// P1 fix (2026-09-14 security review): a VendorBoothFeeCharge row is set to PROCESSING
// immediately before the Square call in vendorBoothFeeBillingCron.ts (and again, on retry,
// right here). If the process crashes/restarts between that write and the subsequent status
// update, the row is stuck at PROCESSING forever -- the monthly cron won't re-create it
// (VendorBoothFeeCharge's own unique-per-period constraint blocks that) and this sweep's
// query used to only look at FAILED_RETRYING, so nothing would ever look at it again. A live
// Square API call should never legitimately take this long, so a PROCESSING row older than
// this TTL is treated as abandoned and picked back up below. This is safe ONLY because
// chargeVendorBoothFeeOnHubOwnerAccount's idempotency key is now keyed on chargeId alone
// (see squareVendorBoothCartService.ts) -- if the original attempt actually succeeded at
// Square, retrying with the same key returns that same success instead of double-charging.
const STUCK_PROCESSING_RETRY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BoothFeeRetrySummary {
  checked: number;
  charged: number;
  failedRetrying: number;
  failedFinal: number;
  cancelled: number;
  pendingOnboarding: number;
  pendingPaymentMethod: number;
}

/**
 * Re-attempts every VendorBoothFeeCharge in FAILED_RETRYING whose nextRetryAt has arrived.
 * Idempotent per row the same way the billing cron is idempotent per period: a row can only
 * be in FAILED_RETRYING with a past-due nextRetryAt if its previous attempt actually failed
 * and scheduled this one, so re-running this sweep twice in a row for the same row (e.g. a
 * manual re-trigger) simply finds it already moved to COMPLETED/FAILED_FINAL/CANCELLED and
 * does nothing.
 *
 * ALSO re-attempts any row stuck in PROCESSING past STUCK_PROCESSING_RETRY_TTL_MS (a crash
 * between the PROCESSING write and the next status update, below) -- see that constant's
 * own comment for why this is safe.
 */
export async function runBoothFeeRetrySweep(now: Date = new Date()): Promise<BoothFeeRetrySummary> {
  const summary: BoothFeeRetrySummary = {
    checked: 0,
    charged: 0,
    failedRetrying: 0,
    failedFinal: 0,
    cancelled: 0,
    pendingOnboarding: 0,
    pendingPaymentMethod: 0,
  };

  const stuckProcessingCutoff = new Date(now.getTime() - STUCK_PROCESSING_RETRY_TTL_MS);

  const dueCharges = await prisma.vendorBoothFeeCharge.findMany({
    where: {
      OR: [
        { status: 'FAILED_RETRYING', nextRetryAt: { lte: now } },
        // Stuck-PROCESSING recovery (see STUCK_PROCESSING_RETRY_TTL_MS above): fall back to
        // updatedAt when lastAttemptAt was never set (a row that crashed before its first
        // post-attempt update never had lastAttemptAt written at all).
        {
          status: 'PROCESSING',
          OR: [
            { lastAttemptAt: { lte: stuckProcessingCutoff } },
            { lastAttemptAt: null, updatedAt: { lte: stuckProcessingCutoff } },
          ],
        },
      ],
    },
    include: {
      vendorBooth: { include: { hub: { include: { organizer: true } } } },
    },
  });

  for (const charge of dueCharges) {
    summary.checked += 1;
    const booth = charge.vendorBooth;

    try {
      // §8.6: the booth relationship no longer meaningfully exists -- skip (CANCELLED),
      // never retry against it, and never claim it as FAILED_FINAL (that implies a real
      // attempt was owed and exhausted; here there is nothing left to owe).
      if (booth.status !== 'CONFIRMED' || booth.deletedAt) {
        summary.cancelled += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'CANCELLED', nextRetryAt: null },
        });
        continue;
      }

      const hubOwnerOrganizer = booth.hub.organizer;
      const hubOwnerSquareReady = hubOwnerOrganizer.squareOnboarded && !!hubOwnerOrganizer.squareLocationId;

      let hubOwnerAccessToken: string | null = null;
      if (hubOwnerSquareReady) {
        try {
          hubOwnerAccessToken = await resolveOrganizerSquareAccessToken(hubOwnerOrganizer);
        } catch (tokenErr) {
          if (!(tokenErr instanceof SquareOnboardingIncompleteError)) throw tokenErr;
          hubOwnerAccessToken = null;
        }
      }

      // Hub owner disconnected/never finished Square onboarding since the original
      // attempt (§8.3) -- same PENDING_SQUARE_ONBOARDING status the billing cron uses,
      // no charge attempted, no retry budget consumed (nextRetryAt cleared; the NEXT
      // monthly billing run's own gate will pick this booth back up in its normal flow,
      // not this row, once the hub owner reconnects).
      if (!hubOwnerAccessToken) {
        summary.pendingOnboarding += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'PENDING_SQUARE_ONBOARDING', nextRetryAt: null },
        });
        continue;
      }

      // Vendor cancelled auto-pay (§8.2) since the original attempt -- same
      // PENDING_PAYMENT_METHOD status the billing cron uses, no retry budget consumed.
      if (!booth.vendorSquarePlatformCustomerId || !booth.vendorSquareCardId) {
        summary.pendingPaymentMethod += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'PENDING_PAYMENT_METHOD', nextRetryAt: null },
        });
        continue;
      }

      const attemptNumber = charge.attemptCount + 1;
      // Original failure time, per vendorBoothFeeBillingCron.ts's own approximation:
      // the charge row's createdAt (created and first-attempted in the same cron run).
      const originalFailureAt = charge.createdAt;

      const result = await chargeVendorBoothFeeOnHubOwnerAccount({
        hubOwnerAccessToken,
        hubOwnerSquareLocationId: hubOwnerOrganizer.squareLocationId,
        sharedCardId: booth.vendorSquareCardId,
        amountCents: charge.amountCents,
        vendorBoothId: booth.id,
        hubId: booth.hubId,
        chargeId: charge.id,
        attemptNumber,
      });

      if (result.ok) {
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: {
            squarePaymentId: result.paymentId,
            status: 'COMPLETED',
            attemptCount: attemptNumber,
            lastAttemptAt: now,
            nextRetryAt: null,
          },
        });
        summary.charged += 1;
        notifyBoothRentCharged(charge.id).catch(err =>
          console.warn('[booth-lifecycle] Rent receipt notification failed for charge (retry)', charge.id, err)
        );
        continue;
      }

      const failureReason = `${result.code}: ${result.message}`.slice(0, 500);
      const nextRetryAt = computeNextBoothFeeRetryAt(originalFailureAt, attemptNumber);

      if (nextRetryAt && attemptNumber < MAX_BOOTH_FEE_ATTEMPTS) {
        summary.failedRetrying += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'FAILED_RETRYING', failureReason, attemptCount: attemptNumber, lastAttemptAt: now, nextRetryAt },
        });
        notifyBoothRentChargeFailed(charge.id).catch(err =>
          console.warn('[booth-lifecycle] Rent failure notification failed for charge (retry)', charge.id, err)
        );
      } else {
        // Retry budget exhausted -- terminal, will never auto-retry again. Notifies both
        // the vendor and the hub owner (resolved default, design doc §9 item 3).
        summary.failedFinal += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'FAILED_FINAL', failureReason, attemptCount: attemptNumber, lastAttemptAt: now, nextRetryAt: null },
        });
        notifyBoothRentChargeFailedFinal(charge.id).catch(err =>
          console.warn('[booth-lifecycle] Final dunning-failure notification failed for charge', charge.id, err)
        );
      }
    } catch (err) {
      console.error(`[vendor-booth-fee-retry] Unexpected error for charge ${charge.id}:`, err);
    }
  }

  return summary;
}

/** Register the daily dunning sweep: 07:00 UTC, an hour after the monthly billing run. */
export function scheduleVendorBoothFeeRetryCron(): void {
  cron.schedule(
    '0 7 * * *',
    cronGuard({ jobName: 'vendorBoothFeeRetryCron' }, async () => {
      const now = new Date();
      console.log(`[vendor-booth-fee-retry] Starting daily dunning sweep at ${now.toISOString()}`);
      const summary = await runBoothFeeRetrySweep(now);
      console.log('[vendor-booth-fee-retry] Sweep complete:', summary);
    })
  );
  console.log('[vendor-booth-fee-retry] Cron registered — runs daily at 07:00 UTC (dunning sweep for FAILED_RETRYING booth-rent charges).');
}
