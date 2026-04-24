import { prisma } from '../lib/prisma';
import { fetchEbayPriceComps } from '../controllers/ebayController';
import { searchPriceCharting } from '../services/priceChartingService';

/**
 * ADR-069 Phase 2: Async eBay Comps Fetch (Enhanced)
 *
 * After an item reaches PENDING_REVIEW or PUBLISHED status, fetch top 3 sold eBay listings
 * for the item's title + category and cache them in ItemCompLookup with 7-day TTL.
 *
 * Task 1: Enhanced Fallback Logic
 * - Tier 1 (existing): Search by title + category
 * - Tier 2 (new): If 0 results, search by title only
 * - Tier 3 (new): If 0 results, search by first 3 keywords + category
 * - Tier 4 (new): If 0 results, search by category alone
 *
 * Task 2: PriceCharting Integration
 * - After eBay fetch, search PriceCharting for relevant categories
 * - If PriceCharting returns HIGH/MEDIUM confidence and eBay returned 0 results, use PriceCharting price
 * - If both have results, blend: 60% eBay + 40% PriceCharting
 *
 * D-005 Locked Rule: Never modify item.price (organizer-set). Only item.aiSuggestedPrice
 * may be updated, and only when item.price is null.
 *
 * Non-throwing wrapper ensures this background job doesn't block the item publish flow.
 */

/**
 * Task 1: Fallback tier helper - extract first 3 meaningful words
 */
function extractKeywords(title: string): string {
  const commonWords = /^(vintage|antique|lot|set|collection|beautiful|nice|great|old|the|a|an)$/i;
  const words = title.split(/\s+/).filter((w) => !commonWords.test(w));
  return words.slice(0, 3).join(' ').trim();
}

/**
 * Task 1: Execute comp fetch with fallback tiers
 */
async function fetchEbayCompsWithFallbacks(
  title: string,
  category: string | null | undefined,
  condition: string | null | undefined,
  maxResults: number = 3
): Promise<{
  comps: any;
  fallbackTier: number;
}> {
  // Tier 1: title + category (existing)
  let comps = await fetchEbayPriceComps({
    title,
    category: category || undefined,
    condition,
    maxResults,
  });

  if (comps.count > 0) {
    return { comps, fallbackTier: 1 };
  }

  // Tier 2: title only
  console.log(`[fetchEbayComps] Tier 1 (title+category) returned 0 results; trying Tier 2 (title only)`);
  comps = await fetchEbayPriceComps({
    title,
    condition,
    maxResults,
  });

  if (comps.count > 0) {
    return { comps, fallbackTier: 2 };
  }

  // Tier 3: first 3 keywords + category
  const keywords = extractKeywords(title);
  if (keywords && keywords !== title) {
    console.log(`[fetchEbayComps] Tier 2 (title only) returned 0 results; trying Tier 3 (keywords+category): "${keywords}"`);
    comps = await fetchEbayPriceComps({
      title: keywords,
      category: category || undefined,
      condition,
      maxResults,
    });

    if (comps.count > 0) {
      return { comps, fallbackTier: 3 };
    }
  }

  // Tier 4: category only
  if (category) {
    console.log(`[fetchEbayComps] Tier 3 (keywords+category) returned 0 results; trying Tier 4 (category only)`);
    comps = await fetchEbayPriceComps({
      title: category,
      condition,
      maxResults: 5,
    });

    if (comps.count > 0) {
      console.log(`[fetchEbayComps] Tier 4 (category only) returned ${comps.count} results as very weak signal`);
      return { comps, fallbackTier: 4 };
    }
  }

  // No results from any tier
  return { comps, fallbackTier: 4 };
}

