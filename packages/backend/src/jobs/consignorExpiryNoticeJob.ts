import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendConsignorExpiryNotice } from '../services/consignorEmailService';
import { createNotification } from '../services/notificationService';
import { cronGuard } from '../utils/cronGuard';

/**
 * Daily cron job (2 AM UTC) to send expiry notices for consigned items at 60 days
 */
export const scheduleConsignorExpiryNoticeCron = (): void => {
  // Run daily at 2 AM UTC
  cron.schedule('10 2 * * *', cronGuard({ jobName: 'consignorExpiryNoticeJob' }, async () => {
    console.log('[consignor-expiry-cron] Starting consignor expiry notice job...');
    await processConsignorExpiryNotices();
  }));
};

// Disposition-specific next-step copy for the ORGANIZER-facing alert (distinct from the
// consignor-facing email copy in consignorEmailService.ts, which speaks to the consignor).
// Consignor intake follow-up (2026-09-24): unsoldItemDisposition was previously stored at
// intake and never acted on anywhere -- this is the first place it drives an actual next
// step, for whoever runs the organizer account.
const ORGANIZER_DISPOSITION_STEPS: Record<'RETURN' | 'DONATE' | 'RELIST', { title: string; nextStep: string }> = {
  RETURN: {
    title: 'Consigned item ready to return',
    nextStep: 'set it aside for pickup and let them know it is ready. They were notified by email just now.',
  },
  DONATE: {
    title: 'Consigned item ready to donate',
    nextStep: "this one's cleared to donate on the consignor's own instructions -- no need to wait on them. They were notified by email just now in case they've changed their mind.",
  },
  RELIST: {
    title: 'Consigned item ready to relist',
    nextStep: 'mark it down and keep it listed rather than pulling it, per the consignor\'s own instructions. They were notified by email just now.',
  },
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
        // unsoldItemDisposition added (2026-09-24) so this job can finally act on the
        // consignor's own on-file preference instead of always asking them to decide.
        consignor: { select: { id: true, name: true, email: true, unsoldItemDisposition: true } },
        sale: {
          select: {
            title: true,
            organizer: { select: { userId: true, user: { select: { email: true, name: true } } } },
          },
        },
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
      const organizerUserId = item.sale?.organizer?.userId || null;
      const saleId = item.saleId || '';
      const disposition = item.consignor.unsoldItemDisposition as 'RETURN' | 'DONATE' | 'RELIST' | null;

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
            disposition,
          }).catch(err =>
            console.warn(
              `[consignor-expiry-cron] Failed to send expiry notice for item ${item.id}:`,
              err
            )
          );
        });

        // Organizer-facing alert (2026-09-24): the consignor email above tells the CONSIGNOR
        // what will happen; this tells whoever runs the organizer account what to actually DO
        // about it, in-app AND by email (sendEmail: true) since this is a physical-item action
        // with a real deadline, not just informational. No disposition on file -> the
        // organizer is the one who needs to make (or go get) a decision, so that's the alert
        // instead of a specific next step.
        if (organizerUserId) {
          const step = disposition ? ORGANIZER_DISPOSITION_STEPS[disposition] : null;
          const title = step ? step.title : 'Consignor item needs a decision';
          const body = step
            ? `"${item.title}" from ${item.consignor.name} has been listed 60 days without selling -- ${step.nextStep}`
            : `"${item.title}" from ${item.consignor.name} has been listed 60 days without selling, and there's no return/donate/relist preference on file for them. Reach out to ${item.consignor.name} directly to decide what happens next.`;

          setImmediate(() => {
            createNotification(
              organizerUserId,
              'CONSIGNOR_ITEM_EXPIRING',
              title,
              body,
              `/organizer/consignors/${item.consignor!.id}`,
              'OPERATIONAL',
              true,
              title
            ).catch(err =>
              console.warn(
                `[consignor-expiry-cron] Failed to create organizer alert for item ${item.id}:`,
                err
              )
            );
          });
        } else {
          console.warn(`[consignor-expiry-cron] Item ${item.id} has no organizer userId, skipping organizer alert`);
        }
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
