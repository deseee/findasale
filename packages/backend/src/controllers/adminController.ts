import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getMonthlyAICost, resetMonthlyAICost } from '../lib/aiCostTracker';
import { getMonthlyCloudinaryEstimate, getBandwidthThreshold, getTodayCloudinaryUsage, resetTodayCloudinaryUsage } from '../lib/cloudinaryBandwidthTracker';
import { getEbayRateLimitStatus } from '../lib/ebayRateLimiter';

// GET /api/admin/stats — platform overview
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    // #370 Canada Admin Analytics — optional country filter
    const countryFilter = (req.query.country as string) || null;
    const isCanadaFilter = countryFilter === 'CA';

    const totalUsers = await prisma.user.count({
      where: { email: { not: { endsWith: '@system.finda.sale' } } },
    });
    // CONTAMINATION FIX: Count only real organizers, exclude isUnmanagedListing: true
    const totalOrganizers = await prisma.organizer.count({
      where: { isUnmanagedListing: false },
    });
    const totalItems = await prisma.item.count();

    const salesByStatus = await prisma.sale.groupBy({
      by: ['status'],
      _count: true,
    });

    // Real vs scraped sale counts for Data Integrity section
    const [realSalesCount, scrapedSalesCount] = await Promise.all([
      prisma.sale.count({ where: { organizer: { isUnmanagedListing: false } } }),
      prisma.sale.count({ where: { organizer: { isUnmanagedListing: true } } }),
    ]);

    const totalPurchases = await prisma.purchase.aggregate({
      _sum: { amount: true },
      _count: true,
    });

    // New users in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newUsersLast7d = await prisma.user.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        email: { not: { endsWith: '@system.finda.sale' } },
      },
    });

    // New sales in last 7 days
    const newSalesLast7d = await prisma.sale.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Tier breakdown (real organizers only)
    const tierBreakdown = await prisma.organizer.groupBy({
      by: ['subscriptionTier'],
      _count: true,
      where: { isUnmanagedListing: false },
    });

    const tierBreakdownMap: Record<string, number> = {
      SIMPLE: 0,
      PRO: 0,
      TEAMS: 0,
    };
    tierBreakdown.forEach((t: any) => {
      tierBreakdownMap[t.subscriptionTier as string] = t._count;
    });

    // MRR calculation (real organizers only)
    const activePaidOrganizers = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: false,
        subscriptionStatus: 'active',
        subscriptionTier: { in: ['PRO', 'TEAMS'] },
      },
      select: { subscriptionTier: true },
      take: 10000,
    });

    let mrrCents = 0;
    activePaidOrganizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'PRO' ? 2900 : 7900;
      mrrCents += monthlyPrice;
    });

    // MRR by tier
    const mrrByTier = {
      PRO: 0,
      TEAMS: 0,
    };
    activePaidOrganizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'PRO' ? 2900 : 7900;
      mrrByTier[org.subscriptionTier as 'PRO' | 'TEAMS'] += monthlyPrice;
    });

    // Transaction revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const purchasesLast30d = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: 'PAID',
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: { subscriptionTier: true },
                },
              },
            },
          },
        },
      },
      take: 10000,
    });

    let transactionRevenueLast30d = 0;
    purchasesLast30d.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenueLast30d += Math.round(p.amount * feeRate * 100);
    });

    // Transaction revenue (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const purchasestoday = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: todayStart },
        status: 'PAID',
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: { subscriptionTier: true },
                },
              },
            },
          },
        },
      },
      take: 10000,
    });

    let transactionRevenueToday = 0;
    purchasestoday.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenueToday += Math.round(p.amount * feeRate * 100);
    });

    // Hunt Pass revenue (items with HUNT_PASS type if field exists; for now 0)
    const huntPassRevenueLast30d = 0;

    // À la carte revenue (items marked as alaCarte with fee paid)
    const alaCarteRevenueLast30d = 0;

    // Conversion funnel
    const totalSignups = totalUsers;
    const haveOrganizer = totalOrganizers;

    // Real organizers only for funnel metrics
    const createdOneSale = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        sales: {
          some: {},
        },
      },
    });

    const publishedOneSale = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        sales: {
          some: {
            status: { in: ['PUBLISHED', 'ENDED'] },
          },
        },
      },
    });

    const paidTier = await prisma.organizer.count({
      where: {
        isUnmanagedListing: false,
        subscriptionTier: { in: ['PRO', 'TEAMS'] },
      },
    });

    // 7-day sparklines
    const sparklines = {
      signups: [] as number[],
      transactionRevenue: [] as number[],
      newSales: [] as number[],
    };

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // New signups
      const signupCount = await prisma.user.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          email: { not: { endsWith: '@system.finda.sale' } },
        },
      });
      sparklines.signups.push(signupCount);

      // Transaction revenue
      const dayPurchases = await prisma.purchase.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          status: 'PAID',
        },
        include: {
          item: {
            select: {
              sale: {
                select: {
                  organizer: {
                    select: { subscriptionTier: true },
                  },
                },
              },
            },
          },
        },
        take: 10000,
      });

      let dayTransactionRevenue = 0;
      dayPurchases.forEach((p: any) => {
        const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
        const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
        dayTransactionRevenue += Math.round(p.amount * feeRate * 100);
      });
      sparklines.transactionRevenue.push(dayTransactionRevenue);

      // New sales
      const saleCount = await prisma.sale.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      });
      sparklines.newSales.push(saleCount);
    }

    const stats = {
      totalUsers,
      totalOrganizers,
      totalItems,
      totalSales: salesByStatus.reduce((acc: number, s: any) => acc + s._count, 0),
      salesByStatus: Object.fromEntries(
        salesByStatus.map((s: any) => [s.status, s._count])
      ),
      totalRevenue: totalPurchases._sum.amount || 0,
      totalPurchases: totalPurchases._count,
      newUsersLast7d,
      newSalesLast7d,
      tierBreakdown: tierBreakdownMap,
      mrr: mrrCents,
      mrrByTier,
      transactionRevenueLast30d,
      transactionRevenueToday,
      huntPassRevenueLast30d,
      aLaCarteRevenueLast30d: alaCarteRevenueLast30d,
      funnel: {
        totalSignups,
        haveOrganizer,
        createdOneSale,
        publishedOneSale,
        paidTier,
      },
      sparklines,
      ebayRateLimit: getEbayRateLimitStatus(),
      realSalesCount,
      scrapedSalesCount,
    };

    // #370 Canada Admin Analytics — compute canadaStats when country=CA
    if (isCanadaFilter) {
      const caOrganizerWhere = { isUnmanagedListing: false, country: 'CA' };

      const [caOrganizers, caSalesRaw, caRevenueRaw, caProvinceRaw] = await Promise.all([
        prisma.organizer.count({ where: caOrganizerWhere }),
        prisma.sale.count({
          where: { organizer: { country: 'CA', isUnmanagedListing: false } },
        }),
        prisma.purchase.findMany({
          where: { status: 'PAID', item: { sale: { organizer: { country: 'CA', isUnmanagedListing: false } } } },
          select: { amount: true },
          take: 10000,
        }),
        prisma.organizer.groupBy({
          by: ['province'],
          _count: true,
          where: { ...caOrganizerWhere, province: { not: null } },
          orderBy: { _count: { province: 'desc' } },
          take: 5,
        }),
      ]);

      const caRevenueCents = caRevenueRaw.reduce((sum: number, p: any) => sum + Math.round(p.amount * 100), 0);

      (stats as any).canadaStats = {
        totalOrganizers: caOrganizers,
        totalSales: caSalesRaw,
        totalRevenue: caRevenueCents,
        topProvinces: caProvinceRaw.map((r: any) => ({ province: r.province ?? 'Unknown', count: r._count })),
      };
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

// GET /api/admin/users — paginated user list
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const role = (req.query.role as string) || '';

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          purchases: { select: { id: true } },
          organizer: { select: { sales: { select: { id: true } } } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      purchaseCount: user.purchases.length,
      saleCount: user.organizer?.sales.length || 0,
    }));

    res.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// PATCH /api/admin/users/:userId/role — update user role
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!['USER', 'ORGANIZER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Prevent removing all admins
    if (role !== 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount === 1) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.role === 'ADMIN') {
          return res.status(400).json({ message: 'Cannot remove the last admin' });
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role, roles: [role], tokenVersion: { increment: 1 } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

// PATCH /api/admin/users/:userId/suspend — toggle user suspension
// Note: The suspended field doesn't exist in the schema yet, so this is a placeholder
export const suspendUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    // For now, just return success — suspended field would need a schema migration
    res.json({ message: 'User suspension placeholder (requires schema update)' });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ message: 'Failed to suspend user' });
  }
};

