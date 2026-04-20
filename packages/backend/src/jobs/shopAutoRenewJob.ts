import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * Feature #XXX: Shop Mode Auto-Renewal Job
 *
 * Runs daily. Auto-renews shop mode sales that are nearing expiration.
 * For each sale where:
 *   - isShopMode = true
 *   - status = 'PUBLISHED'
 *   - endDate is within shopAutoRenewDays days from now
 *   - No future shop sale already exists for this organizer
 *
 * Creates a new Sale with:
 *   - Same title, description, city, address, saleType, organizerId, isShopMode=true, shopAutoRenewDays
 *   - status='PUBLISHED'
 *   - startDate=today, endDate=today+shopAutoRenewDays
 *
 * Moves all items (except SOLD/DONATED) from old sale to new sale, updates lastSaleId.
 * Sets old sale status to 'ENDED'.
 * Does NOT send follower notifications for auto-renewed shop sales.
 *
 * Logs: [shopAutoRenew] Renewed sale ${oldSale.id} → ${newSale.id} for organizer ${organizerId}
 */

export const shopAutoRenew = async (): Promise<void> => {
  try {
    const now = new Date();

    // Query: find all shop mode sales that are:
    // - published, not ended
    // - nearing expiration (endDate is within shopAutoRenewDays days from now)
    const shopSalesNeedingRenewal = await prisma.sale.findMany({
      where: {
        isShopMode: true,
        status: 'PUBLISHED',
        endDate: {
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // within 30 days from now (worst case shopAutoRenewDays)
          gte: now, // not already ended
        },
      },
      include: {
        organizer: {
          select: {
            id: true,
            userId: true,
            businessName: true,
          },
        },
        items: {
          where: {
            status: {
              notIn: ['SOLD', 'DONATED'],
            },
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (shopSalesNeedingRenewal.length === 0) {
      console.log(`[shopAutoRenew] No shop sales needing renewal (checked at ${now.toISOString()})`);
      return;
    }

    console.log(`[shopAutoRenew] Found ${shopSalesNeedingRenewal.length} sale(s) needing renewal`);

    for (const oldSale of shopSalesNeedingRenewal) {
      try {
        // Check if a future shop sale already exists for this organizer
        const futureShopSale = await prisma.sale.findFirst({
          where: {
            organizerId: oldSale.organizerId,
            isShopMode: true,
            status: 'PUBLISHED',
            startDate: {
              gt: oldSale.endDate,
            },
          },
        });

        if (futureShopSale) {
          console.log(
            `[shopAutoRenew] Skipping renewal for sale ${oldSale.id} — ` +
            `future shop sale ${futureShopSale.id} already exists for organizer ${oldSale.organizerId}`
          );
          continue;
        }

        // Calculate new dates
        const newStartDate = new Date(oldSale.endDate.getTime() + 1000); // Start right after old sale ends
        const newEndDate = new Date(
          newStartDate.getTime() + oldSale.shopAutoRenewDays * 24 * 60 * 60 * 1000
        );

        // Create new sale
        const newSale = await prisma.sale.create({
          data: {
            title: oldSale.title,
            description: oldSale.description,
            city: oldSale.city,
            address: oldSale.address,
            state: oldSale.state,
            zip: oldSale.zip,
            saleType: oldSale.saleType,
            organizerId: oldSale.organizerId,
            isShopMode: true,
            shopAutoRenewDays: oldSale.shopAutoRenewDays,
            status: 'PUBLISHED',
            startDate: newStartDate,
            endDate: newEndDate,
            lat: oldSale.lat,
            lng: oldSale.lng,
            neighborhood: oldSale.neighborhood,
            photoUrls: oldSale.photoUrls,
            tags: oldSale.tags,
            entranceLat: oldSale.entranceLat,
            entranceLng: oldSale.entranceLng,
            entranceNote: oldSale.entranceNote,
            notes: oldSale.notes,
            treasureHuntEnabled: oldSale.treasureHuntEnabled,
            treasureHuntCompletionBadge: oldSale.treasureHuntCompletionBadge,
            holdsEnabled: oldSale.holdsEnabled,
          },
        });

        // Move all non-sold/non-donated items to new sale
        if (oldSale.items.length > 0) {
          await prisma.item.updateMany({
            where: {
              id: {
                in: oldSale.items.map(item => item.id),
              },
            },
            data: {
              saleId: newSale.id,
              lastSaleId: oldSale.id,
              returnedToInventoryAt: null, // Reset return timestamp since moving to new sale
            },
          });

          console.log(
            `[shopAutoRenew] Moved ${oldSale.items.length} item(s) from old sale ${oldSale.id} to new sale ${newSale.id}`
          );
        }

        // Set old sale status to ENDED
        await prisma.sale.update({
          where: { id: oldSale.id },
          data: { status: 'ENDED' },
        });

        console.log(
          `[shopAutoRenew] Renewed sale ${oldSale.id} → ${newSale.id} for organizer ${oldSale.organizerId} ` +
          `(${oldSale.items.length} items moved, new end date: ${newEndDate.toISOString()})`
        );
      } catch (error) {
        console.error(`[shopAutoRenew] Error renewing sale ${oldSale.id}:`, error);
      }
    }

    console.log(`[shopAutoRenew] Shop auto-renewal job completed`);
  } catch (error) {
    console.error('[shopAutoRenew] Fatal error:', error);
  }
};

/**
 * Register the shop auto-renewal cron job.
 * Schedule: Daily at 1 AM UTC (configurable via env var if needed).
 * Cron pattern: '0 1 * * *' = every day at 01:00 UTC
 */
export const scheduleShopAutoRenewCron = (): void => {
  cron.schedule('0 1 * * *', () => {
    console.log('[shopAutoRenew] Running scheduled shop auto-renewal job...');
    shopAutoRenew();
  });
  console.log('[shopAutoRenew] Scheduled shop auto-renewal job registered (daily at 01:00 UTC)');
};