export async function fetchEbayCompsForItem(itemId: string): Promise<void> {
  try {
    // Fetch the item with relevant fields
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        category: true,
        conditionGrade: true,
        price: true,
        aiSuggestedPrice: true,
      },
    });

    if (!item) {
      console.warn(`[fetchEbayComps] Item ${itemId} not found`);
      return;
    }

    // Guard: skip if no title and no category
    if (!item.title && !item.category) {
      console.warn(`[fetchEbayComps] Item ${itemId} has no title and no category; skipping fetch`);
      return;
    }

    // Check if we have a recent cache hit (fetched within 7 days)
    const existingLookup = await prisma.itemCompLookup.findUnique({
      where: { itemId },
    });

    if (existingLookup && existingLookup.fetchedAt) {
      const now = new Date();
      const cacheAge = now.getTime() - existingLookup.fetchedAt.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      if (cacheAge < sevenDaysMs) {
        console.log(`[fetchEbayComps] Cache hit for item ${itemId}; skipping fetch`);
        return;
      }
    }

    // Task 1: Fetch top 3 comps from eBay with fallback tiers
    const { comps, fallbackTier } = await fetchEbayCompsWithFallbacks(
      item.title,
      item.category,
      item.conditionGrade,
      3
    );

    console.log(`[fetchEbayComps] Item ${itemId}: fetched ${comps.count} results, median=$${comps.median}, fallbackTier=${fallbackTier}`);

    // Task 2: Search PriceCharting for relevant categories
    let priceChartingResult = null;
    let blendedPrice: number | null = null;
    let source = 'ebay';

    if (item.category && item.title) {
      priceChartingResult = await searchPriceCharting(item.title, item.category);
    }

    // Task 2: Determine final price and source
    if (priceChartingResult && (priceChartingResult.confidence === 'HIGH' || priceChartingResult.confidence === 'MEDIUM')) {
      if (comps.count === 0) {
        // eBay returned nothing, use PriceCharting
        const pcPrice = priceChartingResult.cibPrice || priceChartingResult.loosePrice || null;
        if (pcPrice) {
          blendedPrice = pcPrice / 100; // convert cents to dollars
          source = 'pricecharting';
          console.log(`[fetchEbayComps] eBay returned 0 results; using PriceCharting: $${blendedPrice}`);
        }
      } else if (comps.median > 0) {
        // Both have results: blend 60% eBay + 40% PriceCharting
        const pcPrice = priceChartingResult.cibPrice || priceChartingResult.loosePrice;
        if (pcPrice) {
          blendedPrice = (comps.median * 0.6) + (pcPrice / 100 * 0.4);
          source = 'blended';
          console.log(`[fetchEbayComps] Blended price: 60% eBay ($${comps.median}) + 40% PriceCharting ($${pcPrice / 100}) = $${blendedPrice.toFixed(2)}`);
        }
      }
    }

    // Store/update in ItemCompLookup
    // Feature #314: Also capture the first eBay listing's image URL for comparable display
    const firstListingImageUrl = comps.listings && comps.listings.length > 0
      ? comps.listings[0].imageUrl
      : null;

    const now = new Date();
    const expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const updateData = {
      ebayPrice: comps.median || null,
      ebayCondition: item.conditionGrade || null,
      ebayCategory: item.category || null,
      ebayImageUrl: firstListingImageUrl,
      fallbackTier: fallbackTier,
      source: source,
      priceChartingId: priceChartingResult?.pcId || null,
      priceChartingPrice: priceChartingResult ? (priceChartingResult.cibPrice || priceChartingResult.loosePrice || null) : null,
      priceChartingConfidence: priceChartingResult?.confidence || null,
      fetchedAt: now,
      expireAt,
    };

    await prisma.itemCompLookup.upsert({
      where: { itemId },
      update: updateData,
      create: {
        itemId,
        ...updateData,
      },
    });

    // D-005 Locked Rule: Only update aiSuggestedPrice if organizer hasn't set an explicit price
    const finalPrice = blendedPrice !== null ? blendedPrice : comps.median;
    if (item.price === null && finalPrice && finalPrice > 0) {
      // Compare: if final price > current AI suggestion, update
      const currentSuggested = item.aiSuggestedPrice ? parseFloat(item.aiSuggestedPrice.toString()) : 0;
      if (finalPrice > currentSuggested) {
        await prisma.item.update({
          where: { id: itemId },
          data: { aiSuggestedPrice: finalPrice },
        });
        console.log(`[fetchEbayComps] Updated aiSuggestedPrice for item ${itemId} to $${finalPrice.toFixed(2)} (source: ${source})`);
      } else {
        console.log(`[fetchEbayComps] Final price $${finalPrice.toFixed(2)} not higher than current $${currentSuggested}; no price update`);
      }
    } else if (item.price !== null) {
      console.log(`[fetchEbayComps] Item ${itemId} has organizer-set price ($${item.price}); not updating aiSuggestedPrice`);
    }

    console.log(`[fetchEbayComps] Item ${itemId} processed successfully`);
  } catch (error) {
    // Non-blocking: log and swallow
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[fetchEbayComps] Failed for item ${itemId}: ${errorMessage}`);
    // Item publish flow continues unblocked
  }
}

/**
 * Enqueue fetchEbayCompsForItem for asynchronous execution.
 * Called by itemController.publishItem to queue job without blocking HTTP response.
 * Uses setImmediate to ensure caller response is sent first.
 *
 * TODO: Move to Bull queue when project reaches scale.
 */
export function enqueueFetchEbayComps(itemId: string): void {
  setImmediate(() => {
    fetchEbayCompsForItem(itemId).catch((err: unknown) => {
      console.error(`[fetchEbayComps] Uncaught error in fetchEbayCompsForItem(${itemId}):`, err);
    });
  });
}
