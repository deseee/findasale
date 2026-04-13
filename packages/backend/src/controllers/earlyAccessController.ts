import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { spendXp, getSpendableXp } from '../services/xpService';

// Valid categories for Early Access Cache
const VALID_CATEGORIES = [
  'FURNITURE',
  'VINTAGE_COLLECTIBLES',
  'ART_FRAMES',
  'JEWELRY_WATCHES',
  'BOOKS_MEDIA',
  'KITCHENWARE',
  'FASHION',
  'SPORTS_OUTDOOR',
];

/**
 * GET /api/early-access-cache/status
 * Returns user's active early access windows and weekly cooldowns
 * Auth required
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();

    // Get active windows (not yet expired)
    const activeWindows = await prisma.earlyAccessCache.findMany({
      where: {
        userId,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        category: true,
        expiresAt: true,
        itemsCount: true,
      },
      orderBy: {
        expiresAt: 'asc',
      },
    });

    // Calculate weekly cooldowns
    // Sunday-Saturday UTC
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    // Get all activations this week
    const weekActivations = await prisma.earlyAccessCache.findMany({
      where: {
        userId,
        activatedAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      select: {
        category: true,
      },
    });

    // Build cooldown map
    const cooldownMap: Record<string, string> = {};
    const activeCategoriesThisWeek = new Set(weekActivations.map((a: any) => a.category));

    for (const category of VALID_CATEGORIES) {
      if (activeCategoriesThisWeek.has(category)) {
        // Next available: next Sunday UTC
        const nextAvailable = new Date(weekEnd);
        nextAvailable.setUTCHours(0, 0, 0, 0);
        cooldownMap[category] = nextAvailable.toISOString();
      }
    }

    res.json({
      activeWindows,
      weeklyCooldowns: cooldownMap,
    });
  } catch (error) {
    console.error('[earlyAccessController] Failed to fetch status:', error);
    res.status(500).json({ error: 'Failed to fetch early access status' });
  }
};

/**
 * POST /api/early-access-cache/activate
 * Spend 100 XP to activate early access for a category
 * Auth required
 * Body: { category: string }
 */
export const activate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { category } = req.body;

    // Validate category
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category',
        valid: VALID_CATEGORIES,
      });
    }

    // Get user and check XP balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildXp: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check spendable XP (respects holds)
    const spendableXp = await getSpendableXp(userId);
    if (spendableXp < 100) {
      return res.status(400).json({
        error: 'Insufficient XP',
        required: 100,
        available: spendableXp,
      });
    }

    // Check if category already active this week
    const now = new Date();
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const existing = await prisma.earlyAccessCache.findFirst({
      where: {
        userId,
        category,
        activatedAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
    });

    if (existing) {
      return res.status(400).json({
        error: 'Category already active this week',
        expiresAt: existing.expiresAt,
      });
    }

    // Spend XP
    const spent = await spendXp(userId, 100, 'EARLY_ACCESS_BOOST', {
      description: `Early Access Cache activation for ${category}`,
    });

    if (!spent) {
      return res.status(400).json({
        error: 'Failed to spend XP',
      });
    }

    // Create early access cache entry (48 hours from now)
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const cache = await prisma.earlyAccessCache.create({
      data: {
        userId,
        category,
        expiresAt,
      },
    });

    // Get updated XP balance
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildXp: true },
    });

    res.json({
      success: true,
      expiresAt: cache.expiresAt,
      newXpBalance: updatedUser?.guildXp || 0,
    });
  } catch (error) {
    console.error('[earlyAccessController] Failed to activate:', error);
    res.status(500).json({ error: 'Failed to activate early access' });
  }
};

/**
 * GET /api/early-access-cache/items
 * Returns items matching user's active early access windows
 * Filters: createdAt >= window activatedAt, category matches, status = AVAILABLE
 * Sorts by createdAt DESC
 * Auth required
 */
export const getItems = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();

    // Get active windows
    const activeWindows = await prisma.earlyAccessCache.findMany({
      where: {
        userId,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        category: true,
        activatedAt: true,
      },
    });

    if (activeWindows.length === 0) {
      return res.json([]);
    }

    // Query items for each active window
    const allItems = await prisma.item.findMany({
      where: {
        OR: activeWindows.map((window: any) => ({
          category: window.category,
          createdAt: {
            gte: window.activatedAt,
          },
          status: 'AVAILABLE',
          isActive: true,
        })),
      },
      select: {
        id: true,
        title: true,
        price: true,
        photoUrls: true,
        saleId: true,
        category: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(allItems);
  } catch (error) {
    console.error('[earlyAccessController] Failed to fetch items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};
