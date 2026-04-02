import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import type {
  CommandCenterResponse,
  CommandCenterFilters,
  SaleMetrics,
  CommandCenterSummary,
} from '../types/commandCenter';

/**
 * Get Command Center summary for an organizer
 * Aggregates all sales with metrics, caches in Redis for 5 minutes
 */
export async function getCommandCenterSummary(
  organizerId: string,
  filters?: CommandCenterFilters
): Promise<CommandCenterResponse> {
  // Validate status filter before creating cache key
  const validStatuses = ['active', 'upcoming', 'recent', 'all'];
  const status = validStatuses.includes((filters?.status ?? 'active').toLowerCase())
    ? (filters?.status ?? 'active').toLowerCase()
    : 'active';

  // Check Redis cache first
  const cacheKey = `command-center:${organizerId}:${status}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Redis error — continue without cache, log warning
    console.warn('Redis cache miss for command center:', err);
  }

  const now = new Date();

  // Build where clause based on status filter
  let whereClause: any = { organizerId };

  if (status === 'active') {
    whereClause = {
      ...whereClause,
      startDate: { lte: now },
      endDate: { gte: now },
      status: 'PUBLISHED',
    };
  } else if (status === 'upcoming') {
    whereClause = {
      ...whereClause,
      startDate: { gt: now },
      status: { in: ['PUBLISHED', 'DRAFT'] },
    };
  } else if (status === 'recent') {
    whereClause = {
      ...whereClause,
      endDate: { lt: now },
      status: 'ENDED',
    };
  }

  if (filters?.dateFrom) {
    whereClause.startDate = {
      ...whereClause.startDate,
      gte: new Date(filters.dateFrom),
    };
  }
  if (filters?.dateTo) {
    whereClause.endDate = {
      ...whereClause.endDate,
      lte: new Date(filters.dateTo),
    };
  }

  const sales = await prisma.sale.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      qrScanCount: true,
      _count: {
        select: {
          items: {
            where: { draftStatus: { not: 'DRAFT' } },
          },
          favorites: true,
          purchases: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
    take: 50, // P2-2: Pagination limit
  });

  const saleIds = sales.map((s) => s.id);

  if (saleIds.length === 0) {
    const emptyResponse: CommandCenterResponse = {
      success: true,
      organizerId,
      summary: {
        totalActiveSales: 0,
        totalItems: 0,
        totalRevenue: 0,
        totalFavorites: 0,
        aggregateConversionRate: 0,
        totalPendingActions: 0,
      },
      sales: [],
    };
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(emptyResponse));
    } catch (err) {
      console.warn('Redis cache set failed for empty response:', err);
    }
    return emptyResponse;
  }

  const itemMetrics = await prisma.item.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      draftStatus: { not: 'DRAFT' },
    },
    _count: { id: true },
    _sum: { price: true },
    _avg: { price: true },
  });

  const itemStatus = await prisma.item.groupBy({
    by: ['saleId', 'status'],
    where: {
      saleId: { in: saleIds },
      draftStatus: { not: 'DRAFT' },
    },
    _count: { id: true },
  });

  const revenue = await prisma.purchase.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      status: 'PAID',
    },
    _sum: { amount: true },
  });

  // ItemReservation has no saleId — join through Item to aggregate holds per sale
  const activeHolds = await prisma.itemReservation.findMany({
    where: {
      item: { saleId: { in: saleIds } },
      status: { in: ['PENDING', 'CONFIRMED'] },
      expiresAt: { gt: new Date() },
    },
    include: { item: { select: { saleId: true } } },
  });
  const reservations = Object.entries(
    activeHolds.reduce<Record<string, number>>((acc, r) => {
      const sid = r.item.saleId;
      acc[sid] = (acc[sid] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([saleId, count]) => ({ saleId, _count: { id: count } }));

  const unpaid = await prisma.purchase.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      status: 'PENDING',
    },
    _count: { id: true },
  });

  const noPhotos = await prisma.item.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      draftStatus: { not: 'DRAFT' },
      photoUrls: { equals: [] },
    },
    _count: { id: true },
  });

  const itemMetricsMap = new Map(itemMetrics.map((m) => [m.saleId, m]));
  const revenueMap = new Map(revenue.map((r) => [r.saleId, r._sum.amount || 0]));
  const reservationMap = new Map(reservations.map((r) => [r.saleId, r._count.id]));
  const unpaidMap = new Map(unpaid.map((u) => [u.saleId, u._count.id]));
  const noPhotosMap = new Map(noPhotos.map((n) => [n.saleId, n._count.id]));

  const statusMap = new Map<string, Record<string, number>>();
  itemStatus.forEach((s) => {
    if (!statusMap.has(s.saleId)) {
      statusMap.set(s.saleId, {});
    }
    statusMap.get(s.saleId)![s.status] = s._count.id;
  });

  const saleMetrics: SaleMetrics[] = sales.map((sale) => {
    const metrics = itemMetricsMap.get(sale.id);
    const statusData = statusMap.get(sale.id) || {};
    const saleRevenue = revenueMap.get(sale.id) || 0;
    const itemsListed = metrics?._count.id || 0;
    const itemsSold = statusData['SOLD'] || 0;
    const itemsAvailable = statusData['AVAILABLE'] || 0;
    const itemsReserved = statusData['RESERVED'] || 0;
    const avgPrice = metrics?._avg.price ? Number(metrics._avg.price) : 0;
    const conversionRate = itemsListed > 0 ? (itemsSold / itemsListed) * 100 : 0;
    const itemsNeedingPhotos = noPhotosMap.get(sale.id) || 0;
    const pendingHolds = reservationMap.get(sale.id) || 0;
    const unpaidPurchases = unpaidMap.get(sale.id) || 0;
    const totalPendingActions = itemsNeedingPhotos + pendingHolds + unpaidPurchases;
    const daysUntilStart = (sale.startDate.getTime() - now.getTime()) / 86400000;

    return {
      id: sale.id,
      title: sale.title,
      status: sale.status as 'DRAFT' | 'PUBLISHED' | 'ENDED',
      startDate: sale.startDate.toISOString(),
      endDate: sale.endDate.toISOString(),
      daysUntilStart: Math.round(daysUntilStart),
      itemsListed,
      itemsSold,
      itemsAvailable,
      itemsReserved,
      revenue: Number(saleRevenue),
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgItemPrice: Math.round(avgPrice * 100) / 100,
      favoritesCount: sale._count.favorites,
      viewsCount: sale.qrScanCount || 0,
      pendingActions: {
        itemsNeedingPhotos,
        pendingHolds,
        unpaidPurchases,
        total: totalPendingActions,
      },
    };
  });

  const totalActiveSales = saleMetrics.filter(
    (s) =>
      new Date(s.startDate) <= now &&
      new Date(s.endDate) >= now &&
      s.status === 'PUBLISHED'
  ).length;
  const totalItems = saleMetrics.reduce((sum, s) => sum + s.itemsListed, 0);
  const totalRevenue = saleMetrics.reduce((sum, s) => sum + s.revenue, 0);
  const totalFavorites = saleMetrics.reduce((sum, s) => sum + s.favoritesCount, 0);
  const totalSold = saleMetrics.reduce((sum, s) => sum + s.itemsSold, 0);
  const aggregateConversionRate =
    totalItems > 0 ? Math.round((totalSold / totalItems) * 100 * 100) / 100 : 0;
  const totalPendingActions = saleMetrics.reduce(
    (sum, s) => sum + s.pendingActions.total,
    0
  );

  const response: CommandCenterResponse = {
    success: true,
    organizerId,
    summary: {
      totalActiveSales,
      totalItems,
      totalRevenue,
      totalFavorites,
      aggregateConversionRate,
      totalPendingActions,
    },
    sales: saleMetrics,
  };

  try {
    await redis.setex(cacheKey, 300, JSON.stringify(response));
  } catch (err) {
    console.warn('Redis cache set failed:', err);
  }

  return response;
}

export async function invalidateCommandCenterCache(organizerId: string): Promise<void> {
  const cacheKey = `command-center:${organizerId}`;
  try {
    await redis.del(cacheKey);
  } catch (err) {
    console.warn('Redis cache delete failed:', err);
  }
}
