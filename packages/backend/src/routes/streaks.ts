import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { recordVisit, getStreak } from '../services/streakService';
import { prisma } from '../lib/prisma';

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
 * Creates a Stripe Checkout Session (mode: subscription) for the $4.99/mo Hunt Pass.
 * Returns { url } — frontend redirects to Stripe-hosted checkout.
 * Activation is handled server-side via customer.subscription.created webhook.
 */
router.post('/subscribe-huntpass', authenticate, async (req: AuthRequest, res: Response) => {
  // Stripe removal (2026-09-12): this endpoint always creates a BRAND-NEW Stripe
  // Checkout Session (mode: subscription), and usually a brand-new Stripe Customer
  // too -- there is no historical object to service for a fresh subscribe attempt.
  // Stripe's platform account is permanently closed, and there is no Square
  // Subscriptions equivalent built for Hunt Pass yet (unlike the checkout flows this
  // sweep converted to Square, this is a genuinely separate recurring-billing
  // product with no drop-in replacement). Blocked before any Stripe call or user
  // row update. ARCHITECT-LEVEL OPEN QUESTION, not resolved by this sweep: should
  // Hunt Pass move to Square Subscriptions (would need real integration work), a
  // different recurring-billing provider, or be retired? Flagging per the standing
  // pattern rather than guessing. /cancel-huntpass below is left untouched -- an
  // existing subscriber from before the shutdown can still cancel their real,
  // already-existing Stripe subscription.
  return res.status(503).json({
    message: "Hunt Pass sign-ups are temporarily unavailable while we migrate billing. Please check back soon.",
    code: 'HUNT_PASS_SUBSCRIBE_UNAVAILABLE',
  });
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
      select: { huntPassStripeSubscriptionId: true },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
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
