import { Router, Response } from 'express';
import {
  getPurchases,
  getFavorites,
  getUserProfile,
  getLeaderboard,
  getPublicShopperProfile,
  getBadges,
  activateHuntPassTrial
} from '../controllers/userController';
import { getBrandFollows, addBrandFollow, removeBrandFollow } from '../controllers/brandFollowController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// Authenticated endpoints
router.get('/purchases', authenticate, getPurchases);

// Fetch single purchase by purchase ID (for confirmation page)
router.get('/purchases/:purchaseId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { purchaseId } = req.params;

    // Attempt to fetch by purchase ID first
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            photoUrls: true,
            listingType: true,
            auctionStartPrice: true,
          },
        },
        sale: {
          select: {
            startDate: true,
            endDate: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            organizer: {
              select: {
                businessName: true,
              },
            },
          },
        },
      },
    });

    if (!purchase || purchase.userId !== req.user.id) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    // Return purchase with full details
    res.json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ message: 'Server error while fetching purchase' });
  }
});
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

    // Return bids with their actual status from the database
    res.json(bids);
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

router.get('/me/points', authenticate, getBadges);

// Create or update organizer profile
// Allow any authenticated user (including SHOPPER) to register as organizer
// This enables role transition from SHOPPER to ORGANIZER while preserving existing data
router.post('/setup-organizer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const jwt = require('jsonwebtoken');
    const { businessName, phone, address } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const existing = await prisma.organizer.findUnique({ where: { userId: req.user.id } });

    if (existing) {
      // User already has organizer profile — just update it
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

    // User doesn't have organizer profile yet
    // Add ORGANIZER to their roles array (for role-based access control)
    const currentRoles = req.user.roles || ['USER'];
    const newRoles = [...new Set([...currentRoles, 'ORGANIZER'])]; // Avoid duplicates

    // Create organizer profile and update user roles atomically
    const [organizer, updatedUser] = await prisma.$transaction([
      prisma.organizer.create({
        data: {
          userId: req.user.id,
          businessName: businessName || req.user.name,
          phone: phone || '',
          address: address || '',
        }
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { roles: newRoles }
      })
    ]);

    // Generate fresh JWT with updated roles
    const token = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        roles: updatedUser.roles,
        referralCode: updatedUser.referralCode,
        tokenVersion: updatedUser.tokenVersion,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.status(201).json({ organizer, created: true, token });
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

// Curated collector titles for Task #200: Shopper Public Profiles
const VALID_COLLECTOR_TITLES = [
  'Furniture Curator',
  'Vintage Hunter',
  'Antique Aficionado',
  'Book Collector',
  'Jewelry Hunter',
  'Mid-Century Modernist',
  'Kitchen Collector',
  'Art Enthusiast',
  'Tool Time',
  'General Picker'
];

// Update user's notification preferences and profile settings
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { notificationPrefs, profileSlug, purchasesVisible, collectorTitle, teamsOnboardingComplete } = req.body;

    // Validate notification preferences if provided
    if (notificationPrefs && typeof notificationPrefs !== 'object') {
      return res.status(400).json({ message: 'notificationPrefs must be an object' });
    }

    // Validate collector title if provided
    if (collectorTitle && !VALID_COLLECTOR_TITLES.includes(collectorTitle)) {
      return res.status(400).json({
        message: 'Invalid collector title. Must be one of: ' + VALID_COLLECTOR_TITLES.join(', ')
      });
    }

    // Validate profile slug if provided (alphanumeric, dash, underscore)
    if (profileSlug && !/^[a-zA-Z0-9_-]+$/.test(profileSlug)) {
      return res.status(400).json({
        message: 'Profile slug can only contain letters, numbers, dashes, and underscores'
      });
    }

    const updateData: any = {};
    if (notificationPrefs) {
      updateData.notificationPrefs = notificationPrefs;
    }
    if (profileSlug !== undefined) {
      updateData.profileSlug = profileSlug || null;
    }
    if (purchasesVisible !== undefined) {
      updateData.purchasesVisible = purchasesVisible;
    }
    if (collectorTitle !== undefined) {
      updateData.collectorTitle = collectorTitle || null;
    }
    if (teamsOnboardingComplete !== undefined) {
      updateData.teamsOnboardingComplete = teamsOnboardingComplete;
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        streakPoints: true,
        notificationPrefs: true,
        profileSlug: true,
        purchasesVisible: true,
        collectorTitle: true,
        teamsOnboardingComplete: true,
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating user preferences:', error);
    // Handle unique constraint violation for profileSlug
    if (error.code === 'P2002' && error.meta?.target?.includes('profileSlug')) {
      return res.status(409).json({ message: 'This profile slug is already taken' });
    }
    res.status(500).json({ message: 'Server error while updating preferences' });
  }
});

// Phase 2a: Hunt Pass trial activation
router.post('/hunt-pass/trial', authenticate, activateHuntPassTrial);

// Brand Follow routes
router.get('/:userId/brand-follows', authenticate, getBrandFollows);
router.post('/:userId/brand-follows', authenticate, addBrandFollow);
router.delete('/:userId/brand-follows/:brandFollowId', authenticate, removeBrandFollow);

export default router;
