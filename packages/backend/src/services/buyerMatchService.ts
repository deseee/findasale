// Buyer-to-Sale Matching Service
// Matches newly published sales against shoppers' interest profiles
// and sends targeted email notifications to interested buyers

import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

interface MatchedBuyer {
  userId: string;
  email: string;
  name: string;
  score: number;
  matchReasons: string[];
}

interface ScoredUser {
  userId: string;
  email: string;
  name: string;
  score: number;
  matchReasons: string[];
  topCategories: string[];
}

/**
 * Scores a sale against a user's interest profile (0-100)
 * Scoring logic:
 * - Follows this organizer: +40 points
 * - Has purchased from this organizer before: +30 points
 * - Sale has items in user's categoryInterests: +20 points
 * - User has purchased/saved items in same categories: +10 points
 */
export async function scoreSaleForUser(userId: string, saleId: string): Promise<number> {
  try {
    const [user, sale] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            select: { category: true },
            where: { status: 'AVAILABLE' },
          },
        },
      }),
    ]);

    if (!user || !sale) return 0;

    let score = 0;
    const matchReasons: string[] = [];

    // Check if user follows the organizer
    const follow = await prisma.follow.findUnique({
      where: { userId_organizerId: { userId, organizerId: sale.organizerId } },
    });
    if (follow) {
      score += 40;
      matchReasons.push('You follow this organizer');
    }

    // Check if user has purchased from this organizer before
    const previousPurchase = await prisma.purchase.findFirst({
      where: {
        userId,
        sale: { organizerId: sale.organizerId },
      },
      take: 1,
    });
    if (previousPurchase) {
      score += 30;
      matchReasons.push('You\'ve bought from this organizer');
    }

    // Check if sale has items in user's interest categories
    const userInterests = user.categoryInterests || [];
    if (userInterests.length > 0) {
      const matchingItems = sale.items.filter((item) => item.category && userInterests.includes(item.category));
      if (matchingItems.length > 0) {
        score += 20;
        const uniqueCategories = [...new Set(matchingItems.map((i) => i.category).filter(Boolean))];
        matchReasons.push(`Items in your interests: ${uniqueCategories.join(', ')}`);
      }
    }

    // Check if user has purchased/saved items in same categories as this sale
    const saleCategories = new Set(sale.items.map((i) => i.category).filter(Boolean));
    if (saleCategories.size > 0) {
      const userCategoryHistory = await prisma.purchase.findMany({
        where: { userId },
        include: { item: { select: { category: true } } },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      const userHistoryCategories = new Set(
        userCategoryHistory.map((p) => p.item?.category).filter(Boolean)
      );

      const overlappingCategories = Array.from(saleCategories).filter((cat) =>
        userHistoryCategories.has(cat)
      );

      if (overlappingCategories.length > 0) {
        score += 10;
      }
    }

    return Math.min(score, 100);
  } catch (err) {
    console.error('[buyerMatch] Error scoring sale for user:', err);
    return 0;
  }
}

/**
 * Gets matched users for a newly published sale
 * Returns array of matched buyers with scores >= 30
 */
export async function getMatchedBuyersForSale(saleId: string): Promise<MatchedBuyer[]> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          select: { category: true, title: true },
          where: { status: 'AVAILABLE' },
        },
      },
    });

    if (!sale) return [];

    // Get all active shoppers (users with role USER)
    const shoppers = await prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, email: true, name: true, categoryInterests: true },
    });

    const matched: MatchedBuyer[] = [];

    // Score each shopper
    for (const shopper of shoppers) {
      const score = await scoreSaleForUser(shopper.id, saleId);

      if (score >= 30) {
        // Get match reasons
        const matchReasons: string[] = [];

        const follow = await prisma.follow.findUnique({
          where: {
            userId_organizerId: { userId: shopper.id, organizerId: sale.organizerId },
          },
        });
        if (follow) matchReasons.push('You follow this organizer');

        const prevPurchase = await prisma.purchase.findFirst({
          where: {
            userId: shopper.id,
            sale: { organizerId: sale.organizerId },
          },
          take: 1,
        });
        if (prevPurchase) matchReasons.push('You\'ve bought from this organizer');

        const userInterests = shopper.categoryInterests || [];
        if (userInterests.length > 0) {
          const matchingItems = sale.items.filter(
            (item) => item.category && userInterests.includes(item.category)
          );
          if (matchingItems.length > 0) {
            const uniqueCategories = [...new Set(matchingItems.map((i) => i.category).filter(Boolean))];
            matchReasons.push(`Items in your interests: ${uniqueCategories.join(', ')}`);
          }
        }

        matched.push({
          userId: shopper.id,
          email: shopper.email,
          name: shopper.name,
          score,
          matchReasons,
        });
      }
    }

    // Sort by score descending
    matched.sort((a, b) => b.score - a.score);

    return matched;
  } catch (err) {
    console.error('[buyerMatch] Error getting matched buyers:', err);
    return [];
  }
}

