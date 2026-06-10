/**
 * Sale Live Email Service — Email 7
 *
 * Sent to the organizer when their sale is published.
 * Goal: confirm it's live + prompt sharing.
 * Tone: celebratory, action-oriented.
 *
 * Sender: "The FindA.Sale Team" — never a personal name.
 */

import {
  baseWrapper,
  buildHero,
  buildCTARow,
  buildSpacer,
  EMAIL_TOKENS as T,
} from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@send.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * Send "Sale is live" confirmation to the organizer.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function sendSaleLiveEmail(
  organizer: { email: string; businessName?: string },
  sale:       { title: string; id: string }
): Promise<void> {
  if (await suppressionService.isHardSuppressed(organizer.email)) {
    console.log('[saleLive] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const saleUrl     = `${FRONTEND_URL}/sales/${sale.id}`;
  const addItemsUrl = `${FRONTEND_URL}/organizer/sales/${sale.id}/items`;

  const shareButtons = [
    { label: 'Copy link',  url: saleUrl },
    { label: 'Facebook',   url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(saleUrl)}` },
    { label: 'Instagram',  url: `https://www.instagram.com/` },
  ].map((b, i) => {
    const isLast = i === 2;
    return `<td style="padding:0 ${isLast ? '0' : '6px'} 0 0;">
      <a href="${b.url}" style="display:inline-block; padding:11px 14px; border-radius:8px;
         border:1px solid ${T.borderSolid}; color:${T.ink}; text-decoration:none;
         font-size:13px; font-weight:600; white-space:nowrap; font-family:${T.font};">
        ${b.label}
      </a>
    </td>`;
  }).join('');

  const content = `
    ${buildHero({
      eyebrow: 'Sale published',
      title:   `${sale.title} is live on FindA.Sale.`,
      sub:     `Share it now &mdash; sales shared in the first hour average 2&times; more views than ones shared later.`,
    })}

    <!-- Sale link display -->
    <tr><td style="padding:12px 28px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="border-radius:8px; background:${T.outer}; border:1px solid ${T.borderSolid}; overflow:hidden;">
        <tr>
          <td style="padding:12px 16px; font-size:13px; color:${T.ink}; font-family:${T.font}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            &#127760; ${saleUrl}
          </td>
          <td style="padding:12px 16px; white-space:nowrap;" align="right">
            <a href="${saleUrl}" style="color:${T.accent}; font-weight:600; font-size:13px; text-decoration:none;">Open &rarr;</a>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Share buttons -->
    <tr><td style="padding:0 28px 16px;">
      <table cellpadding="0" cellspacing="0" role="presentation">
        <tr>${shareButtons}</tr>
      </table>
    </td></tr>

    <!-- Social proof nudge -->
    <tr><td style="padding:0 28px 16px;">
      <div style="padding:14px 16px; border-radius:8px; background:${T.accentSoft};">
        <div style="font-size:13.5px; color:${T.ink}; line-height:1.5;">
          <strong style="color:${T.accent};">2&times; more views</strong> happen on sales shared within the first hour.
          A single Facebook post or text to friends usually does it.
        </div>
      </div>
    </td></tr>

    ${buildSpacer(4)}
    ${buildCTARow('Open your sale page →', saleUrl, `Want to add more? <a href="${addItemsUrl}" style="color:${T.accent}; font-weight:600; text-decoration:none;">Add items to your sale &rarr;</a>`)}
  `;

  const html = baseWrapper({
    preheader: `2× more views happen in the first hour when you share.`,
    content,
    unsubLabel: 'Manage organizer notifications',
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Your sale is live — share it now`,
      html,
    });
    console.log(`[saleLive] Confirmation email sent to ${organizer.email} for sale ${sale.id}`);
  } catch (err) {
    console.error(`[saleLive] Failed to send sale live email to ${organizer.email}:`, err);
    // Don't throw — best-effort notification
  }
}
