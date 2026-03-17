/**
 * Sale Alert Email Service — Feature #14: Real-Time Status Update Notifications
 *
 * Sends organizer email alerts for:
 * - Hold placed on an item
 * - Item sold
 *
 * Simple, non-blocking fire-and-forget emails via Resend.
 */

import { Resend } from 'resend';
import { buildEmail } from './emailTemplateService';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'alerts@finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

interface HoldPlacedAlertData {
  organizerEmail: string;
  organizerName: string;
  itemTitle: string;
  saleTitle: string;
  saleId: string;
}

interface ItemSoldAlertData {
  organizerEmail: string;
  organizerName: string;
  itemTitle: string;
  saleTitle: string;
  price: number; // in dollars
  saleId: string;
}

/**
 * Send "new hold placed" alert to organizer
 * Fire-and-forget: errors are logged but don't block
 */
export const sendHoldPlacedAlert = async (data: HoldPlacedAlertData): Promise<void> => {
  try {
    const saleLink = `${FRONTEND_URL}/organizer/holds`;
    const html = buildEmail({
      preheader: `New hold on ${data.itemTitle}`,
      headline: `New hold placed on ${data.itemTitle}`,
      body: `<p>Hi ${data.organizerName},</p><p>A shopper just placed a hold on <strong>${data.itemTitle}</strong> from your sale <em>${data.saleTitle}</em>.</p><p>The hold will expire in 48 hours. Review and confirm the hold in your dashboard.</p>`,
      ctaText: 'View Holds',
      ctaUrl: saleLink,
      accentColor: '#8FB897', // sage-green
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.organizerEmail,
      subject: `New hold on ${data.itemTitle}`,
      html,
    });

    console.log(`[saleAlert] Hold placed alert sent to ${data.organizerEmail}`);
  } catch (err) {
    console.error('[saleAlert] Failed to send hold placed alert:', err);
    // Don't throw — this is a best-effort notification
  }
};

/**
 * Send "item sold" alert to organizer
 * Fire-and-forget: errors are logged but don't block
 */
export const sendItemSoldAlert = async (data: ItemSoldAlertData): Promise<void> => {
  try {
    const saleLink = `${FRONTEND_URL}/organizer/insights`;
    const html = buildEmail({
      preheader: `${data.itemTitle} sold for $${data.price.toFixed(2)}`,
      headline: `${data.itemTitle} sold! 🎉`,
      body: `<p>Hi ${data.organizerName},</p><p><strong>${data.itemTitle}</strong> from <em>${data.saleTitle}</em> has been sold for <strong>$${data.price.toFixed(2)}</strong>.</p><p>Great sale! Check your insights dashboard for more details.</p>`,
      ctaText: 'View Insights',
      ctaUrl: saleLink,
      accentColor: '#10b981', // success green
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.organizerEmail,
      subject: `${data.itemTitle} sold for $${data.price.toFixed(2)}`,
      html,
    });

    console.log(`[saleAlert] Item sold alert sent to ${data.organizerEmail}`);
  } catch (err) {
    console.error('[saleAlert] Failed to send item sold alert:', err);
    // Don't throw — this is a best-effort notification
  }
};
