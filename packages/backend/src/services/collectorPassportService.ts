/**
 * Feature #45: Collector Passport Service
 *
 * Manages identity-based collection tracking. Shoppers define what they collect
 * (keywords + categories) and get personalized alerts when matching items appear
 * in new sales.
 *
 * Fire-and-forget pattern: checkPassportMatchForNewSale() never blocks sale publishing.
 * Errors are caught and logged but never thrown back to caller.
 */

import { prisma } from '../lib/prisma';
import { Resend } from 'resend';
import { sendPushNotification } from '../utils/webpush';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Get or create a collector passport for a user
 * Returns empty passport if not yet created
 */
export const getOrCreatePassport = async (userId: string): Promise<any> => {
  // upsert is race-safe: concurrent calls won't produce P2002 unique constraint errors
  const passport = await prisma.collectorPassport.upsert({
    where: { userId },
    create: {
      userId,
      bio: null,
      specialties: [],
      categories: [],
      keywords: [],
      notifyEmail: true,
      notifyPush: true,
      totalFinds: 0,
      isPublic: true,
    },
    update: {}, // no-op — just return the existing record
  });

  return passport;
};

/**
 * Update a user's collector passport
 */
export const updatePassport = async (
  userId: string,
  data: {
    bio?: string | null;
    specialties?: string[];
    categories?: string[];
    keywords?: string[];
    notifyEmail?: boolean;
    notifyPush?: boolean;
    isPublic?: boolean;
  }
): Promise<any> => {
  // Ensure passport exists first
  await getOrCreatePassport(userId);

  return await prisma.collectorPassport.update({
    where: { userId },
    data: {
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.specialties && { specialties: data.specialties }),
      ...(data.categories && { categories: data.categories }),
      ...(data.keywords && { keywords: data.keywords }),
      ...(data.notifyEmail !== undefined && { notifyEmail: data.notifyEmail }),
      ...(data.notifyPush !== undefined && { notifyPush: data.notifyPush }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      updatedAt: new Date(),
    },
  });
};

/**
 * Get a public collector passport by userId
 * Returns 404 if not found or user's passport is private
 */
export const getPublicPassport = async (userId: string): Promise<any> => {
  const passport = await prisma.collectorPassport.findUnique({
    where: { userId },
    select: {
      id: true,
      bio: true,
      specialties: true,
      categories: true,
      totalFinds: true,
      isPublic: true,
      createdAt: true,
      user: {
        select: { id: true, name: true },
      },
    },
  });

  if (!passport) return null;

  // Check if public
  if (!passport.isPublic) return null;

  return passport;
};

/**
 * Match items in a new sale against all collector passports
 * Send email + push notifications to matching collectors
 *
 * Fire-and-forget: Never block sale publishing. Catch all errors.
 */
export const checkPassportMatchForNewSale = async (saleId: string): Promise<void> => {
  try {
    // Fetch all items in the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            category: true,
            tags: true,
            price: true,
            photoUrls: true,
          },
        },
        organizer: {
          select: { businessName: true },
        },
      },
    });

    if (!sale || sale.items.length === 0) return;

    // Fetch all collector passports
    const passports = await prisma.collectorPassport.findMany({
      where: {
        OR: [{ notifyEmail: true }, { notifyPush: true }],
      },
      include: {
        user: {
          select: { id: true, email: true, pushSubscriptions: true },
        },
      },
    });

    if (passports.length === 0) return;

    // Check each passport against items in the sale
    for (const passport of passports) {
      const matchedItems = findMatchingItems(
        sale.items,
        passport.specialties,
        passport.categories,
        passport.keywords
      );

      if (matchedItems.length === 0) continue;

      // Send notifications
      if (passport.notifyEmail && passport.user.email) {
        sendMatchNotificationEmail(
          passport.user.email,
          passport.user.id,
          matchedItems,
          sale
        ).catch((err) => {
          console.error(
            `[collectorPassport] Failed to send email to ${passport.user.email}:`,
            err
          );
        });
      }

      if (passport.notifyPush && passport.user.pushSubscriptions.length > 0) {
        sendMatchNotificationPush(
          passport.user.pushSubscriptions,
          matchedItems,
          sale
        ).catch((err) => {
          console.error(
            `[collectorPassport] Failed to send push to user ${passport.user.id}:`,
            err
          );
        });
      }
    }
  } catch (error) {
    console.error('[collectorPassport] checkPassportMatchForNewSale failed:', error);
    // Never throw — fire-and-forget
  }
};

