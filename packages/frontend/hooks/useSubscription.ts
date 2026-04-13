import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface SubscriptionData {
  tier: 'SIMPLE' | 'PRO' | 'TEAMS';
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
  billingInterval: 'monthly' | 'annual' | null;
}

export interface UsageStats {
  activeSalesCount: number;
  endedSalesCount: number;
  totalItemsCount: number;
  totalPhotosCount: number;
  limits: {
    maxItemsPerSale: number;
    maxPhotosPerItem: number;
    maxActiveSales: number;
  };
}

/**
 * useSubscription — Fetch current organizer subscription and tier details
 * Returns subscription tier, status, and renewal date from Stripe
 */
export function useSubscription() {
  return useQuery<SubscriptionData>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const response = await api.get('/billing/subscription');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * useUsageStats — Fetch current organizer usage stats (sales, items, photos)
 * Compares against tier-based limits
 */
export function useUsageStats() {
  return useQuery<UsageStats>({
    queryKey: ['usage-stats'],
    queryFn: async () => {
      const response = await api.get('/organizers/me/usage-stats');
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
