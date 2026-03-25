import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getMonthlyAICost, resetMonthlyAICost } from '../lib/aiCostTracker';
import { getMonthlyCloudinaryEstimate, getBandwidthThreshold, getTodayCloudinaryUsage, resetTodayCloudinaryUsage } from '../lib/cloudinaryBandwidthTracker';

// GET /api/admin/stats — platform overview
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalOrganizers = await prisma.organizer.count();
    const totalItems = await prisma.item.count();

    const salesByStatus = await prisma.sale.groupBy({
      by: ['status'],
      _count: true,
    });

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
      },
    });

    // New sales in last 7 days
    const newSalesLast7d = await prisma.sale.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    });

    const stats = {
      totalUsers,
      totalOrganizers,
      totalItems,
      totalSales: salesByStatus.reduce((acc, s) => acc + s._count, 0),
      salesByStatus: Object.fromEntries(
        salesByStatus.map(s => [s.status, s._count])
      ),
      totalRevenue: totalPurchases._sum.amount || 0,
      totalPurchases: totalPurchases._count,
      newUsersLast7d,
      newSalesLast7d,
    };

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

    const formattedUsers = users.map(user => ({
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
      data: { role },
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

    const formattedSales = sales.map(sale => ({
      id: sale.id,
      title: sale.title,
      status: sale.status,
      startDate: sale.startDate,
      endDate: sale.endDate,
      organizerName: sale.organizer.businessName,
      itemCount: sale.items.length,
      revenue: sale.purchases.reduce((sum, p) => sum + p.amount, 0),
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
    const usage = getMonthlyAICost();
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
    resetMonthlyAICost();
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
      include: {
        bid: {
          include: {
            item: { select: { id: true, title: true, currentBid: true } },
            user: { select: { id: true, name: true, email: true } },
          }
        }
      }
    });

    const formatted = records.map(record => ({
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
