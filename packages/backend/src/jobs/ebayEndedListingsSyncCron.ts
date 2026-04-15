/**
 * ebayEndedListingsSyncCron.ts — Poll eBay for ended listings and clear them from FindA.Sale
 * Feature #244 Phase 3: Ended Listing Detection
 *
 * Runs every 4 hours. For each organizer with eBay connected:
 * 1. Fetch all active (AVAILABLE) items with ebayListingId
 * 2. Batch call Trading API GetMultipleItems to check ListingStatus
 * 3. For items with status ENDED/COMPLETED, clear ebayListingId, listedOnEbayAt, ebayOfferId
 * 4. Create notifications for organizer
 *
 * Relation path: Item -> Sale -> Organizer -> EbayConnection
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { syncEndedListingsForOrganizer } from '../controllers/ebayController';

/**
 * Main cron function: sync ended listings for all organizers with eBay connections.
 */
async function ebayEndedListingsSync(): Promise<void> {
  try {
    // Find all organizers that have both an eBay connection AND AVAILABLE items pushed to eBay
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
      `[eBay EndedSync] Starting sync cycle for ${connections.length} organizers with eBay connections`
    );

    // Process sequentially to avoid eBay rate limits
    for (const { organizerId } of connections) {
      try {
        await syncEndedListingsForOrganizer(organizerId);
      } catch (error) {
        console.error(
          `[eBay EndedSync ERROR] Failed to process organizer ${organizerId}:`,
          error
        );
        // Continue — one failure shouldn't block other organizers
      }
    }

    console.log('[eBay EndedSync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay EndedSync] Fatal error in ebayEndedListingsSync:', error);
  }
}

// Register the cron job to run every 4 hours (0 */4 * * *)
export function startEbayEndedListingsSyncCron(): void {
  cron.schedule('0 */4 * * *', async () => {
    console.log('[eBay EndedSync] Starting 4-hour sync cycle...');
    await ebayEndedListingsSync();
  });
  console.log('[eBay EndedSync] Cron registered — runs every 4 hours');
}
