import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

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

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200">
      {/* Fire emoji + visit streak */}
      <div className="flex items-center gap-1">
        <span className="text-lg">🔥</span>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-600">Streak</span>
          <span className="text-sm font-bold text-orange-600">{profile.visitStreak}</span>
        </div>
      </div>

      {/* Points badge */}
      <div className="flex items-center gap-1 border-l border-orange-300 pl-3">
        <span className="text-lg">⭐</span>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-600">Points</span>
          <span className="text-sm font-bold text-yellow-600">{profile.streakPoints}</span>
        </div>
      </div>

      {/* Hunt Pass badge */}
      {profile.huntPassActive && (
        <div className="flex items-center gap-1 border-l border-orange-300 pl-3">
          <span className="text-lg">👑</span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-600">Hunt Pass</span>
            <span className="text-xs font-bold text-purple-600">2x Points</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreakWidget;
