import { prisma } from '../lib/prisma';
import type { ActivityFeedItem } from '../types/activityFeed';

/**
 * Get recent activity across organizer's sales
 * Aggregates: favorites, purchases, RSVPs, messages, reviews, holds
 */
export async function getOrganizerActivityFeed(
  organizerId: string,
  saleIds?: string[],
  limit: number = 20
): Promise<ActivityFeedItem[]> {
  const activities: ActivityFeedItem[] = [];

  try {
    // Get organizer's sales if specific saleIds not provided
    let salesInScope = saleIds;
    if (!salesInScope || salesInScope.length === 0) {
      const organizerSales = await prisma.sale.findMany({
        where: { organizerId },
        select: { id: true },
      });
      salesInScope = organizerSales.map((s) => s.id);
    }

    if (salesInScope.length === 0) {
      return [];
    }

    // Fetch recent favorites (last 24 hours)
    const recentFavorites = await prisma.favorite.findMany({
      where: {
        saleId: { in: salesInScope },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { sale: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    activities.push(
      ...recentFavorites.map((fav) => ({
        id: `fav-${fav.id}`,
        type: 'favorite' as const,
        saleName: fav.sale?.title || 'Unknown Sale',
        saleId: fav.saleId || '',
        message: 'New favorite',
        timestamp: fav.createdAt.toISOString(),
      }))
    );

    // Fetch recent purchases (last 24 hours)
    const recentPurchases = await prisma.purchase.findMany({
      where: {
        saleId: { in: salesInScope },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { in: ['PAID', 'PENDING'] },
      },
      include: { sale: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    activities.push(
      ...recentPurchases.map((purch) => ({
        id: `purch-${purch.id}`,
        type: 'purchase' as const,
        saleName: purch.sale?.title || 'Unknown Sale',
        saleId: purch.saleId || '',
        message: `Purchase ${purch.status === 'PAID' ? 'completed' : 'pending'}`,
        amount: purch.amount,
        timestamp: purch.createdAt.toISOString(),
      }))
    );

    // Fetch recent RSVPs (last 24 hours)
    const recentRSVPs = await prisma.saleRSVP.findMany({
      where: {
        saleId: { in: salesInScope },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { sale: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    activities.push(
      ...recentRSVPs.map((rsvp) => ({
        id: `rsvp-${rsvp.id}`,
        type: 'rsvp' as const,
        saleName: rsvp.sale.title,
        saleId: rsvp.saleId,
        message: 'New RSVP',
        timestamp: rsvp.createdAt.toISOString(),
      }))
    );

    // Fetch recent messages (last 24 hours)
    const recentMessages = await prisma.message.findMany({
      where: {
        conversation: {
          saleId: { in: salesInScope },
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: {
        conversation: {
          select: { sale: { select: { title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    activities.push(
      ...recentMessages.map((msg) => ({
        id: `msg-${msg.id}`,
        type: 'message' as const,
        saleName: msg.conversation.sale?.title || 'Unknown Sale',
        saleId: msg.conversation.sale?.id || '',
        message: 'New message',
        timestamp: msg.createdAt.toISOString(),
      }))
    );

    // Fetch recent reviews (last 48 hours)
    const recentReviews = await prisma.review.findMany({
      where: {
        saleId: { in: salesInScope },
        createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      include: { sale: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    activities.push(
      ...recentReviews.map((review) => ({
        id: `review-${review.id}`,
        type: 'review' as const,
        saleName: review.sale.title,
        saleId: review.saleId,
        message: `${review.rating}-star review`,
        timestamp: review.createdAt.toISOString(),
      }))
    );

    // Fetch recent holds (last 24 hours) — items with pending/confirmed reservations
    const recentHolds = await prisma.itemReservation.findMany({
      where: {
        item: {
          saleId: { in: salesInScope },
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        item: { select: { sale: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    activities.push(
      ...recentHolds.map((hold) => ({
        id: `hold-${hold.id}`,
        type: 'hold' as const,
        saleName: hold.item.sale?.title || 'Unknown Sale',
        saleId: hold.item.sale?.id || '',
        message: `Item held — expires in ${Math.ceil((hold.expiresAt.getTime() - Date.now()) / 60 / 60 / 1000)}h`,
        timestamp: hold.createdAt.toISOString(),
      }))
    );

    // Sort by timestamp (newest first) and take top N
    const sorted = activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return sorted.slice(0, limit);
  } catch (error) {
    console.error('Error fetching organizer activity feed:', error);
    return [];
  }
}
