import { prisma } from '../lib/prisma';
import { fetchEbayPriceComps } from '../controllers/ebayController';

/**
 * ADR-069 Phase 2: Async eBay Comps Fetch
 *
 * After an item reaches PENDING_REVIEW or PUBLISHED status, fetch top 3 sold eBay listings
 * for the item's title + category and cache them in ItemCompLookup with 7-day TTL.
 *
 * D-005 Locked Rule: Never modify item.price (organizer-set). Only item.aiSuggestedPrice
 * may be updated, and only when item.price is null.
 *
 * Non-throwing wrapper ensures this background job doesn't block the item publish flow.
 */

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

    // Fetch top 3 comps from eBay
    const comps = await fetchEbayPriceComps({
      title: item.title,
      category: item.category || undefined,
      condition: item.conditionGrade || undefined,
      maxResults: 3,
    });

    console.log(`[fetchEbayComps] Item ${itemId}: fetched ${comps.count} results, median=$${comps.median}`);

    // Store/update in ItemCompLookup
    const now = new Date();
    const expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.itemCompLookup.upsert({
      where: { itemId },
      update: {
        ebayPrice: comps.median || null,
        ebayCondition: item.conditionGrade || null,
        ebayCategory: item.category || null,
        fetchedAt: now,
        expireAt,
      },
      create: {
        itemId,
        ebayPrice: comps.median || null,
        ebayCondition: item.conditionGrade || null,
        ebayCategory: item.category || null,
        fetchedAt: now,
        expireAt,
      },
    });

    // D-005 Locked Rule: Only update aiSuggestedPrice if organizer hasn't set an explicit price
    if (item.price === null && comps.count > 0 && comps.median > 0) {
      // Compare: if eBay median > current AI suggestion, update
      const currentSuggested = item.aiSuggestedPrice ? parseFloat(item.aiSuggestedPrice.toString()) : 0;
      if (comps.median > currentSuggested) {
        await prisma.item.update({
          where: { id: itemId },
          data: { aiSuggestedPrice: comps.median },
        });
        console.log(`[fetchEbayComps] Updated aiSuggestedPrice for item ${itemId} to $${comps.median}`);
      } else {
        console.log(`[fetchEbayComps] eBay median $${comps.median} not higher than current $${currentSuggested}; no price update`);
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
