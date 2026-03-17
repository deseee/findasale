/**
 * Feature #32: Smart Follow Controller
 *
 * Endpoints:
 * POST /follow — Follow an organizer
 * DELETE /follow — Unfollow an organizer
 * GET /my — List organizers user is following
 * GET /status/:organizerId — Check if user follows organizer
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import * as service from '../services/smartFollowService';

const router = Router();

/**
 * POST /follow — Create a smart follow (authenticated)
 * Body: { organizerId }
 */
router.post('/follow', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { organizerId } = req.body;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    // Check if already following
    const isFollowing = await service.getFollowStatus(userId, organizerId);
    if (isFollowing) {
      return res.status(409).json({ message: 'Already following this organizer' });
    }

    const follow = await service.createFollow(userId, organizerId);
    res.status(201).json(follow);
  } catch (error: any) {
    console.error('Error creating smart follow:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * DELETE /follow — Remove a smart follow (authenticated)
 * Body: { organizerId }
 */
router.delete('/follow', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { organizerId } = req.body;

    if (!organizerId) {
      return res.status(400).json({ message: 'organizerId is required' });
    }

    await service.removeFollow(userId, organizerId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error removing smart follow:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /my — List organizers user is following (authenticated)
 */
router.get('/my', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const follows = await service.getUserFollows(userId);
    res.json(follows);
  } catch (error: any) {
    console.error('Error fetching smart follows:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /status/:organizerId — Check follow status (authenticated)
 */
router.get('/status/:organizerId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { organizerId } = req.params;

    const isFollowing = await service.getFollowStatus(userId, organizerId);
    res.json({ isFollowing });
  } catch (error: any) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
