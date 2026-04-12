import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ActivityFeedItem {
  id: string;
  type: 'favorite' | 'purchase' | 'rsvp' | 'message' | 'review' | 'hold';
  saleName: string;
  saleId: string;
  message: string;
  detail?: string;
  amount?: number;
  timestamp: string;
}

export interface OrganizerActivityFeedResponse {
  success: boolean;
  activities: ActivityFeedItem[];
}

/**
 * Fetch recent activity across all organizer's sales
 * Includes: favorites, purchases, RSVPs, messages, reviews, holds
 * Auto-refreshes every 30 seconds
 */
export function useOrganizerActivityFeed(saleIds?: string[]) {
  return useQuery({
    queryKey: ['organizer-activity-feed', saleIds],
    queryFn: async () => {
      const response = await api.get('/organizer/activity-feed', {
        params: saleIds ? { saleIds: saleIds.join(',') } : undefined,
      });
      return response.data as OrganizerActivityFeedResponse;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}
