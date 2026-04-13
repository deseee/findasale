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
