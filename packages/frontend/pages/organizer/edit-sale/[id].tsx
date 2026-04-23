/**
 * Edit Sale Page
 *
 * Allows organizers to update:
 * - Sale title, description
 * - Dates and location
 * - Photos
 * - Status (active, draft, ended)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useFeedbackSurvey } from '../../../hooks/useFeedbackSurvey';
import Head from 'next/head';
import Link from 'next/link';
import PickupSlotManager from '../../../components/PickupSlotManager';
import EntrancePinPicker from '../../../components/EntrancePinPicker'; // Feature 35: Front Door Locator
import Skeleton from '../../../components/Skeleton';
import PublishCelebration from '../../../components/PublishCelebration';
import AlaCartePublishModal from '../../../components/AlaCartePublishModal'; // #132: À La Carte
import TreasureHuntQRManager from '../../../components/TreasureHuntQRManager'; // Feature #85
import SaleCoverPhotoManager from '../../../components/SaleCoverPhotoManager';

const EditSalePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { showSurvey } = useFeedbackSurvey();
  const [isCloning, setIsCloning] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [entrancePinTooFar, setEntrancePinTooFar] = useState(false);
  const [showPublishCelebration, setShowPublishCelebration] = useState(false);
  const [showAlaCarteModal, setShowAlaCarteModal] = useState(false); // #132: À La Carte
  const [isSendingApproachNotification, setIsSendingApproachNotification] = useState(false); // Feature #84: Approach Notes notification
  const [geocodingAttempted, setGeocodingAttempted] = useState(false); // Track whether geocoding has been attempted
  const [isAutoGeocodingOnLoad, setIsAutoGeocodingOnLoad] = useState(false); // Track auto-geocoding in progress
  const [tierLimitError, setTierLimitError] = useState<any>(null); // Feature #249: Concurrent Sales Gate
  const [suggestions, setSuggestions] = useState<Array<{lat: string, lng: string, displayName: string}>>([]);
  const [isSettingLocation, setIsSettingLocation] = useState(false);
  const formInitialized = useRef(false); // prevent background refetches from resetting form
  const formDataRef = useRef<any>(null); // Capture current formData to avoid stale closure in mutations

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    neighborhood: '',
    saleType: 'ESTATE' as string,
    // Cover photo
    photoUrls: [] as string[],
    // Feature 35: Front Door Locator
    entranceLat: undefined as number | undefined,
    entranceLng: undefined as number | undefined,
    entranceNote: '' as string,
    // Feature #84: Approach Notes
    notes: '' as string,
    // Feature #91: Auto-Markdown (Smart Clearance)
    markdownEnabled: false,
    markdownFloor: undefined as number | undefined,
    // Feature #85: Treasure Hunt QR
    treasureHuntEnabled: true,
    // Feature #121: Allow item holds for this sale
    holdsEnabled: true,
    // Sale times
    startTime: '09:00' as string,
    endTime: '15:00' as string,
  });

  // Helper: Compute distance between two lat/lng points (degrees, approx)
  // One degree ≈ 111 km, so 0.005 degrees ≈ 0.55 km ≈ 0.34 miles
  const computeDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    return Math.hypot(lat2 - lat1, lng2 - lng1);
  };

  // Helper: Check if entrance pin is far from sale address (> 0.0045 degrees ≈ 0.5 miles)
  const checkEntrancePinDistance = (entranceLat: number, entranceLng: number, saleLat: number, saleLng: number): boolean => {
    const distance = computeDistance(saleLat, saleLng, entranceLat, entranceLng);
    return distance > 0.0045; // Beyond ~0.5 miles / 0.8 km
  };

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: sale, isLoading, refetch } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}`);
      return response.data;
    },
    refetchOnWindowFocus: false, // prevent background refetches from resetting the form mid-edit
    enabled: !!id,
  });

  // Keep formDataRef in sync with formData state to avoid stale closure in mutations
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Auto-geocode if sale has address but null lat/lng (new sale or failed geocoding before S301 migration)
  const attemptGeocode = async (address: string, city: string, state: string, zip: string) => {
    if (!address || !city || !state) return false;

    setIsAutoGeocodingOnLoad(true);
    setSuggestions([]); // Clear suggestions before new attempt
    try {
      const response = await api.get('/geocode', { params: { address, city, state, zip } });

      if (response.data.lat && response.data.lng) {
        setIsAutoGeocodingOnLoad(false);
        setSuggestions([]); // Clear suggestions on success
        return { lat: response.data.lat, lng: response.data.lng };
      }
      // Check if response contains suggestions (partial match fallback)
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        setSuggestions(response.data.suggestions);
      }
      setIsAutoGeocodingOnLoad(false);
      setGeocodingAttempted(true);
      return false;
    } catch (error) {
      console.error('Geocoding failed:', error);
      setSuggestions([]); // Clear suggestions on error
      setIsAutoGeocodingOnLoad(false);
      setGeocodingAttempted(true);
      return false;
    }
  };

  useEffect(() => {
    if (!sale) return;
    if (formInitialized.current) return; // Skip resets after first init
    formInitialized.current = true;

    // Convert ISO date strings to YYYY-MM-DD format for input type="date"
    const formatDate = (isoDate: string | undefined) => {
      if (!isoDate) return '';
      return new Date(isoDate).toISOString().split('T')[0];
    };

    // Extract local HH:MM from ISO string for time inputs
    const formatTime = (isoDate: string | undefined, fallback: string) => {
      if (!isoDate) return fallback;
      const d = new Date(isoDate);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    setFormData({
      title: sale.title,
      description: sale.description,
      startDate: formatDate(sale.startDate),
      endDate: formatDate(sale.endDate),
      startTime: formatTime(sale.startDate, '09:00'),
      endTime: formatTime(sale.endDate, '15:00'),
      address: sale.address,
      city: sale.city,
      state: sale.state,
      zip: sale.zip,
      neighborhood: sale.neighborhood ?? '',
      saleType: sale.saleType ?? 'ESTATE',
      photoUrls: sale.photoUrls ?? [],
      entranceLat: sale.entranceLat ?? undefined,
      entranceLng: sale.entranceLng ?? undefined,
      entranceNote: sale.entranceNote ?? '',
      // Feature #84: Approach Notes
      notes: sale.notes ?? '',
      // Feature #91: Auto-Markdown (Smart Clearance)
      markdownEnabled: sale.markdownEnabled ?? false,
      markdownFloor: sale.markdownFloor ?? undefined,
      // Feature #85: Treasure Hunt QR
      treasureHuntEnabled: sale.treasureHuntEnabled ?? true,
      // Feature #121: Allow item holds for this sale
      holdsEnabled: sale.holdsEnabled ?? true,
    });

    // Auto-trigger geocoding if sale has no coordinates but has address fields
    if (!sale.lat && !sale.lng && sale.address && sale.city && sale.state && !geocodingAttempted) {
      attemptGeocode(sale.address, sale.city, sale.state, sale.zip).then(async (coords) => {
        if (coords) {
          try {
            await api.patch(`/sales/${id}/coordinates`, { lat: coords.lat, lng: coords.lng });
            refetch();
          } catch {
            setGeocodingAttempted(true);
          }
        }
      });
    }
  }, [sale, geocodingAttempted]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Feature #91: Exclude markdown fields from main update (they go to separate endpoint)
      // Feature #85: Include treasure hunt fields in main update
      // Feature #121: Include holdsEnabled in main update
      const { markdownEnabled, markdownFloor, startTime, endTime, ...rest } = formDataRef.current;

      // Recombine date + time into UTC ISO strings before submitting
      const saleData = {
        ...rest,
        startDate: rest.startDate ? new Date(`${rest.startDate}T${startTime}`).toISOString() : rest.startDate,
        endDate: rest.endDate ? new Date(`${rest.endDate}T${endTime}`).toISOString() : rest.endDate,
      };

      // First update the sale (includes treasure hunt fields and holdsEnabled)
      await api.put(`/sales/${id}`, saleData);

      // Then update markdown config — PRO-only endpoint, silently skip for lower tiers
      try {
        await api.put(`/sales/${id}/markdown-config`, {
          markdownEnabled,
          markdownFloor,
        });
      } catch (err: any) {
        if (err?.response?.status !== 403) throw err;
        // 403 = user isn't PRO — markdown settings not saved, but sale update succeeded
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      showToast('Sale updated', 'success');
      router.push(`/organizer/dashboard`);
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to update sale', 'error');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Feature #91: Auto-Markdown handler
  const handleMarkdownToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, markdownEnabled: e.target.checked });
  };

  const handleMarkdownFloorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, markdownFloor: value ? parseFloat(value) : undefined });
  };

  const markdownConfigMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/sales/${id}/markdown-config`, {
        markdownEnabled: formData.markdownEnabled,
        markdownFloor: formData.markdownFloor,
      });
    },
    onSuccess: () => {
      showToast('Markdown settings saved', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.message || 'Failed to save markdown settings', 'error');
    },
  });

  // Feature #84: Send approach notification to shoppers who saved the sale
  const handleSendApproachNotification = async () => {
    if (!id || !formData.notes.trim()) {
      showToast('Please add approach notes before sending', 'error');
      return;
    }
    setIsSendingApproachNotification(true);
    try {
      await api.post(`/sales/${id}/send-approach-notification`);
      showToast('Approach notes sent to shoppers!', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to send notification', 'error');
    } finally {
      setIsSendingApproachNotification(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.title.trim()) return;
    setIsGeneratingDesc(true);
    try {
      const response = await api.post('/sales/generate-description', {
        title: formData.title,
        city: formData.city || undefined,
        saleType: formData.saleType,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
      });
      setFormData(prev => ({ ...prev, description: response.data.description }));
    } catch {
      showToast("Couldn't generate description \u2014 try again", 'error');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleCloneSale = async () => {
    if (!id) return;
    setIsCloning(true);
    try {
      const response = await api.post(`/sales/${id}/clone`);
      const newSaleId = response.data.id;
      showToast('Sale cloned! Redirecting...', 'success');
      setTimeout(() => {
        router.push(`/organizer/edit-sale/${newSaleId}`);
      }, 500);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to clone sale', 'error');
    } finally {
      setIsCloning(false);
    }
  };

  const handleToggleSaleStatus = async () => {
    if (!id || !sale) return;
    setIsTogglingStatus(true);
    try {
      const newStatus = sale.status === 'PUBLISHED' ? 'ENDED' : 'PUBLISHED';

      // #132: À La Carte — Show modal if trying to publish and on SIMPLE tier
      if (newStatus === 'PUBLISHED' && sale.status === 'DRAFT' && user?.organizerTier === 'SIMPLE') {
        setShowAlaCarteModal(true);
        setIsTogglingStatus(false);
        return;
      }

      const confirmMessage = sale.status === 'PUBLISHED'
        ? 'Close this sale early? You can reopen it later from your dashboard.'
        : sale.status === 'ENDED'
        ? 'Reopen this sale? It will become visible to shoppers again.'
        : 'Make this sale visible to shoppers on the map?';

      if (!window.confirm(confirmMessage)) {
        setIsTogglingStatus(false);
        return;
      }

      await api.patch(`/sales/${id}/status`, { status: newStatus });

      // Show celebration only when publishing (transitioning to PUBLISHED)
      if (newStatus === 'PUBLISHED') {
        setShowPublishCelebration(true);
        showSurvey('OG-1');
      } else {
        showToast('Sale is now hidden', 'success');
        // Refetch the sale data
        await new Promise(resolve => setTimeout(resolve, 500));
        router.push(`/organizer/edit-sale/${id}`);
      }
    } catch (error: any) {
      // Feature #249: Handle concurrent sales tier limit (409)
      if (error.response?.status === 409 && error.response?.data?.code === 'TIER_LIMIT_EXCEEDED') {
        setTierLimitError(error.response.data);
        showToast(error.response.data.message, 'error');
      } else {
        showToast(error.response?.data?.message || 'Failed to update sale status', 'error');
      }
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handlePublishCelebrationClose = () => {
    setShowPublishCelebration(false);
    // Refetch and redirect after celebration
    setTimeout(() => {
      router.push(`/organizer/edit-sale/${id}`);
    }, 300);
  };

  // #132: À La Carte — Update sale status after successful checkout
  const handleAlaCarteSuccess = async () => {
    if (!id || !sale) return;
    try {
      await api.patch(`/sales/${id}/status`, { status: 'PUBLISHED' });
      setShowAlaCarteModal(false);
      setShowPublishCelebration(true);
      showSurvey('OG-1');
    } catch (error: any) {
      // Feature #249: Handle concurrent sales tier limit (409)
      if (error.response?.status === 409 && error.response?.data?.code === 'TIER_LIMIT_EXCEEDED') {
        setTierLimitError(error.response.data);
        showToast(error.response.data.message, 'error');
      } else {
        showToast(error.response?.data?.message || 'Failed to publish sale', 'error');
      }
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edit Sale - FindA.Sale</title>
      </Head>

      <PublishCelebration
        isOpen={showPublishCelebration}
        saleName={sale?.title || ''}
        saleId={String(id) || ''}
        salePhotoUrl={sale?.photoUrls?.[0] || null}
        onClose={handlePublishCelebrationClose}
      />

      {/* #132: À La Carte Publish Modal */}
      <AlaCartePublishModal
        isOpen={showAlaCarteModal}
        saleId={String(id) || ''}
        saleName={sale?.title || ''}
        onClose={() => setShowAlaCarteModal(false)}
        onPublishSuccess={handleAlaCarteSuccess}
      />

      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Feature #249: Tier limit error modal */}
          {tierLimitError && (
            <div className="mb-8 p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">
                Concurrent Sales Limit Reached
              </h3>
              <p className="text-amber-800 dark:text-amber-200 mb-4">
                You're currently running <strong>{tierLimitError.current}</strong> active sale{tierLimitError.current !== 1 ? 's' : ''}.
                Your <strong>{tierLimitError.tier}</strong> tier allows <strong>{tierLimitError.limit}</strong> concurrent sale{tierLimitError.limit !== 1 ? 's' : ''} at a time.
              </p>
              <Link
                href={tierLimitError.upgradeUrl}
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Upgrade to PRO
              </Link>
              <button
                onClick={() => setTierLimitError(null)}
                className="ml-4 text-amber-700 dark:text-amber-300 font-semibold underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 min-w-0 truncate">
              Edit Sale {sale?.status === 'PUBLISHED' ? '(Live)' : sale?.status === 'ENDED' ? '(Ended)' : '(Draft)'}
            </h1>
            {sale && (
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                {sale.status === 'PUBLISHED' ? (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-semibold flex-shrink-0">
                    ● LIVE
                  </span>
                ) : sale.status === 'ENDED' ? (
                  <span className="inline-flex items-center gap-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full px-3 py-1 text-sm font-semibold flex-shrink-0">
                    ✓ ENDED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full px-3 py-1 text-sm font-semibold flex-shrink-0">
                    ◌ DRAFT
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleToggleSaleStatus}
                  disabled={isTogglingStatus}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded disabled:opacity-50 font-medium flex-shrink-0"
                >
                  {isTogglingStatus ? 'Updating...' : (sale.status === 'PUBLISHED' ? 'Close Early' : sale.status === 'ENDED' ? 'Reopen' : 'Publish')}
                </button>
                {sale.status === 'ENDED' && (
                  <a
                    href={`/organizer/settlement/${sale.id}`}
                    className="text-sm bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded font-medium flex-shrink-0 whitespace-nowrap"
                  >
                    Settle This Sale
                  </a>
                )}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-6">
            {/* Save button at top for quick access */}
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>

            {sale?.status === 'PUBLISHED' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
                  ⚠️ This sale is live to shoppers — changes will be visible immediately.
                </p>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-sm text-blue-700 dark:text-blue-200 mb-3">Want to create a similar sale?</p>
              <button
                type="button"
                onClick={handleCloneSale}
                disabled={isCloning}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded disabled:opacity-50"
              >
                {isCloning ? 'Duplicating...' : 'Duplicate This Sale'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Title</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Sale Type</label>
              <select
                name="saleType"
                value={formData.saleType}
                onChange={(e) => setFormData((prev) => ({ ...prev, saleType: e.target.value }))}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
              >
                <option value="ESTATE">Estate Sale</option>
                <option value="YARD">Yard Sale</option>
                <option value="AUCTION">Auction</option>
                <option value="FLEA_MARKET">Flea Market</option>
                <option value="CONSIGNMENT">Consignment</option>
                <option value="RETAIL">Retail Store</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">Description</label>
                <button
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={!formData.title.trim() || isGeneratingDesc}
                  className="text-xs bg-sage-600 hover:bg-sage-700 text-white py-1 px-3 rounded-full disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {isGeneratingDesc ? 'Generating\u2026' : '\u2728 Generate'}
                </button>
              </div>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
              />
            </div>

            {formData.saleType !== 'RETAIL' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Start Date</label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">End Date</label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Start Time</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">End Time</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                    />
                  </div>
                </div>
              </>
            )}

            {formData.saleType === 'RETAIL' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  ✓ Your retail store stays live automatically. Items stay listed until marked sold.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">ZIP</label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                />
              </div>
            </div>

            {/* Neighborhood \u2014 autocomplete input */}
            <div>
              <label htmlFor="neighborhood" className="block text-sm font-medium text-warm-700 mb-2">
                Neighborhood <span className="text-warm-400 font-normal">(optional — helps shoppers find you)</span>
              </label>
              <input
                id="neighborhood"
                type="text"
                name="neighborhood"
                list="neighborhood-list"
                value={formData.neighborhood}
                onChange={handleChange}
                placeholder="Start typing or select..."
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                autoComplete="off"
              />
              <datalist id="neighborhood-list">
                <option value="Downtown" />
                <option value="Eastown" />
                <option value="East Hills" />
                <option value="Heritage Hill" />
                <option value="Creston" />
                <option value="Westside" />
                <option value="Midtown" />
                <option value="Fulton Heights" />
                <option value="Alger Heights" />
                <option value="Ada Township" />
                <option value="Cascade" />
                <option value="Kentwood" />
                <option value="Wyoming" />
                <option value="Grandville" />
              </datalist>
            </div>

            {/* Feature 35: Front Door Locator — entrance/parking pin */}
            {sale?.lat && sale?.lng ? (
              <div className="mt-6">
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                  Entrance / Parking Pin <span className="text-warm-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <p className="text-sm text-warm-500 dark:text-gray-400 mb-3">
                  Drop a pin to show shoppers exactly where to park or enter — especially useful for large properties.
                </p>
                <EntrancePinPicker
                  saleAddress={formData.address}
                  saleLat={sale.lat}
                  saleLng={sale.lng}
                  initialEntranceLat={formData.entranceLat}
                  initialEntranceLng={formData.entranceLng}
                  initialEntranceNote={formData.entranceNote}
                  onChange={(data) => {
                    setFormData(prev => ({
                      ...prev,
                      entranceLat: data.entranceLat,
                      entranceLng: data.entranceLng,
                      entranceNote: data.entranceNote ?? '',
                    }));

                    // Check distance from sale address
                    if (data.entranceLat !== undefined && data.entranceLng !== undefined && sale?.lat && sale?.lng) {
                      const isTooFar = checkEntrancePinDistance(data.entranceLat, data.entranceLng, sale.lat, sale.lng);
                      setEntrancePinTooFar(isTooFar);
                    } else {
                      setEntrancePinTooFar(false);
                    }
                  }}
                />

                {/* Distance warning banner */}
                {entrancePinTooFar && (
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ Entrance pin is far from the sale address. Make sure this is correct.
                    </p>
                  </div>
                )}
              </div>
            ) : isAutoGeocodingOnLoad ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-blue-800 dark:text-blue-200 font-semibold">
                  Finding location coordinates...
                </p>
              </div>
            ) : geocodingAttempted ? (
              <div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mb-4">
                  <p className="text-yellow-800 dark:text-yellow-200 font-semibold">
                    Coordinates not found — try one of the options below.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGeocodingAttempted(false);
                      attemptGeocode(formData.address, formData.city, formData.state, formData.zip);
                    }}
                    className="text-sm bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded mt-3"
                  >
                    Retry Geocoding
                  </button>
                </div>

                {/* Option A: Use current location button */}
                <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold mb-3">
                    Quick setup options:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        showToast('Geolocation not supported', 'error');
                        return;
                      }
                      setIsSettingLocation(true);
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          try {
                            const { latitude: lat, longitude: lng } = pos.coords;
                            await api.patch(`/sales/${id}/coordinates`, { lat, lng });
                            showToast('Location set', 'success');
                            setGeocodingAttempted(false);
                            refetch();
                          } catch (error: any) {
                            showToast(error.response?.data?.message || 'Failed to save location', 'error');
                          } finally {
                            setIsSettingLocation(false);
                          }
                        },
                        () => {
                          showToast('Location access denied', 'error');
                          setIsSettingLocation(false);
                        }
                      );
                    }}
                    disabled={isSettingLocation}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors mb-3"
                  >
                    {isSettingLocation ? 'Getting location...' : '📍 Use my current location'}
                  </button>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Uses your device's GPS to set the sale location
                  </p>
                </div>

                {/* Option B: Address suggestions (if available) */}
                {suggestions.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold mb-3">
                      Did we find your address?
                    </p>
                    <div className="space-y-2">
                      {suggestions.map((suggestion, idx) => {
                        const truncatedName = suggestion.displayName.length > 60
                          ? suggestion.displayName.substring(0, 60) + '...'
                          : suggestion.displayName;
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {truncatedName}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setIsSettingLocation(true);
                                  const lat = parseFloat(suggestion.lat);
                                  const lng = parseFloat(suggestion.lng);
                                  await api.patch(`/sales/${id}/coordinates`, { lat, lng });
                                  showToast('Location set', 'success');
                                  setGeocodingAttempted(false);
                                  setSuggestions([]);
                                  refetch();
                                } catch (error: any) {
                                  showToast(error.response?.data?.message || 'Failed to save location', 'error');
                                } finally {
                                  setIsSettingLocation(false);
                                }
                              }}
                              disabled={isSettingLocation}
                              className="text-xs bg-amber-600 hover:bg-amber-700 text-white py-1 px-3 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              Use This
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Feature #84: Approach Notes — day-of info for shoppers */}
            <div className="border-t border-warm-300 dark:border-gray-600 pt-6 mt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">
                  Day-of Approach Notes <span className="text-warm-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                {sale?.status === 'PUBLISHED' && (
                  <button
                    type="button"
                    onClick={handleSendApproachNotification}
                    disabled={!formData.notes.trim() || isSendingApproachNotification}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded disabled:opacity-40 transition-colors"
                  >
                    {isSendingApproachNotification ? 'Sending...' : '📢 Notify Shoppers'}
                  </button>
                )}
              </div>
              <p className="text-sm text-warm-500 dark:text-gray-400 mb-3">
                Share parking info, entrance location, hours reminders, or other day-of details with shoppers who have saved your sale.
              </p>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g., Park in back lot. Enter through the red door. We open at 8 AM sharp."
                rows={4}
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-warm-900 dark:text-gray-100 placeholder-warm-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Cover Photo Manager */}
            <div className="border-t border-warm-300 dark:border-gray-600 pt-6 mt-6">
              <SaleCoverPhotoManager
                saleId={id as string}
                initialPhotoUrl={formData.photoUrls[0]}
                onPhotoChange={(url) =>
                  setFormData({ ...formData, photoUrls: url ? [url] : [] })
                }
              />
            </div>

            {/* Feature #91: Auto-Markdown (Smart Clearance) */}
            <div className="border-t border-warm-300 dark:border-gray-600 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Advanced Settings</h3>

              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="markdownEnabled"
                    name="markdownEnabled"
                    checked={formData.markdownEnabled}
                    onChange={handleMarkdownToggle}
                    className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded cursor-pointer"
                  />
                  <label htmlFor="markdownEnabled" className="cursor-pointer flex flex-col">
                    <span className="text-sm font-medium text-warm-700 dark:text-gray-300">
                      Enable Auto-Markdown for this sale
                    </span>
                    <span className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                      Items will be automatically discounted 50% on Day 2, 75% on Day 3 of your sale
                    </span>
                  </label>
                </div>

                {formData.markdownEnabled && (
                  <div className="ml-7">
                    <label htmlFor="markdownFloor" className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
                      Price floor (minimum price, $)
                    </label>
                    <input
                      type="number"
                      id="markdownFloor"
                      name="markdownFloor"
                      min="0"
                      step="0.01"
                      value={formData.markdownFloor ?? ''}
                      onChange={handleMarkdownFloorChange}
                      placeholder="e.g., 5.00 (optional)"
                      className="w-full max-w-xs px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-warm-100"
                    />
                    <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                      Items will never be discounted below this price
                    </p>
                  </div>
                )}

                <div className="flex items-start space-x-3 pt-4">
                  <input
                    type="checkbox"
                    id="holdsEnabled"
                    name="holdsEnabled"
                    checked={formData.holdsEnabled}
                    onChange={(e) => setFormData({ ...formData, holdsEnabled: e.target.checked })}
                    className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded cursor-pointer"
                  />
                  <label htmlFor="holdsEnabled" className="cursor-pointer flex flex-col">
                    <span className="text-sm font-medium text-warm-700 dark:text-gray-300">
                      Allow item holds for this sale
                    </span>
                    <span className="text-xs text-warm-500 dark:text-gray-400 mt-1">
                      Shoppers can reserve items for pickup. Holds expire automatically.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Feature #85: Treasure Hunt QR Manager */}
            <TreasureHuntQRManager
              saleId={id as string}
              enabled={formData.treasureHuntEnabled}
              onEnabledChange={(enabled) =>
                setFormData({ ...formData, treasureHuntEnabled: enabled })
              }
            />

            {/* Pickup Scheduling Section */}
            {id && <div className="mt-4"><PickupSlotManager saleId={id as string} /></div>}

            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditSalePage;
