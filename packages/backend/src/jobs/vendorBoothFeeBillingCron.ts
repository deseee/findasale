/**
 * vendorBoothFeeBillingCron.ts — ADR-090 Phase 4: flat, sale-independent VendorBooth
 * boothFee (rent) periodic billing.
 *
 * Why a SEPARATE mechanism from the VendorBoothSettlementBatch/VendorBoothPayout
 * system (vendorBoothSettlementController.ts): that system models money the
 * PLATFORM pays OUT to a vendor (their net sale proceeds) — a concept made
 * vestigial by ADR-020's Direct-charge-per-leg checkout (vendors already receive
 * their proceeds automatically at capture time, see ADR-090 Phase 2/3). Booth fee
 * billing is the OPPOSITE direction: money charged FROM the vendor, Transferred TO
 * the hub owner. Reusing VendorBoothPayout's vendor-receives-money fields for a
 * vendor-owes-money charge would have been actively misleading, so this uses its own
 * model (VendorBoothFeeCharge, schema.prisma) and its own idempotent claim pattern —
 * same 'CLAIMING' sentinel + updateMany-WHERE-null guard as BoothCartLeg's Transfer
 * (vendorBoothCartController.ts transferHubOwnerShareForLeg), and a stable
 * idempotencyKey on every Stripe call.
 *
 * Monthly cadence chosen as the simpler default (no existing precedent in this
 * codebase for a booth-fee-specific cadence to follow) — bills the PRIOR calendar
 * month, runs the 1st of the following month at 06:00 UTC.
 *
 * *** PRE-WIRE STATUS, FLAGGED EXPLICITLY (2026-07-20 dev handoff) ***
 * VendorBooth.vendorStripeCustomerId / vendorPaymentMethodId are new nullable
 * schema fields — there is NO vendor payment-method collection UI built yet (a
 * deliberate, flagged scope reduction, not a hidden gap; out of budget for this
 * pass — mirrors the existing MasterItemLibrary pre-wire precedent in this
 * codebase). Until that collection flow exists, every real booth resolves to
 * PENDING_PAYMENT_METHOD below and no money moves. This cron is safe to register
 * and run in that state: it never silently drops a charge, it logs + persists
 * exactly what's blocked and why, same as the PENDING_STRIPE_ONBOARDING pattern
 * already established elsewhere in the VendorBooth payments system.
 *
 * *** STRIPE REMOVAL UPDATE (2026-09-12) ***
 * The above "PRE-WIRE" state is now PERMANENT, not just "not yet built": the only
 * endpoint that could ever populate vendorStripeCustomerId/vendorPaymentMethodId
 * (startVendorBoothFeeBillingSetup, vendorBoothController.ts) has been blocked
 * unconditionally this session because Stripe's platform account is permanently
 * closed — no NEW Stripe Customer/SetupIntent can ever be created there again. That
 * makes this cron's `stripe().paymentIntents.create` branch below provably dead
 * code from this point forward (every real booth is now guaranteed to hit
 * PENDING_PAYMENT_METHOD, forever, not just "in practice today"). Left in place
 * rather than deleted, since ripping out a cron's charge branch mid-sweep without
 * a replacement risks a worse mistake than an inert function — but recurring
 * booth-fee billing cannot ship again until a Square equivalent (Card on File +
 * an off-session-charge scheduler, e.g. via Square's Cards API) is designed.
 * ARCHITECT-LEVEL OPEN QUESTION, not resolved by this sweep: what should
 * recurring booth-fee billing look like on Square? Flagging per dispatch
 * instructions rather than guessing at a new billing architecture.
 *
 * *** SQUARE IMPLEMENTATION (2026-09-14) ***
 * The open question above is now RESOLVED -- see claude_docs/feature-notes/
 * booth-rent-autopay-square-design-2026-09-13.md. The Stripe paymentIntents.create +
 * transfers.create two-hop block described above is GONE from this cron's live code path
 * (history kept in this comment, not the code). The charge branch now gates on the hub
 * owner's SQUARE readiness (squareOnboarded/squareLocationId + a resolvable OAuth token)
 * and the vendor's Square shared-card fields (vendorSquarePlatformCustomerId/
 * vendorSquareCardId), then makes ONE Square CreatePayment call directly on the hub
 * owner's own connected account using the vendor's shared card -- no Transfer, no
 * allocation, no CLAIMING sentinel, since there is no second async step to race against
 * (see squareVendorBoothCartService.ts's chargeVendorBoothFeeOnHubOwnerAccount). On
 * failure this cron no longer marks a charge terminally FAILED -- it sets
 * FAILED_RETRYING with a nextRetryAt, and jobs/vendorBoothFeeRetryCron.ts (new, daily)
 * re-attempts it per the resolved retry/dunning cadence (2 retries at +3/+7 days after
 * the original failure, then FAILED_FINAL).
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
// Rent-charge failure notification. Fire-and-forget with a .catch at both FAILED-RETRYING
// sites below: telling people must NEVER change what this cron does to money, and the
// service itself never throws (it returns { sent, reason }).
import { notifyBoothRentChargeFailed, notifyBoothRentCharged } from '../services/vendorBoothLifecycleNotificationService';
import { cronGuard } from '../utils/cronGuard';
import { isPayoutFlaggedForReview } from '../services/connectAccountGuard'; // S1198 (2026-09-06): bank-fingerprint collusion hold, hub-owner Transfer wiring
// Square path (2026-09-14 design) -- resolves the HUB OWNER's own OAuth access token
// (never the platform's, never the vendor's) to charge on their own connected account.
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError } from '../services/squarePaymentService';
import { chargeVendorBoothFeeOnHubOwnerAccount } from '../services/squareVendorBoothCartService';

/**
 * Retry/dunning cadence (2026-09-14, resolved default per the design doc's §9 item 1 --
 * Architect's own suggested default, Patrick-confirmed): 2 retries at +3 and +7 days after
 * the ORIGINAL failed attempt, then FAILED_FINAL. 3 total attempts (1 initial + 2 retries).
 * "Original failure" is approximated as the VendorBoothFeeCharge row's own createdAt --
 * that row is created and attempted within the same cron run (sub-second gap in practice),
 * so this is accurate to well within the day-granularity this cadence actually needs.
 * Exported so jobs/vendorBoothFeeRetryCron.ts (the daily dunning sweep) uses the exact same
 * policy rather than a second, driftable copy of it.
 */
