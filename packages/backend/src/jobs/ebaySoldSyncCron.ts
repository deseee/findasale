/**
 * ebaySoldSyncCron.ts — Poll eBay for sold items and mark them SOLD on FindA.Sale
 * Feature #244 Phase 3: eBay Fulfillment API polling
 *
 * Runs every 15 minutes. For each organizer with eBay connected:
 * 1. Refresh access token if needed
 * 2. Fetch recent orders from eBay Fulfillment API
 * 3. Match eBay line items to FindA.Sale items (by SKU or legacyItemId)
 * 4. Mark matched items SOLD
 * 5. Create notifications for organizer
 * 6. Update lastEbaySoldSyncAt timestamp for deduplication
 *
 * Relation path: Item -> Sale -> Organizer -> EbayConnection
 * (Organizer has no direct items[] relation — items belong to Sale)
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { refreshEbayAccessToken, endEbayListingIfExists } from '../controllers/ebayController';

interface EbayItem {
  id: string;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  title: string;
  saleId: string | null; // Feature #300: nullable — inventory items have no sale
}

interface SyncResult {
  synced: number;
  itemsMarkedSold: Array<{
    itemId: string;
    title: string;
    ebayOrderId: string;
  }>;
}

/**
 * Sync sold items for a specific organizer.
 * Called by both the cron job and the manual trigger endpoint (GET /api/ebay/sync-sold).
 */
