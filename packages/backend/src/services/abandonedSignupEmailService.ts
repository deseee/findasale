/**
 * Abandoned-Registration Recovery Email Service — Outward Email Automation #5
 *
 * Distinct from abandonedCheckoutJob (which recovers abandoned CHECKOUTS). This
 * recovers abandoned SIGNUPS: an organizer who registered but never completed the
 * key activation step — publishing their first sale.
 *
 * ── Overlap with existing onboarding (IMPORTANT) ───────────────────────────────
 * Organizer onboarding (the Day-0 / Day-2 / Day-7 "5a / 5b / 5c" drip) is run by
 * MailerLite, not by this backend — organizers are enrolled at signup via
 * mailerliteService.addOrganizerSubscriber(), and the automation EXITS when they
 * publish (sale_published custom field flips to "yes" via markSalePublished).
 * The SES sendOnboardingEmail5a/5b/5c functions are NOT wired to any trigger.
 *
 * To avoid double-sending against the MailerLite Day-2 / Day-7 touches, this
 * service ships ONLY the genuine gap MailerLite does not cover: a single
 * same-day 1-hour SOFT nudge for organizers who registered but haven't published
 * within ~1 hour. The 24-hour "final" nudge is intentionally NOT sent here — it
 * overlaps the MailerLite Day-2 touch and is flagged as DECISION NEEDED in the
 * handoff rather than shipped.
 *
 * Reuses the FindA.Sale email design system (emailTemplateService) and the
 * SES/Gmail send rail (lib/emailService). Respects suppressionService.
 *
 * Throttle / idempotency: the generic EmailAutomationLog (automationKey
 * "abandoned_signup_1h"). One 1-hour nudge per organizer, ever. No schema changes.
 *
 * Sender: "The FindA.Sale Team" — never a personal name.
 */

import { prisma } from '../index';
import {
  baseWrapper,
  buildHero,
  buildSpacer,
  buildCTARow,
  buildTextBlockModule,
} from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

const SIGNUP_1H_KEY = 'abandoned_signup_1h';

// Window for the 1-hour same-day nudge: registered between 1h and 24h ago.
// Upper bound keeps this strictly a SAME-DAY touch and prevents overlap with the
// MailerLite Day-2 (≈48h) onboarding email.
const MIN_AGE_MS = 1 * 60 * 60 * 1000; // 1 hour
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** First name from a full name, falling back to a friendly default. */
function firstNameOf(name: string | null | undefined): string {
  if (!name) return 'there';
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

/** Returns true if this organizer has already received the 1-hour signup nudge. */
async function alreadySent(userId: string): Promise<boolean> {
  const existing = await prisma.emailAutomationLog.findFirst({
    where: { userId, automationKey: SIGNUP_1H_KEY },
    select: { id: true },
  });
  return !!existing;
}

async function logSent(userId: string): Promise<void> {
  await prisma.emailAutomationLog.create({
    data: { userId, automationKey: SIGNUP_1H_KEY },
  });
}

function buildSignup1hHtml(opts: {
  firstName: string;
  newSaleUrl: string;
  unsubUrl: string;
}): string {
  const { firstName, newSaleUrl, unsubUrl } = opts;

  const content = `
    ${buildHero({
      eyebrow: 'Picking up where you left off',
      title: `Still there, ${firstName}?`,
      sub: `You created your FindA.Sale account &mdash; the last step is posting your first sale, and it takes most people under 7 minutes.`,
    })}
    ${buildSpacer(8)}
    ${buildTextBlockModule({
      headline: 'You can start with just the basics',
      body: `Pick a sale type, drop in an address, and you&rsquo;re live on the map. Photos and pricing can come later &mdash; nothing has to be final, and you can save a draft anytime.`,
    })}
    ${buildSpacer(8)}
    ${buildCTARow('Post your first sale →', newSaleUrl, `Organizers who post within 24 hours get 4&times; more first-week views.`)}
  `;

  return baseWrapper({
    preheader: `You're one step away — post your first sale to go live.`,
    content,
    unsubLabel: 'Manage email preferences',
    unsubUrl,
  });
}

/**
 * Send the 1-hour abandoned-signup nudge to a single organizer.
 * Idempotent + suppression-checked. Returns true if an email was sent.
 */
export async function sendAbandonedSignup1h(organizerId: string): Promise<boolean> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      id: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!organizer) return false;

  const email = organizer.user?.email;
  const userId = organizer.user?.id;
  if (!email || !userId) return false;

  if (await suppressionService.isSuppressed(email)) {
    await logSent(userId); // stamp so we stop re-evaluating a suppressed organizer
    console.log(`[abandonedSignup] Skipped suppressed organizer ${email} (${organizerId})`);
    return false;
  }
  if (await alreadySent(userId)) return false;

  const html = buildSignup1hHtml({
    firstName: firstNameOf(organizer.user?.name),
    newSaleUrl: `${FRONTEND_URL}/organizer/sales/new`,
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `You're one step from going live`,
      html,
      jobName: 'abandonedSignup1h',
    });
    await logSent(userId);
    console.log(`[abandonedSignup] Sent 1h nudge to organizer ${organizerId} (${email})`);
    return true;
  } catch (err) {
    console.error(`[abandonedSignup] Failed 1h nudge for organizer ${organizerId}:`, err);
    return false;
  }
}

/**
 * Scanner — called by the daily outward-email cron.
 *
 * Finds organizers who:
 *   - registered between 1h and 24h ago, AND
 *   - have never published a sale (no PUBLISHED and no ENDED sale), AND
 *   - have not already received the 1-hour nudge (EmailAutomationLog).
 *
 * "Activation" = publishing a first sale. A DRAFT sale does NOT count as activated,
 * so an organizer who opened the create-sale form but never published still gets the
 * nudge. ENDED is included alongside PUBLISHED in the exclusion so an organizer whose
 * sale already ran-and-finished is never re-nudged.
 */
export async function sendAbandonedSignupNudges(): Promise<void> {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[abandonedSignup] Skipped — OUTREACH_ENABLED is not "true"');
    return;
  }
  const now = Date.now();
  const windowStart = new Date(now - MAX_AGE_MS); // registered no earlier than 24h ago
  const windowEnd = new Date(now - MIN_AGE_MS); // registered at least 1h ago

  const candidates = await prisma.organizer.findMany({
    where: {
      isClaimed: true, // exclude scraped organizers (never real signups)
      isUnmanagedListing: false, // exclude scraped/unmanaged organizers (never real signups)
      createdAt: { gte: windowStart, lte: windowEnd },
      // Never activated: no published or ended sale
      NOT: {
        sales: {
          some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null },
        },
      },
    },
    select: { id: true },
    take: 200, // safety cap per run
  });

  console.log(`[abandonedSignup] Found ${candidates.length} organizer(s) for 1h signup nudge`);

  let sent = 0;
  for (const o of candidates) {
    if (await sendAbandonedSignup1h(o.id)) sent++;
  }

  console.log(`[abandonedSignup] Sent ${sent} 1h signup nudge(s)`);
}
