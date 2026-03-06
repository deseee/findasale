import { prisma } from '../lib/prisma';

/**
 * Checks if a given date is yesterday or today (consecutive day).
 * Used to determine if a streak should continue.
 */
export const isConsecutiveDay = (lastDate: Date | null): boolean => {
  if (!lastDate) return true; // First activity
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);
  return lastDate.getTime() >= yesterday.getTime();
};

/**
 * Get the point multiplier based on Hunt Pass status.
 */
export const getMultiplier = (huntPassActive: boolean): number => {
  return huntPassActive ? 2 : 1;
};

/**
 * Awards bonus points at certain streak milestones.
 * Visit: 7-day streak = +10 bonus
 */
export const getBonusPoints = (type: string, streak: number): number => {
  if (type === 'visit' && streak === 7) return 10;
  return 0;
};

/**
 * Records a visit streak activity.
 * Checks if today is a consecutive day to current streak.
 * Awards 5 base points + Hunt Pass multiplier + 7-day bonus.
 */
export const recordVisit = async (userId: string): Promise<{ pointsAwarded: number; streakContinued: boolean }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      huntPassActive: true,
      lastVisitDate: true,
    },
  });

  if (!user) throw new Error('User not found');

  // Get or create the visit streak record
  let userStreak = await prisma.userStreak.findUnique({
    where: { userId_type: { userId, type: 'visit' } },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let currentStreak = userStreak?.currentStreak ?? 0;
  let pointsAwarded = 0;

  // Check if activity already recorded today
  if (userStreak?.lastActivityDate) {
    const lastActivityDay = new Date(userStreak.lastActivityDate);
    lastActivityDay.setHours(0, 0, 0, 0);
    if (lastActivityDay.getTime() === today.getTime()) {
      // Already recorded today, don't double-count
      return { pointsAwarded: 0, streakContinued: true };
    }
  }

  // Determine if streak continues
  if (isConsecutiveDay(userStreak?.lastActivityDate ?? null)) {
    currentStreak = (userStreak?.currentStreak ?? 0) + 1;
  } else {
    // Streak broken, reset
    currentStreak = 1;
  }

  // Award points: 5 base + multiplier
  const basePoints = 5;
  const multiplier = getMultiplier(user.huntPassActive);
  pointsAwarded = basePoints * multiplier;

  // Add 7-day bonus
  const bonus = getBonusPoints('visit', currentStreak);
  pointsAwarded += bonus;

  // Update streak record and user points
  if (!userStreak) {
    // Create new streak record
    userStreak = await prisma.userStreak.create({
      data: {
        userId,
        type: 'visit',
        currentStreak,
        longestStreak: currentStreak,
        lastActivityDate: now,
      },
    });
  } else {
    // Update existing streak record
    await prisma.userStreak.update({
      where: { id: userStreak.id },
      data: {
        currentStreak,
        longestStreak: Math.max(userStreak.longestStreak, currentStreak),
        lastActivityDate: now,
      },
    });
  }

  // Award points to user
  await prisma.user.update({
    where: { id: userId },
    data: {
      streakPoints: { increment: pointsAwarded },
      points: { increment: pointsAwarded },
      lastVisitDate: now,
      visitStreak: currentStreak,
    },
  });

  return { pointsAwarded, streakContinued: true };
};

/**
 * Records a save (favorite) activity.
 * Awards 10 points per save (Hunt Pass: 20).
 * Does not use streaks, only one-off awards.
 */
export const recordSave = async (userId: string): Promise<{ pointsAwarded: number }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { huntPassActive: true },
  });

  if (!user) throw new Error('User not found');

  const basePoints = 10;
  const multiplier = getMultiplier(user.huntPassActive);
  const pointsAwarded = basePoints * multiplier;

  await prisma.user.update({
    where: { id: userId },
    data: {
      streakPoints: { increment: pointsAwarded },
      points: { increment: pointsAwarded },
    },
  });

  return { pointsAwarded };
};

