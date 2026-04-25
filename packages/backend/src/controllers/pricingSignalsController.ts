import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireOrganizer } from '../middleware/auth';

/**
 * GET /api/items/:id/pricing-signals
 * Returns sleeper pattern and brand exception signals for an item
 * Auth: organizer JWT required
 */
export const getPricingSignals = [
  authenticate,
  requireOrganizer,
  async (req: Request, res: Response) => {
    try {
      const { id: itemId } = req.params;

      // Fetch the item with brand and category
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          title: true,
          brand: true,
          category: true,
          price: true,
          visionTags: true,
        },
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Check for sleeper pattern match
      let sleeperAlert = null;
      if (item.title && item.category) {
        const sleeperPatterns = await prisma.sleeperPattern.findMany({
          where: { category: item.category },
        });

        for (const pattern of sleeperPatterns) {
          const indicatorTokens = pattern.indicatorTokens || [];
          const searchText =
            (item.title + ' ' + (item.visionTags || []).join(' ')).toLowerCase();

          const matched = indicatorTokens.some((token) =>
            searchText.includes(token.toLowerCase())
          );

          if (matched) {
            // Compute estimated range based on multiplier
            const basePrice = item.price || 100; // fallback if no price
            const estimatedLow = basePrice * pattern.priceMultiplier * 0.75;
            const estimatedHigh = basePrice * pattern.priceMultiplier * 1.25;

            sleeperAlert = {
              patternName: pattern.patternName,
              displayLabel: pattern.patternName, // Use pattern name as display label
              currentPrice: item.price || 0,
              estimatedLow: Math.round(estimatedLow * 100) / 100,
              estimatedHigh: Math.round(estimatedHigh * 100) / 100,
              confidence: 0.75, // Default confidence for pattern match
            };
            break;
          }
        }
      }

      // Check for brand exception match
      let brandPremiumAlert = null;
      if (item.brand && item.category) {
        const brandException = await prisma.brandException.findFirst({
          where: {
            brand: { contains: item.brand, mode: 'insensitive' },
            category: item.category,
          },
        });

        if (
          brandException &&
          brandException.trendMultiplier >= 1.15 &&
          brandException.sources &&
          brandException.sources.length >= 3
        ) {
          brandPremiumAlert = {
            brand: brandException.brand,
            multiplier: brandException.trendMultiplier,
            sampleSize: brandException.sources.length,
            appreciationMode: brandException.appreciationMode,
          };
        }
      }

      return res.json({
        sleeper: sleeperAlert,
        brandPremium: brandPremiumAlert,
      });
    } catch (error) {
      console.error('Error fetching pricing signals:', error);
      return res.status(500).json({
        error: 'Failed to fetch pricing signals',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
];
