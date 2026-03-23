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
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { useLowBandwidth } from '@/contexts/LowBandwidthContext';
import { useAuth } from '@/components/AuthContext';

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

  useEffect(() => {
    setMounted(true);
    setLowBandwidthEnabled(isLowBandwidth);
  }, [isLowBandwidth]);

  useEffect(() => {
    if (user?.categoryInterests) {
      setSelectedInterests(user.categoryInterests);
    }
  }, [user?.categoryInterests]);

  // Mutation for updating category interests
  const updateInterestsMutation = useMutation({
    mutationFn: async (interests: string[]) => {
      const response = await api.patch('/users/me/interests', { categoryInterests: interests });
      return response.data;
    },
    onSuccess: () => {
      setSuccessMessage('Followed organizers saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: () => {
      setSuccessMessage('Failed to save interests');
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
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
        </div>
      </Layout>
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

      <Layout>
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
              <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Push Notifications</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Get real-time alerts on your device for important updates
                    </p>
                  </div>
                  <button
                    className={`flex-shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors bg-amber-600`}
                    role="switch"
                    aria-checked={true}
                    aria-label="Push notifications"
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-800 translate-x-7`} />
                  </button>
                </div>
              </div>

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
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
                  onClick={() => {
                    if (
                      confirm(
                        'Are you sure you want to delete your account? This action cannot be undone.'
                      )
                    ) {
                      // TODO: Implement account deletion
                      alert('Account deletion coming soon');
                    }
                  }}
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}

export default SettingsPage;
