// Wishlist Match Email Service
// Notifies shoppers when new items match their wishlist keywords

import { prisma } from '../lib/prisma';
import { buildEmail, buildItemCard, buildSmartMatchEmail, ItemCardData } from './emailTemplateService';
import { regionConfig } from '../config/regionConfig';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

/**
 * Check if item matches any user's wishlist keywords and send notifications
 * Called after a new item is created
 */
export async function notifyWishlistMatches(itemId: string): Promise<void> {
  // Fire-and-forget in background
  setImmediate(async () => {
    try {
      // Fetch the newly created item
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        include: {
          sale: {
            select: { id: true, title: true, city: true, startDate: true, organizerId: true },
          },
        },
      });

      if (!item) {
        console.log('[wishlistMatch] Item not found');
        return;
      }

      // Get all wishlists in the system
      const allWishlists = await prisma.wishlist.findMany({
        select: { id: true, userId: true, name: true },
      });

      if (allWishlists.length === 0) {
        return;
      }

      // Prepare searchable item text
      const itemSearchText = [item.title, item.description, item.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      // Find matching wishlists
      const matchingWishlistIds: string[] = [];

      for (const wishlist of allWishlists) {
        // Get all items in this wishlist to find keywords/patterns
        const wishlistItems = await prisma.wishlistItem.findMany({
          where: { wishlistId: wishlist.id },
          include: {
            item: {
              select: { title: true, category: true },
            },
          },
          take: 20, // Sample recent items for pattern matching
        });

        if (wishlistItems.length === 0) continue;

        // Extract common keywords and categories from wishlist items
        const wishlistKeywords = new Set<string>();
        const wishlistCategories = new Set<string>();

        for (const wi of wishlistItems) {
          // Add title words (longer than 3 chars) as keywords
          const titleWords = wi.item.title.toLowerCase().split(/\s+/);
          titleWords.forEach((word) => {
            if (word.length > 3) wishlistKeywords.add(word);
          });

          // Add category
          if (wi.item.category) {
            wishlistCategories.add(wi.item.category.toLowerCase());
          }
        }

        // Check if item matches wishlist patterns
        const itemTitleLower = item.title.toLowerCase();
        const itemCategoryLower = item.category?.toLowerCase() || '';

        let isMatch = false;

        // Match by category
        if (itemCategoryLower && wishlistCategories.has(itemCategoryLower)) {
          isMatch = true;
        }

        // Match by keyword in title (at least 2 keyword matches)
        let keywordMatches = 0;
        for (const keyword of wishlistKeywords) {
          if (itemSearchText.includes(keyword)) {
            keywordMatches++;
          }
        }
        if (keywordMatches >= 2) {
          isMatch = true;
        }

        if (isMatch) {
          matchingWishlistIds.push(wishlist.id);
        }
      }

      if (matchingWishlistIds.length === 0) {
        return;
      }

      // Get unique user IDs from matching wishlists
      const matchingWishlists = await prisma.wishlist.findMany({
        where: { id: { in: matchingWishlistIds } },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      // Batch send emails to matching users
      const emailPromises = matchingWishlists.map((wishlist) =>
        sendWishlistMatchEmail({
          userEmail: wishlist.user.email,
          userName: wishlist.user.name || 'Shopper',
          wishlistName: wishlist.name,
          item: {
            id: item.id,
            title: item.title,
            price: item.price,
            category: item.category,
            photoUrls: item.photoUrls,
          },
          saleName: item.sale!.title,
          saleCity: item.sale!.city || regionConfig.city,
        }).catch((err: unknown) => {
          console.error(`[wishlistMatch] Failed to notify ${wishlist.user.email}:`, err);
        })
      );

      await Promise.all(emailPromises);
      console.log(`[wishlistMatch] Sent notifications to ${emailPromises.length} users`);
    } catch (err) {
      console.error('[wishlistMatch] Error checking wishlist matches:', err);
    }
  });
}

interface WishlistMatchEmailData {
  userEmail: string;
  userName: string;
  wishlistName: string;
  item: {
    id: string;
    title: string;
    price: number | null;
    category: string | null;
    photoUrls: string[];
  };
  saleName: string;
  saleCity: string;
}

/**
 * Send wishlist match email to a single user
 */
async function sendWishlistMatchEmail(data: WishlistMatchEmailData): Promise<void> {
  try {
    if (await suppressionService.isSuppressed(data.userEmail)) {
      console.log('[wishlistMatch] Skipped suppressed recipient:', data.userEmail);
      return;
    }
    const itemPrice = data.item.price ?? 0;
    const emailHtml = buildSmartMatchEmail({
      matchCategory: data.item.category || undefined,
      item: {
        title:    data.item.title,
        price:    itemPrice,
        photoUrl: data.item.photoUrls?.[0],
        category: data.item.category || undefined,
        itemUrl:  `${FRONTEND_URL}/items/${data.item.id}`,
      },
      sale: {
        title:     data.saleName,
        dateRange: data.saleCity,
        address:   data.saleCity,
        saleUrl:   FRONTEND_URL,
      },
    });

    await emailService.emails.send({
      from: FROM_EMAIL,
      to: data.userEmail,
      subject: `New match for your "${data.wishlistName}" wishlist 🎉`,
      html: emailHtml,
    });

    console.log(`[wishlistMatch] Email sent to ${data.userEmail}`);
  } catch (err) {
    console.error(`[wishlistMatch] Failed to send email to ${data.userEmail}:`, err);
    throw err;
  }
}
