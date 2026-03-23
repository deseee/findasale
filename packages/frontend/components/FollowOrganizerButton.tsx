import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface Props {
  organizerId: string;
  organizerName: string;
  size?: 'sm' | 'md';
}

const FollowOrganizerButton: React.FC<Props> = ({ organizerId, organizerName, size = 'md' }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isFollowing, setIsFollowing] = useState(false);

  const { isLoading: statusLoading, data: followData } = useQuery({
    queryKey: ['follow-status', organizerId],
    queryFn: async () => {
      const r = await api.get(`/organizers/${organizerId}/follow-status`);
      return r.data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (followData) setIsFollowing((followData as any).isFollowing);
  }, [followData]);

  const mutation = useMutation({
    mutationFn: () =>
      isFollowing
        ? api.delete(`/organizers/${organizerId}/follow`)
        : api.post(`/organizers/${organizerId}/follow`),
    onSuccess: () => {
      setIsFollowing(!isFollowing);
      queryClient.invalidateQueries({ queryKey: ['follow-status', organizerId] });
      queryClient.invalidateQueries({ queryKey: ['my-follows'] });  // Must match useFollows() cache key
    },
  });

  if (!user) return null;

  const btnSm = size === 'sm';
  const isLoading = statusLoading || mutation.isPending;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={isLoading}
      className={`flex items-center gap-1 font-semibold rounded-lg transition border ${
        isFollowing
          ? 'bg-white text-amber-700 border-amber-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300'
          : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
      } disabled:opacity-50 ${btnSm ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5'}`}
      title={isFollowing ? `Unfollow ${organizerName}` : `Follow ${organizerName}`}
    >
      {isFollowing ? '✓ Following' : '+ Follow'}
    </button>
  );
};

export default FollowOrganizerButton;
