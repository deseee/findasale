/**
 * ebayListingSyncCron.ts — Pull eBay listing data back into FindA.Sale (two-way sync)
 * Feature #244 Phase 4: Bidirectional eBay Sync
 *
 * Runs every 4 hours. For each organizer with eBay connected and AVAILABLE items
 * with ebayListingId set:
 * 1. Call Inventory API GET /sell/inventory/v1/inventory_item/{sku} for title, description, condition
 * 2. Call Inventory API GET /sell/inventory/v1/offer/{offerId} for current price
 * 3. Compare each field to what's stored in FindA.Sale
 * 4. If anything changed (and eBay value is non-empty), update the FindA.Sale item
 *
 * Condition mapping (eBay Inventory API enum -> FindA.Sale condition string):
 *   NEW / NEW_OTHER / NEW_WITH_DEFECTS       -> NEW
 *   USED_EXCELLENT / USED_VERY_GOOD / USED_GOOD / USED_ACCEPTABLE -> USED
 *   SELLER_REFURBISHED                       -> REFURBISHED
 *   FOR_PARTS_OR_NOT_WORKING                 -> PARTS_OR_REPAIR
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../controllers/ebayController';

// Map eBay Inventory API condition enum -> FindA.Sale condition string
function mapEbayConditionToFas(ebayCondition: string): string | null {
  switch (ebayCondition) {
    case 'NEW':
    case 'NEW_OTHER':
    case 'NEW_WITH_DEFECTS':
      return 'NEW';
    case 'USED_EXCELLENT':
    case 'USED_VERY_GOOD':
    case 'USED_GOOD':
    case 'USED_ACCEPTABLE':
      return 'USED';
    case 'SELLER_REFURBISHED':
      return 'REFURBISHED';
    case 'FOR_PARTS_OR_NOT_WORKING':
      return 'PARTS_OR_REPAIR';
    default:
      return null; // Unknown condition -- don't overwrite
  }
}

interface EbayInventoryItem {
  product?: {
    title?: string;
    description?: string;
  };
  condition?: string; // eBay Inventory API enum e.g. USED_GOOD
}

interface EbayOffer {
  pricingSummary?: {
    price?: {
      value?: string;
    };
  };
}

/**
 * Pull-sync eBay listings for a single organizer.
 */
