import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';

interface ReferralCode {
  referralCode: string;
  referralLink: string;
}

interface ReferralStats {
  totalReferrals: number;
  totalRewardsEarned: number;
  pendingRewards: number;
}

interface ReferralData extends ReferralCode, ReferralStats {}

/**
 * Hook for fetching user's referral code and statistics.
 * Combines code endpoint and stats endpoint into a single query.
 */
export const useReferral = () => {
  const query = useQuery<ReferralData, Error>({
    queryKey: ['referral'],
    queryFn: async () => {
      try {
        const [codeRes, statsRes] = await Promise.all([
          api.get<ReferralCode>('/referrals/my-code'),
          api.get<ReferralStats>('/referrals/stats'),
        ]);

        return {
          ...codeRes.data,
          ...statsRes.data,
        };
      } catch (error) {
        console.error('Error fetching referral data:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const claimMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const response = await api.post(`/referrals/claim/${rewardId}`);
      return response.data;
    },
    onSuccess: () => {
      // Refetch stats after claiming a reward
      query.refetch();
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    claimReward: claimMutation.mutate,
    isClaimingReward: claimMutation.isPending,
  };
};
