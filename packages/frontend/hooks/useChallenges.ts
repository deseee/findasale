import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../components/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

/**
 * Fetch all challenges (past, current, upcoming)
 */
export const useAllChallenges = () => {
  return useQuery({
    queryKey: ['challenges', 'all'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/challenges`);
      if (!res.ok) throw new Error('Failed to fetch challenges');
      return res.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

/**
 * Fetch active challenges with objectives
 */
export const useActiveChallenges = () => {
  return useQuery({
    queryKey: ['challenges', 'active'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/challenges/active`);
      if (!res.ok) throw new Error('Failed to fetch active challenges');
      return res.json();
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
};

/**
 * Fetch authenticated user's progress on all active challenges
 */
export const useMyChallengeProgress = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['challenges', 'my-progress', user?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/challenges/my-progress`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch progress');
      return res.json();
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Fetch leaderboard for a specific challenge
 */
export const useLeaderboard = (challengeId: string) => {
  return useQuery({
    queryKey: ['challenges', 'leaderboard', challengeId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/challenges/${challengeId}/leaderboard`);
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      return res.json();
    },
    enabled: !!challengeId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
};
