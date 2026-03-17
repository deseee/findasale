import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../components/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  category: 'SHOPPER' | 'ORGANIZER' | 'SHARED';
  targetValue: number;
  unlocked: boolean;
  progress: number;
  unlockedAt: string | null;
}

export interface Streak {
  currentStreak: number;
  longestStreak: number;
  earlyAccessUnlocked: boolean;
}

export interface AchievementsResponse {
  achievements: Achievement[];
  streak: Streak;
}

/**
 * Fetch all achievements and streak for the authenticated user
 */
export const useMyAchievements = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['achievements', 'me', user?.id],
    queryFn: async (): Promise<AchievementsResponse> => {
      const res = await fetch(`${API_BASE}/achievements/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch achievements');
      }

      return res.json();
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Record a weekend visit for the authenticated user
 */
export const useRecordWeekendVisit = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/achievements/visit`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to record visit');
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate and refetch achievements
      queryClient.invalidateQueries({
        queryKey: ['achievements', 'me', user?.id],
      });
    },
  });
};
