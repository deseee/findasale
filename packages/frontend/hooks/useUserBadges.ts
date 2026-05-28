import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';

export interface LocalLegendBadgeData {
  zip: string;
  awardedAt: string;
}

export interface OGBuyerBadgeData {
  saleId: string;
  saleTitle: string;
  awardedAt: string;
}

export interface UserBadgesResponse {
  localLegend: LocalLegendBadgeData[];
  ogBuyer: OGBuyerBadgeData[];
}

/**
 * Fetch scoped badges (Local Legend, OG Buyer) for the authenticated user.
 * Feature #399 + #404.
 */
export const useUserBadges = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['achievements', 'badges', user?.id],
    queryFn: async (): Promise<UserBadgesResponse> => {
      const response = await api.get('/achievements/badges');
      return response.data;
    },
    enabled: !!user,
    staleTime: 0, // always fresh — badges can be awarded at any time
  });
};
