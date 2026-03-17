import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { sendPushNotification } from '../utils/webpush';

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
