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

      // Get or create user achievement record
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
        },
      });

      // Check if threshold met and not already unlocked
      if (
        userAch.progress >= achievement.targetValue &&
        userAch.unlockedAt === undefined
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
 * Get all achievements for a user with progress
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

    return allAchievements.map((ach) => ({
      id: ach.id,
      key: ach.key,
      name: ach.name,
      description: ach.description,
      icon: ach.icon,
      category: ach.category,
      targetValue: ach.targetValue,
      unlocked:
        ach.userAchievements.length > 0 && ach.userAchievements[0].unlockedAt
          ? true
          : false,
      progress: ach.userAchievements.length > 0 ? ach.userAchievements[0].progress : 0,
      unlockedAt:
        ach.userAchievements.length > 0 ? ach.userAchievements[0].unlockedAt : null,
    }));
  } catch (error) {
    console.error(`[Achievement] Failed to fetch achievements for ${userId}:`, error);
    return [];
  }
};
