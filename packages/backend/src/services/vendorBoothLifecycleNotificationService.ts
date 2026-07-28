/**
 * Vendor Booth Lifecycle Notification Service (2026-07-28)
 *
 * Closes every notification gap in the booth lifecycle AFTER the invite. Before this,
 * services/vendorBoothInviteEmailService.ts was the only thing in the whole lifecycle
 * that told anybody anything: a vendor could claim a booth (vendorBoothController.ts
 * claimVendorBooth :407) and the hub organizer was never told, by any channel. Since
 * claimVendorBooth deliberately sets ONLY userId -- not status, not confirmedAt -- the
 * booth stays PENDING, and addBoothCartItems refuses to sell from a non-CONFIRMED booth
 * (vendorBoothCartController.ts :396, :1417). A real vendor was therefore silently stuck
 * behind a confirmation nobody had been asked to make.
 *
 * Four transitions, four notifications:
 *   1. notifyOrganizerBoothClaimed         vendor claims        -> hub organizer
 *   2. notifyVendorBoothConfirmed          organizer confirms   -> vendor
 *   3. notifyVendorBoothDecision           rejected / cancelled -> vendor
 *   4. notifyOrganizerBoothStripeConnected vendor connects      -> hub organizer
 *   5. notifyBoothRentChargeFailed         rent charge fails    -> vendor AND hub organizer
 *
 * Each one does TWO things: an in-app notification AND an email.
 *
 * In-app: reuses the existing Notification inbox (schema.prisma model Notification,
 * services/notificationService.ts createNotification, surfaced by
 * frontend/components/NotificationBell.tsx and pages/notifications.tsx). No new
 * notification framework was invented -- one already existed and is used by
 * bountyController, flashDealController, itemController and posController.
 *
 * Email rail: Resend transactional (lib/transactionalEmailService.ts) via buildEmail(),
 * exactly as vendorBoothInviteEmailService does, and reusing that module's escapeHtml.
 * Sender is always "The FindA.Sale Team" (CLAUDE.md brand voice rule), never a person.
 *
 * ISOLATION: nothing here ever throws. Every function returns { sent, reason } for every
 * skip and every failure, and every caller invokes it fire-and-forget with a .catch(),
 * mirroring the invite trigger at vendorBoothController.ts :144-148. A claim, a confirm,
 * a rejection and a Stripe connect must all succeed with email completely down.
 *
 * IDEMPOTENCY: each transition stamps its own nullable DateTime column on VendorBooth
 * (claimNotifiedAt / confirmNotifiedAt / decisionNotifiedAt / stripeNotifiedAt), the same
 * "record that a send happened" pattern inviteSentAt uses. The stamp is checked FIRST and
 * written LAST, and it is written even when the email leg failed. That is deliberate: the
 * Stripe notification is driven by getVendorBoothStripeStatus, which re-reads Stripe on
 * every vendor page load, so a stamp that only advanced on email success would re-fire the
 * in-app alert on every poll. Losing one email is better than a repeating alert; the
 * failure is logged and the state is visible on the page either way.
 */

import { buildEmail } from './emailTemplateService';
import { escapeHtml } from './vendorBoothInviteEmailService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from './suppressionService';
import { createNotification } from './notificationService';
import { prisma } from '../lib/prisma';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

export type BoothNotifyResult = { sent: boolean; reason?: string };

/** Which stamp column guards which transition. Each is a real nullable VendorBooth column. */
type StampField = 'claimNotifiedAt' | 'confirmNotifiedAt' | 'decisionNotifiedAt' | 'stripeNotifiedAt';

/**
 * The one place an email actually leaves this module. Same two gates the invite service
 * uses, in the same order: recipient suppression/blocked-domain first (suppressionService
 * .isHardSuppressed also enforces the finda.sale domain policy), then the RESEND_API_KEY
 * environment gate -- transactionalEmailService returns silently without it, so without
 * this check we would report a send that never left the building.
 * Never throws.
 */
