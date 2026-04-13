import { prisma } from '../lib/prisma';

/**
 * Feature #55: Seasonal Discovery Challenges
 * Time-limited themed challenges for shoppers to earn badges and leaderboard placement.
 */

export interface Objective {
  id: string;
  description: string;
  type: 'VISIT_SALES' | 'PURCHASE_ITEM' | 'PURCHASE_CATEGORY' | 'FAVORITE_ITEMS' | 'ATTEND_DAYS';
  target: number;
  targetValue?: string; // e.g., 'Collectibles' for PURCHASE_CATEGORY
}

export interface Challenge {
  id: string;
  name: string;
  theme: string;
  description: string;
  emoji: string;
  startDate: Date;
  endDate: Date;
  objectives: Objective[];
  badgeColor: string;
}

/**
 * Hardcoded seasonal challenges (MVP) — update annually
 */
export const CHALLENGE_CONFIG: Challenge[] = [
  {
    id: 'spring-2026',
    name: 'Spring Refresh 2026',
    theme: 'spring',
    description: 'Find fresh starts this spring! Discover furniture and art pieces, explore new sales, and build your collection.',
    emoji: '🌸',
    startDate: new Date(2026, 2, 1), // Mar 1
    endDate: new Date(2026, 4, 31), // May 31
    objectives: [
      { id: 'spring-furniture', description: 'Find 2 items from Furniture or Art & Decor', type: 'PURCHASE_CATEGORY', target: 2, targetValue: 'furniture|art' },
      { id: 'spring-visits', description: 'Visit 3 different sales', type: 'VISIT_SALES', target: 3 },
      { id: 'spring-favorites', description: 'Favorite 5 items', type: 'FAVORITE_ITEMS', target: 5 },
    ],
    badgeColor: '#8FB897',
  },
  {
    id: 'summer-2026',
    name: 'Summer Clearance Chase 2026',
    theme: 'summer',
    description: 'Beat the heat! Find deals all summer long and hunt for treasures across estate sales.',
    emoji: '☀️',
    startDate: new Date(2026, 5, 1), // Jun 1
    endDate: new Date(2026, 7, 31), // Aug 31
    objectives: [
      { id: 'summer-purchase', description: 'Purchase 2 items', type: 'PURCHASE_ITEM', target: 2 },
      { id: 'summer-visits', description: 'Visit 2 different sales', type: 'VISIT_SALES', target: 2 },
      { id: 'summer-favorites', description: 'Favorite 10 items', type: 'FAVORITE_ITEMS', target: 10 },
    ],
    badgeColor: '#8FB897',
  },
  {
    id: 'fall-2026',
    name: 'Fall Harvest Hunt 2026',
    theme: 'fall',
    description: 'Autumn treasures await! Find collectibles and explore the season\'s best estate sales.',
    emoji: '🍂',
    startDate: new Date(2026, 8, 1), // Sep 1
    endDate: new Date(2026, 10, 30), // Nov 30
    objectives: [
      { id: 'fall-collectibles', description: 'Purchase 1 item from Collectibles', type: 'PURCHASE_CATEGORY', target: 1, targetValue: 'collectibles' },
      { id: 'fall-visits', description: 'Visit 2 different sales', type: 'VISIT_SALES', target: 2 },
    ],
    badgeColor: '#8FB897',
  },
  {
    id: 'holiday-2026',
    name: 'Holiday Treasure Hunt 2026',
    theme: 'holiday',
    description: 'Spread holiday cheer! Find perfect gifts and festive decor across your favorite estate sales.',
    emoji: '🎄',
    startDate: new Date(2026, 11, 1), // Dec 1
    endDate: new Date(2027, 1, 28), // Feb 28 next year
    objectives: [
      { id: 'holiday-purchase', description: 'Purchase 3 items total', type: 'PURCHASE_ITEM', target: 3 },
      { id: 'holiday-visits', description: 'Visit 3 different sales', type: 'VISIT_SALES', target: 3 },
      { id: 'holiday-favorites', description: 'Favorite 10 items', type: 'FAVORITE_ITEMS', target: 10 },
      { id: 'holiday-kitchen', description: 'Purchase from Kitchenware or Art & Decor', type: 'PURCHASE_CATEGORY', target: 1, targetValue: 'kitchenware|art' },
    ],
    badgeColor: '#8FB897',
  },
];

/**
 * Returns challenges that are currently active (between startDate and endDate)
 */
export const getActiveChallenges = (): Challenge[] => {
  const now = new Date();
  return CHALLENGE_CONFIG.filter(c => now >= c.startDate && now <= c.endDate);
};

/**
 * Returns all challenges (past, current, upcoming)
 */
export const getAllChallenges = (): Challenge[] => {
  return CHALLENGE_CONFIG;
};

/**
 * Get user's progress on all active challenges
 */
