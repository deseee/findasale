import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';
import {
  sendOnboardingEmail5a,
  sendOnboardingEmail5b,
  sendOnboardingEmail5c,
  sendEmptySaleNudge,
  sendDraftReadyNudge,
} from '../services/onboardingEmailService';
import { Prisma } from '@prisma/client';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

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
 *
 * Activation nudges (added 2026-10-12, claude_docs/audits/activation-empty-sale-root-cause-2026-10-12.md).
 * 5b/5c stop once any sale is published, even an empty one, so two one-time nudges cover
 * the gap between "published" and "published with items":
 * - Empty sale: a PUBLISHED sale with zero shopper-visible items (PUBLIC_ITEM_FILTER,
 *   helpers/itemQueries.ts), from an organizer with no published/ended sale that HAS
 *   visible items. One email, CTA /organizer/add-items/<saleId>.
 * - Draft ready: a DRAFT sale that has items, from an organizer who has never published
 *   (same NOT-sales shape as 5b/5c). One email, CTA /organizer/edit-sale/<saleId>?publish=1.
 * Dedupe: the same EmailAutomationLog table, keyed per SALE by putting the sale id in
 * automationKey ("onboarding_empty_sale:<saleId>" / "onboarding_draft_ready:<saleId>").
 * automationKey is a free-form String (schema.prisma model EmailAutomationLog), so no
 * schema change is needed.
 * No backfill burst: only sales whose qualifying state began 24h-14d ago (publishedAt for
 * the empty-sale nudge, Sale.createdAt for the draft nudge) and whose endDate has not
 * passed. Sales older than that are never mailed, so deploying this does not mail old
 * accounts in a batch. At most one email per organizer per run across the whole job.
 * Suppression/unsubscribe: each send function checks suppressionService.isSuppressed and
 * carries a per-user unsubscribe link, exactly like 5a/5b/5c.
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

// Activation nudges: per-sale keys, qualifying state 24h-14d old.
export const KEY_EMPTY_SALE_PREFIX = 'onboarding_empty_sale:';
export const KEY_DRAFT_READY_PREFIX = 'onboarding_draft_ready:';
const NUDGE_MIN_MS = 24 * 60 * 60 * 1000;
const NUDGE_MAX_MS = 14 * 24 * 60 * 60 * 1000;

// Real (non-scraped) organizers only, same as the 5a/5b/5c passes.
const REAL_ORGANIZER = { isClaimed: true, isUnmanagedListing: false };

// Items an organizer has added to a draft sale (any draftStatus): active, not deleted,
// and not a POS-minted consignor price tag (PUBLIC_ITEM_FILTER also excludes those).
const DRAFT_SALE_ITEM_FILTER: Prisma.ItemWhereInput = {
  isActive: true,
  deletedAt: null,
  listingType: { not: 'CONSIGNOR_TAG' },
};

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
async function runDay0(mailed: Set<string> = new Set()): Promise<number> {
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
      mailed.add(org.userId);
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
  label: string,
  mailed: Set<string> = new Set()
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
      mailed.add(org.userId);
      sent++;
    } catch (err) {
      console.error(`[organizerOnboardingDrip] ${label} failed for organizer ${org.id}:`, err);
    }
  }
  return sent;
}

type SaleNudgeCandidate = {
  id: string;
  title: string;
  organizer: { id: string; userId: string; user: { email: string; name: string } | null };
};

const SALE_NUDGE_SELECT = {
  id: true,
  title: true,
  organizer: { select: { id: true, userId: true, user: { select: { email: true, name: true } } } },
};

/**
 * Empty-sale nudge: a PUBLISHED sale, published 24h-14d ago and not yet over, with zero
 * shopper-visible items (PUBLIC_ITEM_FILTER), from an organizer none of whose
 * published/ended sales has a shopper-visible item. One email per sale, ever.
 */
