import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { sendPushNotification } from '../utils/webpush';
import type { RippleSummaryDTO, RippleTrendDTO } from '@findasale/shared';

/**
 * Record a ripple event (view, share, save, bid) for a sale.
 * @param saleId - ID of the sale
 * @param type - Type of ripple event
 * @param userId - Optional user ID
 * @param metadata - Optional metadata (e.g., source platform, device type)
 */
export const recordRipple = async (
  saleId: string,
  type: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await prisma.saleRipple.create({
      data: {
        saleId,
        type,
        userId: userId || null,
        metadata: metadata || null,
      },
    });
  } catch (err) {
    console.error(`[rippleService] Failed to record ripple for sale ${saleId}:`, err);
  }
};

/**
 * Get ripple summary for a sale (counts by type).
 * @param saleId - ID of the sale
 * @returns RippleSummaryDTO with counts for each ripple type
 */
export const getRippleSummary = async (saleId: string): Promise<RippleSummaryDTO> => {
  try {
    const ripples = await prisma.saleRipple.findMany({
      where: { saleId },
      select: { type: true, createdAt: true },
    });

    const summary: RippleSummaryDTO = {
      saleId,
      views: ripples.filter((r) => r.type === 'VIEW').length,
      shares: ripples.filter((r) => r.type === 'SHARE').length,
      saves: ripples.filter((r) => r.type === 'SAVE').length,
      bids: ripples.filter((r) => r.type === 'BID').length,
      totalRipples: ripples.length,
      lastRippleAt: ripples.length > 0 ? new Date(Math.max(...ripples.map(r => r.createdAt.getTime()))).toISOString() : null,
    };

    return summary;
  } catch (err) {
    console.error(`[rippleService] Failed to get ripple summary for sale ${saleId}:`, err);
    return {
      saleId,
      views: 0,
      shares: 0,
      saves: 0,
      bids: 0,
      totalRipples: 0,
      lastRippleAt: null,
    };
  }
};

/**
 * Get ripple trend data for a sale over a time period.
 * @param saleId - ID of the sale
 * @param hours - Number of hours to look back (default 24)
 * @returns RippleTrendDTO with hourly breakdown
 */
export const getRippleTrend = async (saleId: string, hours: number = 24): Promise<RippleTrendDTO> => {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const ripples = await prisma.saleRipple.findMany({
      where: {
        saleId,
        createdAt: { gte: startTime },
      },
      select: { type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by hour
    const hourlyMap = new Map<string, { views: number; shares: number; saves: number; bids: number }>();

    ripples.forEach((ripple) => {
      const date = new Date(ripple.createdAt);
      date.setMinutes(0, 0, 0); // Round down to hour
      const hourKey = date.toISOString();

      if (!hourlyMap.has(hourKey)) {
        hourlyMap.set(hourKey, { views: 0, shares: 0, saves: 0, bids: 0 });
      }

      const bucket = hourlyMap.get(hourKey)!;
      if (ripple.type === 'VIEW') bucket.views++;
      else if (ripple.type === 'SHARE') bucket.shares++;
      else if (ripple.type === 'SAVE') bucket.saves++;
      else if (ripple.type === 'BID') bucket.bids++;
    });

    const hourlyData = Array.from(hourlyMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([hour, counts]) => ({
        hour,
        viewCount: counts.views,
        shareCount: counts.shares,
        saveCount: counts.saves,
        bidCount: counts.bids,
      }));

    return {
      saleId,
      hourlyData,
      totalRipples: ripples.length,
      trendPeriodHours: hours,
    };
  } catch (err) {
    console.error(`[rippleService] Failed to get ripple trend for sale ${saleId}:`, err);
    return {
      saleId,
      hourlyData: [],
      totalRipples: 0,
      trendPeriodHours: hours,
    };
  }
};

/**
 * Haversine formula to calculate distance in miles between two lat/lng points.
 */
const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Notify users who have favorited sales within 5 miles of the newly published sale.
 * Sends push notifications if web-push is configured, otherwise logs intent.
 *
 * @param saleId - ID of the newly published sale
 * @param io - Socket.io Server instance
 */
export const notifyNearbyFavorites = async (saleId: string, io: Server): Promise<void> => {
  try {
    // Get the newly published sale's coordinates
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, lat: true, lng: true, title: true },
    });

    if (!sale) {
      console.warn(`[rippleService] Sale ${saleId} not found`);
      return;
    }

    // Get all published sales with lat/lng (for finding favorites within 5 miles)
    const allSales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // past 30 days
        },
        endDate: {
          gte: new Date(), // not ended
        },
      },
      select: { id: true, lat: true, lng: true },
    });

    // Find sales within 5 miles
    const nearbySaleIds = allSales
      .filter((s) => {
        const distance = haversineDistance(sale.lat, sale.lng, s.lat, s.lng);
        return distance <= 5;
      })
      .map((s) => s.id);

    if (nearbySaleIds.length === 0) {
      console.log(`[rippleService] No nearby sales found within 5 miles of sale ${saleId}`);
      return;
    }

    // Find all users who have favorited any of the nearby sales
    const favorites = await prisma.favorite.findMany({
      where: {
        saleId: {
          in: nearbySaleIds,
        },
      },
      select: {
        userId: true,
        user: {
          select: { id: true, email: true },
        },
      },
      distinct: ['userId'], // avoid duplicates if user favorited multiple nearby sales
    });

    if (favorites.length === 0) {
      console.log(`[rippleService] No users with nearby favorites for sale ${saleId}`);
      return;
    }

    // Send push notifications to each user
    for (const fav of favorites) {
      if (!fav.user || !fav.userId) continue;

      try {
        // Fetch user's push subscriptions
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId: fav.userId },
          select: { endpoint: true, p256dh: true, auth: true },
        });

        if (subscriptions.length === 0) {
          console.log(`[rippleService] would notify userId ${fav.userId} about sale ${saleId} (no push subscriptions)`);
          continue;
        }

        // Send push notification to each subscription
        for (const sub of subscriptions) {
          try {
            await sendPushNotification(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              {
                title: 'New Sale Nearby!',
                body: `${sale.title} just went live near you`,
                url: `/sales/${saleId}`,
              }
            );
            console.log(`[rippleService] notified userId ${fav.userId} about sale ${saleId}`);
          } catch (err) {
            // If web-push is not installed or notification fails, log intent
            console.log(`[rippleService] would notify userId ${fav.userId} about sale ${saleId}`);
          }
        }
      } catch (err) {
        console.error(`[rippleService] Error notifying user ${fav.userId}:`, err);
      }
    }

    console.log(`[rippleService] Ripple notification complete for sale ${saleId}: ${favorites.length} users notified`);
  } catch (err) {
    console.error(`[rippleService] Error in notifyNearbyFavorites for sale ${saleId}:`, err);
    // Silently fail — don't propagate error up; ripple is async bonus feature
  }
};
