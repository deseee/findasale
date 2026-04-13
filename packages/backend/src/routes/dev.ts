import express, { Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = express.Router();

// POST /api/dev/fix-seed-tiers — ONE-TIME dev utility to set up test user tiers
// Only requires authenticate middleware (not admin)
// Safety gate: only works for user1@example.com
export const fixSeedTiers = async (req: AuthRequest, res: Response) => {
  try {
    // Safety gate: only user1@example.com can call this
    if (req.user?.email !== 'user1@example.com') {
      return res.status(403).json({ message: 'Only user1@example.com can call this endpoint' });
    }

    // 1. Set user1's role to ADMIN
    const user1 = await prisma.user.update({
      where: { email: 'user1@example.com' },
      data: { role: 'ADMIN' },
      select: { id: true, email: true, role: true },
    });

    // 2. Find user2's organizer and set subscriptionTier to PRO
    const user2 = await prisma.user.findUnique({
      where: { email: 'user2@example.com' },
      include: { organizer: true },
    });

    let user2OrganizerUpdate = null;
    if (user2?.organizer) {
      user2OrganizerUpdate = await prisma.organizer.update({
        where: { id: user2.organizer.id },
        data: {
          subscriptionTier: 'PRO',
          tokenVersion: { increment: 1 },
        },
        select: {
          id: true,
          subscriptionTier: true,
          businessName: true,
        },
      });
    }

    // 3. Find user3's organizer and set subscriptionTier to TEAMS
    const user3 = await prisma.user.findUnique({
      where: { email: 'user3@example.com' },
      include: { organizer: true },
    });

    let user3OrganizerUpdate = null;
    if (user3?.organizer) {
      user3OrganizerUpdate = await prisma.organizer.update({
        where: { id: user3.organizer.id },
        data: {
          subscriptionTier: 'TEAMS',
          tokenVersion: { increment: 1 },
        },
        select: {
          id: true,
          subscriptionTier: true,
          businessName: true,
        },
      });
    }

    // Return summary of what was updated
    res.json({
      message: 'Seed tiers fixed successfully',
      updates: {
        user1: user1,
        user2Organizer: user2OrganizerUpdate || { message: 'user2 has no organizer profile' },
        user3Organizer: user3OrganizerUpdate || { message: 'user3 has no organizer profile' },
      },
    });
  } catch (error) {
    console.error('Error fixing seed tiers:', error);
    res.status(500).json({ message: 'Failed to fix seed tiers' });
  }
};

// Apply authenticate middleware to this router
router.use(authenticate);

router.post('/fix-seed-tiers', fixSeedTiers);

export default router;