async function deliverEmail(to: string, subject: string, html: string, tag: string): Promise<BoothNotifyResult> {
  try {
    if (await suppressionService.isHardSuppressed(to)) {
      console.log(`[booth-lifecycle] ${tag}: skipping blocked or suppressed address: ${to}`);
      return { sent: false, reason: 'That email address cannot be emailed by FindA.Sale' };
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`[booth-lifecycle] ${tag}: RESEND_API_KEY not set, email NOT sent`);
      return { sent: false, reason: 'Email is not configured on this server' };
    }
    await transactionalEmailService.emails.send({ from: FROM_EMAIL, to, subject, html });
    console.log(`[booth-lifecycle] ${tag}: email sent to ${to}`);
    return { sent: true };
  } catch (error) {
    console.error(`[booth-lifecycle] ${tag}: email send failed:`, error);
    return { sent: false, reason: 'Could not send the email' };
  }
}

/**
 * Write the idempotency stamp. Never throws -- a stamp failure must not surface.
 * The data object is built from an explicit literal per field rather than a computed key
 * ({ [field]: ... }), which would widen to a string index signature and not match Prisma's
 * generated VendorBoothUpdateInput.
 */
async function stamp(boothId: string, field: StampField): Promise<void> {
  const now = new Date();
  try {
    if (field === 'claimNotifiedAt') {
      await prisma.vendorBooth.update({ where: { id: boothId }, data: { claimNotifiedAt: now } });
    } else if (field === 'confirmNotifiedAt') {
      await prisma.vendorBooth.update({ where: { id: boothId }, data: { confirmNotifiedAt: now } });
    } else if (field === 'decisionNotifiedAt') {
      await prisma.vendorBooth.update({ where: { id: boothId }, data: { decisionNotifiedAt: now } });
    } else {
      await prisma.vendorBooth.update({ where: { id: boothId }, data: { stripeNotifiedAt: now } });
    }
  } catch (error) {
    console.error(`[booth-lifecycle] Could not stamp ${field} on booth ${boothId}:`, error);
  }
}

/**
 * Everything every notification below needs, in one read. The select is written inline
 * here (not hoisted to a shared `as const` object) so Prisma infers the payload type the
 * ordinary way -- same shape as vendorBoothInviteEmailService's findUnique.
 */
async function loadBooth(boothId: string) {
  return prisma.vendorBooth.findUnique({
    where: { id: boothId },
    select: {
      id: true,
      hubId: true,
      boothNumber: true,
      vendorName: true,
      vendorEmail: true,
      boothFee: true,
      revenueSharePercent: true,
      status: true,
      userId: true,
      boothToken: true,
      deletedAt: true,
      inviteSentAt: true,
      claimNotifiedAt: true,
      confirmNotifiedAt: true,
      decisionNotifiedAt: true,
      stripeNotifiedAt: true,
      user: { select: { email: true } },
      hub: {
        select: {
          name: true,
          organizer: { select: { businessName: true, userId: true, user: { select: { email: true } } } },
        },
      },
    },
  });
}

/**
 * 1. Vendor claimed the booth -> tell the hub organizer.
 *
 * This is the gap that bit us: booth E1 at Maple Lake Mall was claimed successfully and
 * the organizer had no signal of any kind. The email states plainly that the booth cannot
 * be sold from until they confirm, because that is literally true (vendorBoothCartController
 * .ts :396 filters to status 'CONFIRMED').
 */
