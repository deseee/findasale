import { buildEmail } from './emailTemplateService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';
import type { Statement } from './consignorLedgerService';


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
      // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
      hideUnsubscribe: true,
      footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
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
      // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
      hideUnsubscribe: true,
      footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
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
  // Consignor intake disclosure (Patrick, 2026-09-25): plain-language markdown-schedule
  // summary from getConsignorMarkdownPolicyNotice() (commissionCalcService.ts), e.g. "After
  // 14 days unsold, items are automatically marked down 25%." or "No automatic markdown
  // schedule is currently set up for this organizer." Optional so existing callers/tests
  // that don't pass it still compile and send unchanged.
  markdownNotice?: string;
}): Promise<void> => {

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
    return;
  }

  try {
    const markdownNoticeBlock = params.markdownNotice
      ? `<p style="color: #666; font-size: 13px;">Please note: ${params.organizerName} may apply automatic price markdowns to unsold items over time. A markdown lowers an item's sale price, and your payout is calculated from that lower price. ${params.markdownNotice}</p>`
      : '';
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
        <p>If you'd rather be paid the usual way (cash, check, Venmo), just let ${params.organizerName} know -- nothing changes for you.</p>
        ${markdownNoticeBlock}`,
      ctaText: 'Set Up Automatic Payout',
      ctaUrl: params.onboardingUrl,
      accentColor: '#10b981',
      // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
      hideUnsubscribe: true,
      footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
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
      // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
      hideUnsubscribe: true,
      footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
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

/**
 * Consignor pickup-window reminder (2026-09-25, Patrick policy): sent by
 * consignorExpiryNoticeJob.ts during the 15-day pickup-arrangement window that opens once a
 * RETURN-disposition consignor's item has sat AVAILABLE past their own returnPeriodDays.
 * Sent twice per item -- reminderNumber 1 when the window opens, reminderNumber 2 partway
 * through -- so the consignor gets "a couple emails" during the window rather than just one,
 * per Patrick's own phrasing. When the workspace's consignor-intake link is enabled,
 * pickupAppointmentLinkUrl points the consignor straight at it to self-serve a pickup time;
 * otherwise the email just asks them to contact the organizer directly.
 */
export const sendConsignorPickupWindowReminder = async (params: {
  consignorName: string;
  consignorEmail: string;
  itemName: string;
  organizerName: string;
  organizerEmail: string;
  saleId: string;
  reminderNumber: 1 | 2;
  pickupAppointmentLinkUrl?: string;
}): Promise<void> => {

  if (await suppressionService.isHardSuppressed(params.consignorEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.consignorEmail}`);
    return;
  }

  try {
    const isFirst = params.reminderNumber === 1;
    const headline = isFirst
      ? '\ud83d\udce6 Time to arrange pickup for your consigned item'
      : '\u23f0 Reminder: your consigned item is still waiting for pickup';
    const introLine = isFirst
      ? `Your consigned item <strong>${params.itemName}</strong> didn't sell, and per your on-file return preference it's ready for you to pick up or arrange a donation.`
      : `Just a reminder -- <strong>${params.itemName}</strong> is still waiting for you to arrange pickup or donation.`;
    const windowLine = isFirst
      ? 'You have 15 days to contact us and arrange a pickup or donation time.'
      : 'The 15-day pickup-arrangement window is about halfway through -- please reach out soon so we can settle this item.';

    const bookingBlock = params.pickupAppointmentLinkUrl
      ? `<p style="margin: 8px 0 0;">Prefer to pick your own time? <a href="${params.pickupAppointmentLinkUrl}">Book a pickup time online</a>.</p>`
      : '';

    const html = buildEmail({
      preheader: `Arrange pickup: ${params.itemName}`,
      headline,
      body: `<p>Hi ${params.consignorName},</p><p>${introLine}</p>
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;">${windowLine}</p>
          ${bookingBlock}
        </div>
        <p>Contact <a href="mailto:${params.organizerEmail}">${params.organizerName}</a> to arrange pickup or donation.</p>`,
      ctaText: params.pickupAppointmentLinkUrl ? 'Book Pickup Time' : 'View Your Items',
      ctaUrl: params.pickupAppointmentLinkUrl || `${siteUrl}/consignor/items`,
      accentColor: '#f59e0b',
      // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
      hideUnsubscribe: true,
      footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: params.consignorEmail,
      subject: isFirst
        ? `\ud83d\udce6 Arrange pickup: ${params.itemName}`
        : `\u23f0 Reminder: arrange pickup for ${params.itemName}`,
      html,
    });

    console.log(`[consignor-email] Sent pickup-window reminder #${params.reminderNumber} to ${params.consignorEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send pickup-window reminder email:', err);
  }
};

/**
 * Consignor Self-Serve Intake (2026-09-25): notify the organizer's ACCOUNT email (their
 * own User.email, not a per-consignor address) when a prospective consignor submits the
 * public intake form. V1 goes to the workspace owner only, not every team member -- see
 * consignorIntakeController.ts's submitIntakeRequest for the fire-and-forget call site.
 */
export const sendConsignorIntakeRequestNotice = async (params: {
  organizerEmail: string;
  organizerName: string;
  requesterName: string;
  requesterContact?: string | null;
  requestedStartsAt?: Date | null;
}): Promise<void> => {

  if (await suppressionService.isHardSuppressed(params.organizerEmail)) {
    console.log(`[consignor-email] Skipping suppressed address: ${params.organizerEmail}`);
    return;
  }

  try {
    const contactLine = params.requesterContact
      ? `<p style="margin: 8px 0; color: #666;">Contact: ${escapeHtml(params.requesterContact)}</p>`
      : '';
    const timeLine = params.requestedStartsAt
      ? `<p style="margin: 8px 0; color: #666;">Requested time: ${params.requestedStartsAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>`
      : '';
    const html = buildEmail({
      // 2026-10-06 security pass: requesterName/requesterContact come from the ANONYMOUS public
      // intake form, so every interpolation is HTML-escaped and the subject is forced to one line.
      preheader: escapeHtml(`New consignor request from ${params.requesterName}`),
      headline: 'New consignor request',
      body: `<p>Hi ${escapeHtml(params.organizerName)},</p>
        <p><strong>${escapeHtml(params.requesterName)}</strong> just submitted a request to bring items in through your consignor intake link.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          ${contactLine}
          ${timeLine}
        </div>
        <p>Review it in your Consignors dashboard to approve or decline.</p>`,
      ctaText: 'Review Request',
      ctaUrl: `${siteUrl}/organizer/consignors`,
      accentColor: '#3b82f6',
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: params.organizerEmail,
      subject: `New consignor request from ${oneLine(params.requesterName)}`,
      html,
    });

    console.log(`[consignor-email] Sent new intake request notice to ${params.organizerEmail}`);
  } catch (err) {
    console.error('[consignor-email] Failed to send intake request notice email:', err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// Organizer-settles ledger emails (2026-09-29)
//
// FindA.Sale never initiates, holds or routes consignor money, so these emails only REPORT what
// the organizer recorded: a statement, or "a payment was recorded". They go through the
// transactional (Resend) rail, never the Gmail/outreach rail, never to the finda.sale zone,
// and they return a result instead of swallowing failures so callers only stamp
// statementSentAt when an email actually went out.
// ─────────────────────────────────────────────────────────────────────────────────────────

export type ConsignorEmailFailureReason = 'NO_EMAIL' | 'SUPPRESSED' | 'BLOCKED_DOMAIN' | 'ERROR';

export interface ConsignorEmailResult {
  sent: boolean;
  reason?: ConsignorEmailFailureReason;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Header-safe single line (subjects must never carry line breaks). */
function oneLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/**
 * Shared send path: NO_EMAIL, then BLOCKED_DOMAIN (finda.sale zone, competitors, placeholders),
 * then SUPPRESSED (hard bounce / complaint), then the Resend send itself. Any failure to send
 * is reported as ERROR; nothing here throws.
 */
async function sendLedgerEmail(
  to: string | null | undefined,
  subject: string,
  html: string,
  text: string
): Promise<ConsignorEmailResult> {
  const address = (to ?? '').trim();
  if (!address) return { sent: false, reason: 'NO_EMAIL' };
  if (isEmailDomainBlocked(address)) {
    console.warn('[consignor-email] Blocked domain, not sending ledger email');
    return { sent: false, reason: 'BLOCKED_DOMAIN' };
  }
  try {
    if (await suppressionService.isHardSuppressed(address)) {
      return { sent: false, reason: 'SUPPRESSED' };
    }
    const result = await transactionalEmailService.emails.send({ to: address, subject, html, text });
    if (result && result.sent) return { sent: true };
    if (result && result.reason === 'suppressed') return { sent: false, reason: 'SUPPRESSED' };
    console.error('[consignor-email] Ledger email not sent:', result?.reason);
    return { sent: false, reason: 'ERROR' };
  } catch (err) {
    console.error('[consignor-email] Ledger email failed:', err);
    return { sent: false, reason: 'ERROR' };
  }
}

const MAX_EMAIL_STATEMENT_LINES = 100;

/**
 * Email a consignor their statement. `statement` comes from consignorLedgerService.buildStatement.
 * The footer is the attorney-review sales tax sentence carried on the statement itself.
 */
export const sendConsignorStatement = async (params: {
  statement: Statement;
  toEmail: string | null | undefined;
}): Promise<ConsignorEmailResult> => {
  const st = params.statement;
  const shown = st.lines.slice(0, MAX_EMAIL_STATEMENT_LINES);
  const hidden = st.lines.length - shown.length;

  const rows = shown
    .map((l) => {
      const price = l.markedDown && l.priceBeforeMarkdown
        ? `${fmtMoney(l.listPrice)} (was ${fmtMoney(l.priceBeforeMarkdown)})`
        : fmtMoney(l.listPrice);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(l.title)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(fmtDate(l.soldAt))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(Number(l.ratePct ?? 0).toFixed(2))}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;text-align:right;">${escapeHtml(fmtMoney(l.consignorShare))}</td>
      </tr>`;
    })
    .join('');
  const hiddenNote = hidden > 0
    ? `<p style="color:#666;font-size:13px;">${hidden} more item${hidden === 1 ? '' : 's'} not shown here. Ask ${escapeHtml(st.organizerName)} for the full statement.</p>`
    : '';
  const table = shown.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
        <thead><tr style="text-align:left;background:#f3f4f6;">
          <th style="padding:6px 8px;">Item</th><th style="padding:6px 8px;">Sold</th><th style="padding:6px 8px;">Price</th><th style="padding:6px 8px;">Rate</th><th style="padding:6px 8px;text-align:right;">Your share</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>${hiddenNote}`
    : '';

  const html = buildEmail({
    preheader: escapeHtml(`Consignment statement ${st.reference}: ${fmtMoney(st.totals.consignorShare)}`),
    headline: 'Your consignment statement',
    body: `<p>Hi ${escapeHtml(st.consignor.name)},</p>
      <p><strong>${escapeHtml(st.organizerName)}</strong> sent you this statement for <strong>${escapeHtml(st.periodLabel)}</strong>.</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:20px 0;">
        <p style="margin:4px 0;color:#444;">Reference: <strong>${escapeHtml(st.reference)}</strong></p>
        <p style="margin:4px 0;color:#444;">Status: <strong>${escapeHtml(st.statusLabel)}</strong></p>
        <p style="margin:4px 0;color:#444;">Items: <strong>${st.totals.itemCount}</strong> &nbsp; Total sales: <strong>${escapeHtml(fmtMoney(st.totals.gross))}</strong></p>
        <p style="margin:8px 0 0;color:#111;font-size:18px;">Your share: <strong>${escapeHtml(fmtMoney(st.totals.consignorShare))}</strong></p>
      </div>
      ${table}
      <p style="color:#666;font-size:12px;">${escapeHtml(st.footer)}</p>`,
    accentColor: '#3b82f6',
    // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
    hideUnsubscribe: true,
    footerReason: `You received this because ${st.organizerName} added you as a consignor on FindA.Sale.`,
  });

  const textLines = [
    `Consignment statement from ${st.organizerName}`,
    `Period: ${st.periodLabel}`,
    `Reference: ${st.reference}`,
    `Status: ${st.statusLabel}`,
    ...shown.map((l) => `- ${l.title}: ${fmtMoney(l.listPrice)} at ${Number(l.ratePct ?? 0).toFixed(2)}% = ${fmtMoney(l.consignorShare)}`),
    hidden > 0 ? `${hidden} more items not shown.` : '',
    `Your share: ${fmtMoney(st.totals.consignorShare)}`,
    st.footer,
  ].filter(Boolean);

  return sendLedgerEmail(
    params.toEmail,
    `Consignment statement from ${oneLine(st.organizerName)} (${st.reference})`,
    html,
    textLines.join('\n')
  );
};

/**
 * Tell a consignor the organizer RECORDED a payment. This is a record, not a receipt from
 * FindA.Sale: the organizer paid outside FindA.Sale and FindA.Sale never holds or sends the funds.
 * Only sent when the organizer opts in (notifyConsignor: true).
 */
export const sendConsignorPaymentRecorded = async (params: {
  consignorName: string;
  consignorEmail: string | null | undefined;
  organizerName: string;
  periodLabel: string;
  amount: string | number;
  method?: string | null;
  methodLabel?: string | null;
  paidAt?: Date | string | null;
  reference: string; // statement reference (last 8 chars of the payout id)
  paymentReference?: string | null; // organizer-entered check number / confirmation code
}): Promise<ConsignorEmailResult> => {
  const amount = fmtMoney(params.amount);
  const methodText = params.methodLabel || params.method || '';
  const dateText = fmtDate(params.paidAt);
  const details = [
    dateText ? `Date: <strong>${escapeHtml(dateText)}</strong>` : '',
    methodText ? `Method: <strong>${escapeHtml(methodText)}</strong>` : '',
    params.paymentReference ? `Payment reference: <strong>${escapeHtml(params.paymentReference)}</strong>` : '',
    `Statement reference: <strong>${escapeHtml(params.reference)}</strong>`,
  ]
    .filter(Boolean)
    .map((line) => `<p style="margin:4px 0;color:#444;">${line}</p>`)
    .join('');

  const html = buildEmail({
    preheader: escapeHtml(`${params.organizerName} recorded a payment of ${amount}`),
    headline: 'A payment was recorded',
    body: `<p>Hi ${escapeHtml(params.consignorName)},</p>
      <p><strong>${escapeHtml(params.organizerName)}</strong> recorded a payment of <strong>${escapeHtml(amount)}</strong> to you for <strong>${escapeHtml(params.periodLabel)}</strong>.</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:20px 0;">${details}</div>
      <p style="color:#666;font-size:13px;">The payment was made by ${escapeHtml(params.organizerName)} directly. FindA.Sale keeps the records but does not hold or send consignor payments. If something looks wrong, contact ${escapeHtml(params.organizerName)}.</p>`,
    accentColor: '#3b82f6',
    // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
    hideUnsubscribe: true,
    footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
  });

  const text = [
    `${params.organizerName} recorded a payment of ${amount} to you for ${params.periodLabel}.`,
    dateText ? `Date: ${dateText}` : '',
    methodText ? `Method: ${methodText}` : '',
    params.paymentReference ? `Payment reference: ${params.paymentReference}` : '',
    `Statement reference: ${params.reference}`,
    `The payment was made by ${params.organizerName} directly. FindA.Sale does not hold or send consignor payments.`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendLedgerEmail(
    params.consignorEmail,
    `${oneLine(params.organizerName)} recorded a payment of ${amount}`,
    html,
    text
  );
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// Consignor welcome invite + Square connect notices (2026-10-06)
//
// Same transactional (Resend) rail and result contract as the ledger emails above (sendLedgerEmail):
// NO_EMAIL, BLOCKED_DOMAIN (never our own finda.sale zone), SUPPRESSED, ERROR. Every interpolated
// value is HTML-escaped and subjects are single-line. Callers stamp Consignor.inviteEmailSentAt only
// on { sent: true }.
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Public portal URL for a consignor's capability token. */
export function consignorPortalUrl(portalToken: string): string {
  return `${siteUrl}/consignor/portal/${encodeURIComponent(portalToken)}`;
}

/** Anchor on the portal page that opens the Square payout card. */
export const CONSIGNOR_PORTAL_SQUARE_ANCHOR = 'square-payouts';

/** Square's own seller sign up page (from Square's help article "Sign Up for Square Point of Sale"). */
export const SQUARE_SIGNUP_URL = 'https://squareup.com/signup';

/**
 * Welcome invite sent when an organizer adds a consignor (manual add or intake approval) and on
 * "Resend invite". Points the consignor at their portal and at Square payout setup there. No
 * FindA.Sale account is needed. `linkedExistingAccount` only changes one sentence; it never
 * reveals any account details.
 */
export const sendConsignorWelcomeInvite = async (params: {
  consignorName: string;
  consignorEmail: string | null | undefined;
  organizerName: string;
  portalToken: string;
  linkedExistingAccount?: boolean;
  markdownNotice?: string | null;
}): Promise<ConsignorEmailResult> => {
  const organizer = escapeHtml(params.organizerName);
  const portalUrl = consignorPortalUrl(params.portalToken);
  const squareUrl = `${portalUrl}#${CONSIGNOR_PORTAL_SQUARE_ANCHOR}`;

  const existingAccountBlock = params.linkedExistingAccount
    ? `<p style="color:#444;">We found an existing FindA.Sale account with this email address, so your consignments are connected to it. You can still use the portal link in this email without signing in.</p>`
    : '';
  const markdownBlock = params.markdownNotice
    ? `<p style="color:#666;font-size:13px;">Please note: ${organizer} may apply automatic price markdowns to unsold items over time. A markdown lowers an item's sale price, and your payout is calculated from that lower price. ${escapeHtml(params.markdownNotice)}</p>`
    : '';

  const html = buildEmail({
    // buildEmail renders preheader raw, so it is escaped here (2026-10-06 security pass).
    preheader: escapeHtml(`${params.organizerName} added you as a consignor on FindA.Sale`),
    headline: 'Your consignment portal is ready',
    body: `<p>Hi ${escapeHtml(params.consignorName)},</p>
      <p><strong>${organizer}</strong> added you as a consignor on FindA.Sale. Your personal portal shows your items, what has sold, and the payments recorded to you. No FindA.Sale account is needed to use it.</p>
      ${existingAccountBlock}
      <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#111;"><strong>Want to be paid through Square?</strong></p>
        <p style="margin:0 0 8px;color:#444;">Already have a Square account? Sign in with it. New to Square? You can create a free Square account first (your portal links to Square's sign up page), then come back and connect it.</p>
        <p style="margin:12px 0 0;"><a href="${escapeHtml(squareUrl)}" style="display:inline-block;padding:10px 16px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Set up Square payouts</a></p>
      </div>
      <p style="color:#444;">Prefer cash, check or another method? Just tell ${organizer}. Nothing changes for you.</p>
      ${markdownBlock}
      <p style="color:#666;font-size:12px;">Keep this email. Your portal link is private to you, so please do not share it.</p>`,
    ctaText: 'Open my portal',
    ctaUrl: portalUrl,
    accentColor: '#10b981',
    // Consignors have no FindA.Sale account, so the generic unsubscribe / preferences links would be dead ends.
    hideUnsubscribe: true,
    footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
  });

  const text = [
    `Hi ${params.consignorName},`,
    `${params.organizerName} added you as a consignor on FindA.Sale. Your portal shows your items, what has sold, and the payments recorded to you. No FindA.Sale account is needed.`,
    params.linkedExistingAccount
      ? 'We found an existing FindA.Sale account with this email address, so your consignments are connected to it. You can still use the portal link without signing in.'
      : '',
    `Open your portal: ${portalUrl}`,
    `Set up Square payouts: ${squareUrl}`,
    "Already have a Square account? Sign in with it. New to Square? You can create a free Square account first (your portal links to Square's sign up page), then come back and connect it.",
    `Prefer cash, check or another method? Just tell ${params.organizerName}. Nothing changes for you.`,
    params.markdownNotice
      ? `Please note: ${params.organizerName} may apply automatic price markdowns to unsold items over time. Your payout is calculated from the marked down price. ${params.markdownNotice}`
      : '',
    'Your portal link is private to you, so please do not share it.',
  ]
    .filter(Boolean)
    .join('\n');

  return sendLedgerEmail(
    params.consignorEmail,
    `${oneLine(params.organizerName)} added you as a consignor on FindA.Sale`,
    html,
    text
  );
};