/**
 * Builds HTML email for matched buyer notification
 */
const buildMatchNotificationHtml = (
  name: string,
  sale: any,
  topCategories: string[],
  unsubEmail: string
): string => {
  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const categoryBadges = topCategories
    .slice(0, 3)
    .map(
      (cat) =>
        `<span style="display:inline-block; margin-right:8px; padding:4px 10px; background:#fed7aa; color:#92400e; border-radius:4px; font-size:12px; font-weight:600;">${cat}</span>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#fafaf9; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9; padding:24px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#d97706; padding:28px 32px; text-align:center;">
              <span style="font-size:26px; font-weight:700; color:#fff;">FindA.Sale</span>
              <p style="margin:8px 0 0; font-size:15px; color:#fde68a; font-weight:500;">A new sale matches your interests!</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#374151; margin:0 0 8px;">Hi ${name},</p>
              <p style="font-size:15px; color:#374151; margin:0 0 24px;">A new estate sale that matches your interests just went live! Check it out before items sell out.</p>

              <!-- Sale Card -->
              <div style="border:2px solid #fed7aa; border-radius:10px; padding:18px; background:#fffbf0; margin-bottom:20px;">
                <div style="font-size:18px; font-weight:700; color:#92400e; margin-bottom:8px;">${sale.title}</div>
                <div style="font-size:13px; color:#78350f; margin-bottom:12px;">${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}</div>
                <div style="display:inline-block; padding:6px 12px; background:#fcd34d; color:#78350f; border-radius:6px; font-size:12px; font-weight:600; margin-bottom:14px;">
                  ${formatDate(sale.startDate)}
                </div>
                <div style="margin-top:12px; padding-top:12px; border-top:1px solid #fde68a;">
                  <div style="font-size:12px; color:#92400e; font-weight:600; margin-bottom:6px;">YOUR INTERESTS:</div>
                  <div>${categoryBadges}</div>
                </div>
              </div>

              <!-- CTA -->
              <div style="text-align:center; margin-top:28px;">
                <a href="${FRONTEND_URL}/sales/${sale.id}" style="display:inline-block; padding:12px 32px; background:#d97706; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">
                  View Sale & Items
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f9f7f4; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="font-size:12px; color:#9ca3af; margin:0;">
                You're receiving this because a sale matches your interests on <a href="${FRONTEND_URL}" style="color:#d97706;">FindA.Sale</a>.<br/>
                <a href="${FRONTEND_URL}/profile" style="color:#9ca3af; text-decoration:none;">Manage notification preferences</a> ·
                <a href="${FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(unsubEmail)}" style="color:#9ca3af; text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Main function: notifies matched buyers when a sale is published
 * Called from saleController.updateSaleStatus after status is set to PUBLISHED
 */
export async function notifyMatchedBuyers(saleId: string): Promise<void> {
  try {
    console.log(`[buyerMatch] Starting notification job for sale ${saleId}`);

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          select: { category: true },
          where: { status: 'AVAILABLE' },
        },
      },
    });

    if (!sale) {
      console.error(`[buyerMatch] Sale ${saleId} not found`);
      return;
    }

    // Get matched buyers
    const matched = await getMatchedBuyersForSale(saleId);

    if (matched.length === 0) {
      console.log(`[buyerMatch] No matches found for sale ${saleId}`);
      return;
    }

    console.log(`[buyerMatch] Found ${matched.length} matched buyers for sale ${saleId}`);

    // Get top 3 categories from sale items
    const categoryCount = new Map<string, number>();
    sale.items.forEach((item) => {
      if (item.category) {
        categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
      }
    });
    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    // Send emails to each matched buyer
    let sent = 0;
    let errors = 0;

    for (const buyer of matched) {
      try {
        const html = buildMatchNotificationHtml(buyer.name || 'Shopper', sale, topCategories, buyer.email);

        await resend.emails.send({
          from: FROM_EMAIL,
          to: buyer.email,
          subject: `New sale you might like: ${sale.title}`,
          html,
        });

        // Create in-app notification for matched sale (fire-and-forget)
        createNotification(
          buyer.userId,
          'sale_alert',
          'New sale you might like',
          `${sale.title} is now live in ${sale.city}, ${sale.state}`,
          `/sales/${sale.id}`,
          'DISCOVERY'
        ).catch(err => console.error('[notification] Failed to create sale alert notification:', err));

        sent++;
        console.log(`[buyerMatch] Email sent to ${buyer.email}`);
      } catch (err) {
        errors++;
        console.error(`[buyerMatch] Failed to send email to ${buyer.email}:`, err);
      }
    }

    console.log(
      `[buyerMatch] Job complete for sale ${saleId}. Sent: ${sent}, Failed: ${errors}/${matched.length}`
    );
  } catch (err) {
    console.error('[buyerMatch] Job failed:', err);
    throw err;
  }
}
