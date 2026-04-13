import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface PassportData {
  stamps: { type: string; count: number }[];
  milestones: { milestone: number; badgeType: string; earnedAt: string }[];
  totalStamps: number;
  nextMilestone: string;
  stampsToNextMilestone: number;
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
