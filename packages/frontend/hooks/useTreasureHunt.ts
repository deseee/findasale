import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type HuntItemState =
  | 'NO_HUNT'
  | 'NOT_FOUND'
  | 'NOT_A_MATCH'
  | 'UNAVAILABLE'
  | 'OWN_ITEM'
  | 'HUNT_EXPIRED'
  | 'ALREADY_FOUND'
  | 'ELIGIBLE';

export interface HuntItemStatus {
  state: HuntItemState;
  loggedIn: boolean;
  huntId?: number;
  clue?: string;
  category?: string;
  pointReward?: number;
  expiresAt?: string;
}

export interface HuntClaimResponse {
  success: boolean;
  alreadyFound: boolean;
  state: string;
  huntId?: number;
  xpEarned?: number;
  pointsEarned?: number;
  guildXp?: number;
  explorerRank?: string;
  rankIncreased?: boolean;
  message: string;
}

/** Is this item today's treasure, and can the viewer claim it? Never exposes hunt keywords. */
export function useHuntItemStatus(itemId: string | undefined, userKey: string) {
  return useQuery<HuntItemStatus>({
    queryKey: ['treasureHunt', 'item', itemId, userKey],
    queryFn: async () => {
      const response = await api.get(`/treasure-hunt/item/${itemId}`);
      return response.data;
    },
    enabled: !!itemId,
    staleTime: 60 * 1000,
    retry: 0,
  });
}

/** Claim today's Daily Treasure Hunt with an item (server validated, idempotent). */
export function useClaimTreasureHunt() {
  const queryClient = useQueryClient();
  return useMutation<HuntClaimResponse, any, { itemId: string; huntId?: number }>({
    mutationFn: async ({ itemId, huntId }) => {
      const response = await api.post('/treasure-hunt/found', { itemId, huntId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasureHunt'] });
      // XP changed: refresh the XP profile so the rank-up modal can fire if a rank was crossed.
      queryClient.invalidateQueries({ queryKey: ['xpProfile'] });
    },
  });
}
