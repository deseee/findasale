import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string;
  };
}

export interface ThreadDTO {
  conversation: {
    id: string;
    saleId?: string | null;
    shopperUserId: string;
    organizerId: string;
    shopperUser: {
      id: string;
      name: string;
    };
    organizer: {
      id: string;
      businessName: string;
      userId: string;
    };
    sale?: {
      id: string;
      title: string;
    };
  };
  messages: MessageDTO[];
}

/**
 * Fetch full thread (conversation + all messages) for a given conversation ID
 * Automatically marks unread messages as read when fetched
 */
const useThread = (conversationId: string | null, enabled: boolean = true) => {
  return useQuery<ThreadDTO, Error>({
    queryKey: ['messages', 'thread', conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error('conversationId is required');
      const res = await api.get(`/messages/${conversationId}`);
      return res.data;
    },
    enabled: enabled && !!conversationId,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  });
};

export default useThread;
