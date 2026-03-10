/**
 * Organizer Settings Page
 *
 * Tabs:
 * - Profile: name, business name, bio
 * - Payments: Stripe Connect setup
 * - AI Disclosure: opt-in/out of AI tagging
 * - Notifications: email preferences
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Tooltip from '../../components/Tooltip';
import Head from 'next/head';

const OrganizerSettings = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'payments' | 'ai' | 'notifications'>('profile');
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    businessName: '',
    bio: '',
  });
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Fetch organizer profile
  const { data: orgProfile } = useQuery({
    queryKey: ['organizer-me'],
    queryFn: async () => {
      const response = await api.get('/organizers/me');
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Pre-fill form once profile loads
  React.useEffect(() => {
    if (orgProfile && !profileLoaded) {
      setProfileForm({
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        businessName: orgProfile.businessName || '',
        bio: orgProfile.bio || '',
      });
      setProfileLoaded(true);
    }
  }, [orgProfile, profileLoaded, user]);

  // AI opt-in state
  const [aiOptIn, setAiOptIn] = useState<boolean | null>(null);
  React.useEffect(() => {
    if (orgProfile && aiOptIn === null) {
      setAiOptIn(orgProfile.aiTaggingOptIn !== false);
    }
  }, [orgProfile, aiOptIn]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => api.patch('/organizers/me', data),
    onSuccess: () => {
      showToast('Profile updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['organizer-me'] });
    },
    onError: () => showToast('Failed to update profile', 'error'),
  });

  const updateAiOptInMutation = useMutation({
    mutationFn: (optIn: boolean) => api.patch('/organizers/me', { aiTaggingOptIn: optIn }),
    onSuccess: () => showToast('AI preference saved', 'success'),
    onError: () => showToast('Failed to save preference', 'error'),
  });

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await api.post('/stripe/connect');
      window.location.href = response.data.url;
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to connect Stripe', 'error');
      setIsConnectingStripe(false);
    }
  };

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'payments', label: 'Payments' },
    { key: 'ai', label: 'AI Settings' },
    { key: 'notifications', label: 'Notifications' },
  ] as const;

  return (
    <>
      <Head>
        <title>Settings - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-warm-900 mb-6">Settings</h1>

          {/* Tab nav */}
          <div className="flex gap-1 mb-6 bg-white border border-warm-200 rounded-lg p-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-amber-600 text-white'
                    : 'text-warm-700 hover:bg-warm-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Profile</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateProfileMutation.mutate(profileForm);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">First Name</label>
                    <input
                      type="text"
                      value={profileForm.firstName}
                      onChange={(e) => setProfileForm(p => ({ ...p, firstName: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm(p => ({ ...p, lastName: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={profileForm.businessName}
                    onChange={(e) => setProfileForm(p => ({ ...p, businessName: e.target.value }))}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">Bio</label>
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    placeholder="Tell buyers about yourself..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-warm-900">Payment Settings</h2>
                <Tooltip content="Connect Stripe to receive payouts. FindA.Sale charges a 10% platform fee per sale. Payouts are deposited on a weekly schedule." />
              </div>
              <p className="text-warm-600 mb-6">
                Connect your Stripe account to receive payouts from your sales.
              </p>
              <button
                onClick={handleStripeConnect}
                disabled={isConnectingStripe}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
              >
                {isConnectingStripe ? 'Redirecting to Stripe...' : 'Setup Stripe Connect'}
              </button>
            </div>
          )}

          {/* AI Settings Tab */}
          {activeTab === 'ai' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">AI Tagging Settings</h2>
              <p className="text-warm-600 mb-6">
                Control whether AI suggests titles, categories, and descriptions when you upload photos.
                You always review AI suggestions before anything is published.
              </p>
              {aiOptIn !== null && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiOptIn}
                    onChange={(e) => {
                      setAiOptIn(e.target.checked);
                      updateAiOptInMutation.mutate(e.target.checked);
                    }}
                    className="w-5 h-5 rounded accent-amber-600"
                  />
                  <div>
                    <span className="block font-medium text-warm-900">Enable AI tagging suggestions</span>
                    <span className="block text-sm text-warm-600 mt-0.5">
                      AI analyzes your photos and pre-fills item details. You edit before saving.
                    </span>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Notifications</h2>
              <p className="text-warm-600">Notification preferences coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerSettings;
