import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export type NudgeType = 'FAVORITE_MILESTONE' | 'STREAK_CONTINUATION' | 'TIER_PROGRESS' | 'HUNT_PASS_TEASE';

export interface Nudge {
  type: NudgeType;
  message: string;
  progress?: {
    current: number;
    target: number;
  };
  priority: number;
}

export interface NudgesData {
  nudges: Nudge[];
}

/**
 * useNudges — Feature 61: fetches personalized nudges for the authenticated user.
 * Returns nudges array (empty if no nudges) and loading state.
 * Query is disabled when unauthenticated.
 */
const useNudges = (enabled = true) => {
  const query = useQuery<NudgesData>({
    queryKey: ['nudges'],
    queryFn: async () => {
      const response = await api.get('/nudges');
      return response.data as NudgesData;
    },
    enabled,
    staleTime: 300_000, // 300 seconds
  });

  return {
    nudges: query.data?.nudges ?? [],
    topNudge: query.data?.nudges?.[0] ?? null,
    loading: query.isLoading,
    ...query,
  };
};

export default useNudges;
