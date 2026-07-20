/**
 * Phase 17: Notify followers when an organizer publishes a new sale.
 * Sends email (via Resend) and/or push (via VAPID) based on each
 * follower's notifyEmail / notifyPush preference on the Follow row.
 *
 * Called fire-and-forget from saleController.updateSaleStatus.
 * Errors are logged but never bubble up — notification failure must
 * never block or fail the publish response.
 */

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { buildNewSaleAlertEmail } from './emailTemplateService';
import { sendPushNotification } from '../utils/webpush';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';


interface SaleInfo {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  startDate: Date;
  organizerId: string;
}

export const notifyFollowersOfNewSale = async (sale: SaleInfo): Promise<void> => {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: {
        businessName: true,
        followers: {
          select: {
            notifyEmail: true,
            notifyPush:  true,
            user: {
              select: {
                id:                true,
                email:             true,
                pushSubscriptions: true,
              },
            },
          },
        },
      },
    });

    if (!organizer || organizer.followers.length === 0) return;

    const saleUrl       = `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${sale.id}`;
    const manageUrl     = `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizers/${sale.organizerId}`;
    const formattedDate = new Date(sale.startDate).toLocaleString('en-US', {
      weekday: 'short',
      month:   'short',
      day:     'numeric',
      hour:    '2-digit',
      minute:  '2-digit',
      hour12:  true,
    });

    for (const follow of organizer.followers) {
      const emailSuppressed = follow.user.email ? await suppressionService.isSuppressed(follow.user.email) : false;
      if (emailSuppressed) console.log('[followerNotify] Skipped suppressed recipient:', follow.user.email);
      // ── Email ──────────────────────────────────────────────────────────────
      if (follow.notifyEmail && follow.user.email && !emailSuppressed) {
        try {
await emailService.emails.send({
            from:    process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
            to:      follow.user.email,
            subject: `${organizer.businessName} just posted a sale near you`,
            html:    buildNewSaleAlertEmail({
              organizerName: organizer.businessName,
              sale: {
                title:     sale.title,
                dateRange: formattedDate,
                address:   `${sale.address}, ${sale.city}, ${sale.state}`,
                saleUrl,
              },
              unsubUrl: `${process.env.FRONTEND_URL || 'https://finda.sale'}/unsubscribe?reason=follows&org=${sale.organizerId}`,
            }),
          });
        } catch (err: any) {
          console.error(
            `✗ Follow notify email failed for user ${follow.user.id}:`,
            err?.message
          );
        }
      }

      // ── Push ───────────────────────────────────────────────────────────────
      if (follow.notifyPush && follow.user.pushSubscriptions.length > 0) {
        for (const ps of follow.user.pushSubscriptions) {
          await sendPushNotification(ps, {
            title: `New sale: ${sale.title}`,
            body:  `${organizer.businessName} · ${sale.city}, ${sale.state} · ${formattedDate}`,
            url:   saleUrl,
          }, { userId: follow.user.id, type: 'NEW_SALE_FOLLOW' }).catch((err: any) =>
            console.warn(
              `⚠ Follow push failed for user ${follow.user.id}:`,
              err?.message
            )
          );
        }
      }

      // ── In-App Notification ────────────────────────────────────────────────
      try {
        await createNotification({
          userId: follow.user.id,
          type: 'sale_alert',
          title: `New sale from ${organizer.businessName}`,
          body: `${sale.title} · ${sale.city}, ${sale.state}`,
          link: `/sales/${sale.id}`,
          channel: 'OPERATIONAL',
        });
      } catch (err: any) {
        console.error(
          `✗ Follow in-app notification failed for user ${follow.user.id}:`,
          err?.message
        );
      }
    }

    console.log(
      `✓ Follow notifications dispatched for sale ${sale.id} — ${organizer.followers.length} follower(s)`
    );
  } catch (error) {
    // Non-fatal: never block the publish response
    console.error('✗ Error sending follow notifications:', error);
  }
};
