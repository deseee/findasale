/**
 * TreasureHuntClaim: "Claim your XP" action for the Daily Treasure Hunt, shown on the item page
 * only when the item is today's treasure (server-validated: it must match today's clue and be
 * live). The home banner (TreasureHuntBanner) sends shoppers here.
 *
 * States: hidden (not a match / unavailable / own sale / loading / error), signed-out (sign in to
 * claim, returns to this item), ready to claim, claiming, claimed (with XP), already claimed today,
 * expired (client held yesterday's hunt), and a plain error with retry.
 * Idempotent on the server: a double tap or a second device never awards twice.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Trophy, CheckCircle2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useClaimTreasureHunt, useHuntItemStatus } from '../hooks/useTreasureHunt';

interface Props {
  itemId: string;
}

const TreasureHuntClaim: React.FC<Props> = ({ itemId }) => {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: status, refetch } = useHuntItemStatus(itemId, user?.id ?? 'anon');
  const claim = useClaimTreasureHunt();
  const [claimedXp, setClaimedXp] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!status) return null;

  const hideStates = ['NO_HUNT', 'NOT_FOUND', 'NOT_A_MATCH', 'UNAVAILABLE', 'OWN_ITEM'];
  if (claimedXp === null && hideStates.includes(status.state)) return null;

  const handleClaim = () => {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }
    setErrorMessage(null);
    claim.mutate(
      { itemId, huntId: status.huntId },
      {
        onSuccess: (res) => {
          if (res.alreadyFound) {
            showToast?.("You already found today's treasure.", 'info');
            refetch();
            return;
          }
          const xp = res.xpEarned ?? 0;
          setClaimedXp(xp);
          showToast?.(xp > 0 ? `Treasure found! +${xp} XP` : 'Treasure found!', 'points');
        },
        onError: (err: any) => {
          const data = err?.response?.data;
          if (data?.state === 'HUNT_EXPIRED') {
            setErrorMessage("That hunt has ended. We refreshed today's clue.");
            refetch();
            return;
          }
          setErrorMessage(data?.message ?? 'We could not claim this right now. Please try again.');
        },
      }
    );
  };

  const wrapper =
    'mb-4 rounded-lg border-l-4 border-amber-600 dark:border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 shadow-sm';

  if (claimedXp !== null) {
    return (
      <div className={wrapper} role="status">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
          <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          You found today's treasure!{claimedXp > 0 ? ` +${claimedXp} XP` : ''}
        </div>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">A new clue arrives tomorrow.</p>
      </div>
    );
  }

  if (status.state === 'ALREADY_FOUND') {
    return (
      <div className={wrapper} role="status">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
          <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          You already found today's treasure.
        </div>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Come back tomorrow for a new clue.</p>
      </div>
    );
  }

  // ELIGIBLE or HUNT_EXPIRED (after a refetch the state is ELIGIBLE again)
  return (
    <div className={wrapper}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
            <Trophy className="w-5 h-5" aria-hidden="true" />
            This item fits today's Treasure Hunt
          </p>
          {status.clue && (
            <p className="mt-1 text-sm italic text-warm-800 dark:text-warm-200">"{status.clue}"</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClaim}
          disabled={claim.isPending}
          className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-4 py-2 text-sm font-bold text-white transition-colors"
        >
          {claim.isPending ? 'Claiming...' : user ? 'Claim your XP' : 'Sign in to claim your XP'}
        </button>
      </div>
      {errorMessage && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default TreasureHuntClaim;