export const BOOTH_FEE_RETRY_DELAYS_DAYS = [3, 7] as const;
export const MAX_BOOTH_FEE_ATTEMPTS = BOOTH_FEE_RETRY_DELAYS_DAYS.length + 1; // 3

/**
 * Given the ORIGINAL failure timestamp and the attempt number that just failed (1 = the
 * initial cron attempt, 2 = the first retry, ...), returns when the next retry should run,
 * or null if the retry budget (MAX_BOOTH_FEE_ATTEMPTS) is exhausted -- i.e. FAILED_FINAL.
 */
export function computeNextBoothFeeRetryAt(originalFailureAt: Date, attemptNumberJustFailed: number): Date | null {
  const delayDays = BOOTH_FEE_RETRY_DELAYS_DAYS[attemptNumberJustFailed - 1];
  if (delayDays === undefined) return null; // retry budget exhausted -> FAILED_FINAL
  return new Date(originalFailureAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
}

export interface BoothFeeBillingSummary {
  checked: number;
  charged: number;
  alreadyBilled: number;
  pendingPaymentMethod: number;
  pendingOnboarding: number;
  failed: number;
}

/**
 * Bills every CONFIRMED, non-deleted VendorBooth with boothFee > 0 for the given
 * period. Idempotent per (vendorBoothId, periodStart, periodEnd) via
 * VendorBoothFeeCharge's unique constraint — safe to re-run for the same period
 * (e.g. a manual re-trigger after fixing a stuck booth) without double-charging.
 */
export async function runBoothFeeBilling(periodStart: Date, periodEnd: Date): Promise<BoothFeeBillingSummary> {
  const summary: BoothFeeBillingSummary = {
    checked: 0,
    charged: 0,
    alreadyBilled: 0,
    pendingPaymentMethod: 0,
    pendingOnboarding: 0,
    failed: 0,
  };

  const booths = await prisma.vendorBooth.findMany({
    where: { status: 'CONFIRMED', deletedAt: null, boothFee: { gt: 0 } },
    include: { hub: { include: { organizer: true } } },
  });

  for (const booth of booths) {
    summary.checked += 1;
    try {
      let charge;
      try {
        charge = await prisma.vendorBoothFeeCharge.create({
          data: {
            vendorBoothId: booth.id,
            hubId: booth.hubId,
            periodStart,
            periodEnd,
            amountCents: Math.round(Number(booth.boothFee) * 100),
            status: 'PENDING',
            // Square path (2026-09-14): every NEW charge row this cron creates is
            // Square-only going forward -- Stripe's platform account is permanently
            // closed, so a STRIPE row can only be historical/pre-shutdown (schema.prisma's
            // own comment on this column). Set explicitly rather than relying on the
            // schema default, which stays 'STRIPE' for backward compatibility with rows
            // already written.
            processor: 'SQUARE',
          },
        });
      } catch (createErr: any) {
        if (createErr?.code === 'P2002') {
          summary.alreadyBilled += 1;
          continue;
        }
        throw createErr;
      }

      const hubOwnerOrganizer = booth.hub.organizer;
      const hubOwnerSquareReady = hubOwnerOrganizer.squareOnboarded && !!hubOwnerOrganizer.squareLocationId;
      if (!hubOwnerSquareReady) {
        summary.pendingOnboarding += 1;
        await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PENDING_SQUARE_ONBOARDING' } });
        continue;
      }

      // Resolve the hub owner's own OAuth access token now (rather than deep inside the
      // charge attempt below) so a resolution failure (revoked/expired token with no
      // usable refresh token) reads identically to "not onboarded" -- same gate, same
      // status -- instead of falling through to a Square API call doomed to fail with a
      // confusing error.
      let hubOwnerAccessToken: string;
      try {
        hubOwnerAccessToken = await resolveOrganizerSquareAccessToken(hubOwnerOrganizer);
      } catch (tokenErr) {
        if (tokenErr instanceof SquareOnboardingIncompleteError) {
          summary.pendingOnboarding += 1;
          await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PENDING_SQUARE_ONBOARDING' } });
          continue;
        }
        throw tokenErr;
      }

      // S1198 (2026-09-06): bank-fingerprint collusion hold. Checked here, BEFORE the
      // vendor's card is ever charged below -- there is no point taking real money from
      // the vendor if the second leg (Transfer to this hub owner) must not complete, same
      // early-out reasoning as the hubOwnerReady/vendorPaymentMethodId checks around it.
      // No dedicated schema status exists for this (would need Architect sign-off for a
      // new enum value) -- reuses the existing FAILED status with a clear failureReason,
      // consistent with how every other real failure in this loop is recorded. This path
      // is currently dormant (PRE-WIRE: no live booth has both vendor Stripe fields set
      // yet, per this file's own header comment) but is registered in a live monthly cron,
      // so it is fixed now rather than left to reproduce the moment vendor payment
      // collection ships.
      if (await isPayoutFlaggedForReview('ORGANIZER', hubOwnerOrganizer.id)) {
        summary.failed += 1;
        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { status: 'FAILED', failureReason: "Hub owner's payout is on hold pending admin review" },
        });
        continue;
      }

      if (!booth.vendorSquarePlatformCustomerId || !booth.vendorSquareCardId) {
        summary.pendingPaymentMethod += 1;
        await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PENDING_PAYMENT_METHOD' } });
        continue;
      }

      await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PROCESSING' } });

      try {
        // Square path (2026-09-14 design §4/§6.2): ONE call, directly on the hub owner's
        // own connected Square account, using the vendor's platform-account shared card.
        // Money lands in the hub owner's Square balance the instant this succeeds -- no
        // Transfer, no allocation, no CLAIMING sentinel/second async step to race against
        // (unlike the deleted Stripe charge+transfer block this replaces). No appFeeMoney --
        // no platform cut on booth fee (ADR-090 §3, still deferred; resolved default per
        // the design doc's §9 item 2).
        const now = new Date();
        const result = await chargeVendorBoothFeeOnHubOwnerAccount({
          hubOwnerAccessToken,
          hubOwnerSquareLocationId: hubOwnerOrganizer.squareLocationId,
          sharedCardId: booth.vendorSquareCardId!,
          amountCents: charge.amountCents,
          vendorBoothId: booth.id,
          hubId: booth.hubId,
          chargeId: charge.id,
          attemptNumber: 1,
        });

        if (!result.ok) {
          summary.failed += 1;
          const nextRetryAt = computeNextBoothFeeRetryAt(now, 1);
          await prisma.vendorBoothFeeCharge.update({
            where: { id: charge.id },
            data: {
              status: 'FAILED_RETRYING',
              failureReason: `${result.code}: ${result.message}`.slice(0, 500),
              attemptCount: 1,
              lastAttemptAt: now,
              nextRetryAt,
            },
          });
          // The vendor's card did not go through and the hub owner did not get the rent.
          // Before this, both facts were silent -- the only surface was the fee-charges table.
          notifyBoothRentChargeFailed(charge.id).catch(err =>
            console.warn('[booth-lifecycle] Rent failure notification failed for charge', charge.id, err)
          );
          continue;
        }

        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: {
            squarePaymentId: result.paymentId,
            status: 'COMPLETED',
            attemptCount: 1,
            lastAttemptAt: now,
            nextRetryAt: null,
          },
        });
        summary.charged += 1;
        // Gap closed 2026-07-28 (Stripe era): rent SUCCESS was silent. The charge above
        // charges the vendor's card directly into the hub owner's own account, so this is
        // the only receipt anyone gets. Fire-and-forget: rent has already been collected,
        // and a notification must not unwind that.
        notifyBoothRentCharged(charge.id).catch(err =>
          console.warn('[booth-lifecycle] Rent receipt notification failed for charge', charge.id, err)
        );
      } catch (chargeErr: any) {
        summary.failed += 1;
        const now = new Date();
        const nextRetryAt = computeNextBoothFeeRetryAt(now, 1);
        await prisma.vendorBoothFeeCharge
          .update({
            where: { id: charge.id },
            data: {
              status: 'FAILED_RETRYING',
              failureReason: chargeErr?.message?.slice(0, 500) || 'Square charge failed',
              attemptCount: 1,
              lastAttemptAt: now,
              nextRetryAt,
            },
          })
          .catch(() => {});
        notifyBoothRentChargeFailed(charge.id).catch(err =>
          console.warn('[booth-lifecycle] Rent failure notification failed for charge', charge.id, err)
        );
        console.error(`[vendor-booth-fee-billing] Booth ${booth.id} charge failed:`, chargeErr);
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`[vendor-booth-fee-billing] Unexpected error for booth ${booth.id}:`, err);
    }
  }

  return summary;
}

/** Register the monthly cron: 06:00 UTC on the 1st, bills the prior calendar month. */
export function scheduleVendorBoothFeeBillingCron(): void {
  cron.schedule(
    '0 6 1 * *',
    cronGuard({ jobName: 'vendorBoothFeeBillingCron' }, async () => {
      const now = new Date();
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
      const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1, 0, 0, 0));
      console.log(`[vendor-booth-fee-billing] Starting monthly run for period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);
      const summary = await runBoothFeeBilling(periodStart, periodEnd);
      console.log('[vendor-booth-fee-billing] Run complete:', summary);
    })
  );
  console.log('[vendor-booth-fee-billing] Cron registered — runs monthly at 06:00 UTC on the 1st (bills the prior calendar month).');
}
