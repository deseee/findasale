import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';
import { createNotification } from '../lib/notificationService';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';

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
 */

const stripe = () => getStripe();

export const reconcileStrandedPosSales = async (): Promise<void> => {
  if (process.env.POS_RECONCILE_DISABLED === '1') {
    console.log('[pos-reconcile] Disabled via POS_RECONCILE_DISABLED=1 -- skipping run.');
    return;
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

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
    try {
      const sessions = await stripe().checkout.sessions.list({
        payment_link: link.stripePaymentLinkId,
        limit: 5,
      });

      const paidSession = sessions.data.find(
        (s) => s.status === 'complete' && s.payment_status === 'paid'
      );
      if (!paidSession) continue;

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
cron.schedule('*/10 * * * *', cronGuard({ jobName: 'posStrandedSaleReconcile' }, async () => {
  await reconcileStrandedPosSales();
}));
