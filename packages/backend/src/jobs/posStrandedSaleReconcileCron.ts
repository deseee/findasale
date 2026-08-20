import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';
import { createNotification } from '../lib/notificationService';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';
import { shouldUseDirectCharge } from '../services/stripeConnectService';
import type { POSPaymentLink } from '@prisma/client';

/**
 * posStrandedSaleReconcileCron.ts
 * ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151)
 *
 * Backstop for the QR / Payment Link POS flow: money can be captured at Stripe while the
 * `checkout.session.completed` webhook never records the sale (missing subscription,
 * transient throw, cross-endpoint idempotency collision, etc.). Every 10 minutes this job
 * looks for POSPaymentLink rows still ACTIVE past a 10-minute grace window, asks Stripe
 * whether a completed+paid checkout session exists for that link, and if so auto-records
 * the sale via the SAME idempotent recorder the webhook uses -- then alerts the organizer.
 *
 * Kill-switch: set POS_RECONCILE_DISABLED=1 to make the job early-return (rollback lever).
 *
 * Reclaim-gap fix (2026-08-04): this job's second, newer responsibility -- closing the
 * CHECKOUT_LINK settlement-router gap (reservationController.ts batchUpdateHolds) where
 * an abandoned Stripe Payment Link left Item.status stuck at INVOICE_ISSUED forever, with
 * NO HoldInvoice row for invoiceExpiryJob.ts to ever find (Payment Links are a different
 * Stripe object than Checkout Sessions -- no single "paid" boolean, no session-retrieve
 * semantics; a link stays active indefinitely until manually deactivated). Rather than
 * force-fitting a Payment Link ID into HoldInvoice.stripeSessionId (a field documented and
 * consumed elsewhere as specifically a Checkout Session ID -- stripeController.ts's
 * webhook, holdInvoicePaymentRecorder.ts, itemSaleGuard.ts), this reuses the
 * purpose-built POSPaymentLink model (already written by createPaymentLinkInternal on
 * every CHECKOUT_LINK call, including the settlement-router one) and this job's EXISTING
 * per-link Stripe verification call above (checkout.sessions.list({ payment_link })) --
 * one Stripe call per link now answers both "was it paid?" (existing logic) and, when the
 * answer is no, "has its own deadline passed?" (new branch below). The settlement router
 * (reservationController.ts) now derives POSPaymentLink.expiresAt from the underlying
 * hold's own expiresAt (LOCKED DECISION #7's "payment window = hold timer remainder"
 * pattern, mirrored for this Stripe object). When that deadline has passed and Stripe
 * still shows no paid session, this job reverts any of the link's items still
 * INVOICE_ISSUED back to RESERVED and their ItemReservation back to CONFIRMED -- same
 * revert target and same "leave the *existing* reservationExpiryJob cron as the one place
 * that decides a hold's own timer has truly run out" philosophy as invoiceExpiryJob.ts's
 * revert branch. The revert is conditional/atomic (WHERE status = expected status), so a
 * payment webhook resolving the link in the same window always wins the race. Ad-hoc
 * payment links with no underlying hold (the generic POST /api/pos/payment-links endpoint,
 * which never flips Item.status) are naturally unaffected: their items are never
 * INVOICE_ISSUED via this flow, so the conditional item revert matches zero rows.
 *
 * Kill-switch: set POS_PAYMENT_LINK_EXPIRY_RECLAIM_DISABLED=1 to disable JUST this expiry
 * revert branch (rollback lever independent of POS_RECONCILE_DISABLED, which disables the
 * whole job including the paid-reconcile logic above).
 */

const stripe = () => getStripe();

/**
 * Shared EXPIRED-flip + item-revert + notify + best-effort Stripe-deactivate logic.
 * Used by BOTH the in-window "own expiresAt passed with no paid Stripe session" branch
 * AND the >7d STALE_ROW_CUTOFF_DAYS branch -- a stale row is, by construction, already
 * far past any real payment window (schema.prisma documents POSPaymentLink.expiresAt as
 * "24h"), so it's exactly as reclaimable as an in-window expired link. Deliberately does
 * NOT call Stripe to check for a paid session itself -- callers decide whether that check
 * is safe to run first (the stale-row guard above skips it entirely for ancient rows,
 * since Stripe will never recognize sandbox/test-era payment link IDs and that call
 * always fails/floods logs).
 */