/**
 * Tells the consignor a Square account was just connected from their portal, so an unexpected
 * connection (someone else holding their link) is visible to them right away.
 */
export const sendConsignorSquareConnectedNotice = async (params: {
  consignorName: string;
  consignorEmail: string | null | undefined;
  organizerName: string;
  active: boolean;
  connectedAt: Date;
}): Promise<ConsignorEmailResult> => {
  const organizer = escapeHtml(params.organizerName);
  const when = escapeHtml(fmtDate(params.connectedAt));
  const activationLine = params.active
    ? `<p style="color:#444;">Your Square account is active, so ${organizer} can pay you through Square.</p>`
    : `<p style="color:#444;">Square says your account is not fully activated yet. Finish the steps Square asks for (for example, linking a bank account), then open your portal and choose "Check again".</p>`;
  const html = buildEmail({
    preheader: 'A Square account was connected for your consignment payouts',
    headline: 'Square connected for your payouts',
    body: `<p>Hi ${escapeHtml(params.consignorName)},</p>
      <p>A Square account was connected to your consignment portal with ${organizer} on ${when}.</p>
      ${activationLine}
      <p style="color:#666;font-size:13px;">If you did not do this, contact ${organizer} right away. You can disconnect Square from your portal at any time.</p>`,
    accentColor: '#10b981',
    hideUnsubscribe: true,
    footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
  });
  const text = [
    `A Square account was connected to your consignment portal with ${params.organizerName} on ${fmtDate(params.connectedAt)}.`,
    params.active
      ? `Your Square account is active, so ${params.organizerName} can pay you through Square.`
      : 'Square says your account is not fully activated yet. Finish the steps Square asks for, then open your portal and choose "Check again".',
    `If you did not do this, contact ${params.organizerName} right away.`,
  ].join('\n');
  return sendLedgerEmail(params.consignorEmail, 'Square connected for your consignment payouts', html, text);
};