export async function notifyOrganizerBoothClaimed(boothId: string): Promise<BoothNotifyResult> {
  try {
    const booth = await loadBooth(boothId);
    if (!booth) return { sent: false, reason: 'Booth not found' };
    if (booth.deletedAt) return { sent: false, reason: 'Booth has been removed' };
    if (booth.claimNotifiedAt) return { sent: false, reason: 'Organizer was already notified of this claim' };
    if (!booth.userId) return { sent: false, reason: 'Booth is not claimed' };

    const organizerUserId = booth.hub?.organizer?.userId;
    const organizerEmail = booth.hub?.organizer?.user?.email;
    if (!organizerUserId) return { sent: false, reason: 'This hub has no organizer account' };

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'your market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'there');
    const boothsPath = `/organizer/hubs/${booth.hubId}/vendor-booths`;
    const boothsUrl = `${FRONTEND_URL}${boothsPath}`;

    // Booth is still PENDING at this point by design -- claimVendorBooth sets only userId.
    const needsConfirm = booth.status === 'PENDING';

    // In-app first, so the organizer gets the alert even if the email leg is skipped.
    await createNotification(
      organizerUserId,
      'vendor_booth',
      needsConfirm ? `Booth ${booth.boothNumber} claimed, confirm it` : `Booth ${booth.boothNumber} claimed`,
      needsConfirm
        ? `${booth.vendorName} claimed Booth ${booth.boothNumber} at ${booth.hub?.name || 'your market'}. Nothing can be sold from it until you confirm the booth.`
        : `${booth.vendorName} claimed Booth ${booth.boothNumber} at ${booth.hub?.name || 'your market'}.`,
      boothsPath,
      'OPERATIONAL'
    );

    let result: BoothNotifyResult = { sent: false, reason: 'No organizer email on file' };
    if (organizerEmail) {
      const confirmBlock = needsConfirm
        ? `<p><strong>One step is left, and it is yours.</strong> The booth is still marked pending. Nothing can be rung up or sold at Booth ${boothNumber} until you confirm it.</p>
        <p>Open your Vendor Booths page and press Confirm on Booth ${boothNumber}.</p>
        <p><strong>Once you confirm:</strong></p>
        <ul>
          <li>Items can be rung up and sold at Booth ${boothNumber}</li>
          <li>${vendorName} can connect a Stripe account so card payments reach them</li>
          <li>The booth appears in your checkout and settlement screens</li>
        </ul>`
        : `<p>Booth ${boothNumber} is already confirmed, so there is nothing you need to do.</p>`;

      const html = buildEmail({
        preheader: `${vendorName} claimed Booth ${boothNumber} at ${hubName}.`,
        headline: needsConfirm ? `Booth ${boothNumber} was claimed` : `Booth ${boothNumber} was claimed`,
        body: `<p>Hi ${organizerName},</p>
        <p>${vendorName} just claimed Booth ${boothNumber} at ${hubName}.</p>
        ${confirmBlock}
        <p>If you do not recognize this vendor, do not confirm the booth. Reply to this email and we will help you sort it out.</p>
        <p>If the button does not work, copy this link into your browser:<br />${boothsUrl}</p>
        <p>The FindA.Sale Team</p>`,
        ctaText: needsConfirm ? `Confirm Booth ${boothNumber}` : 'View Vendor Booths',
        ctaUrl: boothsUrl,
      });

      result = await deliverEmail(
        organizerEmail,
        `${booth.vendorName} claimed Booth ${booth.boothNumber} at ${booth.hub?.name || 'your market'}`,
        html,
        'claim'
      );
    }

    await stamp(booth.id, 'claimNotifiedAt');
    return result;
  } catch (error) {
    console.error(`[booth-lifecycle] notifyOrganizerBoothClaimed failed for booth ${boothId}:`, error);
    return { sent: false, reason: 'Could not send the claim notification' };
  }
}

/**
 * 2. Organizer confirmed the booth -> tell the vendor.
 *
 * The vendor claimed and then heard nothing at all. This tells them they are live and
 * what the one remaining step is (Stripe, so card payments can actually reach them).
 */