// GET /api/admin/sales — paginated sales list
export const getSales = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { organizer: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          organizer: { select: { businessName: true } },
          items: { select: { id: true } },
          purchases: { select: { amount: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sale.count({ where }),
    ]);

    const formattedSales = sales.map((sale: any) => ({
      id: sale.id,
      title: sale.title,
      status: sale.status,
      startDate: sale.startDate,
      endDate: sale.endDate,
      organizerName: sale.organizer.businessName,
      itemCount: sale.items.length,
      revenue: sale.purchases.reduce((sum: number, p: any) => sum + p.amount, 0),
    }));

    res.json({
      sales: formattedSales,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ message: 'Failed to fetch sales' });
  }
};

// DELETE /api/admin/sales/:saleId — delete a sale
export const deleteSale = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // Delete the sale — cascading deletes handle items, favorites, etc.
    await prisma.sale.delete({
      where: { id: saleId },
    });

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ message: 'Failed to delete sale' });
  }
};

// GET /api/admin/activity — recent platform activity
export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const [recentPurchases, recentUsers, recentSales] = await Promise.all([
      prisma.purchase.findMany({
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          item: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.sale.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          organizer: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      recentPurchases,
      recentUsers,
      recentSales,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
};

// PATCH /api/admin/organizers/:organizerId/tier — update organizer subscription tier
export const updateOrganizerTier = async (req: AuthRequest, res: Response) => {
  try {
    const { organizerId } = req.params;
    const { tier } = req.body;

    // Validate tier value against enum
    if (!['SIMPLE', 'PRO', 'TEAMS'].includes(tier)) {
      return res.status(400).json({ message: 'Invalid subscription tier. Must be SIMPLE, PRO, or TEAMS.' });
    }

    // Update organizer tier and increment tokenVersion to invalidate stale JWTs
    const updatedOrganizer = await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        subscriptionTier: tier,
        tokenVersion: {
          increment: 1,
        },
      },
      select: {
        id: true,
        subscriptionTier: true,
        tokenVersion: true,
        businessName: true,
      },
    });

    res.json(updatedOrganizer);
  } catch (error) {
    console.error('Error updating organizer tier:', error);
    res.status(500).json({ message: 'Failed to update organizer tier' });
  }
};

