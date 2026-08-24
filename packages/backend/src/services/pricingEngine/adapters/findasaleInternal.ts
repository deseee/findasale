/**
 * FindA.Sale Internal Adapter — comps from FindA.Sale's own confirmed sold items
 *
 * Folds in the legacy "Suggest Price" mechanism's data source (previously
 * POST /ai/price-suggest, routes/items.ts:868-875) as a proper low-weight tier-2
 * PricingAdapter instead of a standalone LLM-wrapped feature. "What do FindA.Sale's own
 * buyers actually pay" is a structurally distinct and valuable signal (different buyer
 * population than Discogs/eBay/GSA) — worth keeping permanently, not just today.
 *
 * This is the ONE source in the registry that can honestly claim a confirmed FindA.Sale
 * sale (isSoldPrice: true), not an asking price. Its statistical weakness (tiny N today)
 * is exactly what weighting.ts's sample-size boost is for — as FindA.Sale's own sold-item
 * volume grows, this source's weight rises automatically, no manual re-tuning needed.
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { prisma } from '../../../lib/prisma';

export class FindaSaleInternalAdapter implements PricingAdapter {
  sourceId = 'findasaleInternal';
  tier: 1 | 2 | 3 = 2;
  isAskingPrice = false; // these are confirmed SOLD Item rows — real sale prices, not asks

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      if (!request.category) {
        return [];
      }

      // Same category-insensitive/SOLD/take-5 query the legacy /ai/price-suggest route used
      // (routes/items.ts:868-875) — the query logic moves here, it isn't duplicated once the
      // legacy route is retired.
      const recentComps = await prisma.item.findMany({
        where: {
          category: { equals: request.category, mode: 'insensitive' },
          status: 'SOLD',
          price: { not: null, gt: 0 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { price: true, updatedAt: true },
      });

      if (recentComps.length === 0) {
        return [];
      }

      // Confidence scales with sample size: more confirmed comps = more trust in this signal,
      // but even a full 5-comp match is category-only (no title/format matching), so it stays
      // below Discogs' direct-format-match comparability.
      const confidence = recentComps.length >= 4 ? 0.6 : recentComps.length >= 2 ? 0.5 : 0.4;

      const results: SourceResult[] = recentComps.map(comp => ({
        sourceId: 'findasaleInternal',
        price: Math.round((comp.price as number) * 100), // dollars -> cents
        isSoldPrice: true, // a confirmed FindA.Sale sale — the only source that can claim this
        saleDate: comp.updatedAt,
        confidence,
        comparabilityScore: 0.55, // category-only match, not title/format-matched
        sampleSize: recentComps.length,
      }));

      return results;
    } catch (error) {
      console.error('[FindaSaleInternal] Error:', error);
      return [];
    }
  }

  isConfigured(): boolean {
    // No external key — this queries our own database.
    return true;
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: Infinity };
  }
}
