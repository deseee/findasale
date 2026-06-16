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
          select: {
            organizerId: true,
            organizer: {
              select: {
                userId: true,
                fbCatalogEnabled: true,
              },
            },
          },
        },
      },
    });

    if (!item || !item.fbExportedAt) {
      // Item was never exported to Facebook — nothing to do
      return;
    }

    const organizer = item.sale?.organizer;
    const organizerUserId = organizer?.userId;
    if (!organizerUserId) {
      console.warn(`[FB Nudge] Could not resolve organizer userId for item ${itemId}`);
      return;
    }

    // Route nudge URL: Commerce Manager users go to Catalog Manager, not Marketplace
    const fbUrl = (organizer as any)?.fbCatalogEnabled
      ? 'https://business.facebook.com/commerce'
      : 'https://www.facebook.com/marketplace/selling/';
    const fbPlatformName = (organizer as any)?.fbCatalogEnabled
      ? 'Facebook Commerce Manager'
      : 'Facebook Marketplace';

    await createNotification(
      organizerUserId,
      'SALE_UPDATE',
      `Mark sold on ${fbPlatformName}`,
      `"${item.title}" sold on FindA.Sale — don't forget to mark it sold on ${fbPlatformName} too.`,
      fbUrl,
      'OPERATIONAL'
    );
  } catch (err) {
    console.warn(
      `[FB Nudge] Failed to notify for item ${itemId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