/** Tells the organizer (workspace owner) that a consignor connected Square from their portal. */
export const sendOrganizerConsignorSquareConnectedNotice = async (params: {
  organizerEmail: string | null | undefined;
  organizerName: string;
  consignorName: string;
  active: boolean;
  connectedAt: Date;
}): Promise<ConsignorEmailResult> => {
  const consignor = escapeHtml(params.consignorName);
  const html = buildEmail({
    preheader: escapeHtml(`${params.consignorName} connected Square for payouts`),
    headline: 'A consignor connected Square',
    body: `<p>Hi ${escapeHtml(params.organizerName)},</p>
      <p><strong>${consignor}</strong> connected a Square account from their consignor portal on ${escapeHtml(fmtDate(params.connectedAt))}.</p>
      <p style="color:#444;">${params.active ? 'Square reports the account as active.' : 'Square reports the account is not fully activated yet. Their portal shows them how to finish.'}</p>
      <p style="color:#666;font-size:13px;">If you did not expect this, check with ${consignor}. They can disconnect Square from their portal at any time, and you will be emailed when they do.</p>`,
    ctaText: 'View consignors',
    ctaUrl: `${siteUrl}/organizer/consignors`,
    accentColor: '#3b82f6',
    // Account-security notice for the organizer: the generic token-less unsubscribe link is a dead end.
    hideUnsubscribe: true,
    footerReason: 'You received this because a consignor in your FindA.Sale workspace connected Square.',
  });
  const text = [
    `${params.consignorName} connected a Square account from their consignor portal on ${fmtDate(params.connectedAt)}.`,
    params.active ? 'Square reports the account as active.' : 'Square reports the account is not fully activated yet.',
    `View consignors: ${siteUrl}/organizer/consignors`,
  ].join('\n');
  return sendLedgerEmail(
    params.organizerEmail,
    `${oneLine(params.consignorName)} connected Square for payouts`,
    html,
    text
  );
};

