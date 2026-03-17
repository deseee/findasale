/**
 * Feature #32: Wishlist Alert Service
 *
 * Manages saved search alerts for shoppers. Each alert consists of:
 * - Keywords and/or category filters
 * - Price range (min/max)
 * - Radius in miles from location
 *
 * When a new sale is published, checkAlertsForNewSale() finds all matching alerts
 * and sends email + push notifications to users who opt in.
 *
 * Uses Haversine formula to calculate distance between alert location and sale location.
 */

import { prisma } from '../lib/prisma';
import { Resend } from 'resend';
import { sendPushNotification } from '../utils/webpush';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WishlistAlertInput {
  name: string;
  q?: string;              // Keywords to search for
  category?: string;       // Item category filter
  minPrice?: number;       // In dollars
  maxPrice?: number;       // In dollars
  radiusMiles?: number;    // Radius from alert location
  lat?: number;           // Shopper's saved location
  lng?: number;           // Shopper's saved location
  tags?: string[];        // Tag filters
}

export interface WishlistAlertData extends WishlistAlertInput {
  id?: string;
  userId?: string;
}

/**
 * Haversine distance formula: calculates distance in miles between two lat/lng points
 * ~10 lines, no external library needed
 */
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Create a new wishlist alert for the authenticated user
 */
export const createAlert = async (userId: string, input: WishlistAlertInput): Promise<any> => {
  const query = {
    q: input.q || '',
    category: input.category || '',
    minPrice: input.minPrice || 0,
    maxPrice: input.maxPrice || 999999,
    tags: input.tags || [],
    radiusMiles: input.radiusMiles || 50,
    lat: input.lat || 0,
    lng: input.lng || 0,
  };

  return await prisma.wishlistAlert.create({
    data: {
      userId,
      name: input.name,
      query: query as any,
      notifyEmail: true,
      notifyPush: true,
      isActive: true,
    },
  });
};

/**
 * Get all alerts for a user (active only by default)
 */
