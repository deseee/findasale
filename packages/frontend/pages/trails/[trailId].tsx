/**
 * Public Trail Detail & Check-in Page
 *
 * Shoppers view trail details, check in at stops with GPS, upload photos for bonus XP.
 * Displays progress bar, stop list, check-in status, and completion banner.
 */

import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Layout from '../../components/Layout';
import Skeleton from '../../components/Skeleton';
import Link from 'next/link';

interface TrailStop {
  id: string;
  stopName: string;
  stopType: string; // SALE, RESALE_SHOP, CAFE, LANDMARK, PARTNER
  address: string;
  latitude: number;
  longitude: number;
  baseXp: number;
  order: number;
  organizer_note?: string;
}

interface Trail {
  id: string;
  name: string;
  description?: string;
  minStopsRequired: number;
  stops: TrailStop[];
  isFeatured?: boolean;
  completionCount?: number;
  organizer?: {
    businessName?: string;
  };
  userProgress?: {
    [stopId: string]: {
      baseXp: number;
      photoXp: number;
    };
  };
}

const STOP_TYPE_ICONS: Record<string, string> = {
  SALE: '🏪',
  RESALE_SHOP: '🏬',
  CAFE: '☕',
  LANDMARK: '📍',
  PARTNER: '🤝',
};

