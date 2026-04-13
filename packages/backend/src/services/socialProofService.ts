import { prisma } from '../lib/prisma';

/**
 * Social proof data for an item
 */
export interface ItemSocialProof {
  itemId: string;
  favoriteCount: number;
  activeBidCount: number;
  activeHoldCount: number;
  totalEngagement: number; // sum of above
}

/**
 * Social proof data for a sale
 */
export interface SaleSocialProof {
  saleId: string;
  totalFavorites: number;
  totalActiveHolds: number;
  totalActiveBids: number;
  totalEngagement: number; // sum of above
}

/**
 * Get social proof metrics for a single item.
 * Aggregates: favorite count, active bid count, active holds count.
 * No schema changes — uses existing Favorite, Bid, ItemReservation models.
 */
export const getItemSocialProof = async (itemId: string): Promise<ItemSocialProof> => {
  try {
    const [favoriteCount, activeBidCount, activeHoldCount] = await Promise.all([
      // Count favorites for this item
      prisma.favorite.count({
        where: { itemId },
      }),
      // Count active bids
      prisma.bid.count({
        where: {
          itemId,
          status: { in: ['ACTIVE', 'WINNING'] },
        },
      }),
      // Count active holds (not expired, not cancelled)
      prisma.itemReservation.count({
        where: {
          itemId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const totalEngagement = favoriteCount + activeBidCount + activeHoldCount;

    return {
      itemId,
      favoriteCount,
      activeBidCount,
      activeHoldCount,
      totalEngagement,
    };
  } catch (error) {
    console.error(`Error fetching social proof for item ${itemId}:`, error);
    return {
      itemId,
      favoriteCount: 0,
      activeBidCount: 0,
      activeHoldCount: 0,
      totalEngagement: 0,
    };
  }
};

/**
 * Get social proof metrics for a sale (aggregates all items in the sale).
 * Aggregates favorites on the sale itself, plus all items' holds and bids.
 */
export const getSaleSocialProof = async (saleId: string): Promise<SaleSocialProof> => {
  try {
    // Count sale-level favorites
    const totalFavorites = await prisma.favorite.count({
      where: { saleId },
    });

    // Get all items in the sale, then count bids and holds
    const items = await prisma.item.findMany({
      where: { saleId },
      select: { id: true },
    });

    const itemIds = items.map((item) => item.id);

    const [totalActiveHolds, totalActiveBids] = await Promise.all([
      // Count active holds across all items in sale
      prisma.itemReservation.count({
        where: {
          itemId: { in: itemIds },
          status: { in: ['PENDING', 'CONFIRMED'] },
          expiresAt: { gt: new Date() },
        },
      }),
      // Count active bids across all items in sale
      prisma.bid.count({
        where: {
          itemId: { in: itemIds },
          status: { in: ['ACTIVE', 'WINNING'] },
        },
      }),
    ]);

    const totalEngagement = totalFavorites + totalActiveHolds + totalActiveBids;

    return {
      saleId,
      totalFavorites,
      totalActiveHolds,
      totalActiveBids,
      totalEngagement,
    };
  } catch (error) {
    console.error(`Error fetching social proof for sale ${saleId}:`, error);
    return {
      saleId,
      totalFavorites: 0,
      totalActiveHolds: 0,
      totalActiveBids: 0,
      totalEngagement: 0,
    };
  }
};
