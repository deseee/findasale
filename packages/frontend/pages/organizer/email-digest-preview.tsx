/**
 * Organizer Email Digest Preview
 *
 * Shows a preview of the weekly organizer digest email and allows
 * toggling the email preference.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';

interface UserSettings {
  id: string;
  email: string;
  name: string;
  emailWeeklyOrganizerDigest: boolean;
}

interface DigestPreviewData {
  businessName: string;
  totalItemsSold: number;
  totalRevenue: number;
  newFollowers: number;
  totalItemViews: number;
  totalItemFavorites: number;
  topItems: Array<{ title: string; price: number }>;
  upcomingSales: Array<{ title: string; startDate: string }>;
}

export default function EmailDigestPreview() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [previewDate] = useState<string>(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  // Mock data for preview
  const mockDigest: DigestPreviewData = {
    businessName: user?.name || 'Your Estate Sales',
    totalItemsSold: 12,
    totalRevenue: 450.75,
    newFollowers: 3,
    totalItemViews: 145,
    totalItemFavorites: 28,
    topItems: [
      { title: 'Vintage Mid-Century Dining Set', price: 125.00 },
      { title: 'Antique Brass Floor Lamp', price: 45.50 },
      { title: 'Set of Decorative Vases', price: 28.00 },
    ],
    upcomingSales: [
      { title: 'Estate Sale - Downtown Grand Rapids', startDate: 'Mar 8 - Mar 10' },
      { title: 'Spring Clearance - Eastown', startDate: 'Mar 15 - Mar 17' },
    ],
  };

  // Fetch current user settings
  const { data: userSettings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const response = await api.get('/api/users/me');
      return response.data;
    },
    enabled: !authLoading && !!user,
  });

  // Mutation to update email preference
  const updatePreferenceMutation = useMutation({
    mutationFn: async (emailWeeklyOrganizerDigest: boolean) => {
      const response = await api.patch('/api/users/me', {
        emailWeeklyOrganizerDigest,
      });
      return response.data;
    },
  });

  const handleToggleEmail = async () => {
    if (!userSettings) return;
    await updatePreferenceMutation.mutateAsync(!userSettings.emailWeeklyOrganizerDigest);
  };

  if (authLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push('/auth/login');
    return null;
  }

  const isEmailEnabled = userSettings?.emailWeeklyOrganizerDigest ?? true;

  return (
    <>
      <Head>
        <title>Weekly Email Digest Preview - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-stone-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/organizer/insights" className="text-sm text-amber-700 hover:text-amber-900 mb-4 inline-block">
              ← Back to Analytics
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Weekly Email Digest</h1>
            <p className="text-gray-600">
              Here's what your weekly organizer digest email looks like. Every Monday morning at 9 AM, you'll receive
              a summary of your sales performance.
            </p>
          </div>

          {/* Toggle Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Email Digest Preference</h2>
                <p className="text-sm text-gray-600">
                  {isEmailEnabled
                    ? 'You will receive this digest every Monday morning at 9 AM.'
                    : 'You have disabled this email. Enable it to start receiving weekly digests.'}
                </p>
              </div>
              <button
                onClick={handleToggleEmail}
                disabled={updatePreferenceMutation.isPending}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  isEmailEnabled
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {updatePreferenceMutation.isPending ? 'Updating...' : isEmailEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          {/* Email Preview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Email Preview</h2>
              <p className="text-sm text-gray-600 mt-1">This is how your weekly digest appears in your inbox.</p>
            </div>

            {/* Email Content */}
            <div className="p-6">
              <div
                className="bg-white border border-gray-300 rounded-lg overflow-hidden"
                style={{ maxWidth: '600px', margin: '0 auto' }}
              >
                {/* Email Header */}
                <div className="bg-teal-700 px-8 py-6 text-center text-white">
                  <div className="text-2xl font-bold tracking-tight">FindA.Sale</div>
                  <p className="text-sm text-teal-100 mt-2">Your Weekly Performance Summary</p>
                </div>

                {/* Email Body */}
                <div className="px-8 py-8">
                  <p className="text-gray-900 font-medium mb-1">Hi {mockDigest.businessName},</p>
                  <p className="text-gray-700 text-sm mb-6">
                    Here's how your sales performed from {previewDate}:
                  </p>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-700">{mockDigest.totalItemsSold}</div>
                      <div className="text-xs text-gray-600 mt-1">Items Sold</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-amber-700">${mockDigest.totalRevenue.toFixed(2)}</div>
                      <div className="text-xs text-gray-600 mt-1">Revenue</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-700">{mockDigest.newFollowers}</div>
                      <div className="text-xs text-gray-600 mt-1">New Followers</div>
                    </div>
                  </div>

                  {/* Activity Section */}
                  <div className="bg-red-50 border-l-4 border-red-600 rounded p-4 mb-8">
                    <div className="font-semibold text-gray-900 text-sm mb-3">Your Sale Activity This Week</div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>
                        <span className="mr-2">📊</span>
                        {mockDigest.totalItemViews} item views
                      </div>
                      <div>
                        <span className="mr-2">❤️</span>
                        {mockDigest.totalItemFavorites} new favorites
                      </div>
                    </div>
                  </div>

                  {/* Top Items Section */}
                  {mockDigest.topItems.length > 0 && (
                    <div className="mb-8">
                      <h3 className="font-semibold text-gray-900 text-sm mb-4">Top Selling Items</h3>
                      <div className="space-y-3">
                        {mockDigest.topItems.map((item, idx) => (
                          <div key={idx} className="border border-gray-200 rounded-lg p-3">
                            <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                            <div className="text-amber-700 font-bold text-sm mt-1">${item.price.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upcoming Sales */}
                  {mockDigest.upcomingSales.length > 0 && (
                    <div className="mb-8">
                      <h3 className="font-semibold text-gray-900 text-sm mb-4">Upcoming Sales</h3>
                      <div className="space-y-3">
                        {mockDigest.upcomingSales.map((sale, idx) => (
                          <div key={idx} className="border border-gray-200 rounded-lg p-3">
                            <div className="font-medium text-gray-900 text-sm">{sale.title}</div>
                            <div className="text-gray-600 text-xs mt-1">{sale.startDate}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  <div className="text-center py-6 border-t border-gray-200">
                    <a
                      href="#"
                      className="inline-block px-7 py-3 bg-teal-700 text-white rounded-lg font-semibold text-sm hover:bg-teal-800"
                    >
                      View Your Dashboard →
                    </a>
                  </div>
                </div>

                {/* Email Footer */}
                <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 text-center">
                  <p className="text-xs text-gray-600">
                    You're receiving this because you're an organizer on{' '}
                    <a href="#" className="text-teal-700">
                      FindA.Sale
                    </a>
                    .<br />
                    <a href="#" className="text-gray-600 hover:text-gray-900">
                      Manage email preferences
                    </a>
                    {' '}·{' '}
                    <a href="#" className="text-gray-600 hover:text-gray-900">
                      Unsubscribe
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">About Your Weekly Digest</h3>
            <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
              <li>Sent every Monday morning at 9 AM EST</li>
              <li>Includes items sold, revenue, new followers, and engagement metrics</li>
              <li>Shows your top-selling items from the past week</li>
              <li>Displays upcoming sales scheduled for the next 7 days</li>
              <li>You can disable or re-enable this email anytime</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