// GET /api/admin/ai-usage — #104 AI Cost Ceiling + Usage Tracking
export const getAIUsage = async (req: AuthRequest, res: Response) => {
  try {
    const usage = await getMonthlyAICost();
    const costPercentage = (usage.estimatedCost / usage.ceiling) * 100;

    res.json({
      monthKey: usage.monthKey,
      tokensUsed: usage.tokensUsed,
      estimatedCost: parseFloat(usage.estimatedCost.toFixed(2)),
      ceiling: usage.ceiling,
      costPercentage: parseFloat(costPercentage.toFixed(1)),
      status: usage.estimatedCost >= usage.ceiling ? 'EXCEEDED' : 'NORMAL',
    });
  } catch (error) {
    console.error('Error fetching AI usage:', error);
    res.status(500).json({ message: 'Failed to fetch AI usage' });
  }
};

// POST /api/admin/ai-usage/reset — #104 Reset monthly AI cost counter (admin only)
export const resetAIUsage = async (req: AuthRequest, res: Response) => {
  try {
    await resetMonthlyAICost();
    res.json({ message: 'AI usage counter reset successfully' });
  } catch (error) {
    console.error('Error resetting AI usage:', error);
    res.status(500).json({ message: 'Failed to reset AI usage' });
  }
};

// GET /api/admin/cloudinary-usage — #105 Cloudinary Bandwidth Monitoring + Alerts
export const getCloudinaryUsage = async (req: AuthRequest, res: Response) => {
  try {
    const monthlyUsage = getMonthlyCloudinaryEstimate();
    const todayUsage = getTodayCloudinaryUsage();
    const threshold = getBandwidthThreshold();

    const usagePercentage = (monthlyUsage.estimatedBandwidthGB / threshold.limitGB) * 100;

    res.json({
      today: {
        dateKey: todayUsage.dateKey,
        serveCount: todayUsage.serveCount,
        estimatedBandwidthGB: parseFloat(todayUsage.estimatedBandwidthGB.toFixed(2)),
      },
      month: {
        monthKey: monthlyUsage.monthKey,
        serveCount: monthlyUsage.serveCount,
        estimatedBandwidthGB: parseFloat(monthlyUsage.estimatedBandwidthGB.toFixed(2)),
      },
      threshold: {
        limitGB: threshold.limitGB,
        thresholdGB: parseFloat(threshold.thresholdGB.toFixed(2)),
        thresholdPct: threshold.thresholdPct,
      },
      status: monthlyUsage.estimatedBandwidthGB >= threshold.thresholdGB ? 'WARNING' : 'NORMAL',
      usagePercentage: parseFloat(usagePercentage.toFixed(1)),
    });
  } catch (error) {
    console.error('Error fetching Cloudinary usage:', error);
    res.status(500).json({ message: 'Failed to fetch Cloudinary usage' });
  }
};

