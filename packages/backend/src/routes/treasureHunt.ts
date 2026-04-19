import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getTodayHunt, checkIfItemMatchesHunt, markFound } from '../services/treasureHuntService';
import { XP_AWARDS } from '../services/xpService';

const router = Router();

/**
 * GET /api/treasure-hunt/today
 * Returns today's treasure hunt clue + category.
 * Keywords are NOT returned (keep it mysterious).
 * Also returns whether the authenticated user has already found it today.
 */
router.get('/today', async (req: AuthRequest, res: Response) => {
  try {
    const hunt = await getTodayHunt();

    if (!hunt) {
      return res.status(404).json({ message: 'No hunt available' });
    }

    const found = req.user
      ? await prisma.treasureHuntFind.findUnique({
          where: { userId_huntId: { userId: req.user.id, huntId: hunt.id } },
        })
      : null;

    res.json({
      id: hunt.id,
      clue: hunt.clue,
      category: hunt.category,
      pointReward: XP_AWARDS.TREASURE_HUNT_SCAN, // Always use current constant (D-XP-015), not stale DB value
      alreadyFound: !!found,
    });
  } catch (err) {
    console.error('GET /api/treasure-hunt/today error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/treasure-hunt/found
 * Body: { itemId }
 * Checks if the item matches today's hunt keywords.
 * If yes, marks found and awards points.
 * If no, returns 400 with "doesn't match" message.
 */
router.post('/found', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.body as { itemId?: string };
    if (!itemId) {
      return res.status(400).json({ message: 'itemId required' });
    }

    // Get today's hunt
    const hunt = await getTodayHunt();
    if (!hunt) {
      return res.status(404).json({ message: 'No hunt available today' });
    }

    // Get the item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user already found it today
    const existing = await prisma.treasureHuntFind.findUnique({
      where: { userId_huntId: { userId: req.user.id, huntId: hunt.id } },
    });

    if (existing) {
      return res.status(400).json({ message: 'Already found an item in today\'s hunt' });
    }

    // Check if item matches hunt keywords
    if (!checkIfItemMatchesHunt(item, hunt)) {
      return res.status(400).json({
        success: false,
        message: "That item doesn't match today's clue! Keep looking!",
      });
    }

    // Mark found and award points
    await markFound(req.user.id, hunt.id, itemId);

    res.json({
      success: true,
      pointsEarned: hunt.pointReward,
      message: `You found it! Earned ${hunt.pointReward} Hunt Pass points!`,
    });
  } catch (err) {
    console.error('POST /api/treasure-hunt/found error:', err);
    if ((err as any).message?.includes('already found')) {
      return res.status(400).json({ success: false, message: 'Already found in today\'s hunt' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
