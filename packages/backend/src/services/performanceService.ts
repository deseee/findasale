// Seller Performance Dashboard Service
// MVP Phase 1: Revenue, Top Items, Conversion Rate, Category Breakdown, Hold/No-Show Rate
// No schema changes. All metrics computed on-demand from existing tables with in-memory caching.

import { prisma } from '../lib/prisma';
import { computeHealthScore } from '../utils/listingHealthScore';

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export interface PerformanceMetrics {
  success: boolean;
  organizerId: string;
  saleId: string;
  dateRange: {
    from: string;
    to: string;
    label: string;
  };
  metrics: {
    revenue: {
      total: number;
      currency: string;
      platformFeeAmount: number;
      strikeThrough: number;
      organiserNetRevenue: number;
      sourceCounts: {
        online: number;
        pos: number;
      };
    };
    itemMetrics: {
      topSellingItems: Array<{
        itemId: string;
        title: string;
        category: string;
        unitsSold: number;
        totalRevenue: number;
        avgPrice: number;
        healthScore: number;
      }>;
      categoryBreakdown: Array<{
        category: string;
        itemsListed: number;
        itemsSold: number;
        sellThroughRate: number;
        avgListPrice: number;
        avgSoldPrice: number;
        totalRevenue: number;
        healthScoreAvg: number;
      }>;
      aggregateHealthScore: number;
    };
    purchasingMetrics: {
      conversionRate: number;
      conversionRateNote: string;
      totalUniqueBuyers: number;
      averageCartValue: number;
      repeatBuyerRate: number;
    };
    holdMetrics: {
      holdsCreated: number;
      holdsExpired: number;
      holdsCancelled: number;
      holdsConverted: number;
      noShowRate: number;
      noShowRateNote: string;
    };
  };
  lastUpdated: string;
  cacheExpiry: string;
}

/**
 * Parse date range query params into from/to ISO strings
 */
function parseDateRange(range: string, fromParam?: string, toParam?: string): { from: Date; to: Date; label: string } {
  let to = new Date();
  let from: Date;
  let label: string;

  if (range === 'custom' && fromParam && toParam) {
    from = new Date(fromParam);
    to = new Date(toParam);
    label = `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`;
  } else if (range === '7d') {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = 'Last 7 days';
  } else if (range === '90d') {
    from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    label = 'Last 90 days';
  } else {
    // default: 30d
    from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    label = 'Last 30 days';
  }

  return { from, to, label };
}

/**
 * Compute revenue metrics: total, fees, split by source (online vs POS)
 */
async function computeRevenueMetrics(saleId: string, from: Date, to: Date) {
  const purchases = await prisma.purchase.findMany({
    where: {
      saleId,
      status: 'PAID',
      createdAt: { gte: from, lte: to },
    },
    select: {
      amount: true,
      platformFeeAmount: true,
      source: true,
    },
  });

  let totalRevenue = 0;
  let totalFees = 0;
  let onlineCount = 0;
  let posCount = 0;

  for (const p of purchases) {
    totalRevenue += p.amount || 0;
    totalFees += p.platformFeeAmount || 0;
    if (p.source === 'POS') posCount++;
    else onlineCount++;
  }

  const strikeThrough = totalRevenue + totalFees;
  const netRevenue = totalRevenue - totalFees;

  return {
    total: Number(totalRevenue.toFixed(2)),
    currency: 'USD',
    platformFeeAmount: Number(totalFees.toFixed(2)),
    strikeThrough: Number(strikeThrough.toFixed(2)),
    organiserNetRevenue: Number(netRevenue.toFixed(2)),
    sourceCounts: {
      online: onlineCount,
      pos: posCount,
    },
  };
}

/**
 * Top-selling items: count by itemId, sum revenue, top 10
 */