// POST /api/admin/cloudinary-usage/reset — #105 Reset daily Cloudinary serve count (admin only)
export const resetCloudinaryUsage = async (req: AuthRequest, res: Response) => {
  try {
    resetTodayCloudinaryUsage();
    res.json({ message: 'Cloudinary usage counter reset successfully' });
  } catch (error) {
    console.error('Error resetting Cloudinary usage:', error);
    res.status(500).json({ message: 'Failed to reset Cloudinary usage' });
  }
};

// GET /api/admin/bid-review — #94 Admin Bid Review Queue (fraud detection)

export const getBidReviewQueue = async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.bidIpRecord.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bidId: true,
        ipAddress: true,
        createdAt: true,
        bid: {
          select: {
            id: true,
            amount: true,
            item: { select: { id: true, title: true, currentBid: true } },
            user: { select: { id: true, name: true, email: true } },
          }
        }
      }
    });

    const formatted = records.map((record: any) => ({
      id: record.id,
      bidId: record.bidId,
      itemId: record.bid?.item?.id,
      itemTitle: record.bid?.item?.title,
      bidAmount: record.bid?.amount,
      bidderId: record.bid?.user?.id,
      bidderName: record.bid?.user?.name,
      bidderEmail: record.bid?.user?.email,
      ipAddress: record.ipAddress,
      createdAt: record.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bid review queue:', error);
    res.status(500).json({ message: 'Failed to fetch bid review queue' });
  }
};

// PATCH /api/admin/bids/:bidId/action — #94 Admin Bid Action (flag, approve, dismiss)
export const adminBidAction = async (req: AuthRequest, res: Response) => {
  try {
    const { bidId } = req.params;
    const { action } = req.body;

    if (!['flag', 'approve', 'dismiss'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Must be flag, approve, or dismiss.' });
    }

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
    });

    if (!bid) {
      return res.status(404).json({ message: 'Bid not found' });
    }

    // For now, just acknowledge the action (can be extended to store action in DB later)
    console.log(`[admin] Bid ${bidId} action: ${action}`);

    res.json({ message: `Bid ${action}ed successfully`, bidId, action });
  } catch (error) {
    console.error('Error performing bid action:', error);
    res.status(500).json({ message: 'Failed to perform bid action' });
  }
};