export async function syncSoldItemsForOrganizer(organizerId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, itemsMarkedSold: [] };

  try {
    // Get the organizer's eBay connection
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!connection) {
      console.log(`[eBay Sync] Organizer ${organizerId}: no eBay connection found`);
      return result;
    }

    // Get organizer's userId for notifications
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      console.log(`[eBay Sync] Organizer ${organizerId}: not found`);
      return result;
    }

    // Get all AVAILABLE items pushed to eBay for this organizer (via Sale relation)
    const availableEbayItems: EbayItem[] = await prisma.item.findMany({
      where: {
        ebayListingId: { not: null },
        status: 'AVAILABLE',
        sale: { organizerId },
      },
      select: {
        id: true,
        ebayListingId: true,
        ebayOfferId: true,
        title: true,
        saleId: true,
      },
    });

    if (!availableEbayItems.length) {
      console.log(`[eBay Sync] Organizer ${organizerId}: no AVAILABLE items with ebayListingId`);
      return result;
    }

    // Refresh access token if needed
    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.error(`[eBay Sync] Failed to get access token for organizer ${organizerId}`);
      return result;
    }

    // Re-fetch connection for the latest lastEbaySoldSyncAt after token refresh
    const freshConnection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
      select: { lastEbaySoldSyncAt: true },
    });

    // Build filter for eBay Fulfillment API
    // If we've synced before, only fetch orders created since last sync
    let filter = 'orderfulfillmentstatus:{FULFILLED|IN_PROGRESS}';
    if (freshConnection?.lastEbaySoldSyncAt) {
      const startDate = freshConnection.lastEbaySoldSyncAt.toISOString();
      const endDate = new Date().toISOString();
      filter += `,creationdate:[${startDate}..${endDate}]`;
    }

    // Call eBay Fulfillment API
    const ebayResponse = await fetch(
      `https://api.ebay.com/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=50`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Language': 'en-US',
        },
      }
    );

    if (!ebayResponse.ok) {
      const errorMsg = `eBay Fulfillment API error: ${ebayResponse.status}`;
      console.error(`[eBay Sync] ${errorMsg} for organizer ${organizerId}`);
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: { lastErrorAt: new Date(), lastErrorMessage: errorMsg },
      });
      return result;
    }

    const ebayData = (await ebayResponse.json()) as { orders?: Array<{
      orderId: string;
      lineItems?: Array<{ sku?: string; legacyItemId?: string; title?: string }>;
    }> };
    const orders = ebayData.orders || [];

    console.log(
      `[eBay Sync] Organizer ${organizerId}: ${orders.length} fulfilled orders from eBay, ${availableEbayItems.length} local items to check`
    );

    // Process each order's line items
    for (const order of orders) {
      const lineItems = order.lineItems || [];

      for (const lineItem of lineItems) {
        const sku = lineItem.sku || '';
        const legacyItemId = lineItem.legacyItemId || '';

        // Match by SKU first (format: FAS-{itemId})
        let matchedItem: EbayItem | undefined;

        if (sku.startsWith('FAS-')) {
          const itemId = sku.substring(4);
          matchedItem = availableEbayItems.find((item) => item.id === itemId);
        }

        // Fall back to matching by legacyItemId (eBay listing ID)
        if (!matchedItem && legacyItemId) {
          matchedItem = availableEbayItems.find((item) => item.ebayListingId === legacyItemId);
        }

        if (!matchedItem) {
          continue; // Not our item — belongs to a different organizer or untracked listing
        }

        // Mark item SOLD
        await prisma.item.update({
          where: { id: matchedItem.id },
          data: { status: 'SOLD' },
        });

        // Withdraw eBay listing so item can't be purchased again on eBay (fire-and-forget)
        endEbayListingIfExists(matchedItem.id).catch(err =>
          console.warn(`[eBay Sync] withdraw failed for item ${matchedItem!.id}:`, err.message)
        );

        // Notify organizer
        await prisma.notification.create({
          data: {
            userId: organizer.userId,
            type: 'SALE_UPDATE',
            title: 'Item sold on eBay',
            body: `"${matchedItem.title}" was purchased on eBay and has been marked as sold.`,
            link: matchedItem.saleId ? `/organizer/sales/${matchedItem.saleId}` : `/organizer/inventory`,
            notificationChannel: 'IN_APP',
          },
        });

        console.log(
          `[eBay Sync] Item ${matchedItem.id} ("${matchedItem.title}") marked SOLD — eBay order ${order.orderId}`
        );

        result.synced++;
        result.itemsMarkedSold.push({
          itemId: matchedItem.id,
          title: matchedItem.title,
          ebayOrderId: order.orderId,
        });
      }
    }

    // Update lastEbaySoldSyncAt for deduplication on next run
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: { lastEbaySoldSyncAt: new Date(), lastErrorAt: null, lastErrorMessage: null },
    });

    console.log(
      `[eBay Sync] Organizer ${organizerId}: sync complete — ${result.synced} items marked SOLD`
    );
  } catch (error) {
    console.error(`[eBay Sync ERROR] organizerId ${organizerId}:`, error);
  }

  return result;
}

/**
 * Main cron function: sync sold items for all organizers with eBay connections.
 */
async function syncEbaySoldItems(): Promise<void> {
  try {
    // Find all organizers that have both an eBay connection AND AVAILABLE items pushed to eBay.
    // Items live under Sale, so the path is: EbayConnection -> Organizer -> Sales -> Items
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
      `[eBay Sync] Starting sync cycle for ${connections.length} organizers with eBay connections`
    );

    // Process sequentially to avoid eBay rate limits
    for (const { organizerId } of connections) {
      try {
        await syncSoldItemsForOrganizer(organizerId);
      } catch (error) {
        console.error(
          `[eBay Sync ERROR] Failed to process organizer ${organizerId}:`,
          error
        );
        // Continue — one failure shouldn't block other organizers
      }
    }

    console.log('[eBay Sync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay Sync] Fatal error in syncEbaySoldItems:', error);
  }
}

// Register the cron job to run every 15 minutes
// Cron expression: */15 * * * *
export function startEbaySoldSyncCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[eBay Sync] Starting 15-minute sync cycle...');
    await syncEbaySoldItems();
  });
  console.log('[eBay Sync] Cron registered — runs every 15 minutes');
}
