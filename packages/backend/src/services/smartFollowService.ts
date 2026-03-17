/**
 * Feature #32: Smart Follow Service
 *
 * Manages shopper subscriptions to organizer sales (SmartFollow).
 * When an organizer publishes a new sale, all shoppers following that
 * organizer receive email + push notifications (respecting preferences).
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

/**
 * Create a smart follow (shopper follows organizer for sale alerts)
 */
export const createFollow = async (userId: string, organizerId: string): Promise<any> => {
  return await prisma.smartFollow.create({
    data: {
      userId,
      organizerId,
      notifyEmail: true,
      notifyPush: true,
    },
  });
};

/**
 * Remove a smart follow
 */
export const removeFollow = async (userId: string, organizerId: string): Promise<void> => {
  await prisma.smartFollow.deleteMany({
    where: { userId, organizerId },
  });
};

/**
 * Get all organizers a user is following
 */
export const getUserFollows = async (userId: string): Promise<any[]> => {
  return await prisma.smartFollow.findMany({
    where: { userId },
    include: {
      organizer: {
        select: {
          id: true,
          businessName: true,
          profilePhoto: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Check if user already follows organizer
 */
export const getFollowStatus = async (userId: string, organizerId: string): Promise<boolean> => {
  const follow = await prisma.smartFollow.findUnique({
    where: {
      userId_organizerId: { userId, organizerId },
    },
  });
  return !!follow;
};

/**
 * When a new sale is published, notify all shoppers following that organizer
 */
export const checkFollowsForNewSale = async (sale: SaleInfo): Promise<void> => {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: {
        businessName: true,
        smartFollowers: {
          select: {
            notifyEmail: true,
            notifyPush: true,
            user: {
              select: {
                id: true,
                email: true,
                pushSubscriptions: true,
              },
            },
          },
        },
      },
    });

    if (!organizer || organizer.smartFollowers.length === 0) return;

    const saleUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${sale.id}`;
    const formattedDate = new Date(sale.startDate).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    for (const follow of organizer.smartFollowers) {
      // Email notification
      if (follow.notifyEmail && follow.user.email) {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale',
            to: follow.user.email,
            subject: `${organizer.businessName} posted a new sale: ${sale.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">New sale from ${organizer.businessName}!</h2>
                <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
                  <h3 style="margin-top: 0; color: #333;">${sale.title}</h3>
                  <p style="margin: 8px 0; color: #666;">📍 ${sale.address}, ${sale.city}, ${sale.state}</p>
                  <p style="margin: 8px 0; color: #666;">🕐 ${formattedDate}</p>
                </div>
                <p>
                  <a href="${saleUrl}"
                     style="background: #d97706; color: white; padding: 10px 20px;
                            text-decoration: none; border-radius: 4px; display: inline-block;">
                    View Sale
                  </a>
                </p>
                <p style="font-size: 14px; color: #999; margin-top: 30px;">
                  You're receiving this because you follow ${organizer.businessName} on FindA.Sale.<br/>
                  <a href="${process.env.FRONTEND_URL || 'https://finda.sale'}/settings/follows" style="color: #999;">Manage your follows</a>
                </p>
              </div>
            `,
          });
        } catch (err: any) {
          console.error(
            `✗ Smart follow email failed for user ${follow.user.id}:`,
            err?.message
          );
        }
      }

      // Push notification
      if (follow.notifyPush && follow.user.pushSubscriptions.length > 0) {
        for (const ps of follow.user.pushSubscriptions) {
          await sendPushNotification(ps, {
            title: `New sale from ${organizer.businessName}`,
            body: `${sale.title} · ${sale.city}, ${sale.state}`,
            url: saleUrl,
          }).catch((err: any) =>
            console.warn(
              `⚠ Smart follow push failed for user ${follow.user.id}:`,
              err?.message
            )
          );
        }
      }
    }

    console.log(
      `✓ Smart follow notifications dispatched for sale ${sale.id} — ${organizer.smartFollowers.length} follower(s)`
    );
  } catch (error) {
    console.error('✗ Error sending smart follow notifications:', error);
  }
};
