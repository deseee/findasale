import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Helper function to convert Decimal values to numbers recursively
const convertDecimalsToNumbers = (obj: any) => {
  if (!obj) return obj;
  
  const converted: any = {};
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object' && 'toNumber' in obj[key]) {
      // Convert Decimal to number
      converted[key] = obj[key].toNumber();
    } else if (Array.isArray(obj[key])) {
      // Recursively process arrays
      converted[key] = obj[key].map((item: any) => 
        typeof item === 'object' ? convertDecimalsToNumbers(item) : item
      );
    } else if (obj[key] && typeof obj[key] === 'object') {
      // Recursively process nested objects
      converted[key] = convertDecimalsToNumbers(obj[key]);
    } else {
      converted[key] = obj[key];
    }
  }
  return converted;
};

export const getPurchases = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        item: {
          select: {
            title: true,
            photoUrls: true,
          },
        },
        sale: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    // Convert Decimal values to numbers
    const convertedPurchases = purchases.map((purchase: any) => convertDecimalsToNumbers(purchase));
    
    res.json(convertedPurchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ message: 'Server error while fetching purchases' });
  }
};

export const getFavorites = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const favorites = await prisma.favorite.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        sale: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            city: true,
            state: true,
            photoUrls: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    res.json(favorites);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ message: 'Server error while fetching favorites' });
  }
};

export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        userBadges: {
          include: {
            badge: true
          }
        },
        organizer: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert to plain object and remove password
    const { password, ...userWithoutPassword } = user;
    
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error while fetching user profile' });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'USER'
      },
      orderBy: {
        points: 'desc'
      },
      take: 10,
      select: {
        id: true,
        name: true,
        points: true,
        userBadges: {          // ✅ FIXED: use 'userBadges' not 'UserBadge'
          include: {
            badge: {
              select: {
                name: true,
                iconUrl: true
              }
            }
          }
        }
      }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};

export const awardBadge = async (userId: string, badgeCriteriaType: string, count: number) => {
  try {
    // Find badges that match the criteria
    const badges = await prisma.badge.findMany({
      where: {
        criteria: {
          path: ['type'],
          equals: badgeCriteriaType
        }
      },
      take: 50,
    });

    for (const badge of badges) {
      const badgeCriteria = JSON.parse(JSON.stringify(badge.criteria));
      
      // Check if user qualifies for this badge
      if (count >= badgeCriteria.count) {
        // Check if user already has this badge
        const existingUserBadge = await prisma.userBadge.findUnique({
          where: {
            userId_badgeId: {
              userId,
              badgeId: badge.id
            }
          }
        });

        if (!existingUserBadge) {
          // Award the badge
          await prisma.userBadge.create({
            data: {
              userId,
              badgeId: badge.id
            }
          });

          console.log(`Awarded badge "${badge.name}" to user ${userId}`);
          
          // TODO: Implement notification system when ready
          // Create notification for user
          // await prisma.notification.create({
          //   data: {
          //     userId,
          //     title: 'New Badge Earned!',
          //     message: `Congratulations! You've earned the "${badge.name}" badge.`,
          //     type: 'BADGE'
          //   }
          // });
        }
      }
    }
  } catch (error) {
    console.error('Error awarding badge:', error);
  }
};

// Call this function when a user makes a purchase
export const handlePurchaseBadge = async (userId: string) => {
  try {
    // Count user's purchases
    const purchaseCount = await prisma.purchase.count({
      where: { userId }
    });

    // Award badge based on purchase count
    await awardBadge(userId, 'purchases_made', purchaseCount);
  } catch (error) {
    console.error('Error handling purchase badge:', error);
  }
};

// Call this function when a user creates a favorite
export const handleFavoriteBadge = async (userId: string) => {
  try {
    // Count user's favorites
    const favoriteCount = await prisma.favorite.count({
      where: { userId }
    });

    // Award badge based on favorite count
    await awardBadge(userId, 'sales_visited', favoriteCount);
  } catch (error) {
    console.error('Error handling favorite badge:', error);
  }
};

// Call this function when a user refers someone
export const handleReferralBadge = async (userId: string) => {
  try {
    // Count user's referrals
    const referralCount = await prisma.referral.count({
      where: { referrerId: userId }
    });

    // Award badge based on referral count
    await awardBadge(userId, 'referrals_made', referralCount);
  } catch (error) {
    console.error('Error handling referral badge:', error);
  }
};

// Call this function when points are updated
export const handlePointsBadge = async (userId: string, points: number) => {
  try {
    // Award badge based on points
    await awardBadge(userId, 'points_earned', points);
  } catch (error) {
    console.error('Error handling points badge:', error);
  }
};

// Call this function when a user checks in early
export const handleEarlyBirdBadge = async (userId: string, checkInTime: Date) => {
  try {
    // Check if check-in time is before 9 AM
    const hour = checkInTime.getHours();
    if (hour < 9) {
      // Count early check-ins
      const earlyCheckIns = await prisma.lineEntry.count({
        where: {
          userId,
          enteredAt: {
            not: null,
            lte: new Date(checkInTime.setHours(9, 0, 0, 0)) // Before 9 AM
          }
        }
      });
      
      // Award badge based on early check-in count
      await awardBadge(userId, 'early_check_ins', earlyCheckIns);
    }
  } catch (error) {
    console.error('Error handling early bird badge:', error);
  }
};

// Call this function when a user visits sales in different cities
export const handleExplorerBadge = async (userId: string) => {
  try {
    // Get distinct cities user has visited
    const visitedCities = await prisma.sale.findMany({
      where: {
        lineEntries: {
          some: {
            userId,
            status: 'ENTERED'
          }
        }
      },
      select: {
        city: true
      },
      distinct: ['city'],
      take: 50,
    });

    // Award badge based on number of cities visited
    await awardBadge(userId, 'cities_visited', visitedCities.length);
  } catch (error) {
    console.error('Error handling explorer badge:', error);
  }
};
