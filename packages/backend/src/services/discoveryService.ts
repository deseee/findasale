import { prisma } from '../lib/prisma';
import { regionConfig } from '../config/regionConfig';

export interface SaleWithScore {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  photoUrls: string[];
  tags: string[];
  status: string;
  isAuctionSale: boolean;
  qrScanCount: number;
  organizerId: string;
  createdAt: Date;
  updatedAt: Date;
  organizer: {
    id: string;
    businessName: string;
    reputationTier: string;
  };
  favoriteCount: number;
  score: number;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function getPersonalizedFeed(
  userId: string | null,
  lat?: number,
  lng?: number
): Promise<{ sales: SaleWithScore[]; personalized: boolean }> {
  // Fetch all published sales with organizer data
  const sales = await prisma.sale.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      organizer: {
        select: {
          id: true,
          businessName: true,
          reputationTier: true,
        },
      },
      _count: {
        select: { favorites: true },
      },
    },
  });

  // Serialize and add score field
  const serializedSales = sales.map(({ _count, ...sale }) => ({
    ...sale,
    favoriteCount: _count.favorites,
    score: 0,
  }));

  // If no user logged in, return geo-sorted results (by default region center coords)
  if (!userId) {
    const userLat = lat ?? regionConfig.centerLat;
    const userLng = lng ?? regionConfig.centerLng;

    const scored = serializedSales
      .filter((sale) => sale.lat !== null && sale.lng !== null)
      .map((sale) => {
        const distance = haversineDistance(userLat, userLng, sale.lat!, sale.lng!);
      const dayOffset = Math.max(0, (sale.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const recencyBonus = Math.max(0, 5 - dayOffset); // 5 pts if today, 0 if 5+ days away

        return {
          ...sale,
          score: recencyBonus + (distance < 25 ? 3 : 0), // Slight bonus for proximity
        };
      });

    return {
      sales: scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.startDate.getTime() - b.startDate.getTime();
      }),
      personalized: false,
    };
  }

  // Logged-in user: fetch purchase history, favorites, and follows
  const [purchases, favorites, follows] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      include: { item: { select: { category: true } } },
    }),
    prisma.favorite.findMany({
      where: { userId, saleId: { not: null } },
      select: { saleId: true },
    }),
    prisma.follow.findMany({
      where: { userId },
      select: { organizerId: true },
    }),
  ]);

  // Extract data from history
  const purchasedCategories = new Set(purchases.map((p) => p.item?.category).filter(Boolean));
  const favoritedSaleIds = new Set(favorites.map((f) => f.saleId).filter(Boolean));
  const followedOrganizerIds = new Set(follows.map((f) => f.organizerId));

  // Score each sale
  const scored = serializedSales.map((sale) => {
    let score = 0;

    // +30 if from followed organizer
    if (followedOrganizerIds.has(sale.organizerId)) {
      score += 30;
    }

    // +20 per matching category in purchase history
    if (sale.tags && purchasedCategories.size > 0) {
      const matchingTags = sale.tags.filter((tag) => purchasedCategories.has(tag));
      score += matchingTags.length * 20;
    }

    // +10 if user has favorited a sale from this organizer before
    if (favoritedSaleIds.has(sale.id)) {
      score += 10;
    }

    // +5 per day until sale (cap at 7 days = 35 pts)
    const dayOffset = Math.max(0, (sale.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const recencyBonus = Math.max(0, Math.min(7, 7 - dayOffset)) * 5;
    score += recencyBonus;

    // Distance bonus: +15 if within 25 miles
    if (lat !== undefined && lng !== undefined && sale.lat !== null && sale.lng !== null) {
      const distance = haversineDistance(lat, lng, sale.lat, sale.lng);
      if (distance < 25) {
        score += 15;
      }
    }

    return { ...sale, score };
  });

  return {
    sales: scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.startDate.getTime() - b.startDate.getTime();
    }),
    personalized: true,
  };
}
