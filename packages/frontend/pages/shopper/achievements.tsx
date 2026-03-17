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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading achievements...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Failed to load achievements</p>
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

      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-emerald-900 mb-2">Achievements</h1>
            <p className="text-gray-600">
              {unlockedCount} of {totalCount} achievements unlocked
            </p>
          </div>

          {streak && (
            <div className="bg-white rounded-lg border-2 border-amber-300 shadow-lg p-6 mb-8 text-center">
              <div className="text-6xl mb-2">🔥</div>
              <h2 className="text-2xl font-bold text-amber-700 mb-2">Current Streak</h2>
              <p className="text-3xl font-bold text-amber-600 mb-4">{streak.currentStreak} weekends</p>
              <p className="text-gray-600 mb-2">Longest streak: {streak.longestStreak} weekends</p>
              {streak.earlyAccessUnlocked && (
                <div className="mt-4 bg-emerald-100 border-2 border-emerald-500 rounded-lg p-3">
                  <p className="text-emerald-700 font-bold">✨ Early Access Unlocked!</p>
                  <p className="text-sm text-emerald-600">You get early access to upcoming sales</p>
                </div>
              )}
            </div>
          )}

          {shoppingAchievements.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-emerald-900 mb-4">🛍️ Shopper Achievements</h2>
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
              <h2 className="text-2xl font-bold text-emerald-900 mb-4">📦 Organizer Achievements</h2>
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
              <h2 className="text-2xl font-bold text-emerald-900 mb-4">⭐ Shared Achievements</h2>
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
