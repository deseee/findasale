// Price Drop Alert Service
// When an item price is reduced, notify all users who favorited the item

import { prisma } from '../lib/prisma';
import { buildEmail } from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';
import { createNotification } from '../lib/notificationService';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

/**
 * Read the user's priceAlerts preference (defaults to enabled when unset).
 * Shared by both the email leg and the in-app leg below so a user who has
 * turned price alerts off does not still get pinged through the other channel.
 */
async function priceAlertsEnabledFor(userId: string): Promise<boolean> {
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });

  return userPrefs?.notificationPrefs && typeof userPrefs.notificationPrefs === 'object'
    ? (userPrefs.notificationPrefs as any).priceAlerts !== false
    : true; // default to true if not set
}

/**
 * Send a price drop alert email to a single favoriter.
 * Respects user's notification preferences.
 * Fire-and-forget — all errors are logged but don't block.
 */
async function sendPriceDropEmail(
  user: { id: string; email: string; name: string },
  item: { id: string; title: string },
  oldPrice: number,
  newPrice: number
): Promise<void> {
  try {
    if (await suppressionService.isSuppressed(user.email)) {
      console.log('[PriceDrop] Skipped suppressed recipient:', user.email);
      return;
    }

    if (!(await priceAlertsEnabledFor(user.id))) {
      console.log(`[PriceDrop] Price alerts disabled for user ${user.id}, skipping email`);
      return;
    }

    // Item.price is stored as a plain dollar amount (Float), not cents — do not divide by 100.
    const oldPriceStr = oldPrice.toFixed(2);
    const newPriceStr = newPrice.toFixed(2);
    const savings = oldPrice - newPrice;
    const savingsPercent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

    // Real per-user unsubscribe token (bug fix, 2026-09-06): this email previously had no
    // unsubscribe link/header at all (defaulted to emailTemplateService's tokenless
    // `${FRONTEND_URL}/unsubscribe}`). Type 'priceAlerts' maps to notificationPrefs.priceAlerts
    // -- the SAME field priceAlertsEnabledFor() above reads -- not the pre-existing 'priceDrops'
    // type, which flips a different, unread field (emailPriceDropAlerts).
    const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
    const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(user.id, 'priceAlerts');

    const emailHtml = buildEmail({
      preheader: `${item.title} dropped from $${oldPriceStr} to $${newPriceStr}`,
      headline: 'Price just dropped!',
      body: `
        <p>Good news! An item you favorited just went on sale:</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px; font-size: 15px; color: #374151;">
            <strong>${item.title}</strong>
          </p>
          <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
            <span style="text-decoration: line-through;">$${oldPriceStr}</span>
            <span style="margin: 0 8px; color: #10b981; font-weight: 700;">→ $${newPriceStr}</span>
          </p>
          <p style="margin: 0; font-size: 13px; color: #10b981; font-weight: 600;">
            Save $${savings.toFixed(2)} (${savingsPercent}% off)
          </p>
        </div>
        <p>This deal won't last long, check it out before it sells!</p>
      `,
      ctaText: 'View Item',
      ctaUrl: `${FRONTEND_URL}/items/${item.id}`,
      accentColor: '#10b981', // green for good news
      unsubLabel: 'Stop price drop alerts',
      unsubUrl,
    });

    await emailService.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `💰 Price drop on "${item.title}": now $${newPriceStr}`,
      html: emailHtml,
      listUnsubscribe: listUnsubscribeHeader,
    });

    console.log(`[PriceDrop] Email sent to ${user.email} for item "${item.title}"`);
  } catch (error: any) {
    console.error(`[PriceDrop] Failed to send email to ${user.email}:`, error.message);
    // Non-blocking — don't throw
  }
}

/**
 * Write the in-app inbox notification for a single favoriter. Same preference
 * gate as the email leg, so opting out of price alerts silences both channels.
 * Fire-and-forget — all errors are logged but don't block.
 */
async function sendPriceDropInApp(
  user: { id: string },
  item: { id: string; title: string },
  oldPrice: number,
  newPrice: number
): Promise<void> {
  try {
    if (!(await priceAlertsEnabledFor(user.id))) {
      return;
    }

    await createNotification({
      userId: user.id,
      type: 'price_drop',
      title: 'Price drop on an item you favorited',
      body: `"${item.title}" dropped from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`,
      link: `/items/${item.id}`,
      channel: 'OPERATIONAL',
    });
  } catch (error: any) {
    console.error(`[PriceDrop] Failed to create in-app notification for user ${user.id}:`, error.message);
    // Non-blocking — don't throw
  }
}

/**
 * Notify all favorers of an item that its price dropped.
 * Called after a price decrease — from a manual organizer edit or from the
 * markdown crons (auto-markdown by sale age, and organizer-configured markdown
 * cycles). Sends both an email and an in-app inbox notification per favoriter.
 */
export async function notifyPriceDropAlerts(
  itemId: string,
  oldPrice: number | null,
  newPrice: number | null
): Promise<void> {
  // Only process if both prices are valid and new < old
  if (!oldPrice || !newPrice || newPrice >= oldPrice) {
    return;
  }

  try {
    // Fetch the item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, title: true },
    });

    if (!item) {
      console.log(`[PriceDrop] Item ${itemId} not found, skipping alerts`);
      return;
    }

    // Find all users who favorited this item
    const favorites = await prisma.favorite.findMany({
      where: { itemId },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (favorites.length === 0) {
      console.log(`[PriceDrop] No favorites for item ${itemId}, no alerts sent`);
      return;
    }

    console.log(`[PriceDrop] Sending alerts to ${favorites.length} users for item "${item.title}"`);

    // Send emails + in-app notifications to all favorers (fire-and-forget for each)
    for (const favorite of favorites) {
      setImmediate(async () => {
        await sendPriceDropEmail(favorite.user, item, oldPrice, newPrice);
      });
      setImmediate(async () => {
        await sendPriceDropInApp(favorite.user, item, oldPrice, newPrice);
      });
    }
  } catch (error: any) {
    console.error('[PriceDrop] Error in notifyPriceDropAlerts:', error.message);
    // Non-blocking — don't throw
  }
}