export async function runEmptySaleNudge(mailed: Set<string> = new Set()): Promise<number> {
  const candidates: SaleNudgeCandidate[] = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      publishedAt: ageWindow(NUDGE_MIN_MS, NUDGE_MAX_MS),
      endDate: { gte: new Date() },
      items: { none: PUBLIC_ITEM_FILTER },
      organizer: {
        ...REAL_ORGANIZER,
        NOT: {
          sales: {
            some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null, items: { some: PUBLIC_ITEM_FILTER } },
          },
        },
      },
    },
    select: SALE_NUDGE_SELECT,
    orderBy: { publishedAt: 'desc' },
    take: 500,
  });

  let sent = 0;
  for (const sale of candidates) {
    try {
      const org = sale.organizer;
      if (!org?.user?.email) continue;
      if (mailed.has(org.userId)) continue; // one email per organizer per run
      const key = `${KEY_EMPTY_SALE_PREFIX}${sale.id}`;
      if (await alreadyLogged(org.userId, key)) continue;
      await sendEmptySaleNudge({
        email: org.user.email,
        firstName: firstNameOf(org.user.name),
        userId: org.userId,
        saleId: sale.id,
        saleTitle: sale.title,
      });
      await logSent(org.userId, key);
      mailed.add(org.userId);
      sent++;
    } catch (err) {
      console.error(`[organizerOnboardingDrip] empty-sale nudge failed for sale ${sale.id}:`, err);
    }
  }
  return sent;
}

/**
 * Draft-ready nudge: a DRAFT sale, created 24h-14d ago and not yet over, that has items,
 * from an organizer who has never had a published or ended sale. One email per sale, ever.
 */
export async function runDraftReadyNudge(mailed: Set<string> = new Set()): Promise<number> {
  const candidates: Array<SaleNudgeCandidate & { _count: { items: number } }> = await prisma.sale.findMany({
    where: {
      status: 'DRAFT',
      deletedAt: null,
      createdAt: ageWindow(NUDGE_MIN_MS, NUDGE_MAX_MS),
      endDate: { gte: new Date() },
      items: { some: DRAFT_SALE_ITEM_FILTER },
      organizer: {
        ...REAL_ORGANIZER,
        NOT: {
          sales: { some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null } },
        },
      },
    },
    select: { ...SALE_NUDGE_SELECT, _count: { select: { items: { where: DRAFT_SALE_ITEM_FILTER } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  let sent = 0;
  for (const sale of candidates) {
    try {
      const org = sale.organizer;
      if (!org?.user?.email) continue;
      if (mailed.has(org.userId)) continue; // one email per organizer per run
      const key = `${KEY_DRAFT_READY_PREFIX}${sale.id}`;
      if (await alreadyLogged(org.userId, key)) continue;
      await sendDraftReadyNudge({
        email: org.user.email,
        firstName: firstNameOf(org.user.name),
        userId: org.userId,
        saleId: sale.id,
        saleTitle: sale.title,
        itemCount: sale._count?.items ?? 0,
      });
      await logSent(org.userId, key);
      mailed.add(org.userId);
      sent++;
    } catch (err) {
      console.error(`[organizerOnboardingDrip] draft-ready nudge failed for sale ${sale.id}:`, err);
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

  // Organizers mailed this run. The activation nudges skip anyone already mailed today;
  // their 14-day window means they are picked up on a later run instead.
  const mailed = new Set<string>();
  const sent5a = await runDay0(mailed);
  const sent5b = await runNoSalePass(DAY2_MIN_MS, DAY2_MAX_MS, KEY_5B, sendOnboardingEmail5b, '5b', mailed);
  const sent5c = await runNoSalePass(DAY7_MIN_MS, DAY7_MAX_MS, KEY_5C, sendOnboardingEmail5c, '5c', mailed);
  const sentEmpty = await runEmptySaleNudge(mailed);
  const sentDraft = await runDraftReadyNudge(mailed);

  console.log(
    `[organizerOnboardingDrip] Run complete: 5a: ${sent5a}, 5b: ${sent5b}, 5c: ${sent5c}, ` +
      `empty-sale: ${sentEmpty}, draft-ready: ${sentDraft}`
  );
}

// Daily at 11:00 UTC — adjacent to, but distinct from, outwardEmailAutomationsJob's 10:00 UTC slot.
cron.schedule('0 11 * * *', cronGuard({ jobName: 'organizerOnboardingDrip' }, runOrganizerOnboardingDrip));
