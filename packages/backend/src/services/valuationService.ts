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
        // Feature #300: conditional spread — item may have null saleId (inventory item)
        ...(item.saleId ? { saleId: { not: item.saleId } } : {}), // Different sale
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

    // Need at least 10 comparables; fallback to PriceBenchmark (ADR-069 Phase 1)
    let priceLow = 0;
    let priceHigh = 0;
    let priceMedian = 0;
    let confidenceScore = 0;
    let method = 'STATISTICAL';

    if (recentComparables.length < 10) {
      // ADR-069: Query PriceBenchmark as fallback
      const benchmarks = await prisma.priceBenchmark.findMany({
        where: {
          entry: {
            category: { contains: item.category || '', mode: 'insensitive' }
          },
          condition: item.condition || 'USED'
        },
        include: { entry: true },
        take: 3,
        orderBy: { createdAt: 'desc' }
      });

      if (benchmarks.length > 0) {
        // Calculate median from benchmark price ranges
        const benchmarkPrices = benchmarks.map(b => (b.priceRangeLow + b.priceRangeHigh) / 2);
        benchmarkPrices.sort((a, b) => a - b);
        const benchmarkMedian = benchmarkPrices[Math.floor(benchmarkPrices.length / 2)];

        // Blend: 60% Haiku suggested price, 40% benchmark median
        const haikuPrice = item.aiSuggestedPrice ? Number(item.aiSuggestedPrice) : 0;
        priceMedian = haikuPrice > 0
          ? haikuPrice * 0.6 + benchmarkMedian * 0.4
          : benchmarkMedian;

        // Use benchmark low/high with slight adjustment
        priceLow = Math.max(benchmarks[0].priceRangeLow, priceMedian * 0.8);
        priceHigh = Math.min(benchmarks[0].priceRangeHigh, priceMedian * 1.2);

        // Confidence: comparables count + benchmark boost
        confidenceScore = Math.min((recentComparables.length + 5) / 20 * 100, 100);
        method = 'STATISTICAL_WITH_BENCHMARK';
      } else {
        // No benchmarks either; return insufficient data
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
    } else {
      // Standard path: have enough comparables
      // Extract prices, sort, remove top/bottom 5%
      const prices = recentComparables
        .map((c) => c.price)
        .filter((p) => p !== null && p !== undefined) as number[];

      prices.sort((a, b) => a - b);

      // Remove top and bottom 5%
      const trimCount = Math.ceil(prices.length * 0.05);
      const trimmedPrices = prices.slice(trimCount, prices.length - trimCount);

      // Calculate min, max, median
      priceLow = Math.min(...trimmedPrices);
      priceHigh = Math.max(...trimmedPrices);
      priceMedian =
        trimmedPrices.length % 2 === 0
          ? (trimmedPrices[trimmedPrices.length / 2 - 1] +
              trimmedPrices[trimmedPrices.length / 2]) /
            2
          : trimmedPrices[Math.floor(trimmedPrices.length / 2)];

      // Confidence score: min(comparableCount * 5, 100)
      confidenceScore = Math.min(recentComparables.length * 5, 100);
      method = 'STATISTICAL';
    }

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
        method,
      },
      update: {
        priceLow,
        priceHigh,
        priceMedian,
        confidenceScore,
        comparableCount: recentComparables.length,
        method,
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
