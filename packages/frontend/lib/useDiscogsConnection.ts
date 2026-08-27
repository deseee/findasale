import { useQuery } from '@tanstack/react-query';
import api from './api';
import { useAuth } from '../components/AuthContext';

// Mirrors useEbayConnection.ts exactly (Official-API Tier connection-status hook,
// see settings.tsx's Discogs tab for the connect/disconnect UI this status backs).
interface DiscogsConnectionStatus {
  connected: boolean;
  externalUserId?: string;
  connectedAt?: string;
  error?: string;
}

export const useDiscogsConnection = () => {
  const { user } = useAuth();

  const { data: discogsStatus, isLoading, refetch } = useQuery({
    queryKey: ['discogs-connection-status'],
    queryFn: async () => {
      const response = await api.get('/discogs/connection');
      return response.data as DiscogsConnectionStatus;
    },
    enabled: !!user,
  });

  return {
    isConnected: discogsStatus?.connected ?? false,
    discogsStatus,
    isLoading,
    refetch,
  };
};