// GET /api/admin/items — global items search
export const getAdminItems = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const where: any = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          category: true,
          photoUrls: true,
          sale: {
            select: {
              title: true,
              organizer: {
                select: { businessName: true },
              },
            },
          },
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.count({ where }),
    ]);

    const formatted = items.map((item: any) => ({
      id: item.id,
      title: item.title,
      price: item.price ? Math.round(item.price * 100) : 0, // cents
      status: item.status,
      category: item.category,
      photoUrl: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls[0] : null,
      organizerName: item.sale?.organizer?.businessName || 'Unknown',
      saleTitle: item.sale?.title || 'Unknown',
      createdAt: item.createdAt,
    }));

    res.json({
      items: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin items:', error);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
};

// GET /api/admin/feature-flags — list all feature flags
export const getFeatureFlags = async (req: AuthRequest, res: Response) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
      take: 1000,
    });

    res.json(flags);
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({ message: 'Failed to fetch feature flags' });
  }
};

// POST /api/admin/feature-flags — create new feature flag
export const createFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { key, description, enabled, tierRestricted } = req.body;

    // Validate required fields
    if (!key || !key.trim()) {
      return res.status(400).json({ message: 'Flag key is required' });
    }

    // Check for unique key
    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (existing) {
      return res.status(409).json({ message: 'A flag with this key already exists' });
    }

    const flag = await prisma.featureFlag.create({
      data: {
        key: key.trim(),
        description: description?.trim() || '',
        enabled: enabled === true,
        tierRestricted: tierRestricted || null,
        updatedBy: req.user?.email || req.user?.id || 'unknown',
      },
    });

    res.status(201).json(flag);
  } catch (error) {
    console.error('Error creating feature flag:', error);
    res.status(500).json({ message: 'Failed to create feature flag' });
  }
};

// PATCH /api/admin/feature-flags/:id — update feature flag
export const updateFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, description, tierRestricted } = req.body;

    // Build update data with only provided fields
    const updateData: any = {
      updatedBy: req.user?.email || req.user?.id || 'unknown',
    };

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (description !== undefined) {
      updateData.description = description.trim();
    }

    if (tierRestricted !== undefined) {
      updateData.tierRestricted = tierRestricted || null;
    }

    const flag = await prisma.featureFlag.update({
      where: { id },
      data: updateData,
    });

    res.json(flag);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Feature flag not found' });
    }
    console.error('Error updating feature flag:', error);
    res.status(500).json({ message: 'Failed to update feature flag' });
  }
};

// DELETE /api/admin/feature-flags/:id — delete feature flag
export const deleteFeatureFlag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.featureFlag.delete({
      where: { id },
    });

    res.json({ message: 'Feature flag deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Feature flag not found' });
    }
    console.error('Error deleting feature flag:', error);
    res.status(500).json({ message: 'Failed to delete feature flag' });
  }
};

// ─── Curator Review Job Controllers ─────────────────────────────────────────────

// POST /api/admin/curator/run — manually trigger curator review job
export const runCuratorReviewJob = async (req: AuthRequest, res: Response) => {
  try {
    const { runCuratorReview } = await import('../jobs/curatorReviewJob');
    const result = await runCuratorReview();
    res.json(result);
  } catch (error: any) {
    console.error('Error running curator review job:', error);
    res.status(500).json({ message: 'Failed to run curator review job', error: error.message });
  }
};

