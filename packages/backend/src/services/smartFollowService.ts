/**
 * Feature #32: Smart Follow Service
 *
 * Manages shopper subscriptions to organizer sales (SmartFollow).
 * When an organizer publishes a new sale, all shoppers following that
 * organizer receive email + push notifications (respecting preferences).
 */

import { prisma } from '../lib/prisma';
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

/**
 * CANONICAL STORE DECISION (2026-09-29): the `Follow` table is the single source of truth for
 * shopper -> organizer follows (the Follow buttons write it via POST /organizers/:id/follow).
 * `SmartFollow` was a parallel table that nothing populated, so the shopper dashboard and wishlist
 * "Sellers" lists (which read /smart-follows/my) were always empty.
 *
 * The functions below therefore read/write `Follow`, returning the same response shape the
 * SmartFollow endpoints always had (id, userId, organizerId, notifyEmail, notifyPush, createdAt,
 * organizer{ id, businessName, profilePhoto }). Legacy SmartFollow rows are still honoured:
 *   - removeFollow deletes from BOTH tables so a legacy row cannot keep notifying after unfollow
 *   - getUserFollows copies any legacy SmartFollow rows into Follow first (idempotent, no dupes)
 *   - checkFollowsForNewSale only notifies legacy-only users (Follow users are notified by
 *     followerNotificationService), so nobody gets two notifications for one sale
 * The legacy helpers below (legacy*) keep the original SmartFollow-table behaviour available.
 */
const ORGANIZER_SELECT = {
  id: true,
  businessName: true,
  profilePhoto: true,
} as const;

/**
 * Copy this user's legacy SmartFollow rows into Follow (skipping any that already exist).
 * Safe to call repeatedly. Never throws (a failure here must not break the read path).
 */
export const syncLegacySmartFollowsForUser = async (userId: string): Promise<number> => {
  try {
    const legacy = await prisma.smartFollow.findMany({
      where: { userId },
      select: { organizerId: true, notifyEmail: true, notifyPush: true, createdAt: true },
    });
    if (legacy.length === 0) return 0;
    const result = await prisma.follow.createMany({
      data: legacy.map((row) => ({
        userId,
        organizerId: row.organizerId,
        notifyEmail: row.notifyEmail,
        notifyPush: row.notifyPush,
        createdAt: row.createdAt,
      })),
      skipDuplicates: true,
    });
    return result.count;
  } catch (err: any) {
    console.warn('[smartFollow] legacy sync skipped:', err?.message);
    return 0;
  }
};

/**
 * Create a follow (shopper follows organizer for sale alerts). Writes the canonical Follow table.
 * Idempotent: an existing Follow row is returned unchanged.
 */
export const createFollow = async (userId: string, organizerId: string): Promise<any> => {
  return await prisma.follow.upsert({
    where: { userId_organizerId: { userId, organizerId } },
    update: {},
    create: {
      userId,
      organizerId,
      notifyEmail: true,
      notifyPush: true,
    },
    include: { organizer: { select: ORGANIZER_SELECT } },
  });
};

/**
 * Remove a follow. Deletes from Follow and from the legacy SmartFollow table so that a legacy
 * row cannot keep sending alerts after the shopper unfollows.
 */
export const removeFollow = async (userId: string, organizerId: string): Promise<void> => {
  await prisma.follow.deleteMany({
    where: { userId, organizerId },
  });
  await prisma.smartFollow.deleteMany({
    where: { userId, organizerId },
  });
};

/**
 * Get all organizers a user is following (reads Follow; same shape as the old SmartFollow list).
 */
