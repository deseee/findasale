/**
 * Organizer Onboarding Email Service — Emails 5a, 5b, 5c
 *
 * Three-email sequence over the first 7 days after organizer signup.
 * 5a: Day 0 — "You're in — here's your first step"
 * 5b: Day 2 — "Quick question" (if no sale created)
 * 5c: Day 7 — "One last nudge" (if no sale created)
 *
 * Plus two one-time activation nudges, sent by organizerOnboardingDripJob.ts:
 * - sendEmptySaleNudge: a published sale with no shopper-visible items yet.
 * - sendDraftReadyNudge: a draft sale that already has items but was never published.
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
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
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
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Welcome in! Here's your first step`,
      html,
      listUnsubscribe: listUnsubscribeHeader,
    });
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
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Quick question, ${firstName}`,
      html,
      listUnsubscribe: listUnsubscribeHeader,
    });
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
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `One last nudge before we leave you alone`,
      html,
      listUnsubscribe: listUnsubscribeHeader,
    });
    console.log(`[onboarding] Email 5c sent to ${organizer.email}`);
  } catch (err) {
    console.error(`[onboarding] Failed to send 5c to ${organizer.email}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Activation nudges (one per sale, sent by organizerOnboardingDripJob.ts)
// ─────────────────────────────────────────────────────────────────

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

/**
 * "Your sale is live but has no items yet." One call to action: add items.
 * Sent once per sale for a PUBLISHED sale with zero shopper-visible items.
 */
export async function sendEmptySaleNudge(organizer: SaleNudgeRecipient): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = escapeHtml(organizer.firstName || 'there');
  const title = escapeHtml(organizer.saleTitle || 'Your sale');
  const addItemsUrl = `${FRONTEND_URL}/organizer/add-items/${encodeURIComponent(organizer.saleId)}`;

  const content = `
    ${buildHero({ title: `Your sale is live, ${firstName}. Now add your items.`, sub: `<strong>${title}</strong> is on the map, but it has no items yet. Shoppers who open it see an empty page.` })}
    <tr><td style="padding:8px 28px 4px; font-size:14.5px; color:${T.ink}; line-height:1.55;">
      Snap a photo of each thing you&rsquo;re selling and we&rsquo;ll help fill in the title and price. Even a handful of items gives people a reason to stop by.
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Add items to your sale →', addItemsUrl)}
  `;

  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(organizer.userId, 'all');

  const html = baseWrapper({
    preheader: 'Your sale is live but has no items yet. Add a few so shoppers have something to browse.',
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Your sale is live, but it has no items yet`,
      html,
      listUnsubscribe: listUnsubscribeHeader,
    });
    console.log(`[onboarding] Empty-sale nudge sent to ${organizer.email} (sale ${organizer.saleId})`);
  } catch (err) {
    console.error(`[onboarding] Failed to send empty-sale nudge to ${organizer.email}:`, err);
  }
}

/**
 * "Your items are ready, publish your sale." One call to action: publish.
 * Sent once per sale for a DRAFT sale that has items, from an organizer who has never published.
 */
export async function sendDraftReadyNudge(organizer: SaleNudgeRecipient & { itemCount: number }): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = escapeHtml(organizer.firstName || 'there');
  const title = escapeHtml(organizer.saleTitle || 'Your sale');
  const count = Math.max(0, Math.floor(organizer.itemCount || 0));
  const itemsPhrase = count === 1 ? '1 item' : `${count} items`;
  const publishUrl = `${FRONTEND_URL}/organizer/edit-sale/${encodeURIComponent(organizer.saleId)}?publish=1`;

  const content = `
    ${buildHero({ title: `Your items are ready, ${firstName}. Publish your sale.`, sub: `<strong>${title}</strong> has ${itemsPhrase}, but the sale is still a draft, so shoppers can&rsquo;t see it yet.` })}
    <tr><td style="padding:8px 28px 4px; font-size:14.5px; color:${T.ink}; line-height:1.55;">
      Publishing puts your sale on the map and makes your items visible to people nearby. You can keep adding and editing items after it&rsquo;s live.
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Publish your sale →', publishUrl)}
  `;

  const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
  const { webUrl: unsubUrl, listUnsubscribeHeader } = await buildUnsubscribeLinks(organizer.userId, 'all');

  const html = baseWrapper({
    preheader: 'Your items are ready. Publish your sale so shoppers can see them.',
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Your items are ready. Publish your sale?`,
      html,
      listUnsubscribe: listUnsubscribeHeader,
    });
    console.log(`[onboarding] Draft-ready nudge sent to ${organizer.email} (sale ${organizer.saleId})`);
  } catch (err) {
    console.error(`[onboarding] Failed to send draft-ready nudge to ${organizer.email}:`, err);
  }
}
