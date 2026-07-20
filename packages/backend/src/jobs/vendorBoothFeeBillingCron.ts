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
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';

const stripe = () => getStripe();

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
      const hubOwnerReady =
        hubOwnerOrganizer.stripeAccountType === 'standard' &&
        hubOwnerOrganizer.stripeOnboarded &&
        !!hubOwnerOrganizer.stripeConnectId;
      if (!hubOwnerReady) {
        summary.pendingOnboarding += 1;
        await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PENDING_STRIPE_ONBOARDING' } });
        continue;
      }

      if (!booth.vendorStripeCustomerId || !booth.vendorPaymentMethodId) {
        summary.pendingPaymentMethod += 1;
        await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PENDING_PAYMENT_METHOD' } });
        continue;
      }

      await prisma.vendorBoothFeeCharge.update({ where: { id: charge.id }, data: { status: 'PROCESSING' } });

      try {
        // Platform-account charge — the vendor's saved payment method lives on the
        // PLATFORM's own Stripe Customer (analogous to how createBoothCartQrSetupIntent
        // already saves a SHOPPER's card on a platform Customer), NOT the vendor's own
        // connected account. This is deliberately NOT scoped to a {stripeAccount}
        // option, unlike every other VendorBooth charge in this codebase.
        const paymentIntent = await stripe().paymentIntents.create(
          {
            amount: charge.amountCents,
            currency: 'usd',
            customer: booth.vendorStripeCustomerId,
            payment_method: booth.vendorPaymentMethodId,
            off_session: true,
            confirm: true,
            metadata: {
              source: 'vendor_booth_fee_charge',
              vendorBoothId: booth.id,
              hubId: booth.hubId,
              chargeId: charge.id,
            },
          },
          { idempotencyKey: `booth-fee-charge-${charge.id}` }
        );

        await prisma.vendorBoothFeeCharge.update({
          where: { id: charge.id },
          data: { stripePaymentIntentId: paymentIntent.id },
        });

        if (paymentIntent.status !== 'succeeded') {
          summary.failed += 1;
          await prisma.vendorBoothFeeCharge.update({
            where: { id: charge.id },
            data: { status: 'FAILED', failureReason: `PaymentIntent status: ${paymentIntent.status}` },
          });
          continue;
        }

        // Transfer the FULL charged amount to the hub owner — no platform cut is
        // taken on booth fee (ADR-090 §3: "platform taking a cut of the hub owner's
        // cut" is an explicitly DEFERRED pricing decision, not silently built here).
        // Same atomic claim pattern as BoothCartLeg's Transfer (ADR-090 Phase 2).
        const claim = await prisma.vendorBoothFeeCharge.updateMany({
          where: { id: charge.id, stripeTransferId: null },
          data: { stripeTransferId: 'CLAIMING' },
        });
        if (claim.count === 1) {
          try {
            const transfer = await stripe().transfers.create(
              {
                amount: charge.amountCents,
                currency: 'usd',
                destination: hubOwnerOrganizer.stripeConnectId!,
                description: `Booth fee — booth ${booth.boothNumber} (${booth.vendorName}), ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
                metadata: {
                  source: 'vendor_booth_fee_charge',
                  vendorBoothId: booth.id,
                  hubId: booth.hubId,
                  chargeId: charge.id,
                },
              },
              { idempotencyKey: `booth-fee-transfer-${charge.id}` }
            );
            await prisma.vendorBoothFeeCharge.update({
              where: { id: charge.id },
              data: { stripeTransferId: transfer.id, status: 'COMPLETED' },
            });
            summary.charged += 1;
          } catch (transferErr) {
            await prisma.vendorBoothFeeCharge
              .updateMany({ where: { id: charge.id, stripeTransferId: 'CLAIMING' }, data: { stripeTransferId: null } })
              .catch(() => {});
            throw transferErr;
          }
        }
      } catch (chargeErr: any) {
        summary.failed += 1;
        await prisma.vendorBoothFeeCharge
          .update({
            where: { id: charge.id },
            data: { status: 'FAILED', failureReason: chargeErr?.message?.slice(0, 500) || 'Stripe charge/transfer failed' },
          })
          .catch(() => {});
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
