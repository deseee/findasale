import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import { recordVisit, getStreak } from '../services/streakService';
import { prisma } from '../lib/prisma';
import { publicMemberLabel } from '../utils/publicDisplayName';
import { createNotification } from '../lib/notificationService';
import {
  HUNT_PASS_PRICE_CENTS,
  BILLING_INTERVAL_DAYS,
  createPlatformBillingCard,
  chargeStoredCard,
} from '../services/squareBillingService';

const router = Router();

/** Long US date in UTC, e.g. "October 28, 2026" (server locale must never leak into copy). */
const formatLongDate = (d: Date): string =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** ISO week string "2026-W12", same convention as services/streakService.ts. */
const isoWeek = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

const startOfTodayUtc = (): Date => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Record one day of a daily streak (UserStreak, type 'save' | 'buy'). Same-day repeats are
 * no-ops; a gap of more than one day restarts the streak at 1.
 */
async function recordDailyStreak(userId: string, type: 'save' | 'buy') {
  const today = startOfTodayUtc();
  const existing = await prisma.userStreak.findUnique({ where: { userId_type: { userId, type } } });
  if (!existing) {
    const created = await prisma.userStreak.create({
      data: { userId, type, currentStreak: 1, longestStreak: 1, lastActivityDate: today },
    });
    return { current: created.currentStreak, longest: created.longestStreak, alreadyRecordedToday: false };
  }
  const last = existing.lastActivityDate ? new Date(existing.lastActivityDate) : null;
  if (last) last.setUTCHours(0, 0, 0, 0);
  if (last && last.getTime() === today.getTime()) {
    return { current: existing.currentStreak, longest: existing.longestStreak, alreadyRecordedToday: true };
  }
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const consecutive = !!last && last.getTime() === yesterday.getTime();
  const nextCurrent = consecutive ? existing.currentStreak + 1 : 1;
  const updated = await prisma.userStreak.update({
    where: { userId_type: { userId, type } },
    data: {
      currentStreak: nextCurrent,
      longestStreak: Math.max(existing.longestStreak, nextCurrent),
      lastActivityDate: today,
    },
  });
  return { current: updated.currentStreak, longest: updated.longestStreak, alreadyRecordedToday: false };
}

