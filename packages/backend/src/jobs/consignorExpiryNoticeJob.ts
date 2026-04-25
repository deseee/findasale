import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendConsignorExpiryNotice } from '../services/consignorEmailService';

/**
 * Daily cron job (2 AM UTC) to send expiry notices for consigned items at 60 days
 */
export const scheduleConsignorExpiryNoticeCron = (): void => {
  // Run daily at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    console.log('[consignor-expiry-cron] Starting consignor expiry notice job...');
    await processConsignorExpiryNotices();
  });
};

export const processConsignorExpiryNotices = async (): Promise<void> => {
  try {
    const now = new Date();

    // Calculate date range: items created 60-61 days ago
    // This ensures each item gets the notice exactly once
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const sixtyOneDaysAgo = new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000);

    // Find consigned items created in that window that are still AVAILABLE (not sold)
    const expiringItems = await prisma.item.findMany({
      where: {
        consignorId: { not: null },
        status: 'AVAILABLE',
        createdAt: {
          gte: sixtyOneDaysAgo,
          lte: sixtyDaysAgo,
        },
      },
      include: {
        consignor: { select: { id: true, name: true, email: true } },
        sale: { select: { title: true, organizer: { select: { user: { select: { email: true, name: true } } } } } },
      },
    });

    console.log(`[consignor-expiry-cron] Found ${expiringItems.length} items nearing 60-day expiry`);

    for (const item of expiringItems) {
      if (!item.consignor?.email) {
        console.warn(`[consignor-expiry-cron] Item ${item.id} has no consignor email, skipping`);
        continue;
      }

      const organizerName = item.sale?.organizer?.user?.name || 'Your organizer';
      const organizerEmail = item.sale?.organizer?.user?.email || 'support@finda.sale';
      const saleId = item.saleId || '';

      try {
        // Fire-and-forget notification
        setImmediate(() => {
          sendConsignorExpiryNotice({
            consignorName: item.consignor!.name,
            consignorEmail: item.consignor!.email!,
            itemName: item.title,
            organizerName,
            organizerEmail,
            saleId,
          }).catch(err =>
            console.warn(
              `[consignor-expiry-cron] Failed to send expiry notice for item ${item.id}:`,
              err
            )
          );
        });
      } catch (err) {
        console.error(
          `[consignor-expiry-cron] Error processing item ${item.id}:`,
          err
        );
      }
    }

    console.log('[consignor-expiry-cron] Consignor expiry notice job completed');
  } catch (err) {
    console.error('[consignor-expiry-cron] Job failed:', err);
  }
};
