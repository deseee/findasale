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
  saleType: string;
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
  boost: {
    boostType: string;
    status: string;
    expiresAt: Date;
    targetId: string | null;
  } | null;
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
  // Geo bounding box filter: ~1.5 degree delta ≈ ~100 miles
  const GEO_DELTA = 1.5;

  // Always fall back to region center — authenticated users without geolocation
  // were previously getting a global unbounded query, returning scraper sales from
  // TN/NC/TX whose pins are off-screen when the map is centered on GR.
  const effectiveLat = lat ?? regionConfig.centerLat;
  const effectiveLng = lng ?? regionConfig.centerLng;

  const whereClause: any = {
    status: 'PUBLISHED',
    deletedAt: null,
    isInventoryContainer: false,
    // Permanent storefronts (isOngoing) are always current; time-boxed sales keep endDate filter.
    OR: [{ isOngoing: true }, { endDate: { gte: new Date() } }],
  };

  // Add bounding box when user coords are available
  if (effectiveLat !== undefined && effectiveLng !== undefined) {
    whereClause.lat = { gte: effectiveLat - GEO_DELTA, lte: effectiveLat + GEO_DELTA };
    whereClause.lng = { gte: effectiveLng - GEO_DELTA, lte: effectiveLng + GEO_DELTA };
  }

  // Fetch published sales — select only SaleWithScore fields (Sentry NODEJS-10: omit scrapedMetadata blobs)
  const findManyOptions: any = {
    where: whereClause,
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      lat: true,
      lng: true,
      photoUrls: true,
      tags: true,
      status: true,
      isAuctionSale: true,
      saleType: true,
      saleSubtype: true,
      isCharitySale: true,
      qrScanCount: true,
      organizerId: true,
      createdAt: true,
      updatedAt: true,
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
    orderBy: [{ startDate: 'asc' }],
  };

  // Add safety limit regardless of bounding box (Sentry NODEJS-10: unbounded rows)
  if (effectiveLat !== undefined && effectiveLng !== undefined) {
    // Bounding box active — tighter cap, index-backed filter
    findManyOptions.take = 300;
  } else {
    // No bounding box — fallback safety limit
    findManyOptions.take = 500;
  }

  const sales = await prisma.sale.findMany(findManyOptions) as any[];

  // BoostPurchase has no direct FK on Sale — query separately by targetId
  const saleIds = sales.map((s) => s.id);
  const activeBoosts = saleIds.length > 0
    ? await prisma.boostPurchase.findMany({
        where: {
          targetType: 'SALE',
          targetId: { in: saleIds },
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        select: { targetId: true, boostType: true, expiresAt: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const boostBySaleId = new Map<string, typeof activeBoosts[0]>();
  for (const b of activeBoosts) {
    if (b.targetId && !boostBySaleId.has(b.targetId)) boostBySaleId.set(b.targetId, b);
  }

  // Serialize and add score + boost fields
  const serializedSales = sales.map(({ _count, ...sale }) => ({
    ...sale,
    favoriteCount: _count.favorites,
    score: 0,
    boost: boostBySaleId.get(sale.id) ?? null,
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
      let score = recencyBonus + (distance < 25 ? 3 : 0); // Slight bonus for proximity

      // +500 if active SALE_BUMP boost
      if (sale.boost?.status === 'ACTIVE' && sale.boost?.boostType === 'SALE_BUMP') {
        score += 500;
      }

      // +25 if sale has at least one photo (float photo sales above blank placeholders)
      if (sale.photoUrls && sale.photoUrls.length > 0) {
        score += 25;
      }

        return {
          ...sale,
          score,
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
  const purchasedCategories = new Set(
    purchases.map((p) => p.item?.category).filter((c): c is string => Boolean(c))
  );
  const favoritedSaleIds = new Set(
    favorites.map((f) => f.saleId).filter((s): s is string => Boolean(s))
  );
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

    // +500 if active SALE_BUMP boost
    if (sale.boost?.status === 'ACTIVE' && sale.boost?.boostType === 'SALE_BUMP') {
      score += 500;
    }

    // +25 if sale has at least one photo (float photo sales above blank placeholders)
    if (sale.photoUrls && sale.photoUrls.length > 0) {
      score += 25;
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
