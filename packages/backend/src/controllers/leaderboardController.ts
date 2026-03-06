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
      orderBy: {
        streakPoints: 'desc',
      },
      take: 20,
    });

    // Anonymize and format response
    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id.slice(0, 4), // Mask user ID for privacy
      name: user.name.split(' ')[0] || 'Shopper', // First name only
      score: (user.streakPoints ?? 0) > 0 ? user.streakPoints : user.points,
      badges: [] as { id: string; name: string; iconUrl: string | null; awardedAt: Date }[],
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
      orderBy: {
        totalSales: 'desc',
      },
      take: 20,
    });

    // Fetch sale and item counts for each organizer
    const leaderboardData = await Promise.all(
      organizers.map(async (org, index) => {
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
          rank: index + 1,
          organizerId: org.id.slice(0, 4), // Mask for privacy
          organizerName: org.businessName,
          completedSales: completedSalesCount,
          totalItemsSold: totalItems,
        };
      })
    );

    res.json(leaderboardData);
  } catch (error) {
    console.error('Error fetching organizer leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching organizer leaderboard' });
  }
};