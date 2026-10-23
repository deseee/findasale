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
  sendStaleDatesNudge,
  NudgeOutcome,
} from '../services/onboardingEmailService';
import { suppressionService } from '../services/suppressionService';
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
 *
 * Activation nudges v2 (2026-10-23, claude_docs/operations/activation-funnel-2026-10-23.md). Three states,
 * each nudged at most ONCE per sale, by email on the transactional (Resend) rail plus the dashboard card
 * (frontend components/FirstSaleNudge.tsx reads the same states from GET /sales/mine):
 *   EMPTY_PUBLISHED   a published sale, not over yet, with zero shopper-visible items.
 *   DRAFT_UNPUBLISHED a draft sale, not over yet, that has items but was never published.
 *   STALE_DATES       a draft or published sale whose end date passed (24h+ ago) with nothing sold.
 *                     CTA: edit-sale ?redate=1, the one-click "pick new dates" prompt.
 * Who: real organizers (claimed, managed), not deleted, suspended or fraud-flagged, who are not yet
 * activated (no published or ended sale with a shopper-visible item), on sales made in the app (not
 * synced public listings, not inventory containers, not ongoing storefronts). Addresses at
 * @findasale.test, @system.finda.sale and @example.com are never emailed.
 * The old 24h-14d window is gone, so organizers who have been stuck for months get their one nudge.
 * Instead, rate limit: nobody gets more than ONE activation email per 7 days (any state, any sale, and
 * the pre-2026-10-23 per-sale nudge keys count too), plus at most one email per organizer per run.
 * A state still has to be at least 24h old (publishedAt / createdAt / endDate) before it is mailed.
 * Dedupe + admin log: EmailAutomationLog, automationKey "activation_nudge:<STATE>:<saleId>:<outcome>",
 * outcome "sent" or "suppressed" (opted out / bounced: logged so it is never retried). A failed send is
 * not logged and is retried the next day. The pre-2026-10-23 keys ("onboarding_empty_sale:<saleId>" /
 * "onboarding_draft_ready:<saleId>") still count as already nudged for their state.
 * Admin view: GET /api/admin/activation-nudges (controllers/adminActivationNudgesController.ts) lists the
 * log and a dry run of the next run's decisions. planActivationNudges() never sends anything.
 * Suppression/unsubscribe: suppressionService.isSuppressed (opt-out, bounces, complaints, blocked
 * domains) is checked before every send, and every email carries a per-user unsubscribe link and
 * RFC 8058 List-Unsubscribe headers.
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

// Pre-2026-10-23 activation nudge keys (per sale). Still honoured as "already nudged" for their state.
export const KEY_EMPTY_SALE_PREFIX = 'onboarding_empty_sale:';
export const KEY_DRAFT_READY_PREFIX = 'onboarding_draft_ready:';

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

// ─────────────────────────────────────────────────────────────────
// Activation nudges v2 (2026-10-23)
// ─────────────────────────────────────────────────────────────────

export type ActivationState = 'EMPTY_PUBLISHED' | 'DRAFT_UNPUBLISHED' | 'STALE_DATES';
export const ACTIVATION_KEY_PREFIX = 'activation_nudge:';
export const ACTIVATION_RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_MIN_AGE_MS = 24 * 60 * 60 * 1000;
/** Run order: closest to activation first. One email per organizer per run. */
const STATE_ORDER: ActivationState[] = ['DRAFT_UNPUBLISHED', 'EMPTY_PUBLISHED', 'STALE_DATES'];
/** Pre-2026-10-23 per-sale keys that already count as "nudged" for their state. */
const LEGACY_KEY_PREFIX: Partial<Record<ActivationState, string>> = {
  EMPTY_PUBLISHED: KEY_EMPTY_SALE_PREFIX,
  DRAFT_UNPUBLISHED: KEY_DRAFT_READY_PREFIX,
};

/** Domains that are never emailed: QA fixtures, scraper placeholders and reserved example addresses. */
export const NEVER_EMAIL_DOMAINS = ['findasale.test', 'system.finda.sale', 'example.com'];