export const getUserFollows = async (userId: string): Promise<any[]> => {
  await syncLegacySmartFollowsForUser(userId);
  return await prisma.follow.findMany({
    where: { userId },
    include: {
      organizer: {
        select: ORGANIZER_SELECT,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Check if user already follows organizer (Follow, or a not-yet-synced legacy SmartFollow row).
 */
export const getFollowStatus = async (userId: string, organizerId: string): Promise<boolean> => {
  const follow = await prisma.follow.findUnique({
    where: {
      userId_organizerId: { userId, organizerId },
    },
  });
  if (follow) return true;
  const legacy = await prisma.smartFollow.findUnique({
    where: {
      userId_organizerId: { userId, organizerId },
    },
  });
  return !!legacy;
};

// ---------------------------------------------------------------------------
// Legacy SmartFollow-table helpers (kept, not deleted). Nothing in the app calls these after the
// 2026-09-29 canonicalization, but they preserve the original SmartFollow behaviour.
// ---------------------------------------------------------------------------

export const legacyCreateSmartFollow = async (userId: string, organizerId: string): Promise<any> => {
  return await prisma.smartFollow.create({
    data: {
      userId,
      organizerId,
      notifyEmail: true,
      notifyPush: true,
    },
  });
};

export const legacyRemoveSmartFollow = async (userId: string, organizerId: string): Promise<void> => {
  await prisma.smartFollow.deleteMany({
    where: { userId, organizerId },
  });
};

export const legacyGetUserSmartFollows = async (userId: string): Promise<any[]> => {
  return await prisma.smartFollow.findMany({
    where: { userId },
    include: {
      organizer: {
        select: ORGANIZER_SELECT,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
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

    // Dedupe (2026-09-29): users who also have a Follow row for this organizer are notified by
    // followerNotificationService.notifyFollowersOfNewSale (called alongside this function from
    // saleController). Only legacy-only SmartFollow users are notified here, so every follower
    // gets exactly one notification per new sale.
    const followRows = await prisma.follow.findMany({
      where: { organizerId: sale.organizerId },
      select: { userId: true },
    });
    const alreadyNotifiedByFollow = new Set(followRows.map((f) => f.userId));
    const legacyOnlyFollowers = organizer.smartFollowers.filter(
      (f) => !alreadyNotifiedByFollow.has(f.user.id)
    );
    if (legacyOnlyFollowers.length === 0) return;

    const saleUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${sale.id}`;
    const formattedDate = new Date(sale.startDate).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    for (const follow of legacyOnlyFollowers) {
      const emailSuppressed = follow.user.email ? await suppressionService.isSuppressed(follow.user.email) : false;
      if (emailSuppressed) console.log('[smartFollow] Skipped suppressed recipient:', follow.user.email);
      // Email notification
      if (follow.notifyEmail && follow.user.email && !emailSuppressed) {
        try {
          // Real per-user unsubscribe token (bug fix, 2026-09-06): this email previously had
          // NO unsubscribe link at all (only a "manage your follows" settings link) -- adding
          // one via the same buildUnsubscribeLinks scheme used by followerNotificationService.ts
          // (the parallel Follow-based alert path). Type 'newSales' matches
          // TYPE_TO_PREF_MAP's emailNewSalesFromFollowed field.
          const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
          const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(follow.user.id, 'newSales');
          await emailService.emails.send({
            from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
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
                  <a href="${unsubUrl}" style="color: #999;">Unsubscribe</a> &middot;
                  <a href="${process.env.FRONTEND_URL || 'https://finda.sale'}/settings/follows" style="color: #999;">Manage your follows</a>
                </p>
              </div>
            `,
            listUnsubscribe: listUnsubscribeHeader,
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
          }, { userId: follow.user.id, type: 'SMART_FOLLOW_NEW_SALE' }).catch((err: any) =>
            console.warn(
              `⚠ Smart follow push failed for user ${follow.user.id}:`,
              err?.message
            )
          );
        }
      }
    }

    console.log(
      `✓ Smart follow notifications dispatched for sale ${sale.id} — ${legacyOnlyFollowers.length} legacy-only follower(s)`
    );
  } catch (error) {
    console.error('✗ Error sending smart follow notifications:', error);
  }
};
