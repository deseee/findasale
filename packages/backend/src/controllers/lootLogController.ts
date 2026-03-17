import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get authenticated user's loot log (PAID purchases only)
 */
export const getMyLootLog = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          userId,
          status: 'PAID',
        },
        include: {
          item: {
            select: {
              id: true,
              title: true,
              price: true,
              category: true,
              imageUrl: true,
            },
          },
          sale: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({
        where: {
          userId,
          status: 'PAID',
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      purchases,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error('getMyLootLog error:', error);
    res.status(500).json({ error: 'Failed to fetch loot log' });
  }
};

/**
 * Get authenticated user's loot log statistics
 */
export const getLootLogStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all PAID purchases for this user
    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        status: 'PAID',
      },
      include: {
        item: {
          select: {
            category: true,
          },
        },
        sale: {
          select: {
            id: true,
          },
        },
      },
    });

    // Calculate stats
    const totalFinds = purchases.length;
    const totalSpent = purchases.reduce((sum, p) => sum + p.amount, 0);

    // Find favorite category (most purchased)
    const categoryCount: Record<string, number> = {};
    purchases.forEach((p) => {
      const category = p.item.category || 'Uncategorized';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    const favoriteCategory =
      Object.entries(categoryCount).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Count unique sales
    const uniqueSaleIds = new Set(purchases.map((p) => p.sale.id));
    const uniqueSales = uniqueSaleIds.size;

    res.json({
      totalFinds,
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      favoriteCategory,
      uniqueSales,
    });
  } catch (error) {
    console.error('getLootLogStats error:', error);
    res.status(500).json({ error: 'Failed to fetch loot log stats' });
  }
};

/**
 * Get single purchase detail (verify ownership)
 */
export const getLootLogItem = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { purchaseId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: true,
        sale: {
          select: {
            id: true,
            title: true,
            startDate: true,
            address: true,
          },
        },
      },
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(purchase);
  } catch (error) {
    console.error('getLootLogItem error:', error);
    res.status(500).json({ error: 'Failed to fetch purchase detail' });
  }
};

/**
 * Get public loot log for a user (if user has public profile or public loot log setting)
 */
export const getPublicLootLog = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    // Check if user exists and has public profile/loot log
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        profilePublic: true,
      },
    });

    if (!user || !user.profilePublic) {
      return res.status(404).json({ error: 'User profile not found or is private' });
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          userId,
          status: 'PAID',
        },
        include: {
          item: {
            select: {
              id: true,
              title: true,
              category: true,
              imageUrl: true,
            },
          },
          sale: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchase.count({
        where: {
          userId,
          status: 'PAID',
        },
      }),
    ]);

    // Remove price from items for public view
    const publicPurchases = purchases.map((p) => ({
      ...p,
      item: {
        ...p.item,
      },
    }));

    const totalPages = Math.ceil(total / limit);

    res.json({
      user: {
        id: user.id,
        name: user.name,
      },
      purchases: publicPurchases,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error('getPublicLootLog error:', error);
    res.status(500).json({ error: 'Failed to fetch public loot log' });
  }
};
