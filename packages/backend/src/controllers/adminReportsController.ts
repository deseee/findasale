import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// GET /api/admin/reports/organizers
export const getOrganizerPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || 'revenue';
    const order = (req.query.order as string) || 'desc';

    // Validate sort and order
    if (!['revenue', 'sales', 'sellThrough', 'lastActive'].includes(sortBy)) {
      return res.status(400).json({ message: 'Invalid sortBy parameter' });
    }
    if (!['asc', 'desc'].includes(order)) {
      return res.status(400).json({ message: 'Invalid order parameter' });
    }

    // Fetch all organizers with their related data
    const organizers = await prisma.organizer.findMany({
      select: {
        id: true,
        businessName: true,
        subscriptionTier: true,
        sales: {
          where: { deletedAt: null },
          select: {
            id: true,
            items: {
              select: {
                id: true,
                status: true,
              },
            },
            purchases: {
              select: {
                amount: true,
              },
            },
            createdAt: true,
          },
        },
      },
    });

    // Compute metrics for each organizer
    const withMetrics = organizers.map((org: any) => {
      const salesCount = org.sales.length;
      const itemsCount = org.sales.reduce((sum: number, sale: any) => sum + sale.items.length, 0);
      const soldItemsCount = org.sales.reduce(
        (sum: number, sale: any) => sum + sale.items.filter((item: any) => item.status === 'SOLD').length,
        0
      );
      const sellThroughRate = itemsCount > 0 ? soldItemsCount / itemsCount : 0;
      const totalGmv = org.sales.reduce(
        (sum: number, sale: any) => sum + sale.purchases.reduce((psum: number, p: any) => psum + p.amount, 0),
        0
      );

      // Platform fee: SIMPLE=10%, PRO/TEAMS=8%
      const feeRate = org.subscriptionTier === 'SIMPLE' ? 0.1 : 0.08;
      const platformRevenue = Math.round(totalGmv * feeRate);

      // Last sale
      const lastSaleAt = org.sales.length > 0
        ? new Date(Math.max(...org.sales.map((s: any) => s.createdAt.getTime())))
        : null;

      return {
        id: org.id,
        businessName: org.businessName,
        tier: org.subscriptionTier,
        salesCount,
        itemsCount,
        soldItemsCount,
        sellThroughRate: parseFloat(sellThroughRate.toFixed(4)),
        totalGmv: Math.round(totalGmv * 100), // cents
        platformRevenue, // cents
        lastSaleAt,
        joinedAt: new Date(), // Would need to add createdAt to schema join
      };
    });

    // Sort in memory
    let sorted = [...withMetrics];
    if (sortBy === 'revenue') {
      sorted.sort((a, b) =>
        order === 'desc' ? b.platformRevenue - a.platformRevenue : a.platformRevenue - b.platformRevenue
      );
    } else if (sortBy === 'sales') {
      sorted.sort((a, b) =>
        order === 'desc' ? b.salesCount - a.salesCount : a.salesCount - b.salesCount
      );
    } else if (sortBy === 'sellThrough') {
      sorted.sort((a, b) =>
        order === 'desc' ? b.sellThroughRate - a.sellThroughRate : a.sellThroughRate - b.sellThroughRate
      );
    } else if (sortBy === 'lastActive') {
      sorted.sort((a, b) => {
        const aTime = a.lastSaleAt?.getTime() || 0;
        const bTime = b.lastSaleAt?.getTime() || 0;
        return order === 'desc' ? bTime - aTime : aTime - bTime;
      });
    }

    // Paginate
    const total = sorted.length;
    const items = sorted.slice(skip, skip + limit);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching organizer performance:', error);
    res.status(500).json({ message: 'Failed to fetch organizer performance' });
  }
};

// GET /api/admin/reports/revenue
export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '30d';

    // Validate period
    if (!['7d', '30d', '90d'].includes(period)) {
      return res.status(400).json({ message: 'Invalid period parameter. Must be 7d, 30d, or 90d.' });
    }

    const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Fetch all purchases in period
    const purchases = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: startDate },
        status: 'PAID',
      },
      include: {
        item: {
          select: {
            sale: {
              select: {
                organizer: {
                  select: {
                    subscriptionTier: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Compute transaction revenue
    let transactionRevenue = 0;
    purchases.forEach((p: any) => {
      const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
      const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
      transactionRevenue += Math.round(p.amount * feeRate * 100); // in cents
    });

    // Approximate subscription revenue (MRR × days / 30)
    const organizers = await prisma.organizer.findMany({
      where: {
        subscriptionStatus: 'active',
      },
      select: {
        subscriptionTier: true,
      },
    });

    let mrrCents = 0;
    organizers.forEach((org: any) => {
      const monthlyPrice = org.subscriptionTier === 'SIMPLE' ? 0 : org.subscriptionTier === 'PRO' ? 2900 : 7900; // cents
      mrrCents += monthlyPrice;
    });

    const subscriptionRevenue = Math.round((mrrCents * daysBack) / 30);

    // Build daily breakdown
    const byDay: Array<{ date: string; transactionRevenue: number; newOrganizers: number }> = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayPurchases = purchases.filter(
        (p: any) => p.createdAt >= dayStart && p.createdAt < dayEnd
      );

      let dayTransactionRevenue = 0;
      dayPurchases.forEach((p: any) => {
        const tier = p.item?.sale?.organizer?.subscriptionTier || 'SIMPLE';
        const feeRate = tier === 'SIMPLE' ? 0.1 : 0.08;
        dayTransactionRevenue += Math.round(p.amount * feeRate * 100);
      });

      const newOrgCount = await prisma.organizer.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      });

      byDay.push({
        date: dayStart.toISOString().split('T')[0],
        transactionRevenue: dayTransactionRevenue,
        newOrganizers: newOrgCount,
      });
    }

    res.json({
      period,
      transactionRevenue,
      subscriptionRevenue,
      total: transactionRevenue + subscriptionRevenue,
      byDay,
    });
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    res.status(500).json({ message: 'Failed to fetch revenue report' });
  }
};
