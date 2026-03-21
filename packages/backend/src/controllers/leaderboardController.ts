import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get top shoppers by streakPoints (or points if streakPoints not available)
 * Returns anonymized names and points
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
        streakPoints: true,
        points: true,
      },
      take: 50,
    });

    // Compute score for each user, then sort by score DESC with nulls last
    const usersWithScore = users.map((user) => ({
      ...user,
      score: (user.streakPoints ?? 0) > 0 ? user.streakPoints : user.points,
    }));

    const sorted = usersWithScore
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      })
      .slice(0, 20);

    // Anonymize and format response
    const leaderboard = sorted.map((user, index) => ({
      rank: index + 1,
      userId: user.id.slice(0, 4), // Mask user ID for privacy
      name: user.name.split(' ')[0] || 'Shopper', // First name only
      score: user.score,
    }));

    res.json(leaderboard);
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
          organizerId: org.id.slice(0, 4), // Mask for privacy
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
