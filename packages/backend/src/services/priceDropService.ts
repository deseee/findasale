// Price Drop Alert Service
// When an item price is reduced, notify all users who favorited the item

import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { buildEmail } from './emailTemplateService';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

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
    // Check user's notification preferences
    const userPrefs = await prisma.user.findUnique({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });

    const priceAlertsEnabled =
      userPrefs?.notificationPrefs && typeof userPrefs.notificationPrefs === 'object'
        ? (userPrefs.notificationPrefs as any).priceAlerts !== false
        : true; // default to true if not set

    if (!priceAlertsEnabled) {
      console.log(`[PriceDrop] Price alerts disabled for user ${user.id}, skipping email`);
      return;
    }

    const oldPriceStr = (oldPrice / 100).toFixed(2);
    const newPriceStr = (newPrice / 100).toFixed(2);
    const savings = (oldPrice - newPrice) / 100;
    const savingsPercent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

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
        <p>This deal won't last long — check it out before it sells!</p>
      `,
      ctaText: 'View Item',
      ctaUrl: `${FRONTEND_URL}/items/${item.id}`,
      accentColor: '#10b981', // green for good news
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `💰 Price drop on "${item.title}" — now $${newPriceStr}`,
      html: emailHtml,
    });

    console.log(`[PriceDrop] Email sent to ${user.email} for item "${item.title}"`);
  } catch (error: any) {
    console.error(`[PriceDrop] Failed to send email to ${user.email}:`, error.message);
    // Non-blocking — don't throw
  }
}

/**
 * Notify all favorers of an item that its price dropped.
 * Called after updateItem when price decreases.
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

    // Send emails to all favorers (fire-and-forget for each)
    for (const favorite of favorites) {
      setImmediate(async () => {
        await sendPriceDropEmail(favorite.user, item, oldPrice, newPrice);
      });
    }
  } catch (error: any) {
    console.error('[PriceDrop] Error in notifyPriceDropAlerts:', error.message);
    // Non-blocking — don't throw
  }
}
