import { Achievement } from '../hooks/useAchievements';
import { AchievementBadge } from './AchievementBadge';

interface AchievementBadgesSectionProps {
  achievements: Achievement[];
  showStats?: boolean;
}

export const AchievementBadgesSection = ({
  achievements,
  showStats = true,
}: AchievementBadgesSectionProps) => {
  const shoppingAchievements = achievements.filter((a) => a.category === 'SHOPPER');
  const organizerAchievements = achievements.filter((a) => a.category === 'ORGANIZER');
  const sharedAchievements = achievements.filter((a) => a.category === 'SHARED');

  if (achievements.length === 0) {
    return null;
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  return (
    <div className="space-y-6">
      {showStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4 border-emerald-500">
          <p className="text-sm text-gray-600 dark:text-gray-400">Achievements Unlocked</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
            {unlockedCount} <span className="text-lg text-gray-600 dark:text-gray-400">/ {totalCount}</span>
          </p>
        </div>
      )}

      {shoppingAchievements.length > 0 && (
        <section>
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">🛍️ Shopper Achievements</h3>
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
        <section>
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">📦 Organizer Achievements</h3>
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
        <section>
          <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mb-4">⭐ Shared Achievements</h3>
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
  );
};
