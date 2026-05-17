import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get top shoppers by guildXp
 * Returns anonymized names and XP score
 */
export const getShopperLeaderboard = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        guildXp: true,
        explorerRank: true,
        huntPassActive: true,
        userBadges: {
          select: {
            id: true,
            badge: {
              select: {
                id: true,
                name: true,
                iconUrl: true,
              },
            },
            awardedAt: true,
          },
          orderBy: {
            awardedAt: 'desc',
          },
          take: 3,
        },
      },
      orderBy: {
        guildXp: 'desc',
      },
      take: 50,
    });

    // Map to leaderboard format with guildXp as score
    const sorted = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id.slice(0, 4),
      name: user.name.split(' ')[0] || 'Shopper',
      score: user.guildXp ?? 0,
      explorerRank: user.explorerRank,
      huntPassActive: user.huntPassActive ?? false,
      badges: user.userBadges.map((ub) => ({
        id: ub.badge.id,
        name: ub.badge.name,
        iconUrl: ub.badge.iconUrl,
        awardedAt: ub.awardedAt.toISOString(),
      })),
    }));

    res.json(sorted);
  } catch (error) {
    console.error('Error fetching shopper leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};

/**
 * Get top organizers by number of completed sales
 * Returns organizer name, sale count, and total items sold
 */
export const getOrganizerLeaderboard = async (req: Request, res: Response) => {
  try {
    const organizers = await prisma.organizer.findMany({
      select: {
        id: true,
        businessName: true,
        user: {
          select: {
            id: true,
          },
        },
      },
      take: 100, // Fetch more to ensure we can sort all before slicing top 20
    });

    // Fetch sale and item counts for each organizer
    const leaderboardData = await Promise.all(
      organizers.map(async (org) => {
        const [completedSalesCount, totalItems] = await Promise.all([
          prisma.sale.count({
            where: {
              organizerId: org.id,
              status: 'ENDED',
            },
          }),
          prisma.item.count({
            where: {
              sale: {
                organizerId: org.id,
              },
              status: 'SOLD',
            },
          }),
        ]);

        return {
          organizerId: org.id, // Return full ID for frontend navigation
          organizerName: org.businessName,
          completedSales: completedSalesCount,
          totalItemsSold: totalItems,
        };
      })
    );

    // Sort by completed sales count (descending), then by total items sold (descending)
    const sorted = leaderboardData
      .sort((a, b) => {
        if (b.completedSales !== a.completedSales) {
          return b.completedSales - a.completedSales;
        }
        return b.totalItemsSold - a.totalItemsSold;
      })
      .slice(0, 20)
      .map((org, index) => ({
        rank: index + 1,
        ...org,
      }));

    res.json(sorted);
  } catch (error) {
    console.error('Error fetching organizer leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};

/**
 * Get top scouts (shoppers) by number of organizers they've introduced
 * Counts ShopperOrganizerIntroduction records where claimedAt IS NOT NULL (claimed storefront)
 * within the current calendar year (Jan 1 – Dec 31 UTC)
 * Returns top 25 scouts with current user's rank included if applicable
 */
export const getScoutLeaderboard = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getUTCFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);

    // Get current user from auth (if logged in)
    const authHeader = req.headers.authorization;
    let currentUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      // Basic JWT parsing to extract userId (full parsing happens in auth middleware elsewhere)
      try {
        const token = authHeader.substring(7);
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        currentUserId = decoded.userId || null;
      } catch (e) {
        // Token parse failed, continue without current user context
      }
    }

    // Query: Count claimed introductions (claimedAt IS NOT NULL) grouped by shopperId, within current year
    const scoutData = await prisma.shopperOrganizerIntroduction.groupBy({
      by: ['shopperId'],
      where: {
        claimedAt: {
          not: null,
        },
        introducedAt: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
      _count: {
        organizerId: true,
      },
      orderBy: {
        _count: {
          organizerId: 'desc',
        },
      },
      take: 25,
    });

    // Fetch user details for each scout
    const scouts = await Promise.all(
      scoutData.map(async (entry) => {
        const user = await prisma.user.findUnique({
          where: { id: entry.shopperId },
          select: {
            id: true,
            name: true,
            // avatarUrl not in schema, use placeholder or initials
          },
        });

        return {
          userId: entry.shopperId,
          displayName: user?.name || 'Scout',
          count: entry._count.organizerId,
        };
      })
    );

    // Determine current user's rank if logged in
    let currentUserRank: number | null = null;
    if (currentUserId) {
      const userIntroductionCount = await prisma.shopperOrganizerIntroduction.count({
        where: {
          shopperId: currentUserId,
          claimedAt: {
            not: null,
          },
          introducedAt: {
            gte: yearStart,
            lt: yearEnd,
          },
        },
      });

      if (userIntroductionCount > 0) {
        // Count how many scouts have MORE introductions
        const betterScouts = await prisma.shopperOrganizerIntroduction.groupBy({
          by: ['shopperId'],
          where: {
            claimedAt: {
              not: null,
            },
            introducedAt: {
              gte: yearStart,
              lt: yearEnd,
            },
          },
          _count: {
            organizerId: true,
          },
        });

        const currentUserRankValue = betterScouts.filter((s) => s._count.organizerId > userIntroductionCount).length + 1;
        currentUserRank = currentUserRankValue;
      }
    }

    // Map to final leaderboard format
    const entries = scouts.map((scout, index) => ({
      rank: index + 1,
      userId: scout.userId,
      displayName: scout.displayName,
      avatarUrl: null, // No avatar field in User schema
      count: scout.count,
      isCurrentUser: scout.userId === currentUserId,
    }));

    res.json({
      season: currentYear.toString(),
      resetDate: new Date(`${currentYear + 1}-01-01T00:00:00Z`).toISOString(),
      entries,
      currentUserRank,
    });
  } catch (error) {
    console.error('Error fetching scout leaderboard:', error);
    // Return empty result rather than 500 — allows the page to load shoppers/organizers
    // even when the ShopperOrganizerIntroduction table is missing (pending migration)
    const currentYear = new Date().getUTCFullYear();
    res.json({
      season: currentYear.toString(),
      resetDate: new Date(`${currentYear + 1}-01-01T00:00:00Z`).toISOString(),
      entries: [],
      currentUserRank: null,
    });
  }
};
