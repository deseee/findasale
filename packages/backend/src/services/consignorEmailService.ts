import { buildEmail } from './emailTemplateService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from './suppressionService';


const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
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
  

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
    return;
  }

  try {
    const html = buildEmail({
      preheader: `Your consigned item sold - ${params.itemName}`,
      headline: '🎉 Your item sold!',
      body: `<p>Hi ${params.consignorName},</p>
        <p>Great news: your <strong>${params.itemName}</strong> just sold for <strong>$${params.itemPrice.toFixed(2)}</strong>.</p>
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

    await transactionalEmailService.emails.send({
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
  

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
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

    await transactionalEmailService.emails.send({
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
 * ADR-096: Send a Stripe onboarding link directly to the consignor so they can
 * set up automatic payout -- the consignor never logs into FindA.Sale, so this
 * email (not an in-app screen) is how they get the link. Triggered from
 * initiateConsignorOnboarding() as an opt-in choice offered right after an
 * organizer adds a new consignor.
 */
export const sendConsignorPaymentSetupInvite = async (params: {
  consignorName: string;
  consignorEmail: string;
  onboardingUrl: string;
  organizerName: string;
}): Promise<void> => {

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
    return;
  }

  try {
    const html = buildEmail({
      preheader: `Set up automatic payout from ${params.organizerName}`,
      headline: 'Get paid automatically when your items sell',
      body: `<p>Hi ${params.consignorName},</p>
        <p><strong>${params.organizerName}</strong> wants to pay you automatically via bank transfer whenever one of your consigned items sells -- no more waiting on cash or checks.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 8px 0; color: #666;">
            Takes about 2 minutes. You'll need your bank or debit card details. No FindA.Sale account required.
          </p>
        </div>
        <p>If you'd rather be paid the usual way (cash, check, Venmo), just let ${params.organizerName} know -- nothing changes for you.</p>`,
      ctaText: 'Set Up Automatic Payout',
      ctaUrl: params.onboardingUrl,
      accentColor: '#10b981',
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: params.consignorEmail,
      subject: `Set up automatic payout from ${params.organizerName}`,
      html,
    });

    console.log(`[consignor-email] Sent payment setup invite to ${params.consignorEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send payment setup invite email:', err);
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
  // Consignor intake follow-up (2026-09-24): the consignor's own on-file preference for what
  // happens to an unsold item (Consignor.unsoldItemDisposition -- 'RETURN' | 'DONATE' |
  // 'RELIST' | null). When set, the email states what will happen rather than asking the
  // consignor to make a decision they already made at intake. null preserves the original
  // "reach out to discuss" copy for a consignor who never had a preference on file.
  disposition?: 'RETURN' | 'DONATE' | 'RELIST' | null;
}): Promise<void> => {
  

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
    return;
  }

  try {
    const dispositionCopy: Record<'RETURN' | 'DONATE' | 'RELIST', { headline: string; message: string }> = {
      RETURN: {
        headline: '📦 Your consigned item is ready to pick up',
        message: `Per your instructions when you dropped it off, we'll have <strong>${params.itemName}</strong> ready for you to pick up. Swing by within the next 7 days, or contact <strong>${params.organizerName}</strong> to arrange a different time.`,
      },
      DONATE: {
        headline: '💛 Your consigned item will be donated',
        message: `Per your instructions when you dropped it off, <strong>${params.itemName}</strong> will be donated on your behalf now that it's been listed 60 days. No action is needed from you -- if you've changed your mind, contact <strong>${params.organizerName}</strong> within the next 7 days.`,
      },
      RELIST: {
        headline: '🏷️ Your consigned item is being marked down',
        message: `Per your instructions when you dropped it off, <strong>${params.itemName}</strong> is being relisted at a reduced price now that it's been listed 60 days. No action is needed from you -- if you'd rather it be returned or donated instead, contact <strong>${params.organizerName}</strong>.`,
      },
    };

    const chosen = params.disposition ? dispositionCopy[params.disposition] : null;
    const headline = chosen ? chosen.headline : '⏰ Your consigned item expires in 7 days';
    const bannerText = chosen
      ? 'You do not need to do anything unless you want to change this.'
      : "If we don't hear from you in the next 7 days, the item will be delisted.";
    const bodyIntro = chosen
      ? `<p>Hi ${params.consignorName},</p><p>${chosen.message}</p>`
      : `<p>Hi ${params.consignorName},</p><p>Your consigned item <strong>${params.itemName}</strong> has been listed for 60 days. Reach out to <strong>${params.organizerName}</strong> to discuss what happens next.</p>`;

    const html = buildEmail({
      preheader: `Item expiring soon: ${params.itemName}`,
      headline,
      body: `${bodyIntro}
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 8px 0; color: #92400e;">
            ${bannerText}
          </p>
        </div>
        <p>Contact <a href="mailto:${params.organizerEmail}">${params.organizerName}</a> with any questions.</p>`,
      ctaText: 'View Your Items',
      ctaUrl: `${siteUrl}/consignor/items`,
      accentColor: '#f59e0b',
    });

    await transactionalEmailService.emails.send({
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
