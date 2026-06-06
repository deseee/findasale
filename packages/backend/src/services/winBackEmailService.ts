/**
 * Lapsed-Organizer Win-Back Email Service — Outward Email Automation #4
 *
 * Re-engages organizers who have gone quiet: their most recent sale ENDED
 * >=45 days ago AND they have no currently PUBLISHED/active sale. The email
 * leans on a "your shoppers miss you" hook, surfaces what's happening in the
 * organizer's home metro when that signal is cheaply available (a count of
 * active sales nearby), and otherwise falls back to a strong "list your next
 * sale" nudge. Tone mirrors the existing organizer onboarding nudges so a
 * lapsed organizer feels the same voice that welcomed them.
 *
 * Reuses the FindA.Sale email design system (emailTemplateService) and the
 * SES/Gmail send rail (lib/emailService). Respects suppressionService.
 *
 * Throttle / idempotency: at most one win-back per organizer per 45 days,
 * enforced via the generic EmailAutomationLog (automationKey "win_back").
 * No schema changes — no new timestamp columns.
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
  EMAIL_TOKENS as T,
} from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@send.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

const WIN_BACK_KEY = 'win_back';
const IDLE_DAYS = 45;
const THROTTLE_DAYS = 45;

/** Returns true if this organizer has been sent a win-back within the throttle window. */
async function isThrottled(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - THROTTLE_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.emailAutomationLog.findFirst({
    where: { userId, automationKey: WIN_BACK_KEY, sentAt: { gte: since } },
    select: { id: true },
  });
  return !!recent;
}

async function logSent(userId: string): Promise<void> {
  await prisma.emailAutomationLog.create({
    data: { userId, automationKey: WIN_BACK_KEY },
  });
}

/**
 * Cheap "what's trending in your metro" signal: how many sales are currently
 * PUBLISHED (active) in the organizer's home city/state. Pulled from the city/state
 * on their most recent sale — no extra service, one indexed count query.
 * Returns null when the count is 0 or the location is unknown so we fall back to
 * the generic nudge instead of showing an empty/zero stat.
 */
async function getMetroActivity(
  city: string | null,
  state: string | null,
  excludeOrganizerId: string
): Promise<{ city: string; activeNearby: number } | null> {
  if (!city || !state) return null;
  const activeNearby = await prisma.sale.count({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      city,
      state,
      organizerId: { not: excludeOrganizerId },
    },
  });
  if (activeNearby <= 0) return null;
  return { city, activeNearby };
}

function buildWinBackHtml(opts: {
  businessName: string;
  metro: { city: string; activeNearby: number } | null;
  newSaleUrl: string;
  unsubUrl: string;
}): string {
  const { businessName, metro, newSaleUrl, unsubUrl } = opts;

  // Metro module — only rendered when there's real nearby activity to report.
  const metroModule = metro
    ? buildTextBlockModule({
        headline: `Shoppers are still browsing in ${metro.city}`,
        body: `Right now there ${metro.activeNearby === 1 ? 'is' : 'are'} <strong>${metro.activeNearby.toLocaleString()}</strong> active sale${metro.activeNearby === 1 ? '' : 's'} near you on FindA.Sale &mdash; and the people who saved ${businessName} are still looking. Posting your next sale puts you back in front of them.`,
      })
    : buildTextBlockModule({
        headline: 'Your shoppers are still here',
        body: `The people who favorited ${businessName} haven&rsquo;t gone anywhere. The moment you post your next sale, it shows up on the map and in the discovery feed for shoppers in your area &mdash; no new following required.`,
      });

  const content = `
    ${buildHero({
      eyebrow: 'We miss you',
      title: `Your shoppers miss you, ${businessName}.`,
      sub: `It&rsquo;s been a little while since your last sale wrapped up. Whenever you&rsquo;re ready, picking back up takes only a few minutes.`,
    })}
    ${buildSpacer(8)}
    ${metroModule}
    ${buildTextBlockModule({
      body: `Reuse the details and items from a past sale to get a new one live fast &mdash; nothing has to be built from scratch.`,
    })}
    ${buildSpacer(8)}
    ${buildCTARow('List your next sale →', newSaleUrl, `Start from a past sale or a blank slate &mdash; your call.`)}
  `;

  return baseWrapper({
    preheader: metro
      ? `${metro.activeNearby} active sales near you — your shoppers are still browsing.`
      : `Your shoppers are still here. Ready to list your next sale?`,
    content,
    unsubLabel: 'Manage email preferences',
    unsubUrl,
  });
}

