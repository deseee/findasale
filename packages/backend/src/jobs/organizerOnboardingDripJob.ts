import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';
import {
  sendOnboardingEmail5a,
  sendOnboardingEmail5b,
  sendOnboardingEmail5c,
} from '../services/onboardingEmailService';

/**
 * organizerOnboardingDripJob.ts — Organizer onboarding drip (Email 5a/5b/5c)
 *
 * Backend becomes the canonical owner of the Day-0 / Day-2 / Day-7 organizer
 * onboarding sequence. Decision + rationale:
 * claude_docs/feature-notes/adr-dormant-email-functions-2026-09-06.md — MailerLite's
 * only automation is a disabled single-step stub that does not replicate the 3-touch
 * "no sale published yet" conditional design, so this cron calls the already-built
 * onboardingEmailService send functions directly instead of building that out.
 *
 * Idempotency: EmailAutomationLog (automationKey onboarding_5a / onboarding_5b /
 * onboarding_5c) — checked immediately before each send, logged immediately after,
 * so at-least-once/never-twice delivery holds even if the process restarts mid-run.
 *
 * Age windows are bounded on both ends (not just "older than N days") so a daily
 * cron never leaves a gap and never re-sends to someone who aged past the window --
 * same shape as abandonedSignupEmailService.ts's 1h-24h window for the signup nudge.
 *
 * "No sale yet" (5b/5c only) reuses the identical relation-filter shape already
 * used by abandonedSignupEmailService.ts: NOT sales.some(status in
 * [PUBLISHED, ENDED], deletedAt: null). 5a has no such condition -- it is the Day-0
 * welcome/first-step email and sends regardless of publish state.
 *
 * Runs: daily at 11:00 UTC (adjacent to outwardEmailAutomationsJob's 10:00 UTC daily
 * slot; distinct hour, no collision with any other registered cron -- see
 * jobs/*.ts cron.schedule grep, 2026-09-06).
 *
 * Gated by OUTREACH_ENABLED (bulkEmailGate.ts) like every other proactive
 * lifecycle/bulk email job on the Gmail rail.
 */

const KEY_5A = 'onboarding_5a';
const KEY_5B = 'onboarding_5b';
const KEY_5C = 'onboarding_5c';

// Day-0 window: registered 24-48h ago.
const DAY0_MIN_MS = 24 * 60 * 60 * 1000;
const DAY0_MAX_MS = 48 * 60 * 60 * 1000;

// Day-2 window: registered 48-72h ago.
const DAY2_MIN_MS = 48 * 60 * 60 * 1000;
const DAY2_MAX_MS = 72 * 60 * 60 * 1000;

// Day-7 window: registered 7-8 days ago.
const DAY7_MIN_MS = 7 * 24 * 60 * 60 * 1000;
const DAY7_MAX_MS = 8 * 24 * 60 * 60 * 1000;

function ageWindow(minMs: number, maxMs: number): { gte: Date; lte: Date } {
  const now = Date.now();
  return { gte: new Date(now - maxMs), lte: new Date(now - minMs) };
}

async function alreadyLogged(userId: string, automationKey: string): Promise<boolean> {
  const existing = await prisma.emailAutomationLog.findFirst({
    where: { userId, automationKey },
    select: { id: true },
  });
  return !!existing;
}

async function logSent(userId: string, automationKey: string): Promise<void> {
  await prisma.emailAutomationLog.create({ data: { userId, automationKey } });
}

/** First name from a full name, falling back to a friendly default. */
function firstNameOf(name: string | null | undefined): string {
  if (!name) return 'there';
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

type OrganizerCandidate = {
  id: string;
  userId: string;
  user: { email: string; name: string } | null;
};

/**
 * Day-0 pass: organizers who signed up 24-48h ago, no 5a logged yet. No
 * "has a published sale" condition -- 5a is the welcome/first-step email, not a
 * no-sale-yet nudge.
 */
async function runDay0(): Promise<number> {
  const candidates: OrganizerCandidate[] = await prisma.organizer.findMany({
    where: {
      isClaimed: true, // exclude scraped organizers (never real signups)
      isUnmanagedListing: false, // exclude scraped/unmanaged organizers (never real signups)
      createdAt: ageWindow(DAY0_MIN_MS, DAY0_MAX_MS),
    },
    select: { id: true, userId: true, user: { select: { email: true, name: true } } },
    take: 500, // safety cap per run
  });

  let sent = 0;
  for (const org of candidates) {
    try {
      if (!org.user?.email) continue;
      if (await alreadyLogged(org.userId, KEY_5A)) continue;
      await sendOnboardingEmail5a({
        email: org.user.email,
        firstName: firstNameOf(org.user.name),
        userId: org.userId,
      });
      await logSent(org.userId, KEY_5A);
      sent++;
    } catch (err) {
      console.error(`[organizerOnboardingDrip] 5a failed for organizer ${org.id}:`, err);
    }
  }
  return sent;
}

/**
 * Shared Day-2 / Day-7 pass: same age-window + "no published sale yet" shape,
 * parameterized by window, automationKey and which send function to call.
 */
async function runNoSalePass(
  minMs: number,
  maxMs: number,
  automationKey: string,
  send: (organizer: { email: string; firstName?: string; userId: string }) => Promise<void>,
  label: string
): Promise<number> {
  const candidates: OrganizerCandidate[] = await prisma.organizer.findMany({
    where: {
      isClaimed: true,
      isUnmanagedListing: false,
      createdAt: ageWindow(minMs, maxMs),
      // Never activated: no published or ended sale (identical shape to
      // abandonedSignupEmailService.ts's sendAbandonedSignupNudges query).
      NOT: {
        sales: {
          some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null },
        },
      },
    },
    select: { id: true, userId: true, user: { select: { email: true, name: true } } },
    take: 500,
  });

  let sent = 0;
  for (const org of candidates) {
    try {
      if (!org.user?.email) continue;
      if (await alreadyLogged(org.userId, automationKey)) continue;
      await send({
        email: org.user.email,
        firstName: firstNameOf(org.user.name),
        userId: org.userId,
      });
      await logSent(org.userId, automationKey);
      sent++;
    } catch (err) {
      console.error(`[organizerOnboardingDrip] ${label} failed for organizer ${org.id}:`, err);
    }
  }
  return sent;
}

/** Core job logic -- exported so it can also be added to internalJobRunnerController's JOB_MAP. */
export async function runOrganizerOnboardingDrip(): Promise<void> {
  if (!bulkEmailEnabled()) {
    console.log('[organizerOnboardingDrip] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)');
    return;
  }

  const sent5a = await runDay0();
  const sent5b = await runNoSalePass(DAY2_MIN_MS, DAY2_MAX_MS, KEY_5B, sendOnboardingEmail5b, '5b');
  const sent5c = await runNoSalePass(DAY7_MIN_MS, DAY7_MAX_MS, KEY_5C, sendOnboardingEmail5c, '5c');

  console.log(`[organizerOnboardingDrip] Run complete — 5a: ${sent5a}, 5b: ${sent5b}, 5c: ${sent5c}`);
}

// Daily at 11:00 UTC — adjacent to, but distinct from, outwardEmailAutomationsJob's 10:00 UTC slot.
cron.schedule('0 11 * * *', cronGuard({ jobName: 'organizerOnboardingDrip' }, runOrganizerOnboardingDrip));
