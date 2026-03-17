import { prisma } from '../lib/prisma';
import { checkAndAward } from './achievementService';

/**
 * Get ISO week string: "2026-W12"
 */
const getISOWeek = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

/**
 * Record a weekend visit for a user
 * Calculates streak and unlocks early access if streak >= 3
 * Also checks and awards weekend visit achievements
 */
export const recordVisit = async (userId: string): Promise<void> => {
  try {
    const currentWeek = getISOWeek();

    // Get or create streak record
    let streak = await prisma.visitStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      // First visit — create streak with 1
      await prisma.visitStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastVisitWeek: currentWeek,
          earlyAccessUnlocked: false,
        },
      });
    } else if (streak.lastVisitWeek !== currentWeek) {
      // Different week — check if consecutive
      let newStreak = 1;
      let newLongest = streak.longestStreak;
      let earlyAccessUnlocked = false;

      if (streak.lastVisitWeek) {
        // Calculate if previous week was consecutive
        // Simple heuristic: if last visit was within ~8 days, consider it consecutive
        const lastWeekParts = streak.lastVisitWeek.split('-W');
        const lastYear = parseInt(lastWeekParts[0], 10);
        const lastWeek = parseInt(lastWeekParts[1], 10);

        const currentWeekParts = currentWeek.split('-W');
        const currentYear = parseInt(currentWeekParts[0], 10);
        const currentWeekNum = parseInt(currentWeekParts[1], 10);

        // Consecutive if same year and week difference is 1, or year changed and it's expected
        const isConsecutive =
          (currentYear === lastYear && currentWeekNum === lastWeek + 1) ||
          (currentYear === lastYear + 1 &&
            lastWeek >= 51 &&
            currentWeekNum <= 2);

        if (isConsecutive) {
          newStreak = streak.currentStreak + 1;
          newLongest = Math.max(newStreak, streak.longestStreak);
        }
      }

      // Unlock early access if streak >= 3
      if (newStreak >= 3) {
        earlyAccessUnlocked = true;
      }

      // Update streak
      await prisma.visitStreak.update({
        where: { userId },
        data: {
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastVisitWeek: currentWeek,
          earlyAccessUnlocked,
        },
      });

      // Award weekend visit achievements (fire-and-forget)
      checkAndAward(userId, 'WEEKEND_VISIT').catch((err) =>
        console.warn('[streak] Failed to award visit achievement:', err)
      );
    }
    // If same week, no-op (already visited this week)
  } catch (error) {
    console.error('[Streak] Failed to record visit:', error);
  }
};

/**
 * Get or create a streak record for a user
 */
export const getStreak = async (userId: string) => {
  try {
    let streak = await prisma.visitStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      // Create default streak
      streak = await prisma.visitStreak.create({
        data: {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastVisitWeek: null,
          earlyAccessUnlocked: false,
        },
      });
    }

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      earlyAccessUnlocked: streak.earlyAccessUnlocked,
    };
  } catch (error) {
    console.error('[Streak] Failed to get streak:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      earlyAccessUnlocked: false,
    };
  }
};
