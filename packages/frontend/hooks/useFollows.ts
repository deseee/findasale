import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

interface FollowedOrganizer {
  id: string;
  organizerId: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  createdAt: string;
  organizer: {
    id: string;
    businessName: string;
    profilePhoto: string | null;
  };
}

export function useFollows() {
  const { user } = useAuth();

  return useQuery<FollowedOrganizer[]>({
    queryKey: ['my-follows'],
    queryFn: async () => {
      const res = await api.get('/smart-follows/my');
      return res.data;
    },
    enabled: !!user?.id,
  });
}
