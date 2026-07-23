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

  const candidates = await prisma.pOSPaymentLink.findMany({
    where: { status: 'ACTIVE', createdAt: { lt: tenMinutesAgo } },
    include: { organizer: { select: { userId: true } } },
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

        if (link.organizer?.userId) {
          await createNotification({
            userId: link.organizer.userId,
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
