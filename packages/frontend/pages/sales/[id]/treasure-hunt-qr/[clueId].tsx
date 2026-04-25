import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Skeleton from '../../../../components/Skeleton';
import Head from 'next/head';

interface Clue {
  id: string;
  clueText: string;
  hintPhoto?: string;
  category?: string;
}

interface FoundResponse {
  xpEarned: number;
  bonus: number;
  completed: boolean;
  totalProgress: string;
}

const CluePage = () => {
  const router = useRouter();
  const { id, clueId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const hasAutoClaimedRef = useRef(false);
  const [geofenceBlocked, setGeofenceBlocked] = useState(false);

  // Fetch clue details
  const { data: clue, isLoading: clueLoading } = useQuery({
    queryKey: ['treasureHuntQRClue', id, clueId],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}/treasure-hunt-qr/${clueId}`);
      return response.data as Clue;
    },
    enabled: !!id && !!clueId && !!user,
  });

  // Mark found mutation
  const foundMutation = useMutation({
    mutationFn: async () => {
      // Attempt to get geolocation (best-effort, non-blocking)
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch (err) {
          // Geolocation denied or unavailable — proceed without coordinates
          console.info('Geolocation unavailable, proceeding without coordinates');
        }
      }

      const response = await api.post(
        `/sales/${id}/treasure-hunt-qr/${clueId}/found`,
        { latitude, longitude }
      );
      return response.data as FoundResponse;
    },
    onSuccess: (data) => {
      if (data.xpEarned > 0) {
        if (data.completed && data.bonus > 0) {
          showToast(
            `🎉 You earned ${data.xpEarned} XP! Treasure Hunt Complete! +${data.bonus} bonus XP!`,
            'success'
          );
        } else {
          showToast(
            `✨ You earned ${data.xpEarned} XP! (${data.totalProgress} clues found)`,
            'success'
          );
        }
      } else {
        showToast(`You already found this clue! (${data.totalProgress})`, 'info');
      }
      // Auto-redirect after 2.5 seconds
      setTimeout(() => {
        router.push(`/sales/${id}`);
      }, 2500);
    },
    onError: (error: any) => {
      const statusCode = error.response?.status;
      if (statusCode === 403) {
        setGeofenceBlocked(true);
        showToast('Location required — tap "Try again" to allow location access', 'error');
      } else if (statusCode === 409) {
        showToast('You already found this one!', 'info');
        setTimeout(() => {
          router.push(`/sales/${id}`);
        }, 1500);
      } else {
        showToast(
          error.response?.data?.message || 'Failed to mark clue as found',
          'error'
        );
      }
    },
  });

  // Auto-claim on page load (after clue loads)
  useEffect(() => {
    if (!clueLoading && clue && !hasAutoClaimedRef.current && !foundMutation.isPending) {
      hasAutoClaimedRef.current = true;
      foundMutation.mutate();
    }
  }, [clueLoading, clue]);

  const isLoading = authLoading || clueLoading;

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  return (
    <>
      <Head>
        <title>Treasure Hunt Clue | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Back Link */}
          <Link href={`/sales/${id}`}>
            <a className="inline-flex items-center text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 mb-4">
              ← Back to Sale
            </a>
          </Link>

          {/* Main Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white">
              <h1 className="text-2xl font-bold mb-2">🎯 Treasure Hunt Clue</h1>
              <p className="text-amber-100 text-sm">Find the item matching this clue</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {isLoading ? (
                <>
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-36 w-full" />
                </>
              ) : clue ? (
                <>
                  {/* Clue Text */}
                  <div>
                    <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                      The Clue
                    </h2>
                    <p className="text-base text-warm-700 dark:text-gray-300 leading-relaxed">
                      {clue.clueText}
                    </p>
                  </div>

                  {/* Hint Photo */}
                  {clue.hintPhoto && (
                    <div>
                      <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                        Hint Photo
                      </h3>
                      <img
                        src={clue.hintPhoto}
                        alt="Hint"
                        className="w-full rounded-lg border border-warm-200 dark:border-gray-700"
                      />
                    </div>
                  )}

                  {/* Category Badge */}
                  {clue.category && (
                    <div>
                      <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                        Category: {clue.category}
                      </span>
                    </div>
                  )}

                  {/* Recording find status */}
                  {foundMutation.isPending && (
                    <div className="w-full bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/10 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 font-semibold py-3 px-4 rounded-lg flex items-center justify-center">
                      <span className="inline-block animate-spin mr-2">⚙️</span>
                      Recording your find...
                    </div>
                  )}

                  {/* Geofence retry — fires when 403 returned (location denied or out of range) */}
                  {geofenceBlocked && !foundMutation.isPending && (
                    <div className="w-full bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-red-900 dark:text-red-200">
                        📍 We need your location to confirm you're at the sale. Make sure location is allowed in your browser, then try again.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setGeofenceBlocked(false);
                          foundMutation.mutate();
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        📍 Allow location &amp; try again
                      </button>
                    </div>
                  )}

                  {/* Cross-promo to Photo Station */}
                  <Link href={`/sales/${id}/photo-station`} className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:underline mt-3">
                    📸 Visit the Photo Station for bonus XP →
                  </Link>

                  {/* Instructions */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      💡 <strong>Hint:</strong> Look carefully around the sale venue. We're recording your find automatically!
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-warm-600 dark:text-gray-400">
                    Clue not found. It may have been deleted.
                  </p>
                  <Link href={`/sales/${id}`}>
                    <a className="inline-block mt-4 text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold">
                      Return to Sale
                    </a>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Footer Help */}
          <div className="mt-6 text-center text-sm text-warm-600 dark:text-gray-400">
            <p>🏆 Earn XP by finding treasure hunt items!</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default CluePage;
