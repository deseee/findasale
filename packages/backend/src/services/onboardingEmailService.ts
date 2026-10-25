/**
 * Organizer Onboarding Email Service — Emails 5a, 5b, 5c
 *
 * Three-email sequence over the first 7 days after organizer signup.
 * 5a: Day 0 — "You're in — here's your first step"
 * 5b: Day 2 — "Quick question" (if no sale created)
 * 5c: Day 7 — "One last nudge" (if no sale created)
 *
 * Plus three one-time activation nudges, sent by organizerOnboardingDripJob.ts on the TRANSACTIONAL
 * (Resend) rail since 2026-10-23 (the Gmail rail is cold-outreach only, see lib/transactionalEmailService.ts):
 * - sendEmptySaleNudge: a published sale with no shopper-visible items yet.
 * - sendDraftReadyNudge: a draft sale that already has items but was never published.
 * - sendStaleDatesNudge: a draft or live sale whose dates have passed with nothing sold ("pick new dates").
 *
 * All use the FindA.Sale design system (Session 4).
 * Sender: "The FindA.Sale Team" — never a personal name.
 */

import {
  baseWrapper,
  buildCTARow,
  buildStepIndicator,
  buildHero,
  buildSpacer,
  EMAIL_TOKENS as T,
} from './emailTemplateService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from './suppressionService';

// Drip (5a/5b/5c) rides the Resend rail from the same support@ sender as the activation nudges.
const DRIP_FROM = process.env.ACTIVATION_NUDGE_FROM_EMAIL || 'The FindA.Sale Team <support@finda.sale>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

// ─────────────────────────────────────────────────────────────────
// Email 5a — Day 0: "You're in — here's your first step"
// ─────────────────────────────────────────────────────────────────

