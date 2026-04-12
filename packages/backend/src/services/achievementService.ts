import { prisma } from '../lib/prisma';

/**
 * Achievement definitions — stored in code, not in DB
 * Synced to DB on service initialization
 */
export const ACHIEVEMENTS = [
  {
    key: 'FIRST_PURCHASE',
    name: 'First Find',
    description: 'Made your first purchase',
    icon: '🛍️',
    category: 'SHOPPER' as const,
    targetValue: 1,
  },
  {
    key: 'FIVE_PURCHASES',
    name: 'Treasure Hunter',
    description: 'Completed 5 purchases',
    icon: '💎',
    category: 'SHOPPER' as const,
    targetValue: 5,
  },
  {
    key: 'FIRST_SALE_ATTENDED',
    name: 'Sale Explorer',
    description: 'Attended your first sale',
    icon: '🗺️',
    category: 'SHOPPER' as const,
    targetValue: 1,
  },
  {
    key: 'FIRST_ITEM_LISTED',
    name: 'First Listing',
    description: 'Listed your first item for sale',
    icon: '📦',
    category: 'ORGANIZER' as const,
    targetValue: 1,
  },
  {
    key: 'HUNDRED_ITEMS_LISTED',
    name: 'Inventory King',
    description: 'Listed 100 items for sale',
    icon: '👑',
    category: 'ORGANIZER' as const,
    targetValue: 100,
  },
  {
    key: 'FIRST_SALE_CREATED',
    name: 'Sale Launcher',
    description: 'Created your first sale',
    icon: '🚀',
    category: 'ORGANIZER' as const,
    targetValue: 1,
  },
  {
    key: 'WEEKEND_WARRIOR',
    name: 'Weekend Warrior',
    description: 'Visited sales 5 weekends in a row',
    icon: '⚔️',
    category: 'SHARED' as const,
    targetValue: 5,
  },
  {
    key: 'STREAK_3',
    name: 'On a Roll',
    description: 'Achieved a 3-weekend visiting streak',
    icon: '🔥',
    category: 'SHARED' as const,
    targetValue: 3,
  },
];

/**
 * Initialize achievements in the database on service startup
 * Upserts all defined achievements
 */
export const syncAchievements = async (): Promise<void> => {
  try {
    for (const achievement of ACHIEVEMENTS) {
      await prisma.achievement.upsert({
        where: { key: achievement.key },
        update: {
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          targetValue: achievement.targetValue,
        },
        create: {
          key: achievement.key,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          category: achievement.category,
          targetValue: achievement.targetValue,
        },
      });
    }
    console.log('✅ Achievements synced to database');
  } catch (error) {
    console.error('❌ Failed to sync achievements:', error);
  }
};

export type AchievementTrigger =
  | 'PURCHASE_MADE'
  | 'SALE_ATTENDED'
  | 'ITEM_LISTED'
  | 'SALE_CREATED'
  | 'WEEKEND_VISIT';

/**
 * Check and award achievements based on trigger
 * Returns array of newly unlocked achievements
 */
export const checkAndAward = async (
  userId: string,
  trigger: AchievementTrigger
): Promise<Array<{ id: string; key: string; name: string }>> => {
  const newlyUnlocked: Array<{ id: string; key: string; name: string }> = [];

  try {
    const triggerMap: Record<AchievementTrigger, string[]> = {
      PURCHASE_MADE: ['FIRST_PURCHASE', 'FIVE_PURCHASES'],
      SALE_ATTENDED: ['FIRST_SALE_ATTENDED'],
      ITEM_LISTED: ['FIRST_ITEM_LISTED', 'HUNDRED_ITEMS_LISTED'],
      SALE_CREATED: ['FIRST_SALE_CREATED'],
      WEEKEND_VISIT: ['WEEKEND_WARRIOR', 'STREAK_3'],
    };

    const keysToCheck = triggerMap[trigger] || [];

    for (const key of keysToCheck) {
      const achievement = await prisma.achievement.findUnique({
        where: { key },
      });

      if (!achievement) continue;

      // Get current user achievement record first to check if already unlocked
      const existingUserAch = await prisma.userAchievement.findUnique({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id,
          },
        },
      });

      // Only increment if not yet unlocked
      const isAlreadyUnlocked = existingUserAch?.unlockedAt !== null;

      if (isAlreadyUnlocked) {
        // Already unlocked, skip this achievement
        continue;
      }

      // Increment progress
      const userAch = await prisma.userAchievement.upsert({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id,
          },
        },
        update: {
          progress: {
            increment: 1,
          },
        },
        create: {
          userId,
          achievementId: achievement.id,
          progress: 1,
          unlockedAt: null, // Don't set unlock time on creation
        },
      });

      // Check if threshold just met
      if (
        userAch.progress >= achievement.targetValue &&
        userAch.unlockedAt === null
      ) {
        // Update unlock time
        await prisma.userAchievement.update({
          where: { id: userAch.id },
          data: {
            unlockedAt: new Date(),
          },
        });

        newlyUnlocked.push({
          id: achievement.id,
          key: achievement.key,
          name: achievement.name,
        });
      }
    }
  } catch (error) {
    console.error(`[Achievement] Failed to check and award for ${userId}:`, error);
  }

  return newlyUnlocked;
};

