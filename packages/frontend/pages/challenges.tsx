import React, { useState } from 'react';
import { useActiveChallenges, useMyChallengeProgress, useLeaderboard } from '../hooks/useChallenges';
import { useAuth } from '../hooks/useAuth';
import { ChallengeBadge } from '../components/ChallengeBadge';
import Layout from '../components/Layout';

interface Objective {
  objectiveId: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
}

interface UserProgress {
  challengeId: string;
  name: string;
  emoji: string;
  theme: string;
  description: string;
  startDate: string;
  endDate: string;
  badgeEarned: boolean;
  earnedAt: string | null;
  objectives: Objective[];
  daysRemaining: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  objectivesCompleted: number;
}

/**
 * Feature #55: Seasonal Discovery Challenges Page
 * Displays active challenges, user progress, and leaderboards
 */
export default function ChallengesPage() {
  const { user } = useAuth();
  const { data: activeChallenges, isLoading: activesLoading } = useActiveChallenges();
  const { data: myProgress, isLoading: progressLoading } = useMyChallengeProgress();
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const { data: leaderboard } = useLeaderboard(selectedChallengeId || '');

  const userProgressMap = React.useMemo(() => {
    if (!myProgress) return new Map();
    return new Map(myProgress.map((p: UserProgress) => [p.challengeId, p]));
  }, [myProgress]);

  return (
    <Layout title="Challenges">
      <div className="min-h-screen bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-sage-green/10 to-sage-green/5 dark:from-gray-800 dark:to-gray-900 py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              🎯 Seasonal Discovery Challenges
            </h1>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Complete time-limited challenges to earn badges and leaderboard placement
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-12">
          {activesLoading || progressLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-sage-green" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading challenges...</p>
            </div>
          ) : (
            <>
              {/* Active Challenges Section */}
              {activeChallenges && activeChallenges.length > 0 && (
                <section className="mb-16">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    🔥 Active Challenges ({activeChallenges.length})
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {activeChallenges.map((challenge: any) => {
                      const userProgress = userProgressMap.get(challenge.id);
                      const allObjectivesComplete = userProgress?.objectives?.every(
                        (o: Objective) => o.completed
                      );

                      return (
                        <div
                          key={challenge.id}
                          onClick={() => setSelectedChallengeId(challenge.id)}
                          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedChallengeId === challenge.id
                              ? 'border-sage-green bg-sage-green/5 dark:bg-gray-800'
                              : 'border-gray-200 dark:border-gray-700 hover:border-sage-green/50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <span className="text-4xl">{challenge.emoji}</span>
                              <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                  {challenge.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {challenge.daysRemaining} days left
                                </p>
                              </div>
                            </div>
                            {allObjectivesComplete && (
                              <span className="inline-block px-3 py-1 bg-sage-green text-white text-xs font-bold rounded-full">
                                COMPLETED
                              </span>
                            )}
                          </div>

                          <p className="text-gray-700 dark:text-gray-300 text-sm mb-4">
                            {challenge.description}
                          </p>

                          {userProgress && (
                            <div className="space-y-3">
                              {userProgress.objectives.map((obj: Objective) => (
                                <div key={obj.objectiveId}>
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                      {obj.description}
                                    </p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      {obj.progress}/{obj.target}
                                    </p>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all ${
                                        obj.completed ? 'bg-sage-green' : 'bg-sage-green/60'
                                      }`}
                                      style={{ width: `${Math.min((obj.progress / obj.target) * 100, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Leaderboard Section */}
              {selectedChallengeId && leaderboard && leaderboard.length > 0 && (
                <section className="mb-16">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    🏆 Leaderboard
                  </h2>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Rank
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Shopper
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                            Objectives Completed
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {leaderboard.map((entry: LeaderboardEntry) => (
                          <tr
                            key={entry.userId}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <td className="px-6 py-4">
                              <span className="text-2xl font-bold text-sage-green">
                                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-900 dark:text-white">
                              {entry.name}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="inline-block px-3 py-1 bg-sage-green/10 text-sage-green dark:bg-sage-green/20 font-semibold rounded">
                                {entry.objectivesCompleted}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Badge Showcase */}
              {user && myProgress && myProgress.some((p: UserProgress) => p.badgeEarned) && (
                <section>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    🎖️ Your Badges
                  </h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {myProgress.map((challenge: UserProgress) => (
                      challenge.badgeEarned && (
                        <ChallengeBadge
                          key={challenge.challengeId}
                          emoji={challenge.emoji}
                          name={challenge.name}
                          earned={true}
                          earnedAt={challenge.earnedAt || undefined}
                          compact={true}
                        />
                      )
                    ))}
                  </div>
                </section>
              )}

              {/* No Challenges Message */}
              {!activeChallenges || activeChallenges.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-600 dark:text-gray-400 text-lg">
                    No active challenges right now. Check back soon for seasonal challenges!
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
