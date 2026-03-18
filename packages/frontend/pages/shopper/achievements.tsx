import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import { useMyAchievements } from '../../hooks/useAchievements';
import { AchievementBadge } from '../../components/AchievementBadge';

export default function AchievementsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { data, isLoading, error } = useMyAchievements();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return null;
  }

  const achievements = data?.achievements ?? [];
  const streak = data?.streak;

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
        <meta name="description" content="Your achievements and streaks" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-emerald-900 dark:text-emerald-300 mb-2">Achievements</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {unlockedCount} of {totalCount} achievements unlocked
            </p>
          </div>

          {streak && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-amber-300 shadow-lg p-6 mb-8 text-center">
              <div className="text-6xl mb-2">🔥</div>
              <h2 className="text-2xl font-bold text-amber-700 dark:text-amber-300 mb-2">Current Streak</h2>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-4">{streak.currentStreak} weekends</p>
              <p className="text-gray-600 dark:text-gray-300 mb-2">Longest streak: {streak.longestStreak} weekends</p>
              {streak.earlyAccessUnlocked && (
                <div className="mt-4 bg-emerald-100 dark:bg-emerald-900 border-2 border-emerald-500 rounded-lg p-3">
                  <p className="text-emerald-700 dark:text-emerald-300 font-bold">✨ Early Access Unlocked!</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">You get early access to upcoming sales</p>
                </div>
              )}
            </div>
          )}

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