/**
 * Evaluate actual user data to calculate achievement progress
 * This ensures achievements reflect real activity, even if checkAndAward wasn't called
 */
const evaluateAchievementProgress = async (userId: string, achievementKey: string): Promise<number> => {
  try {
    switch (achievementKey) {
      case 'FIRST_PURCHASE':
      case 'FIVE_PURCHASES': {
        const purchaseCount = await prisma.purchase.count({
          where: { userId }
        });
        return purchaseCount;
      }

      case 'FIRST_SALE_ATTENDED': {
        const attendedCount = await prisma.saleRSVP.count({
          where: { userId }
        });
        return attendedCount;
      }

      case 'FIRST_ITEM_LISTED':
      case 'HUNDRED_ITEMS_LISTED': {
        const organizer = await prisma.organizer.findUnique({
          where: { userId }
        });
        if (!organizer) return 0;

        // Count items across all sales by this organizer
        const itemCount = await prisma.item.count({
          where: {
            sale: {
              organizerId: organizer.id
            }
          }
        });
        return itemCount;
      }

      case 'FIRST_SALE_CREATED': {
        const organizer = await prisma.organizer.findUnique({
          where: { userId }
        });
        if (!organizer) return 0;

        const saleCount = await prisma.sale.count({
          where: { organizerId: organizer.id }
        });
        return saleCount;
      }

      case 'WEEKEND_WARRIOR':
      case 'STREAK_3': {
        // These are handled by the streak service, return 0 here
        return 0;
      }

      default:
        return 0;
    }
  } catch (error) {
    console.error(`[Achievement] Failed to evaluate progress for ${achievementKey}:`, error);
    return 0;
  }
};

/**
 * Get all achievements for a user with progress
 * Now evaluates actual data to ensure organizer achievements reflect real sales/items
 */
export const getUserAchievements = async (userId: string) => {
  try {
    const allAchievements = await prisma.achievement.findMany({
      include: {
        userAchievements: {
          where: { userId },
          select: {
            id: true,
            progress: true,
            unlockedAt: true,
          },
        },
      },
    });

    return await Promise.all(allAchievements.map(async (ach: any) => {
      const userAch = ach.userAchievements.length > 0 ? ach.userAchievements[0] : null;

      // For organizer achievements, evaluate against actual data
      let progress = userAch?.progress ?? 0;
      if (ach.category === 'ORGANIZER') {
        const actualProgress = await evaluateAchievementProgress(userId, ach.key);
        // Use the actual data if it's higher than recorded progress
        progress = Math.max(progress, actualProgress);
      }

      // Determine if unlocked: either already marked as unlocked, or progress meets target
      const isUnlocked = (userAch?.unlockedAt !== null && userAch?.unlockedAt !== undefined) ||
                         progress >= ach.targetValue;

      return {
        id: ach.id,
        key: ach.key,
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        category: ach.category,
        targetValue: ach.targetValue,
        unlocked: isUnlocked,
        progress: progress,
        unlockedAt: userAch?.unlockedAt || null,
      };
    }));
  } catch (error) {
    console.error(`[Achievement] Failed to fetch achievements for ${userId}:`, error);
    return [];
  }
};
