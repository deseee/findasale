import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * Feature #XXX: Retail Mode Auto-Renewal Job
 *
 * Runs daily. Auto-renews retail mode sales that are nearing expiration.
 * For each sale where:
 *   - saleType = 'RETAIL'
 *   - status = 'PUBLISHED'
 *   - endDate is within retailAutoRenewDays days from now
 *   - No future retail sale already exists for this organizer
 *
 * Creates a new Sale with:
 *   - Same title, description, city, address, saleType, organizerId, saleType='RETAIL', retailAutoRenewDays
 *   - status='PUBLISHED'
 *   - startDate=today, endDate=today+retailAutoRenewDays
 *
 * Moves all items (except SOLD/DONATED) from old sale to new sale, updates lastSaleId.
 * Sets old sale status to 'ENDED'.
 * Does NOT send follower notifications for auto-renewed retail sales.
 *
 * Logs: [retailAutoRenew] Renewed sale ${oldSale.id} → ${newSale.id} for organizer ${organizerId}
 */

export const retailAutoRenew = async (): Promise<void> => {
  try {
    const now = new Date();

    // Query: find all retail mode sales that are:
    // - published, not ended
    // - nearing expiration (endDate is within retailAutoRenewDays days from now)
    const retailSalesNeedingRenewal = await prisma.sale.findMany({
      where: {
        saleType: 'RETAIL',
        status: 'PUBLISHED',
        endDate: {
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // within 30 days from now (worst case retailAutoRenewDays)
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

    if (retailSalesNeedingRenewal.length === 0) {
      console.log(`[retailAutoRenew] No retail sales needing renewal (checked at ${now.toISOString()})`);
      return;
    }

    console.log(`[retailAutoRenew] Found ${retailSalesNeedingRenewal.length} sale(s) needing renewal`);

    for (const oldSale of retailSalesNeedingRenewal) {
      try {
        // Check if a future retail sale already exists for this organizer
        const futureRetailSale = await prisma.sale.findFirst({
          where: {
            organizerId: oldSale.organizerId,
            saleType: 'RETAIL',
            status: 'PUBLISHED',
            startDate: {
              gt: oldSale.endDate,
            },
          },
        });

        if (futureRetailSale) {
          console.log(
            `[retailAutoRenew] Skipping renewal for sale ${oldSale.id} — ` +
            `future retail sale ${futureRetailSale.id} already exists for organizer ${oldSale.organizerId}`
          );
          continue;
        }

        // Calculate new dates
        const newStartDate = new Date(oldSale.endDate.getTime() + 1000); // Start right after old sale ends
        const newEndDate = new Date(
          newStartDate.getTime() + oldSale.retailAutoRenewDays * 24 * 60 * 60 * 1000
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
            saleType: 'RETAIL',
            organizerId: oldSale.organizerId,
            retailAutoRenewDays: oldSale.retailAutoRenewDays,
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
            `[retailAutoRenew] Moved ${oldSale.items.length} item(s) from old sale ${oldSale.id} to new sale ${newSale.id}`
          );
        }

        // Set old sale status to ENDED
        await prisma.sale.update({
          where: { id: oldSale.id },
          data: { status: 'ENDED' },
        });

        console.log(
          `[retailAutoRenew] Renewed sale ${oldSale.id} → ${newSale.id} for organizer ${oldSale.organizerId} ` +
          `(${oldSale.items.length} items moved, new end date: ${newEndDate.toISOString()})`
        );
      } catch (error) {
        console.error(`[retailAutoRenew] Error renewing sale ${oldSale.id}:`, error);
      }
    }

    console.log(`[retailAutoRenew] Retail auto-renewal job completed`);
  } catch (error) {
    console.error('[retailAutoRenew] Fatal error:', error);
  }
};

/**
 * Register the retail auto-renewal cron job.
 * Schedule: Daily at 1 AM UTC (configurable via env var if needed).
 * Cron pattern: '0 1 * * *' = every day at 01:00 UTC
 */
export const scheduleRetailAutoRenewCron = (): void => {
  cron.schedule('0 1 * * *', () => {
    console.log('[retailAutoRenew] Running scheduled retail auto-renewal job...');
    retailAutoRenew();
  });
  console.log('[retailAutoRenew] Scheduled retail auto-renewal job registered (daily at 01:00 UTC)');
};
