import { Router, Response } from 'express';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getTodayHunt, getHuntItemStatus, claimDailyHunt } from '../services/treasureHuntService';
import { XP_AWARDS } from '../services/xpService';

const router = Router();

/**
 * GET /api/treasure-hunt/today
 * Returns today's treasure hunt clue + category.
 * Keywords are NOT returned (keep it mysterious).
 * Also returns whether the authenticated user has already found it today.
 *
 * 2026-09-29: now runs optionalAuthenticate. Before, this route read req.user without any auth
 * middleware, so req.user was always undefined and alreadyFound was always false, even for a
 * shopper who had already claimed.
 */
router.get('/today', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
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
 * GET /api/treasure-hunt/item/:itemId
 * Public (optional auth). Tells the item page whether this item is today's treasure and
 * whether the viewer can claim it. state is one of ELIGIBLE, ALREADY_FOUND, NOT_A_MATCH,
 * UNAVAILABLE, OWN_ITEM, NOT_FOUND, NO_HUNT. Never returns the hunt keywords.
 */
router.get('/item/:itemId', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({ message: 'itemId required' });
    }
    const status = await getHuntItemStatus(itemId, req.user?.id);
    res.json({ ...status, loggedIn: !!req.user });
  } catch (err) {
    console.error('GET /api/treasure-hunt/item/:itemId error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/treasure-hunt/found
 * Body: { itemId, huntId? }
 * Claims today's hunt for the authenticated shopper with the given item.
 *  - Server validates the item is live and matches today's clue (keywords never leave the server).
 *  - Idempotent: one claim per shopper per day; a repeat returns 200 with alreadyFound: true and
 *    awards nothing. Safe against double-clicks and concurrent requests (unique key).
 *  - huntId (optional) lets a stale page get a clear "expired" answer instead of matching a new clue.
 *  - Awards Explorer's Guild XP (D-XP-015 base, scaled by rank and Hunt Pass). Response keeps the
 *    legacy pointsEarned/message fields and adds xpEarned, guildXp, explorerRank, rankIncreased.
 */
router.post('/found', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId, huntId } = req.body as { itemId?: unknown; huntId?: unknown };
    if (typeof itemId !== 'string' || !itemId) {
      return res.status(400).json({ message: 'itemId required' });
    }
    const clientHuntId = typeof huntId === 'number' && Number.isInteger(huntId) ? huntId : undefined;

    const result = await claimDailyHunt(req.user.id, itemId, clientHuntId);

    switch (result.state) {
      case 'CLAIMED':
        return res.json({
          success: true,
          alreadyFound: false,
          state: 'CLAIMED',
          huntId: result.huntId,
          xpEarned: result.xpEarned ?? 0,
          pointsEarned: result.xpEarned ?? 0,
          guildXp: result.guildXp,
          explorerRank: result.explorerRank,
          rankIncreased: !!result.rankIncreased,
          message: `You found it! Earned ${result.xpEarned ?? 0} XP for today's hunt.`,
        });
      case 'ALREADY_FOUND':
        return res.json({
          success: true,
          alreadyFound: true,
          state: 'ALREADY_FOUND',
          huntId: result.huntId,
          xpEarned: 0,
          pointsEarned: 0,
          message: "You already found today's treasure. Come back tomorrow for a new clue.",
        });
      case 'HUNT_EXPIRED':
        return res.status(410).json({
          success: false,
          state: 'HUNT_EXPIRED',
          huntId: result.huntId,
          message: "That hunt has ended. Refresh to see today's clue.",
        });
      case 'NOT_FOUND':
        return res.status(404).json({ success: false, state: 'NOT_FOUND', message: 'Item not found' });
      case 'NO_HUNT':
        return res.status(404).json({ success: false, state: 'NO_HUNT', message: 'No hunt available today' });
      case 'UNAVAILABLE':
        return res.status(409).json({ success: false, state: 'UNAVAILABLE', message: 'This item is not available right now.' });
      case 'OWN_ITEM':
        return res.status(403).json({ success: false, state: 'OWN_ITEM', message: 'You cannot claim the hunt on your own sale.' });
      case 'NOT_A_MATCH':
      default:
        return res.status(400).json({
          success: false,
          state: 'NOT_A_MATCH',
          message: "That item doesn't match today's clue! Keep looking!",
        });
    }
  } catch (err) {
    console.error('POST /api/treasure-hunt/found error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
