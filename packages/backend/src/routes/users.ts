import { Router, Response } from 'express';
import {
  getPurchases,
  getFavorites,
  getUserProfile,
  getLeaderboard,
  getPublicShopperProfile
} from '../controllers/userController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// Authenticated endpoints
router.get('/purchases', authenticate, getPurchases);
router.get('/favorites', authenticate, getFavorites);
router.get('/me', authenticate, getUserProfile);
router.get('/leaderboard', getLeaderboard);

// Public endpoint — must come after /me to avoid route collision
router.get('/:id/public', getPublicShopperProfile);

// New endpoints for profile enhancements
router.get('/me/bids', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bids = await prisma.bid.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        item: {
          select: {
            title: true,
            photoUrls: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Add bid status logic here (WINNING, LOSING, etc.)
    const bidsWithStatus = bids.map((bid: any) => {
      // Simplified status logic - in a real app, you'd compare with current highest bid
      return {
        ...bid,
        status: 'PARTICIPATING' // Would be determined by comparing with other bids
      };
    });

    res.json(bidsWithStatus);
  } catch (error) {
    console.error('Error fetching user bids:', error);
    res.status(500).json({ message: 'Server error while fetching bids' });
  }
});

router.get('/me/referrals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const referrals = await prisma.referral.findMany({
      where: {
        referrerId: req.user.id
      },
      include: {
        referredUser: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(referrals);
  } catch (error) {
    console.error('Error fetching user referrals:', error);
    res.status(500).json({ message: 'Server error while fetching referrals' });
  }
});

router.get('/me/points', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        userBadges: { 
          include: { 
            badge: true 
          } 
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      points: user.points,
      badges: user.userBadges ? user.userBadges.map(ub => ub.badge) : []
    });
  } catch (error) {
    console.error('Error fetching user points:', error);
    res.status(500).json({ message: 'Server error while fetching points' });
  }
});

// Create or update organizer profile
router.post('/setup-organizer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { businessName, phone, address } = req.body;

    if (req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Only organizers can set up an organizer profile' });
    }

    const existing = await prisma.organizer.findUnique({ where: { userId: req.user.id } });

    if (existing) {
      const updated = await prisma.organizer.update({
        where: { userId: req.user.id },
        data: {
          businessName: businessName || existing.businessName,
          phone: phone || existing.phone,
          address: address || existing.address,
        }
      });
      return res.json({ organizer: updated, created: false });
    }

    const organizer = await prisma.organizer.create({
      data: {
        userId: req.user.id,
        businessName: businessName || req.user.name,
        phone: phone || '',
        address: address || '',
      }
    });

    res.status(201).json({ organizer, created: true });
  } catch (error) {
    console.error('Error setting up organizer profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user's sale interest categories (for buyer-to-sale matching)
router.patch('/me/interests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { categoryInterests } = req.body;

    // Validate that categoryInterests is an array of strings
    if (!Array.isArray(categoryInterests)) {
      return res.status(400).json({ message: 'categoryInterests must be an array' });
    }

    // Optionally validate against known categories
    const knownCategories = [
      'furniture', 'decor', 'vintage', 'textiles', 'collectibles', 'art',
      'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing', 'home', 'other'
    ];
    const validInterests = categoryInterests.filter((cat: string) => knownCategories.includes(cat));

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { categoryInterests: validInterests },
      select: { id: true, email: true, name: true, categoryInterests: true }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating user interests:', error);
    res.status(500).json({ message: 'Server error while updating interests' });
  }
});

// Update user's notification preferences
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { notificationPrefs } = req.body;

    // Validate notification preferences if provided
    if (notificationPrefs && typeof notificationPrefs !== 'object') {
      return res.status(400).json({ message: 'notificationPrefs must be an object' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(notificationPrefs && { notificationPrefs }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        points: true,
        streakPoints: true,
        notificationPrefs: true,
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ message: 'Server error while updating preferences' });
  }
});

export default router;
