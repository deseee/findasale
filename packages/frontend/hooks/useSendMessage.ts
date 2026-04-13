import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface SendMessagePayload {
  organizerId: string;
  saleId?: string | null;
  body: string;
}

export interface SendMessageResponse {
  conversation: {
    id: string;
    saleId?: string | null;
    shopperUserId: string;
    organizerId: string;
    lastMessageAt: string;
    createdAt: string;
  };
  message: {
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
  };
}

/**
 * Send a new message or start a new conversation with an organizer
 * If conversation exists, updates lastMessageAt. If not, creates new conversation.
 */
const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResponse, Error, SendMessagePayload>({
    mutationFn: async (payload: SendMessagePayload) => {
      const res = await api.post('/messages', payload);
      return res.data;
    },
    onSuccess: (data) => {
      // Invalidate conversations list to refresh
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
      // Invalidate thread if user navigates to it
      queryClient.setQueryData(
        ['messages', 'thread', data.conversation.id],
        (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              messages: [...(oldData.messages || []), data.message],
            };
          }
          return oldData;
        }
      );
    },
  });
};

export default useSendMessage;
