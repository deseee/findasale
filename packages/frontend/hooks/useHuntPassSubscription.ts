import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface HuntPassStatus {
  huntPassActive: boolean;
  huntPassExpiry: string | null;
  /** true = cancel is scheduled: access continues until huntPassExpiry, then it stops renewing */
  huntPassCancelAtPeriodEnd: boolean;
  huntPassBillingProcessor: string | null;
  huntPassSubscriptionId: string | null;
}

export interface HuntPassChangeResponse {
  cancelAtPeriodEnd: boolean;
  alreadyCancelled?: boolean;
  alreadyActive?: boolean;
  expiresAt: string | null;
  message: string;
}

// Same query key as StreakWidget so both stay in sync after a cancel or undo.
const KEY = ['streak-profile'];

export function useHuntPassStatus(enabled: boolean) {
  return useQuery<HuntPassStatus>({
    queryKey: KEY,
    queryFn: async () => {
      const response = await api.get('/streaks/profile');
      return response.data;
    },
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** POST /api/streaks/cancel-huntpass: schedules cancel at the end of the paid period. */
export function useCancelHuntPass() {
  const queryClient = useQueryClient();
  return useMutation<HuntPassChangeResponse, any, void>({
    mutationFn: async () => {
      const response = await api.post('/streaks/cancel-huntpass');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** POST /api/streaks/resume-huntpass: undo a scheduled cancel while the paid period is running. */
export function useResumeHuntPass() {
  const queryClient = useQueryClient();
  return useMutation<HuntPassChangeResponse, any, void>({
    mutationFn: async () => {
      const response = await api.post('/streaks/resume-huntpass');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