/**
 * Send the win-back email to a single organizer.
 * Caller (scanner) is responsible for the idle + no-active-sale gating; this
 * function re-checks suppression + throttle and stamps EmailAutomationLog.
 * Returns true if an email was sent.
 */
export async function sendOrganizerWinBack(organizerId: string): Promise<boolean> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      id: true,
      businessName: true,
      user: { select: { id: true, email: true } },
      sales: {
        where: { deletedAt: null },
        orderBy: { endDate: 'desc' },
        take: 1,
        select: { city: true, state: true },
      },
    },
  });

  if (!organizer) return false;

  const email = organizer.user?.email;
  const userId = organizer.user?.id;
  if (!email || !userId) return false;

  if (await suppressionService.isSuppressed(email)) {
    // Stamp so we don't keep re-evaluating a suppressed organizer every run.
    await logSent(userId);
    console.log(`[winBack] Skipped suppressed organizer ${email} (${organizerId})`);
    return false;
  }
  if (await isThrottled(userId)) {
    return false;
  }

  const lastSale = organizer.sales[0];
  const metro = await getMetroActivity(
    lastSale?.city ?? null,
    lastSale?.state ?? null,
    organizer.id
  );

  const html = buildWinBackHtml({
    businessName: organizer.businessName || 'your business',
    metro,
    newSaleUrl: `${FRONTEND_URL}/organizer/sales/new`,
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your shoppers miss you`,
      html,
      jobName: 'organizerWinBack',
    });
    await logSent(userId);
    console.log(`[winBack] Sent win-back to organizer ${organizerId} (${email})`);
    return true;
  } catch (err) {
    console.error(`[winBack] Failed win-back for organizer ${organizerId}:`, err);
    return false;
  }
}

/**
 * Scanner — called by the daily outward-email cron.
 *
 * Finds organizers who are LAPSED:
 *   - they have at least one sale that ENDED >=45 days ago, AND
 *   - they have NO currently PUBLISHED (active) sale, AND
 *   - their most recent sale of ANY status ended >=45 days ago (so an organizer
 *     mid-setup with a DRAFT isn't treated as lapsed prematurely).
 *
 * Per-organizer suppression + 45-day throttle are enforced in sendOrganizerWinBack,
 * so a re-run the next day will not re-send.
 */
export async function sendOrganizerWinBacks(): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_DAYS * 24 * 60 * 60 * 1000);

  // Candidate set: organizers with >=1 ENDED sale older than the cutoff, and no
  // PUBLISHED sale at all. We pull the candidate organizer ids, then per-organizer
  // confirm their MOST RECENT sale (any status) ended before the cutoff.
  const candidates = await prisma.organizer.findMany({
    where: {
      // Has at least one sale that ended before the cutoff
      sales: {
        some: { status: 'ENDED', deletedAt: null, endDate: { lt: cutoff } },
      },
      // Has no currently-active (PUBLISHED) sale
      NOT: {
        sales: { some: { status: 'PUBLISHED', deletedAt: null } },
      },
    },
    select: {
      id: true,
      sales: {
        where: { deletedAt: null },
        orderBy: { endDate: 'desc' },
        take: 1,
        select: { endDate: true, status: true },
      },
    },
    take: 200, // safety cap per run
  });

  // Confirm the most recent sale ended before the cutoff (excludes organizers whose
  // newest sale is an UPCOMING/PUBLISHED-but-future or recently-ended one).
  const lapsed = candidates.filter((o) => {
    const newest = o.sales[0];
    return newest && newest.endDate && newest.endDate < cutoff;
  });

  console.log(`[winBack] Found ${lapsed.length} lapsed organizer(s) eligible for win-back`);

  let sent = 0;
  for (const o of lapsed) {
    if (await sendOrganizerWinBack(o.id)) sent++;
  }

  console.log(`[winBack] Sent ${sent} win-back email(s)`);
}