// GET /api/admin/curator/status — get curator job status and Encyclopedia entry counts
export const getCuratorStatus = async (req: AuthRequest, res: Response) => {
  try {
    const [autoGeneratedCount, publishedCount] = await Promise.all([
      prisma.encyclopediaEntry.count({ where: { status: 'AUTO_GENERATED' } }),
      prisma.encyclopediaEntry.count({ where: { status: 'PUBLISHED' } }),
    ]);

    // Count entries that have been enriched (content contains Wikipedia extract)
    const enrichedButFlaggedCount = await prisma.encyclopediaEntry.count({
      where: {
        status: 'AUTO_GENERATED',
        content: { contains: '## Overview' },
      },
    });

    res.json({
      autoGeneratedCount,
      publishedCount,
      enrichedButFlaggedCount,
      totalEncyclopediaEntries: autoGeneratedCount + publishedCount,
    });
  } catch (error: any) {
    console.error('Error fetching curator status:', error);
    res.status(500).json({ message: 'Failed to fetch curator status', error: error.message });
  }
};

// POST /api/admin/curator/run/:entryId — manually trigger curator review for a single entry (testing)
export const runCuratorReviewJobSingle = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { runCuratorReviewSingle } = await import('../jobs/curatorReviewJob');
    const result = await runCuratorReviewSingle(entryId);
    res.json(result);
  } catch (error: any) {
    console.error('Error running single curator review:', error);
    res.status(500).json({ message: 'Failed to run curator review', error: error.message });
  }
};

