import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface NotificationPrefs {
  emailNewSalesFromFollowed?: boolean;
  emailFlashDeals?: boolean;
  emailWeeklyDigest?: boolean;
  pushSalesNearMe?: boolean;
  // Privacy (default OFF): show my first name and last initial on leaderboards, crews and going lists.
  showNameInGoingList?: boolean;
}

interface NotificationPreferencesProps {
  // The full stored prefs object may hold keys this form does not edit (organizer digest, price
  // alerts, ...). They are passed through untouched on save so PATCH /users/me (which replaces
  // notificationPrefs wholesale) never erases them.
  userPrefs?: NotificationPrefs & Record<string, unknown>;
}

const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({ userPrefs: rawUserPrefs = {} }) => {
  const userPrefs = rawUserPrefs ?? {}; // guard against null (API can return null for notificationPrefs)
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailNewSalesFromFollowed: userPrefs.emailNewSalesFromFollowed ?? true,
    emailFlashDeals: userPrefs.emailFlashDeals ?? true,
    emailWeeklyDigest: userPrefs.emailWeeklyDigest ?? true,
    pushSalesNearMe: userPrefs.pushSalesNearMe ?? true,
    showNameInGoingList: userPrefs.showNameInGoingList === true,
  });

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (newPrefs: NotificationPrefs) =>
      api.patch('/users/me', { notificationPrefs: { ...userPrefs, ...newPrefs } }),
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
      <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Notification Settings</h3>
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
          <span className="ml-3 text-sm text-warm-900 dark:text-warm-200">
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
          <span className="ml-3 text-sm text-warm-900 dark:text-warm-200">
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
          <span className="ml-3 text-sm text-warm-900 dark:text-warm-200">
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
          <span className="ml-3 text-sm text-warm-900 dark:text-warm-200">
            Push notifications: New sales near me
          </span>
        </label>

        {/* Privacy: public name on leaderboards, crews and going lists (off unless the shopper opts in) */}
        <label className="flex items-start cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.showNameInGoingList === true}
            onChange={() => handleToggle('showNameInGoingList')}
            disabled={updateMutation.isPending}
            className="w-4 h-4 mt-0.5 text-amber-600 rounded focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-warm-900 dark:text-warm-200">
            Show my first name and last initial on leaderboards, crews and going lists
            <span className="block text-xs text-warm-500 dark:text-warm-400 mt-0.5">
              Off by default. When off, you appear as &quot;Explorer&quot; on leaderboards and crews, and you are counted but not named in going lists.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default NotificationPreferences;
