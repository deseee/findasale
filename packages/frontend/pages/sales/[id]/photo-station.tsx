import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';

interface PhotoStationScanResponse {
  alreadyScanned: boolean;
  xpAwarded: number;
  shareXp?: number;
  message: string;
}

interface ShareLinkResponse {
  id: string;
  code: string;
  url: string;
  totalClicks: number;
  uniqueClicks: number;
  totalXpAwarded: number;
}

interface GeolocationCoords {
  lat: number;
  lng: number;
}

interface Sale {
  id: string;
  title: string;
}

const PhotoStationPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [hasScanned, setHasScanned] = useState(false);
  const [scanData, setScanData] = useState<PhotoStationScanResponse | null>(null);
  const [sharedOnce, setSharedOnce] = useState(false);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);

  // Fetch sale data
  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}`);
      return response.data as Sale;
    },
    enabled: !!id,
  });

  // Fetch or generate share link for this sale
  const { data: shareLink, isLoading: shareLinkLoading } = useQuery({
    queryKey: ['share-link', id],
    queryFn: async () => {
      const response = await api.post(`/sales/${id}/share-link`, {});
      return response.data as ShareLinkResponse;
    },
    enabled: !!id && !!user && hasScanned && !scanData?.alreadyScanned,
  });

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (coords: GeolocationCoords | null) => {
      const response = await api.post(`/sales/${id}/photo-ops/photo-station-scan`, coords || {});
      return response.data as PhotoStationScanResponse;
    },
    onSuccess: (data) => {
      setScanData(data);
      setHasScanned(true);
      if (data.alreadyScanned) {
        showToast("You've already scanned this photo station.", 'info');
      } else if (data.xpAwarded > 0) {
        showToast(
          `You earned ${data.xpAwarded} XP!`,
          'success'
        );
      }
    },
    onError: (error: any) => {
      showToast(
        error.response?.data?.message || 'Failed to scan photo station',
        'error'
      );
    },
  });

  // Request geolocation and auto-scan on mount
  useEffect(() => {
    if (id && user && !hasScanned && !geolocationDenied && !requestingLocation) {
      setRequestingLocation(true);

      if (!navigator.geolocation) {
        // No geolocation support — cannot scan, show warning
        setRequestingLocation(false);
        setGeolocationDenied(true);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setRequestingLocation(false);
          scanMutation.mutate({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          setRequestingLocation(false);
          // User denied location or error occurred — cannot scan without coords
          setGeolocationDenied(true);
        }
      );
    }
  }, [id, user, hasScanned, geolocationDenied, requestingLocation]);

  const isLoading = authLoading || saleLoading || scanMutation.isPending || requestingLocation || shareLinkLoading;

  const handleRetryGeolocation = () => {
    setGeolocationDenied(false);
    setRequestingLocation(true);
  };

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleShare = async () => {
    if (!user || !scanData || !shareLink) return;

    const shareUrl = shareLink.url;
    const shareText = `Check out this sale on FindA.Sale: ${sale?.title || 'A great sale'}`;

    try {
      // Try native Web Share API first
      if (navigator.share) {
        await navigator.share({
          title: 'FindA.Sale',
          text: shareText,
          url: shareUrl,
        });
        // Share succeeded — XP awarded server-side on click
        setSharedOnce(true);
        showToast('Link shared! Earn XP when others click it.', 'success');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        setSharedOnce(true);
        showToast('Link copied! Share it to earn XP.', 'success');
      }
    } catch (error: any) {
      // User cancelled share dialog — don't set sharedOnce, don't show error
      if (error?.name === 'AbortError') return;
      console.error('Share failed:', error);
      showToast('Failed to share', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Photo Station | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Back Link */}
          <Link
            href={`/sales/${id}`}
            className="inline-flex items-center text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200 mb-6 font-medium"
          >
            ← Back to Sale
          </Link>

          {/* Main Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-8 text-white">
              <div className="text-5xl mb-3">📸</div>
              <h1 className="text-3xl font-bold">Share Your Find</h1>
              {sale && (
                <p className="text-amber-50 text-sm mt-2 font-medium">
                  {sale.title}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              {geolocationDenied && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">📍</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Location Access Required</h3>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                        Location access is required to earn XP at this Photo Station. Tap below to allow location access.
                      </p>
                      <button
                        onClick={handleRetryGeolocation}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Allow Location
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
                </div>
              ) : scanData ? (
                <>
                  {scanData.alreadyScanned ? (
                    <div className="text-center space-y-3">
                      <div className="text-5xl">✅</div>
                      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                        Already Scanned
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        You've already earned XP at this photo station.
                      </p>
                      <div className="pt-2 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <p className="text-sm text-amber-900 dark:text-amber-100">
                          Come back next time for more rewards!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Success Message */}
                      <div className="text-center">
                        <div className="text-5xl mb-3">🎉</div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                          You Earned {scanData.xpAwarded} XP!
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                          Now share the sale to earn {scanData.shareXp} more XP
                        </p>
                      </div>

                      {/* XP Display */}
                      <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl text-center border border-amber-200 dark:border-amber-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          XP Earned at Station
                        </p>
                        <p className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                          +{scanData.xpAwarded}
                        </p>
                      </div>

                      {/* Share Button */}
                      <button
                        onClick={handleShare}
                        disabled={sharedOnce || !shareLink}
                        className={`w-full px-6 py-4 font-semibold rounded-xl transition flex items-center justify-center gap-2 ${
                          sharedOnce || !shareLink
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white'
                        }`}
                      >
                        {sharedOnce ? '✓ Shared' : 'Share Your Link (+2 XP per verified click)'}
                      </button>

                      {/* Share Link Stats */}
                      {shareLink && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Clicks</p>
                            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                              {shareLink.uniqueClicks}
                            </p>
                          </div>
                          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">XP Earned</p>
                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                              +{shareLink.totalXpAwarded}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Info */}
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Tip:</strong> Share on social media, text, or email to spread the word and earn rewards!
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Back to Sale Button */}
                  <Link
                    href={`/sales/${id}`}
                    className="w-full block text-center px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold rounded-xl transition"
                  >
                    Back to Sale
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PhotoStationPage;
