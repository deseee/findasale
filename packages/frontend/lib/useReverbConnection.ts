import { useQuery } from '@tanstack/react-query';
import api from './api';
import { useAuth } from '../components/AuthContext';

// Mirrors useDiscogsConnection.ts / useEbayConnection.ts exactly (Official-API Tier
// connection-status hook, see settings.tsx's Reverb tab for the connect/disconnect UI
// this status backs -- Personal Access Token model, see reverbConnector.ts's
// 2026-08-18 auth-model correction).
interface ReverbConnectionStatus {
  connected: boolean;
  status?: string;
  externalUserId?: string | null;
  connectedAt?: string;
  lastRefreshedAt?: string;
  error?: string | null;
}

export const useReverbConnection = () => {
  const { user } = useAuth();

  const { data: reverbStatus, isLoading, refetch } = useQuery({
    queryKey: ['reverb-connection-status'],
    queryFn: async () => {
      const response = await api.get('/reverb/connection');
      return response.data as ReverbConnectionStatus;
    },
    enabled: !!user,
  });

  return {
    isConnected: reverbStatus?.connected ?? false,
    reverbStatus,
    isLoading,
    refetch,
  };
};
