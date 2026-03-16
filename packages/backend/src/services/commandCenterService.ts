import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import type {
  CommandCenterResponse,
  CommandCenterFilters,
  SaleMetrics,
  CommandCenterSummary,
} from '@findasale/shared/types/commandCenter';

/**
 * Get Command Center summary for an organizer
 * Aggregates all sales with metrics, caches in Redis for 5 minutes
 */
export async function getCommandCenterSummary(
  organizerId: string,
  filters?: CommandCenterFilters
): Promise<CommandCenterResponse> {
  // Check Redis cache first
  const cacheKey = `command-center:${organizerId}`;
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
  const status = (filters?.status ?? 'active').toLowerCase();

  // Build where clause based on status filter
  let whereClause: any = { organizerId };

  if (status === 'active') {
    // NOW >= startDate AND NOW <= endDate AND status='PUBLISHED'
    whereClause = {
      ...whereClause,
      startDate: { lte: now },
      endDate: { gte: now },
      status: 'PUBLISHED',
    };
  } else if (status === 'upcoming') {
    // startDate > NOW AND (status='PUBLISHED' OR status='DRAFT')
    whereClause = {
      ...whereClause,
      startDate: { gt: now },
      status: { in: ['PUBLISHED', 'DRAFT'] },
    };
  } else if (status === 'recent') {
    // endDate < NOW AND status='ENDED'
    whereClause = {
      ...whereClause,
      endDate: { lt: now },
      status: 'ENDED',
    };
  }
  // else: 'all' — no additional filters

  // Apply date range filters if provided
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

  // Fetch all sales for this organizer matching filters
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
            where: { draftStatus: { not: 'DRAFT' } }, // published items only
          },
          favorites: true,
          purchases: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  });

  const saleIds = sales.map((s) => s.id);

  // If no sales, return empty response
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
    // Cache even empty response
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(emptyResponse));
    } catch (err) {
      console.warn('Redis cache set failed for empty response:', err);
    }
    return emptyResponse;
  }

  // Batch query for item metrics
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

  // Item status breakdown
  const itemStatus = await prisma.item.groupBy({
    by: ['saleId', 'status'],
    where: {
      saleId: { in: saleIds },
      draftStatus: { not: 'DRAFT' },
    },
    _count: { id: true },
  });

  // Revenue (paid purchases only)
  const revenue = await prisma.purchase.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      status: 'PAID',
    },
    _sum: { amount: true },
  });

  // Pending holds (reservations)
  const reservations = await prisma.itemReservation.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      status: 'PENDING',
    },
    _count: { id: true },
  });

  // Unpaid purchases
  const unpaid = await prisma.purchase.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      status: 'PENDING',
    },
    _count: { id: true },
  });

  // Items needing photos (photoUrls is empty array)
  const noPhotos = await prisma.item.groupBy({
    by: ['saleId'],
    where: {
      saleId: { in: saleIds },
      draftStatus: { not: 'DRAFT' },
      photoUrls: { equals: [] },
    },
    _count: { id: true },
  });

  // Build lookup maps for easier access
  const itemMetricsMap = new Map(itemMetrics.map((m) => [m.saleId, m]));
  const revenueMap = new Map(revenue.map((r) => [r.saleId, r._sum.amount || 0]));
  const reservationMap = new Map(reservations.map((r) => [r.saleId, r._count.id]));
  const unpaidMap = new Map(unpaid.map((u) => [u.saleId, u._count.id]));
  const noPhotosMap = new Map(noPhotos.map((n) => [n.saleId, n._count.id]));

  // Build status map: { saleId: { SOLD: 5, AVAILABLE: 10, ... } }
  const statusMap = new Map<string, Record<string, number>>();
  itemStatus.forEach((s) => {
    if (!statusMap.has(s.saleId)) {
      statusMap.set(s.saleId, {});
    }
    statusMap.get(s.saleId)![s.status] = s._count.id;
  });

  // Transform sales into SaleMetrics
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

    // Days until start: (startDate - now) / 86400000 ms
    const daysUntilStart =
      (sale.startDate.getTime() - now.getTime()) / 86400000;

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
      conversionRate: Math.round(conversionRate * 100) / 100, // 2 decimal places
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

  // Calculate aggregates
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

  // Cache result in Redis
  try {
    await redis.setex(cacheKey, 300, JSON.stringify(response)); // 5 min TTL
  } catch (err) {
    console.warn('Redis cache set failed:', err);
    // Continue anyway — cache is optional
  }

  return response;
}

/**
 * Invalidate Command Center cache for an organizer
 * Called when mutations affect sales/items/purchases
 */
export async function invalidateCommandCenterCache(organizerId: string): Promise<void> {
  const cacheKey = `command-center:${organizerId}`;
  try {
    await redis.del(cacheKey);
  } catch (err) {
    console.warn('Redis cache delete failed:', err);
    // Non-fatal — cache will expire naturally
  }
}