export async function notifyVendorBoothConfirmed(boothId: string): Promise<BoothNotifyResult> {
  try {
    const booth = await loadBooth(boothId);
    if (!booth) return { sent: false, reason: 'Booth not found' };
    if (booth.deletedAt) return { sent: false, reason: 'Booth has been removed' };
    if (booth.status !== 'CONFIRMED') return { sent: false, reason: `Booth is ${booth.status}, not CONFIRMED` };
    if (booth.confirmNotifiedAt) return { sent: false, reason: 'Vendor was already notified of this confirmation' };

    // Prefer the claiming account's own address over the organizer-typed vendorEmail.
    const vendorEmail = booth.user?.email || booth.vendorEmail;

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'the market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'The market organizer');
    const boothPath = `/vendor-booth/${booth.boothToken}`;
    const boothUrl = `${FRONTEND_URL}${boothPath}`;

    if (booth.userId) {
      await createNotification(
        booth.userId,
        'vendor_booth',
        `Booth ${booth.boothNumber} is confirmed`,
        `${booth.hub?.organizer?.businessName || 'The market organizer'} confirmed Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'}. Connect your Stripe account so card payments reach you.`,
        boothPath,
        'OPERATIONAL'
      );
    }

    let result: BoothNotifyResult = { sent: false, reason: 'No vendor email on file' };
    if (vendorEmail) {
      const boothFee = Number(booth.boothFee) || 0;
      const revenueShare = Number(booth.revenueSharePercent) || 0;
      const termsHtml =
        boothFee > 0 || revenueShare > 0
          ? `<p><strong>Your terms for this booth</strong></p>
        <ul>
          ${boothFee > 0 ? `<li>Booth rent: $${boothFee.toFixed(2)}</li>` : ''}
          ${revenueShare > 0 ? `<li>Revenue share: ${revenueShare}% of what sells at your booth</li>` : ''}
        </ul>`
          : '';

      const html = buildEmail({
        preheader: `Booth ${boothNumber} at ${hubName} is confirmed and ready to sell.`,
        headline: `Your booth is confirmed`,
        body: `<p>Hi ${vendorName},</p>
        <p>${organizerName} confirmed Booth ${boothNumber} at ${hubName}. Your booth is live, and items can now be rung up and sold at it.</p>
        <p><strong>One thing is left to do: connect your Stripe account.</strong> Until you do, card payments taken at your booth cannot be paid out to you. It takes a few minutes and you only do it once.</p>
        ${termsHtml}
        <p>Open your booth page to connect Stripe and to see what has sold at your booth.</p>
        <p>If the button does not work, copy this link into your browser:<br />${boothUrl}</p>
        <p>If anything about this booth looks wrong, contact ${organizerName} at ${hubName}.</p>
        <p>The FindA.Sale Team</p>`,
        ctaText: 'Connect Stripe',
        ctaUrl: boothUrl,
      });

      result = await deliverEmail(
        vendorEmail,
        `Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'} is confirmed`,
        html,
        'confirm'
      );
    }

    await stamp(booth.id, 'confirmNotifiedAt');
    return result;
  } catch (error) {
    console.error(`[booth-lifecycle] notifyVendorBoothConfirmed failed for booth ${boothId}:`, error);
    return { sent: false, reason: 'Could not send the confirmation notification' };
  }
}

/**
 * 3. Organizer rejected or cancelled the booth -> tell the vendor.
 *
 * Wording is deliberately neutral and non-accusatory: FindA.Sale does not know why the
 * organizer decided this, and must not imply the vendor did anything wrong. It points
 * them at the hub organizer, who is the only party who can reinstate the booth.
 *
 * Unlike the other three, this one does NOT bail on deletedAt: deleteVendorBooth
 * (vendorBoothController.ts :264) sets deletedAt AND status CANCELLED in one write, and a
 * vendor whose booth was just deleted is exactly the person who must not be left
 * wondering. It only skips when nobody was ever reachable -- no claim and no invite sent.
 */
