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
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { refreshEbayAccessToken } from '../controllers/ebayController';

interface SyncResult {
  synced: number;
  itemsMarkedSold: Array<{
    itemId: string;
    title: string;
    ebayOrderId: string;
  }>;
}

/**
 * Sync sold items for a specific organizer
 * Called by both the cron job and the manual trigger endpoint
 */
export async function syncSoldItemsForOrganizer(organizerId: string): Promise<SyncResult> {
  const result: SyncResult = {
    synced: 0,
    itemsMarkedSold: [],
  };

  try {
    // Get the organizer's eBay connection with items
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
      include: {
        organizer: {
          select: {
            userId: true,
            items: {
              where: {
                ebayListingId: { not: null },
                status: 'AVAILABLE',
              },
              select: {
                id: true,
                ebayListingId: true,
                ebayOfferId: true,
                title: true,
                price: true,
                saleId: true,
              },
            },
          },
        },
      },
    });

    if (!connection || !connection.organizer.items.length) {
      console.log(
        `[eBay Sync] Organizer ${organizerId}: no connection or no AVAILABLE items with ebayListingId`
      );
      return result;
    }

    // Refresh access token if needed
    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.error(`[eBay Sync] Failed to get access token for organizer ${organizerId}`);
      return result;
    }

    // Fetch the connection again to get the freshly updated token
    const updatedConnection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!updatedConnection) {
      return result;
    }

    // Build filter for eBay API
    // If we've synced before, only fetch orders created since last sync
    let filter = 'orderfulfillmentstatus:{FULFILLED|IN_PROGRESS}';
    if (updatedConnection.lastEbaySoldSyncAt) {
      const startDate = updatedConnection.lastEbaySoldSyncAt.toISOString();
      const endDate = new Date().toISOString();
      filter += `,creationdate:[${startDate}..${endDate}]`;
    }

    // Call eBay Fulfillment API
    const ebayResponse = await fetch(
      `https://api.ebay.com/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=50`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Language': 'en-US',
        },
      }
    );

    if (!ebayResponse.ok) {
      const errorMsg = `eBay API error: ${ebayResponse.status}`;
      console.error(`[eBay Sync] ${errorMsg}`);
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: errorMsg,
        },
      });
      return result;
    }

    const ebayData = (await ebayResponse.json()) as any;
    const orders = ebayData.orders || [];

    console.log(
      `[eBay Sync] Organizer ${organizerId}: fetched ${orders.length} fulfilled/in-progress orders`
    );

    // Process each order
    for (const order of orders) {
      const lineItems = order.lineItems || [];

      for (const lineItem of lineItems) {
        const sku = lineItem.sku || '';
        const legacyItemId = lineItem.legacyItemId || '';
        const lineItemTitle = lineItem.title || '';

        // Try to match by SKU first (format: FAS-{itemId})
        let matchedItem = null;
        let itemId = '';

        if (sku && sku.startsWith('FAS-')) {
          itemId = sku.substring(4);
          matchedItem = connection.organizer.items.find((item: { id: string; ebayListingId: string | null; ebayOfferId: string | null; title: string; price: any }) => item.id === itemId);
        }

        // Fall back to matching by legacyItemId (eBay listing ID)
        if (!matchedItem && legacyItemId) {
          matchedItem = connection.organizer.items.find((item: { id: string; ebayListingId: string | null; ebayOfferId: string | null; title: string; price: any }) => item.ebayListingId === legacyItemId);
        }

        if (!matchedItem) {
          console.log(
            `[eBay Sync] Organizer ${organizerId}: no match found for SKU="${sku}" or legacyItemId="${legacyItemId}"`
          );
          continue;
        }

        // Check if already SOLD (idempotent)
        if (matchedItem.status === 'SOLD') {
          console.log(
            `[eBay Sync] Item ${matchedItem.id} ("${matchedItem.title}") already SOLD, skipping`
          );
          continue;
        }

        // Mark item as SOLD
        await prisma.item.update({
          where: { id: matchedItem.id },
          data: { status: 'SOLD' },
        });

        // Create notification for organizer
        await prisma.notification.create({
          data: {
            userId: connection.organizer.userId,
            type: 'SALE_UPDATE',
            title: 'Item sold on eBay',
            body: `"${matchedItem.title}" was purchased on eBay and has been marked as sold.`,
            link: `/sales/${matchedItem.saleId}`,
            notificationChannel: 'IN_APP',
          },
        });

        console.log(
          `[eBay Sync] Item ${matchedItem.id} ("${matchedItem.title}") marked SOLD — sold on eBay order ${order.orderId}`
        );

        result.synced++;
        result.itemsMarkedSold.push({
          itemId: matchedItem.id,
          title: matchedItem.title,
          ebayOrderId: order.orderId,
        });
      }
    }

    // Update lastEbaySoldSyncAt for deduplication
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: {
        lastEbaySoldSyncAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    console.log(
      `[eBay Sync] Organizer ${organizerId}: synced ${result.synced} items, marked ${result.itemsMarkedSold.length} SOLD`
    );
  } catch (error) {
    console.error(`[eBay Sync ERROR] organizerId ${organizerId}:`, error);
  }

  return result;
}

/**
 * Main cron function: sync sold items for all organizers
 */
async function syncEbaySoldItems(): Promise<void> {
  try {
    // Get all EbayConnections with available items pushed to eBay
    const connections = await prisma.ebayConnection.findMany({
      where: {
        organizer: {
          items: {
            some: {
              ebayListingId: { not: null },
              status: 'AVAILABLE',
            },
          },
        },
      },
      select: {
        organizerId: true,
      },
    });

    console.log(
      `[eBay Sync] Starting sync for ${connections.length} organizers with eBay connections`
    );

    // Process each organizer sequentially (no parallelization to avoid rate limits)
    for (const connection of connections) {
      try {
        await syncSoldItemsForOrganizer(connection.organizerId);
      } catch (error) {
        console.error(
          `[eBay Sync ERROR] Failed to process organizer ${connection.organizerId}:`,
          error
        );
        // Continue to next organizer — one failure shouldn't block others
      }
    }

    console.log('[eBay Sync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay Sync] Fatal error:', error);
  }
}

// Register the cron job to run every 15 minutes
// Cron expression: every-15-min * * * * (*/15 * * * *)
export function startEbaySoldSyncCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[eBay Sync] Starting 15-minute sync cycle...');
    await syncEbaySoldItems();
  });
  console.log('[eBay Sync] Cron registered — runs every 15 minutes');
}
