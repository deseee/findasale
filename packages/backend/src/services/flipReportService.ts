import { prisma } from '../lib/prisma';

export interface TopPerformer {
  id: string;
  title: string;
  finalPrice: number;
  category: string | null;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  sold: number;
  revenue: number;
}

export interface PricingInsights {
  averageAskingPrice: number;
  averageSalePrice: number;
  priceDropRate: number; // percentage of items with price reductions
}

export interface FlipReport {
  saleId: string;
  saleTitle: string;
  saleStartDate: Date;
  saleEndDate: Date;
  sellThroughRate: number; // percentage 0-100
  totalRevenue: number;
  itemsSold: number;
  itemsUnsold: number;
  topPerformers: TopPerformer[];
  unsoldItems: Array<{ id: string; title: string; askingPrice: number | null; category: string | null }>;
  categoryBreakdown: CategoryBreakdown[];
  pricingInsights: PricingInsights;
  recommendations: string[];
}

/**
 * Compute Flip Report for a completed sale
 * Verifies organizer owns the sale (throws 403 if not)
 * Returns post-sale analytics with metrics, insights, and recommendations
 */
export async function getFlipReport(saleId: string, organizerId: string): Promise<FlipReport> {
  // Verify organizer owns this sale
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          purchases: {
            where: { status: 'PAID' },
          },
        },
      },
      purchases: {
        where: { status: 'PAID' },
      },
    },
  });

  if (!sale) {
    throw new Error('Sale not found');
  }

  if (sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: you do not own this sale');
  }

  // ─── Compute Metrics ───

  // Sell-through rate: % of items sold
  const totalItems = sale.items.length;
  const soldItems = sale.items.filter((item) => item.status === 'SOLD');
  const sellThroughRate = totalItems > 0 ? (soldItems.length / totalItems) * 100 : 0;

  // Total revenue: sum of PAID purchases
  const totalRevenue = sale.purchases.reduce((sum, p) => sum + p.amount, 0);

  // Items sold / unsold counts
  const itemsSold = soldItems.length;
  const itemsUnsold = sale.items.filter((item) => item.status === 'AVAILABLE' || item.status === 'RESERVED').length;

  // Top 5 performers: SOLD items sorted by finalPrice (descending)
  // finalPrice is the amount from the purchase
  const topPerformersRaw = soldItems
    .map((item) => {
      const purchase = item.purchases[0]; // item has one PAID purchase if status is SOLD
      return {
        id: item.id,
        title: item.title,
        finalPrice: purchase?.amount ?? item.price ?? 0,
        category: item.category,
      };
    })
    .sort((a, b) => b.finalPrice - a.finalPrice)
    .slice(0, 5);

  const topPerformers: TopPerformer[] = topPerformersRaw;

  // Unsold items: AVAILABLE or RESERVED
  const unsoldItemsRaw = sale.items
    .filter((item) => item.status === 'AVAILABLE' || item.status === 'RESERVED')
    .map((item) => ({
      id: item.id,
      title: item.title,
      askingPrice: item.price,
      category: item.category,
    }));

  // Category breakdown
  const categoryMap = new Map<string, { total: number; sold: number; revenue: number }>();

  sale.items.forEach((item) => {
    const cat = item.category || 'Other';
    const existing = categoryMap.get(cat) || { total: 0, sold: 0, revenue: 0 };

    existing.total += 1;
    if (item.status === 'SOLD') {
      existing.sold += 1;
      const purchase = item.purchases[0];
      if (purchase) {
        existing.revenue += purchase.amount;
      }
    }

    categoryMap.set(cat, existing);
  });

  const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    ...data,
  }));

  // Pricing insights
  // Average asking price: mean of all item prices (excluding null)
  const itemsWithPrice = sale.items.filter((item) => item.price !== null && item.price !== undefined);
  const averageAskingPrice = itemsWithPrice.length > 0 ? itemsWithPrice.reduce((sum, item) => sum + (item.price || 0), 0) / itemsWithPrice.length : 0;

  // Average sale price: mean of all PAID purchase amounts
  const averageSalePrice = sale.purchases.length > 0 ? totalRevenue / sale.purchases.length : 0;

  // Price drop rate: % of items where finalPrice < askingPrice
  const itemsWithPriceReduction = soldItems.filter((item) => {
    const purchase = item.purchases[0];
    return purchase && item.price && purchase.amount < item.price;
  }).length;
  const priceDropRate = soldItems.length > 0 ? (itemsWithPriceReduction / soldItems.length) * 100 : 0;

  const pricingInsights: PricingInsights = {
    averageAskingPrice: Math.round(averageAskingPrice * 100) / 100,
    averageSalePrice: Math.round(averageSalePrice * 100) / 100,
    priceDropRate: Math.round(priceDropRate * 100) / 100,
  };

  // ─── Generate Recommendations ───

  const recommendations: string[] = [];

  // Recommendation 1: Sell-through rate feedback
  if (sellThroughRate >= 90) {
    recommendations.push('Excellent sell-through rate! Consider similar items in your next sale.');
  } else if (sellThroughRate >= 70) {
    recommendations.push('Strong sell-through rate. Your pricing strategy is working well.');
  } else if (sellThroughRate >= 50) {
    recommendations.push('Consider reviewing your pricing or item descriptions to improve sell-through rate.');
  } else {
    recommendations.push('Low sell-through rate. Review pricing, descriptions, and photos to increase sales.');
  }

  // Recommendation 2: Category performance
  const bestCategory = categoryBreakdown.sort((a, b) => (b.sold / b.total) - (a.sold / a.total))[0];
  if (bestCategory) {
    const catRate = (bestCategory.sold / bestCategory.total) * 100;
    if (catRate >= 75) {
      recommendations.push(`Your ${bestCategory.category.toLowerCase()} items sold exceptionally well — prioritize this category in future sales.`);
    }
  }

  // Recommendation 3: Price insights
  if (priceDropRate > 50) {
    recommendations.push('Over half of your items sold below asking price. Consider adjusting your initial pricing strategy.');
  } else if (priceDropRate < 20 && averageSalePrice > averageAskingPrice) {
    recommendations.push('Strong pricing power: items sold above asking price. Your market positioning is strong.');
  }

  // Recommendation 4: Revenue & volume feedback
  if (totalRevenue > 0) {
    const avgItemValue = totalRevenue / itemsSold;
    if (avgItemValue > 100) {
      recommendations.push('High average item value. Focus on similar high-value items in future sales.');
    }
  }

  // Ensure at least 3 recommendations
  if (recommendations.length < 3) {
    if (recommendations.length === 1) {
      recommendations.push('Keep track of which item categories perform best to refine your inventory selection.');
      recommendations.push('Consider engaging with shoppers to gather feedback on pricing and presentation.');
    } else if (recommendations.length === 2) {
      recommendations.push('Continuously refine your descriptions and photos based on shopper interest.');
    }
  }

  // Cap at 5 recommendations
  recommendations.length = Math.min(recommendations.length, 5);

  return {
    saleId,
    saleTitle: sale.title,
    saleStartDate: sale.startDate,
    saleEndDate: sale.endDate,
    sellThroughRate: Math.round(sellThroughRate * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    itemsSold,
    itemsUnsold,
    topPerformers,
    unsoldItems: unsoldItemsRaw,
    categoryBreakdown,
    pricingInsights,
    recommendations,
  };
}
