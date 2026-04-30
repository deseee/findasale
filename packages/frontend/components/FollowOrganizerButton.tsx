import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useFeedbackSurvey } from '../hooks/useFeedbackSurvey';

interface Props {
  organizerId: string;
  organizerName: string;
  size?: 'sm' | 'md';
}

const FollowOrganizerButton: React.FC<Props> = ({ organizerId, organizerName, size = 'md' }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showSurvey } = useFeedbackSurvey();
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
      if (!isFollowing) {
        showSurvey('SH-5');
      }
      setIsFollowing(!isFollowing);
      queryClient.invalidateQueries({ queryKey: ['follow-status', organizerId] });
      queryClient.invalidateQueries({ queryKey: ['my-follows'] });  // Must match useFollows() cache key
    },
  });

  const btnSm = size === 'sm';
  const isLoading = statusLoading || mutation.isPending;

  return !user ? null : (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={isLoading}
      className={`flex items-center gap-1 font-medium rounded-lg transition border disabled:opacity-50 ${
        isFollowing
          ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700'
          : 'bg-transparent text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
      } ${btnSm ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5 min-h-[36px]'}`}
      title={isFollowing ? `Unfollow ${organizerName}` : `Follow ${organizerName}`}
    >
      {isFollowing ? '✓ Following' : '+ Follow'}
    </button>
  );
}

export default FollowOrganizerButton;
