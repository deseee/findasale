import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ExplorerRank } from '../components/RankBadge';

export interface XpProfileData {
  guildXp: number;
  explorerRank: ExplorerRank;
  rankProgress: {
    currentXp: number;
    nextRankXp: number;
    nextRank: ExplorerRank | null; // null if at GRANDMASTER
  };
}

/**
 * useXpProfile — fetches the authenticated user's guild XP, explorer rank, and rank progress.
 * Returns null data when unauthenticated (query is disabled).
 */
const useXpProfile = (enabled = true) => {
  return useQuery<XpProfileData>({
    queryKey: ['xpProfile'],
    queryFn: async () => {
      const response = await api.get('/api/xp/profile');
      return response.data as XpProfileData;
    },
    enabled,
    staleTime: 300_000, // 300 seconds
  });
};

export default useXpProfile;
