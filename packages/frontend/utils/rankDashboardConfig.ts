/**
 * Dashboard Config System — Phase 2b
 * Single source of truth for rank-aware dashboard layout
 * Determines which cards are shown, hidden, or highlighted for each Explorer rank
 */

export type DashboardCard =
  | 'onboarding'
  | 'xpProgress'
  | 'unlockedPerks'
  | 'savedItems'
  | 'haulHistory'
  | 'bounties'
  | 'collectionTracking'
  | 'leaderboardPosition'
  | 'appraisalRequests'
  | 'reputation'
  | 'exclusiveEarlyAccess'
  | 'grandmasterStats'
  | 'myTeams';

export interface DashboardConfig {
  prominentCards: DashboardCard[]; // Top row, full width or large
  secondaryCards: DashboardCard[]; // Second row, smaller
  hiddenCards: DashboardCard[]; // Not rendered at all
}

type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

export function getRankDashboardConfig(rank: ExplorerRank): DashboardConfig {
  const configs: Record<ExplorerRank, DashboardConfig> = {
    INITIATE: {
      prominentCards: ['onboarding', 'xpProgress'],
      secondaryCards: ['unlockedPerks', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    SCOUT: {
      prominentCards: ['xpProgress', 'unlockedPerks'],
      secondaryCards: ['savedItems', 'haulHistory', 'bounties', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    RANGER: {
      prominentCards: ['xpProgress', 'savedItems'],
      secondaryCards: ['haulHistory', 'bounties', 'collectionTracking', 'unlockedPerks', 'myTeams'],
      hiddenCards: ['leaderboardPosition', 'reputation', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    SAGE: {
      prominentCards: ['leaderboardPosition', 'xpProgress'],
      secondaryCards: ['appraisalRequests', 'reputation', 'savedItems', 'bounties', 'myTeams'],
      hiddenCards: ['onboarding', 'exclusiveEarlyAccess', 'grandmasterStats'],
    },
    GRANDMASTER: {
      prominentCards: ['grandmasterStats', 'exclusiveEarlyAccess'],
      secondaryCards: ['leaderboardPosition', 'appraisalRequests', 'reputation', 'myTeams'],
      hiddenCards: ['onboarding', 'haulHistory', 'collectionTracking'],
    },
  };

  return configs[rank] || configs.INITIATE;
}