/** Tells the organizer (workspace owner) that a consignor disconnected Square from their portal. */
export const sendOrganizerConsignorSquareDisconnectedNotice = async (params: {
  organizerEmail: string | null | undefined;
  organizerName: string;
  consignorName: string;
  disconnectedAt: Date;
}): Promise<ConsignorEmailResult> => {
  const consignor = escapeHtml(params.consignorName);
  const html = buildEmail({
    preheader: escapeHtml(`${params.consignorName} disconnected Square`),
    headline: 'A consignor disconnected Square',
    body: `<p>Hi ${escapeHtml(params.organizerName)},</p>
      <p><strong>${consignor}</strong> disconnected Square. Their records are kept.</p>
      <p style="color:#444;">The change was made from their consignor portal on ${escapeHtml(fmtDate(params.disconnectedAt))}. Until they connect Square again, please pay them another way.</p>`,
    ctaText: 'View consignors',
    ctaUrl: `${siteUrl}/organizer/consignors`,
    accentColor: '#3b82f6',
    hideUnsubscribe: true,
    footerReason: 'You received this because a consignor in your FindA.Sale workspace disconnected Square.',
  });
  const text = [
    `${params.consignorName} disconnected Square. Their records are kept.`,
    `The change was made from their consignor portal on ${fmtDate(params.disconnectedAt)}. Until they connect Square again, please pay them another way.`,
    `View consignors: ${siteUrl}/organizer/consignors`,
  ].join('\n');
  return sendLedgerEmail(
    params.organizerEmail,
    `${oneLine(params.consignorName)} disconnected Square`,
    html,
    text
  );
};

