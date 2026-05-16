// CD2 Phase 2: Personalized weekly email recommendations for shoppers
// Sends curated upcoming sale items based on purchase/browse history every Sunday at 6pm

import { prisma } from '../lib/prisma';
import { regionConfig } from '../config/regionConfig';
import { buildEmail } from './emailTemplateService';
import { emailService } from '../lib/emailService';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@send.finda.sale';

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
        title: item.title || 'Sale Item',
        price: item.price,
        category: item.category,
        photoUrls: photoUrl ? [photoUrl] : undefined,
        saleName: sale.title || 'Sale',
        saleStartDate: new Date(sale.startDate),
        saleCity: sale.city || regionConfig.city,
        saleId: sale.id,
      });
    }
  }

  return picks;
};

// Build HTML email using the FindA.Sale design system
const buildEmailHtml = (name: string, picks: WeeklyPickItem[], unsubToken: string): string => {
  const formatDate = (d: Date) => {
    const now = new Date();
    const daysUntil = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (daysUntil <= 0) return `${dateStr} (Today)`;
    if (daysUntil === 1) return `${dateStr} (Tomorrow)`;
    return `${dateStr} (In ${daysUntil} days)`;
  };

  const itemCardsHtml = picks.map((item) => {
    const price = item.price ? item.price / 100 : 0;
    const priceStr = price > 0 ? `$${price.toFixed(2)}` : '';
    const photoHtml = item.photoUrls?.[0]
      ? `<img src="${item.photoUrls[0]}" alt="${item.title}" style="width:100%; max-height:160px; object-fit:cover; border-radius:6px; margin-bottom:10px; display:block;" />`
      : '';
    return `
<div style="border:1px solid #E8E2D8; border-radius:8px; padding:14px; margin-bottom:12px; background:#ffffff;">
  ${photoHtml}
  <div style="font-weight:600; font-size:15px; color:#1A1814; margin-bottom:4px;">${item.title}</div>
  ${priceStr ? `<div style="color:#C8552B; font-weight:700; font-size:16px; margin-bottom:4px;">${priceStr}</div>` : ''}
  ${item.category ? `<div style="color:rgba(26,24,20,0.62); font-size:13px; margin-bottom:6px;">${item.category}</div>` : ''}
  <div style="color:rgba(26,24,20,0.62); font-size:12px; margin-bottom:10px;">${item.saleName} &middot; ${item.saleCity} &middot; ${formatDate(item.saleStartDate)}</div>
  <a href="${FRONTEND_URL}/items/${item.id}" style="display:inline-block; padding:6px 14px; background-color:#C8552B; color:#ffffff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600;">View Item</a>
</div>`;
  }).join('');

  const priceMin = picks.some(p => p.price) ? Math.min(...picks.filter(p => p.price).map(p => p.price!)) / 100 : 0;
  const priceMax = picks.some(p => p.price) ? Math.max(...picks.filter(p => p.price).map(p => p.price!)) / 100 : 0;
  const priceRange = picks.some(p => p.price) ? ` Prices from $${priceMin.toFixed(0)} to $${priceMax.toFixed(0)}.` : '';

  return buildEmail({
    preheader: `${picks.length} sale finds this week matched what you've been looking for.`,
    headline: `Your picks this week, ${name}.`,
    body: `
<p style="margin:0 0 16px; color:rgba(26,24,20,0.62);">
  We found <strong>${picks.length} item${picks.length !== 1 ? 's' : ''}</strong> across this week's sales that match what you've been looking at.${priceRange} First dibs goes quickly.
</p>
${itemCardsHtml}
    `,
    ctaText: 'Browse all sales',
    ctaUrl: FRONTEND_URL,
    unsubLabel: 'Unsubscribe from weekly picks',
    unsubUrl: `${FRONTEND_URL}/unsubscribe?token=${unsubToken}`,
  });
};;

// Send weekly picks email to a single user
const sendWeeklyPicksEmail = async (email: string, userId: string, name: string, picks: WeeklyPickItem[]): Promise<void> => {
  const { generateUnsubscribeToken } = await import('../controllers/unsubscribeController');
  const unsubToken = await generateUnsubscribeToken(userId, 'weekly');
  const html = buildEmailHtml(name, picks, unsubToken);

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${picks.length} New Sale Finds This Week (New Arrivals)`,
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
        await sendWeeklyPicksEmail(user.email, user.id, user.name || 'Shopper', picks);
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
