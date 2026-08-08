import { prisma } from '../lib/prisma';
import { emailService } from '../lib/emailService';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';

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
      return;
    }

    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    await emailService.emails.send({
      from: fromEmail,
      to: recipient,
      subject: emailSubject || title,
      html: `<p>Hi ${user.name || 'there'},</p><p>${body}</p>${link ? `<p><a href="${process.env.FRONTEND_URL}${link}">View Details</a></p>` : ''}`,
    });
  } catch (emailError) {
    // Fail open: log but don't throw — email failure should not affect the in-app notification already created above.
    console.error('[notification] Failed to send notification email:', emailError instanceof Error ? emailError.message : emailError);
  }
}
