import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import { useMyAchievements } from '../../hooks/useAchievements';
import { AchievementBadge } from '../../components/AchievementBadge';

// Explorer Rank definitions — must match RANK_THRESHOLDS in backend xpService.ts
const RANKS = [
  { name: 'Initiate', xp: 0, icon: '⭐' },
  { name: 'Scout', xp: 500, icon: '🗺️' },
  { name: 'Ranger', xp: 2000, icon: '🏹' },
  { name: 'Sage', xp: 5000, icon: '📚' },
  { name: 'Grandmaster', xp: 12000, icon: '👑' },
];

export default function AchievementsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { data, isLoading, error } = useMyAchievements();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return null;
  }

  const achievements = data?.achievements ?? [];
  const userGuildXp = user?.guildXp ?? 0;

  // Calculate current rank
  let currentRank = RANKS[0];
  let nextRank = RANKS[1];
  for (let i = 0; i < RANKS.length; i++) {
    if (userGuildXp >= RANKS[i].xp) {
      currentRank = RANKS[i];
      nextRank = RANKS[i + 1] || RANKS[RANKS.length - 1];
    }
  }

  const xpToNextRank = Math.max(0, nextRank.xp - userGuildXp);
  const xpProgress = userGuildXp - currentRank.xp;
  const xpProgressPercent = Math.min(100, (xpProgress / (nextRank.xp - currentRank.xp)) * 100);

  const shoppingAchievements = achievements.filter((a) => a.category === 'SHOPPER');
  const organizerAchievements = achievements.filter((a) => a.category === 'ORGANIZER');
  const sharedAchievements = achievements.filter((a) => a.category === 'SHARED');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300">Loading achievements...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-red-600 dark:text-red-400">Failed to load achievements</p>
      </div>
    );
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  return (
    <>
      <Head>
        <title>Achievements - FindA.Sale</title>
        <meta name="description" content="Track your achievements and Explorer Rank progression" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-emerald-900 dark:text-emerald-300 mb-2">Achievements</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {unlockedCount} of {totalCount} achievements unlocked
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-purple-300 shadow-lg p-6 mb-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-2">{currentRank.icon}</div>
              <h2 className="text-2xl font-bold text-purple-700 dark:text-purple-300 mb-2">Explorer Rank</h2>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{currentRank.name}</p>
            </div>

            {currentRank.name !== 'Grandmaster' && (
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-300">
                    {xpProgress} / {nextRank.xp - currentRank.xp} XP to {nextRank.name}
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">{xpToNextRank} XP remaining</span>
                </div>
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-400 dark:to-purple-500 h-full transition-all"
                    style={{ width: `${xpProgressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-5 gap-2">
              {RANKS.map((rank, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg text-center transition-all ${
                    userGuildXp >= rank.xp
                      ? 'bg-purple-100 dark:bg-purple-900 border-2 border-purple-500'
                      : 'bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 opacity-50'
                  }`}
                >
                  <div className="text-2xl mb-1">{rank.icon}</div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{rank.name}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
              Earn XP from shopping actions to progress through the Explorer's Guild ranks
            </p>
          </div>

          {shoppingAchievements.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">🛍️ Shopper Achievements</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shoppingAchievements.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={achievement.unlocked}
                    progress={achievement.progress}
                  />
                ))}
              </div>
            </section>
          )}

          {organizerAchievements.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">📦 Organizer Achievements</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {organizerAchievements.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={achievement.unlocked}
                    progress={achievement.progress}
                  />
                ))}
              </div>
            </section>
          )}

          {sharedAchievements.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">⭐ Shared Achievements</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sharedAchievements.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={achievement.unlocked}
                    progress={achievement.progress}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
