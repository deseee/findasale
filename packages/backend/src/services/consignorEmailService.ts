import { Resend } from 'resend';
import { buildEmail } from './emailTemplateService';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      _resend = null;
    }
  }
  return _resend;
};

const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
const siteUrl = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * Send email to consignor when their item sells
 */
export const sendConsignorItemSold = async (params: {
  consignorName: string;
  consignorEmail: string;
  itemName: string;
  itemPrice: number;
  consignorPayout: number;
  organizerName: string;
  saleId: string;
}): Promise<void> => {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[consignor-email] Resend not configured, skipping item sold notification');
    return;
  }

  try {
    const html = buildEmail({
      preheader: `Your consigned item sold - ${params.itemName}`,
      headline: '🎉 Your item sold!',
      body: `<p>Hi ${params.consignorName},</p>
        <p>Great news — your <strong>${params.itemName}</strong> just sold for <strong>$${params.itemPrice.toFixed(2)}</strong>.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 8px 0; color: #666;">
            <strong>Your payout (after commission):</strong> $${params.consignorPayout.toFixed(2)}
          </p>
          <p style="margin: 8px 0; color: #666;">
            Organized by: <strong>${params.organizerName}</strong>
          </p>
        </div>
        <p>They'll be in touch about your payout. Thanks for consigning with FindA.Sale!</p>`,
      ctaText: 'View Sale',
      ctaUrl: `${siteUrl}/organizer/sales/${params.saleId}`,
      accentColor: '#10b981',
    });

    await resend.emails.send({
      from: fromEmail,
      to: params.consignorEmail,
      subject: `✓ Your item sold: ${params.itemName}`,
      html,
    });

    console.log(`[consignor-email] Sent item sold notification to ${params.consignorEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send item sold email:', err);
  }
};

/**
 * Send email to consignor when payout is processed
 */
export const sendConsignorPayout = async (params: {
  consignorName: string;
  consignorEmail: string;
  payoutAmount: number;
  saleName: string;
  organizerName: string;
  method?: string;
}): Promise<void> => {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[consignor-email] Resend not configured, skipping payout notification');
    return;
  }

  try {
    const methodDisplay = params.method ? ` via ${params.method}` : '';
    const html = buildEmail({
      preheader: `Payout processed: $${params.payoutAmount.toFixed(2)}`,
      headline: '💰 Your payout has been processed',
      body: `<p>Hi ${params.consignorName},</p>
        <p>Your payout from <strong>${params.saleName}</strong> has been processed.</p>
        <div style="background: #dbeafe; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <p style="margin: 8px 0; color: #1e40af; font-size: 18px;">
            <strong>$${params.payoutAmount.toFixed(2)}${methodDisplay}</strong>
          </p>
        </div>
        <p>Thanks for working with ${params.organizerName}! We appreciate your consignments.</p>`,
      ctaText: 'Back to FindA.Sale',
      ctaUrl: siteUrl,
      accentColor: '#3b82f6',
    });

    await resend.emails.send({
      from: fromEmail,
      to: params.consignorEmail,
      subject: `Payout received: $${params.payoutAmount.toFixed(2)}`,
      html,
    });

    console.log(`[consignor-email] Sent payout notification to ${params.consignorEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send payout email:', err);
  }
};

/**
 * Send email to consignor when item is about to expire (60 days)
 */
export const sendConsignorExpiryNotice = async (params: {
  consignorName: string;
  consignorEmail: string;
  itemName: string;
  organizerName: string;
  organizerEmail: string;
  saleId: string;
}): Promise<void> => {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[consignor-email] Resend not configured, skipping expiry notification');
    return;
  }

  try {
    const html = buildEmail({
      preheader: `Item expiring soon: ${params.itemName}`,
      headline: '⏰ Your consigned item expires in 7 days',
      body: `<p>Hi ${params.consignorName},</p>
        <p>Your consigned item <strong>${params.itemName}</strong> has been listed for 60 days. Reach out to <strong>${params.organizerName}</strong> to discuss what happens next.</p>
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 8px 0; color: #92400e;">
            If we don't hear from you in the next 7 days, the item will be delisted.
          </p>
        </div>
        <p>Contact <a href="mailto:${params.organizerEmail}">${params.organizerName}</a> to extend or arrange pickup.</p>`,
      ctaText: 'View Your Items',
      ctaUrl: `${siteUrl}/consignor/items`,
      accentColor: '#f59e0b',
    });

    await resend.emails.send({
      from: fromEmail,
      to: params.consignorEmail,
      subject: `⏰ Item expiring: ${params.itemName}`,
      html,
    });

    console.log(`[consignor-email] Sent expiry notice to ${params.consignorEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send expiry notice email:', err);
  }
};