async function computeTopSellingItems(saleId: string, from: Date, to: Date) {
  const purchases = await prisma.purchase.findMany({
    where: {
      saleId,
      status: 'PAID',
      createdAt: { gte: from, lte: to },
      itemId: { not: null },
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          category: true,
        },
      },
    },
  });

  // Group by itemId
  const itemMap = new Map<string, {
    title: string;
    category: string;
    unitsSold: number;
    totalRevenue: number;
    healthScore: number;
  }>();

  for (const p of purchases) {
    if (!p.item) continue;
    const key = p.item.id;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        title: p.item.title,
        category: p.item.category || 'other',
        unitsSold: 0,
        totalRevenue: 0,
        healthScore: 0,
      });
    }
    const item = itemMap.get(key)!;
    item.unitsSold += 1;
    item.totalRevenue += p.amount || 0;
  }

  // Fetch health scores for all items
  const itemIds = Array.from(itemMap.keys());
  if (itemIds.length > 0) {
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        photoUrls: true,
        title: true,
        description: true,
        tags: true,
        price: true,
        conditionGrade: true,
        category: true,
      },
    });

    // Real health score computation — reuses the canonical Listing Health Score
    // utility (packages/backend/src/utils/listingHealthScore.ts) also used to gate
    // publishing in itemController.ts. Replaces the previous hardcoded mock formula.
    for (const item of items) {
      const data = itemMap.get(item.id);
      if (data) {
        data.healthScore = computeHealthScore({
          photoUrls: item.photoUrls,
          title: item.title,
          description: item.description,
          tags: item.tags,
          price: item.price,
          conditionGrade: item.conditionGrade,
          category: item.category,
        }).score;
      }
    }
  }

  // Sort by totalRevenue descending, take top 10
  const topItems = Array.from(itemMap.entries())
    .map(([id, data]) => ({
      itemId: id,
      ...data,
      avgPrice: Number((data.totalRevenue / data.unitsSold).toFixed(2)),
      totalRevenue: Number(data.totalRevenue.toFixed(2)),
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  return topItems;
}

/**
 * Conversion rate: (purchases / favorites) × 100
 * Fallback: (purchases / items) if no favorite data
 */
async function computeConversionRate(saleId: string, from: Date, to: Date) {
  const purchases = await prisma.purchase.findMany({
    where: {
      saleId,
      status: 'PAID',
      createdAt: { gte: from, lte: to },
    },
    select: {
      amount: true,
      userId: true,
    },
  });
  const purchaseCount = purchases.length;

  const favoriteCount = await prisma.favorite.count({
    where: {
      saleId,
      createdAt: { gte: from, lte: to },
    },
  });

  let rate = 0;
  if (favoriteCount > 0) {
    rate = (purchaseCount / favoriteCount) * 100;
  } else {
    // Fallback: count items in the sale
    const itemCount = await prisma.item.count({
      where: { saleId },
    });
    if (itemCount > 0) {
      rate = (purchaseCount / itemCount) * 100;
    }
  }

  // Real average cart value: sum of paid Purchase.amount / purchase count.
  // NOTE: this averages per Purchase row (one row per line item), not per checkout
  // session -- a multi-item cart produces multiple Purchase rows sharing one
  // stripePaymentIntentId/clientTransactionId. A true "per-order" cart value would
  // require grouping by that ID first; flagged for a follow-up decision, not done here.
  const totalPurchaseAmount = purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const averageCartValue = purchaseCount > 0 ? Number((totalPurchaseAmount / purchaseCount).toFixed(2)) : 0;

  // Real repeat buyer rate: share of identified buyers (non-null userId -- POS/guest
  // checkouts have no persistent account identity and are excluded from this
  // calculation) who made more than one paid purchase in this date range.
  const buyerPurchaseCounts = new Map<string, number>();
  for (const p of purchases) {
    if (!p.userId) continue;
    buyerPurchaseCounts.set(p.userId, (buyerPurchaseCounts.get(p.userId) || 0) + 1);
  }
  const identifiedBuyerCount = buyerPurchaseCounts.size;
  const repeatBuyerCount = Array.from(buyerPurchaseCounts.values()).filter(c => c > 1).length;
  const repeatBuyerRate = identifiedBuyerCount > 0 ? Number((repeatBuyerCount / identifiedBuyerCount).toFixed(4)) : 0;

  return {
    conversionRate: Number((rate / 100).toFixed(4)), // Return as decimal (0.48 for 48%)
    conversionRateNote: `${Math.round(rate)}% of favorited items were purchased`,
    totalUniqueBuyers: purchaseCount, // simplified: count distinct users separately if needed (pre-existing; unchanged, out of scope -- see handoff)
    averageCartValue,
    repeatBuyerRate,
  };
}

/**
 * Category breakdown: avg price, sell-through rate, revenue per category
 */
async function computeCategoryBreakdown(saleId: string, from: Date, to: Date) {
  const items = await prisma.item.findMany({
    where: { saleId },
    select: {
      id: true,
      category: true,
      price: true,
      status: true,
      title: true,
      description: true,
      tags: true,
      conditionGrade: true,
      photoUrls: true,
    },
  });

  // Group items by category
  const categoryMap = new Map<string, {
    itemsListed: number;
    itemsSold: number;
    prices: number[];
    healthScores: number[];
  }>();

  for (const item of items) {
    const cat = item.category || 'other';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, {
        itemsListed: 0,
        itemsSold: 0,
        prices: [],
        healthScores: [],
      });
    }
    const catData = categoryMap.get(cat)!;
    catData.itemsListed += 1;
    if (item.status === 'SOLD') catData.itemsSold += 1;
    if (item.price) catData.prices.push(item.price);
    // Real health score — same canonical utility used above and at publish-time gating.
    catData.healthScores.push(
      computeHealthScore({
        photoUrls: item.photoUrls,
        title: item.title,
        description: item.description,
        tags: item.tags,
        price: item.price,
        conditionGrade: item.conditionGrade,
        category: item.category,
      }).score
    );
  }

  // Fetch purchases per category to compute revenue
  const purchases = await prisma.purchase.findMany({
    where: {
      saleId,
      status: 'PAID',
      createdAt: { gte: from, lte: to },
      item: { category: { not: null } },
    },
    include: {
      item: {
        select: {
          category: true,
          price: true,
        },
      },
    },
  });

  const categoryRevenue = new Map<string, number>();
  const categorySoldPrices = new Map<string, number[]>();

  for (const p of purchases) {
    if (!p.item?.category) continue;
    const cat = p.item.category;
    categoryRevenue.set(cat, (categoryRevenue.get(cat) || 0) + (p.amount || 0));
    if (!categorySoldPrices.has(cat)) {
      categorySoldPrices.set(cat, []);
    }
    if (p.item.price) {
      categorySoldPrices.get(cat)!.push(p.item.price);
    }
  }

  // Build breakdown
  const breakdown = Array.from(categoryMap.entries()).map(([cat, data]) => {
    const avgListPrice = data.prices.length > 0 ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length : 0;
    const soldPrices = categorySoldPrices.get(cat) || [];
    const avgSoldPrice = soldPrices.length > 0 ? soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length : 0;
    const totalRevenue = categoryRevenue.get(cat) || 0;
    const healthScoreAvg = data.healthScores.length > 0
      ? data.healthScores.reduce((a, b) => a + b, 0) / data.healthScores.length
      : 0;

    return {
      category: cat,
      itemsListed: data.itemsListed,
      itemsSold: data.itemsSold,
      sellThroughRate: data.itemsListed > 0 ? data.itemsSold / data.itemsListed : 0,
      avgListPrice: Number(avgListPrice.toFixed(2)),
      avgSoldPrice: Number(avgSoldPrice.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      healthScoreAvg: Number(healthScoreAvg.toFixed(1)),
    };
  });

  // Compute aggregate health score
  const allScores = Array.from(categoryMap.values()).flatMap(d => d.healthScores);
  const aggregateHealthScore = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  return {
    categoryBreakdown: breakdown,
    aggregateHealthScore: Number(aggregateHealthScore.toFixed(2)),
  };
}

/**
 * Hold/no-show rate: (expired + cancelled holds) / total holds
 */
async function computeHoldMetrics(saleId: string, from: Date, to: Date) {
  const holds = await prisma.itemReservation.findMany({
    where: {
      item: {
        saleId,
      },
      createdAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      status: true,
    },
  });

  const holdsCreated = holds.length;
  const holdsExpired = holds.filter(h => h.status === 'EXPIRED').length;
  const holdsCancelled = holds.filter(h => h.status === 'CANCELLED').length;
  const holdsConverted = holds.filter(h => h.status === 'CONFIRMED').length;

  const noShowRate = holdsCreated > 0 ? (holdsExpired + holdsCancelled) / holdsCreated : 0;

  return {
    holdsCreated,
    holdsExpired,
    holdsCancelled,
    holdsConverted,
    noShowRate: Number(noShowRate.toFixed(4)), // decimal form
    noShowRateNote: `${Math.round(noShowRate * 100)}% of holds did not convert to purchase`,
  };
}

/**
 * Main entry point: compute all metrics with caching
 */
export async function getPerformanceMetrics(
  organizerId: string,
  saleId: string,
  range: string = '30d',
  from?: string,
  to?: string
): Promise<PerformanceMetrics> {
  // Verify organizer owns the sale
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true },
  });

  if (!sale) {
    throw new Error(`Sale not found: ${saleId}`);
  }

  if (sale.organizerId !== organizerId) {
    throw new Error(`Organizer does not own sale: ${saleId}`);
  }

  // Check cache
  const cacheKey = `perf:org_${organizerId}:sale_${saleId}:range_${range}`;
  const cached = getCached<PerformanceMetrics>(cacheKey);
  if (cached) {
    return cached;
  }

  // Parse date range
  const { from: fromDate, to: toDate, label } = parseDateRange(range, from, to);

  // Compute all metrics
  const revenue = await computeRevenueMetrics(saleId, fromDate, toDate);
  const topSellingItems = await computeTopSellingItems(saleId, fromDate, toDate);
  const purchasing = await computeConversionRate(saleId, fromDate, toDate);
  const { categoryBreakdown, aggregateHealthScore } = await computeCategoryBreakdown(saleId, fromDate, toDate);
  const holdMetrics = await computeHoldMetrics(saleId, fromDate, toDate);

  const now = new Date();
  const cacheExpiry = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1h TTL

  const metrics: PerformanceMetrics = {
    success: true,
    organizerId,
    saleId,
    dateRange: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      label,
    },
    metrics: {
      revenue,
      itemMetrics: {
        topSellingItems,
        categoryBreakdown,
        aggregateHealthScore,
      },
      purchasingMetrics: purchasing,
      holdMetrics,
    },
    lastUpdated: now.toISOString(),
    cacheExpiry: cacheExpiry.toISOString(),
  };

  // Cache for 1 hour
  setCached(cacheKey, metrics, 3600);

  return metrics;
}
