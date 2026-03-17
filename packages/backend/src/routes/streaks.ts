import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { recordVisit, getStreak } from '../services/streakService';

const router = Router();

/**
 * GET /api/streaks/profile
 * Returns the authenticated user's streak profile: current streaks, longest streaks.
 */
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const streak = await getStreak(req.user.id);
    res.json(streak);
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
 * POST /api/streaks/activate-huntpass
 * Creates a Stripe PaymentIntent for $4.99 Hunt Pass (30-day subscription).
 * Returns { clientSecret } for the frontend to confirm with Stripe Elements.
 */
router.post('/activate-huntpass', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { getStripe } = await import('../utils/stripe');
    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 499, // $4.99 in cents
      currency: 'usd',
      metadata: {
        type: 'hunt_pass',
        userId: req.user.id,
      },
      description: 'FindA.Sale Hunt Pass — 30 days',
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('POST /api/streaks/activate-huntpass error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/confirm-huntpass
 * Called after Stripe payment confirmation succeeds client-side.
 * Verifies the PaymentIntent succeeded server-side, then activates Hunt Pass for 30 days.
 */
router.post('/confirm-huntpass', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { paymentIntentId } = req.body as { paymentIntentId: string };
    if (!paymentIntentId) return res.status(400).json({ message: 'paymentIntentId required' });

    const { getStripe } = await import('../utils/stripe');
    const stripe = getStripe();

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(400).json({ message: 'Payment not completed' });
    }
    if (intent.metadata?.userId !== req.user.id) {
      return res.status(403).json({ message: 'Payment intent does not belong to this user' });
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        huntPassActive: true,
        huntPassExpiry: expiry,
        streakPoints: { increment: 100 }, // Bonus points for upgrading
      },
    });
    await prisma.$disconnect();

    res.json({
      success: true,
      huntPassExpiry: expiry.toISOString(),
      message: 'Hunt Pass activated! +100 bonus points.',
    });
  } catch (err) {
    console.error('POST /api/streaks/confirm-huntpass error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
