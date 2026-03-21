import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ConversationDTO {
  id: string;
  saleId?: string | null;
  shopperUserId: string;
  organizerId: string;
  lastMessageAt: string;
  createdAt: string;
  shopperUser?: {
    id: string;
    name: string;
  };
  organizer?: {
    id: string;
    businessName: string;
    userId: string;
  };
  sale?: {
    id: string;
    title: string;
  };
  messages?: Array<{
    id: string;
    body: string;
    createdAt: string;
    sender: {
      id: string;
      name: string;
    };
  }>;
  _count?: {
    messages: number;
  };
}

/**
 * Fetch conversations for the logged-in user (organizer or shopper)
 * Organizers see conversations from their organizer ID
 * Shoppers see conversations they started
 */
const useConversations = (enabled: boolean = true) => {
  return useQuery<ConversationDTO[], Error>({
    queryKey: ['messages', 'conversations'],
    queryFn: async () => {
      const res = await api.get('/messages');
      return res.data;
    },
    enabled,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 120_000, // 2 minutes
  });
};

export default useConversations;
