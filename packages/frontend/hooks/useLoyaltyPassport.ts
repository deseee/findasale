import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface PassportProgress {
  current: number;
  target: number;
  label: string;
}

export interface PassportSlot {
  key: string;
  category: 'VISIT' | 'PURCHASE' | 'SHARE' | 'COMMUNITY' | string;
  categoryLabel: string;
  name: string;
  icon: string;
  howToEarn: string;
  repeatable: boolean;
  earned: boolean;
  timesEarned: number;
  firstEarnedAt: string | null;
  lastEarnedAt: string | null;
  latestPlaceLabel: string | null;
  latestSaleId: string | null;
  unseen: boolean;
  progress: PassportProgress | null;
}

export interface PassportMilestoneView {
  milestone: number;
  badgeType: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | string;
  name: string;
  cosmetic: string;
  earned: boolean;
  earnedAt: string | null;
  unseen: boolean;
}

export interface UnlockedStamp {
  id: string;
  key: string;
  name: string;
  icon: string;
  earnedAt: string;
  placeLabel: string | null;
  saleId: string | null;
}

export interface UnlockedMilestone {
  milestone: number;
  badgeType: string;
  name: string;
  cosmetic: string;
}

export interface SalePassport {
  name: string;
  totalSlots: number;
  earnedSlots: number;
  slots: PassportSlot[];
  milestones: PassportMilestoneView[];
  next: { milestone: number; badgeType: string; name: string; stampsToGo: number } | null;
  history: {
    id: string;
    key: string;
    name: string;
    icon: string;
    earnedAt: string;
    placeLabel: string | null;
    saleId: string | null;
  }[];
  unseen: { stamps: UnlockedStamp[]; milestones: UnlockedMilestone[] };
  activity: { total: number; tier: string | null; nextTierAt: number | null };
}

export interface PassportData {
  // Legacy fields (still returned by GET /loyalty/passport)
  stamps: { type: string; count: number }[];
  milestones: { milestone: number; badgeType: string; earnedAt: string }[];
  totalStamps: number;
  nextMilestone: string;
  stampsToNextMilestone: number;
  // Sale Passport (2026-09-29)
  passport?: SalePassport;
}

export function useLoyaltyPassport() {
  const { data, isLoading, error, refetch } = useQuery<PassportData>({
    queryKey: ['loyalty-passport'],
    queryFn: async () => {
      const response = await api.get('/loyalty/passport');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    passport: data,
    isLoading,
    error,
    refetch,
  };
}

/** Marks unlock toasts as shown so they never fire twice. */
export function useMarkPassportSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { all?: boolean; stampIds?: string[]; milestones?: number[] }) => {
      const response = await api.post('/loyalty/passport/seen', input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-passport-unseen'] });
    },
  });
}

/**
 * Lightweight unseen-unlocks query for the global watcher. sync=1 asks the server to
 * re-derive stamps first (throttled server side), so unlocks from actions with no award hook
 * still surface as a toast.
 */
export function usePassportUnseen(enabled: boolean) {
  return useQuery<{ stamps: UnlockedStamp[]; milestones: UnlockedMilestone[] }>({
    queryKey: ['loyalty-passport-unseen'],
    queryFn: async () => {
      const response = await api.get('/loyalty/passport/unseen', { params: { sync: 1 } });
      return response.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
