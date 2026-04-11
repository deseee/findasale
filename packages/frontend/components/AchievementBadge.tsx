import { Achievement } from '../hooks/useAchievements';

interface AchievementBadgeProps {
  achievement: Achievement;
  unlocked: boolean;
  progress?: number;
}

export const AchievementBadge = ({
  achievement,
  unlocked,
  progress = 0,
}: AchievementBadgeProps) => {
  const progressPercent = Math.min(
    100,
    (progress / achievement.targetValue) * 100
  );

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg p-4 border-2 transition-all ${
        unlocked
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900 dark:border-emerald-600 shadow-md'
          : 'border-gray-300 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 grayscale'
      }`}
      title={unlocked ? 'Achieved!' : 'Locked'}
    >
      {/* Icon or Lock */}
      <div className="text-4xl mb-2">
        {unlocked ? achievement.icon : '🔒'}
      </div>

      {/* Name */}
      <h3 className={`text-center text-sm font-bold mb-1 ${
        unlocked ? 'text-emerald-700 dark:text-emerald-200' : 'text-gray-600 dark:text-gray-300'
      }`}>
        {achievement.name}
      </h3>

      {/* Description */}
      <p className={`text-center text-xs mb-2 ${
        unlocked ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'
      }`}>
        {achievement.description}
      </p>

      {/* Progress Bar (if locked) */}
      {!unlocked && (
        <div className="w-full mt-2">
          <div className="bg-gray-300 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 dark:bg-blue-400 h-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-600 dark:text-gray-400 mt-1">
            {progress} / {achievement.targetValue}
          </p>
        </div>
      )}

      {/* Unlock Date */}
      {unlocked && achievement.unlockedAt && (
        <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 mt-1">
          Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};
