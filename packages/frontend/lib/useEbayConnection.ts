import { useQuery } from '@tanstack/react-query';
import api from './api';
import { useAuth } from '../components/AuthContext';

interface EbayConnectionStatus {
  connected: boolean;
  ebayUserId?: string;
  ebayAccountEmail?: string;
}

export const useEbayConnection = () => {
  const { user } = useAuth();

  const { data: ebayStatus, isLoading, refetch } = useQuery({
    queryKey: ['ebay-connection-status'],
    queryFn: async () => {
      const response = await api.get('/ebay/connection');
      return response.data as EbayConnectionStatus;
    },
    enabled: !!user,
  });

  return {
    isConnected: ebayStatus?.connected ?? false,
    ebayStatus,
    isLoading,
    refetch,
  };
};