/**
 * Tells the consignor Square was just disconnected from their portal, so an unexpected disconnect
 * (someone else holding their link) is visible to them right away.
 */
export const sendConsignorSquareDisconnectedNotice = async (params: {
  consignorName: string;
  consignorEmail: string | null | undefined;
  organizerName: string;
  disconnectedAt: Date;
}): Promise<ConsignorEmailResult> => {
  const organizer = escapeHtml(params.organizerName);
  const html = buildEmail({
    preheader: 'Square was disconnected from your consignment portal',
    headline: 'Square disconnected',
    body: `<p>Hi ${escapeHtml(params.consignorName)},</p>
      <p>Square was disconnected from your consignment portal with ${organizer} on ${escapeHtml(fmtDate(params.disconnectedAt))}. Your payout records are kept, and you can connect Square again from your portal any time.</p>
      <p style="color:#666;font-size:13px;">If you did not do this, contact ${organizer} right away.</p>`,
    accentColor: '#3b82f6',
    hideUnsubscribe: true,
    footerReason: `You received this because ${params.organizerName} added you as a consignor on FindA.Sale.`,
  });
  const text = [
    `Square was disconnected from your consignment portal with ${params.organizerName} on ${fmtDate(params.disconnectedAt)}.`,
    'Your payout records are kept, and you can connect Square again from your portal any time.',
    `If you did not do this, contact ${params.organizerName} right away.`,
  ].join('\n');
  return sendLedgerEmail(params.consignorEmail, 'Square disconnected from your consignment portal', html, text);
};

