/**
 * Organizer Settings
 *
 * Allows organizers to manage:
 * - Payment settings (Stripe Connect)
 * - Email/SMS preferences
 * - Business info
 * - Account security
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Tooltip from '../../components/Tooltip';
import Head from 'next/head';
import Link from 'next/link';

const OrganizerSettingsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'payments' | 'notifications' | 'profile'>('payments');
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const { data } = await api.post('/stripe/create-connect-account');
      if (data?.url) {
        window.location.href = data.url;
      } else {
        showToast('Could not start Stripe setup — try again', 'error');
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to connect Stripe', 'error');
    } finally {
      setIsConnectingStripe(false);
    }
  };

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await api.patch('/auth/profile', { businessName });
      showToast('Profile updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      <Head>
        <title>Settings - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-8">Settings</h1>

          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-warm-200">
            {['payments', 'notifications', 'profile'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-warm-900">Payment Settings</h2>
                <Tooltip content="Connect Stripe to receive payouts. FindA.Sale deposits your earnings (minus 5% platform fee) on a weekly schedule." />
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

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Notification Preferences</h2>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-2 text-warm-700">Email me when someone bids on my items</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-2 text-warm-700">Email me when my sale starts</span>
                </label>
                <div className="border-t border-warm-100 pt-4 mt-2">
                  <p className="text-sm font-medium text-warm-800 mb-3">Push Notifications</p>
                  {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-warm-700 text-sm">Push notifications are enabled</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const reg = await navigator.serviceWorker.getRegistration();
                            if (reg) {
                              const sub = await reg.pushManager.getSubscription();
                              if (sub) {
                                await sub.unsubscribe();
                                await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
                                showToast('Push notifications disabled', 'success');
                              }
                            }
                          } catch {
                            showToast('Failed to disable push notifications', 'error');
                          }
                        }}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Disable
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-warm-600 text-sm">Push notifications are off</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const permission = await Notification.requestPermission();
                            if (permission === 'granted') {
                              showToast('Push notifications enabled', 'success');
                            } else {
                              showToast('Permission denied — check your browser settings', 'error');
                            }
                          } catch {
                            showToast('Push notifications not supported on this browser', 'error');
                          }
                        }}
                        className="text-sm bg-amber-600 hover:bg-amber-700 text-white py-1 px-3 rounded-lg"
                      >
                        Enable
                      </button>
                    </div>
                  )}
                </div>

                {/* B2: AI Assistance description */}
                <div className="border-t border-warm-100 pt-4 mt-2">
                  <p className="text-sm font-medium text-warm-800 mb-1">AI Assistance</p>
                  <p className="text-sm text-warm-600">
                    Let our system auto-suggest tags and descriptions when you add items. We&apos;ll always flag what&apos;s auto-suggested so you can review and change it. You can turn this off anytime.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Business Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerSettingsPage;
