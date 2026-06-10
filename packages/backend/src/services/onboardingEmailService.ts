/**
 * Organizer Onboarding Email Service — Emails 5a, 5b, 5c
 *
 * Three-email sequence over the first 7 days after organizer signup.
 * 5a: Day 0 — "You're in — here's your first step"
 * 5b: Day 2 — "Quick question" (if no sale created)
 * 5c: Day 7 — "One last nudge" (if no sale created)
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

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@send.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

// ─────────────────────────────────────────────────────────────────
// Email 5a — Day 0: "You're in — here's your first step"
// ─────────────────────────────────────────────────────────────────

export async function sendOnboardingEmail5a(organizer: {
  email: string;
  firstName?: string;
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = organizer.firstName || 'there';

  const bullets = [
    'Organizers who post within 24 hours get 4&times; more first-week views.',
    'Average setup time, start to finish, is under 7 minutes.',
    'You can save a draft and come back — nothing has to be final.',
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
    ${buildHero({ title: `You&rsquo;re in. Here&rsquo;s your first step.`, sub: `Just one thing today &mdash; post your first sale. Photos and pricing can come later.` })}
    <tr><td style="padding:8px 28px 4px;">
      <table cellpadding="0" cellspacing="0" role="presentation">
        ${bulletRows}
      </table>
    </td></tr>
    ${buildSpacer(16)}
    ${buildCTARow('Create your first sale →', `${FRONTEND_URL}/organizer/sales/new`)}
  `;

  const html = baseWrapper({
    preheader: 'One thing to do today: post your first sale.',
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl: `${FRONTEND_URL}/unsubscribe?reason=onboarding`,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `You're in — here's your first step`,
      html,
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
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const firstName = organizer.firstName || 'there';

  const steps = [
    { n: '1', title: 'Pick your sale type', body: 'Estate, yard, garage, auction, or flea market.', linkText: 'Pick a type', linkUrl: `${FRONTEND_URL}/organizer/sales/new?step=type` },
    { n: '2', title: 'Add an address', body: `We'll show it on the map and to people in the area.`, linkText: 'Add address', linkUrl: `${FRONTEND_URL}/organizer/sales/new?step=location` },
    { n: '3', title: 'Upload one photo', body: 'Just one. You can add more anytime.', linkText: 'Upload', linkUrl: `${FRONTEND_URL}/organizer/sales/new?step=photos` },
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
    ${buildCTARow('Start where you are →', `${FRONTEND_URL}/organizer/sales/new`)}
  `;

  const html = baseWrapper({
    preheader: `Still getting set up? Here's what most people do first.`,
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl: `${FRONTEND_URL}/unsubscribe?reason=onboarding`,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `Quick question, ${firstName}`,
      html,
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
}): Promise<void> {
  if (await suppressionService.isSuppressed(organizer.email)) {
    console.log('[onboarding] Skipped suppressed recipient:', organizer.email);
    return;
  }
  const content = `
    ${buildStepIndicator(3)}
    ${buildHero({ title: `One last nudge &mdash; then we&rsquo;ll leave you alone.`, sub: `We know setting up something new takes time. No guilt. Whenever you&rsquo;re ready, we&rsquo;ll be here.` })}
    <tr><td style="padding:12px 28px 20px;">
      <div style="padding:20px; border-radius:10px; background:${T.accentSoft}; border:1px solid rgba(200,85,43,0.20);">
        <div style="font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:${T.accent}; margin-bottom:8px; font-family:${T.font};">Real example</div>
        <div style="font-size:16px; line-height:1.5; color:${T.ink}; font-weight:500;">
          &ldquo;An organizer near you posted their first sale last week and got <strong style="color:${T.accent};">34 views in 48 hours</strong> &mdash; without any prior following.&rdquo;
        </div>
        <div style="margin-top:12px; font-size:13px; color:${T.inkDim}; line-height:1.5;">
          That&rsquo;s just from the map and discovery feed. With a few photos and a clear title, most first sales pick up momentum quickly.
        </div>
      </div>
    </td></tr>
    ${buildCTARow('Create your first sale →', `${FRONTEND_URL}/organizer/sales/new`, `Not ready yet? No worries &mdash; your account stays active.`)}
  `;

  const html = baseWrapper({
    preheader: `An organizer near you got 34 views on their first sale last week.`,
    content,
    unsubLabel: 'Pause onboarding emails',
    unsubUrl: `${FRONTEND_URL}/unsubscribe?reason=onboarding`,
  });

  try {
    await emailService.emails.send({
      from:    FROM_EMAIL,
      to:      organizer.email,
      subject: `One last nudge — then we'll leave you alone`,
      html,
    });
    console.log(`[onboarding] Email 5c sent to ${organizer.email}`);
  } catch (err) {
    console.error(`[onboarding] Failed to send 5c to ${organizer.email}:`, err);
  }
}
