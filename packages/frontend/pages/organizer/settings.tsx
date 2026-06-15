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
import BroadcastSection from '../../components/BroadcastSection';
import AccessibleModal from '../../components/AccessibleModal';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io as socketIO } from 'socket.io-client';
import WebsiteEmbedTab from '../../components/WebsiteEmbedTab';

const OrganizerSettingsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { showSurvey } = useFeedbackSurvey();
  const { tier, isPro } = useOrganizerTier();
  const { isLowBandwidth, networkType, toggleLowBandwidth } = useNetworkQuality();
  const [activeTab, setActiveTab] = useState<'payments' | 'notifications' | 'profile' | 'subscription' | 'appearance' | 'verification' | 'security' | 'help' | 'ebay' | 'website'>('payments');
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [tagline, setTagline] = useState('');
  const [yearFounded, setYearFounded] = useState('');
  const [website, setWebsite] = useState('');
  const [facebook, setFacebook] = useState('');
  const [instagram, setInstagram] = useState('');
  const [etsy, setEtsy] = useState('');
  const [ebayStoreUrl, setEbayStoreUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [pinterestUrl, setPinterestUrl] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const [pickupWindows, setPickupWindows] = useState('');

  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [byAppointment, setByAppointment] = useState(false);
  const [hours, setHours] = useState<Array<{ dayOfWeek: number; openTime: string; closeTime: string }>>(
    Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, openTime: '09:00', closeTime: '17:00' }))
  );
  const [organizerTypes, setOrganizerTypes] = useState<string[]>([]);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [foundingOrgBadge, setFoundingOrgBadge] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);
  const [syncingEbayPolicies, setSyncingEbayPolicies] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [aiAssistanceEnabled, setAiAssistanceEnabled] = useState(true);
  const [isFeedbackMenuOpen, setIsFeedbackMenuOpen] = useState(false);
  const { highContrast, setHighContrast } = useTheme();
  const queryClient = useQueryClient();
  const [removeWatermarkEnabled, setRemoveWatermarkEnabled] = useState(false);
  const [watermarkUpdating, setWatermarkUpdating] = useState(false);
  const [showFollowerCount, setShowFollowerCount] = useState(true);
  const [followerCountUpdating, setFollowerCountUpdating] = useState(false);
  const [organizerTier, setOrganizerTier] = useState<string | null>(null);
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [recentBroadcasts, setRecentBroadcasts] = useState<Array<{ id: string; subject: string; sentAt: string; recipientCount: number }>>([]);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Verification types
  interface GooglePlaceResult {
    placeId: string;
    name: string;
    address: string;
    rating?: number;
    userRatingsTotal?: number;
  }

  interface YelpBusinessResult {
    businessId: string;
    name: string;
    address: string;
    rating: number | null;
    reviewCount: number;
    phone: string | null;
    url: string | null;
  }

  interface VerificationPreview {
    incoming: {
      businessName: string;
      address: string;
      phone?: string;
      website?: string;
      hours?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
      googlePlaceId?: string;
      yelpBusinessId?: string;
      rating?: number;
      reviewCount?: number;
    };
    current: {
      businessName: string;
      address: string;
      phone?: string;
      website?: string;
      hours?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>;
    };
  }

  // Verification state
  const [verSource, setVerSource] = useState<'google' | 'yelp'>('google');
  const [verSearchQuery, setVerSearchQuery] = useState('');
  const [verCity, setVerCity] = useState('');
  const [verSearchResults, setVerSearchResults] = useState<(GooglePlaceResult | YelpBusinessResult)[]>([]);
  const [verSearchLoading, setVerSearchLoading] = useState(false);
  const [verNextPageToken, setVerNextPageToken] = useState<string | null>(null);
  const [verPreview, setVerPreview] = useState<VerificationPreview | null>(null);
  const [verPreviewLoading, setVerPreviewLoading] = useState(false);
  const [verConfirmLoading, setVerConfirmLoading] = useState(false);
  const [verStep, setVerStep] = useState<'search' | 'results' | 'preview' | 'done'>('search');

  // Verification status query
  const { data: verStatus, isLoading: verStatusLoading } = useQuery({
    queryKey: ['verification-status'],
    queryFn: () => api.get('/verification/status').then(r => r.data),
    enabled: !!user
  });

  // Storefront slug — used in verification done step
  const { data: authMe } = useQuery({
    queryKey: ['auth-me-oauth'],
    queryFn: () => api.get('/auth/me').then(r => r.data?.user),
    enabled: !!user,
    staleTime: 60_000,
  });
  const linkedProvider: string | null = authMe?.oauthProvider ?? null;

  const { data: storefrontSlug } = useQuery({
    queryKey: ['organizer-storefront-slug'],
    queryFn: () => api.get('/brand-kit/organizers/me').then(r => r.data?.customStorefrontSlug || null),
    enabled: !!user,
    staleTime: 5 * 60_000,
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

  // Account deletion mutation
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
      showToast(message, 'error');
    }
  });

  // Verification handlers
  const handleGoogleSearch = async () => {
    if (!verSearchQuery.trim()) return;
    setVerSearchLoading(true);
    try {
      let geoParams = '';
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        geoParams = `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
      } catch {
        if (verCity.trim()) {
          geoParams = `&city=${encodeURIComponent(verCity.trim())}`;
        }
      }

      const res = await api.get(`/verification/google/search?q=${encodeURIComponent(verSearchQuery)}${geoParams}`);
      const results = res.data.results || [];
      setVerSearchResults(results);
      setVerNextPageToken(res.data.nextPageToken || null);
      if (!results.length) {
        showToast('No results found — try a different business name', 'error');
        return;
      }
      setVerStep('results');
    } catch {
      showToast('Search failed — try a different name', 'error');
    } finally {
      setVerSearchLoading(false);
    }
  };

  const handleLoadMoreResults = async () => {
    if (!verNextPageToken) return;
    setVerSearchLoading(true);
    try {
      const res = await api.get(
        `/verification/google/search/next?pageToken=${encodeURIComponent(verNextPageToken)}&q=${encodeURIComponent(verSearchQuery)}`
      );
      const more = res.data.results || [];
      setVerSearchResults((prev) => [...prev, ...more]);
      setVerNextPageToken(res.data.nextPageToken || null);
    } catch {
      showToast('Could not load more results', 'error');
    } finally {
      setVerSearchLoading(false);
    }
  };

  const handleYelpSearch = async () => {
    if (!verSearchQuery.trim()) return;
    setVerSearchLoading(true);
    try {
      let geoParams = '';
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        geoParams = `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
      } catch {
        if (verCity.trim()) {
          geoParams = `&city=${encodeURIComponent(verCity.trim())}`;
        }
      }
      const res = await api.get(`/verification/yelp/search?q=${encodeURIComponent(verSearchQuery)}${geoParams}`);
      const results = res.data.results || [];
      if (!results.length) {
        showToast('No results found — try a different business name', 'error');
        return;
      }
      setVerSearchResults(results);
      setVerNextPageToken(null);
      setVerStep('results');
    } catch {
      showToast('Search failed — try a different name', 'error');
    } finally {
      setVerSearchLoading(false);
    }
  };

  const handleSelectPlace = async (placeId: string) => {
    setVerPreviewLoading(true);
    try {
      const res = await api.get(`/verification/google/preview?placeId=${encodeURIComponent(placeId)}`);
      setVerPreview(res.data);
      setVerStep('preview');
    } catch {
      showToast('Could not load business details', 'error');
    } finally {
      setVerPreviewLoading(false);
    }
  };

  const handleSelectYelpBusiness = async (businessId: string) => {
    setVerPreviewLoading(true);
    try {
      const res = await api.get(`/verification/yelp/preview?businessId=${encodeURIComponent(businessId)}`);
      setVerPreview(res.data);
      setVerStep('preview');
    } catch {
      showToast('Could not load business details', 'error');
    } finally {
      setVerPreviewLoading(false);
    }
  };

  const handleConfirmVerification = async () => {
    if (!verPreview) return;
    setVerConfirmLoading(true);
    try {
      if (verSource === 'google') {
        await api.post('/verification/google/confirm', { placeId: verPreview.incoming.googlePlaceId });
      } else {
        await api.post('/verification/yelp/confirm', { businessId: verPreview.incoming.yelpBusinessId });
      }
      queryClient.invalidateQueries({ queryKey: ['verification-status'] });
      setVerStep('done');
      showToast('Your business is now verified!', 'success');
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Verification failed', 'error');
    } finally {
      setVerConfirmLoading(false);
    }
  };

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
          setTagline(response.data.tagline || '');
          setYearFounded(response.data.yearFounded ? String(response.data.yearFounded) : '');
          setWebsite(response.data.website || '');
          setFacebook(response.data.facebook || '');
          setInstagram(response.data.instagram || '');
          setEtsy(response.data.etsy || '');
          setEbayStoreUrl(response.data.ebayStoreUrl || '');
          setTwitterUrl(response.data.twitterUrl || '');
          setTiktokUrl(response.data.tiktokUrl || '');
          setYoutubeUrl(response.data.youtubeUrl || '');
          setPinterestUrl(response.data.pinterestUrl || '');
          setVenmoHandle(response.data.venmoHandle || '');
          setZelleHandle(response.data.zelleHandle || '');
          setPickupWindows(response.data.pickupWindows || '');
          setAddress(response.data.address || '');
          setStripeConnected(response.data.stripeConnected || false);
          setFoundingOrgBadge(response.data.foundingOrgBadge || false);
          setOrganizerTier(response.data.subscriptionTier || null);
          if (response.data.showFollowerCount !== undefined) {
            setShowFollowerCount(response.data.showFollowerCount);
          }
          setTimezone(response.data.timezone || '');
          setByAppointment(response.data.byAppointment || false);
          setOrganizerTypes(response.data.organizerTypes || []);
        }
        // Fetch hours
        try {
          const hoursRes = await api.get('/organizers/me/hours');
          if (hoursRes.data && Array.isArray(hoursRes.data) && hoursRes.data.length > 0) {
            setHours(hoursRes.data);
          } else {
            // No saved hours yet — initialize with default open hours for all 7 days
            const defaultHours = Array.from({ length: 7 }, (_, i) => ({
              dayOfWeek: i,
              openTime: '09:00',
              closeTime: '17:00',
            }));
            setHours(defaultHours);
          }
        } catch (error) {
          // Hours fetch failed — initialize with defaults
          const defaultHours = Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            openTime: '09:00',
            closeTime: '17:00',
          }));
          setHours(defaultHours);
        }
        // Fetch watermark setting
        const watermarkRes = await api.get('/organizers/settings/watermark');
        if (watermarkRes.data) {
          setRemoveWatermarkEnabled(watermarkRes.data.removeWatermarkEnabled || false);
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

    // Set active tab from query param (e.g. /organizer/settings?tab=profile)
    const validTabs = ['payments', 'notifications', 'profile', 'subscription', 'appearance', 'verification', 'security', 'help', 'ebay', 'website'];
    if (router.query.tab && validTabs.includes(router.query.tab as string)) {
      setActiveTab(router.query.tab as any);
    }

    // Check for eBay callback success
    if (router.query.ebay_connected === 'true') {
      showToast('eBay account connected successfully', 'success');
      refetchEbayStatus();
      // Remove the query param
      router.replace('/organizer/settings?tab=ebay', undefined, { shallow: true });
    }
  }, [router.query.ebay_connected, router.query.tab, showToast, refetchEbayStatus, router]);

  // Listen for background eBay enrichment completion — shows toast when GetItem pass finishes
  useEffect(() => {
    if (activeTab !== 'ebay' || typeof window === 'undefined') return;
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');
    const token = localStorage.getItem('token');
    // S708: accessToken is in an httpOnly cookie — withCredentials carries it on handshake
    const socket = socketIO(socketUrl, {
      auth: { token: token || undefined },
      withCredentials: true,
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

  const handleWatermarkToggle = async (enabled: boolean) => {
    setWatermarkUpdating(true);
    try {
      const res = await api.patch('/organizers/settings/watermark', {
        removeWatermarkEnabled: enabled,
      });
      setRemoveWatermarkEnabled(res.data.removeWatermarkEnabled);
      showToast(enabled ? 'Watermark removal enabled' : 'Watermark removal disabled', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to update watermark setting';
      showToast(msg, 'error');
      // Revert toggle on error
      setRemoveWatermarkEnabled(!enabled);
    } finally {
      setWatermarkUpdating(false);
    }
  };

  const handleShowFollowerCountToggle = async (enabled: boolean) => {
    setFollowerCountUpdating(true);
    setShowFollowerCount(enabled);
    try {
      await api.patch('/organizers/me', { showFollowerCount: enabled });
    } catch (error: any) {
      // Revert on error
      setShowFollowerCount(!enabled);
      showToast('Failed to update follower count visibility', 'error');
    } finally {
      setFollowerCountUpdating(false);
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
        tagline,
        yearFounded: yearFounded ? parseInt(yearFounded, 10) : undefined,
        website,
        facebook,
        instagram,
        etsy,
        ebayStoreUrl,
        twitterUrl,
        tiktokUrl,
        youtubeUrl,
        pinterestUrl,
        venmoHandle,
        zelleHandle,
        pickupWindows,
        timezone,
        byAppointment,
        organizerTypes,
        address,
      });
      // Refetch organizer data to sync local state with backend
      const response = await api.get('/organizers/me');
      if (response.data) {
        setPhone(response.data.phone || '');
        setBio(response.data.bio || '');
        setTagline(response.data.tagline || '');
        setYearFounded(response.data.yearFounded ? String(response.data.yearFounded) : '');
        setWebsite(response.data.website || '');
        setFacebook(response.data.facebook || '');
        setInstagram(response.data.instagram || '');
        setEtsy(response.data.etsy || '');
        setEbayStoreUrl(response.data.ebayStoreUrl || '');
        setTwitterUrl(response.data.twitterUrl || '');
        setTiktokUrl(response.data.tiktokUrl || '');
        setYoutubeUrl(response.data.youtubeUrl || '');
        setPinterestUrl(response.data.pinterestUrl || '');
        setVenmoHandle(response.data.venmoHandle || '');
        setZelleHandle(response.data.zelleHandle || '');
        setPickupWindows(response.data.pickupWindows || '');
        setTimezone(response.data.timezone || '');
        setByAppointment(response.data.byAppointment || false);
        setOrganizerTypes(response.data.organizerTypes || []);
        setAddress(response.data.address || '');
      }
      showToast('Profile updated', 'success');
      showSurvey('OG-5');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveHours = async () => {
    setIsSavingHours(true);
    try {
      const hoursToSave = byAppointment ? [] : hours;
      const patchBody: Record<string, unknown> = { byAppointment };
      if (timezone) patchBody.timezone = timezone;
      await Promise.all([
        api.put('/organizers/me/hours', hoursToSave),
        api.patch('/organizers/me', patchBody),
      ]);
      // Refetch hours from server to ensure UI reflects persisted state
      try {
        const hoursRes = await api.get('/organizers/me/hours');
        if (hoursRes.data && Array.isArray(hoursRes.data) && hoursRes.data.length > 0) {
          setHours(hoursRes.data);
        } else if (!byAppointment) {
          const defaultHours = Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            openTime: '09:00',
            closeTime: '17:00',
          }));
          setHours(defaultHours);
        }
      } catch {
        // Refetch failed — local state is still valid from user edits
      }
      showToast('Business hours updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update business hours', 'error');
    } finally {
      setIsSavingHours(false);
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
          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700 overflow-x-auto flex-nowrap">
            {(['payments', 'subscription', 'verification', 'notifications', 'profile', 'security', 'appearance', 'ebay', ...(tier !== 'SIMPLE' && tier !== null ? ['website'] : []), 'help'] as const).map((tab) => {
              const tabLabel = tab === 'verification' ? 'Get Verified' : tab === 'website' ? 'Website' : tab.charAt(0).toUpperCase() + tab.slice(1);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(tab as any);
                  }}
                  className={`pb-2 font-medium whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab
                      ? 'border-b-2 border-amber-600 text-amber-600'
                      : 'text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200'
                  }`}
                >
                  {tabLabel}
                </button>
              );
            })}
          </div>

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* Stripe Connect */}
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
                      {tier === 'SIMPLE' ? 'SIMPLE (Free)' : tier === 'PRO' ? 'PRO ($29/mo)' : tier === 'TEAMS' ? 'TEAMS ($79/mo)' : 'Loading...'}
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
            </div>
          )}

          {/* Verification Tab */}
          {activeTab === 'verification' && (
            <div className="space-y-6">
              {/* If already verified via Google, show success card */}
              {verStatus?.status === 'VERIFIED' && (
                <div className="card p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3 mb-4">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <h2 className="text-xl font-semibold text-green-800 dark:text-green-200">You're Verified!</h2>
                    <VerifiedBadge status={verStatus?.status} verificationSource={verStatus?.verificationSource} size="md" />
                  </div>
                  <p className="text-green-700 dark:text-green-300 mb-2">
                    Your business is verified{
                      verStatus?.verificationSource === 'GOOGLE' ? ' via Google Business' :
                      verStatus?.verificationSource === 'YELP' ? ' via Yelp' : ''
                    }.
                  </p>
                  {verStatus?.verificationSource === 'GOOGLE' && (
                    <p className="text-sm text-green-600 dark:text-green-400 mb-4">
                      Your profile was auto-filled from your Google Business listing on {verStatus?.verifiedAt ? new Date(verStatus.verifiedAt).toLocaleDateString() : 'today'}.
                    </p>
                  )}
                  {verStatus?.verificationSource === 'YELP' && (
                    <p className="text-sm text-green-600 dark:text-green-400 mb-4">
                      Your profile was auto-filled from Yelp on {verStatus?.verifiedAt ? new Date(verStatus.verifiedAt).toLocaleDateString() : 'today'}.
                    </p>
                  )}
                  {verStatus?.verifiedAt && (
                    <p className="text-sm text-green-600 dark:text-green-400 mb-6">
                      Verified badge is now live on your storefront and all your sales.
                    </p>
                  )}
                  <Link
                    href={storefrontSlug ? `/organizer/storefront/${storefrontSlug}` : '/organizer/settings'}
                    className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition"
                  >
                    View Storefront
                  </Link>
                </div>
              )}

              {/* Google Places verification flow */}
              {verStatus?.status !== 'VERIFIED' && (
                <div className="card p-6">
                  {/* Search step */}
                  {verStep === 'search' && (
                    <>
                      <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-2">Verify your business</h2>
                      <p className="text-warm-600 dark:text-gray-400 mb-6">
                        Choose a verification source. We'll auto-fill your profile information.
                      </p>

                      {/* Source selector */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <button
                          onClick={() => setVerSource('google')}
                          className={`p-4 rounded-lg border-2 text-left transition ${
                            verSource === 'google'
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-warm-200 dark:border-gray-600 hover:border-amber-300'
                          }`}
                        >
                          <div className="font-semibold text-warm-900 dark:text-gray-100 mb-1">Google Business</div>
                          <div className="text-xs text-warm-500 dark:text-gray-400">Auto-fills name, address, phone, hours</div>
                        </button>
                        <button
                          onClick={() => setVerSource('yelp')}
                          className={`p-4 rounded-lg border-2 text-left transition ${
                            verSource === 'yelp'
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-warm-200 dark:border-gray-600 hover:border-amber-300'
                          }`}
                        >
                          <div className="font-semibold text-warm-900 dark:text-gray-100 mb-1">Yelp</div>
                          <div className="text-xs text-warm-500 dark:text-gray-400">Auto-fills name, address, phone</div>
                        </button>
                      </div>

                      {/* Search form */}
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={verSearchQuery}
                          onChange={(e) => setVerSearchQuery(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (verSource === 'google' ? handleGoogleSearch() : handleYelpSearch())}
                          placeholder="Search for your business..."
                          className="w-full px-4 py-2 border border-warm-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 placeholder-warm-400 dark:placeholder-gray-500 text-sm"
                        />
                        <input
                          type="text"
                          value={verCity}
                          onChange={(e) => setVerCity(e.target.value)}
                          placeholder="City, State (optional — helps narrow results)"
                          className="w-full px-4 py-2 border border-warm-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 placeholder-warm-400 dark:placeholder-gray-500 text-sm"
                        />
                        <button
                          onClick={verSource === 'google' ? handleGoogleSearch : handleYelpSearch}
                          disabled={verSearchLoading || !verSearchQuery.trim()}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition"
                        >
                          {verSearchLoading ? 'Searching...' : 'Find My Business'}
                        </button>
                      </div>
                      <div className="mt-6 pt-6 border-t border-warm-200 dark:border-gray-700">
                        <p className="text-sm text-warm-600 dark:text-gray-400 mb-3">
                          Can't find your business?
                        </p>
                        <button
                          onClick={() => requestMutation.mutate()}
                          disabled={requestMutation.isPending}
                          className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                        >
                          {requestMutation.isPending ? 'Submitting...' : 'Request manual review instead'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Results step */}
                  {verStep === 'results' && (
                    <>
                      <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-6">Is your business listed here?</h2>
                      <div className="space-y-3">
                        {verSearchResults.map((result) => (
                          <button
                            key={'placeId' in result ? result.placeId : result.businessId}
                            onClick={() => ('placeId' in result ? handleSelectPlace(result.placeId) : handleSelectYelpBusiness(result.businessId))}
                            disabled={verPreviewLoading}
                            className="w-full text-left p-4 border border-warm-200 dark:border-gray-600 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
                          >
                            <div className="font-semibold text-warm-900 dark:text-gray-100 mb-1">{result.name}</div>
                            <div className="text-sm text-warm-600 dark:text-gray-400 mb-2">{result.address}</div>
                            {result.rating && (
                              <div className="text-sm text-amber-600 dark:text-amber-400">
                                ★ {result.rating} ({'placeId' in result ? result.userRatingsTotal : result.reviewCount} reviews)
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      {verNextPageToken && (
                        <button
                          onClick={handleLoadMoreResults}
                          disabled={verSearchLoading}
                          className="w-full mt-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 border border-amber-200 dark:border-amber-800 rounded-lg disabled:opacity-50"
                        >
                          {verSearchLoading ? 'Loading...' : 'Show more results'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setVerStep('search');
                          setVerSearchResults([]);
                          setVerNextPageToken(null);
                        }}
                        className="mt-4 text-sm text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200"
                      >
                        ← Back
                      </button>
                    </>
                  )}

                  {/* Preview step */}
                  {verStep === 'preview' && verPreview && (
                    <>
                      <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-6">Does this look right?</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Current profile */}
                        <div>
                          <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-4">Your current profile</h3>
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Business Name</div>
                              <div className="text-warm-900 dark:text-gray-100">{verPreview.current.businessName}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Address</div>
                              <div className="text-warm-900 dark:text-gray-100">{verPreview.current.address}</div>
                            </div>
                            {verPreview.current.phone && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Phone</div>
                                <div className="text-warm-900 dark:text-gray-100">{verPreview.current.phone}</div>
                              </div>
                            )}
                            {verPreview.current.website && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Website</div>
                                <div className="text-warm-900 dark:text-gray-100 truncate">{verPreview.current.website}</div>
                              </div>
                            )}
                            {verPreview.current.hours && verPreview.current.hours.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-2">Hours</div>
                                <div className="text-sm space-y-1">
                                  {verPreview.current.hours.map((h) => (
                                    <div key={h.dayOfWeek} className="text-warm-900 dark:text-gray-100">
                                      {DAY_NAMES[h.dayOfWeek]}: {h.openTime} - {h.closeTime}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* What we found on Google */}
                        <div className="border-l border-warm-200 dark:border-gray-600 pl-6">
                          <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-4">What we found on Google</h3>
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Business Name</div>
                              <div className="text-warm-900 dark:text-gray-100">{verPreview.incoming.businessName}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Address</div>
                              <div className="text-warm-900 dark:text-gray-100">{verPreview.incoming.address}</div>
                            </div>
                            {verPreview.incoming.phone && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Phone</div>
                                <div className="text-warm-900 dark:text-gray-100">{verPreview.incoming.phone}</div>
                              </div>
                            )}
                            {verPreview.incoming.website && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Website</div>
                                <div className="text-warm-900 dark:text-gray-100 truncate">{verPreview.incoming.website}</div>
                              </div>
                            )}
                            {verPreview.incoming.rating && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-1">Rating</div>
                                <div className="text-warm-900 dark:text-gray-100">★ {verPreview.incoming.rating} ({verPreview.incoming.reviewCount} reviews)</div>
                              </div>
                            )}
                            {verPreview.incoming.hours && verPreview.incoming.hours.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-warm-600 dark:text-gray-400 mb-2">Hours</div>
                                <div className="text-sm space-y-1">
                                  {verPreview.incoming.hours.map((h) => (
                                    <div key={h.dayOfWeek} className="text-warm-900 dark:text-gray-100">
                                      {DAY_NAMES[h.dayOfWeek]}: {h.openTime} - {h.closeTime}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleConfirmVerification}
                          disabled={verConfirmLoading}
                          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 transition"
                        >
                          {verConfirmLoading ? 'Confirming...' : 'Confirm & Get Verified'}
                        </button>
                        <button
                          onClick={() => setVerStep('results')}
                          className="text-sm text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200"
                        >
                          Back
                        </button>
                      </div>
                    </>
                  )}

                  {/* Done step */}
                  {verStep === 'done' && (
                    <div className="text-center">
                      <svg className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-2">You're verified!</h2>
                      <p className="text-warm-600 dark:text-gray-400 mb-6">
                        Your badge is now live on your storefront and all your sales.
                      </p>
                      <Link
                        href={storefrontSlug ? `/organizer/storefront/${storefrontSlug}` : '/organizer/settings'}
                        className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition"
                      >
                        View Storefront
                      </Link>
                    </div>
                  )}

                  {/* PENDING status — only show on search step so it doesn't overlap Google flow */}
                  {verStatus?.status === 'PENDING' && verStep === 'search' && (
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

                  {/* REJECTED status */}
                  {verStatus?.status === 'REJECTED' && (
                    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="font-semibold text-red-800 dark:text-red-200 mb-2">Not Verified</p>
                      {verStatus?.verificationNotes && (
                        <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                          <strong>Reason:</strong> {verStatus.verificationNotes}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setVerStep('search');
                          setVerSearchQuery('');
                        }}
                        className="text-sm bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 rounded-lg transition"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              )}
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
            <div className="space-y-6">
              {/* #405: Founding Organizer Badge */}
              {foundingOrgBadge && (
                <div className="card p-5 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 flex items-center gap-4">
                  <span className="text-3xl" aria-hidden="true">🏆</span>
                  <div>
                    <p className="text-base font-bold text-amber-800 dark:text-amber-200">Founding Organizer</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">You're one of the first 500 organizers on FindA.Sale. This badge appears on your storefront.</p>
                  </div>
                </div>
              )}

              {/* Business Hours Section */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Business Hours</h2>
                  <Tooltip content="Set your regular business hours or mark yourself as by-appointment only." position="right" />
                </div>

                <div className="space-y-4">
                  {/* Timezone Selector */}
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    >
                      <option value="">Select timezone...</option>
                      <option value="America/New_York">Eastern (ET)</option>
                      <option value="America/Chicago">Central (CT)</option>
                      <option value="America/Denver">Mountain (MT)</option>
                      <option value="America/Los_Angeles">Pacific (PT)</option>
                      <option value="America/Detroit">Michigan (ET)</option>
                      <option value="America/Phoenix">Arizona (MST)</option>
                      <option value="America/Anchorage">Alaska (AKT)</option>
                      <option value="Pacific/Honolulu">Hawaii (HST)</option>
                    </select>
                  </div>

                  {/* By Appointment Checkbox */}
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={byAppointment}
                        onChange={(e) => setByAppointment(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-warm-700 dark:text-gray-300 font-medium">By appointment only</span>
                    </label>
                    <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                      {byAppointment ? "Customers will see 'By Appointment' on your storefront." : 'Show your regular business hours below.'}
                    </p>
                  </div>

                  {/* Weekly Hours Grid (hidden when byAppointment is true) */}
                  {!byAppointment && (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-warm-600 dark:text-gray-400">Regular Hours</p>
                      {hours.map((hour, index) => {
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const isClosed = hours[index]?.openTime === '' && hours[index]?.closeTime === '';

                        return (
                          <div key={index} className="flex items-center gap-3">
                            <label className="w-24 text-sm font-medium text-warm-700 dark:text-gray-300">
                              {dayNames[hour.dayOfWeek]}
                            </label>
                            {!isClosed ? (
                              <>
                                <input
                                  type="time"
                                  value={hour.openTime || '09:00'}
                                  onChange={(e) => {
                                    setHours(hours.map((h, i) => i === index ? { ...h, openTime: e.target.value } : h));
                                  }}
                                  className="px-3 py-1 border border-warm-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                                />
                                <span className="text-warm-600 dark:text-gray-400">–</span>
                                <input
                                  type="time"
                                  value={hour.closeTime || '17:00'}
                                  onChange={(e) => {
                                    setHours(hours.map((h, i) => i === index ? { ...h, closeTime: e.target.value } : h));
                                  }}
                                  className="px-3 py-1 border border-warm-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                                />
                              </>
                            ) : (
                              <span className="text-sm text-warm-500 dark:text-gray-400">Closed</span>
                            )}
                            <label className="flex items-center gap-2 ml-auto">
                              <input
                                type="checkbox"
                                checked={isClosed}
                                onChange={(e) => {
                                  setHours(hours.map((h, i) => i === index
                                    ? { ...h, openTime: e.target.checked ? '' : '09:00', closeTime: e.target.checked ? '' : '17:00' }
                                    : h
                                  ));
                                }}
                                className="w-4 h-4 rounded"
                              />
                              <span className="text-xs text-warm-600 dark:text-gray-400">Closed</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={handleSaveHours}
                    disabled={isSavingHours}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50 mt-4"
                  >
                    {isSavingHours ? 'Saving...' : 'Save Business Hours'}
                  </button>
                </div>
              </div>

              {/* Organizer Types Section */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Organizer Types</h2>
                  <Tooltip content="Select the types of sales you organize. These appear as badges on your storefront." position="right" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {[
                    { value: 'yard_sale', label: 'Yard Sales' },
                    { value: 'estate_sale', label: 'Estate Sales' },
                    { value: 'auction', label: 'Auctions' },
                    { value: 'flea_market', label: 'Flea Markets' },
                    { value: 'consignment', label: 'Consignment' },
                    { value: 'antique_shop', label: 'Antique Shops' },
                    { value: 'thrift_store', label: 'Thrift Stores' },
                    { value: 'liquidation', label: 'Liquidation' },
                  ].map((type) => (
                    <label key={type.value} className="flex items-center gap-2 p-2 border border-warm-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={organizerTypes.includes(type.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setOrganizerTypes([...organizerTypes, type.value]);
                          } else {
                            setOrganizerTypes(organizerTypes.filter(t => t !== type.value));
                          }
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-warm-700 dark:text-gray-300">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>


              {/* Feature #358: Follower Count Visibility Toggle */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Follower Count</h2>
                  <Tooltip content="Control whether shoppers can see your follower count on your storefront." position="right" />
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showFollowerCount}
                    onChange={(e) => handleShowFollowerCountToggle(e.target.checked)}
                    disabled={followerCountUpdating}
                    className="w-4 h-4 rounded disabled:opacity-50"
                  />
                  <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">
                    {followerCountUpdating ? 'Updating...' : 'Show follower count on your storefront'}
                  </span>
                </label>
                <p className="mt-2 text-sm text-warm-600 dark:text-gray-400">When enabled, shoppers can see how many people follow you. The Follow button always remains visible.</p>
              </div>

              {/* Broadcast to Followers Section — Feature #356 */}
              {(tier === 'PRO' || tier === 'TEAMS') ? (
                <div className="card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Message Your Followers</h2>
                    <Tooltip content="Send a message to all followers who opted in to email or push notifications." position="right" />
                  </div>

                  <BroadcastSection tier={tier} />
                </div>
              ) : (
                <div className="card p-6 border-2 border-amber-200 bg-amber-50 dark:bg-gray-900 dark:border-amber-900">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-2">Message Your Followers</h2>
                  <p className="text-sm text-warm-700 dark:text-gray-400 mb-3">
                    Broadcast messaging is available on PRO and TEAMS tiers.
                  </p>
                  <Link href="/organizer/subscription">
                    <button className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                      Upgrade to PRO
                    </button>
                  </Link>
                </div>
              )}

              {/* Business Info Section */}
              <div className="card p-6">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">Business Profile</h2>
                <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">Name or Business Name <span className="text-red-500">*</span></label>
                    <Tooltip content="This is how your business appears to shoppers on item listings and sale pages. Use your official business name or brand." position="right" />
                  </div>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., Sarah's Finds, Smith Family Estate, or your own name"
                  />
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">No business? Your name works perfectly.</p>
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
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Business Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., 123 Main St, Holland, MI 49423"
                  />
                  <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">Used for sale listings and eBay pickup location</p>
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
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Tagline</label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value.slice(0, 120))}
                    maxLength={120}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., Quality Sales Since 2010 — Trusted by Local Buyers"
                  />
                  <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">{tagline.length}/120 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Year Founded</label>
                  <input
                    type="number"
                    value={yearFounded}
                    onChange={(e) => setYearFounded(e.target.value)}
                    min="1900"
                    max={new Date().getFullYear()}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="e.g., 2018"
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
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">eBay Store URL</label>
                  <input
                    type="url"
                    value={ebayStoreUrl}
                    onChange={(e) => setEbayStoreUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://www.ebay.com/str/your-store-name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Twitter Profile URL</label>
                  <input
                    type="url"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://twitter.com/yourprofile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">TikTok Profile URL</label>
                  <input
                    type="url"
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://tiktok.com/@yourprofile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">YouTube Channel URL</label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://youtube.com/@yourchannel"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Pinterest Profile URL</label>
                  <input
                    type="url"
                    value={pinterestUrl}
                    onChange={(e) => setPinterestUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="https://pinterest.com/yourprofile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Venmo Handle</label>
                  <p className="text-xs text-warm-500 dark:text-gray-400 mb-1">Shown to buyers in the POS when you select Venmo as the payment method.</p>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-warm-100 dark:bg-gray-700 border border-r-0 border-warm-300 dark:border-gray-700 rounded-l-lg text-warm-500 dark:text-gray-400 text-sm">@</span>
                    <input
                      type="text"
                      value={venmoHandle}
                      onChange={(e) => setVenmoHandle(e.target.value.replace(/^@/, ''))}
                      className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-r-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                      placeholder="yourvenmo"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">Zelle Handle</label>
                  <p className="text-xs text-warm-500 dark:text-gray-400 mb-1">Phone number or email shown to buyers in the POS when you select Zelle as the payment method.</p>
                  <input
                    type="text"
                    value={zelleHandle}
                    onChange={(e) => setZelleHandle(e.target.value)}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
                    placeholder="555-555-5555 or email@example.com"
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

                <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10 px-4 py-3">
                  <p className="text-xs font-medium text-warm-700 dark:text-gray-300 mb-0.5">Return Window</p>
                  <p className="text-xs text-warm-500 dark:text-gray-400">The return window is set per sale. When editing a sale, look for the &quot;Return Window&quot; field in the sale details.</p>
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
            </div>
          )}

          {/* Linked Accounts — Profile Tab continuation */}
          {activeTab === 'profile' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Linked Accounts</h2>
                <Tooltip content="Connect a Google account so you can sign in with one click. Your password login still works either way." position="right" />
              </div>
              <div className="flex items-center justify-between py-3 border border-warm-200 dark:border-gray-700 rounded-lg px-4">
                <div className="flex items-center gap-3">
                  {/* Google "G" badge */}
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-warm-200 dark:border-gray-600 shadow-sm text-sm font-bold" style={{ color: '#4285F4' }}>G</span>
                  <div>
                    <p className="text-sm font-medium text-warm-900 dark:text-gray-100">Google</p>
                    {linkedProvider === 'google' ? (
                      <p className="text-xs text-green-600 dark:text-green-400">Connected — sign in with Google is enabled</p>
                    ) : (
                      <p className="text-xs text-warm-500 dark:text-gray-400">Not connected</p>
                    )}
                  </div>
                </div>
                {linkedProvider === 'google' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-1 rounded-full border border-green-200 dark:border-green-800">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Connected
                  </span>
                ) : (
                  <a
                    href="/api/auth/google"
                    className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    Link Google Account
                  </a>
                )}
              </div>
              <p className="text-xs text-warm-500 dark:text-gray-400 mt-3">
                Linking lets you sign in with Google without entering your password.
              </p>
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

              {/* Watermark Settings Section */}
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100">Watermark Settings</h2>
                  <Tooltip content="Remove FindA.Sale watermark from exports and shareable images." position="right" />
                </div>
                <div className="space-y-4">
                  {organizerTier !== 'TEAMS' ? (
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                        <strong>Teams plan required</strong> — Watermark removal is only available with the Teams plan.
                      </p>
                      <Link href="/pricing">
                        <button className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                          Upgrade to Teams
                        </button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={removeWatermarkEnabled}
                          onChange={(e) => handleWatermarkToggle(e.target.checked)}
                          disabled={watermarkUpdating}
                          className="w-4 h-4 rounded disabled:opacity-50"
                        />
                        <span className="ml-2 text-warm-700 dark:text-gray-300 font-medium">
                          {watermarkUpdating ? 'Updating...' : 'Remove FindA.Sale watermark from exports and shareable images'}
                        </span>
                      </label>
                      <p className="text-sm text-warm-600 dark:text-gray-400">When enabled, your exported PDFs, shareable cards, and images will not display the FindA.Sale branding.</p>
                    </div>
                  )}
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

          {/* Website Tab — PRO/TEAMS only */}
          {activeTab === 'website' && (
            <div className="space-y-6">
              {(tier === 'PRO' || tier === 'TEAMS') ? (
                <WebsiteEmbedTab organizerSlug={storefrontSlug || user?.id || ''} />
              ) : (
                <div className="card p-8 text-center">
                  <div className="text-4xl mb-4">🔒</div>
                  <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-2">
                    This feature is available on PRO and TEAMS plans.
                  </h2>
                  <p className="text-warm-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Add a live inventory widget to your own website — shoppers can browse your listings without leaving your page.
                  </p>
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition"
                  >
                    Upgrade to PRO →
                  </button>
                </div>
              )}
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

                {/* Data & Privacy */}
                <div className="border border-amber-200 dark:border-amber-700 rounded-lg p-6 bg-amber-50 dark:bg-amber-900/20">
                  <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">Your Data</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                    Download a copy of your account data (GDPR Article 20).
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const response = await api.get('/users/me/export', {
                            responseType: 'blob',
                          });
                          const url = window.URL.createObjectURL(new Blob([response.data]));
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', `findasale-data-export-${new Date().toISOString().split('T')[0]}.json`);
                          document.body.appendChild(link);
                          link.click();
                          link.parentNode?.removeChild(link);
                          showToast('Data export downloaded successfully', 'success');
                        } catch (error: any) {
                          let msg = 'Failed to download data export';
                          if (error.response?.data instanceof Blob) {
                            try {
                              const text = await error.response.data.text();
                              const json = JSON.parse(text);
                              if (error.response.status === 429) {
                                msg = json.error || json.message || 'You\'ve already exported today. Please wait 24 hours before exporting again.';
                              } else {
                                msg = json.error || json.message || msg;
                              }
                            } catch {}
                          } else if (error.response?.data?.error) {
                            msg = error.response.data.error;
                          }
                          showToast(msg, 'error');
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm transition"
                    >
                      Download My Data
                      <span className="block text-xs font-normal opacity-80">Limited to once per 24 hours</span>
                    </button>
                    {/* Feature #66: Open Data ZIP — sales, items, purchases as CSVs */}
                    <button
                      onClick={async () => {
                        try {
                          const response = await api.get('/organizers/export', {
                            responseType: 'blob',
                          });
                          const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', `findasale-export-${new Date().toISOString().split('T')[0]}.zip`);
                          document.body.appendChild(link);
                          link.click();
                          link.parentNode?.removeChild(link);
                          window.URL.revokeObjectURL(url);
                          showToast('Organizer data export downloaded', 'success');
                        } catch (error: any) {
                          let msg = 'Failed to download organizer export';
                          if (error.response?.data instanceof Blob) {
                            try {
                              const text = await error.response.data.text();
                              const json = JSON.parse(text);
                              if (error.response.status === 429) {
                                msg = json.message || json.error || 'You\'ve already exported this month. Please wait before exporting again.';
                              } else {
                                msg = json.message || json.error || msg;
                              }
                            } catch {}
                          } else if (error.response?.data?.message) {
                            msg = error.response.data.message;
                          }
                          showToast(msg, 'error');
                        }
                      }}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-medium text-sm transition"
                    >
                      Download Sale & Item Data (ZIP)
                      <span className="block text-xs font-normal opacity-80">Limited to once per month</span>
                    </button>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
                  <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Danger Zone</h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                    Permanently delete your account. Your personal information will be anonymized. Transaction records are retained for legal and tax purposes.
                  </p>
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={deleteAccountMutation.isPending}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete My Account'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Menu Modal */}
      <FeedbackMenu isOpen={isFeedbackMenuOpen} onClose={() => setIsFeedbackMenuOpen(false)} />

      {/* Delete Account Modal */}
      <AccessibleModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletePassword('');
        }}
        modalId="delete-account-modal"
        ariaLabelledBy="delete-modal-title"
      >
        <h2 id="delete-modal-title" className="text-2xl font-bold text-red-900 dark:text-red-100 mb-4">
          Delete Account
        </h2>
        <p className="text-red-700 dark:text-red-300 mb-6">
          This action cannot be undone. Your personal information will be anonymized, but transaction records will be retained for legal and tax purposes.
        </p>
        <div className="mb-6">
          <label htmlFor="delete-password-input" className="block text-sm font-medium text-warm-900 dark:text-gray-100 mb-2">
            Enter your password to confirm:
          </label>
          <input
            id="delete-password-input"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && deletePassword.trim()) {
                deleteAccountMutation.mutate(deletePassword);
              }
            }}
            placeholder="Enter password"
            className="w-full px-4 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 placeholder-warm-400 dark:placeholder-gray-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              deleteAccountMutation.mutate(deletePassword);
            }}
            disabled={deleteAccountMutation.isPending || !deletePassword.trim()}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {deleteAccountMutation.isPending ? 'Deleting account...' : 'Yes, Delete My Account'}
          </button>
          <button
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeletePassword('');
            }}
            className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700 font-medium text-sm transition"
          >
            Cancel
          </button>
        </div>
      </AccessibleModal>
    </>
  );
}

export default OrganizerSettingsPage;
