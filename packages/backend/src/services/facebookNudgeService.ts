import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';

/**
 * If the item was previously exported to Facebook Marketplace,
 * nudge the organizer to also mark it sold there.
 * Fire-and-forget — never throws.
 */
export async function notifyFacebookExportedItemSold(itemId: string): Promise<void> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        fbExportedAt: true,
        title: true,
        saleId: true,
        sale: {
          select: { organizerId: true, organizer: { select: { userId: true } } },
        },
      },
    });

    if (!item || !item.fbExportedAt) {
      // Item was never exported to Facebook — nothing to do
      return;
    }

    const organizerUserId = item.sale?.organizer?.userId;
    if (!organizerUserId) {
      console.warn(`[FB Nudge] Could not resolve organizer userId for item ${itemId}`);
      return;
    }

    await createNotification(
      organizerUserId,
      'SALE_UPDATE',
      'Mark sold on Facebook Marketplace',
      `"${item.title}" sold on FindA.Sale — don't forget to mark it sold on Facebook Marketplace too.`,
      'https://www.facebook.com/marketplace/selling/',
      'OPERATIONAL'
    );
  } catch (err) {
    console.warn(
      `[FB Nudge] Failed to notify for item ${itemId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
