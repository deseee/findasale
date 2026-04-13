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