export async function sendOnboardingEmail5a(organizer: {
  email: string;
  firstName?: string;
  userId: string;
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = organizer.firstName || 'there';

  const bullets = [
    'Your sale shows up on the map as soon as it&rsquo;s live, so posting early gives people more time to find it.',
    'Setup is short: the type of sale, the dates and the address. Then add the items you&rsquo;re selling.',
    'Save a draft and come back later. Nothing has to be final yet.',
  ];

  const bulletRows = bullets.map(b => `
<tr>
  <td width="16" valign="top" style="padding-right:10px; padding-top:6px;">
    <div style="width:6px; height:6px; border-radius:999px; background:${T.accent}; margin-top:5px;"></div>
  </td>
  <td style="font-size:14.5px; color:${T.ink}; line-height:1.55; padding:4px 0;">${b}</td>
</tr>`).join('');

  const content = `
    ${buildStepIndicator(1)}
    ${buildHero({ title: `You&rsquo;re in. Here&rsquo;s your first step.`, sub: `Just one thing today: set up your first sale. Then add a few items so shoppers have something to browse.` })}
    <tr><td style="padding:8px 28px 4px;">
      <table cellpadding="0" cellspacing="0" role="presentation">
        ${bulletRows}
      </table>
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Create your first sale →', `${FRONTEND_URL}/organizer/create-sale`)}
  `;

  // Real per-user unsubscribe token (bug fix, 2026-09-06): the old
  // `${FRONTEND_URL}/unsubscribe?reason=onboarding` link carried no token at all --
  // pages/unsubscribe.tsx requires one and shows "Invalid unsubscribe link" for every click.
  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(organizer.userId, 'all');

  const html = baseWrapper({
    preheader: 'One thing to do today: post your first sale.',
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl,
  });

  try {
    // 2026-10-25: Resend rail (finda.sale, DKIM/SPF aligned) instead of the Gmail outreach mailbox, so drip mail
    // does not share reputation with cold outreach and reaches Yahoo/AOL/iCloud/Outlook.
    const result = await transactionalEmailService.emails.send({
      from:    DRIP_FROM,
      to:      organizer.email,
      subject: `Welcome in! Here's your first step`,
      html,
      headers: {
        'List-Unsubscribe': listUnsubscribeHeader,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!result.sent) {
      console.warn(`[onboarding] Email 5a NOT sent to ${organizer.email} (${result.reason})`);
      return;
    }
    console.log(`[onboarding] Email 5a sent to ${organizer.email}`);
  } catch (err) {
    console.error(`[onboarding] Failed to send 5a to ${organizer.email}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Email 5b — Day 2: "Quick question"
// ─────────────────────────────────────────────────────────────────

export async function sendOnboardingEmail5b(organizer: {
  email: string;
  firstName?: string;
  userId: string;
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = organizer.firstName || 'there';

  const steps = [
    { n: '1', title: 'Pick your sale type', body: 'Yard, garage, moving, auction, flea market and more.', linkText: 'Pick a type', linkUrl: `${FRONTEND_URL}/organizer/create-sale` },
    { n: '2', title: 'Add an address', body: `We'll show it on the map and to people in the area.`, linkText: 'Add address', linkUrl: `${FRONTEND_URL}/organizer/create-sale` },
    { n: '3', title: 'Upload one photo', body: 'Just one. You can add more anytime.', linkText: 'Upload', linkUrl: `${FRONTEND_URL}/organizer/create-sale` },
  ];

  const stepRows = steps.map((s, i) => {
    const border = i < steps.length - 1 ? `border-bottom:1px solid ${T.borderSolid};` : '';
    return `
<tr><td style="padding:14px 0; ${border}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td width="36" valign="top" style="width:36px; padding-right:12px; padding-top:2px;">
        <div style="width:28px; height:28px; border-radius:999px; background:${T.outer}; border:1px solid ${T.borderSolid}; text-align:center; line-height:28px; font-size:12px; font-weight:600; color:${T.ink};">${s.n}</div>
      </td>
      <td valign="top">
        <div style="font-size:14.5px; font-weight:600; color:${T.ink}; margin-bottom:2px;">${s.title}</div>
        <div style="font-size:13.5px; color:${T.inkDim}; line-height:1.5;">${s.body}</div>
      </td>
      <td width="80" valign="top" align="right" style="padding-left:8px; white-space:nowrap; padding-top:2px;">
        <a href="${s.linkUrl}" style="color:${T.accent}; font-size:13px; font-weight:600; text-decoration:none;">${s.linkText} &rarr;</a>
      </td>
    </tr>
  </table>
</td></tr>`;
  }).join('');

  const content = `
    ${buildStepIndicator(2)}
    ${buildHero({ title: `Quick question, ${firstName}.`, sub: `Still getting set up? Here&rsquo;s what takes most people less than 5 minutes:` })}
    <tr><td style="padding:8px 28px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${stepRows}
      </table>
    </td></tr>
    ${buildSpacer(20)}
    ${buildCTARow('Start where you are →', `${FRONTEND_URL}/organizer/create-sale`)}
  `;

  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(organizer.userId, 'all');

  const html = baseWrapper({
    preheader: `Still getting set up? Here's what most people do first.`,
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl,
  });

  try {
    // 2026-10-25: Resend rail (finda.sale, DKIM/SPF aligned) instead of the Gmail outreach mailbox, so drip mail
    // does not share reputation with cold outreach and reaches Yahoo/AOL/iCloud/Outlook.
    const result = await transactionalEmailService.emails.send({
      from:    DRIP_FROM,
      to:      organizer.email,
      subject: `Quick question, ${firstName}`,
      html,
      headers: {
        'List-Unsubscribe': listUnsubscribeHeader,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!result.sent) {
      console.warn(`[onboarding] Email 5b NOT sent to ${organizer.email} (${result.reason})`);
      return;
    }
    console.log(`[onboarding] Email 5b sent to ${organizer.email}`);
  } catch (err) {
    console.error(`[onboarding] Failed to send 5b to ${organizer.email}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Email 5c — Day 7: "One last nudge"
// ─────────────────────────────────────────────────────────────────

export async function sendOnboardingEmail5c(organizer: {
  email: string;
  firstName?: string;
  userId: string;
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const content = `
    ${buildStepIndicator(3)}
    ${buildHero({ title: `One last nudge, then we&rsquo;ll leave you alone.`, sub: `We know setting up something new takes time. No guilt. Whenever you&rsquo;re ready, we&rsquo;ll be here.` })}
    <tr><td style="padding:12px 28px 20px;">
      <div style="padding:20px; border-radius:10px; background:${T.accentSoft}; border:1px solid rgba(200,85,43,0.20);">
        <div style="font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:${T.accent}; margin-bottom:8px; font-family:${T.font};">How people find you</div>
        <div style="font-size:16px; line-height:1.5; color:${T.ink}; font-weight:500;">
          Once your sale is live, it shows up on the map and in the discovery feed for people nearby. <strong style="color:${T.accent};">No following needed.</strong>
        </div>
        <div style="margin-top:12px; font-size:13px; color:${T.inkDim}; line-height:1.5;">
          A clear title, a few photos and the items you&rsquo;re selling give shoppers a reason to stop by.
        </div>
      </div>
    </td></tr>
    ${buildCTARow('Create your first sale →', `${FRONTEND_URL}/organizer/create-sale`, `Not ready yet? No worries. Your account stays active.`)}
  `;

  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(organizer.userId, 'all');

  const html = baseWrapper({
    preheader: `Your sale shows up on the map for people nearby, no following needed.`,
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl,
  });

  try {
    // 2026-10-25: Resend rail (finda.sale, DKIM/SPF aligned) instead of the Gmail outreach mailbox, so drip mail
    // does not share reputation with cold outreach and reaches Yahoo/AOL/iCloud/Outlook.
    const result = await transactionalEmailService.emails.send({
      from:    DRIP_FROM,
      to:      organizer.email,
      subject: `One last nudge before we leave you alone`,
      html,
      headers: {
        'List-Unsubscribe': listUnsubscribeHeader,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!result.sent) {
      console.warn(`[onboarding] Email 5c NOT sent to ${organizer.email} (${result.reason})`);
      return;
    }
    console.log(`[onboarding] Email 5c sent to ${organizer.email}`);
  } catch (err) {
    console.error(`[onboarding] Failed to send 5c to ${organizer.email}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Activation nudges (one per sale per state, sent by organizerOnboardingDripJob.ts)
// Transactional (Resend) rail, sender "The FindA.Sale Team" at support@ so replies reach a person.
// Each returns what happened so the job can log it: 'sent', 'suppressed' (opted out, bounced or
// blocked: logged so it is never retried) or 'failed' (not logged, so the next daily run retries).
// ─────────────────────────────────────────────────────────────────

const ACTIVATION_FROM = process.env.ACTIVATION_NUDGE_FROM_EMAIL || 'The FindA.Sale Team <support@finda.sale>';

export type NudgeOutcome = 'sent' | 'suppressed' | 'failed';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type SaleNudgeRecipient = {
  email: string;
  firstName?: string;
  userId: string;
  saleId: string;
  saleTitle: string;
};

async function sendActivationEmail(
  organizer: SaleNudgeRecipient,
  label: string,
  build: (unsubUrl: string) => { subject: string; html: string }
): Promise<NudgeOutcome> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log(`[onboarding] ${label} skipped, suppressed recipient (user ${organizer.userId})`);
    return 'suppressed';
  }
  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl } = await buildUnsubscribeLinks(organizer.userId, 'all');
  const { subject, html } = build(unsubUrl);
  try {
    const result = await transactionalEmailService.emails.send({
      from: ACTIVATION_FROM,
      to: organizer.email,
      subject,
      html,
      // RFC 8058 one-click unsubscribe, same shape as the other Resend-rail lifecycle mail.
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (result.sent) {
      console.log(`[onboarding] ${label} sent (user ${organizer.userId}, sale ${organizer.saleId})`);
      return 'sent';
    }
    if (result.reason === 'not_configured') return 'failed';
    console.log(`[onboarding] ${label} not sent (${result.reason}) for user ${organizer.userId}`);
    return 'suppressed';
  } catch (err) {
    console.error(`[onboarding] Failed to send ${label} for user ${organizer.userId}:`, err);
    return 'failed';
  }
}

/**
 * "Your sale is live but has no items yet." One call to action: add items.
 * Sent once per sale for a PUBLISHED, not yet over sale with zero shopper-visible items.
 */
export async function sendEmptySaleNudge(organizer: SaleNudgeRecipient): Promise<NudgeOutcome> {
  const firstName = escapeHtml(organizer.firstName || 'there');
  const title = escapeHtml(organizer.saleTitle || 'Your sale');
  const addItemsUrl = `${FRONTEND_URL}/organizer/add-items/${encodeURIComponent(organizer.saleId)}`;
  return sendActivationEmail(organizer, 'empty-sale nudge', (unsubUrl) => {
    const content = `
    ${buildHero({ title: `Your sale is live, ${firstName}. Now add your items.`, sub: `<strong>${title}</strong> is on the map, but it has no items yet. Shoppers who open it see an empty page.` })}
    <tr><td style="padding:8px 28px 4px; font-size:14.5px; color:${T.ink}; line-height:1.55;">
      Snap a photo of each thing you&rsquo;re selling and we&rsquo;ll help fill in the title and price. Even a handful of items gives people a reason to stop by.
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Add items to your sale →', addItemsUrl)}
  `;
    return {
      subject: 'Your sale is live, but it has no items yet',
      html: baseWrapper({
        preheader: 'Your sale is live but has no items yet. Add a few so shoppers have something to browse.',
        content,
        unsubLabel: 'Pause onboarding emails',
        unsubUrl,
      }),
    };
  });
}

/**
 * "Your items are ready, publish your sale." One call to action: publish.
 * Sent once per sale for a DRAFT, not yet over sale that has items.
 */
export async function sendDraftReadyNudge(organizer: SaleNudgeRecipient & { itemCount: number }): Promise<NudgeOutcome> {
  const firstName = escapeHtml(organizer.firstName || 'there');
  const title = escapeHtml(organizer.saleTitle || 'Your sale');
  const count = Math.max(0, Math.floor(organizer.itemCount || 0));
  const itemsPhrase = count === 1 ? '1 item' : `${count} items`;
  const publishUrl = `${FRONTEND_URL}/organizer/edit-sale/${encodeURIComponent(organizer.saleId)}?publish=1`;
  return sendActivationEmail(organizer, 'draft-ready nudge', (unsubUrl) => {
    const content = `
    ${buildHero({ title: `Your items are ready, ${firstName}. Publish your sale.`, sub: `<strong>${title}</strong> has ${itemsPhrase}, but the sale is still a draft, so shoppers can&rsquo;t see it yet.` })}
    <tr><td style="padding:8px 28px 4px; font-size:14.5px; color:${T.ink}; line-height:1.55;">
      Publishing puts your sale on the map, and your ready items go live with it. You can keep adding and editing items after it&rsquo;s live.
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Publish your sale →', publishUrl)}
  `;
    return {
      subject: 'Your items are ready. Publish your sale?',
      html: baseWrapper({
        preheader: 'Your items are ready. Publish your sale so shoppers can see them.',
        content,
        unsubLabel: 'Pause onboarding emails',
        unsubUrl,
      }),
    };
  });
}

/**
 * "Your sale's dates have passed. Pick new dates." One call to action: the one-click re-date prompt on
 * edit-sale (?redate=1 suggests next weekend, same length and hours). Sent once per sale for a DRAFT or
 * PUBLISHED sale whose end date has passed with nothing sold.
 */
export async function sendStaleDatesNudge(
  organizer: SaleNudgeRecipient & { itemCount: number; saleStatus: string }
): Promise<NudgeOutcome> {
  const firstName = escapeHtml(organizer.firstName || 'there');
  const title = escapeHtml(organizer.saleTitle || 'Your sale');
  const count = Math.max(0, Math.floor(organizer.itemCount || 0));
  const itemsPhrase = count === 1 ? '1 item' : `${count} items`;
  const redateUrl = `${FRONTEND_URL}/organizer/edit-sale/${encodeURIComponent(organizer.saleId)}?redate=1`;
  const isDraft = organizer.saleStatus === 'DRAFT';
  let subject: string;
  let body: string;
  if (count > 0) {
    subject = `Your ${itemsPhrase} ${count === 1 ? 'is' : 'are'} saved. Pick new dates for your sale`;
    body = `Your ${itemsPhrase} ${count === 1 ? 'is' : 'are'} still saved. Pick new dates in one tap, then publish so shoppers can find ${count === 1 ? 'it' : 'them'}.`;
  } else if (isDraft) {
    subject = 'Your sale draft needs new dates';
    body = 'Pick new dates in one tap, add a few items, and publish when you&rsquo;re ready.';
  } else {
    subject = 'Your sale dates have passed. Pick new ones?';
    body = 'Pick new dates in one tap and add a few items, so shoppers have a reason to stop by.';
  }
  return sendActivationEmail(organizer, 'stale-dates nudge', (unsubUrl) => {
    const content = `
    ${buildHero({ title: `Pick new dates, ${firstName}`, sub: `The dates for <strong>${title}</strong> have passed, so shoppers can&rsquo;t find it right now.` })}
    <tr><td style="padding:8px 28px 4px; font-size:14.5px; color:${T.ink}; line-height:1.55;">
      ${body} We&rsquo;ll suggest next weekend, keeping the same hours and length. You can change them before you save.
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Pick new dates →', redateUrl)}
  `;
    return {
      subject,
      html: baseWrapper({
        preheader: 'Your sale dates have passed. Pick new dates in one tap.',
        content,
        unsubLabel: 'Pause onboarding emails',
        unsubUrl,
      }),
    };
  });
}