export function isNeverEmailAddress(email: string | null | undefined): boolean {
  if (!email || !email.includes('@')) return true;
  const domain = email.trim().toLowerCase().split('@').pop() || '';
  return NEVER_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function activationKey(state: ActivationState, saleId: string, outcome: 'sent' | 'suppressed'): string {
  return `${ACTIVATION_KEY_PREFIX}${state}:${saleId}:${outcome}`;
}

/** Parses an activation (or legacy nudge) automationKey for the admin log. */
export function parseActivationKey(
  key: string
): { state: ActivationState; saleId: string; outcome: 'sent' | 'suppressed' } | null {
  if (key.startsWith(ACTIVATION_KEY_PREFIX)) {
    const [state, saleId, outcome] = key.slice(ACTIVATION_KEY_PREFIX.length).split(':');
    if (!state || !saleId || (outcome !== 'sent' && outcome !== 'suppressed')) return null;
    return { state: state as ActivationState, saleId, outcome };
  }
  if (key.startsWith(KEY_EMPTY_SALE_PREFIX)) return { state: 'EMPTY_PUBLISHED', saleId: key.slice(KEY_EMPTY_SALE_PREFIX.length), outcome: 'sent' };
  if (key.startsWith(KEY_DRAFT_READY_PREFIX)) return { state: 'DRAFT_UNPUBLISHED', saleId: key.slice(KEY_DRAFT_READY_PREFIX.length), outcome: 'sent' };
  return null;
}

/** EmailAutomationLog rows that count toward the 7-day activation email limit (real sends only). */
export const ACTIVATION_SENT_KEY_FILTER: Prisma.EmailAutomationLogWhereInput = {
  OR: [
    { automationKey: { startsWith: ACTIVATION_KEY_PREFIX, endsWith: ':sent' } },
    { automationKey: { startsWith: KEY_EMPTY_SALE_PREFIX } },
    { automationKey: { startsWith: KEY_DRAFT_READY_PREFIX } },
  ],
};

/** Every activation-nudge log row (sent or suppressed, new or legacy), for the admin log. */
export const ACTIVATION_ANY_KEY_FILTER: Prisma.EmailAutomationLogWhereInput = {
  OR: [
    { automationKey: { startsWith: ACTIVATION_KEY_PREFIX } },
    { automationKey: { startsWith: KEY_EMPTY_SALE_PREFIX } },
    { automationKey: { startsWith: KEY_DRAFT_READY_PREFIX } },
  ],
};

/** Real organizers who are not activated yet (no published/ended sale with a shopper-visible item). */
const NOT_YET_ACTIVATED_ORGANIZER: Prisma.OrganizerWhereInput = {
  ...REAL_ORGANIZER,
  user: { deletedAt: null, suspendedAt: null, fraudSuspect: false },
  NOT: {
    sales: {
      some: { status: { in: ['PUBLISHED', 'ENDED'] }, deletedAt: null, items: { some: PUBLIC_ITEM_FILTER } },
    },
  },
};

/** Sales the organizer made in the app (not synced public listings, inventory containers or storefronts). */
const IN_APP_SALE: Prisma.SaleWhereInput = {
  deletedAt: null,
  isInventoryContainer: false,
  isOngoing: false,
  saleType: { not: 'RETAIL' },
  sourceUrl: null,
  sourceName: null,
};

export function activationStateWhere(state: ActivationState, now: Date): Prisma.SaleWhereInput {
  const minAge = new Date(now.getTime() - STATE_MIN_AGE_MS);
  if (state === 'EMPTY_PUBLISHED') {
    return {
      ...IN_APP_SALE,
      status: 'PUBLISHED',
      endDate: { gte: now },
      items: { none: PUBLIC_ITEM_FILTER },
      OR: [{ publishedAt: { lte: minAge } }, { publishedAt: null, createdAt: { lte: minAge } }],
      organizer: NOT_YET_ACTIVATED_ORGANIZER,
    };
  }
  if (state === 'DRAFT_UNPUBLISHED') {
    return {
      ...IN_APP_SALE,
      status: 'DRAFT',
      endDate: { gte: now },
      createdAt: { lte: minAge },
      items: { some: DRAFT_SALE_ITEM_FILTER },
      organizer: NOT_YET_ACTIVATED_ORGANIZER,
    };
  }
  // STALE_DATES
  return {
    ...IN_APP_SALE,
    status: { in: ['DRAFT', 'PUBLISHED'] },
    endDate: { lt: minAge },
    items: { none: { status: 'SOLD' } },
    organizer: NOT_YET_ACTIVATED_ORGANIZER,
  };
}

export type ActivationCandidate = {
  state: ActivationState;
  saleId: string;
  saleTitle: string;
  saleStatus: string;
  endDate: Date | null;
  itemCount: number;
  organizerId: string;
  userId: string;
  email: string;
  name: string | null;
};

export type ActivationDecision = ActivationCandidate & {
  decision: 'send' | 'skip';
  reason:
    | 'will_send'
    | 'never_email_address'
    | 'already_nudged_this_state'
    | 'rate_limited_7d'
    | 'one_email_per_run'
    | 'suppressed';
};

async function findActivationCandidates(now: Date): Promise<ActivationCandidate[]> {
  const out: ActivationCandidate[] = [];
  for (const state of STATE_ORDER) {
    const sales = await prisma.sale.findMany({
      where: activationStateWhere(state, now),
      select: {
        id: true,
        title: true,
        status: true,
        endDate: true,
        organizer: { select: { id: true, userId: true, user: { select: { email: true, name: true } } } },
        _count: { select: { items: { where: DRAFT_SALE_ITEM_FILTER } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    for (const sale of sales as any[]) {
      if (!sale.organizer?.user?.email) continue;
      out.push({
        state,
        saleId: sale.id,
        saleTitle: sale.title,
        saleStatus: sale.status,
        endDate: sale.endDate ?? null,
        itemCount: sale._count?.items ?? 0,
        organizerId: sale.organizer.id,
        userId: sale.organizer.userId,
        email: sale.organizer.user.email,
        name: sale.organizer.user.name ?? null,
      });
    }
  }
  return out;
}

async function alreadyNudged(userId: string, state: ActivationState, saleId: string): Promise<boolean> {
  const or: Prisma.EmailAutomationLogWhereInput[] = [
    { automationKey: { startsWith: `${ACTIVATION_KEY_PREFIX}${state}:${saleId}:` } },
  ];
  const legacy = LEGACY_KEY_PREFIX[state];
  if (legacy) or.push({ automationKey: `${legacy}${saleId}` });
  const existing = await prisma.emailAutomationLog.findFirst({ where: { userId, OR: or }, select: { id: true } });
  return !!existing;
}

async function activationEmailedWithin(userId: string, sinceMs: number, now: Date): Promise<boolean> {
  const existing = await prisma.emailAutomationLog.findFirst({
    where: { userId, sentAt: { gte: new Date(now.getTime() - sinceMs) }, ...ACTIVATION_SENT_KEY_FILTER },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Decides, without sending anything, what the next run would do for every candidate sale.
 * runActivationNudges() sends exactly the 'send' decisions; the admin dry run shows all of them.
 */
export async function planActivationNudges(
  mailed: Set<string> = new Set(),
  now: Date = new Date()
): Promise<ActivationDecision[]> {
  const candidates = await findActivationCandidates(now);
  const planned = new Set(mailed);
  const decisions: ActivationDecision[] = [];
  for (const c of candidates) {
    let reason: ActivationDecision['reason'] = 'will_send';
    if (isNeverEmailAddress(c.email)) reason = 'never_email_address';
    else if (await alreadyNudged(c.userId, c.state, c.saleId)) reason = 'already_nudged_this_state';
    else if (planned.has(c.userId)) reason = 'one_email_per_run';
    else if (await activationEmailedWithin(c.userId, ACTIVATION_RATE_LIMIT_MS, now)) reason = 'rate_limited_7d';
    else if (await suppressionService.isSuppressed(c.email)) reason = 'suppressed';
    if (reason === 'will_send') planned.add(c.userId);
    decisions.push({ ...c, decision: reason === 'will_send' ? 'send' : 'skip', reason });
  }
  return decisions;
}

async function sendForState(c: ActivationCandidate): Promise<NudgeOutcome> {
  const base = {
    email: c.email,
    firstName: firstNameOf(c.name),
    userId: c.userId,
    saleId: c.saleId,
    saleTitle: c.saleTitle,
  };
  if (c.state === 'EMPTY_PUBLISHED') return sendEmptySaleNudge(base);
  if (c.state === 'DRAFT_UNPUBLISHED') return sendDraftReadyNudge({ ...base, itemCount: c.itemCount });
  return sendStaleDatesNudge({ ...base, itemCount: c.itemCount, saleStatus: c.saleStatus });
}

/** Sends the planned activation nudges. Returns counts by outcome. */
export async function runActivationNudges(
  mailed: Set<string> = new Set()
): Promise<{ sent: number; suppressed: number; failed: number; byState: Record<ActivationState, number> }> {
  const decisions = await planActivationNudges(mailed);
  const result = {
    sent: 0,
    suppressed: 0,
    failed: 0,
    byState: { EMPTY_PUBLISHED: 0, DRAFT_UNPUBLISHED: 0, STALE_DATES: 0 } as Record<ActivationState, number>,
  };
  for (const d of decisions) {
    try {
      if (d.reason === 'suppressed') {
        // Never retried: an opted-out or bounced address stays out of this state for this sale.
        await logSent(d.userId, activationKey(d.state, d.saleId, 'suppressed'));
        result.suppressed++;
        continue;
      }
      if (d.decision !== 'send') continue;
      if (mailed.has(d.userId)) continue;
      const outcome = await sendForState(d);
      if (outcome === 'failed') {
        result.failed++;
        continue;
      }
      await logSent(d.userId, activationKey(d.state, d.saleId, outcome));
      if (outcome === 'sent') {
        mailed.add(d.userId);
        result.sent++;
        result.byState[d.state]++;
      } else {
        result.suppressed++;
      }
    } catch (err) {
      result.failed++;
      console.error(`[organizerOnboardingDrip] activation nudge ${d.state} failed for sale ${d.saleId}:`, err);
    }
  }
  return result;
}

/** Core job logic -- exported so it can also be added to internalJobRunnerController's JOB_MAP. */
export async function runOrganizerOnboardingDrip(): Promise<void> {
  if (!bulkEmailEnabled()) {
    console.log('[organizerOnboardingDrip] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)');
    return;
  }

  // Organizers mailed this run. The activation nudges skip anyone already mailed today and pick
  // them up on a later run (their state has no upper age limit any more).
  const mailed = new Set<string>();
  const sent5a = await runDay0(mailed);
  const sent5b = await runNoSalePass(DAY2_MIN_MS, DAY2_MAX_MS, KEY_5B, sendOnboardingEmail5b, '5b', mailed);
  const sent5c = await runNoSalePass(DAY7_MIN_MS, DAY7_MAX_MS, KEY_5C, sendOnboardingEmail5c, '5c', mailed);
  const activation = await runActivationNudges(mailed);

  console.log(
    `[organizerOnboardingDrip] Run complete: 5a: ${sent5a}, 5b: ${sent5b}, 5c: ${sent5c}, ` +
      `activation sent: ${activation.sent} (empty-published ${activation.byState.EMPTY_PUBLISHED}, ` +
      `draft-unpublished ${activation.byState.DRAFT_UNPUBLISHED}, stale-dates ${activation.byState.STALE_DATES}), ` +
      `suppressed: ${activation.suppressed}, failed: ${activation.failed}`
  );
}

// Daily at 11:00 UTC — adjacent to, but distinct from, outwardEmailAutomationsJob's 10:00 UTC slot.
cron.schedule('0 11 * * *', cronGuard({ jobName: 'organizerOnboardingDrip' }, runOrganizerOnboardingDrip));
