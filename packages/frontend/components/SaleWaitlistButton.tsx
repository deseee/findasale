import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface Props {
  saleId: string;
}

interface WaitlistStatus {
  onWaitlist: boolean;
  count: number;
}

export default function SaleWaitlistButton({ saleId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');

  const { data: status, isLoading } = useQuery<WaitlistStatus>({
    queryKey: ['sale-waitlist-status', saleId],
    queryFn: async () => {
      const res = await api.get(`/sale-waitlist/${saleId}/status`);
      return res.data;
    },
    enabled: !!user,
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/sale-waitlist/${saleId}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-waitlist-status', saleId] });
      setFeedback("You're on the waitlist! We'll email you when new items are added.");
      setTimeout(() => setFeedback(''), 4000);
    },
    onError: () => setFeedback('Failed to join waitlist. Please try again.'),
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/sale-waitlist/${saleId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-waitlist-status', saleId] });
      setFeedback('Removed from waitlist.');
      setTimeout(() => setFeedback(''), 2500);
    },
  });

  if (isLoading && user) return <div className="h-9 w-36 animate-pulse bg-gray-100 dark:bg-gray-700 rounded-lg" />;

  const onWaitlist = status?.onWaitlist ?? false;
  const count = status?.count ?? 0;

  return !user ? null : (
    <div>
      <button
        onClick={() => onWaitlist ? leaveMutation.mutate() : joinMutation.mutate()}
        disabled={joinMutation.isPending || leaveMutation.isPending}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
          onWaitlist
            ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            : 'border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        aria-label={onWaitlist ? 'Leave new items waitlist' : 'Join new items waitlist'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
          <path d="M10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {onWaitlist ? 'Watching for new items' : 'Notify me of new items'}
        {count > 0 && (
          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({count})</span>
        )}
      </button>
      {feedback && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-400">{feedback}</p>
      )}
    </div>
  );
}