/** Tells the organizer a consignor asked, from their portal, for their personal data to be removed or reviewed. */
export const sendOrganizerConsignorDataRemovalRequest = async (params: {
  organizerEmail: string | null | undefined;
  organizerName: string;
  consignorName: string;
  consignorEmail?: string | null;
  requestedAt: Date;
}): Promise<ConsignorEmailResult> => {
  const consignor = escapeHtml(params.consignorName);
  const contact = params.consignorEmail
    ? `<p style="color:#444;">Their email on file: ${escapeHtml(params.consignorEmail)}</p>`
    : '';
  const html = buildEmail({
    preheader: escapeHtml(`${params.consignorName} asked for their personal data to be removed or reviewed`),
    headline: 'A consignor made a data request',
    body: `<p>Hi ${escapeHtml(params.organizerName)},</p>
      <p><strong>${consignor}</strong> asked for their personal data to be removed or reviewed. They sent the request from their consignor portal on ${escapeHtml(fmtDate(params.requestedAt))}.</p>
      ${contact}
      <p style="color:#444;">Nothing has been deleted. Please follow up with them directly. Sales and payout records may need to be kept for legal and accounting reasons.</p>`,
    ctaText: 'View consignors',
    ctaUrl: `${siteUrl}/organizer/consignors`,
    accentColor: '#3b82f6',
    hideUnsubscribe: true,
    footerReason: 'You received this because a consignor in your FindA.Sale workspace made a data request.',
  });
  const text = [
    `${params.consignorName} asked for their personal data to be removed or reviewed. They sent the request from their consignor portal on ${fmtDate(params.requestedAt)}.`,
    params.consignorEmail ? `Their email on file: ${params.consignorEmail}` : '',
    'Nothing has been deleted. Please follow up with them directly. Sales and payout records may need to be kept for legal and accounting reasons.',
    `View consignors: ${siteUrl}/organizer/consignors`,
  ]
    .filter(Boolean)
    .join('\n');
  return sendLedgerEmail(
    params.organizerEmail,
    `${oneLine(params.consignorName)} made a data request`,
    html,
    text
  );
};