// GET /api/admin/curator/entries — get all AUTO_GENERATED encyclopedia entries awaiting review
export const getCuratorEntries = async (req: AuthRequest, res: Response) => {
  try {
    const entries = await prisma.encyclopediaEntry.findMany({
      where: { status: 'AUTO_GENERATED' },
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        content: true,
        triggerItemId: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    res.json({ entries });
  } catch (error: any) {
    console.error('Error fetching curator entries:', error);
    res.status(500).json({ message: 'Failed to fetch curator entries', error: error.message });
  }
};

// PATCH /api/admin/curator/entries/:entryId — update encyclopedia entry status (e.g., mark as REJECTED)
export const updateCuratorEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'FLAGGED', 'AUTO_GENERATED', 'UNDER_REVIEW', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updated = await prisma.encyclopediaEntry.update({
      where: { id: entryId },
      data: { status },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Encyclopedia entry not found' });
    }
    console.error('Error updating curator entry:', error);
    res.status(500).json({ message: 'Failed to update curator entry', error: error.message });
  }
};

// GET /api/admin/scrape-pool-stats — scrape pool analytics dashboard
export const getScrapePoolStats = async (req: AuthRequest, res: Response) => {
  try {
    const activeScrapedWhere = { isUnmanagedListing: true, directoryStatus: { not: 'CLOSED' as const } };

    // Total scraped organizers
    const totalScrapedOrgs = await prisma.organizer.count({
      where: activeScrapedWhere,
    });

    // Tier distribution for scraped orgs
    const tierDistribution = await prisma.organizer.groupBy({
      by: ['leadTier'],
      _count: true,
      where: activeScrapedWhere,
    });

    const tierMap: Record<string, number> = {
      COLD: 0,
      WARM: 0,
      HOT: 0,
      ENTERPRISE: 0,
    };
    tierDistribution.forEach((t: any) => {
      if (t.leadTier && t.leadTier in tierMap) {
        tierMap[t.leadTier as string] = t._count;
      }
    });

    // Lead score stats for scraped orgs
    const scrapedOrgs = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: { leadScore: true },
      take: 10000,
    });

    const leadScores = scrapedOrgs
      .map((o) => o.leadScore)
      .filter((score) => score !== null) as number[];

    let leadScoreStats = {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
    };

    if (leadScores.length > 0) {
      leadScoreStats = {
        min: Math.min(...leadScores),
        max: Math.max(...leadScores),
        avg: Math.round((leadScores.reduce((a, b) => a + b, 0) / leadScores.length) * 100) / 100,
        median: (() => {
          const sorted = [...leadScores].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        })(),
      };
    }

    // Enrichment coverage
    const enrichmentOrgs = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: {
        scrapedEmail: true,
        contactEmail: true,
        lat: true,
        lng: true,
        isStateLicensed: true,
        googlePlaceId: true,
      },
      take: 10000,
    });

    const enrichmentCoverage = {
      withEmail: enrichmentOrgs.filter((o) => o.scrapedEmail || o.contactEmail).length,
      geocoded: enrichmentOrgs.filter((o) => o.lat !== null && o.lng !== null).length,
      licensed: enrichmentOrgs.filter((o) => o.isStateLicensed === true).length,
      googlePlaced: enrichmentOrgs.filter((o) => o.googlePlaceId).length,
    };

    const enrichmentPercentages = {
      withEmail: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.withEmail / totalScrapedOrgs) * 100) : 0,
      geocoded: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.geocoded / totalScrapedOrgs) * 100) : 0,
      licensed: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.licensed / totalScrapedOrgs) * 100) : 0,
      googlePlaced: totalScrapedOrgs > 0 ? Math.round((enrichmentCoverage.googlePlaced / totalScrapedOrgs) * 100) : 0,
    };

    // Outreach status
    const outreachOrgsWithSent = await prisma.organizer.findMany({
      where: {
        ...activeScrapedWhere,
        outreachAuditLogs: {
          some: { event: 'SENT' },
        },
      },
      select: { id: true },
      take: 10000,
    });

    const outreachOrgsWithOpened = await prisma.organizer.findMany({
      where: {
        ...activeScrapedWhere,
        outreachAuditLogs: {
          some: { event: 'OPENED' },
        },
      },
      select: { id: true },
      take: 10000,
    });

    const outreachOrgsWithBounced = await prisma.organizer.findMany({
      where: {
        ...activeScrapedWhere,
        outreachAuditLogs: {
          some: { event: 'BOUNCED' },
        },
      },
      select: { id: true },
      take: 10000,
    });

    // Last scrape runs grouped by source
    const scrapeRuns = await prisma.scrapedSalesJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { source: true, createdAt: true },
    });

    const lastScrapeRunsBySource: Record<string, string> = {};
    const sourceNames = new Set<string>();
    scrapeRuns.forEach((run: any) => {
      if (run.source && !sourceNames.has(run.source)) {
        lastScrapeRunsBySource[run.source] = run.createdAt.toISOString();
        sourceNames.add(run.source);
      }
    });

    // Recent additions (last 50 scraped orgs)
    const recentAdditions = await prisma.organizer.findMany({
      where: activeScrapedWhere,
      select: {
        id: true,
        businessName: true,
        address: true,
        leadTier: true,
        leadScore: true,
        scrapedEmail: true,
        directoryMostRecentSource: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const stats = {
      totalScrapedOrgs,
      tierDistribution: tierMap,
      leadScoreStats,
      enrichmentCoverage: enrichmentPercentages,
      outreachStatus: {
        contacted: outreachOrgsWithSent.length,
        opened: outreachOrgsWithOpened.length,
        bounced: outreachOrgsWithBounced.length,
      },
      lastScrapeRuns: lastScrapeRunsBySource,
      recentAdditions,
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching scrape pool stats:', error);
    res.status(500).json({ message: 'Failed to fetch scrape pool stats', error: error.message });
  }
};

// GET /api/admin/scraper/metros — return the full NATIONAL_METROS list for the admin picker
export async function getScrapeMetros(req: Request, res: Response): Promise<void> {
  try {
    const { NATIONAL_METROS } = await import('../jobs/scraperCron');
    res.json({ metros: NATIONAL_METROS });
  } catch {
    // Fallback if import fails — return empty so UI still works
    res.json({ metros: [] });
  }
}
// GET /api/admin/outreach-stats — Outreach email funnel metrics
export const getOutreachStats = async (req: AuthRequest, res: Response) => {
  try {
    const [
      totalInQueue,
      totalSent,
      totalClaimed,
      totalBounced,
      totalOptedOut,
      touch1Sent,
      touch1Opened,
      touch1Clicked,
      touch2Sent,
      touch2Opened,
      touch2Clicked,
      touch3Sent,
      touch3Opened,
      touch3Clicked,
      touch4Sent,
      touch4Opened,
      touch4Clicked,
    ] = await Promise.all([
      prisma.directoryClaimEmail.count(),
      prisma.directoryClaimEmail.count({ where: { OR: [{ status: 'SENT' }, { sentAt: { not: null } }] } }),
      prisma.directoryClaimEmail.count({ where: { status: 'CLAIMED' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'BOUNCED' } }),
      prisma.directoryClaimEmail.count({ where: { status: 'OPTED_OUT' } }),
      prisma.directoryClaimEmail.count({ where: { touch1SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch1Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch1Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch2SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch2Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch2Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch3SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch3Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch3Clicked: true } }),
      prisma.directoryClaimEmail.count({ where: { touch4SentAt: { not: null } } }),
      prisma.directoryClaimEmail.count({ where: { touch4Opened: true } }),
      prisma.directoryClaimEmail.count({ where: { touch4Clicked: true } }),
    ]);

    const pctStr = (num: number, den: number) =>
      den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '0.0%';

    res.json({
      totalInQueue,
      totalSent,
      totalClaimed,
      totalBounced,
      totalOptedOut,
      touch1: { sent: touch1Sent, opened: touch1Opened, clicked: touch1Clicked, openRate: pctStr(touch1Opened, touch1Sent), clickRate: pctStr(touch1Clicked, touch1Sent) },
      touch2: { sent: touch2Sent, opened: touch2Opened, clicked: touch2Clicked, openRate: pctStr(touch2Opened, touch2Sent), clickRate: pctStr(touch2Clicked, touch2Sent) },
      touch3: { sent: touch3Sent, opened: touch3Opened, clicked: touch3Clicked, openRate: pctStr(touch3Opened, touch3Sent), clickRate: pctStr(touch3Clicked, touch3Sent) },
      touch4: { sent: touch4Sent, opened: touch4Opened, clicked: touch4Clicked, openRate: pctStr(touch4Opened, touch4Sent), clickRate: pctStr(touch4Clicked, touch4Sent) },
      conversionRate: pctStr(totalClaimed, totalSent),
    });
  } catch (error) {
    console.error('Error fetching outreach stats:', error);
    res.status(500).json({ message: 'Failed to fetch outreach stats' });
  }
};

// GET /api/admin/drilldown/:metric — drill-down data for KPI cards
export const getDrilldown = async (req: AuthRequest, res: Response) => {
  try {
    const { metric } = req.params;

    if (metric === 'signups') {
      const users = await prisma.user.findMany({
        where: { email: { not: { endsWith: '@system.finda.sale' } } },
        select: { id: true, name: true, email: true, createdAt: true, roles: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json({ users });
    }

    if (metric === 'sales') {
      const [realSalesCount, scrapedSalesCount, claimedCount, publishedCount, endedCount, recentReal] = await Promise.all([
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: false } } }),
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: true } } }),
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: false, isClaimed: true } } }),
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: false }, status: 'PUBLISHED' } }),
        prisma.sale.count({ where: { organizer: { isUnmanagedListing: false }, status: 'ENDED' } }),
        prisma.sale.findMany({
          where: { organizer: { isUnmanagedListing: false } },
          select: { id: true, title: true, status: true, createdAt: true, organizer: { select: { businessName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      return res.json({ real: realSalesCount, scraped: scrapedSalesCount, claimed: claimedCount, published: publishedCount, ended: endedCount, recentReal });
    }

    if (metric === 'scrapedsales') {
      const sales = await prisma.sale.findMany({
        where: { organizer: { isUnmanagedListing: true } },
        select: { id: true, title: true, status: true, createdAt: true, organizer: { select: { businessName: true, isClaimed: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return res.json({ sales });
    }

    return res.status(400).json({ message: 'Unknown metric. Use: signups, sales, scrapedsales' });
  } catch (error) {
    console.error('Error fetching drilldown:', error);
    res.status(500).json({ message: 'Failed to fetch drilldown data' });
  }
};