export async function notifyVendorBoothDecision(boothId: string, decision: string): Promise<BoothNotifyResult> {
  try {
    if (decision !== 'REJECTED' && decision !== 'CANCELLED') {
      return { sent: false, reason: `No decision notification for status ${decision}` };
    }

    const booth = await loadBooth(boothId);
    if (!booth) return { sent: false, reason: 'Booth not found' };
    if (booth.decisionNotifiedAt) return { sent: false, reason: 'Vendor was already notified of this decision' };
    if (!booth.userId && !booth.inviteSentAt) {
      return { sent: false, reason: 'This booth was never claimed and never invited, so there is nobody to tell' };
    }

    const vendorEmail = booth.user?.email || booth.vendorEmail;

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'the market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'the market organizer');
    const wasRejected = decision === 'REJECTED';
    const headline = wasRejected ? `Booth ${boothNumber} was not confirmed` : `Booth ${boothNumber} has been cancelled`;

    if (booth.userId) {
      await createNotification(
        booth.userId,
        'vendor_booth',
        wasRejected
          ? `Booth ${booth.boothNumber} was not confirmed`
          : `Booth ${booth.boothNumber} has been cancelled`,
        `Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'} is not active. Contact ${booth.hub?.organizer?.businessName || 'the market organizer'} if you were expecting this booth.`,
        undefined,
        'OPERATIONAL'
      );
    }

    let result: BoothNotifyResult = { sent: false, reason: 'No vendor email on file' };
    if (vendorEmail) {
      const html = buildEmail({
        preheader: `Booth ${boothNumber} at ${hubName} is no longer active.`,
        headline,
        body: `<p>Hi ${vendorName},</p>
        <p>Booth ${boothNumber} at ${hubName} ${wasRejected ? 'was not confirmed' : 'has been cancelled'}, so it is not active. Nothing can be rung up or sold at it.</p>
        <p>This is the market organizer's decision to make, and we do not know the reason for it. If you were expecting to have this booth, contact ${organizerName} at ${hubName} directly. They can set it back up.</p>
        <p>Booth rent is only billed for confirmed booths, so no rent will be charged for this one.</p>
        <p>Any sales that were already rung up at this booth are unchanged, and you can still see them when you sign in.</p>
        <p>The FindA.Sale Team</p>`,
      });

      result = await deliverEmail(
        vendorEmail,
        wasRejected
          ? `Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'} was not confirmed`
          : `Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'} has been cancelled`,
        html,
        'decision'
      );
    }

    await stamp(booth.id, 'decisionNotifiedAt');
    return result;
  } catch (error) {
    console.error(`[booth-lifecycle] notifyVendorBoothDecision failed for booth ${boothId}:`, error);
    return { sent: false, reason: 'Could not send the decision notification' };
  }
}

/**
 * 4. Vendor finished Stripe onboarding -> tell the hub organizer.
 *
 * Last gate before real money can move: until stripeOnboarded is true, the vendor's leg
 * of a booth cart cannot be charged. The organizer should know without having to check.
 */