/**
 * Find items matching passport specialties, categories, keywords
 * Matching is case-insensitive substring
 */
const findMatchingItems = (
  items: any[],
  specialties: string[],
  categories: string[],
  keywords: string[]
): any[] => {
  return items.filter((item) => {
    // Check category match
    if (categories.length > 0 && item.category) {
      if (categories.includes(item.category)) return true;
    }

    // Check keyword match (case-insensitive substring in title)
    if (keywords.length > 0) {
      const titleLower = item.title.toLowerCase();
      for (const keyword of keywords) {
        if (titleLower.includes(keyword.toLowerCase())) return true;
      }
    }

    // Check specialty match (case-insensitive substring in title or tags)
    if (specialties.length > 0) {
      const titleLower = item.title.toLowerCase();
      const tagsLower = (item.tags || []).map((t: string) => t.toLowerCase());

      for (const specialty of specialties) {
        const specialtyLower = specialty.toLowerCase();
        if (titleLower.includes(specialtyLower)) return true;
        if (tagsLower.some((t: string) => t.includes(specialtyLower))) return true;
      }
    }

    return false;
  });
};

/**
 * Send email notification to collector about matching items
 */
const sendMatchNotificationEmail = async (
  email: string,
  userId: string,
  matchedItems: any[],
  sale: any
): Promise<void> => {
  const itemList = matchedItems
    .slice(0, 5) // Show top 5 in email
    .map((item) => `- ${item.title} ($${item.price ?? 'Contact for price'})`)
    .join('\n');

  const saleUrl = `${process.env.FRONTEND_URL || 'https://findasale.com'}/sales/${sale.id}`;

  const html = `
    <h2>Your Collection Matched! 🏺</h2>
    <p>Hi,</p>
    <p>We found ${matchedItems.length} item${matchedItems.length !== 1 ? 's' : ''} matching your collection interests in a new sale by <strong>${sale.organizer.businessName}</strong>.</p>

    <h3>Matching Items:</h3>
    <pre>${itemList}</pre>

    ${matchedItems.length > 5 ? `<p><em>...and ${matchedItems.length - 5} more item${matchedItems.length - 5 !== 1 ? 's' : ''}</em></p>` : ''}

    <p><a href="${saleUrl}">View the Sale</a></p>
    <p>Happy collecting!</p>
  `;

  await resend.emails.send({
    from: 'FindA.Sale <notifications@findasale.com>',
    to: email,
    subject: `${matchedItems.length} item${matchedItems.length !== 1 ? 's' : ''} match your collection!`,
    html,
  });
};

/**
 * Send push notification to collector about matching items
 */
const sendMatchNotificationPush = async (
  pushSubscriptions: any[],
  matchedItems: any[],
  sale: any
): Promise<void> => {
  const message = {
    title: `${matchedItems.length} items match your collection!`,
    body: `Found in ${sale.organizer.businessName}'s sale`,
    tag: `collector-match-${sale.id}`,
    data: {
      saleId: sale.id,
      action: 'view-sale',
    },
  };

  for (const subscription of pushSubscriptions) {
    await sendPushNotification(subscription, message).catch((err) => {
      console.error('[collectorPassport] Push notification failed:', err);
    });
  }
};

/**
 * Get matching items from published sales (recent 30 days) for a passport
 */
export const getMatchingItems = async (passportId: string): Promise<any[]> => {
  const passport = await prisma.collectorPassport.findUnique({
    where: { id: passportId },
  });

  if (!passport) return [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const items = await prisma.item.findMany({
    where: {
      sale: {
        status: 'PUBLISHED',
        createdAt: { gte: thirtyDaysAgo },
      },
      isActive: true,
    },
    include: {
      sale: {
        select: { id: true, title: true, organizerId: true },
      },
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  return findMatchingItems(
    items,
    passport.specialties,
    passport.categories,
    passport.keywords
  );
};

/**
 * Increment totalFinds counter when user purchases a matched item
 */
export const incrementTotalFinds = async (userId: string): Promise<void> => {
  try {
    await prisma.collectorPassport.update({
      where: { userId },
      data: { totalFinds: { increment: 1 } },
    });
  } catch (error) {
    console.error('[collectorPassport] incrementTotalFinds failed:', error);
  }
};
