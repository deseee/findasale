import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';

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
      const response = await api.get('/achievements/me');
      return response.data;
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
      const response = await api.post('/achievements/visit');
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch achievements
      queryClient.invalidateQueries({
        queryKey: ['achievements', 'me', user?.id],
      });
    },
  });
};