const reclaimExpiredPaymentLink = async (
  link: POSPaymentLink,
  reasonLabel: string,
  // Direct-charge account-context fix (2026-08-20, S-QR-DIRECT-CHARGE-PRICE-MISMATCH
  // follow-up): a Direct-charge organizer's Stripe Payment Link lives on their CONNECTED
  // account, not the platform account -- the best-effort deactivate call below must be
  // routed the same way the link was originally created, or Stripe rejects it with "No
  // such payment link" (confirmed live in production for organizer
  // cmnxueoas0005tfv8brnc0kky, 2026-08-20T18:16:07Z). Undefined = platform account
  // (DESTINATION-charge / no-Connect links), matching every other call site's
  // { stripeAccount } convention in this codebase.
  stripeRequestOptions?: { stripeAccount: string }
): Promise<void> => {
  try {
    const { revertIds: revertedItemIds, affectedReservations } = await prisma.$transaction(async (tx) => {
      // Atomic link flip: only proceed if still ACTIVE -- a concurrent
      // webhook/reconcile completing this link in the same window wins the
      // race, same guarded-flip pattern as recordPosPaymentLinkSale.
      const linkFlip = await tx.pOSPaymentLink.updateMany({
        where: { id: link.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      if (linkFlip.count === 0) return { revertIds: [] as string[], affectedReservations: [] as { userId: string; itemId: string }[] };

      // Only items still INVOICE_ISSUED get reverted. If something else
      // already moved an item on (SOLD via a race-winning webhook, or this
      // link was the generic ad-hoc/no-hold endpoint which never flips
      // Item.status at all), this matches zero rows and is a safe no-op.
      const stillIssued = await tx.item.findMany({
        where: { id: { in: link.itemIds }, status: 'INVOICE_ISSUED' },
        select: { id: true },
      });
      const revertIds = stillIssued.map((i) => i.id);
      if (revertIds.length === 0) return { revertIds: [] as string[], affectedReservations: [] as { userId: string; itemId: string }[] };

      await tx.item.updateMany({
        where: { id: { in: revertIds }, status: 'INVOICE_ISSUED' },
        data: { status: 'RESERVED' },
      });

      // Mirror invoiceExpiryJob.ts's revert target exactly: back to CONFIRMED,
      // not AVAILABLE -- reservationExpiryJob.ts remains the single place that
      // decides a hold's own timer has truly run out.
      const affectedReservations = await tx.itemReservation.findMany({
        where: { itemId: { in: revertIds } },
        select: { userId: true, itemId: true },
      });
      await tx.itemReservation.updateMany({
        where: { itemId: { in: revertIds } },
        data: { status: 'CONFIRMED' },
      });

      return { revertIds, affectedReservations };
    });

    // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this previously wrote
    // a raw tx.notification.create() per reservation inside the transaction above, which
    // made email structurally impossible (the shared createNotification() helper writes
    // through the global `prisma` client, not a $transaction's `tx`). A shopper whose
    // payment link died still has an active hold ticking down, so they need this promptly
    // enough to retry -- not just whenever they next happen to open the app. Moved outside
    // the transaction (fire-and-forget) so it can go through the email-capable
    // lib/notificationService.ts helper (already imported in this file) instead.
    for (const r of affectedReservations) {
      createNotification({
        userId: r.userId,
        type: 'invoice_expired',
        title: 'Payment link expired',
        body: 'Your payment link expired before payment was completed. Your hold remains active.',
        link: `/items/${r.itemId}`,
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch((err: unknown) => console.error(`[pos-reconcile] Failed to create invoice_expired notification for user ${r.userId}:`, err));
    }

    if (revertedItemIds.length > 0) {
      console.error(`[pos-reconcile] EXPIRED-RECLAIMED link=${link.id} items=${revertedItemIds.join(',')} -- ${reasonLabel}; reverted to RESERVED/CONFIRMED.`);
    } else {
      console.log(`[pos-reconcile] EXPIRED-NOOP link=${link.id} -- ${reasonLabel}, but no items still INVOICE_ISSUED (already resolved elsewhere, or an ad-hoc link with no underlying hold).`);
    }

    // Best-effort Stripe-side deactivation -- non-fatal, mirrors
    // invoiceExpiryJob.ts's best-effort Checkout Session expire() call.
    try {
      await stripe().paymentLinks.update(link.stripePaymentLinkId, { active: false }, stripeRequestOptions);
    } catch (deactivateErr: any) {
      console.warn(`[pos-reconcile] Failed to deactivate Stripe payment link ${link.stripePaymentLinkId} (non-fatal):`, deactivateErr?.message ?? deactivateErr);
    }
  } catch (revertErr: any) {
    console.error(`[pos-reconcile] Failed to reclaim payment link ${link.id} -- will retry next run:`, revertErr?.message ?? revertErr);
  }
};

export const reconcileStrandedPosSales = async (): Promise<void> => {
  if (process.env.POS_RECONCILE_DISABLED === '1') {
    console.log('[pos-reconcile] Disabled via POS_RECONCILE_DISABLED=1 -- skipping run.');
    return;
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Stale-row guard (added 2026-07-25): ACTIVE POSPaymentLink rows older than this cutoff
  // predate FindA.Sale's live Stripe Connect integration and hold payment-link IDs from the
  // early sandbox/test era that Stripe will never recognize. Reconciling them therefore always
  // fails and just floods logs with STRANDED-UNRECOVERED noise for money that was never really
  // stranded. Any ACTIVE row this old is treated as permanently dead and skipped WITHOUT calling
  // Stripe, logged as a distinct low-severity STALE-SKIPPED line (not STRANDED-UNRECOVERED) so a
  // genuinely new stranded sale is never silently swallowed by this guard -- only ancient rows are.
  const STALE_ROW_CUTOFF_DAYS = 7;
  const staleRowCutoff = new Date(Date.now() - STALE_ROW_CUTOFF_DAYS * 24 * 60 * 60 * 1000);

  // NOTE (S1157, FINDASALE-NODEJS-67): the organizer relation used to be fetched here via
  // `include`. Prisma 5 (no relationJoins preview feature) resolves an `include` as a
  // second, separate SQL query -- if the organizer/sale behind a candidate row is deleted
  // (cascade) in the window between the two queries, or the row is otherwise a stale
  // orphan, Prisma throws PrismaClientUnknownRequestError ("Field organizer is required to
  // return data, got null") for the WHOLE findMany, which killed every OTHER candidate in
  // the same batch too. The organizer lookup now happens per-link below, inside the
  // existing try/catch, so one bad row can't take down the rest of the run.
  const candidates = await prisma.pOSPaymentLink.findMany({
    where: { status: 'ACTIVE', createdAt: { lt: tenMinutesAgo } },
  });

  if (candidates.length === 0) return;

  console.log(`[pos-reconcile] Checking ${candidates.length} ACTIVE POS payment link(s) older than 10 min for stranded sales.`);

  for (const link of candidates) {
    // Direct-charge account-context fix (2026-08-20, updated same day once the
    // stripeAccountId/chargeType columns landed -- 20260820190000_add_pos_payment_link_
    // stripe_account_snapshot): prefer the value PINNED on the link at creation time.
    // Only a pre-migration row (chargeType NULL) falls back to recomputing the same
    // live-eligibility + allowlist check createPaymentLinkInternal ran originally --
    // mirrors holdInvoicePaymentRecorder.ts's identical chargeType-NULL fallback shape.
    // Fails closed to undefined (platform account) on any lookup error, mirroring
    // shouldUseDirectCharge's own fail-closed contract.
    let linkStripeRequestOptions: { stripeAccount: string } | undefined;
    if (link.chargeType) {
      if (link.chargeType === 'DIRECT' && link.stripeAccountId) {
        linkStripeRequestOptions = { stripeAccount: link.stripeAccountId };
      }
    } else {
      try {
        const linkOrganizer = await prisma.organizer.findUnique({
          where: { id: link.organizerId },
          select: { stripeConnectId: true },
        });
        if (linkOrganizer?.stripeConnectId) {
          const linkUseDirect = await shouldUseDirectCharge(link.organizerId, linkOrganizer.stripeConnectId);
          if (linkUseDirect) {
            linkStripeRequestOptions = { stripeAccount: linkOrganizer.stripeConnectId };
          }
        }
      } catch (routingErr: any) {
        console.warn(`[pos-reconcile] Failed to resolve Stripe account context for link=${link.id} (falling back to platform account):`, routingErr?.message ?? routingErr);
      }
    }

    if (link.createdAt < staleRowCutoff) {
      // Stale-row-cutoff fix (2026-08-07): previously this branch only logged and
      // skipped -- it never reached the EXPIRED-flip logic below, so these rows sat
      // ACTIVE forever (confirmed live: rows 58d and 13d old stuck ACTIVE). The Stripe
      // "was it paid?" call is still intentionally skipped for these rows (see
      // stale-row guard note above -- Stripe will never recognize sandbox/test-era
      // payment link IDs and that call always fails/floods logs), but a row this old
      // is, by construction, already far past any real payment window (schema.prisma
      // documents POSPaymentLink.expiresAt as "24h"), so it's safe to run the same
      // EXPIRED-flip + item-revert + notify + best-effort Stripe-deactivate
      // reconciliation the in-window branch below runs -- just without re-asking
      // Stripe first.
      console.log(`[pos-reconcile] STALE-SKIPPED link=${link.id} createdAt=${link.createdAt.toISOString()} -- older than ${STALE_ROW_CUTOFF_DAYS}d cutoff, not re-checked against Stripe (see stale-row guard note above); reconciling locally to EXPIRED.`);
      if (process.env.POS_PAYMENT_LINK_EXPIRY_RECLAIM_DISABLED !== '1') {
        await reclaimExpiredPaymentLink(
          link,
          `exceeded ${STALE_ROW_CUTOFF_DAYS}d stale-row cutoff (createdAt=${link.createdAt.toISOString()}) without ever resolving`,
          linkStripeRequestOptions
        );
      }
      continue;
    }

    try {
      const sessions = await stripe().checkout.sessions.list(
        {
          payment_link: link.stripePaymentLinkId,
          limit: 5,
        },
        linkStripeRequestOptions
      );

      const paidSession = sessions.data.find(
        (s) => s.status === 'complete' && s.payment_status === 'paid'
      );

      if (!paidSession) {
        // Reclaim-gap fix (2026-08-04): no paid session found -- check whether this
        // link's own expiresAt (see header comment) has passed. If so, revert any of
        // its items still stuck INVOICE_ISSUED via the shared reclaim helper below
        // (also reused by the STALE_ROW_CUTOFF_DAYS branch above). See header comment
        // for full rationale.
        const nowTs = new Date();
        const linkExpiresAt = link.expiresAt;
        if (
          linkExpiresAt &&
          linkExpiresAt < nowTs &&
          process.env.POS_PAYMENT_LINK_EXPIRY_RECLAIM_DISABLED !== '1'
        ) {
          await reclaimExpiredPaymentLink(
            link,
            `CHECKOUT_LINK payment link passed its own expiresAt (${linkExpiresAt.toISOString()}) with no paid Stripe session found`,
            linkStripeRequestOptions
          );
        }
        continue;
      }

      // Re-read the row immediately before recording to avoid racing the live webhook.
      const fresh = await prisma.pOSPaymentLink.findUnique({ where: { id: link.id } });
      if (!fresh || fresh.status === 'COMPLETED') continue;

      const result = await recordPosPaymentLinkSale(fresh, {
        source: 'reconcile',
        sessionId: paidSession.id,
      });

      if (result.recorded) {
        const amountDollars = (link.amount / 100).toFixed(2);
        // Belt-and-suspenders: surface in monitoring even though it self-healed.
        console.error(`[pos-reconcile] AUTO-RECORDED stranded sale link=${link.id} session=${paidSession.id} amount=$${amountDollars}`);

        // Per-link organizer lookup (see note above) -- tolerate a missing/raced organizer
        // without losing the auto-record or crashing the batch; just skip the notification.
        const organizer = await prisma.organizer
          .findUnique({ where: { id: link.organizerId }, select: { userId: true } })
          .catch((e) => {
            console.error(`[pos-reconcile] Organizer lookup failed for link=${link.id} organizerId=${link.organizerId}:`, e?.message ?? e);
            return null;
          });

        if (organizer?.userId) {
          await createNotification({
            userId: organizer.userId,
            type: 'POS_SALE_RECOVERED',
            title: 'A POS sale was auto-recovered',
            body: `A QR / payment-link sale of $${amountDollars} was captured by Stripe but not recorded at the moment of sale. FindA.Sale automatically reconciled and recorded it -- no action needed.`,
            link: '/organizer/pos',
            channel: 'OPERATIONAL',
          }).catch((e) => console.error(`[pos-reconcile] Failed to notify organizer of recovered sale link=${link.id}:`, e));
        }
      } else if (!result.alreadyCompleted) {
        // complete/paid at Stripe but recording did not take -- never silently lose it.
        console.error(`[pos-reconcile] STRANDED-UNRECOVERED link=${link.id} session=${paidSession.id} -- session is complete/paid but recorder did not record; manual review needed.`);
      }
    } catch (err: any) {
      console.error(`[pos-reconcile] STRANDED-UNRECOVERED link=${link.id} -- error while reconciling:`, err?.message ?? err);
    }
  }
};

// Every 10 minutes.
cron.schedule('6,16,26,36,46,56 * * * *', cronGuard({ jobName: 'posStrandedSaleReconcile' }, async () => { // staggered off reservationExpiryJob's */10 2026-08-04 cost-optimization batch
  await reconcileStrandedPosSales();
}));
