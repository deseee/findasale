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

    // Get ALL AVAILABLE items for this organizer (via Sale relation).
    // Includes items with null ebayListingId — title-based fallback handles those
    // when eBay orders come in for items listed directly on eBay (not via FindA.Sale push).
    const availableItems: EbayItem[] = await prisma.item.findMany({
      where: {
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

    if (!availableItems.length) {
      console.log(`[eBay Sync] Organizer ${organizerId}: no AVAILABLE items`);
      return result;
    }

    // Refresh access token if needed
    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.error(`[eBay Sync] Failed to get access token for organizer ${organizerId}`);
      return result;
    }

    // Build filter for eBay Fulfillment API
    // Fixed 7-day sliding window — always look back 7 days regardless of lastEbaySoldSyncAt.
    // This is idempotent (items already SOLD are skipped by the availableItems query)
    // and robust against transient outages or items that were added to eBay outside our normal push flow.
    // Use lastmodifieddate (NOT creationdate) so we catch late payments — an order
    // created before the window but paid AFTER it would be permanently skipped if we
    // filtered on creationdate. lastmodifieddate updates on payment, so the order enters
    // our window when it becomes fulfilled.
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    const filter = `lastmodifieddate:[${startDate}..${endDate}]`;

    // Call eBay Fulfillment API
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;
    const ebayResponse = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=50`)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Language': 'en-US',
          ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
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
      `[eBay Sync] Organizer ${organizerId}: ${orders.length} fulfilled orders from eBay, ${availableItems.length} local items to check`
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
          matchedItem = availableItems.find((item) => item.id === itemId);
        }

        // Fall back to matching by legacyItemId (eBay listing ID)
        if (!matchedItem && legacyItemId) {
          matchedItem = availableItems.find((item) => item.ebayListingId === legacyItemId);
        }

        // Final fallback: title-based match for items without an ebayListingId.
        // Handles items the organizer listed directly on eBay (not via FindA.Sale push flow).
        // Only matches if exactly one local item shares the same title — ambiguous matches are skipped.
        if (!matchedItem && lineItem.title) {
          const normalizedTitle = lineItem.title.toLowerCase().trim();
          const titleMatches = availableItems.filter(
            (item) => item.ebayListingId === null && item.title.toLowerCase().trim() === normalizedTitle
          );
          if (titleMatches.length === 1) {
            matchedItem = titleMatches[0];
            // Backfill ebayListingId so future cron runs use the faster ID-based match
            if (legacyItemId) {
              await prisma.item.update({
                where: { id: matchedItem.id },
                data: { ebayListingId: legacyItemId },
              });
              console.log(
                `[eBay Sync] Title-matched item ${matchedItem.id} ("${matchedItem.title}") to eBay listing ${legacyItemId} — ebayListingId backfilled`
              );
              matchedItem = { ...matchedItem, ebayListingId: legacyItemId };
            }
          } else if (titleMatches.length > 1) {
            console.warn(
              `[eBay Sync] Ambiguous title match for "${lineItem.title}" — ${titleMatches.length} candidates, skipping`
            );
          }
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
    // Find all organizers that have both an eBay connection AND AVAILABLE items.
    // Items live under Sale, so the path is: EbayConnection -> Organizer -> Sales -> Items
    // Note: we no longer require ebayListingId IS NOT NULL here — title-based matching
    // inside syncSoldItemsForOrganizer handles items that were listed directly on eBay.
    const connections = await prisma.ebayConnection.findMany({
      where: {
        organizer: {
          sales: {
            some: {
              items: {
                some: {
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
