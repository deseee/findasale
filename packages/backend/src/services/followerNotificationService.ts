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
import { Resend } from 'resend';
import { sendPushNotification } from '../utils/webpush';

const resend = new Resend(process.env.RESEND_API_KEY);

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
      // ── Email ──────────────────────────────────────────────────────────────
      if (follow.notifyEmail && follow.user.email) {
        try {
          await resend.emails.send({
            from:    process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale',
            to:      follow.user.email,
            subject: `New sale from ${organizer.businessName}: ${sale.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${organizer.businessName} just posted a new sale!</h2>

                <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
                  <h3 style="margin-top: 0; color: #333;">${sale.title}</h3>
                  <p style="margin: 8px 0; color: #666;">📍 ${sale.address}, ${sale.city}, ${sale.state}</p>
                  <p style="margin: 8px 0; color: #666;">🕐 ${formattedDate}</p>
                </div>

                <p>
                  <a href="${saleUrl}"
                     style="background: #d97706; color: white; padding: 10px 20px;
                            text-decoration: none; border-radius: 4px; display: inline-block;">
                    View Sale Details
                  </a>
                </p>

                <p style="font-size: 14px; color: #999; margin-top: 30px;">
                  You're receiving this because you follow ${organizer.businessName} on FindA.Sale.<br/>
                  <a href="${manageUrl}" style="color: #999;">Manage your follows</a>
                </p>
              </div>
            `,
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
          }).catch((err: any) =>
            console.warn(
              `⚠ Follow push failed for user ${follow.user.id}:`,
              err?.message
            )
          );
        }
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
