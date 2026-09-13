/**
 * squareBillingChargeJob.ts -- Square Plan B recurring billing scheduler (2026-09-13)
 *
 * FindA.Sale's own daily cron IS the source of truth for PRO/TEAMS organizer subscription
 * renewals and Hunt Pass shopper subscription renewals, per the architect-approved "Plan B"
 * design (Square Cards API + custom scheduler -- Square's native Subscriptions API requires
 * shippable goods and doesn't fit a pure-SaaS tier; see squareBillingService.ts's header and
 * claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md Section 2).
 * Unlike the Stripe billing this replaces, there is no processor-pushed webhook driving state
 * here -- this job IS the equivalent of Stripe's invoice.payment_succeeded/failed cycle.
 *
 * Three responsibilities, one run:
 *   1. Organizer PRO/TEAMS renewals -- charge Organizer.squareCardId when
 *      billingCurrentPeriodEnd (or a scheduled dunning retry) is due.
 *   2. Hunt Pass renewals -- same shape, User.huntPassSquareCardId / huntPassExpiry.
 *   3. Frozen-tier migration deadline enforcement -- an organizer still on PRO/TEAMS from
 *      the pre-Square-migration era (billingProcessor still null) whose migration grace
 *      window (scripts/migrateFrozenOrganizersToSquareBilling.ts) has expired without them
 *      adding a Square card gets downgraded to SIMPLE here too, same as a real dunning
 *      exhaustion -- one enforcement mechanism, not two.
 *
 * DUNNING (explicit task requirement: never revoke access on the first failed charge) --
 * see squareBillingService.ts's DUNNING_* constants for the exact policy (7-day grace, retry
 * every 2 days). Access is only ever revoked when TWO things are both true: a charge attempt
 * was actually made AND failed, AND the grace deadline has passed. A skipped/never-attempted
 * charge (e.g. this job itself down for a day) never revokes anything on its own.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../lib/notificationService';
import {
  SQUARE_TIER_PRICE_CENTS,
  HUNT_PASS_PRICE_CENTS,
  BILLING_INTERVAL_DAYS,
  computeNextRetryAt,
  computeGraceEndsAt,
  chargeStoredCard,
  BillableOrganizerTier,
} from '../services/squareBillingService';

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// 1. Organizer PRO/TEAMS renewals
// ---------------------------------------------------------------------------

type DueOrganizer = {
  id: string;
  userId: string;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  squareCustomerId: string | null;
  squareCardId: string | null;
  billingCurrentPeriodEnd: Date | null;
  billingDunningFailCount: number;
  billingGraceEndsAt: Date | null;
  businessName: string;
  user: { email: string; name: string | null } | null;
};

async function downgradeOrganizerToSimple(organizerId: string, statusLabel: string): Promise<void> {
  // Deliberately keeps squareCustomerId/squareCardId/billingProcessor intact -- mirrors the
  // existing Stripe convention (syncTier never clears stripeCustomerId on cancel) so a
  // re-upgrade later can reuse the card on file instead of forcing re-entry. Only the
  // active-period/dunning state is cleared. tokenVersion IS incremented here (a real tier
  // change, unlike a routine renewal success) to invalidate any stale tier claim in a live JWT.
  const organizer = await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      subscriptionTier: 'SIMPLE',
      subscriptionStatus: statusLabel,
      billingCurrentPeriodEnd: null,
      billingDunningFailCount: 0,
      billingNextRetryAt: null,
      billingGraceEndsAt: null,
      billingLastFailureReason: null,
      tokenVersion: { increment: 1 },
    },
    select: { userId: true },
  });

  if (organizer.userId) {
    await prisma.userRoleSubscription.updateMany({
      where: { userId: organizer.userId, role: 'ORGANIZER' },
      data: { subscriptionTier: 'SIMPLE', subscriptionStatus: null, tierLapsedAt: new Date() },
    });
  }
}

async function sendOrganizerBillingNotification(
  org: Pick<DueOrganizer, 'id' | 'userId' | 'businessName' | 'user'>,
  stage: 'first_failure' | 'retry_failure' | 'dunning_exhausted' | 'renewed',
  reason?: string
): Promise<void> {
  if (!org.userId) return;
  let title: string;
  let body: string;
  switch (stage) {
    case 'first_failure':
      title = 'Your FindA.Sale payment could not be processed';
      body = `We tried to charge your card on file for your subscription renewal and it was declined${reason ? ` (${reason})` : ''}. Your account is unaffected for now -- please update your payment method within 7 days to avoid losing access.`;
      break;
    case 'retry_failure':
      title = 'Reminder: update your FindA.Sale payment method';
      body = `We tried again to charge your card on file and it was still declined${reason ? ` (${reason})` : ''}. Please update your payment method soon to avoid losing PRO/TEAMS access.`;
      break;
    case 'dunning_exhausted':
      title = 'Your FindA.Sale subscription has been downgraded';
      body = `We were unable to charge your card on file after several attempts, so your account has been downgraded to SIMPLE tier. Add a new card any time to restore PRO/TEAMS access.`;
      break;
    case 'renewed':
    default:
      return; // Routine successful renewal -- no email needed, matches the old Stripe path's silence on invoice.payment_succeeded.
  }
  await createNotification({
    userId: org.userId,
    type: `square_billing_${stage}`,
    title,
    body,
    link: '/organizer/subscription',
    channel: 'OPERATIONAL',
    sendEmail: true,
  }).catch((err: unknown) => {
    console.error(`[squareBillingChargeJob] Failed to send ${stage} notification for organizer ${org.id}:`, err);
  });
}

async function handleOrganizerChargeFailure(org: DueOrganizer, reason: string): Promise<void> {
  const now = new Date();
  const graceEndsAt = org.billingGraceEndsAt ?? computeGraceEndsAt(now);

  if (now > graceEndsAt) {
    await downgradeOrganizerToSimple(org.id, 'canceled');
    await sendOrganizerBillingNotification(org, 'dunning_exhausted', reason);
    console.warn(`[squareBillingChargeJob] Organizer ${org.id} dunning grace exhausted -- downgraded to SIMPLE (reason: ${reason})`);
    return;
  }

  const isFirstFailure = org.billingDunningFailCount === 0;
  const newFailCount = org.billingDunningFailCount + 1;
  await prisma.organizer.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: 'past_due',
      billingDunningFailCount: newFailCount,
      billingNextRetryAt: computeNextRetryAt(now),
      billingGraceEndsAt: graceEndsAt,
      billingLastFailureReason: reason,
    },
  });
  if (org.userId) {
    await prisma.userRoleSubscription.updateMany({
      where: { userId: org.userId, role: 'ORGANIZER' },
      data: { subscriptionStatus: 'past_due' },
    });
  }
  await sendOrganizerBillingNotification(org, isFirstFailure ? 'first_failure' : 'retry_failure', reason);
  console.warn(`[squareBillingChargeJob] Organizer ${org.id} charge failed (attempt ${newFailCount}, reason: ${reason}) -- access retained, next retry ${computeNextRetryAt(now).toISOString()}`);
}

async function processOrganizerBilling(): Promise<void> {
  const now = new Date();

  const dueOrganizers = await prisma.organizer.findMany({
    where: {
      billingProcessor: 'square',
      squareCustomerId: { not: null },
      squareCardId: { not: null },
      billingCurrentPeriodEnd: { lte: now },
      OR: [{ billingNextRetryAt: null }, { billingNextRetryAt: { lte: now } }],
    },
    select: {
      id: true,
      userId: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      squareCustomerId: true,
      squareCardId: true,
      billingCurrentPeriodEnd: true,
      billingDunningFailCount: true,
      billingGraceEndsAt: true,
      businessName: true,
      user: { select: { email: true, name: true } },
    },
  });

  console.log(`[squareBillingChargeJob] ${dueOrganizers.length} organizer(s) due for a Square billing run`);

  for (const org of dueOrganizers) {
    try {
      // Voluntary cancel (cancelSquareBillingSubscription set this) -- don't charge, just
      // let the already-paid-for period lapse into a real downgrade now that it's over.
      if (org.subscriptionStatus === 'scheduled_for_cancellation') {
        // Hacker-pass fix (2026-09-13): guard against the organizer re-subscribing (a fresh
        // createSquareBillingSubscription call, which resets subscriptionStatus away from
        // 'scheduled_for_cancellation') in the gap between this batch's findMany and this
        // row's turn in the loop -- re-verify via a conditional update, not a plain write,
        // so a just-resubscribed organizer is never downgraded a moment after paying again.
        const stillCanceling = await prisma.organizer.updateMany({
          where: { id: org.id, subscriptionStatus: 'scheduled_for_cancellation' },
          data: { billingGraceEndsAt: null }, // harmless placeholder write -- real fields set by downgradeOrganizerToSimple below, which only runs if this guard matched
        });
        if (stillCanceling.count !== 1) {
          console.log(`[squareBillingChargeJob] Organizer ${org.id} re-subscribed after being queued for cancellation -- skipping downgrade`);
          continue;
        }
        await downgradeOrganizerToSimple(org.id, 'canceled');
        console.log(`[squareBillingChargeJob] Organizer ${org.id} reached end of canceled period -- downgraded to SIMPLE`);
        continue;
      }

      const tier = org.subscriptionTier as BillableOrganizerTier;
      const amountCents = SQUARE_TIER_PRICE_CENTS[tier];
      if (!amountCents) {
        // Defensive: a row with billingProcessor='square' but a non-billable tier (SIMPLE/
        // ENTERPRISE) shouldn't exist, but never loop forever attempting a $0 charge if it does.
        console.warn(`[squareBillingChargeJob] Organizer ${org.id} has billingProcessor=square but tier=${org.subscriptionTier} (not billable) -- clearing billing schedule, no charge attempted.`);
        await prisma.organizer.update({
          where: { id: org.id },
          data: { billingCurrentPeriodEnd: null, billingNextRetryAt: null, billingDunningFailCount: 0, billingGraceEndsAt: null },
        });
        continue;
      }

      const result = await chargeStoredCard({
        customerId: org.squareCustomerId!,
        cardId: org.squareCardId!,
        amountCents,
        idempotencyParts: ['org-billing', org.id, org.billingCurrentPeriodEnd!.toISOString()],
        note: `FindA.Sale ${tier} subscription renewal`,
        referenceId: org.id,
      });

      if (result.ok) {
        const nextPeriodEnd = addDays(org.billingCurrentPeriodEnd ?? now, BILLING_INTERVAL_DAYS);
        await prisma.organizer.update({
          where: { id: org.id },
          data: {
            billingCurrentPeriodEnd: nextPeriodEnd,
            subscriptionStatus: 'active',
            billingDunningFailCount: 0,
            billingNextRetryAt: null,
            billingGraceEndsAt: null,
            billingLastFailureReason: null,
          },
        });
        if (org.userId) {
          await prisma.userRoleSubscription.updateMany({
            where: { userId: org.userId, role: 'ORGANIZER' },
            data: { subscriptionStatus: 'active', tierLapsedAt: null, tierResumedAt: new Date() },
          });
        }
        console.log(`[squareBillingChargeJob] Charged organizer ${org.id} $${(amountCents / 100).toFixed(2)} for ${tier} renewal (payment ${result.paymentId})`);
      } else {
        await handleOrganizerChargeFailure(org, result.message);
      }
    } catch (err) {
      console.error(`[squareBillingChargeJob] Unexpected error processing organizer ${org.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Frozen-tier migration deadline enforcement
// ---------------------------------------------------------------------------

async function processFrozenMigrationDeadlines(): Promise<void> {
  const now = new Date();

  const overdue = await prisma.organizer.findMany({
    where: {
      subscriptionTier: { in: ['PRO', 'TEAMS'] },
      billingProcessor: null, // never migrated to Square -- still on the dead Stripe path
      billingGraceEndsAt: { lte: now }, // migration script started this organizer's clock
    },
    select: { id: true, userId: true, businessName: true, user: { select: { email: true, name: true } } },
  });

  if (overdue.length === 0) return;
  console.log(`[squareBillingChargeJob] ${overdue.length} frozen organizer(s) past their Square migration deadline with no card on file -- downgrading`);

  for (const org of overdue) {
    try {
      // Hacker-pass fix (2026-09-13): this loop can run long (many organizers, an email
      // send per iteration) after the batch findMany above -- an organizer who successfully
      // ran createSquareBillingSubscription in the gap between that read and their own turn
      // in this loop would otherwise get wrongly downgraded a moment after paying. Re-check
      // via a CONDITIONAL update (not a separate read-then-write, which would just move the
      // race rather than close it): only proceed if billingProcessor is STILL null at the
      // exact moment of the write.
      const stillUnmigrated = await prisma.organizer.updateMany({
        where: { id: org.id, billingProcessor: null, subscriptionTier: { in: ['PRO', 'TEAMS'] } },
        data: { billingGraceEndsAt: null }, // placeholder write -- real downgrade fields set by downgradeOrganizerToSimple below, which only runs if this guard matched
      });
      if (stillUnmigrated.count !== 1) {
        console.log(`[squareBillingChargeJob] Organizer ${org.id} migrated (or changed tier) after the migration-deadline scan -- skipping downgrade`);
        continue;
      }

      await downgradeOrganizerToSimple(org.id, 'canceled');
      await sendOrganizerBillingNotification(
        { id: org.id, userId: org.userId, businessName: org.businessName, user: org.user },
        'dunning_exhausted',
        'no Square payment method was added before the migration deadline'
      );
      console.warn(`[squareBillingChargeJob] Organizer ${org.id} migration grace expired with no Square card -- downgraded to SIMPLE`);
    } catch (err) {
      console.error(`[squareBillingChargeJob] Failed to enforce migration deadline for organizer ${org.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Hunt Pass renewals
// ---------------------------------------------------------------------------

type DueHuntPassUser = {
  id: string;
  email: string;
  name: string | null;
  huntPassSquareCustomerId: string | null;
  huntPassSquareCardId: string | null;
  huntPassExpiry: Date | null;
  huntPassDunningFailCount: number;
  huntPassGraceEndsAt: Date | null;
  huntPassCancelAtPeriodEnd: boolean;
};

async function sendHuntPassNotification(
  u: Pick<DueHuntPassUser, 'id'>,
  stage: 'first_failure' | 'retry_failure' | 'dunning_exhausted',
  reason: string
): Promise<void> {
  let title: string;
  let body: string;
  switch (stage) {
    case 'first_failure':
      title = 'Your Hunt Pass payment could not be processed';
      body = `We tried to charge your card on file for your Hunt Pass renewal and it was declined (${reason}). Your Hunt Pass is still active -- please update your payment method within 7 days to avoid losing it.`;
      break;
    case 'retry_failure':
      title = 'Reminder: update your Hunt Pass payment method';
      body = `We tried again to charge your card on file for Hunt Pass and it was still declined (${reason}). Please update your payment method soon to keep your Hunt Pass active.`;
      break;
    case 'dunning_exhausted':
    default:
      title = 'Your Hunt Pass has been deactivated';
      body = `We were unable to charge your card on file after several attempts, so your Hunt Pass has been deactivated. Resubscribe any time to restore it.`;
      break;
  }
  await createNotification({
    userId: u.id,
    type: `huntpass_billing_${stage}`,
    title,
    body,
    link: '/shopper/hunt-pass',
    channel: 'OPERATIONAL',
    sendEmail: true,
  }).catch((err: unknown) => {
    console.error(`[squareBillingChargeJob] Failed to send Hunt Pass ${stage} notification for user ${u.id}:`, err);
  });
}

async function handleHuntPassChargeFailure(u: DueHuntPassUser, reason: string): Promise<void> {
  const now = new Date();
  const graceEndsAt = u.huntPassGraceEndsAt ?? computeGraceEndsAt(now);

  if (now > graceEndsAt) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        huntPassActive: false,
        huntPassCancelledAt: now,
        huntPassDunningFailCount: 0,
        huntPassNextRetryAt: null,
        huntPassGraceEndsAt: null,
        huntPassLastFailureReason: reason,
      },
    });
    await sendHuntPassNotification(u, 'dunning_exhausted', reason);
    console.warn(`[squareBillingChargeJob] Hunt Pass dunning grace exhausted for user ${u.id} -- deactivated (reason: ${reason})`);
    return;
  }

  const isFirstFailure = u.huntPassDunningFailCount === 0;
  const newFailCount = u.huntPassDunningFailCount + 1;
  await prisma.user.update({
    where: { id: u.id },
    data: {
      huntPassDunningFailCount: newFailCount,
      huntPassNextRetryAt: computeNextRetryAt(now),
      huntPassGraceEndsAt: graceEndsAt,
      huntPassLastFailureReason: reason,
    },
  });
  await sendHuntPassNotification(u, isFirstFailure ? 'first_failure' : 'retry_failure', reason);
  console.warn(`[squareBillingChargeJob] Hunt Pass charge failed for user ${u.id} (attempt ${newFailCount}, reason: ${reason}) -- access retained`);
}

async function processHuntPassBilling(): Promise<void> {
  const now = new Date();

  const dueUsers = await prisma.user.findMany({
    where: {
      huntPassBillingProcessor: 'square',
      huntPassActive: true,
      huntPassSquareCustomerId: { not: null },
      huntPassSquareCardId: { not: null },
      huntPassExpiry: { lte: now },
      OR: [{ huntPassNextRetryAt: null }, { huntPassNextRetryAt: { lte: now } }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      huntPassSquareCustomerId: true,
      huntPassSquareCardId: true,
      huntPassExpiry: true,
      huntPassDunningFailCount: true,
      huntPassGraceEndsAt: true,
      huntPassCancelAtPeriodEnd: true,
    },
  });

  console.log(`[squareBillingChargeJob] ${dueUsers.length} Hunt Pass user(s) due for a Square billing run`);

  for (const u of dueUsers) {
    try {
      if (u.huntPassCancelAtPeriodEnd) {
        await prisma.user.update({
          where: { id: u.id },
          data: {
            huntPassActive: false,
            huntPassCancelledAt: now,
            huntPassCancelAtPeriodEnd: false,
            huntPassDunningFailCount: 0,
            huntPassNextRetryAt: null,
            huntPassGraceEndsAt: null,
            huntPassLastFailureReason: null,
          },
        });
        console.log(`[squareBillingChargeJob] Hunt Pass for user ${u.id} reached end of canceled period -- deactivated`);
        continue;
      }

      const result = await chargeStoredCard({
        customerId: u.huntPassSquareCustomerId!,
        cardId: u.huntPassSquareCardId!,
        amountCents: HUNT_PASS_PRICE_CENTS,
        idempotencyParts: ['huntpass-billing', u.id, u.huntPassExpiry!.toISOString()],
        note: 'FindA.Sale Hunt Pass renewal',
        referenceId: u.id,
      });

      if (result.ok) {
        const nextExpiry = addDays(u.huntPassExpiry ?? now, BILLING_INTERVAL_DAYS);
        await prisma.user.update({
          where: { id: u.id },
          data: {
            huntPassExpiry: nextExpiry,
            huntPassDunningFailCount: 0,
            huntPassNextRetryAt: null,
            huntPassGraceEndsAt: null,
            huntPassLastFailureReason: null,
          },
        });
        console.log(`[squareBillingChargeJob] Charged Hunt Pass renewal for user ${u.id} (payment ${result.paymentId})`);
      } else {
        await handleHuntPassChargeFailure(u, result.message);
      }
    } catch (err) {
      console.error(`[squareBillingChargeJob] Unexpected error processing Hunt Pass for user ${u.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Registration -- daily at 01:00 UTC, ahead of the 02:00-03:10 UTC job cluster
// (tierGraceCronJob/xpExpiryCron/huntPassExpiryCron/etc.) so a successful renewal here
// always lands before huntPassExpiryCron's legacy sweep would otherwise run (moot in
// practice since that cron now excludes huntPassBillingProcessor='square' rows, but keeping
// the natural ordering avoids any future confusion).
// ---------------------------------------------------------------------------

cron.schedule('0 1 * * *', cronGuard({ jobName: 'squareBillingChargeJob' }, async () => {
  await processOrganizerBilling();
  await processFrozenMigrationDeadlines();
  await processHuntPassBilling();
}));

console.log('[squareBillingChargeJob] Registered -- runs daily at 01:00 UTC');