export const getMyChallengeProgress = async (userId: string) => {
  const activeChallenges = getActiveChallenges();
  const results = [];

  for (const challenge of activeChallenges) {
    const progress = await prisma.challengeProgress.findMany({
      where: {
        userId,
        challengeId: challenge.id,
      },
    });

    const badge = await prisma.challengeBadge.findUnique({
      where: {
        userId_challengeId: {
          userId,
          challengeId: challenge.id,
        },
      },
    });

    // Map progress to objectives
    const objectiveProgress = challenge.objectives.map(obj => {
      const prog = progress.find(p => p.objectiveId === obj.id);
      return {
        objectiveId: obj.id,
        description: obj.description,
        progress: prog?.progress ?? 0,
        target: obj.target,
        completed: prog?.completed ?? false,
      };
    });

    results.push({
      challengeId: challenge.id,
      name: challenge.name,
      emoji: challenge.emoji,
      theme: challenge.theme,
      description: challenge.description,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      badgeEarned: !!badge,
      earnedAt: badge?.earnedAt ?? null,
      objectives: objectiveProgress,
      daysRemaining: Math.max(0, Math.ceil((challenge.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    });
  }

  return results;
};

/**
 * Update challenge progress when user completes an action
 * Fire-and-forget safe — caller should .catch() if not awaiting
 */
export const updateChallengeProgress = async (
  userId: string,
  type: 'VISIT_SALES' | 'PURCHASE_ITEM' | 'PURCHASE_CATEGORY' | 'FAVORITE_ITEMS',
  category?: string
): Promise<void> => {
  const activeChallenges = getActiveChallenges();

  for (const challenge of activeChallenges) {
    for (const objective of challenge.objectives) {
      // Check if this objective matches the action type
      let matches = false;

      if (objective.type === type) {
        if (type === 'PURCHASE_CATEGORY' && category) {
          // Parse targetValue as pipe-separated categories
          const targetCategories = objective.targetValue?.split('|') ?? [];
          matches = targetCategories.some(tc => tc.toLowerCase() === category.toLowerCase());
        } else if (type !== 'PURCHASE_CATEGORY') {
          matches = true;
        }
      }

      if (!matches) continue;

      // Upsert or update progress
      const existingProgress = await prisma.challengeProgress.findUnique({
        where: {
          userId_challengeId_objectiveId: {
            userId,
            challengeId: challenge.id,
            objectiveId: objective.id,
          },
        },
      });

      if (existingProgress && existingProgress.completed) {
        // Already completed, skip
        continue;
      }

      const newProgress = (existingProgress?.progress ?? 0) + 1;
      const isCompleted = newProgress >= objective.target;

      await prisma.challengeProgress.upsert({
        where: {
          userId_challengeId_objectiveId: {
            userId,
            challengeId: challenge.id,
            objectiveId: objective.id,
          },
        },
        update: {
          progress: newProgress,
          completed: isCompleted,
          completedAt: isCompleted && !existingProgress?.completed ? new Date() : existingProgress?.completedAt ?? null,
        },
        create: {
          userId,
          challengeId: challenge.id,
          objectiveId: objective.id,
          progress: newProgress,
          completed: isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });
    }
  }

  // Check if any challenge is now fully complete (all objectives done)
  for (const challenge of activeChallenges) {
    const allObjectiveIds = challenge.objectives.map(o => o.id);
    const completedObjectives = await prisma.challengeProgress.findMany({
      where: {
        userId,
        challengeId: challenge.id,
        objectiveId: { in: allObjectiveIds },
        completed: true,
      },
    });

    if (completedObjectives.length === allObjectiveIds.length) {
      // All objectives completed — award badge if not already earned
      const badgeExists = await prisma.challengeBadge.findUnique({
        where: {
          userId_challengeId: {
            userId,
            challengeId: challenge.id,
          },
        },
      });

      if (!badgeExists) {
        await prisma.challengeBadge.create({
          data: {
            userId,
            challengeId: challenge.id,
          },
        });
      }
    }
  }
};

/**
 * Get leaderboard for a challenge (top 10 users by completed objectives)
 */
export const getLeaderboard = async (challengeId: string) => {
  const challenge = CHALLENGE_CONFIG.find(c => c.id === challengeId);
  if (!challenge) return [];

  const objectiveIds = challenge.objectives.map(o => o.id);

  // Group by userId and count completed objectives
  const results = await prisma.challengeProgress.groupBy({
    by: ['userId'],
    where: {
      challengeId,
      objectiveId: { in: objectiveIds },
      completed: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 10,
  });

  // Fetch user names and avatars (if available)
  const userIds = results.map(r => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });

  const userMap = new Map(users.map(u => [u.id, u.name]));

  return results.map((result, idx) => ({
    rank: idx + 1,
    userId: result.userId,
    name: userMap.get(result.userId) || 'Anonymous',
    objectivesCompleted: result._count.id,
  }));
};
