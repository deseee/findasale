import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface ReplyInThreadPayload {
  body: string;
}

export interface ReplyInThreadResponse {
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

/**
 * Reply to an existing conversation thread
 * Automatically updates the thread query cache with the new message
 */
const useReplyInThread = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation<ReplyInThreadResponse, Error, ReplyInThreadPayload>({
    mutationFn: async (payload: ReplyInThreadPayload) => {
      if (!conversationId) throw new Error('conversationId is required');
      const res = await api.post(`/messages/${conversationId}/reply`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      // Update thread query cache with new message
      queryClient.setQueryData(
        ['messages', 'thread', conversationId],
        (oldData: any) => {
          if (oldData) {
            return {
              ...oldData,
              messages: [...(oldData.messages || []), data],
            };
          }
          return oldData;
        }
      );
      // Invalidate conversations to update lastMessageAt
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
    },
  });
};

export default useReplyInThread;
