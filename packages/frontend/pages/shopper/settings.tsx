/**
 * Shopper Settings Page
 *
 * Page: /shopper/settings
 * - Display & Performance settings (low-bandwidth mode, theme)
 * - Notification preferences
 * - Account settings (email, password, preferences)
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useLowBandwidth } from '@/contexts/LowBandwidthContext';
import { useAuth } from '@/components/AuthContext';
import FeedbackMenu from '@/components/FeedbackMenu';

const SALE_CATEGORIES = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles', 'art',
  'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing', 'home', 'other'
];

function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isLowBandwidth, setIsManualOverride, isManualOverride } = useLowBandwidth();
  const [mounted, setMounted] = useState(false);
  const [lowBandwidthEnabled, setLowBandwidthEnabled] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [profileSlug, setProfileSlug] = useState<string>('');
  const [purchasesVisible, setPurchasesVisible] = useState<boolean>(true);
  const [isFeedbackMenuOpen, setIsFeedbackMenuOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [spendableXp, setSpendableXp] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    setLowBandwidthEnabled(isLowBandwidth);
  }, [isLowBandwidth]);

  useEffect(() => {
    if (user?.categoryInterests) {
      setSelectedInterests(user.categoryInterests);
    }
  }, [user?.categoryInterests]);

  useEffect(() => {
    if (user) {
      setProfileSlug(user.profileSlug || '');
      setPurchasesVisible(user.purchasesVisible !== false);
    }
  }, [user]);

  // Fetch XP profile data for slug unlock UI
  const { data: xpProfile } = useQuery({
    queryKey: ['xpProfile'],
    queryFn: async () => {
      const response = await api.get('/xp/profile');
      return response.data;
    },
    enabled: !!user,
  });

  // Update spendable XP when profile loads
  useEffect(() => {
    if (xpProfile?.spendableXp !== undefined) {
      setSpendableXp(xpProfile.spendableXp);
    }
  }, [xpProfile]);

  // Mutation for updating category interests
  const updateInterestsMutation = useMutation({
    mutationFn: async (interests: string[]) => {
      const response = await api.patch('/users/me/interests', { categoryInterests: interests });
      return response.data;
    },
    onSuccess: () => {
      setSuccessMessage('Interests saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: () => {
      setSuccessMessage('Failed to save interests. Please try again.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  });

  // Mutation for updating profile settings
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { profileSlug?: string | null; purchasesVisible?: boolean }) => {
      const response = await api.patch('/users/me', data);
      return response.data;
    },
    onSuccess: () => {
      setSuccessMessage('Public profile settings saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save profile settings';
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  });

  // Mutation for deleting account
  const deleteAccountMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await api.delete('/users/me', {
        data: { password }
      });
      return response.data;
    },
    onSuccess: async () => {
      // Clear auth and redirect to home
      localStorage.removeItem('authToken');
      window.location.href = '/';
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete account';
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  });

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading || !mounted) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
      </div>
    );
  }

  const handleLowBandwidthToggle = () => {
    const newState = !lowBandwidthEnabled;
    setLowBandwidthEnabled(newState);
    setIsManualOverride(newState);
    // Persist to localStorage
    if (newState) {
      localStorage.setItem('lowBandwidthOverride', 'true');
    } else {
      localStorage.removeItem('lowBandwidthOverride');
    }
  };

  return (
    <>
      <Head>
        <title>Settings - FindA.Sale</title>
      </Head>

      <div className="max-w-4xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Manage your account and preferences</p>
          </div>

          {/* Display & Performance Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Display & Performance</h2>

            {/* Low Bandwidth Mode */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-6 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Low-Bandwidth Mode</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Reduces image quality and disables video previews to save data on slow connections.
                  </p>
                  {isManualOverride && (
                    <p className="text-xs text-amber-600 font-medium mt-2">
                      Manually enabled — will stay active regardless of connection speed
                    </p>
                  )}
                </div>
                <button
                  onClick={handleLowBandwidthToggle}
                  className={`ml-4 flex-shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    lowBandwidthEnabled ? 'bg-amber-600' : 'bg-gray-300'
                  }`}
                  role="switch"
                  aria-checked={lowBandwidthEnabled}
                  aria-label="Toggle low-bandwidth mode"
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                      lowBandwidthEnabled ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {lowBandwidthEnabled && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Active:</strong> Images are optimized for slower connections and video previews are disabled.
                  </p>
                </div>
              )}
            </div>

            {/* Network Detection Info */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Network Detection</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Low-Bandwidth Mode is{' '}
                <span className={isManualOverride ? 'text-amber-700 font-semibold' : 'text-gray-700'}>
                  {isManualOverride ? 'manually overridden' : isLowBandwidth ? 'auto-detected' : 'not active'}
                </span>
              </p>
            </div>
          </div>

          {/* Notification Settings Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Notifications</h2>

            <div className="space-y-6">
              {/* Email Notifications */}
              <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Notifications</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Receive email updates about your sales, bids, and wishlist alerts
                    </p>
                  </div>
                  <button
                    className={`flex-shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors bg-amber-600`}
                    role="switch"
                    aria-checked={true}
                    aria-label="Email notifications"
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 translate-x-7`} />
                  </button>
                </div>
              </div>

              {/* Push Notifications */}
              {typeof window !== 'undefined' && 'Notification' in window && (
                <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Push Notifications</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Get real-time alerts on your device for important updates
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (Notification.permission === 'granted') {
                          const reg = await navigator.serviceWorker.ready;
                          const sub = await reg.pushManager.getSubscription();
                          if (sub) {
                            await sub.unsubscribe();
                          }
                        } else {
                          await Notification.requestPermission();
                        }
                      }}
                      className={`flex-shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                        Notification.permission === 'granted' ? 'bg-amber-600' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={Notification.permission === 'granted'}
                      aria-label="Push notifications"
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
                          Notification.permission === 'granted' ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Wishlist Alerts */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Wishlist Alerts</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Get notified when items matching your wishlist become available
                    </p>
                  </div>
                  <button
                    className={`flex-shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors bg-amber-600`}
                    role="switch"
                    aria-checked={true}
                    aria-label="Wishlist alerts"
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 translate-x-7`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Followed Organizers Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Followed Organizers</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Select the item categories you're interested in. We'll notify you when new sales matching your interests go live.</p>

            {successMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
                successMessage.includes('saved')
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
              }`}>
                {successMessage}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {SALE_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedInterests.includes(category)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedInterests([...selectedInterests, category]);
                      } else {
                        setSelectedInterests(selectedInterests.filter((c) => c !== category));
                      }
                    }}
                    className="w-4 h-4 text-amber-600 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-amber-500 focus:ring-amber-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">{category}</span>
                </label>
              ))}
            </div>

            <button
              onClick={() => updateInterestsMutation.mutate(selectedInterests)}
              disabled={updateInterestsMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              {updateInterestsMutation.isPending ? 'Saving...' : 'Save Interests'}
            </button>
          </div>

          {/* Public Profile Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Public Profile</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Customize how you appear to other shoppers browsing the FindA.Sale community.</p>

            {successMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
                successMessage.includes('saved')
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
              }`}>
                {successMessage}
              </div>
            )}

            <div className="space-y-6">
              {/* Profile Slug */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Custom Profile URL
                  </label>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    user?.profileSlug
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  }`}>
                    {user?.profileSlug ? '✓ Unlocked — free to change' : '🔒 Costs 1500 XP to unlock'}
                  </span>
                </div>

                {!user?.profileSlug && spendableXp < 1500 && (
                  <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Need {1500 - spendableXp} more XP to unlock your custom profile URL. You currently have {spendableXp} XP.
                    </p>
                  </div>
                )}

                <div className="flex items-center">
                  <span className="text-gray-600 dark:text-gray-400 mr-2">findasale.com/shoppers/</span>
                  <input
                    type="text"
                    value={profileSlug}
                    onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="your-custom-url"
                    maxLength={50}
                    disabled={!user?.profileSlug && spendableXp < 1500}
                    className={`flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 ${
                      !user?.profileSlug && spendableXp < 1500 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Letters, numbers, dashes, and underscores only
                </p>
              </div>

              {/* Purchases Visibility */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={purchasesVisible}
                    onChange={(e) => setPurchasesVisible(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-amber-500 focus:ring-amber-500"
                  />
                  <span className="ml-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Show my recent purchases on my profile
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Other shoppers can see your 12 most recent finds from sales
                </p>
              </div>

              {/* Save Button */}
              <button
                onClick={() => updateProfileMutation.mutate({
                  profileSlug: profileSlug || null,
                  purchasesVisible,
                })}
                disabled={updateProfileMutation.isPending || (!user?.profileSlug && !!profileSlug && spendableXp < 1500)}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile Settings'}
              </button>
            </div>
          </div>

          {/* Account Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Account</h2>

            <div className="space-y-6">
              {/* Email Display */}
              <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Email Address</p>
                <p className="text-lg text-gray-900 dark:text-gray-100">{user?.email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Primary email address for your account</p>
              </div>

              {/* Member Since */}
              <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Member Since</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Recently'}
                </p>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 mb-2">Danger Zone</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  These actions cannot be undone. Please proceed with caution.
                </p>
                <button
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    const confirmed = confirm(
                      'Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently deleted.'
                    );
                    if (confirmed) {
                      // Prompt for password confirmation
                      const password = prompt('Please enter your password to confirm account deletion:');
                      if (password) {
                        setDeletePassword(password);
                        deleteAccountMutation.mutate(password);
                      }
                    }
                  }}
                  disabled={deleteAccountMutation.isPending}
                >
                  {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>

          {/* Help & Support Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Help & Support</h2>

            <div className="space-y-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Send Feedback</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Help us improve FindA.Sale by sharing your feedback. Your thoughts directly shape our roadmap.
                </p>
                <button
                  onClick={() => setIsFeedbackMenuOpen(true)}
                  className="bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded font-medium transition"
                >
                  Open Feedback Form
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Menu Modal */}
        <FeedbackMenu isOpen={isFeedbackMenuOpen} onClose={() => setIsFeedbackMenuOpen(false)} />
    </>
  );
}

export default SettingsPage;
