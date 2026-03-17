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
          ? 'border-emerald-500 bg-emerald-50 shadow-md'
          : 'border-gray-300 bg-gray-50 grayscale'
      }`}
      title={unlocked ? 'Achieved!' : 'Locked'}
    >
      {/* Icon or Lock */}
      <div className="text-4xl mb-2">
        {unlocked ? achievement.icon : '🔒'}
      </div>

      {/* Name */}
      <h3 className={`text-center text-sm font-bold mb-1 ${
        unlocked ? 'text-emerald-700' : 'text-gray-600'
      }`}>
        {achievement.name}
      </h3>

      {/* Description */}
      <p className={`text-center text-xs mb-2 ${
        unlocked ? 'text-emerald-600' : 'text-gray-500'
      }`}>
        {achievement.description}
      </p>

      {/* Progress Bar (if locked) */}
      {!unlocked && (
        <div className="w-full mt-2">
          <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-500 mt-1">
            {progress} / {achievement.targetValue}
          </p>
        </div>
      )}

      {/* Unlock Date */}
      {unlocked && achievement.unlockedAt && (
        <p className="text-center text-xs text-emerald-600 mt-1">
          Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};
