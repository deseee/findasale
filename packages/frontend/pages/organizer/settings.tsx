/**
 * Organizer Settings
 *
 * Allows organizers to manage:
 * - Payment settings (Stripe Connect)
 * - Email/SMS preferences
 * - Business info
 * - Account security
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useTheme } from '../../hooks/useTheme';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import Tooltip from '../../components/Tooltip';
import ThemeToggle from '../../components/ThemeToggle';
import Head from 'next/head';
import Link from 'next/link';

const OrganizerSettingsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { tier, isPro } = useOrganizerTier();
  const [activeTab, setActiveTab] = useState<'payments' | 'notifications' | 'profile' | 'subscription' | 'appearance'>('payments');
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const { highContrast, setHighContrast } = useTheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('findasale_font_size');
    if (saved) {
      const size = parseInt(saved, 10);
      setFontSize(size);
    }
    const simpleModeSaved = localStorage.getItem('findasale_simple_mode');
    if (simpleModeSaved === 'true') {
      setIsSimpleMode(true);
    }
  }, []);

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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-8">Settings</h1>

          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700">
            {['payments', 'subscription', 'notifications', 'profile', 'appearance'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200'
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
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Payment Settings</h2>
                <Tooltip content="Connect Stripe to receive payouts. FindA.Sale charges a 10% platform fee per sale. Payouts are deposited on a weekly schedule." />
              </div>
              <p className="text-warm-600 dark:text-gray-400 mb-6">
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

          {/* Subscription Tab */}
          {activeTab === 'subscription' && (
            <div className="space-y-6">
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Current Plan</h2>
                <div className="flex items-center justify-between mb-4 p-4 bg-warm-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-warm-600 dark:text-gray-400">Your subscription tier:</p>
                    <p className="text-2xl font-bold text-warm-900 dark:text-gray-100 mt-1">
                      {tier === 'SIMPLE' ? 'SIMPLE (Free)' : tier === 'PRO' ? 'PRO ($29/mo)' : 'TEAMS (Enterprise)'}
                    </p>
                  </div>
                </div>
                {tier === 'SIMPLE' && (
                  <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                      Unlock powerful features to grow your business.
                    </p>
                    <Link
                      href="/organizer/upgrade"
                      className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition"
                    >
                      Upgrade to PRO
                    </Link>
                  </div>
                )}
                {tier !== 'SIMPLE' && (
                  <Link
                    href="/organizer/subscription"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition"
                  >
                    Manage Subscription
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Notification Preferences</h2>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-2 text-warm-700 dark:text-gray-300">Email me when someone bids on my items</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-2 text-warm-700 dark:text-gray-300">Email me when my sale starts</span>
                </label>
                <div className="border-t border-warm-100 dark:border-gray-700 pt-4 mt-2">
                  <p className="text-sm font-medium text-warm-800 dark:text-gray-200 mb-3">Push Notifications</p>
                  {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-warm-700 dark:text-gray-300 text-sm">Push notifications are enabled</span>
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
                      <span className="text-warm-600 dark:text-gray-400 text-sm">Push notifications are off</span>
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
                <div className="border-t border-warm-100 dark:border-gray-700 pt-4 mt-2">
                  <p className="text-sm font-medium text-warm-800 dark:text-gray-200 mb-1">AI Assistance</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Let our system auto-suggest tags and descriptions when you add items. We&apos;ll always flag what&apos;s auto-suggested so you can review and change it. You can turn this off anytime.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Business Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
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

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Simple Mode Section */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Mode</h2>
                <div className="space-y-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isSimpleMode}
                      onChange={(e) => {
                        setIsSimpleMode(e.target.checked);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('findasale_simple_mode', e.target.checked ? 'true' : 'false');
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">Simple Mode</span>
                  </label>
                  <p className="text-sm text-warm-600 dark:text-gray-400">Show only essential tools. Great for getting started.</p>
                </div>
              </div>

              {/* Color Theme Section */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Color Theme</h2>
                <div>
                  <ThemeToggle compact={false} />
                </div>
              </div>

              {/* Text Size Section */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Text Size</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                      Font Size: {fontSize === 14 ? 'Small' : fontSize === 16 ? 'Normal' : fontSize === 18 ? 'Large' : 'Extra Large'} ({fontSize}px)
                    </label>
                    <input
                      type="range"
                      min="14"
                      max="20"
                      step="1"
                      value={fontSize}
                      onChange={(e) => {
                        const newSize = parseInt(e.target.value, 10);
                        setFontSize(newSize);
                        document.documentElement.style.setProperty('--base-font-size', `${newSize}px`);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('findasale_font_size', String(newSize));
                        }
                      }}
                      className="w-full h-2 bg-warm-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-warm-600 dark:text-gray-400">Adjust text size for better readability</p>
                </div>
              </div>

              {/* High Contrast Section */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Accessibility</h2>
                <div className="space-y-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(e) => setHighContrast(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">High Contrast (Outdoor Mode)</span>
                  </label>
                  <p className="text-sm text-warm-600 dark:text-gray-400">Boosts contrast for bright outdoor conditions</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerSettingsPage;
