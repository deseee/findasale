import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';

interface PhotoStationScanResponse {
  alreadyScanned: boolean;
  xpAwarded: number;
  shareXp: number;
  message: string;
}

const PhotoStationPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [hasScanned, setHasScanned] = useState(false);
  const [scanData, setScanData] = useState<PhotoStationScanResponse | null>(null);

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/sales/${id}/photo-station-scan`, {});
      return response.data as PhotoStationScanResponse;
    },
    onSuccess: (data) => {
      setScanData(data);
      setHasScanned(true);
      if (data.alreadyScanned) {
        showToast("You've already scanned this photo station.", 'info');
      } else if (data.xpAwarded > 0) {
        showToast(
          `🎉 You earned ${data.xpAwarded} XP! Share to earn ${data.shareXp} more.`,
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

  // Auto-scan on mount
  useEffect(() => {
    if (id && user && !hasScanned) {
      scanMutation.mutate();
    }
  }, [id, user, hasScanned]);

  const isLoading = authLoading || scanMutation.isPending;

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleShare = async () => {
    if (!user || !scanData) return;

    // Award share XP via existing share flow
    try {
      await api.post('/xp/share', {
        saleId: id,
        platform: 'social',
      });
      showToast(`✨ You earned ${scanData.shareXp} XP for sharing!`, 'success');
    } catch (error: any) {
      console.error('Share XP award failed:', error);
      showToast(
        error.response?.data?.message || 'Failed to award share XP',
        'error'
      );
    }
  };

  return (
    <>
      <Head>
        <title>Photo Station | FindA.Sale</title>
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
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white">
              <h1 className="text-2xl font-bold">Photo Station</h1>
              <p className="text-emerald-50 text-sm mt-1">
                Snap a photo and share it with the community
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                </div>
              ) : scanData ? (
                <>
                  {/* Camera Icon */}
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center">
                      <span className="text-4xl">📸</span>
                    </div>
                  </div>

                  {/* Message */}
                  <div className="text-center">
                    {scanData.alreadyScanned ? (
                      <>
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                          Already Scanned
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                          You've already scanned this photo station. Come back later for more XP!
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                          ✨ You Earned {scanData.xpAwarded} XP!
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                          Share your photo to earn {scanData.shareXp} more XP!
                        </p>
                      </>
                    )}
                  </div>

                  {/* XP Display */}
                  {!scanData.alreadyScanned && (
                    <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          XP Earned
                        </p>
                        <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                          +{scanData.xpAwarded}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Share Button */}
                  {!scanData.alreadyScanned && (
                    <button
                      onClick={handleShare}
                      className="w-full mt-6 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-semibold rounded-lg transition"
                    >
                      Share Photo (+{scanData.shareXp} XP)
                    </button>
                  )}

                  {/* Back to Sale Button */}
                  <Link href={`/sales/${id}`}>
                    <a className="w-full block text-center px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold rounded-lg transition mt-2">
                      Back to Sale
                    </a>
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              📌 <strong>Tip:</strong> Photo stations are great places to capture memories. Scan the QR
              code to unlock XP rewards!
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PhotoStationPage;