/**
 * GET /api/streaks/profile
 * Returns the authenticated user's streak profile: current streaks, longest streaks, points, hunt pass status.
 */
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    // Fetch user data including streakPoints and hunt pass info
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        streakPoints: true,
        guildXp: true,
        visitStreak: true,
        huntPassActive: true,
        huntPassExpiry: true,
        huntPassStripeSubscriptionId: true,
        huntPassBillingProcessor: true,
        huntPassCancelAtPeriodEnd: true,
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Get streak data (weekly visit streak) plus the daily save/buy streaks
    const streakData = await getStreak(req.user.id);
    const dailyRows = await prisma.userStreak.findMany({
      where: { userId: req.user.id, type: { in: ['save', 'buy'] } },
      select: { type: true, currentStreak: true, longestStreak: true, lastActivityDate: true },
    });

    res.json({
      userId: user.id,
      name: user.name,
      streakPoints: user.streakPoints,
      guildXp: user.guildXp,
      visitStreak: user.visitStreak || streakData.currentStreak,
      huntPassActive: user.huntPassActive,
      huntPassExpiry: user.huntPassExpiry ? user.huntPassExpiry.toISOString() : null,
      huntPassSubscriptionId: user.huntPassStripeSubscriptionId,
      // Cancel state (2026-09-29): true = cancel is scheduled, access continues until huntPassExpiry
      huntPassCancelAtPeriodEnd: !!user.huntPassCancelAtPeriodEnd,
      huntPassBillingProcessor: user.huntPassBillingProcessor,
      streaks: streakData,
      dailyStreaks: dailyRows.reduce((acc: Record<string, { current: number; longest: number }>, r) => {
        acc[r.type] = { current: r.currentStreak, longest: r.longestStreak };
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error('GET /api/streaks/profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/visit
 * Records a visit streak activity. Idempotent (once per day).
 */
router.post('/visit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    await recordVisit(req.user.id);
    const streak = await getStreak(req.user.id);
    res.json({ streak, message: 'Visit recorded!' });
  } catch (err) {
    console.error('POST /api/streaks/visit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/save
 * Records today's save (favorite) activity toward the daily save streak (UserStreak type 'save').
 * Server-validated: only counts if the shopper actually saved an item or sale today, so a client
 * cannot inflate a streak by calling this route. Idempotent within a day.
 * (2026-09-29: previously returned a fake "Save recorded!" without recording anything.)
 */
router.post('/save', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const savedToday = await prisma.favorite.findFirst({
      where: { userId: req.user.id, createdAt: { gte: startOfTodayUtc() } },
      select: { id: true },
    });
    if (!savedToday) {
      return res.json({ recorded: false, reason: 'NO_SAVE_TODAY', message: 'No saved item found for today, so nothing was recorded.' });
    }

    const result = await recordDailyStreak(req.user.id, 'save');
    res.json({
      recorded: !result.alreadyRecordedToday,
      alreadyRecordedToday: result.alreadyRecordedToday,
      streak: { current: result.current, longest: result.longest },
      message: result.alreadyRecordedToday ? 'Already counted today.' : 'Save streak updated.',
    });
  } catch (err) {
    console.error('POST /api/streaks/save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/purchase
 * Records today's purchase activity toward the daily buy streak (UserStreak type 'buy').
 * Server-validated against a real paid purchase today (test transactions excluded). Idempotent
 * within a day. (2026-09-29: previously returned a fake "Purchase recorded!".)
 */
router.post('/purchase', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const boughtToday = await prisma.purchase.findFirst({
      where: {
        userId: req.user.id,
        status: { in: ['PAID', 'COMPLETED'] },
        isTestTransaction: false,
        createdAt: { gte: startOfTodayUtc() },
      },
      select: { id: true },
    });
    if (!boughtToday) {
      return res.json({ recorded: false, reason: 'NO_PURCHASE_TODAY', message: 'No completed purchase found for today, so nothing was recorded.' });
    }

    const result = await recordDailyStreak(req.user.id, 'buy');
    res.json({
      recorded: !result.alreadyRecordedToday,
      alreadyRecordedToday: result.alreadyRecordedToday,
      streak: { current: result.current, longest: result.longest },
      message: result.alreadyRecordedToday ? 'Already counted today.' : 'Buy streak updated.',
    });
  } catch (err) {
    console.error('POST /api/streaks/purchase error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/streaks/leaderboard
 * Public endpoint: top shoppers by live weekend-visit streak (VisitStreak, the data the visit
 * route records). "Live" = last visit was this ISO week or last week, so a streak that quietly
 * lapsed months ago is not shown as current. Names are first name + last initial only.
 * Honest empty state: when no shopper has a live streak the response is
 * { leaderboard: [], empty: true } and never a fabricated row.
 * (2026-09-29: previously always returned an empty list with no explanation.)
 */
router.get('/leaderboard', async (_req, res: Response) => {
  try {
    const now = new Date();
    const thisWeek = isoWeek(now);
    const lastWeek = isoWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

    const rows = await prisma.visitStreak.findMany({
      where: {
        currentStreak: { gt: 0 },
        lastVisitWeek: { in: [thisWeek, lastWeek] },
        user: { fraudSuspect: false },
      },
      orderBy: [{ currentStreak: 'desc' }, { longestStreak: 'desc' }],
      take: 50,
      select: {
        currentStreak: true,
        longestStreak: true,
        user: { select: { name: true, explorerRank: true, huntPassActive: true, notificationPrefs: true } },
      },
    });

    // One shared public-name policy (opt-in gate + no email addresses): utils/publicDisplayName.publicMemberLabel.
    const shortName = (full: string | null | undefined, prefs: unknown): string => publicMemberLabel(full, prefs);

    const leaderboard = rows.map((r, index) => ({
      position: index + 1,
      displayName: shortName(r.user?.name, (r.user as any)?.notificationPrefs),
      currentStreak: r.currentStreak,
      longestStreak: r.longestStreak,
      explorerRank: r.user?.explorerRank ?? null,
      huntPassActive: !!r.user?.huntPassActive,
    }));

    res.json({
      leaderboard,
      empty: leaderboard.length === 0,
      metric: 'weekend_visit_streak',
      unit: 'weeks',
      week: thisWeek,
    });
  } catch (err) {
    console.error('GET /api/streaks/leaderboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/subscribe-huntpass
 * Body: { sourceId: string }
 *
 * Square Plan B (2026-09-13, replaces the dead Stripe Checkout flow -- see
 * squareBillingService.ts header + claude_docs/feature-notes/square-changeover-remaining-
 * work-scoping-2026-09-09.md Section 2): tokenizes a card (Square Web Payments SDK
 * sourceId) into a Card-on-file in FindA.Sale's platform Square account, charges it
 * immediately (no trial for Hunt Pass -- a $4.99 impulse add-on, not a SaaS tier
 * commitment; default assumption, flagged in the dispatch report), and activates Hunt Pass
 * for 30 days. Renewal is handled by jobs/squareBillingChargeJob.ts's daily scheduler, not
 * a webhook -- there is no processor-pushed subscription event in Plan B.
 *
 * AUTHZ/OWNERSHIP: operates only on req.user.id -- no target userId is ever accepted from
 * the request body, so a caller can only ever buy Hunt Pass for themselves (ACTOR=TARGET).
 * NO MASS ASSIGNMENT: the charge amount is always HUNT_PASS_PRICE_CENTS, never taken from
 * request input.
 */
router.post('/subscribe-huntpass', authenticate, paymentLimiter, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  // Tracks whether this request won the atomic claim below (huntPassActive false -> true) --
  // used at every early-exit past that point to revert the claim instead of leaving the
  // account stuck "active" with no card/charge behind it.
  let claimed = false;
  try {
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const { sourceId } = req.body as { sourceId?: unknown };
    if (typeof sourceId !== 'string' || !sourceId) {
      return res.status(400).json({ message: 'sourceId (Square card token) is required' });
    }

    // Hacker-pass fix (2026-09-13): the original read-then-write ("if huntPassActive, 400;
    // else charge+activate") had a TOCTOU race -- two concurrent submits (double-click, or a
    // deliberate replay) could both pass the read before either write landed, charging the
    // card twice for one Hunt Pass. This atomic updateMany is the check AND the claim in one
    // statement: only the request that flips huntPassActive false->true (count===1) proceeds
    // to charge; a loser (count===0) is told the pass is already active, exactly as before,
    // but now race-safe. Every early-return after this point MUST revert the claim (see
    // `claimed` reverts below) so a failed card/charge never leaves the account permanently
    // stuck "active" with no billing behind it.
    const claim = await prisma.user.updateMany({
      where: { id: userId, huntPassActive: false },
      data: { huntPassActive: true },
    });
    if (claim.count !== 1) {
      return res.status(400).json({ message: 'Hunt Pass is already active on this account.' });
    }
    claimed = true;

    let squareCustomerId: string;
    let squareCardId: string;
    try {
      const card = await createPlatformBillingCard({
        referenceId: userId,
        sourceId,
        note: `FindA.Sale Hunt Pass billing -- user ${userId}`,
      });
      squareCustomerId = card.customerId;
      squareCardId = card.cardId;
    } catch (err) {
      console.error('[streaks] subscribe-huntpass card tokenize error:', err);
      await prisma.user.update({ where: { id: userId }, data: { huntPassActive: false } });
      return res.status(400).json({ message: 'Could not save that card. Please check the details and try again.' });
    }

    const chargeResult = await chargeStoredCard({
      customerId: squareCustomerId,
      cardId: squareCardId,
      amountCents: HUNT_PASS_PRICE_CENTS,
      idempotencyParts: ['huntpass-signup', userId, sourceId],
      note: 'FindA.Sale Hunt Pass subscription -- first charge',
      referenceId: userId,
    });

    if (!chargeResult.ok) {
      await prisma.user.update({ where: { id: userId }, data: { huntPassActive: false } });
      return res.status(400).json({ message: `Your card was declined: ${chargeResult.message}` });
    }

    const expiresAt = new Date(Date.now() + BILLING_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: userId },
      data: {
        huntPassExpiry: expiresAt,
        huntPassBillingProcessor: 'square',
        huntPassSquareCustomerId: squareCustomerId,
        huntPassSquareCardId: squareCardId,
        huntPassCancelledAt: null,
        huntPassCancelAtPeriodEnd: false,
        huntPassDunningFailCount: 0,
        huntPassNextRetryAt: null,
        huntPassGraceEndsAt: null,
        huntPassLastFailureReason: null,
      },
    });

    res.json({
      huntPassActive: true,
      huntPassExpiry: expiresAt.toISOString(),
      message: 'Hunt Pass activated!',
    });
  } catch (err) {
    console.error('POST /api/streaks/subscribe-huntpass error:', err);
    if (claimed && userId) {
      await prisma.user.update({ where: { id: userId }, data: { huntPassActive: false } }).catch(() => {});
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/cancel-huntpass
 * Self-serve cancel-at-period-end (FTC click-to-cancel: as easy as sign-up, in-app, one confirm).
 * Access continues until huntPassExpiry (the end of the period already paid for); the renewal
 * job (jobs/squareBillingChargeJob.ts) deactivates the pass at expiry instead of charging again.
 * Idempotent: a repeat call returns the same scheduled-cancel state with alreadyCancelled: true.
 * Sends an in-app + email confirmation the first time. No billing amounts are touched and no
 * charge or refund is made here. Scoped to req.user.id only (no target user accepted from input).
 * Undo: POST /api/streaks/resume-huntpass.
 */
router.post('/cancel-huntpass', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        huntPassStripeSubscriptionId: true,
        huntPassBillingProcessor: true,
        huntPassActive: true,
        huntPassExpiry: true,
        huntPassCancelAtPeriodEnd: true,
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const respond = (alreadyCancelled: boolean, expiresAtDate: Date | null) => {
      const expiresAt = expiresAtDate ? expiresAtDate.toISOString() : null;
      return res.json({
        cancelAtPeriodEnd: true,
        alreadyCancelled,
        expiresAt,
        message: expiresAtDate
          ? `Your Hunt Pass is canceled and will not renew. You keep every Hunt Pass perk until ${formatLongDate(expiresAtDate)}.`
          : 'Your Hunt Pass is canceled and will not renew.',
      });
    };

    const sendConfirmation = (expiresAtDate: Date | null) => {
      createNotification({
        userId: req.user!.id,
        type: 'huntpass_cancel_scheduled',
        title: 'Your Hunt Pass is canceled',
        body: expiresAtDate
          ? `Your Hunt Pass will not renew and you will not be charged again. You keep your Hunt Pass perks until ${formatLongDate(expiresAtDate)}. Changed your mind? You can keep it any time before then from the Hunt Pass page.`
          : 'Your Hunt Pass will not renew and you will not be charged again. Changed your mind? You can keep it any time from the Hunt Pass page.',
        link: '/shopper/hunt-pass',
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch((err: unknown) => console.error('[streaks] cancel-huntpass confirmation failed:', err));
    };

    // Square Plan B (2026-09-13): cancel-at-period-end semantics -- there is no processor
    // subscription object to update, just flip the flag jobs/squareBillingChargeJob.ts checks at
    // the next renewal instead of charging again.
    if (user.huntPassBillingProcessor === 'square') {
      if (!user.huntPassActive) {
        return res.status(400).json({ message: 'No active Hunt Pass subscription found.' });
      }
      // Atomic claim so two concurrent cancels send one confirmation.
      const claim = await prisma.user.updateMany({
        where: { id: req.user.id, huntPassActive: true, huntPassCancelAtPeriodEnd: false },
        data: { huntPassCancelAtPeriodEnd: true },
      });
      if (claim.count === 1) sendConfirmation(user.huntPassExpiry);
      return respond(claim.count !== 1, user.huntPassExpiry);
    }

    if (!user.huntPassStripeSubscriptionId) {
      return res.status(400).json({ message: 'No active Hunt Pass subscription found.' });
    }

    if (user.huntPassCancelAtPeriodEnd) {
      return respond(true, user.huntPassExpiry);
    }

    const { getStripe } = await import('../utils/stripe');
    const stripe = getStripe();

    const updated = await stripe.subscriptions.update(user.huntPassStripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const expiresAtDate = new Date(updated.current_period_end * 1000);
    // Mirror the scheduled-cancel state locally so the UI can show it (legacy Stripe branch).
    await prisma.user.update({
      where: { id: req.user.id },
      data: { huntPassCancelAtPeriodEnd: true },
    });
    sendConfirmation(expiresAtDate);
    respond(false, expiresAtDate);
  } catch (err) {
    console.error('POST /api/streaks/cancel-huntpass error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/resume-huntpass
 * Undo a scheduled cancel ("Keep my Hunt Pass"). Only valid while the pass is still active and
 * the paid period has not ended: it clears the cancel flag so the normal renewal at
 * huntPassExpiry proceeds exactly as before. It does NOT charge anything and does not change
 * the billing date or amount. If the pass has already ended, the shopper must subscribe again
 * through the normal sign-up flow (which needs a card). Idempotent. Scoped to req.user.id.
 */
router.post('/resume-huntpass', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        huntPassStripeSubscriptionId: true,
        huntPassBillingProcessor: true,
        huntPassActive: true,
        huntPassExpiry: true,
        huntPassCancelAtPeriodEnd: true,
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const periodEnded = !!user.huntPassExpiry && user.huntPassExpiry.getTime() <= Date.now();
    if (!user.huntPassActive || (user.huntPassCancelAtPeriodEnd && periodEnded)) {
      return res.status(400).json({
        code: 'PASS_ENDED',
        message: 'Your Hunt Pass has already ended. Subscribe again to get it back.',
      });
    }

    const expiresAt = user.huntPassExpiry ? user.huntPassExpiry.toISOString() : null;
    const renewalCopy = user.huntPassExpiry
      ? `Your Hunt Pass is on. It will renew on ${formatLongDate(user.huntPassExpiry)}.`
      : 'Your Hunt Pass is on.';

    if (!user.huntPassCancelAtPeriodEnd) {
      return res.json({ cancelAtPeriodEnd: false, alreadyActive: true, expiresAt, message: renewalCopy });
    }

    if (user.huntPassBillingProcessor !== 'square' && user.huntPassStripeSubscriptionId) {
      const { getStripe } = await import('../utils/stripe');
      const stripe = getStripe();
      await stripe.subscriptions.update(user.huntPassStripeSubscriptionId, { cancel_at_period_end: false });
    }

    await prisma.user.updateMany({
      where: { id: req.user.id, huntPassActive: true, huntPassCancelAtPeriodEnd: true },
      data: { huntPassCancelAtPeriodEnd: false },
    });

    res.json({ cancelAtPeriodEnd: false, alreadyActive: false, expiresAt, message: renewalCopy });
  } catch (err) {
    console.error('POST /api/streaks/resume-huntpass error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
