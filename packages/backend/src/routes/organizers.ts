import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authenticate } from '../middleware/auth';

const router = Router();

interface AuthRequest extends Request {
  user?: any;
}

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

// Public: get organizer profile + their upcoming/active sales + badges
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

    res.json({
      id: organizer.id,
      businessName: organizer.businessName,
      phone: organizer.phone,
      address: organizer.address,
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
    });
  } catch (error) {
    console.error('Error fetching organizer profile:', error);
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