export async function notifyOrganizerBoothStripeConnected(boothId: string): Promise<BoothNotifyResult> {
  try {
    const booth = await loadBooth(boothId);
    if (!booth) return { sent: false, reason: 'Booth not found' };
    if (booth.deletedAt) return { sent: false, reason: 'Booth has been removed' };
    if (booth.stripeNotifiedAt) return { sent: false, reason: 'Organizer was already notified about this Stripe connection' };

    const organizerUserId = booth.hub?.organizer?.userId;
    const organizerEmail = booth.hub?.organizer?.user?.email;
    if (!organizerUserId) return { sent: false, reason: 'This hub has no organizer account' };

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'your market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'there');
    const boothsPath = `/organizer/hubs/${booth.hubId}/vendor-booths`;
    const boothsUrl = `${FRONTEND_URL}${boothsPath}`;

    // A booth can be Stripe-connected while still PENDING, so say so rather than
    // implying the booth is ready when the organizer still has to confirm it.
    const stillPending = booth.status !== 'CONFIRMED';

    await createNotification(
      organizerUserId,
      'vendor_booth',
      `Booth ${booth.boothNumber} connected Stripe`,
      stillPending
        ? `${booth.vendorName} connected Stripe for Booth ${booth.boothNumber} at ${booth.hub?.name || 'your market'}. The booth still needs your confirmation before anything can be sold from it.`
        : `${booth.vendorName} connected Stripe for Booth ${booth.boothNumber} at ${booth.hub?.name || 'your market'}. Card payments at that booth can now reach them.`,
      boothsPath,
      'OPERATIONAL'
    );

    let result: BoothNotifyResult = { sent: false, reason: 'No organizer email on file' };
    if (organizerEmail) {
      const pendingBlock = stillPending
        ? `<p><strong>Booth ${boothNumber} still needs your confirmation.</strong> It is marked ${escapeHtml(booth.status)}, and nothing can be rung up or sold at it until you confirm it on your Vendor Booths page.</p>`
        : `<p>That was the last setup step for this booth. Nothing else is needed from you.</p>`;

      const html = buildEmail({
        preheader: `${vendorName} finished Stripe setup for Booth ${boothNumber}.`,
        headline: `Booth ${boothNumber} can now take card payments`,
        body: `<p>Hi ${organizerName},</p>
        <p>${vendorName} finished connecting their Stripe account for Booth ${boothNumber} at ${hubName}.</p>
        <p>Card payments rung up at Booth ${boothNumber} now go to ${vendorName}. Your revenue share and the platform fee come off at the time of sale, so you do not have to collect anything after the fact.</p>
        ${pendingBlock}
        <p>If the button does not work, copy this link into your browser:<br />${boothsUrl}</p>
        <p>The FindA.Sale Team</p>`,
        ctaText: 'View Vendor Booths',
        ctaUrl: boothsUrl,
      });

      result = await deliverEmail(
        organizerEmail,
        `${booth.vendorName} connected Stripe for Booth ${booth.boothNumber}`,
        html,
        'stripe'
      );
    }

    await stamp(booth.id, 'stripeNotifiedAt');
    return result;
  } catch (error) {
    console.error(`[booth-lifecycle] notifyOrganizerBoothStripeConnected failed for booth ${boothId}:`, error);
    return { sent: false, reason: 'Could not send the Stripe notification' };
  }
}
/**
 * 5. A booth rent charge failed -> tell the vendor AND the hub organizer.
 *
 * Found while mapping the lifecycle: jobs/vendorBoothFeeBillingCron.ts writes
 * status 'FAILED' on a VendorBoothFeeCharge and moves on, telling nobody. The vendor's
 * card was declined and they had no idea; the hub owner did not get the rent and had no
 * idea either. The only surface was the fee-charges table, which someone had to think to
 * open.
 *
 * Idempotency comes from the cron's own structure rather than a new stamp column: the
 * VendorBoothFeeCharge row is created once per booth per period and a duplicate create
 * throws P2002, which the cron treats as alreadyBilled and skips before reaching any
 * charge attempt (vendorBoothFeeBillingCron.ts, the createErr?.code === 'P2002' branch).
 * A given charge row can therefore only reach FAILED once.
 */
