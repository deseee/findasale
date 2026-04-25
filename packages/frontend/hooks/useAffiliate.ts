import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface AffiliatePayout {
  amount: number;
  paidAt: string;
  stripeTransferId: string | null;
}

export interface AffiliateCodeResponse {
  referralCode: string | null;
  shareUrl: string | null;
  createdAt: string | null;
  message: string;
}

export interface AffiliateEarningsSummary {
  totalEarned: number; // cents
  unpaidBalance: number; // cents
  thisMonthEarnings: number; // cents
  referralCode: string | null;
  shareUrl: string | null;
  recentPayouts: AffiliatePayout[];
}

export interface AffiliateReferral {
  id: string;
  referredUserName: string;
  referredUserEmail: string;
  referralCode: string;
  status: 'PENDING' | 'QUALIFIED' | 'PAID' | 'CANCELLED';
  payoutAmountCents: number;
  qualifiedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AffiliateReferralsResponse {
  referrals: AffiliateReferral[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Get the authenticated organizer's affiliate code without creating one
 */
export const useAffiliateCode = () => {
  return useQuery<AffiliateCodeResponse>({
    queryKey: ['affiliateCode'],
    queryFn: async () => {
      const response = await api.get('/affiliate/code');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get earnings summary for the authenticated affiliate
 */
export const useAffiliateEarnings = () => {
  return useQuery<AffiliateEarningsSummary>({
    queryKey: ['affiliateEarnings'],
    queryFn: async () => {
      const response = await api.get('/affiliate/earnings-summary');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get paginated referrals list with optional status filter
 */
export const useAffiliateReferrals = (status?: string, limit = 25, offset = 0) => {
  let queryString = `?limit=${limit}&offset=${offset}`;
  if (status) {
    queryString += `&status=${status}`;
  }

  return useQuery<AffiliateReferralsResponse>({
    queryKey: ['affiliateReferrals', status, limit, offset],
    queryFn: async () => {
      const response = await api.get(`/affiliate/referrals${queryString}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Generate a new affiliate code for the authenticated organizer
 * Idempotent: returns existing code if one exists
 */
export const useGenerateAffiliateCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/affiliate/generate-code');
      return response.data as AffiliateCodeResponse;
    },
    onSuccess: () => {
      // Invalidate both code and earnings to refresh all affiliate UI
      queryClient.invalidateQueries({ queryKey: ['affiliateCode'] });
      queryClient.invalidateQueries({ queryKey: ['affiliateEarnings'] });
    },
  });
};