/**
 * Records a purchase/buy streak activity.
 * Checks if today is a consecutive day to current streak.
 * Awards 50 base points + Hunt Pass multiplier.
 */
export const recordPurchase = async (userId: string): Promise<{ pointsAwarded: number; streakContinued: boolean }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { huntPassActive: true },
  });

  if (!user) throw new Error('User not found');

  // Get or create the buy streak record
  let userStreak = await prisma.userStreak.findUnique({
    where: { userId_type: { userId, type: 'buy' } },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let currentStreak = userStreak?.currentStreak ?? 0;
  let pointsAwarded = 0;

  // Check if activity already recorded today
  if (userStreak?.lastActivityDate) {
    const lastActivityDay = new Date(userStreak.lastActivityDate);
    lastActivityDay.setHours(0, 0, 0, 0);
    if (lastActivityDay.getTime() === today.getTime()) {
      // Already recorded today, but allow multiple purchases
      // Just award points without incrementing streak
      const basePoints = 50;
      const multiplier = getMultiplier(user.huntPassActive);
      pointsAwarded = basePoints * multiplier;

      await prisma.user.update({
        where: { id: userId },
        data: {
          streakPoints: { increment: pointsAwarded },
          points: { increment: pointsAwarded },
        },
      });

      return { pointsAwarded, streakContinued: true };
    }
  }

  // Determine if streak continues
  if (isConsecutiveDay(userStreak?.lastActivityDate ?? null)) {
    currentStreak = (userStreak?.currentStreak ?? 0) + 1;
  } else {
    // Streak broken, reset
    currentStreak = 1;
  }

  // Award points: 50 base + multiplier
  const basePoints = 50;
  const multiplier = getMultiplier(user.huntPassActive);
  pointsAwarded = basePoints * multiplier;

  // Update streak record and user points
  if (!userStreak) {
    // Create new streak record
    userStreak = await prisma.userStreak.create({
      data: {
        userId,
        type: 'buy',
        currentStreak,
        longestStreak: currentStreak,
        lastActivityDate: now,
      },
    });
  } else {
    // Update existing streak record
    await prisma.userStreak.update({
      where: { id: userStreak.id },
      data: {
        currentStreak,
        longestStreak: Math.max(userStreak.longestStreak, currentStreak),
        lastActivityDate: now,
      },
    });
  }

  // Award points to user
  await prisma.user.update({
    where: { id: userId },
    data: {
      streakPoints: { increment: pointsAwarded },
      points: { increment: pointsAwarded },
    },
  });

  return { pointsAwarded, streakContinued: true };
};

/**
 * Fetches the user's complete streak profile.
 * Returns all streak types, current/longest streaks, and Hunt Pass status.
 */
export const getStreakProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      streakPoints: true,
      visitStreak: true,
      huntPassActive: true,
      huntPassExpiry: true,
      userStreaks: true,
    },
  });

  if (!user) throw new Error('User not found');

  // Build a clean response
  const streakMap: Record<string, any> = {};
  for (const streak of user.userStreaks) {
    streakMap[streak.type] = {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActivityDate: streak.lastActivityDate,
    };
  }

  return {
    userId: user.id,
    name: user.name,
    streakPoints: user.streakPoints,
    visitStreak: user.visitStreak,
    huntPassActive: user.huntPassActive,
    huntPassExpiry: user.huntPassExpiry,
    streaks: streakMap,
  };
};

/**
 * Gets the top 20 users by streak points (public leaderboard).
 */
export const getLeaderboard = async () => {
  const users = await prisma.user.findMany({
    where: { streakPoints: { gt: 0 } },
    select: {
      id: true,
      name: true,
      streakPoints: true,
      visitStreak: true,
      huntPassActive: true,
    },
    orderBy: { streakPoints: 'desc' },
    take: 20,
  });

  return users;
};
