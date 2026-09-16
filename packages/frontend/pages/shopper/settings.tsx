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
  const [displayName, setDisplayName] = useState<string>('');
  const [purchasesVisible, setPurchasesVisible] = useState<boolean>(true);
  const [isFeedbackMenuOpen, setIsFeedbackMenuOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [spendableXp, setSpendableXp] = useState<number>(0);

  // ADR-126 (2026-09-16): phone becomes genuinely shopper-settable -- this is the
  // account's OWN phone number (User.phone), separate from any per-shipment Address.phone.
  const [phone, setPhone] = useState('');

  // ADR-126: saved shipping addresses -- add/view/delete/set-default, so the opt-in
  // "save this address" checkbox elsewhere in the app has somewhere the shopper can
  // review and manage what got saved.
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ recipientName: '', line1: '', line2: '', city: '', state: '', zip: '', phone: '' });

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
      setDisplayName(user.name || '');
      setPurchasesVisible(user.purchasesVisible !== false);
    }
  }, [user]);

  // ADR-126: fetch the account's own phone (AuthContext's cached user doesn't carry it) --
  // GET /users/me is the existing getUserProfile endpoint, already used app-wide.
  const { data: myProfile } = useQuery({
    queryKey: ['myProfile'],
    queryFn: async () => {
      const response = await api.get('/users/me');
      return response.data as { phone?: string | null };
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (myProfile) setPhone(myProfile.phone || '');
  }, [myProfile]);

  // ADR-126: this shopper's saved addresses.
  const { data: addressesData, refetch: refetchAddresses } = useQuery({
    queryKey: ['myAddresses'],
    queryFn: async () => {
      const response = await api.get('/users/me/addresses');
      return response.data as { addresses: Array<{
        id: string; label: string | null; recipientName: string; line1: string; line2: string | null;
        city: string; state: string; zip: string; country: string; phone: string | null; isDefault: boolean;
      }> };
    },
    enabled: !!user,
  });

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
    mutationFn: async (data: { name?: string; profileSlug?: string | null; purchasesVisible?: boolean; phone?: string | null }) => {
      const response = await api.patch('/users/me', data);
      return response.data;
    },
    onSuccess: (data) => {
      // Update the display name in the UI if it was updated
      if (data.name) {
        setDisplayName(data.name);
      }
      setSuccessMessage('Profile settings saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save profile settings';
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  });

  // ADR-126: save the account's own phone number.
  const updatePhoneMutation = useMutation({
    mutationFn: async (value: string) => {
      const response = await api.patch('/users/me', { phone: value.trim() || null });
      return response.data;
    },
    onSuccess: () => {
      setSuccessMessage('Phone number saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save phone number';
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // ADR-126: opt-in saved-address management (add / set default / delete). Creating an
  // address here is an explicit, deliberate save -- never silent (ADR-126 §9.4).
  const createAddressMutation = useMutation({
    mutationFn: async (data: typeof newAddress) => {
      const response = await api.post('/users/me/addresses', data);
      return response.data;
    },
    onSuccess: () => {
      setNewAddress({ recipientName: '', line1: '', line2: '', city: '', state: '', zip: '', phone: '' });
      setShowAddAddress(false);
      refetchAddresses();
      setSuccessMessage('Address saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save address';
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.patch(`/users/me/addresses/${id}`, { isDefault: true });
      return response.data;
    },
    onSuccess: () => refetchAddresses(),
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/users/me/addresses/${id}`);
      return response.data;
    },
    onSuccess: () => refetchAddresses(),
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
                      Manually enabled. Will stay active regardless of connection speed
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

          {/* Category Interests Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Category Interests</h2>
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
                    {user?.profileSlug ? '✓ Unlocked. Free to change' : '🔒 Costs 1500 XP to unlock'}
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
                   aria-label="your-custom-url" />
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
              {/* Display Name */}
              <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={100}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500"
                  aria-label="Display name"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">How your name appears on your profile and purchases</p>
                <button
                  onClick={() => updateProfileMutation.mutate({ name: displayName })}
                  disabled={updateProfileMutation.isPending}
                  className="mt-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Display Name'}
                </button>
              </div>

              {/* Phone (ADR-126, 2026-09-16): now genuinely shopper-settable -- this is the
                  account's own number, separate from the per-shipment contact phone on a
                  saved address below. */}
              <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  maxLength={30}
                  className="w-full sm:w-64 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500"
                  aria-label="Phone number"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Used as your default contact number when an organizer or shipping label needs one
                </p>
                <button
                  onClick={() => updatePhoneMutation.mutate(phone)}
                  disabled={updatePhoneMutation.isPending}
                  className="mt-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  {updatePhoneMutation.isPending ? 'Saving...' : 'Save Phone Number'}
                </button>
              </div>

              {/* Saved Addresses (ADR-126, 2026-09-16): manage addresses saved via the
                  opt-in "save this address" checkbox at checkout/invoice time, or added
                  directly here. */}
              <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Saved Addresses
                  </label>
                  <button
                    onClick={() => setShowAddAddress((v) => !v)}
                    className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {showAddAddress ? 'Cancel' : '+ Add address'}
                  </button>
                </div>

                {(addressesData?.addresses ?? []).length === 0 && !showAddAddress && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No saved addresses yet. They're added automatically when you check the
                    "save this address" box at checkout, or you can add one here.
                  </p>
                )}

                <div className="space-y-3 mb-3">
                  {(addressesData?.addresses ?? []).map((addr) => (
                    <div key={addr.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {addr.recipientName}
                          {addr.isDefault && (
                            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Default</span>
                          )}
                        </p>
                        <p>{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                        <p>{addr.city}, {addr.state} {addr.zip}</p>
                        {addr.phone && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{addr.phone}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {!addr.isDefault && (
                          <button
                            onClick={() => setDefaultAddressMutation.mutate(addr.id)}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            Make default
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Delete this saved address?')) deleteAddressMutation.mutate(addr.id);
                          }}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {showAddAddress && (
                  <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                    <input
                      type="text"
                      value={newAddress.recipientName}
                      onChange={(e) => setNewAddress((a) => ({ ...a, recipientName: e.target.value }))}
                      placeholder="Recipient name"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      value={newAddress.line1}
                      onChange={(e) => setNewAddress((a) => ({ ...a, line1: e.target.value }))}
                      placeholder="Street address"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      value={newAddress.line2}
                      onChange={(e) => setNewAddress((a) => ({ ...a, line2: e.target.value }))}
                      placeholder="Apt, suite, etc. (optional)"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))}
                        placeholder="City"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <input
                        type="text"
                        value={newAddress.state}
                        onChange={(e) => setNewAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))}
                        placeholder="State"
                        maxLength={2}
                        className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newAddress.zip}
                        onChange={(e) => setNewAddress((a) => ({ ...a, zip: e.target.value }))}
                        placeholder="ZIP"
                        maxLength={10}
                        className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <input
                      type="tel"
                      value={newAddress.phone}
                      onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value }))}
                      placeholder="Contact phone for this address (optional)"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      onClick={() => createAddressMutation.mutate(newAddress)}
                      disabled={createAddressMutation.isPending || !newAddress.line1.trim() || !newAddress.city.trim() || !newAddress.state.trim() || !newAddress.zip.trim()}
                      className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      {createAddressMutation.isPending ? 'Saving...' : 'Save Address'}
                    </button>
                  </div>
                )}
              </div>

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
