import { prisma } from '../lib/prisma';
import { emailService } from '../lib/emailService';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';
import * as Sentry from '@sentry/node';

/**
 * Creates a notification record and stores it in the inbox.
 * Fire-and-forget: fails silently on error (Feature #109: graceful degradation).
 * Does not throw — prevents notification failures from crashing the process.
 *
 * S1195 (2026-08-08, notification-gap dispatch): added optional sendEmail/emailSubject
 * params so time-critical bidding events (OUTBID, AUCTION_WON) can also email the
 * recipient, not just write an in-app row. Mirrors the email-sending pattern already
 * used in packages/backend/src/lib/notificationService.ts (suppression + blocked-domain
 * checks, fail-open on email error). Existing callers that don't pass these two params
 * are unaffected — behavior is identical to before (in-app notification only).
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string,
  channel?: string,
  sendEmail?: boolean,
  emailSubject?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        link,
        channel: channel || 'OPERATIONAL',
      },
    });
  } catch (err) {
    // Feature #109: Graceful degradation — log but don't throw
    // Notification failures should not crash the application
    console.warn('[notification] Failed to create notification:', err instanceof Error ? err.message : err);
  }

  if (!sendEmail) {
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      // 2026-09-29 (OUTBID/AUCTION_WON delivery audit): a time-critical email that is skipped
      // must be visible, not silent. Sentry warning + log so a missing address is countable.
      console.warn(`[notificationService] ${type} email skipped: user ${userId} has no email address`);
      Sentry.captureMessage(`${type} email skipped: recipient has no email address`, {
        level: 'warning',
        tags: { kind: 'notification_email_skipped', notification_type: type, reason: 'no_email' },
        extra: { userId },
      });
      return;
    }

    const recipient = user.email;
    const isPlaceholder =
      !recipient ||
      !recipient.includes('@') ||
      isEmailDomainBlocked(recipient);

    if (isPlaceholder) {
      console.log(`[notificationService] Skipping blocked/placeholder recipient: ${recipient}`);
      return;
    }

    if (await suppressionService.isSuppressed(recipient)) {
      console.log(`[notificationService] Skipping suppressed recipient: ${recipient}`);
      Sentry.captureMessage(`${type} email skipped: recipient is suppressed`, {
        level: 'warning',
        tags: { kind: 'notification_email_skipped', notification_type: type, reason: 'suppressed' },
        extra: { userId },
      });
      return;
    }

    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    // Square migration Wave S2 #2 (2026-09-09) fix, found via knock-on grep: `link` is not
    // always a FindA.Sale-relative path -- services/auctionService.ts's closeAuction passes a
    // full absolute checkout URL (Stripe Checkout Session or, as of this dispatch, a Square
    // payment link) as `link` when notifying the auction winner. Blindly prefixing
    // FRONTEND_URL onto an already-absolute URL produced a broken concatenated link (e.g.
    // "https://finda.salehttps://checkout.square.site/..."), a pre-existing bug on the Stripe
    // side too (confirmed by direct read this dispatch) that would have equally corrupted the
    // new Square link if left as-is. An absolute URL is used verbatim; a relative path is still
    // prefixed with FRONTEND_URL exactly as before.
    const isAbsoluteLink = !!link && /^https?:\/\//i.test(link);
    const detailsUrl = link ? (isAbsoluteLink ? link : `${process.env.FRONTEND_URL}${link}`) : null;
    const sendResult: any = await emailService.emails.send({
      from: fromEmail,
      to: recipient,
      subject: emailSubject || title,
      html: `<p>Hi ${user.name || 'there'},</p><p>${body}</p>${detailsUrl ? `<p><a href="${detailsUrl}">View Details</a></p>` : ''}`,
      jobName: `notification_${type}`,
    });
    // 2026-09-29: emailService.emails.send returns undefined when the rail itself skipped the
    // send (blocked domain / hard suppression) and the Gmail API response otherwise. Log which,
    // with the Gmail message id, so "was it actually handed to Gmail?" is answerable from logs.
    const gmailId = sendResult?.data?.id;
    if (gmailId) {
      console.log(`[notificationService] ${type} email handed to Gmail for user ${userId} (gmailMessageId=${gmailId})`);
    } else {
      console.warn(`[notificationService] ${type} email NOT sent for user ${userId}: email rail skipped it (blocked/suppressed)`);
      Sentry.captureMessage(`${type} email not sent: email rail skipped it`, {
        level: 'warning',
        tags: { kind: 'notification_email_skipped', notification_type: type, reason: 'rail_skip' },
        extra: { userId },
      });
    }
  } catch (emailError) {
    // Fail open: log but don't throw — email failure should not affect the in-app notification already created above.
    console.error('[notification] Failed to send notification email:', emailError instanceof Error ? emailError.message : emailError);
    // 2026-09-29: errors thrown BEFORE the Gmail API call (quota guard, missing Gmail creds,
    // suppression lookup) never reached emailService's own Sentry capture, so they were
    // console-only and invisible. Capture them here with the notification type attached.
    Sentry.captureException(emailError, {
      tags: { kind: 'notification_email_failed', notification_type: type },
      extra: { userId },
    });
  }
}
