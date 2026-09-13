import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import { recordVisit, getStreak } from '../services/streakService';
import { prisma } from '../lib/prisma';
import {
  HUNT_PASS_PRICE_CENTS,
  BILLING_INTERVAL_DAYS,
  createPlatformBillingCard,
  chargeStoredCard,
} from '../services/squareBillingService';

const router = Router();

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
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Get streak data (visit, save, buy)
    const streakData = await getStreak(req.user.id);

    res.json({
      userId: user.id,
      name: user.name,
      streakPoints: user.streakPoints,
      guildXp: user.guildXp,
      visitStreak: user.visitStreak || streakData.currentStreak,
      huntPassActive: user.huntPassActive,
      huntPassExpiry: user.huntPassExpiry ? user.huntPassExpiry.toISOString() : null,
      huntPassSubscriptionId: user.huntPassStripeSubscriptionId,
      streaks: streakData,
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
 * Records a save/favorite activity.
 */
router.post('/save', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    res.json({ message: 'Save recorded!' });
  } catch (err) {
    console.error('POST /api/streaks/save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/purchase
 * Records a purchase/buy streak activity.
 */
router.post('/purchase', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    res.json({ message: 'Purchase recorded!' });
  } catch (err) {
    console.error('POST /api/streaks/purchase error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/streaks/leaderboard
 * Public endpoint: returns top users by streak.
 */
router.get('/leaderboard', async (_req, res: Response) => {
  try {
    res.json({ leaderboard: [] });
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
 * Sets the Hunt Pass subscription to cancel at the end of the current billing period.
 * The pass stays active until expiry; customer.subscription.deleted webhook handles deactivation.
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
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Square Plan B (2026-09-13): cancel-at-period-end semantics, same as the Stripe branch
    // below, but there is no processor subscription object to update -- just flip the flag
    // jobs/squareBillingChargeJob.ts checks at the next renewal instead of charging again.
    if (user.huntPassBillingProcessor === 'square') {
      if (!user.huntPassActive) {
        return res.status(400).json({ message: 'No active Hunt Pass subscription found.' });
      }
      await prisma.user.update({
        where: { id: req.user.id },
        data: { huntPassCancelAtPeriodEnd: true },
      });
      const expiresAt = user.huntPassExpiry ? user.huntPassExpiry.toISOString() : null;
      return res.json({
        cancelAtPeriodEnd: true,
        expiresAt,
        message: expiresAt
          ? `Your Hunt Pass will remain active until ${new Date(expiresAt).toLocaleDateString()}.`
          : 'Your Hunt Pass will not renew.',
      });
    }

    if (!user.huntPassStripeSubscriptionId) {
      return res.status(400).json({ message: 'No active Hunt Pass subscription found.' });
    }

    const { getStripe } = await import('../utils/stripe');
    const stripe = getStripe();

    const updated = await stripe.subscriptions.update(user.huntPassStripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const expiresAt = new Date(updated.current_period_end * 1000).toISOString();

    res.json({
      cancelAtPeriodEnd: true,
      expiresAt,
      message: `Your Hunt Pass will remain active until ${new Date(expiresAt).toLocaleDateString()}.`,
    });
  } catch (err) {
    console.error('POST /api/streaks/cancel-huntpass error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
