import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPerformanceMetricsHandler } from '../controllers/performanceController';

const router = Router();

// Authenticated: get revenue analytics for the current organizer
router.get('/me/analytics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.json({ totalRevenue: 0, totalFees: 0, itemsSold: 0, itemsUnsold: 0, sales: [] });
    }

    // Fetch all sales with items and purchases
    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      include: {
        items: {
          select: { id: true, status: true },
        },
        purchases: {
          where: { status: 'PAID' },
          select: { amount: true, platformFeeAmount: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    let totalRevenue = 0;
    let totalFees = 0;
    let itemsSold = 0;
    let itemsUnsold = 0;

    const saleBreakdown = sales.map((sale: any) => {
      const saleRevenue = sale.purchases.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const saleFees = sale.purchases.reduce((sum: number, p: any) => sum + (Number(p.platformFeeAmount) || 0), 0);
      const saleSold = sale.items.filter((i: any) => i.status === 'SOLD').length;
      const saleUnsold = sale.items.filter((i: any) => i.status !== 'SOLD').length;

      totalRevenue += saleRevenue;
      totalFees += saleFees;
      itemsSold += saleSold;
      itemsUnsold += saleUnsold;

      return {
        id: sale.id,
        title: sale.title,
        status: sale.status,
        itemsSold: saleSold,
        itemsUnsold: saleUnsold,
        revenue: saleRevenue,
        fees: saleFees,
        qrScanCount: (sale as any).qrScanCount ?? 0,
      };
    });

    res.json({
      totalRevenue,
      totalFees,
      itemsSold,
      itemsUnsold,
      sales: saleBreakdown,
    });
  } catch (error) {
    console.error('Error fetching organizer analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /organizers/performance?saleId=X&range=30d — seller performance dashboard metrics
// Feature #6: Revenue, top items, conversion rate, category breakdown, hold/no-show rate
router.get('/performance', authenticate, getPerformanceMetricsHandler);

// PATCH /organizers/me — update current organizer's profile (businessName, phone, bio, onboardingComplete)
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { businessName, phone, bio, onboardingComplete } = req.body;

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const updated = await prisma.organizer.update({
      where: { userId: req.user.id },
      data: {
        ...(businessName && { businessName }),
        ...(phone && { phone }),
        ...(bio !== undefined && { bio }),
        ...(onboardingComplete !== undefined && { onboardingComplete }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating organizer profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /organizers/me/onboarding-complete — mark onboarding as completed
router.post('/me/onboarding-complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const updated = await prisma.organizer.update({
      where: { userId: req.user.id },
      data: { onboardingComplete: true },
    });

    res.json({ success: true, onboardingComplete: updated.onboardingComplete });
  } catch (error) {
    console.error('Error marking onboarding complete:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Authenticated: get current organizer's own profile + tier data (Phase 22)
// Must be registered before /:id to avoid being swallowed by the wildcard
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      include: {
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const [endedSalesCount, reviews] = await Promise.all([
      prisma.sale.count({
        where: { organizerId: organizer.id, status: 'ENDED' },
      }),
      prisma.review.findMany({
        where: { sale: { organizerId: organizer.id } },
        select: { rating: true },
      }),
    ]);

    const followerCount = (organizer as any)._count.followers ?? 0;
    const avgRating =
      reviews.length > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
        : 0;

    // Build progress message toward next tier
    let progressMessage = '';
    if (organizer.reputationTier === 'NEW') {
      const salesNeeded = Math.max(0, 5 - endedSalesCount);
      if (salesNeeded > 0) {
        progressMessage = `${salesNeeded} more completed sale${salesNeeded !== 1 ? 's' : ''} to reach Trusted Seller.`;
      } else {
        progressMessage = 'Achieve a 4.0+ average rating to reach Trusted Seller.';
      }
    } else if (organizer.reputationTier === 'TRUSTED') {
      const parts: string[] = [];
      const salesNeeded = Math.max(0, 20 - endedSalesCount);
      const followersNeeded = Math.max(0, 50 - followerCount);
      if (salesNeeded > 0) parts.push(`${salesNeeded} more sale${salesNeeded !== 1 ? 's' : ''}`);
      if (followersNeeded > 0) parts.push(`${followersNeeded} more follower${followersNeeded !== 1 ? 's' : ''}`);
      if (avgRating < 4.5) parts.push('a 4.5+ average rating');
      progressMessage = parts.length > 0
        ? `Need ${parts.join(', ')} to reach Estate Curator.`
        : 'You qualify for Estate Curator — tier recalculation runs weekly.';
    } else {
      progressMessage = "You've reached the highest tier!";
    }

    // Feature #11: Include referral discount expiry so frontend can display active discount banner
    const discountExpiry = (organizer as any).referralDiscountExpiry as Date | null;
    const referralDiscountActive = discountExpiry != null && discountExpiry > new Date();

    res.json({
      id: organizer.id,
      businessName: organizer.businessName,
      reputationTier: organizer.reputationTier,
      avgRating: organizer.avgRating,
      totalReviews: organizer.totalReviews,
      completedSales: endedSalesCount,
      followerCount,
      progressMessage,
      onboardingComplete: (organizer as any).onboardingComplete,
      referralDiscountActive,
      referralDiscountExpiry: discountExpiry ? discountExpiry.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching organizer /me profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Phase 32: CSV export — GET /api/organizers/me/export/items/:saleId
// Streams a CSV of all items in the given sale (organizer-owned sales only)
router.get('/me/export/items/:saleId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.status(404).json({ message: 'Organizer profile not found' });

    // Verify the sale belongs to this organizer
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.saleId, organizerId: organizer.id },
      select: { title: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const items = await prisma.item.findMany({
      where: { saleId: req.params.saleId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        auctionStartPrice: true,
        currentBid: true,
        condition: true,
        category: true,
        status: true,
        auctionEndTime: true,
        createdAt: true,
      },
    });

    // Build CSV — escape fields containing commas/quotes
    const esc = (v: any): string => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = ['id', 'title', 'description', 'price', 'auctionStartPrice', 'currentBid',
                    'condition', 'category', 'status', 'auctionEndTime', 'createdAt'];
    const rows = items.map((item) => [
      item.id, item.title, item.description, item.price, item.auctionStartPrice,
      item.currentBid, item.condition, item.category, item.status,
      item.auctionEndTime?.toISOString() ?? '', item.createdAt.toISOString(),
    ].map(esc).join(','));

    const csv = [header.join(','), ...rows].join('\r\n');
    const filename = `${sale.title.replace(/[^a-z0-9]/gi, '_')}_items.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting items CSV:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: get organizer profile + their upcoming/active sales + badges + reputation
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          include: {
            userBadges: {
              include: {
                badge: true,
              },
            },
          },
        },
        sales: {
          orderBy: { startDate: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            startDate: true,
            endDate: true,
            photoUrls: true,
            status: true,
            isAuctionSale: true,
          },
        },
        _count: { select: { followers: true } },
      },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Fetch review count and average rating
    const reviews = await prisma.review.findMany({
      where: {
        sale: { organizerId: organizer.id }
      },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
      : 0;

    // Check if requesting user follows this organizer
    let isFollowing = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded: any = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!);
        const follow = await prisma.follow.findUnique({
          where: { userId_organizerId: { userId: decoded.id, organizerId: organizer.id } },
        });
        isFollowing = !!follow;
      } catch {
        // Not logged in or invalid token — isFollowing stays false
      }
    }

    res.json({
      id: organizer.id,
      businessName: organizer.businessName,
      phone: organizer.phone,
      address: organizer.address,
      reputationTier: organizer.reputationTier,
      sales: organizer.sales,
      badges: organizer.user?.userBadges?.map((ub: any) => ({
        id: ub.badge.id,
        name: ub.badge.name,
        description: ub.badge.description,
        iconUrl: ub.badge.iconUrl,
        awardedAt: ub.awardedAt,
      })) || [],
      reviewCount: reviews.length,
      avgRating: Math.round(avgRating * 10) / 10,
      followerCount: (organizer as any)._count?.followers ?? 0,
      isFollowing,
    });
  } catch (error) {
    console.error('Error fetching organizer profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /:id/follow — follow an organizer (authenticated)
router.post('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

    const organizerId = req.params.id;
    const organizer = await prisma.organizer.findUnique({ where: { id: organizerId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });

    // Can't follow yourself
    if (organizer.userId === req.user.id) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const follow = await prisma.follow.upsert({
      where: { userId_organizerId: { userId: req.user.id, organizerId } },
      update: {}, // already following — no-op
      create: { userId: req.user.id, organizerId },
    });

    // Return updated follower count
    const count = await prisma.follow.count({ where: { organizerId } });

    res.json({ following: true, followerCount: count });
  } catch (error) {
    console.error('Error following organizer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /:id/follow — unfollow an organizer (authenticated)
router.delete('/:id/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

    const organizerId = req.params.id;

    await prisma.follow.deleteMany({
      where: { userId: req.user.id, organizerId },
    });

    const count = await prisma.follow.count({ where: { organizerId } });

    res.json({ following: false, followerCount: count });
  } catch (error) {
    console.error('Error unfollowing organizer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /:id/followers — list followers of an organizer (public, paginated)
router.get('/:id/followers', async (req: Request, res: Response) => {
  try {
    const organizerId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { organizerId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.follow.count({ where: { organizerId } }),
    ]);

    res.json({
      followers: followers.map((f: any) => ({
        userId: f.user.id,
        name: f.user.name,
        followedAt: f.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: award badges to organizers based on criteria
router.post('/admin/award-badges', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    // Ensure default badges exist
    const defaultBadges = [
      {
        name: 'first-time-organizer',
        description: 'First sale listed',
        criteria: { type: 'first-sale' }
      },
      {
        name: 'verified-organizer',
        description: 'Completed 5+ sales',
        criteria: { type: 'completed-sales', count: 5 }
      },
      {
        name: 'top-rated-organizer',
        description: 'Highly rated by shoppers',
        criteria: { type: 'avg-rating', minRating: 4.5, minReviews: 3 }
      }
    ];

    for (const badgeData of defaultBadges) {
      await prisma.badge.upsert({
        where: { name: badgeData.name },
        update: {},
        create: {
          name: badgeData.name,
          description: badgeData.description,
          criteria: badgeData.criteria,
        }
      });
    }

    // Get all organizers
    const organizers = await prisma.organizer.findMany({
      include: {
        user: {
          include: {
            userBadges: true,
          }
        },
        sales: {
          where: { status: 'PUBLISHED' }
        }
      }
    });

    let awardedCount = 0;

    for (const organizer of organizers) {
      if (!organizer.user) continue;

      const existingBadgeNames = organizer.user.userBadges.map((ub: any) => ub.badgeId);

      // Check for first-time organizer badge
      const firstTimeOrgBadge = await prisma.badge.findUnique({
        where: { name: 'first-time-organizer' }
      });

      if (firstTimeOrgBadge && organizer.sales.length > 0 && !existingBadgeNames.includes(firstTimeOrgBadge.id)) {
        await prisma.userBadge.create({
          data: {
            userId: organizer.user.id,
            badgeId: firstTimeOrgBadge.id,
          }
        });
        awardedCount++;
      }

      // Check for verified organizer badge (5+ sales)
      const verifiedOrgBadge = await prisma.badge.findUnique({
        where: { name: 'verified-organizer' }
      });

      if (verifiedOrgBadge && organizer.sales.length >= 5 && !existingBadgeNames.includes(verifiedOrgBadge.id)) {
        await prisma.userBadge.create({
          data: {
            userId: organizer.user.id,
            badgeId: verifiedOrgBadge.id,
          }
        });
        awardedCount++;
      }

      // Check for top-rated organizer badge (avg rating >= 4.5, min 3 reviews)
      const reviews = await prisma.review.findMany({
        where: {
          sale: { organizerId: organizer.id }
        }
      });

      if (reviews.length >= 3) {
        const avgRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length;
        const topRatedBadge = await prisma.badge.findUnique({
          where: { name: 'top-rated-organizer' }
        });

        if (topRatedBadge && avgRating >= 4.5 && !existingBadgeNames.includes(topRatedBadge.id)) {
          await prisma.userBadge.create({
            data: {
              userId: organizer.user.id,
              badgeId: topRatedBadge.id,
            }
          });
          awardedCount++;
        }
      }
    }

    res.json({ message: `Badges awarded to ${awardedCount} organizers.` });
  } catch (error) {
    console.error('Error awarding badges:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
