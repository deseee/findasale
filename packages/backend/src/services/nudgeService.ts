import crypto from 'crypto';

/**
 * Nudge type definitions
 */
export type NudgeType = 'FAVORITE_MILESTONE' | 'STREAK_CONTINUATION' | 'TIER_PROGRESS' | 'HUNT_PASS_TEASE';

export interface Nudge {
  type: NudgeType;
  message: string;
  progress?: {
    current: number;
    target: number;
  };
  priority: number;
}

/**
 * User state required for nudge generation
 */
export interface UserState {
  userId: string;
  points: number;
  favoritesCount: number;
  visitStreak: number;
  huntPassActive: boolean;
}

/**
 * Calculate the deterministic dispatch probability for a user on a given day.
 * Uses hash(userId + YYYY-MM-DD) % 100 to get a pseudo-random but consistent value.
 * Only dispatch nudges if the hash result < 65 (65% of users see nudges on any given day).
 */
export const shouldDispatchNudges = (userId: string): boolean => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const input = `${userId}:${dateStr}`;
  const hash = crypto.createHash('md5').update(input).digest('hex');
  const hashValue = parseInt(hash.substring(0, 8), 16);
  return hashValue % 100 < 65;
};

/**
 * Generate nudges based on user state.
 * Returns max 2 nudges sorted by priority (descending).
 */
export const generateNudges = (state: UserState): Nudge[] => {
  const nudges: Nudge[] = [];

  // FAVORITE_MILESTONE nudge — triggers when user is NEAR a milestone (not exactly on it)
  const favoriteMilestones = [5, 10, 25, 50];
  const nextMilestone = favoriteMilestones.find(m => m > state.favoritesCount);
  if (nextMilestone) {
    const remaining = nextMilestone - state.favoritesCount;
    // Only nudge when within 3 items of milestone (the "near-miss" feeling)
    if (remaining > 0 && remaining <= 3) {
      nudges.push({
        type: 'FAVORITE_MILESTONE',
        message: remaining === 1
          ? `You're just 1 favorite away from hitting ${nextMilestone}!`
          : `Only ${remaining} more favorites to reach ${nextMilestone}!`,
        progress: {
          current: state.favoritesCount,
          target: nextMilestone,
        },
        priority: 8,
      });
    }
  }

  // STREAK_CONTINUATION nudge — emphasize proximity to milestone streaks
  if (state.visitStreak > 0) {
    const streakMilestones = [3, 7, 14, 30];
    const nextStreakMilestone = streakMilestones.find(m => m > state.visitStreak);
    const remaining = nextStreakMilestone ? nextStreakMilestone - state.visitStreak : 0;
    const message = remaining > 0 && remaining <= 2
      ? `${remaining === 1 ? 'One more day' : `${remaining} more days`} to hit a ${nextStreakMilestone}-day streak!`
      : `You're on a ${state.visitStreak}-day streak! Come back tomorrow to keep it going.`;
    nudges.push({
      type: 'STREAK_CONTINUATION',
      message,
      progress: nextStreakMilestone ? {
        current: state.visitStreak,
        target: nextStreakMilestone,
      } : undefined,
      priority: 7,
    });
  }

  // TIER_PROGRESS nudge
  const tierThresholds = [
    { name: 'Scout', threshold: 0 },
    { name: 'Hunter', threshold: 100 },
    { name: 'Estate Pro', threshold: 500 },
  ];
  const currentTier = tierThresholds.find(t => state.points >= t.threshold && (tierThresholds[tierThresholds.indexOf(t) + 1]?.threshold ?? Infinity) > state.points);
  const nextTierIndex = currentTier ? tierThresholds.indexOf(currentTier) + 1 : 0;

  if (nextTierIndex < tierThresholds.length) {
    const nextTier = tierThresholds[nextTierIndex];
    const pointsToNext = nextTier.threshold - state.points;
    if (pointsToNext > 0 && pointsToNext <= 100) {
      nudges.push({
        type: 'TIER_PROGRESS',
        message: `You're ${pointsToNext} points away from ${nextTier.name} status!`,
        progress: {
          current: state.points,
          target: nextTier.threshold,
        },
        priority: 6,
      });
    }
  }

  // HUNT_PASS_TEASE nudge
  if (!state.huntPassActive) {
    nudges.push({
      type: 'HUNT_PASS_TEASE',
      message: 'Unlock Hunt Pass to earn points faster and unlock exclusive deals.',
      priority: 5,
    });
  }

  // Return top 2 nudges by priority
  return nudges.sort((a, b) => b.priority - a.priority).slice(0, 2);
};
