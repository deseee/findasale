/**
 * RemindMeButton Component
 * Allows logged-in shoppers to set email reminders for upcoming sales
 * Props:
 * - saleId: ID of the sale
 * - saleName: Name/title of the sale (for display)
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface RemindMeButtonProps {
  saleId: string;
  saleName: string;
  disabled?: boolean; // Disable button if sale is ended or cancelled
}

const RemindMeButton: React.FC<RemindMeButtonProps> = ({ saleId, saleName, disabled = false }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reminderId, setReminderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if reminder exists for this sale
  const { data: reminderData } = useQuery({
    queryKey: ['reminder', saleId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const response = await api.get(`/reminders/sale/${saleId}`);
        return response.data?.reminder;
      } catch (error: any) {
        // 401 means not logged in — that's fine, we'll handle it in the button
        if (error.response?.status === 401) return null;
        throw error;
      }
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (reminderData?.id) {
      setReminderId(reminderData.id);
    }
  }, [reminderData]);

  // Create reminder mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/reminders', {
        saleId,
        reminderType: 'email',
      });
      return response.data?.reminder;
    },
    onSuccess: (data) => {
      setReminderId(data.id);
      showToast(`Reminder set for ${saleName}`, 'success');
    },
    onError: (error: any) => {
      if (error.response?.status === 401) {
        showToast('Sign in to set reminders', 'info');
      } else {
        showToast('Failed to set reminder', 'error');
      }
    },
  });

  // Delete reminder mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reminders/${id}`);
    },
    onSuccess: () => {
      setReminderId(null);
      showToast(`Reminder cancelled for ${saleName}`, 'success');
    },
    onError: () => {
      showToast('Failed to cancel reminder', 'error');
    },
  });

  const handleClick = () => {
    if (disabled) {
      showToast('Reminders cannot be set for ended or cancelled sales', 'info');
      return;
    }

    if (!user?.id) {
      showToast('Sign in to set reminders', 'info');
      return;
    }

    setIsLoading(true);

    if (reminderId) {
      deleteMutation.mutate(reminderId);
    } else {
      createMutation.mutate();
    }

    setIsLoading(false);
  };

  const isActive = !!reminderId;
  const isProcessing = isLoading || createMutation.isPending || deleteMutation.isPending;

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing || disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-800/40 dark:text-amber-100'
          : 'bg-green-100 text-green-900 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-800/40 dark:text-green-100'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={
        disabled
          ? 'Reminders not available for this sale'
          : isActive
          ? 'Cancel email reminder for this sale'
          : 'Set email reminder — we\'ll notify you 24 hours before the sale'
      }
    >
      <span>🔔</span>
      {isActive ? 'Cancel Reminder' : 'Remind Me by Email'}
    </button>
  );
};

export default RemindMeButton;
