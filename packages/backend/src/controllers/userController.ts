import { Request, Response } from 'express';
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
        streakPoints: 'desc'
      },
      take: 10,
      select: {
        id: true,
        name: true,
        streakPoints: true,
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

          console.info(`Awarded badge "${badge.name}" to user ${userId}`);

          // Notify user of new badge
          await prisma.notification.create({
            data: {
              userId,
              title: 'New Badge Earned!',
              body: `Congratulations! You've earned the "${badge.name}" badge.`,
              type: 'badge'
            }
          }).catch(() => {/* non-critical — badge still awarded */});
        }
      }
    }
  } catch (error) {
    console.error('Error awarding badge:', error);
  }
};

// DELETED: handlePurchaseBadge — S268 gamification cleanup
// Old purchase-count-based badges replaced by explorer rank system (guildXp)
// Badge triggers are now rank-based: Initiate→Scout→Ranger→Sage→Grandmaster

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

// DELETED: handlePointsBadge — S268 gamification cleanup
// Old purchase-points-based badges removed (replaced by explorer rank system)

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

// CD2 Phase 3: First Sale badge — awarded when a shopper completes their first purchase
export const handleFirstSaleBadge = async (userId: string) => {
  try {
    // Count user's purchases
    const purchaseCount = await prisma.purchase.count({
      where: { userId }
    });

    // Award badge only on first purchase
    if (purchaseCount === 1) {
      await awardBadge(userId, 'first_purchase', 1);
    }
  } catch (error) {
    console.error('Error handling first sale badge:', error);
  }
};

// CD2 Phase 3: Explorer badge — awarded when a shopper views 10 distinct sales (via favorites or line entries)
export const handleSalesViewedBadge = async (userId: string) => {
  try {
    // Count distinct sales the user has interacted with (favorited or entered line)
    const [favoriteCount, lineEntryCount] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId, saleId: { not: null } },
        select: { saleId: true },
        distinct: ['saleId']
      }),
      prisma.lineEntry.findMany({
        where: { userId },
        select: { saleId: true },
        distinct: ['saleId']
      })
    ]);

    // Combine and deduplicate
    const uniqueSales = new Set([
      ...favoriteCount.map(f => f.saleId).filter(Boolean),
      ...lineEntryCount.map(l => l.saleId)
    ]);

    // Award badge when user has viewed 10+ distinct sales
    if (uniqueSales.size >= 10) {
      await awardBadge(userId, 'sales_viewed', uniqueSales.size);
    }
  } catch (error) {
    console.error('Error handling sales viewed badge:', error);
  }
};

// CD2 Phase 3: Local Legend — awarded when user reaches 500 streak points
export const handleLegendBadge = async (userId: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { streakPoints: true }
    });

    if (user && user.streakPoints >= 500) {
      await awardBadge(userId, 'grand_rapids_legend', user.streakPoints);
    }
  } catch (error) {
    console.error('Error handling legend badge:', error);
  }
};

// Public: get shopper's public profile
export const getPublicShopperProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        role: true,
        streakPoints: true,
        profileSlug: true,
        purchasesVisible: true,
        collectorTitle: true,
        userBadges: {
          include: {
            badge: {
              select: {
                id: true,
                name: true,
                description: true,
                iconUrl: true,
              }
            }
          }
        },
        _count: {
          select: {
            purchases: true,
            favorites: true,
            wishlists: true,
            reviews: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'Shopper not found' });
    }

    // Calculate streak days from visitStreak (using UserStreak model if needed)
    const visitStreak = await prisma.userStreak.findFirst({
      where: { userId, type: 'visit' },
      select: { currentStreak: true }
    });

    // Fetch recent purchases if purchasesVisible is true
    let purchases = null;
    if (user.purchasesVisible) {
      const purchaseData = await prisma.purchase.findMany({
        where: { userId },
        select: {
          id: true,
          createdAt: true,
          item: {
            select: {
              id: true,
              title: true,
              photoUrls: true,
              price: true,
            }
          },
          sale: {
            select: {
              id: true,
              title: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      });
      purchases = purchaseData.map((p: any) => ({
        id: p.id,
        createdAt: p.createdAt,
        item: {
          id: p.item.id,
          title: p.item.title,
          photoUrls: p.item.photoUrls,
          estimatedValue: p.item.estimatedValue ? convertDecimalsToNumbers({ value: p.item.estimatedValue }).value : null,
        },
        sale: p.sale,
      }));
    }

    const responseBody: any = {
      id: user.id,
      name: user.name,
      createdAt: user.createdAt,
      role: user.role,
      streakPoints: user.streakPoints,
      profileSlug: user.profileSlug,
      purchasesVisible: user.purchasesVisible,
      collectorTitle: user.collectorTitle,
      totalPurchases: user._count.purchases,
      totalFavorites: user._count.favorites,
      totalWishlists: user._count.wishlists,
      totalReviews: user._count.reviews,
      streakDays: visitStreak?.currentStreak ?? 0,
      badges: user.userBadges?.map((ub: any) => ({
        id: ub.badge.id,
        name: ub.badge.name,
        description: ub.badge.description,
        iconUrl: ub.badge.iconUrl,
      })) || [],
    };

    if (purchases !== null) {
      responseBody.purchases = purchases;
    }

    res.json(responseBody);
  } catch (error) {
    console.error('Error fetching public shopper profile:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

export const getBadges = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userBadges = await prisma.userBadge.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        badge: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
          },
        },
      },
      orderBy: {
        awardedAt: 'desc',
      },
    });

    res.json({
      badges: userBadges.map((ub) => ({
        id: ub.id,
        badgeId: ub.badgeId,
        awardedAt: ub.awardedAt,
        badge: ub.badge,
      })),
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ message: 'Server error while fetching badges' });
  }
};

/**
 * Phase 2a: Activate 7-day Hunt Pass free trial (first-time only)
 * POST /api/hunt-pass/trial
 */
export const activateHuntPassTrial = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user.id;

    // Check if user has ever had Hunt Pass (huntPassExpiry is null if never had it)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { huntPassActive: true, huntPassExpiry: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If huntPassExpiry is set (not null), user has already used trial or had active pass
    if (user.huntPassExpiry !== null) {
      return res.status(409).json({
        message: 'Hunt Pass trial already used or subscription already active',
      });
    }

    // Grant 7-day free trial
    const trialExpiryDate = new Date();
    trialExpiryDate.setDate(trialExpiryDate.getDate() + 7);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        huntPassActive: true,
        huntPassExpiry: trialExpiryDate,
      },
      select: {
        huntPassActive: true,
        huntPassExpiry: true,
      },
    });

    res.json({
      message: 'Hunt Pass trial activated! Enjoy 7 days of 1.5x XP and early access.',
      huntPassActive: updatedUser.huntPassActive,
      huntPassExpiry: updatedUser.huntPassExpiry,
    });
  } catch (error) {
    console.error('Error activating Hunt Pass trial:', error);
    res.status(500).json({ message: 'Server error while activating trial' });
  }
};
