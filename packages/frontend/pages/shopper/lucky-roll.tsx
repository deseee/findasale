/**
 * /shopper/lucky-roll - Lucky Roll Weekly XP Gacha
 *
 * Weekly gacha mechanic: spend 100 XP for a roll with 7 possible outcomes.
 * Full odds table always visible (regulatory requirement).
 * Celebration animations based on outcome tier.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Eligibility {
  canRoll: boolean;
  rollsRemainingThisWeek: number;
  weeklyLimit: number;
  nextRollAt: string | null;
  xpCost: number;
  userXpBalance: number;
  canAfford: boolean;
  rewardTable: Array<{
    outcome: string;
    probability: number;
    description: string;
    xpValue: number | null;
  }>;
  legalNotice: string;
}

interface RollResult {
  outcome: string;
  xpAwarded: number | null;
  couponCode: string | null;
  description: string;
  celebrationTier: 'JACKPOT' | 'WIN' | 'BREAK_EVEN' | 'CONSOLATION';
  rollNumber: number;
  pityFired: boolean;
  newXpBalance: number;
  nextRollAt: string;
  rollsRemainingThisWeek: number;
}

const LuckyRollPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [isLoading2, setIsLoading2] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch eligibility on mount
  useEffect(() => {
    if (!user) return;

    const fetchEligibility = async () => {
      try {
        const { data } = await api.get('/lucky-roll/eligibility');
        setEligibility(data);
        setIsLoading2(false);
      } catch (err) {
        console.error('Failed to fetch eligibility:', err);
        setError('Failed to load eligibility. Please refresh the page.');
        setIsLoading2(false);
      }
    };

    fetchEligibility();
  }, [user]);

  const handleRoll = async () => {
    if (!user || !eligibility || !eligibility.canRoll) return;

    setIsRolling(true);
    setError(null);
    setResult(null);

    try {
      const { data: rollResult } = await api.post<RollResult>('/lucky-roll/roll');
      setResult(rollResult);

      // Refresh eligibility
      const { data: newEligibility } = await api.get('/lucky-roll/eligibility');
      setEligibility(newEligibility);
    } catch (err: any) {
      setError(err.message || 'Failed to perform roll');
    } finally {
      setIsRolling(false);
    }
  };

  if (isLoading || isLoading2) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-warm-600 dark:text-warm-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <button
          onClick={() => router.push('/login?redirect=/shopper/lucky-roll')}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Sign in to roll
        </button>
      </div>
    );
  }

  const getCelebrationStyle = (tier: string) => {
    switch (tier) {
      case 'JACKPOT':
        return 'animate-pulse text-yellow-500 dark:text-yellow-300';
      case 'WIN':
        return 'text-purple-600 dark:text-purple-300';
      case 'BREAK_EVEN':
        return 'text-blue-600 dark:text-blue-300';
      default:
        return 'text-warm-600 dark:text-warm-400';
    }
  };

  const nextRollDate = eligibility?.nextRollAt ? new Date(eligibility.nextRollAt).toLocaleDateString() : null;

  return (
    <>
      <Head>
        <title>Lucky Roll - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">🎲</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Lucky Roll
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Spend 100 XP per week for a chance at exciting rewards
            </p>
          </div>

          {/* Status Card */}
          {eligibility && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 border-2 border-purple-200 dark:border-purple-700">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Your XP Balance</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-300">
                    {eligibility.userXpBalance}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Rolls Remaining</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-300">
                    {eligibility.rollsRemainingThisWeek}/{eligibility.weeklyLimit}
                  </p>
                </div>
              </div>

              {eligibility.canRoll ? (
                <>
                  <button
                    onClick={handleRoll}
                    disabled={isRolling}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-lg transition-all mb-2"
                  >
                    {isRolling ? 'Rolling...' : 'Roll (100 XP)'}
                  </button>
                  <p className="text-xs text-center text-warm-500 dark:text-warm-400">
                    Your lucky chance awaits!
                  </p>
                </>
              ) : (
                <>
                  <div className="p-4 bg-warm-100 dark:bg-gray-700 rounded-lg mb-4">
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
                      Weekly cap reached
                    </p>
                    <p className="text-xs text-warm-600 dark:text-warm-400">
                      Next roll available {nextRollDate}
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Result Display */}
          {result && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8 border-2 border-yellow-200 dark:border-yellow-700 text-center">
              <div className={`text-6xl mb-4 ${getCelebrationStyle(result.celebrationTier)}`}>
                {result.celebrationTier === 'JACKPOT' && '🎆'}
                {result.celebrationTier === 'WIN' && '✨'}
                {result.celebrationTier === 'BREAK_EVEN' && '🎯'}
                {result.celebrationTier === 'CONSOLATION' && '🍀'}
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${getCelebrationStyle(result.celebrationTier)}`}>
                {result.description}
              </h2>
              <p className="text-warm-600 dark:text-warm-400 mb-4">Outcome: {result.outcome}</p>

              {result.xpAwarded && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">XP Awarded</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-300">+{result.xpAwarded}</p>
                </div>
              )}

              {result.couponCode && result.couponCode !== 'PENDING_GENERATION' && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Coupon Code</p>
                  <p className="text-lg font-mono font-bold text-green-600 dark:text-green-300">
                    {result.couponCode}
                  </p>
                </div>
              )}

              <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">
                Your new XP balance: {result.newXpBalance}
              </p>

              {result.pityFired && (
                <p className="text-xs text-yellow-600 dark:text-yellow-300 font-semibold">
                  Pity system activated! ✨
                </p>
              )}
            </div>
          )}

          {/* Full Odds Table */}
          {eligibility && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-warm-200 dark:border-gray-700 overflow-hidden mb-8">
              <div className="bg-warm-100 dark:bg-gray-700 px-6 py-4 border-b border-warm-200 dark:border-gray-700">
                <h3 className="font-bold text-warm-900 dark:text-warm-100">
                  Complete Reward Table (Always Visible)
                </h3>
                <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">Regulatory transparency — see all odds before you roll</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Outcome</th>
                      <th className="px-4 py-3 text-center font-semibold text-warm-900 dark:text-warm-100">Odds</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Reward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    {eligibility.rewardTable.map((row, idx) => (
                      <tr key={idx} className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-warm-900 dark:text-warm-100">{row.outcome}</td>
                        <td className="px-4 py-3 text-center text-purple-600 dark:text-purple-300 font-bold">
                          {row.probability}%
                        </td>
                        <td className="px-4 py-3 text-warm-600 dark:text-warm-400">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legal Notice */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700 p-4 mb-8">
            <p className="text-xs text-yellow-800 dark:text-yellow-200 font-semibold">
              ⚖️ Legal Notice
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
              {eligibility?.legalNotice}
            </p>
          </div>

          {/* How It Works */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-warm-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">How Lucky Roll Works</h2>
            <div className="space-y-3 text-sm text-warm-600 dark:text-warm-400">
              <p>
                <strong className="text-warm-900 dark:text-warm-100">1. Cost:</strong> Each roll costs 100 XP
              </p>
              <p>
                <strong className="text-warm-900 dark:text-warm-100">2. Weekly Limit:</strong> 1 roll per week (2 with Hunt Pass)
              </p>
              <p>
                <strong className="text-warm-900 dark:text-warm-100">3. Resets:</strong> Your weekly rolls reset every Sunday at 11:59 PM UTC
              </p>
              <p>
                <strong className="text-warm-900 dark:text-warm-100">4. Pity System:</strong> Lucky Roll includes hidden pity counters to protect against bad luck streaks
              </p>
              <p>
                <strong className="text-warm-900 dark:text-warm-100">5. Transparency:</strong> All odds are published above. No hidden mechanics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LuckyRollPage;
