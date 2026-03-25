import { Request, Response } from 'express';
import { getPassport } from '../services/loyaltyService';
import { prisma } from '../index';

/**
 * GET /api/loyalty/passport
 * Authenticated endpoint. Returns user's loyalty passport data.
 */
export async function getMyPassport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const passport = await getPassport(userId);
    res.json(passport);
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Hunt Pass Feature #29: Loot Legend Portfolio
 * GET /api/loyalty/loot-legend
 * Returns LEGENDARY and EPIC items purchased by current user
 */
export async function getLootLegend(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        item: {
          rarity: {
            in: ['LEGENDARY']
          }
        }
      },
      select: {
        id: true,
        itemId: true,
        createdAt: true,
        item: {
          select: {
            id: true,
            title: true,
            photoUrls: true,
            rarity: true,
            sale: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching loot legend:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Hunt Pass Feature: Collector's League Leaderboard
 * GET /api/loyalty/collector-league
 * Returns top 50 Hunt Pass holders by guildXp
 */
export async function getCollectorLeague(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    const now = new Date();
    const topUsers = await prisma.user.findMany({
      where: {
        huntPassActive: true,
        huntPassExpiry: { gt: now }
      },
      select: {
        id: true,
        name: true,
        explorerRank: true,
        guildXp: true
      },
      orderBy: {
        guildXp: 'desc'
      },
      take: 50
    });

    // Add rank position and highlight current user
    const leaderboard = topUsers.map((user, index) => ({
      position: index + 1,
      ...user,
      isCurrentUser: userId ? user.id === userId : false
    }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching collector league:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