export async function notifyBoothRentChargeFailed(chargeId: string): Promise<BoothNotifyResult> {
  try {
    const charge = await prisma.vendorBoothFeeCharge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        amountCents: true,
        periodStart: true,
        periodEnd: true,
        failureReason: true,
        vendorBooth: {
          select: {
            id: true,
            hubId: true,
            boothNumber: true,
            vendorName: true,
            vendorEmail: true,
            userId: true,
            boothToken: true,
            user: { select: { email: true } },
            hub: {
              select: {
                name: true,
                organizer: { select: { businessName: true, userId: true, user: { select: { email: true } } } },
              },
            },
          },
        },
      },
    });

    if (!charge || !charge.vendorBooth) return { sent: false, reason: 'Charge not found' };

    const booth = charge.vendorBooth;
    const amount = (charge.amountCents / 100).toFixed(2);
    const period = `${charge.periodStart.toISOString().slice(0, 10)} to ${charge.periodEnd.toISOString().slice(0, 10)}`;

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'the market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'the market organizer');
    const boothPath = `/vendor-booth/${booth.boothToken}`;
    const boothUrl = `${FRONTEND_URL}${boothPath}`;
    const boothsPath = `/organizer/hubs/${booth.hubId}/vendor-booths`;
    const boothsUrl = `${FRONTEND_URL}${boothsPath}`;

    // --- Vendor side: their card was declined, and they can fix it. ---
    const vendorEmail = booth.user?.email || booth.vendorEmail;
    if (booth.userId) {
      await createNotification(
        booth.userId,
        'vendor_booth',
        `Booth rent payment did not go through`,
        `The $${amount} rent for Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'} could not be charged. Update your card on your booth page.`,
        boothPath,
        'OPERATIONAL'
      );
    }

    let vendorResult: BoothNotifyResult = { sent: false, reason: 'No vendor email on file' };
    if (vendorEmail) {
      const html = buildEmail({
        preheader: `The rent payment for Booth ${boothNumber} did not go through.`,
        headline: `Your booth rent payment did not go through`,
        body: `<p>Hi ${vendorName},</p>
        <p>We tried to charge the $${amount} rent for Booth ${boothNumber} at ${hubName} for ${period}, and the payment did not go through.</p>
        <p>The most common reason is an expired or declined card. Open your booth page and add a working card, and we will try the charge again on the next run.</p>
        <p>Your booth is still active. Nothing has been shut off.</p>
        <p>If the button does not work, copy this link into your browser:<br />${boothUrl}</p>
        <p>If you think this is a mistake, contact ${organizerName} at ${hubName}.</p>
        <p>The FindA.Sale Team</p>`,
        ctaText: 'Update Your Card',
        ctaUrl: boothUrl,
      });
      vendorResult = await deliverEmail(
        vendorEmail,
        `Booth ${booth.boothNumber} rent payment did not go through`,
        html,
        'rent-failed-vendor'
      );
    }

    // --- Organizer side: they did not receive this rent. ---
    const organizerUserId = booth.hub?.organizer?.userId;
    const organizerEmail = booth.hub?.organizer?.user?.email;
    if (organizerUserId) {
      await createNotification(
        organizerUserId,
        'vendor_booth',
        `Booth ${booth.boothNumber} rent was not collected`,
        `The $${amount} rent from ${booth.vendorName} for Booth ${booth.boothNumber} could not be charged, so it has not reached you.`,
        boothsPath,
        'OPERATIONAL'
      );

      if (organizerEmail) {
        const html = buildEmail({
          preheader: `Booth ${boothNumber} rent for ${period} was not collected.`,
          headline: `Booth ${boothNumber} rent was not collected`,
          body: `<p>Hi ${escapeHtml(booth.hub?.organizer?.businessName || 'there')},</p>
          <p>We tried to charge ${vendorName} the $${amount} rent for Booth ${boothNumber} at ${hubName} for ${period}, and the payment did not go through. That money has not reached you.</p>
          <p>We have emailed ${vendorName} and asked them to add a working card. The charge will be tried again on the next billing run.</p>
          <p>You do not need to do anything right now. If it keeps failing, talk to ${vendorName} directly.</p>
          <p>If the button does not work, copy this link into your browser:<br />${boothsUrl}</p>
          <p>The FindA.Sale Team</p>`,
          ctaText: 'View Vendor Booths',
          ctaUrl: boothsUrl,
        });
        await deliverEmail(
          organizerEmail,
          `Booth ${booth.boothNumber} rent was not collected`,
          html,
          'rent-failed-organizer'
        );
      }
    }

    return vendorResult;
  } catch (error) {
    console.error(`[booth-lifecycle] notifyBoothRentChargeFailed failed for charge ${chargeId}:`, error);
    return { sent: false, reason: 'Could not send the rent failure notification' };
  }
}
