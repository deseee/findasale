import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPerformanceMetricsHandler } from '../controllers/performanceController';
import { exportOrganizer } from '../controllers/exportController';
import { getCsvExportHandler } from '../controllers/csvExportController';
import { getPosTierStatus } from '../controllers/posTiersController';
import { getPrintKit, getYardSignKit, getDirectionalSignKit, getTableTentKit, getHangTagKit, getFullSignKitPDF } from '../controllers/printKitController';
import { createDonation, getDonations, generateReceipt } from '../controllers/donationController';

const router = Router();

// Authenticated: get revenue analytics for the current organizer
router.get('/me/analytics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

// GET /organizers/stats — consolidated dashboard stats (revenue, items, active sale metrics)
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.json({
        revenue: { totalLifetime: 0, currentSale: 0, thisMonth: 0 },
        items: { total: 0, available: 0, sold: 0, draft: 0 },
        activeSale: null,
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch all sales with purchase and item data
    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      include: {
        items: {
          select: { id: true, status: true, draftStatus: true },
        },
        purchases: {
          where: { status: 'PAID' },
          select: { amount: true, createdAt: true },
        },
      },
    });

    // Calculate lifetime revenue and this month's revenue
    let totalLifetime = 0;
    let thisMonth = 0;
    sales.forEach((sale: any) => {
      sale.purchases.forEach((p: any) => {
        const amount = Number(p.amount) || 0;
        totalLifetime += amount;
        if (new Date(p.createdAt) >= monthStart) {
          thisMonth += amount;
        }
      });
    });

    // Count items by status
    let totalItems = 0;
    let availableItems = 0;
    let soldItems = 0;
    let draftItems = 0;
    sales.forEach((sale: any) => {
      sale.items.forEach((item: any) => {
        totalItems++;
        if (item.draftStatus === 'DRAFT') {
          draftItems++;
        } else if (item.status === 'SOLD') {
          soldItems++;
        } else if (item.status === 'AVAILABLE') {
          availableItems++;
        }
      });
    });

    // Find active sale (DRAFT or PUBLISHED — match getDashboardState logic on frontend)
    const activeSale = sales.find(
      (s: any) => s.status === 'PUBLISHED' || s.status === 'DRAFT'
    );

    let activeSaleData = null;
    if (activeSale) {
      const activeItemCount = activeSale.items.filter(
        (i: any) => i.draftStatus !== 'DRAFT' && i.status !== 'SOLD'
      ).length;
      const activeSaleRevenue = activeSale.purchases.reduce(
        (sum: number, p: any) => sum + (Number(p.amount) || 0),
        0
      );
      const holdCount = await prisma.itemReservation.count({
        where: {
          status: 'PENDING',
          item: {
            saleId: activeSale.id,
          },
        },
      });

      activeSaleData = {
        id: activeSale.id,
        title: activeSale.title,
        status: activeSale.status,
        saleType: activeSale.saleType ?? 'ESTATE',
        endDate: activeSale.endDate,
        viewCount: activeSale.qrScanCount ?? 0,
        holdCount,
      };
    }

    res.json({
      revenue: {
        totalLifetime,
        currentSale: activeSale?.purchases.reduce((sum: any, p: any) => sum + (Number(p.amount) || 0), 0) ?? 0,
        thisMonth,
      },
      items: {
        total: totalItems,
        available: availableItems,
        sold: soldItems,
        draft: draftItems,
      },
      activeSale: activeSaleData,
    });
  } catch (error) {
    console.error('Error fetching organizer stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /organizers/performance?saleId=X&range=30d — seller performance dashboard metrics
// Feature #6: Revenue, top items, conversion rate, category breakdown, hold/no-show rate
router.get('/performance', authenticate, getPerformanceMetricsHandler);

// PATCH /organizers/me — update current organizer's profile (businessName, phone, bio, onboardingComplete)
router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { businessName, phone, bio, onboardingComplete, website, facebook, instagram, etsy, brandLogoUrl, brandPrimaryColor, brandSecondaryColor, customStorefrontSlug, brandFontFamily, brandBannerImageUrl, brandAccentColor } = req.body;

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
        ...(website !== undefined && { website }),
        ...(facebook !== undefined && { facebook }),
        ...(instagram !== undefined && { instagram }),
        ...(etsy !== undefined && { etsy }),
        ...(brandLogoUrl !== undefined && { brandLogoUrl }),
        ...(brandPrimaryColor !== undefined && { brandPrimaryColor }),
        ...(brandSecondaryColor !== undefined && { brandSecondaryColor }),
        ...(customStorefrontSlug !== undefined && { customStorefrontSlug }),
        ...(brandFontFamily !== undefined && { brandFontFamily }),
        ...(brandBannerImageUrl !== undefined && { brandBannerImageUrl }),
        ...(brandAccentColor !== undefined && { brandAccentColor }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating organizer profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /organizers/me/onboarding-complete — mark onboarding as completed, return fresh JWT
router.post('/me/onboarding-complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

    // Generate fresh JWT with updated onboardingComplete flag
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const token = jwt.sign(
      {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        role: user!.role,
        referralCode: user!.referralCode,
        tokenVersion: user!.tokenVersion,
        subscriptionTier: updated.subscriptionTier ?? 'SIMPLE',
        organizerTokenVersion: updated.tokenVersion ?? 0,
        onboardingComplete: updated.onboardingComplete,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({ success: true, onboardingComplete: updated.onboardingComplete, token });
  } catch (error) {
    console.error('Error marking onboarding complete:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Authenticated: get current organizer's own profile + tier data (Phase 22)
// Must be registered before /:id to avoid being swallowed by the wildcard
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

    // Feature #75: Include subscription lapse status from middleware context
    const subscriptionLapsed = (req.user as any).subscriptionLapsed ?? false;

    res.json({
      id: organizer.id,
      businessName: organizer.businessName,
      phone: organizer.phone,
      bio: organizer.bio,
      website: organizer.website,
      facebook: (organizer as any).facebook || null,
      instagram: (organizer as any).instagram || null,
      etsy: (organizer as any).etsy || null,
      reputationTier: organizer.reputationTier,
      avgRating: organizer.avgRating,
      totalReviews: organizer.totalReviews,
      completedSales: endedSalesCount,
      followerCount,
      progressMessage,
      onboardingComplete: (organizer as any).onboardingComplete,
      referralDiscountActive,
      referralDiscountExpiry: discountExpiry ? discountExpiry.toISOString() : null,
      subscriptionLapsed,
    });
  } catch (error) {
    console.error('Error fetching organizer /me profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/organizers/me/sales — Get all sales for the current organizer
// Returns array of sales with basic info (id, title, status, etc.)
router.get('/me/sales', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Fetch all sales for this organizer
    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        saleType: true,
      },
      orderBy: { startDate: 'desc' },
    });

    res.json(sales);
  } catch (error) {
    console.error('Error fetching organizer sales:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Phase 32: CSV export — GET /api/organizers/me/export/items/:saleId
// Streams a CSV of all items in the given sale (organizer-owned sales only)
router.get('/me/export/items/:saleId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

// Feature #66: GET /api/organizers/export
// Download all organizer data as a ZIP with three CSVs (sales, items, purchases)
// Must be registered BEFORE /:id to avoid Express matching 'export' as an id param
router.get('/export', authenticate, exportOrganizer);

// Feature #89: GET /api/organizer/sales/:saleId/print-kit
// Download unified print kit PDF (QR code + item barcode stickers)
// Must be registered BEFORE /:id wildcard
router.get('/:saleId/print-kit', authenticate, getPrintKit);

// Feature #240: GET /api/organizer/sales/:saleId/signs/[type]
// Download sign templates: yard | directional | table-tent | hang-tag | full-kit
router.get('/:saleId/signs/yard', authenticate, getYardSignKit);
router.get('/:saleId/signs/directional', authenticate, getDirectionalSignKit);
router.get('/:saleId/signs/table-tent', authenticate, getTableTentKit);
router.get('/:saleId/signs/hang-tag', authenticate, getHangTagKit);
router.get('/:saleId/signs/full-kit', authenticate, getFullSignKitPDF);

// GET /organizers/efficiency-stats — Organizer benchmarks vs. cohort
// Must be registered BEFORE /:id to avoid Express matching 'efficiency-stats' as an id param
router.get('/efficiency-stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const organizer = await prisma.organizer.findUnique({
      where: { userId },
      select: { id: true, totalSales: true },
    });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    // Fetch this organizer's sales with items
    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id, status: 'ENDED' },
      select: {
        createdAt: true,
        items: {
          select: { status: true, createdAt: true, draftStatus: true },
        },
      },
    });

    // Average photo-to-publish time (approximation: item createdAt to sale publish)
    let totalPublishMinutes = 0;
    let publishCount = 0;
    let totalItems = 0;
    let soldItems = 0;

    sales.forEach((sale: any) => {
      sale.items.forEach((item: any) => {
        totalItems++;
        if (item.status === 'SOLD') soldItems++;
        if (item.draftStatus === 'PUBLISHED') {
          const diff = (new Date(item.createdAt).getTime() - new Date(sale.createdAt).getTime()) / 60000;
          if (diff > 0 && diff < 10080) { // Cap at 7 days
            totalPublishMinutes += diff;
            publishCount++;
          }
        }
      });
    });

    const avgPhotoToPublishMinutes = publishCount > 0 ? Math.round(totalPublishMinutes / publishCount) : 0;
    const sellThroughRate = totalItems > 0 ? soldItems / totalItems : 0;

    // Simple percentile rank (based on sell-through rate vs all organizers)
    const allOrganizers = await prisma.organizer.count();
    const betterOrganizers = await prisma.organizer.count({
      where: { totalSales: { lt: organizer.totalSales } },
    });
    const percentileRank = allOrganizers > 0 ? Math.round((betterOrganizers / allOrganizers) * 100) : 50;

    // Generate tips
    const tips: string[] = [];
    if (avgPhotoToPublishMinutes > 30) tips.push('Try batch-uploading photos to reduce your listing time.');
    if (sellThroughRate < 0.5) tips.push('Consider lowering prices on slow-moving items or using Auto-Markdown.');
    if (sellThroughRate >= 0.8) tips.push('Great sell-through rate! You could try higher starting prices.');
    if (tips.length === 0) tips.push('You\'re performing well. Keep up the great work!');

    res.json({
      avgPhotoToPublishMinutes,
      sellThroughRate: Math.round(sellThroughRate * 100) / 100,
      percentileRank,
      cohortSize: allOrganizers,
      tips,
    });
  } catch (error) {
    console.error('efficiency-stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: get organizer profile + their upcoming/active sales + badges + reputation
// Supports lookup by ID (CUID) or by customStorefrontSlug (user-friendly slug)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Try lookup by ID first (internal CUID)
    let organizer = await prisma.organizer.findUnique({
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

    // If not found by ID, try lookup by customStorefrontSlug (user-friendly slug)
    if (!organizer) {
      organizer = await prisma.organizer.findUnique({
        where: { customStorefrontSlug: req.params.id },
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
    }

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

// GET /:id/follow-status — check if current user follows organizer (authenticated)
router.get('/:id/follow-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

    const organizerId = req.params.id;
    const organizer = await prisma.organizer.findUnique({ where: { id: organizerId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });

    const follow = await prisma.follow.findUnique({
      where: { userId_organizerId: { userId: req.user.id, organizerId } },
    });

    res.json({ isFollowing: !!follow });
  } catch (error) {
    console.error('Error checking follow status:', error);
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

// GET /organizers/pos-tiers — POS Value Unlock Tiers (Roadmap #127)
// Returns organizer's current tier status based on transaction count + minimum revenue
router.get('/pos-tiers', authenticate, getPosTierStatus);

// GET /organizers/export/csv?saleId=X&format=ebay|amazon|facebook — CSV Export (Roadmap #125)
// Export inventory items for a sale in platform-specific CSV formats (PRO tier required)
router.get('/export/csv', authenticate, getCsvExportHandler);

// ---- Feature #228: Dashboard Widget Endpoints ----

// GET /organizers/sale-pulse/:saleId — Sale Pulse engagement score
router.get('/sale-pulse/:saleId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    // Count page views (qrScanCount as proxy), item saves (favorites), shopper questions (conversations)
    const saleData = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        qrScanCount: true,
        _count: {
          select: {
            favorites: true,
            conversations: true,
            subscribers: true,
          },
        },
      },
    });

    const pageViews = saleData?.qrScanCount ?? 0;
    const itemSaves = saleData?._count?.favorites ?? 0;
    const shopperQuestions = saleData?._count?.conversations ?? 0;
    const shopperCount = saleData?._count?.subscribers ?? 0;

    // Buzz score: views×0.3 + saves×0.4 + questions×0.3, normalized 0-100
    const rawScore = pageViews * 0.3 + itemSaves * 0.4 + shopperQuestions * 0.3;
    const buzzscore = Math.min(100, Math.round(rawScore));

    res.json({
      saleId,
      pageViews,
      itemSaves,
      shopperQuestions,
      buzzscore,
      shopperCount,
    });
  } catch (error) {
    console.error('sale-pulse error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /organizers/smart-buyers/:saleId — Upcoming shoppers with tier + XP
router.get('/smart-buyers/:saleId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizer: { userId } },
      select: { id: true, organizerId: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found or access denied.' });

    // Get subscribers + favorites users for this sale, ranked by XP
    const subscribers = await prisma.saleSubscriber.findMany({
      where: { saleId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            guildXp: true,
            explorerRank: true,
            huntPassActive: true,
          },
        },
      },
    });

    const favoriteUsers = await prisma.favorite.findMany({
      where: { saleId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            guildXp: true,
            explorerRank: true,
            huntPassActive: true,
          },
        },
      },
    });

    // Deduplicate and merge
    const userMap = new Map<string, any>();
    [...subscribers, ...favoriteUsers].forEach((entry: any) => {
      if (entry.user && !userMap.has(entry.user.id)) {
        userMap.set(entry.user.id, entry.user);
      }
    });

    // Check which users follow this organizer
    const followerIds = await prisma.follow.findMany({
      where: { organizerId: sale.organizerId },
      select: { userId: true },
    });
    const followerSet = new Set(followerIds.map((f: any) => f.userId));

    const buyers = Array.from(userMap.values())
      .sort((a: any, b: any) => (b.guildXp || 0) - (a.guildXp || 0))
      .slice(0, 20)
      .map((user: any) => ({
        userId: user.id,
        displayName: user.name || 'Anonymous',
        avatarUrl: null,
        tier: user.huntPassActive ? 'HUNT_PASS' : 'FREE',
        xp: user.guildXp || 0,
        rank: user.explorerRank || 'INITIATE',
        isFollowing: followerSet.has(user.id),
      }));

    res.json(buyers);
  } catch (error) {
    console.error('smart-buyers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Feature #235: Charity Close + Tax Receipt PDF
// POST /api/organizer/sales/:saleId/donate — create charity donation
router.post('/sales/:saleId/donate', authenticate, createDonation);

// GET /api/organizer/sales/:saleId/donations — list donations for a sale
router.get('/sales/:saleId/donations', authenticate, getDonations);

// GET /api/organizer/donations/:donationId/receipt — generate tax receipt PDF
router.get('/donations/:donationId/receipt', authenticate, generateReceipt);

export default router;
