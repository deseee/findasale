import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Phase 20: Poll unread message count every 30 seconds.
 * Used by BottomTabNav to show a badge on the Messages tab.
 */
const useUnreadMessages = (enabled: boolean) => {
  return useQuery<{ unread: number }>({
    queryKey: ['messages', 'unread-count'],
    queryFn: async () => {
      const res = await api.get('/messages/unread-count');
      return res.data;
    },
    enabled,
    refetchInterval: 30_000, // 30s polling
    staleTime: 20_000,
  });
};

export default useUnreadMessages;
