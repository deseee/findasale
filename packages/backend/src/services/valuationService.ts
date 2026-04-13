import { prisma } from '../lib/prisma';

/**
 * Generate valuation for an item based on comparable sold items
 * Phase 1: Statistical model — find items in same category, calculate min/median/max price
 */
export async function generateValuation(itemId: string) {
  try {
    // Fetch the item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    // Find comparable items: same category, sold (has Purchase), price in range, recent
    const comparables = await prisma.item.findMany({
      where: {
        category: item.category,
        saleId: { not: item.saleId }, // Different sale
        purchases: {
          some: {
            status: 'PAID', // Sold
          },
        },
        price: item.price
          ? {
              gte: item.price / 5, // Within 5x range
              lte: item.price * 5,
            }
          : undefined,
      },
      include: {
        purchases: {
          where: { status: 'PAID' },
          include: { sale: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter for items sold within last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentComparables = comparables.filter((comp) => {
      const soldDate = comp.purchases[0]?.sale?.createdAt;
      return soldDate && soldDate > ninetyDaysAgo;
    });

    // Need at least 10 comparables
    if (recentComparables.length < 10) {
      // Return null to indicate insufficient data
      await prisma.itemValuation.upsert({
        where: { itemId },
        create: {
          itemId,
          priceLow: 0,
          priceHigh: 0,
          priceMedian: 0,
          confidenceScore: 0,
          comparableCount: recentComparables.length,
          method: 'STATISTICAL',
        },
        update: {
          comparableCount: recentComparables.length,
        },
      });

      return { insufficient_data: true, comparableCount: recentComparables.length };
    }

    // Extract prices, sort, remove top/bottom 5%
    const prices = recentComparables
      .map((c) => c.price)
      .filter((p) => p !== null && p !== undefined) as number[];

    prices.sort((a, b) => a - b);

    // Remove top and bottom 5%
    const trimCount = Math.ceil(prices.length * 0.05);
    const trimmedPrices = prices.slice(trimCount, prices.length - trimCount);

    // Calculate min, max, median
    const priceLow = Math.min(...trimmedPrices);
    const priceHigh = Math.max(...trimmedPrices);
    const priceMedian =
      trimmedPrices.length % 2 === 0
        ? (trimmedPrices[trimmedPrices.length / 2 - 1] +
            trimmedPrices[trimmedPrices.length / 2]) /
          2
        : trimmedPrices[Math.floor(trimmedPrices.length / 2)];

    // Confidence score: min(comparableCount * 5, 100)
    // 20 comparables = 100% confidence
    const confidenceScore = Math.min(recentComparables.length * 5, 100);

    // Upsert valuation record
    const valuation = await prisma.itemValuation.upsert({
      where: { itemId },
      create: {
        itemId,
        priceLow,
        priceHigh,
        priceMedian,
        confidenceScore,
        comparableCount: recentComparables.length,
        method: 'STATISTICAL',
      },
      update: {
        priceLow,
        priceHigh,
        priceMedian,
        confidenceScore,
        comparableCount: recentComparables.length,
        updatedAt: new Date(),
      },
    });

    return valuation;
  } catch (error) {
    console.error('[Valuation] Error generating valuation for item', itemId, error);
    throw error;
  }
}

/**
 * Get valuation for an item (returns cached or generates if missing)
 */
export async function getValuation(itemId: string) {
  try {
    let valuation = await prisma.itemValuation.findUnique({
      where: { itemId },
    });

    // If no valuation exists, try to generate it
    if (!valuation) {
      const result = await generateValuation(itemId);
      if ('insufficient_data' in result && result.insufficient_data) {
        return {
          status: 'INSUFFICIENT_DATA',
          comparableCount: (result as any).comparableCount,
        };
      }
      valuation = result as any;
    }

    return {
      status: 'READY',
      data: valuation,
    };
  } catch (error) {
    console.error('[Valuation] Error getting valuation for item', itemId, error);
    throw error;
  }
}
