import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import api from '../../../lib/api';
import { getQuickPosition } from '../../../lib/geolocation';
import Head from 'next/head';
import { claimUnlockToasts } from '../../../components/MilestoneUnlockedToast'; // Sale Passport: shared toast dedupe so PassportUnlockManager never toasts the same stamp again
import { useMarkPassportSeen, UnlockedStamp, UnlockedMilestone } from '../../../hooks/useLoyaltyPassport';

interface CheckInResponse {
  success: boolean;
  xpEarned: number;
  alreadyCheckedIn: boolean;
  saleTitle: string;
  guildXp?: number;
  explorerRank?: string;
  rankIncreased?: boolean;
  queuePosition?: number | null;
  localLegendBadge?: string; // Feature #399: set when Local Legend badge earned
  // Sale Passport (2026-09-29): present only when this check-in unlocked a stamp or milestone
  passportUnlocks?: {
    stamps: { key: string; name: string; icon: string }[];
    milestones: { milestone: number; badgeType: string; name: string }[];
  };
}

const CheckInPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const markPassportSeen = useMarkPassportSeen();

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
        setErrorCode(null);

        // Location confirms you are at the sale. It is best effort: a denied prompt, no GPS or a slow
        // signal never blocks the check-in by itself (the server decides whether location is required).
        const position = await getQuickPosition(6000);
        const response = await api.post(
          `/sales/${id}/checkin`,
          position ? { latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy } : {}
        );
        const data = response.data as CheckInResponse;

        setCheckInResult(data);

        // Show toast notification
        if (data.xpEarned > 0) {
          showToast(`Checked in! +${data.xpEarned} XP earned`, 'success');
        } else if (data.alreadyCheckedIn) {
          showToast('Already checked in today', 'info');
        }

        // Feature #399: Local Legend badge toast
        if (data.localLegendBadge) {
          const zip = data.localLegendBadge.replace('LOCAL_LEGEND_', '');
          showToast(`📍 Local Legend unlocked for ${zip}!`, 'success');
        }

        // Sale Passport: the inline celebration below comes straight from the response. Mark these
        // unlocks as seen (claimUnlockToasts is the same dedupe PassportUnlockManager uses), so the
        // global watcher does not toast the same stamp a second time. Best effort, never blocks.
        const unlocks = data.passportUnlocks;
        if (unlocks && (unlocks.stamps.length > 0 || unlocks.milestones.length > 0)) {
          try {
            const unseenRes = await api.get('/loyalty/passport/unseen');
            const unseen = (unseenRes.data ?? { stamps: [], milestones: [] }) as {
              stamps: UnlockedStamp[];
              milestones: UnlockedMilestone[];
            };
            const stampKeys = unlocks.stamps.map((st) => st.key);
            const milestoneNums = unlocks.milestones.map((m) => m.milestone);
            const matchedStamps = (unseen.stamps ?? []).filter((st) => stampKeys.includes(st.key));
            const matchedMilestones = (unseen.milestones ?? []).filter((m) => milestoneNums.includes(m.milestone));
            const claimedStampIds = claimUnlockToasts(matchedStamps.map((st) => st.id));
            const claimedMilestoneIds = claimUnlockToasts(matchedMilestones.map((m) => `milestone-${m.milestone}`));
            if (claimedStampIds.length > 0 || claimedMilestoneIds.length > 0) {
              markPassportSeen.mutate({
                stampIds: claimedStampIds,
                milestones: matchedMilestones
                  .filter((m) => claimedMilestoneIds.includes(`milestone-${m.milestone}`))
                  .map((m) => m.milestone),
              });
            }
          } catch {
            // Non-fatal: worst case the global watcher toasts these once.
          }
        }
      } catch (err: any) {
        const message = err.response?.data?.message || 'Failed to check in';
        setError(message);
        setErrorCode(err.response?.data?.code ?? null);
        showToast(message, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    performCheckIn();
    // markPassportSeen is intentionally not a dependency (a new mutation object every render would re-run the check-in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, showToast, attempt]);

  const handleRetry = () => {
    // Re-run the check-in in place (pushing the same URL would not re-trigger it) and ask for location again.
    setAttempt((n) => n + 1);
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
            <p className="mt-2 text-sm text-warm-600 dark:text-warm-400 max-w-xs mx-auto">
              Your browser may ask to share your location. We use it only to confirm you are at the sale.
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
              {(errorCode === 'LOCATION_REQUIRED' || errorCode === 'OUT_OF_RANGE' || /location/i.test(error)) && (
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-6">
                  We check your location to make sure you are at the sale. If you skipped the prompt, allow
                  location access in your browser settings and tap Try Again.
                </p>
              )}
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
        <title>{`${isNewCheckIn ? '✅ Checked In!' : 'Already Checked In'}, ${checkInResult.saleTitle ?? ''}`}</title>
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
                {checkInResult.passportUnlocks &&
                  (checkInResult.passportUnlocks.stamps.length > 0 ||
                    checkInResult.passportUnlocks.milestones.length > 0) && (
                    <div
                      role="status"
                      className="mt-3 mb-3 rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-gray-700 p-3 text-left"
                    >
                      <p className="text-sm font-bold text-warm-900 dark:text-warm-100 mb-1">
                        Sale Passport updated
                      </p>
                      <ul className="space-y-1">
                        {checkInResult.passportUnlocks.stamps.map((st) => (
                          <li key={st.key} className="text-sm text-warm-800 dark:text-warm-200">
                            <span aria-hidden="true">{st.icon}</span> {st.name} stamp collected
                          </li>
                        ))}
                        {checkInResult.passportUnlocks.milestones.map((m) => (
                          <li key={`m-${m.milestone}`} className="text-sm text-warm-800 dark:text-warm-200">
                            <span aria-hidden="true">✨</span> {m.name} unlocked
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => router.push('/shopper/achievements#sale-passport')}
                        className="mt-2 text-xs font-semibold text-sage-700 dark:text-sage-300 hover:underline"
                      >
                        View Passport
                      </button>
                    </div>
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
