import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import api from '../../../lib/api';
import Head from 'next/head';

interface CheckInResponse {
  success: boolean;
  xpEarned: number;
  alreadyCheckedIn: boolean;
  saleTitle: string;
  guildXp?: number;
  explorerRank?: string;
  rankIncreased?: boolean;
  queuePosition?: number | null;
}

const CheckInPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/sales/${id}/checkin`);
    }
  }, [user, authLoading, id, router]);

  // Call check-in endpoint on mount
  useEffect(() => {
    if (!id || typeof id !== 'string' || !user) {
      return;
    }

    const performCheckIn = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await api.post(`/sales/${id}/checkin`);
        const data = response.data as CheckInResponse;

        setCheckInResult(data);

        // Show toast notification
        if (data.xpEarned > 0) {
          showToast(`Checked in! +${data.xpEarned} XP earned`, 'success');
        } else if (data.alreadyCheckedIn) {
          showToast('Already checked in today', 'info');
        }
      } catch (err: any) {
        const message = err.response?.data?.message || 'Failed to check in';
        setError(message);
        showToast(message, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    performCheckIn();
  }, [id, user, showToast]);

  const handleRetry = () => {
    if (id && typeof id === 'string') {
      router.push(`/sales/${id}/checkin`);
    }
  };

  const handleBrowseItems = () => {
    if (id) {
      router.push(`/sales/${id}`);
    }
  };

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>Checking in...</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
          <div className="text-center">
            <div className="inline-block">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
            <p className="mt-4 text-lg font-semibold text-warm-900 dark:text-warm-100">
              Checking you in...
            </p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Head>
          <title>Check In Error</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                Check In Failed
              </h1>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                {error}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => router.push('/sales')}
                  className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Back to Sales
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!checkInResult) {
    return null;
  }

  const isNewCheckIn = checkInResult.xpEarned > 0 && !checkInResult.alreadyCheckedIn;

  return (
    <>
      <Head>
        <title>
          {isNewCheckIn ? '✅ Checked In!' : 'Already Checked In'} — {checkInResult.saleTitle}
        </title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            {isNewCheckIn ? (
              <>
                <div className="text-6xl mb-4">✅</div>
                <h1 className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                  Checked In!
                </h1>
                <p className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-1">
                  +{checkInResult.xpEarned} XP Earned
                </p>
                {checkInResult.rankIncreased && (
                  <p className="text-lg text-amber-600 dark:text-amber-400 mb-2">
                    🎉 Rank up: {checkInResult.explorerRank}
                  </p>
                )}
                {checkInResult.queuePosition != null && (
                  <p className="text-base text-warm-700 dark:text-warm-300 mb-2">
                    🎟️ You&apos;re #{checkInResult.queuePosition} in line
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">ℹ️</div>
                <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                  Already Checked In
                </h1>
                <p className="text-warm-600 dark:text-warm-400 mb-4">
                  Come back tomorrow to earn more XP!
                </p>
              </>
            )}

            <p className="text-sm text-warm-600 dark:text-warm-400 mb-6">
              {checkInResult.saleTitle}
            </p>

            <button
              onClick={handleBrowseItems}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
            >
              Browse Items →
            </button>
            <button
              onClick={() => router.push('/sales')}
              className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Back to Sales
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

(CheckInPage as any).getLayout = (page: React.ReactNode) => page;

export default CheckInPage;