export default function TrailDetailPage() {
  const router = useRouter();
  const { trailId } = router.query;
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isClient, setIsClient] = useState(false);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [checkingInStopId, setCheckingInStopId] = useState<string | null>(null);
  const [uploadingPhotoStopId, setUploadingPhotoStopId] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string>('');

  // Hydration guard
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch trail details
  const { data: trail, isLoading: trailLoading } = useQuery<Trail>({
    queryKey: ['trail', trailId],
    queryFn: async () => {
      const res = await api.get(`/trails/${trailId}`);
      return res.data;
    },
    enabled: !!trailId && isClient,
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async ({
      stopId,
      latitude,
      longitude,
    }: {
      stopId: string;
      latitude: number;
      longitude: number;
    }) => {
      const res = await api.post(`/trails/${trailId}/stops/${stopId}/checkin`, {
        latitude,
        longitude,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trail', trailId] });
      showToast(`+${data.xpAwarded} XP earned!`, 'success');
      if (data.completionTriggered) {
        showToast(
          `🎉 Trail Complete! +${data.completionBonusXp} completion bonus XP!`,
          'success'
        );
      }
      setCheckingInStopId(null);
      setActiveStopId(null);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Check-in failed. Try again.';
      showToast(message, 'error');
      setCheckingInStopId(null);
    },
  });

  // Photo upload mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async ({
      stopId,
      cloudinaryUrl,
      cloudinaryId,
    }: {
      stopId: string;
      cloudinaryUrl: string;
      cloudinaryId: string;
    }) => {
      const res = await api.post(
        `/trails/${trailId}/stops/${stopId}/photo`,
        { cloudinaryUrl, cloudinaryId }
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trail', trailId] });
      showToast(
        `Photo posted to your Loot Legend! +${data.xpAwarded} XP 📸`,
        'success'
      );
      setUploadingPhotoStopId(null);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || 'Photo upload failed. Try again.';
      showToast(message, 'error');
      setUploadingPhotoStopId(null);
    },
  });

  // Handle check-in tap
  const handleCheckIn = async (stopId: string) => {
    if (!user) {
      showToast('Sign in to check in at stops', 'info');
      router.push('/login');
      return;
    }

    setCheckingInStopId(stopId);
    setGettingLocation(true);
    setLocationError('');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true,
        });
      });

      await checkInMutation.mutateAsync({
        stopId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (err: any) {
      if (err.code === 1) {
        setLocationError('Enable location access to check in');
      } else if (err.code === 3) {
        setLocationError('Location request timed out. Try again.');
      } else {
        setLocationError('Could not get your location. Try again.');
      }
      setCheckingInStopId(null);
    } finally {
      setGettingLocation(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    stopId: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhotoStopId(stopId);

    try {
      // Step 1: Upload to Cloudinary via signed URL endpoint
      const formData = new FormData();
      formData.append('photo', file);

      const uploadRes = await api.post('/upload/item-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const cloudinaryUrl = uploadRes.data.url;
      const cloudinaryId = uploadRes.data.publicId;

      // Step 2: Post the photo to the trail
      await uploadPhotoMutation.mutateAsync({
        stopId,
        cloudinaryUrl,
        cloudinaryId,
      });
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Upload failed';
      showToast(message, 'error');
      setUploadingPhotoStopId(null);
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isClient) {
    return null;
  }

  if (trailLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-12 mb-6" />
          <Skeleton className="h-32 mb-8" />
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 mb-4" />
          ))}
        </div>
      </Layout>
    );
  }

  if (!trail) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
            Trail not found
          </h1>
          <Link href="/trails" className="text-amber-600 hover:text-amber-700">
            Back to Trails
          </Link>
        </div>
      </Layout>
    );
  }

  const userProgress = trail.userProgress || {};
  const completedStopIds = Object.keys(userProgress);
  const completionPercentage = (completedStopIds.length / trail.stops.length) * 100;
  const isCompleted = completedStopIds.length >= trail.minStopsRequired;
  const totalXpEarned = Object.values(userProgress).reduce(
    (sum, progress: any) => sum + (progress.baseXp || 0) + (progress.photoXp || 0),
    0
  );

  return (
    <Layout>
      <Head>
        <title>{trail.name} | Treasure Trails | FindA.Sale</title>
        <meta name="description" content={trail.description || trail.name} />
      </Head>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                {trail.name}
              </h1>
              {trail.description && (
                <p className="text-lg text-warm-600 dark:text-warm-400">
                  {trail.description}
                </p>
              )}
            </div>
            {trail.isFeatured && (
              <div className="flex-shrink-0 px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-100 text-sm font-semibold rounded-full">
                ⭐ Featured
              </div>
            )}
          </div>

          {trail.organizer?.businessName && (
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              By {trail.organizer.businessName}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg mb-6">
            <div>
              <p className="text-xs text-warm-600 dark:text-warm-400">Stops</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                {trail.stops.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-warm-600 dark:text-warm-400">Est. XP</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                +{trail.stops.length * 3 + 5}
              </p>
            </div>
            <div>
              <p className="text-xs text-warm-600 dark:text-warm-400">Completed</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                {trail.completionCount || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-warm-700 dark:text-warm-300">
              Progress
            </p>
            <p className="text-sm text-warm-600 dark:text-warm-400">
              {completedStopIds.length}/{trail.stops.length} stops
            </p>
          </div>
          <div className="w-full bg-warm-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Completion banner */}
        {isCompleted && (
          <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
              🎉 Trail Complete!
            </p>
            <p className="text-green-800 dark:text-green-200">
              You earned <strong>{totalXpEarned} XP</strong> total on this trail.
            </p>
          </div>
        )}

        {/* Auth prompt if not logged in */}
        {!user && (
          <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-blue-900 dark:text-blue-100 mb-3">
              Sign in to check in at stops and earn XP
            </p>
            <Link
              href="/login"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
            >
              Sign In
            </Link>
          </div>
        )}

        {/* Stops list */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">
            Stops
          </h2>

          {trail.stops.map((stop, idx) => {
            const isCheckedIn = completedStopIds.includes(stop.id);
            const hasPhoto = userProgress[stop.id]?.photoXp > 0;

            return (
              <div
                key={stop.id}
                className="border border-warm-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800"
              >
                {/* Stop header */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">
                        {STOP_TYPE_ICONS[stop.stopType] || '📍'}
                      </span>
                      <div>
                        <p className="font-bold text-warm-900 dark:text-warm-100">
                          {stop.order + 1}. {stop.stopName}
                        </p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">
                          {stop.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Check-in status badge */}
                  {isCheckedIn ? (
                    <div className="flex-shrink-0 px-3 py-1.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-100 text-sm font-semibold rounded-full flex items-center gap-1">
                      ✓ Checked in
                    </div>
                  ) : (
                    <div className="flex-shrink-0 px-3 py-1.5 bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-semibold rounded-full">
                      Not yet
                    </div>
                  )}
                </div>

                {/* XP display */}
                <div className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  <span className="font-semibold">
                    +{stop.baseXp} XP
                  </span>
                  {!isCheckedIn && (
                    <span className="ml-2">
                      (+{stop.baseXp + 2} XP with photo)
                    </span>
                  )}
                  {hasPhoto && (
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      📸 Photo posted
                    </span>
                  )}
                </div>

                {/* Check-in button or photo button */}
                <div className="flex gap-2">
                  {!isCheckedIn ? (
                    <>
                      <button
                        onClick={() => handleCheckIn(stop.id)}
                        disabled={
                          !user ||
                          checkingInStopId === stop.id ||
                          checkInMutation.isPending
                        }
                        className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white font-semibold rounded-lg transition disabled:cursor-not-allowed"
                      >
                        {checkingInStopId === stop.id && gettingLocation
                          ? 'Getting location...'
                          : checkingInStopId === stop.id
                            ? 'Checking in...'
                            : 'Check In'}
                      </button>
                      {locationError && checkingInStopId === stop.id && (
                        <div className="text-red-600 dark:text-red-400 text-sm mt-1">
                          {locationError}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setActiveStopId(activeStopId === stop.id ? null : stop.id)}
                        className="flex-1 px-4 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-100 font-semibold rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition"
                      >
                        {activeStopId === stop.id ? '▼ Hide' : '▲ Show Photo'}
                      </button>
                    </>
                  )}
                </div>

                {/* Photo upload section (shown if checked in and stop expanded) */}
                {isCheckedIn && activeStopId === stop.id && !hasPhoto && (
                  <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={
                        uploadingPhotoStopId === stop.id ||
                        uploadPhotoMutation.isPending
                      }
                      className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white font-semibold rounded-lg transition disabled:cursor-not-allowed"
                    >
                      {uploadingPhotoStopId === stop.id
                        ? 'Uploading...'
                        : 'Add Photo (+2 XP)'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e, stop.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Back link */}
        <div className="mt-12">
          <Link href="/trails" className="text-amber-600 hover:text-amber-700 font-semibold">
            ← Back to Trails
          </Link>
        </div>
      </div>
    </Layout>
  );
}
