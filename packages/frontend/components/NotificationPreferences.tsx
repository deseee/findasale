import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface NotificationPrefs {
  emailNewSalesFromFollowed?: boolean;
  emailFlashDeals?: boolean;
  emailWeeklyDigest?: boolean;
  pushSalesNearMe?: boolean;
}

interface NotificationPreferencesProps {
  userPrefs?: NotificationPrefs;
}

const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({ userPrefs = {} }) => {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailNewSalesFromFollowed: userPrefs.emailNewSalesFromFollowed ?? true,
    emailFlashDeals: userPrefs.emailFlashDeals ?? true,
    emailWeeklyDigest: userPrefs.emailWeeklyDigest ?? true,
    pushSalesNearMe: userPrefs.pushSalesNearMe ?? true,
  });

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (newPrefs: NotificationPrefs) =>
      api.patch('/users/me', { notificationPrefs: newPrefs }),
    onSuccess: () => {
      showToast('Notification preferences updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update preferences', 'error');
    },
  });

  const handleToggle = (key: keyof NotificationPrefs) => {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    updateMutation.mutate(newPrefs);
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-warm-900 mb-4">Notification Settings</h3>
      <div className="space-y-4">
        {/* Email: New sales from followed organizers */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.emailNewSalesFromFollowed ?? true}
            onChange={() => handleToggle('emailNewSalesFromFollowed')}
            disabled={updateMutation.isPending}
            className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-warm-900">
            Email: New sales from organizers I follow
          </span>
        </label>

        {/* Email: Flash deals on saved items */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.emailFlashDeals ?? true}
            onChange={() => handleToggle('emailFlashDeals')}
            disabled={updateMutation.isPending}
            className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-warm-900">
            Email: Flash deals on my saved items
          </span>
        </label>

        {/* Email: Weekly digest */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.emailWeeklyDigest ?? true}
            onChange={() => handleToggle('emailWeeklyDigest')}
            disabled={updateMutation.isPending}
            className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-warm-900">
            Email: Weekly digest of curated sales
          </span>
        </label>

        {/* Push: Sales near me */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.pushSalesNearMe ?? true}
            onChange={() => handleToggle('pushSalesNearMe')}
            disabled={updateMutation.isPending}
            className="w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-warm-900">
            Push notifications: New sales near me
          </span>
        </label>
      </div>
    </div>
  );
};

export default NotificationPreferences;
