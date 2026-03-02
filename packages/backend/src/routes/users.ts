import { Router, Request, Response } from 'express';
import { 
  getPurchases, 
  getFavorites, 
  getUserProfile,
  getLeaderboard
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request type
interface AuthRequest extends Request {
  user?: any;
}

const router = Router();

router.get('/purchases', authenticate, getPurchases);
router.get('/favorites', authenticate, getFavorites);
router.get('/me', authenticate, getUserProfile);
router.get('/leaderboard', getLeaderboard);

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

export default router;