async function pullSyncForOrganizer(organizerId: string): Promise<void> {
  // Fetch organizer's AVAILABLE items that have been pushed to eBay
  const items = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      ebayListingId: { not: null },
      sale: { organizerId },
    },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      condition: true,
      ebayListingId: true,
      ebayOfferId: true,
    },
  });

  // Fetch template once for this organizer — skip description pull-sync when a template is active
  // (eBay stores the expanded template HTML; pulling it back would overwrite the clean item description)
  const policyMapping = await prisma.ebayPolicyMapping.findUnique({
    where: { organizerId },
    select: { defaultDescriptionHtml: true },
  });
  const hasDescriptionTemplate = !!(policyMapping?.defaultDescriptionHtml);

  if (!items.length) {
    return;
  }

  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.error(`[eBay PullSync] Failed to get access token for organizer ${organizerId}`);
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  const proxyHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Language': 'en-US',
    ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
  };

  for (const item of items) {
    try {
      const sku = `FAS-${item.id}`;
      const updates: Record<string, string | number | null> = {};
      const changeLog: string[] = [];

      // --- Fetch inventory item (title, description, condition) ---
      const inventoryPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
      const inventoryRes = await fetch(
        `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(inventoryPath)}`,
        { method: 'GET', headers: proxyHeaders }
      );

      if (inventoryRes.ok) {
        const inventoryData = (await inventoryRes.json()) as EbayInventoryItem;

        // Title
        const ebayTitle = inventoryData.product?.title?.trim();
        if (ebayTitle && ebayTitle !== item.title) {
          updates.title = ebayTitle;
          changeLog.push(`title "${item.title}" -> "${ebayTitle}"`);
        }

        // Description — skip if organizer has a template (eBay stores expanded HTML; pulling back would clobber the clean item description)
        if (!hasDescriptionTemplate) {
          const ebayDescription = inventoryData.product?.description?.trim();
          if (ebayDescription && ebayDescription !== (item.description ?? '')) {
            updates.description = ebayDescription;
            changeLog.push(`description updated`);
          }
        }

        // Condition
        if (inventoryData.condition) {
          const fasCond = mapEbayConditionToFas(inventoryData.condition);
          if (fasCond && fasCond !== item.condition) {
            updates.condition = fasCond;
            changeLog.push(`condition "${item.condition ?? 'null'}" -> "${fasCond}"`);
          }
        }
      } else {
        console.warn(
          `[eBay PullSync] Inventory item fetch failed for ${sku}: HTTP ${inventoryRes.status}`
        );
      }

      // --- Fetch offer (price) ---
      if (item.ebayOfferId) {
        const offerPath = `/sell/inventory/v1/offer/${encodeURIComponent(item.ebayOfferId)}`;
        const offerRes = await fetch(
          `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(offerPath)}`,
          { method: 'GET', headers: proxyHeaders }
        );

        if (offerRes.ok) {
          const offerData = (await offerRes.json()) as EbayOffer;
          const priceStr = offerData.pricingSummary?.price?.value;
          if (priceStr) {
            const ebayPrice = parseFloat(priceStr);
            if (!isNaN(ebayPrice) && ebayPrice !== (item.price ?? null)) {
              updates.price = ebayPrice;
              changeLog.push(`price $${item.price ?? 'null'} -> $${ebayPrice}`);
            }
          }
        } else {
          console.warn(
            `[eBay PullSync] Offer fetch failed for offerId ${item.ebayOfferId}: HTTP ${offerRes.status}`
          );
        }
      }

      // Apply updates if any fields changed
      if (Object.keys(updates).length > 0) {
        await prisma.item.update({
          where: { id: item.id },
          data: updates,
        });
        console.log(
          `[eBay PullSync] Item ${item.id} "${item.title}": ${changeLog.join(', ')}`
        );
      }
    } catch (err) {
      console.error(`[eBay PullSync ERROR] Item ${item.id}:`, err);
      // Continue -- one item failure shouldn't block the rest
    }
  }
}

/**
 * Main cron function: pull-sync all organizers with eBay connections.
 */
async function ebayListingSync(): Promise<void> {
  try {
    const connections = await prisma.ebayConnection.findMany({
      where: {
        organizer: {
          sales: {
            some: {
              items: {
                some: {
                  ebayListingId: { not: null },
                  status: 'AVAILABLE',
                },
              },
            },
          },
        },
      },
      select: { organizerId: true },
    });

    console.log(
      `[eBay PullSync] Starting sync cycle for ${connections.length} organizers with eBay connections`
    );

    // Process sequentially to avoid eBay rate limits
    for (const { organizerId } of connections) {
      try {
        await pullSyncForOrganizer(organizerId);
      } catch (error) {
        console.error(
          `[eBay PullSync ERROR] Failed to process organizer ${organizerId}:`,
          error
        );
        // Continue -- one organizer failure shouldn't block others
      }
    }

    console.log('[eBay PullSync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay PullSync] Fatal error in ebayListingSync:', error);
  }
}

// Register the cron job to run every 4 hours (offset by 2 hours from ended-listings cron at :00)
export function startEbayListingSyncCron(): void {
  cron.schedule('0 2,6,10,14,18,22 * * *', cronGuard({ jobName: 'ebayListingSyncCron' }, async () => {
    console.log('[eBay PullSync] Starting 4-hour sync cycle...');
    await ebayListingSync();
  }));
  console.log('[eBay PullSync] Cron registered -- runs every 4 hours (2,6,10,14,18,22 UTC)');