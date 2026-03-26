import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import HuntPassModal from './HuntPassModal';

interface StreakProfile {
  userId: string;
  name: string;
  streakPoints: number;
  visitStreak: number;
  huntPassActive: boolean;
  huntPassExpiry: string | null;
  streaks: Record<string, any>;
}

const StreakWidget: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isHuntPassModalOpen, setIsHuntPassModalOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: profile, isLoading } = useQuery<StreakProfile>({
    queryKey: ['streak-profile'],
    queryFn: async () => {
      const response = await api.get('/streaks/profile');
      return response.data;
    },
    enabled: mounted,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  if (!mounted || isLoading) return null;
  if (!profile) return null;

  const handleHuntPassSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['streak-profile'] });
    setIsHuntPassModalOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/30 dark:to-yellow-900/30 rounded-lg border border-orange-200 dark:border-orange-700">
      {/* Fire emoji + visit streak */}
      <div className="flex items-center gap-1">
        <span className="text-lg">🔥</span>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Streak</span>
          <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{profile.visitStreak}</span>
        </div>
      </div>

      {/* Points badge */}
      <div className="flex items-center gap-1 border-l border-orange-300 dark:border-orange-700 pl-3">
        <span className="text-lg">⭐</span>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Points</span>
          <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{profile.streakPoints}</span>
        </div>
      </div>

      {/* Hunt Pass badge or upgrade button */}
      {profile.huntPassActive ? (
        <div className="flex items-center gap-1 border-l border-orange-300 dark:border-orange-700 pl-3">
          <span className="text-lg">👑</span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Hunt Pass</span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2x Points</span>
          </div>
        </div>
      ) : (
        <div className="border-l border-orange-300 dark:border-orange-700 pl-3">
          <button
            onClick={() => setIsHuntPassModalOpen(true)}
            className="py-1 px-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white text-xs font-semibold rounded transition"
            title="Get early access to flash deals, 2x points, and exclusive badge"
          >
            Upgrade
          </button>
        </div>
      )}
    </div>

    <HuntPassModal
      isOpen={isHuntPassModalOpen}
      onClose={() => setIsHuntPassModalOpen(false)}
      onSuccess={handleHuntPassSuccess}
    />
    </>
  );
};

export default StreakWidget;
