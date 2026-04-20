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
import { useFeedbackSurvey } from '../../hooks/useFeedbackSurvey';
import { useTheme } from '../../hooks/useTheme';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useNetworkQuality } from '../../hooks/useNetworkQuality';
import Tooltip from '../../components/Tooltip';
import ThemeToggle from '../../components/ThemeToggle';
import VerifiedBadge from '../../components/VerifiedBadge';
import PasskeyManager from '../../components/PasskeyManager';
import FeedbackMenu from '../../components/FeedbackMenu';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io as socketIO } from 'socket.io-client';

const OrganizerSettingsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { showSurvey } = useFeedbackSurvey();
  const { tier, isPro } = useOrganizerTier();
  const { isLowBandwidth, networkType, toggleLowBandwidth } = useNetworkQuality();
  const [activeTab, setActiveTab] = useState<'payments' | 'notifications' | 'profile' | 'subscription' | 'appearance' | 'verification' | 'security' | 'help' | 'ebay'>('payments');
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [instagram, setInstagram] = useState('');
  const [etsy, setEtsy] = useState('');
  const [pickupWindows, setPickupWindows] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);
  const [syncingEbayPolicies, setSyncingEbayPolicies] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [aiAssistanceEnabled, setAiAssistanceEnabled] = useState(true);
  const [isFeedbackMenuOpen, setIsFeedbackMenuOpen] = useState(false);
  const [hasShopMode, setHasShopMode] = useState(false);
  const [shopModeLoading, setShopModeLoading] = useState(false);
  const { highContrast, setHighContrast } = useTheme();
  const queryClient = useQueryClient();

  // Verification status query
  const { data: verStatus, isLoading: verStatusLoading } = useQuery({
    queryKey: ['verification-status'],
    queryFn: () => api.get('/verification/status').then(r => r.data),
    enabled: !!user
  });

  // eBay connection status query
  const { data: ebayStatus, isLoading: ebayStatusLoading, refetch: refetchEbayStatus } = useQuery({
    queryKey: ['ebay-connection-status'],
    queryFn: () => api.get('/ebay/connection').then(r => r.data),
    enabled: !!user
  });

  // Request verification mutation
  const requestMutation = useMutation({
    mutationFn: () => api.post('/verification/request'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-status'] });
      showToast('Verification request submitted', 'success');
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to submit verification request';
      showToast(msg, 'error');
    }
  });

  // Sync eBay inventory mutation
  const syncEbayInventoryMutation = useMutation({
    mutationFn: () => api.post('/ebay/import-inventory'),
    onSuccess: (res: any) => {
      refetchEbayStatus();
      const { imported, skipped } = res.data;
      showToast(`Synced ${imported} item${imported !== 1 ? 's' : ''} to your inventory${skipped > 0 ? ` (${skipped} already existed)` : ''}`, 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to sync eBay inventory', 'error');
    },
  });

  // Disconnect eBay mutation
  const disconnectEbayMutation = useMutation({
    mutationFn: () => api.delete('/ebay/connection'),
    onSuccess: () => {
      refetchEbayStatus();
      showToast('eBay account disconnected', 'success');
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to disconnect eBay account';
      showToast(msg, 'error');
    }
  });

  // Fetch full organizer profile data (phone, bio, website, facebook, instagram, etsy, businessName)
  useEffect(() => {
    const fetchOrganizerData = async () => {
      if (!user?.id) return;
      try {
        const response = await api.get('/organizers/me');
        if (response.data) {
          setBusinessName(response.data.businessName || '');
          setPhone(response.data.phone || '');
          setBio(response.data.bio || '');
          setWebsite(response.data.website || '');
          setFacebook(response.data.facebook || '');
          setInstagram(response.data.instagram || '');
          setEtsy(response.data.etsy || '');
          setPickupWindows(response.data.pickupWindows || '');
          setStripeConnected(response.data.stripeConnected || false);
          setHasShopMode(response.data.hasShopMode || false);
        }
      } catch (error) {
        console.error('Failed to fetch organizer data:', error);
      }
    };

    if (user?.id) {
      fetchOrganizerData();
    }
  }, [user?.id]);


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
    const aiAssistanceSaved = localStorage.getItem('findasale_ai_assistance_enabled');
    if (aiAssistanceSaved === 'false') {
      setAiAssistanceEnabled(false);
    }

    // Check for eBay callback success
    if (router.query.ebay_connected === 'true') {
      showToast('eBay account connected successfully', 'success');
      refetchEbayStatus();
      // Remove the query param
      router.replace('/organizer/settings?tab=ebay', undefined, { shallow: true });
    }
  }, [router.query.ebay_connected, showToast, refetchEbayStatus, router]);

  // Listen for background eBay enrichment completion — shows toast when GetItem pass finishes
  useEffect(() => {
    if (activeTab !== 'ebay' || typeof window === 'undefined') return;
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');
    const token = localStorage.getItem('token');
    const socket = socketIO(socketUrl, {
      auth: { token: token || undefined },
      transports: ['websocket'],
      upgrade: false,
    });
    socket.on('EBAY_ENRICH_COMPLETE', (data: { message: string }) => {
      showToast(data.message, 'success');
    });
    return () => { socket.disconnect(); };
  }, [activeTab, showToast]);

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

  const handleEbayConnect = async () => {
    setIsConnectingEbay(true);
    try {
      const response = await api.get('/ebay/connect');
      // The backend redirects directly to eBay OAuth, so we shouldn't reach here
      // But if it returns a URL in the response, redirect to it
      if (response.data?.redirectUrl) {
        window.location.href = response.data.redirectUrl;
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to start eBay connection', 'error');
      setIsConnectingEbay(false);
    }
  };

  const handleSyncEbayPolicies = async () => {
    setSyncingEbayPolicies(true);
    try {
      const res = await api.post('/ebay/sync-policies');
      if (res.data?.success) {
        refetchEbayStatus();
        showToast('Policies synced', 'success');
      } else {
        showToast(res.data?.error || 'Could not sync policies from eBay.', 'error');
      }
    } catch (error: any) {
      showToast(error.response?.data?.error || error.response?.data?.message || 'Network error. Try again.', 'error');
    } finally {
      setSyncingEbayPolicies(false);
    }
  };

  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await api.patch('/organizers/me', {
        businessName,
        phone,
        bio,
        website,
        facebook,
        instagram,
        etsy,
        pickupWindows,
      });
      // Refetch organizer data to sync local state with backend
      const response = await api.get('/organizers/me');
      if (response.data) {
        setPhone(response.data.phone || '');
        setBio(response.data.bio || '');
        setWebsite(response.data.website || '');
        setFacebook(response.data.facebook || '');
        setInstagram(response.data.instagram || '');
        setEtsy(response.data.etsy || '');
        setPickupWindows(response.data.pickupWindows || '');
      }
      showToast('Profile updated', 'success');
      showSurvey('OG-5');
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
          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700 overflow-x-auto">
            {['payments', 'subscription', 'verification', 'notifications', 'profile', 'security', 'appearance', 'ebay', 'help'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(tab as any);
                }}
                className={`pb-2 font-medium capitalize whitespace-nowrap ${
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
                <Tooltip content="Connect Stripe to receive payouts. Your tier determines the platform fee: SIMPLE 10%, PRO/TEAMS 8%. Payouts are deposited on a weekly schedule." position="right" />
              </div>
              <p className="text-warm-600 dark:text-gray-400 mb-6">
                Connect your Stripe account to receive payouts from your sales. You'll need a valid bank account in the US.
              </p>
              {stripeConnected ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Stripe Connected
                  </div>
                  <button
                    onClick={handleStripeConnect}
                    disabled={isConnectingStripe}
                    className="bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
                  >
                    {isConnectingStripe ? 'Opening Stripe...' : 'Manage Payouts'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStripeConnect}
                  disabled={isConnectingStripe}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                >
                  {isConnectingStripe ? 'Redirecting to Stripe...' : 'Setup Stripe Connect'}
                </button>
              )}
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
                      href="/pricing"
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

              {/* Shop Mode Section — TEAMS only */}
              {tier === 'TEAMS' && (
                <div className="card p-6">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Shop Mode</h2>
                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={hasShopMode}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setHasShopMode(newValue);
                          setShopModeLoading(true);
                          try {
                            // Update organizer hasShopMode
                            await api.patch('/organizers/me', { hasShopMode: newValue });

                            // If enabling, also update active sale
                            if (newValue) {
                              try {
                                // Get current active sale from user context or state
                                const salesResponse = await api.get('/organizers/me/sales');
                                const activeSale = salesResponse.data?.find((s: any) => s.status === 'ACTIVE' || s.status === 'PUBLISHED');
                                if (activeSale) {
                                  await api.patch(`/sales/${activeSale.id}`, { isShopMode: true });
                                }
                              } catch {
                                // Sale update failed but organizer updated — OK to continue
                              }
                            }

                            showToast(newValue ? 'Shop Mode enabled' : 'Shop Mode disabled', 'success');
                          } catch (error: any) {
                            setHasShopMode(!newValue); // Revert on error
                            showToast(error.response?.data?.message || 'Failed to update Shop Mode', 'error');
                          } finally {
                            setShopModeLoading(false);
                          }
                        }}
                        disabled={shopModeLoading}
                        className="w-4 h-4 rounded"
                      />
                      <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">
                        Keep my storefront always live
                      </span>
                    </label>
                    <p className="text-sm text-warm-600 dark:text-gray-400">
                      Your shop auto-renews every 30 days. Items stay listed until you mark them sold.
                    </p>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        <strong>Requires TEAMS plan.</strong> Perfect for resale shops and antique dealers managing rotating inventory.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification Tab */}
          {activeTab === 'verification' && (
            <div className="space-y-6">
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Verified Organizer Badge</h2>
                  <VerifiedBadge status={verStatus?.status} size="md" />
                </div>
                <p className="text-warm-600 dark:text-gray-400 mb-2">
                  A verified badge builds trust with shoppers and appears on your profile and all your sales. It signals that you're a professional, reliable organizer.
                </p>
                <p className="text-sm text-warm-500 dark:text-gray-400 mb-6">
                  Only PRO and TEAMS organizers can request verification. Our team reviews your profile and approves badges for active, legitimate organizers.
                </p>

                {verStatus?.status === 'NONE' && (
                  <>
                    {tier === 'SIMPLE' ? (
                      <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                          Upgrade to PRO to request verification.
                        </p>
                        <Link
                          href="/pricing"
                          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition"
                        >
                          Upgrade to PRO
                        </Link>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                          Request verification to add a badge to your profile. Our team will review your information.
                        </p>
                        <button
                          onClick={() => requestMutation.mutate()}
                          disabled={requestMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition"
                        >
                          {requestMutation.isPending ? 'Submitting...' : 'Request Verification'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {verStatus?.status === 'PENDING' && (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
                      <p className="font-semibold text-amber-800 dark:text-amber-200">Verification Pending</p>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Our team is reviewing your request. We'll notify you when a decision is made.
                    </p>
                  </div>
                )}

                {verStatus?.status === 'VERIFIED' && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="font-semibold text-green-800 dark:text-green-200">Verified</p>
                    </div>
                    {verStatus?.verifiedAt && (
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Verified on {new Date(verStatus.verifiedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                {verStatus?.status === 'REJECTED' && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="font-semibold text-red-800 dark:text-red-200 mb-2">Not Verified</p>
                    {verStatus?.verificationNotes && (
                      <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                        <strong>Reason:</strong> {verStatus.verificationNotes}
                      </p>
                    )}
                    {tier === 'PRO' && (
                      <button
                        onClick={() => requestMutation.mutate()}
                        disabled={requestMutation.isPending}
                        className="text-sm bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 rounded-lg disabled:opacity-50 transition"
                      >
                        {requestMutation.isPending ? 'Submitting...' : 'Try Again'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <PasskeyManager />
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Notification Preferences</h2>
              <p className="text-sm text-warm-600 dark:text-gray-400 mb-6">
                Choose how you'd like to stay updated on your sales and activity.
              </p>
              <div className="space-y-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-1 text-warm-700 dark:text-gray-300">Email me when someone bids on my items</span>
                  <Tooltip content="Receive real-time alerts when shoppers show interest in your items." position="right" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                  <span className="ml-1 text-warm-700 dark:text-gray-300">Email me when my sale starts</span>
                  <Tooltip content="Get a reminder email on the first day of your scheduled sale." position="right" />
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

                {/* B2: Smart Tagging toggle */}
                <div className="border-t border-warm-100 dark:border-gray-700 pt-4 mt-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={aiAssistanceEnabled}
                      onChange={(e) => {
                        setAiAssistanceEnabled(e.target.checked);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('findasale_ai_assistance_enabled', e.target.checked ? 'true' : 'false');
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-warm-800 dark:text-gray-200">Smart Tagging</p>
                      <p className="text-sm text-warm-600 dark:text-gray-400">
                        Let our system auto-suggest tags and descriptions when you add items. We&apos;ll always flag what&apos;s auto-suggested so you can review and change it.
                      </p>
                    </div>
                  </label>
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
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">Business Name <span className="text-red-500">*</span></label>
                    <Tooltip content="This is how your business appears to shoppers on item listings and sale pages. Use your official business name or brand." position="right" />
                  </div>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., My Business Name"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">Phone <span className="text-red-500">*</span></label>
                    <Tooltip content="Your contact phone number for shoppers to reach you. This appears on your sale pages and organizer profile." position="right" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., (616) 555-0123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="Tell shoppers about your business and specialties..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Facebook Page URL</label>
                  <input
                    type="url"
                    value={facebook}
                    onChange={(e) => setFacebook(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://facebook.com/yourpage"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Instagram Profile URL</label>
                  <input
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://instagram.com/yourprofile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Etsy Shop URL</label>
                  <input
                    type="url"
                    value={etsy}
                    onChange={(e) => setEtsy(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://etsy.com/shop/yourshop"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Shop Hours</label>
                  <textarea
                    value={pickupWindows}
                    onChange={(e) => setPickupWindows(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., Mon-Fri: 10am-5pm&#10;Sat: 9am-3pm&#10;Sun: Closed"
                    rows={3}
                  />
                </div>

                <p className="text-xs text-warm-500 dark:text-gray-400">
                  Your profile helps build trust with shoppers. Keep your information accurate and up-to-date.
                </p>
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
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Mode</h2>
                  <Tooltip content="Toggle between full-featured and streamlined interfaces. Useful if you're new to FindA.Sale and want a cleaner view." position="right" />
                </div>
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
                  <p className="text-sm text-warm-600 dark:text-gray-400">Show only essential tools. Great for getting started. You can switch back anytime.</p>
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
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Text Size</h2>
                  <Tooltip content="Make text larger for easier reading. Changes apply immediately across the entire app." position="right" />
                </div>
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
                  <p className="text-xs text-warm-600 dark:text-gray-400">Drag to adjust. Settings are saved to your browser automatically.</p>
                </div>
              </div>

              {/* High Contrast Section */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Accessibility</h2>
                  <Tooltip content="Increases text-to-background contrast for visibility in bright sunlight or for visual accessibility needs." position="right" />
                </div>
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
                  <p className="text-sm text-warm-600 dark:text-gray-400">Useful when using FindA.Sale on-site at your sale in bright outdoor conditions</p>
                </div>
              </div>

              {/* Low-Bandwidth Mode Section */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Low-Bandwidth Mode</h2>
                  <Tooltip content="Reduces image quality and disables animations to use less data. Helpful on slow cellular connections or metered plans." position="right" />
                </div>
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                      <strong>Detected network:</strong> {networkType || 'unknown'}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {isLowBandwidth ? 'Low-bandwidth mode is ON. Photos are optimized for faster loading.' : 'You have a good network connection. Full-quality photos are displayed.'}
                    </p>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isLowBandwidth}
                      onChange={(e) => toggleLowBandwidth(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">Enable Low-Bandwidth Mode</span>
                  </label>
                  <p className="text-sm text-warm-600 dark:text-gray-400">Manually override automatic detection. Use this if you're on a slow connection or want to save mobile data.</p>
                </div>
              </div>
            </div>
          )}

          {/* eBay Tab */}
          {activeTab === 'ebay' && (
            <div className="space-y-6">
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">eBay Account</h2>
                  <Tooltip content="Connect your eBay account to list items on eBay directly from FindA.Sale." position="right" />
                </div>
                <p className="text-warm-600 dark:text-gray-400 mb-6">
                  Connect your eBay account to sync inventory in both directions — import your eBay listings into FindA.Sale, and push FindA.Sale items to eBay. Items sold on either platform are automatically marked sold on the other.
                </p>

                {ebayStatusLoading ? (
                  <div className="flex items-center gap-2 text-warm-600 dark:text-gray-400">
                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    Checking connection status...
                  </div>
                ) : ebayStatus?.connected ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="font-semibold text-green-800 dark:text-green-200">eBay Connected</p>
                      </div>
                      {ebayStatus?.ebayUserId && (
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Account: <span className="font-medium">{ebayStatus.ebayUserId}</span>
                        </p>
                      )}
                      {ebayStatus?.connectedAt && (
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Connected on {new Date(ebayStatus.connectedAt).toLocaleDateString()}
                        </p>
                      )}
                      {ebayStatus?.error && (
                        <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <p className="text-xs text-red-700 dark:text-red-300">
                            <strong>Token issue:</strong> {ebayStatus.errorMessage || 'Please reconnect your account.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* eBay Business Policies */}
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Business Policies</span>
                        <button
                          onClick={handleSyncEbayPolicies}
                          disabled={syncingEbayPolicies}
                          className="text-xs text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 disabled:opacity-50 font-medium"
                        >
                          {syncingEbayPolicies ? 'Syncing...' : 'Sync from eBay'}
                        </button>
                      </div>

                      {ebayStatus?.policiesFetchedAt ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <span className="text-green-500">✓</span>
                            <span>Fulfillment, Return & Payment policies synced</span>
                            {ebayStatus.policiesFetchedAt && (
                              <span className="text-gray-400">· {new Date(ebayStatus.policiesFetchedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          <span>⚠ No policies synced. </span>
                          <a
                            href="https://www.bizpolicies.ebay.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-700 dark:hover:text-amber-300"
                          >
                            Set up business policies in eBay
                          </a>
                          <span>, then click "Sync from eBay".</span>
                        </div>
                      )}
                    </div>

                    <Link
                      href="/organizer/settings/ebay"
                      className="inline-flex items-center gap-1 text-sm text-sage-600 hover:text-sage-700 dark:text-sage-400 dark:hover:text-sage-500 mt-3"
                    >
                      Advanced eBay Setup →
                    </Link>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => syncEbayInventoryMutation.mutate()}
                        disabled={syncEbayInventoryMutation.isPending}
                        className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition flex items-center gap-2"
                      >
                        {syncEbayInventoryMutation.isPending ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Syncing...
                          </>
                        ) : 'Sync eBay Inventory'}
                      </button>
                      <button
                        onClick={() => disconnectEbayMutation.mutate()}
                        disabled={disconnectEbayMutation.isPending}
                        className="text-sm bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition"
                      >
                        {disconnectEbayMutation.isPending ? 'Disconnecting...' : 'Disconnect eBay Account'}
                      </button>
                    </div>
                    {ebayStatus?.lastEbayInventorySyncAt && (
                      <p className="text-xs text-warm-500 dark:text-gray-500">
                        Last synced: {new Date(ebayStatus.lastEbayInventorySyncAt).toLocaleString()}
                      </p>
                    )}
                    {ebayStatus?.ebaySaleId && (
                      <a
                        href={`/organizer/sales/${ebayStatus.ebaySaleId}`}
                        className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 underline"
                      >
                        View eBay Inventory →
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                      Connect your eBay account to start pushing inventory. You'll be redirected to eBay to authorize FindA.Sale.
                    </p>
                    <button
                      onClick={handleEbayConnect}
                      disabled={isConnectingEbay}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                    >
                      {isConnectingEbay ? 'Redirecting to eBay...' : 'Connect eBay Account'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Help & Support Tab */}
          {activeTab === 'help' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 mb-6">Help & Support</h2>

              <div className="space-y-4">
                <div className="border border-warm-200 dark:border-gray-700 rounded p-4">
                  <h3 className="font-medium text-warm-900 dark:text-gray-100 mb-2">Send Feedback</h3>
                  <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
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
          )}
        </div>
      </div>

      {/* Feedback Menu Modal */}
      <FeedbackMenu isOpen={isFeedbackMenuOpen} onClose={() => setIsFeedbackMenuOpen(false)} />
    </>
  );
};

export default OrganizerSettingsPage;
