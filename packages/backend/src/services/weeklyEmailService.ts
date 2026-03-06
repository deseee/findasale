// CD2 Phase 2: Personalized weekly email recommendations for shoppers
// Sends curated upcoming sale items based on purchase/browse history every Sunday at 6pm

import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

interface WeeklyPickItem {
  id: string;
  title: string;
  price?: number;
  category?: string;
  photoUrls?: string[];
  saleName: string;
  saleStartDate: Date;
  saleCity: string;
  saleId: string;
}

// Extract category preferences from user's recent purchase/favorite history
const extractCategoryPreferences = async (userId: string): Promise<Set<string>> => {
  const recentPurchases = await prisma.purchase.findMany({
    where: { userId },
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: { item: { select: { category: true } } },
  });

  const recentFavorites = await prisma.favorite.findMany({
    where: { userId },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: { item: { select: { category: true } } },
  });

  const categories = new Set<string>();
  recentPurchases.forEach((p) => {
    if (p.item?.category) categories.add(p.item.category);
  });
  recentFavorites.forEach((f) => {
    if (f.item?.category) categories.add(f.item.category);
  });

  return categories;
};

// Build personalized picks for a shopper based on their history
const buildPersonalizedPicks = async (
  upcomingSales: any[],
  userCategories: Set<string>,
  limit: number = 8
): Promise<WeeklyPickItem[]> => {
  const picks: WeeklyPickItem[] = [];

  // Sort sales by start date (nearest first)
  const sortedSales = [...upcomingSales].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  for (const sale of sortedSales) {
    if (picks.length >= limit) break;

    // Prioritize items in user's preferred categories
    const itemsForSale = (sale.items || []).sort((a: any, b: any) => {
      const aCategoryMatch = userCategories.has(a.category);
      const bCategoryMatch = userCategories.has(b.category);
      if (aCategoryMatch && !bCategoryMatch) return -1;
      if (!aCategoryMatch && bCategoryMatch) return 1;
      return 0;
    });

    for (const item of itemsForSale) {
      if (picks.length >= limit) break;
      const photoUrl = item.photoUrls?.[0];
      picks.push({
        id: item.id,
        title: item.title || 'Estate Sale Item',
        price: item.price,
        category: item.category,
        photoUrls: photoUrl ? [photoUrl] : undefined,
        saleName: sale.title || 'Estate Sale',
        saleStartDate: new Date(sale.startDate),
        saleCity: sale.city || 'Grand Rapids',
        saleId: sale.id,
      });
    }
  }

  return picks;
};

// Build HTML email template
const buildEmailHtml = (name: string, picks: WeeklyPickItem[], unsubEmail: string): string => {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const itemCards = picks
    .map(
      (item) => `
    <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px; margin-bottom:12px; background:#fff; overflow:hidden;">
      ${
        item.photoUrls?.[0]
          ? `<img src="${item.photoUrls[0]}" alt="${item.title}" style="width:100%; max-height:160px; object-fit:cover; border-radius:6px; margin-bottom:10px; display:block;" />`
          : ''
      }
      <div style="font-weight:600; font-size:15px; color:#1f2937; margin-bottom:4px;">${item.title}</div>
      ${
        item.price
          ? `<div style="color:#d97706; font-weight:700; font-size:16px; margin-bottom:4px;">$${(item.price / 100).toFixed(2)}</div>`
          : ''
      }
      <div style="color:#6b7280; font-size:13px; margin-bottom:2px;">${item.saleName}</div>
      <div style="color:#6b7280; font-size:12px; margin-bottom:10px;">${item.saleCity} · ${formatDate(item.saleStartDate)}</div>
      <a href="${FRONTEND_URL}/items/${item.id}" style="display:inline-block; padding:6px 14px; background:#d97706; color:#fff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600;">View Item</a>
    </div>`
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
              <p style="margin:8px 0 0; font-size:15px; color:#fde68a; font-weight:500;">Your weekly estate sale picks 🏡</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#374151; margin:0 0 8px;">Hi ${name},</p>
              <p style="font-size:15px; color:#374151; margin:0 0 24px;">Here are the best items from upcoming estate sales this week based on your interests. Don't miss out — these won't last long!</p>

              <div>
                ${itemCards}
              </div>

              <div style="text-align:center; margin-top:28px; padding-top:28px; border-top:1px solid #e5e7eb;">
                <a href="${FRONTEND_URL}" style="display:inline-block; padding:12px 28px; background:#d97706; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">Browse All Sales</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f9f7f4; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="font-size:12px; color:#9ca3af; margin:0;">
                You're receiving this because you have an account at <a href="${FRONTEND_URL}" style="color:#d97706;">FindA.Sale</a>.<br/>
                <a href="${FRONTEND_URL}/profile" style="color:#9ca3af; text-decoration:none;">Manage email preferences</a> ·
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

// Send weekly picks email to a single user
const sendWeeklyPicksEmail = async (email: string, name: string, picks: WeeklyPickItem[]): Promise<void> => {
  const html = buildEmailHtml(name, picks, email);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your Weekly Estate Sale Picks 🏡',
      html,
    });
    console.log(`✓ Weekly picks email sent to ${email}`);
  } catch (err) {
    console.error(`✗ Failed to send weekly picks email to ${email}:`, err);
    throw err;
  }
};

// Main job: send weekly emails to all active shoppers
export const sendWeeklyEmails = async (): Promise<void> => {
  console.log('[WeeklyEmail] Starting weekly shopper email job...');

  try {
    // Get users active in last 30 days (at least one purchase, favorite, or profile update)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await prisma.user.findMany({
      where: {
        role: 'USER', // Only regular shoppers, not organizers
        updatedAt: { gte: thirtyDaysAgo },
        // Optional: filter by emailNotifications if field exists
        // emailNotifications: { not: false }
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    console.log(`[WeeklyEmail] Found ${activeUsers.length} active users to email`);

    // Get upcoming sales in next 14 days with items
    const twoWeeksFromNow = new Date();
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

    const upcomingSales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: { gte: new Date(), lte: twoWeeksFromNow },
      },
      include: {
        items: {
          where: { status: 'AVAILABLE' },
          take: 50,
          select: { id: true, title: true, price: true, category: true, photoUrls: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    console.log(`[WeeklyEmail] Found ${upcomingSales.length} upcoming sales`);

    if (upcomingSales.length === 0) {
      console.log('[WeeklyEmail] No upcoming sales found, skipping email sends');
      return;
    }

    let sent = 0;
    let errors = 0;

    // Send personalized emails to each user
    for (const user of activeUsers) {
      try {
        // Extract category preferences from user's history
        const userCategories = await extractCategoryPreferences(user.id);

        // Build personalized picks
        const picks = await buildPersonalizedPicks(upcomingSales, userCategories, 8);

        // Skip users with no relevant items
        if (picks.length === 0) {
          console.log(`[WeeklyEmail] No relevant items for ${user.email}, skipping`);
          continue;
        }

        // Send email
        await sendWeeklyPicksEmail(user.email, user.name || 'Shopper', picks);
        sent++;
      } catch (err) {
        console.error(`[WeeklyEmail] Failed to send to ${user.email}:`, err);
        errors++;
      }
    }

    console.log(
      `[WeeklyEmail] Job complete. Sent: ${sent}, Skipped: ${activeUsers.length - sent - errors}, Errors: ${errors}`
    );
  } catch (err) {
    console.error('[WeeklyEmail] Job failed:', err);
    throw err;
  }
};