export const getUserAlerts = async (userId: string, includeInactive = false): Promise<any[]> => {
  return await prisma.wishlistAlert.findMany({
    where: {
      userId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Update an alert (ownership check required before calling)
 */
export const updateAlert = async (alertId: string, userId: string, input: Partial<WishlistAlertInput>): Promise<any> => {
  // Verify ownership
  const existing = await prisma.wishlistAlert.findFirst({
    where: { id: alertId, userId },
  });
  if (!existing) throw new Error('Alert not found');

  // Merge with existing query — cast JsonValue to Record to allow spread
  const existingQuery = (typeof existing.query === 'object' && existing.query !== null
    ? existing.query
    : {}) as Record<string, any>;

  const updatedQuery = {
    ...existingQuery,
    ...(input.q !== undefined && { q: input.q }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.minPrice !== undefined && { minPrice: input.minPrice }),
    ...(input.maxPrice !== undefined && { maxPrice: input.maxPrice }),
    ...(input.tags && { tags: input.tags }),
    ...(input.radiusMiles !== undefined && { radiusMiles: input.radiusMiles }),
    ...(input.lat !== undefined && { lat: input.lat }),
    ...(input.lng !== undefined && { lng: input.lng }),
  };

  return await prisma.wishlistAlert.update({
    where: { id: alertId },
    data: {
      ...(input.name && { name: input.name }),
      query: updatedQuery as any,
    },
  });
};

/**
 * Delete an alert (ownership check required before calling)
 */
export const deleteAlert = async (alertId: string, userId: string): Promise<void> => {
  const existing = await prisma.wishlistAlert.findFirst({
    where: { id: alertId, userId },
  });
  if (!existing) throw new Error('Alert not found');

  await prisma.wishlistAlert.delete({ where: { id: alertId } });
};

/**
 * Check all active alerts when a new sale is published.
 * Matches on keywords, category, price, and radius.
 * Sends email and push notifications to matching users.
 */
export const checkAlertsForNewSale = async (saleId: string): Promise<void> => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        lat: true,
        lng: true,
        address: true,
        city: true,
        state: true,
        startDate: true,
        items: {
          select: {
            category: true,
            price: true,
            tags: true,
          },
        },
      },
    });

    if (!sale) return;

    // Find all active alerts
    const alerts = await prisma.wishlistAlert.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            pushSubscriptions: true,
          },
        },
      },
    });

    // Filter alerts that match the sale
    for (const alert of alerts) {
      const query = alert.query as any;

      // Check radius match
      if (query.lat && query.lng && query.radiusMiles) {
        const distance = haversineDistance(query.lat, query.lng, sale.lat, sale.lng);
        if (distance > query.radiusMiles) continue;
      }

      // Check keyword match in title or description or tags
      let keywordMatch = true;
      if (query.q) {
        const searchStr = `${sale.title} ${sale.description || ''} ${sale.tags.join(' ')}`.toLowerCase();
        keywordMatch = query.q.toLowerCase().split(' ').some((word: string) =>
          word && searchStr.includes(word)
        );
      }
      if (!keywordMatch) continue;

      // Check category and price match in items
      const matchingItems = sale.items.filter((item: any) => {
        const itemPrice = item.price || 0;
        const priceMatch = itemPrice >= (query.minPrice || 0) && itemPrice <= (query.maxPrice || 999999);
        const categoryMatch = !query.category || item.category === query.category;
        return priceMatch && categoryMatch;
      });

      if (matchingItems.length === 0) continue;

      // Found a match — notify the user
      const saleUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${sale.id}`;
      const formattedDate = new Date(sale.startDate).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // Email notification
      if (alert.user.email) {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale',
            to: alert.user.email,
            subject: `✨ Found items matching your wishlist alert: ${alert.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Your wishlist alert found a match!</h2>
                <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8fb897;">
                  <h3 style="margin-top: 0; color: #333;">Alert: ${alert.name}</h3>
                  <p style="margin: 8px 0; color: #666;"><strong>${sale.title}</strong></p>
                  <p style="margin: 8px 0; color: #666;">📍 ${sale.address}, ${sale.city}, ${sale.state}</p>
                  <p style="margin: 8px 0; color: #666;">🕐 ${formattedDate}</p>
                  <p style="margin: 8px 0; color: #666;">✓ ${matchingItems.length} matching item(s) found</p>
                </div>
                <p>
                  <a href="${saleUrl}"
                     style="background: #8fb897; color: white; padding: 10px 20px;
                            text-decoration: none; border-radius: 4px; display: inline-block;">
                    View Sale
                  </a>
                </p>
                <p style="font-size: 14px; color: #999; margin-top: 30px;">
                  You're receiving this because you set up a wishlist alert for "${alert.name}" on FindA.Sale.
                </p>
              </div>
            `,
          });
        } catch (err: any) {
          console.error(`✗ Wishlist alert email failed for user ${alert.user.id}:`, err?.message);
        }
      }

      // Push notification
      if (alert.user.pushSubscriptions.length > 0) {
        for (const ps of alert.user.pushSubscriptions) {
          await sendPushNotification(ps, {
            title: `Wishlist Match: ${alert.name}`,
            body: `${sale.title} · ${sale.city}, ${sale.state}`,
            url: saleUrl,
          }).catch((err: any) =>
            console.warn(`⚠ Wishlist push failed for user ${alert.user.id}:`, err?.message)
          );
        }
      }

      // Update lastNotifiedAt
      await prisma.wishlistAlert.update({
        where: { id: alert.id },
        data: { lastNotifiedAt: new Date() },
      }).catch(() => {});
    }

    console.log(`✓ Wishlist alert checks completed for sale ${saleId}`);
  } catch (error) {
    console.error('✗ Error checking wishlist alerts for sale:', error);
  }
};
