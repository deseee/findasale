/**
 * Organizer Coupons — /organizer/coupons
 * Organizers spend 50 XP to generate $1-off single-use coupon codes (max 5/month).
 * Codes are shared with shoppers who apply them at checkout. Discount comes from organizer payout.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

type Coupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minPurchaseAmount: number | null;
  expiresAt: string;
  status: string;
  createdAt: string;
};

type XpProfile = {
  guildXp: number;
  spendableXp: number;
  explorerRank: string;
  huntPassActive: boolean;
  huntPassExpiry: string | null;
  rankProgress: {
    currentXp: number;
    nextRankXp: number;
    nextRank: string;
  };
};

type GenerateResult = {
  code: string;
  discountValue: number;
  expiresAt: string;
  xpSpent: number;
  generatedThisMonth: number;
  monthlyLimit: number;
  message: string;
};

const OrganizerCouponsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: couponsData, isLoading: couponsLoading } = useQuery({
    queryKey: ['organizer-coupons'],
    queryFn: async () => {
      const res = await api.get('/coupons');
      return res.data as { coupons: Coupon[] };
    },
    enabled: !!user,
  });

  const { data: xpProfile } = useQuery<XpProfile>({
    queryKey: ['xp-profile'],
    queryFn: async () => {
      const res = await api.get('/xp/profile');
      return res.data;
    },
    enabled: !!user,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/coupons/generate');
      return res.data as GenerateResult;
    },
    onSuccess: (data) => {
      setNewCode(data.code);
      queryClient.invalidateQueries({ queryKey: ['organizer-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['xp-profile'] });
      showToast(`Coupon ${data.code} created! 50 XP spent.`, 'success');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to generate coupon';
      showToast(msg, 'error');
    },
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Code copied!', 'success');
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  };

  const coupons = couponsData?.coupons ?? [];
  const spendableXp = xpProfile?.spendableXp ?? 0;
  const canGenerate = spendableXp >= 50 && !generateMutation.isPending;

  const formatExpiry = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Head>
        <title>Coupons — FindA.Sale</title>
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/organizer/dashboard" className="hover:text-amber-600">
            Dashboard
          </Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">Coupons</span>
        </nav>

        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Shopper Coupons</h1>
        <p className="text-warm-500 dark:text-warm-400 mb-8">
          Generate $1-off single-use coupon codes to share with shoppers. Each code costs 50 XP and
          is valid for 30 days. Discounts are deducted from your payout — not the platform fee.
        </p>

        {/* XP balance + generate */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">Available XP</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                {spendableXp.toLocaleString()} <span className="text-base font-normal">XP</span>
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">50 XP per coupon · max 5/month</p>
            </div>

            <button
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition whitespace-nowrap"
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate Coupon (50 XP)'}
            </button>
          </div>

          {spendableXp < 50 && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">
              You need at least 50 XP to generate a coupon. Earn XP by listing items, completing sales,
              and other activities on your dashboard.
            </p>
          )}

          {/* Newly generated code callout */}
          {newCode && (
            <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-amber-300 dark:border-amber-600">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">New coupon code ready to share:</p>
              <div className="flex items-center gap-3">
                <code className="text-xl font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 rounded-lg select-all">
                  {newCode}
                </code>
                <button
                  onClick={() => copyCode(newCode)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Share this code directly with a shopper — they enter it at checkout for $1 off.
              </p>
            </div>
          )}
        </div>

        {/* Active coupon list */}
        <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4">Your Active Coupons</h2>

        {couponsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : coupons.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-warm-100 dark:border-gray-700">
            <p className="text-4xl mb-3">🎟️</p>
            <p className="text-warm-700 dark:text-warm-300 font-medium mb-1">No active coupons</p>
            <p className="text-sm text-warm-500 dark:text-warm-400">
              Generate a coupon above and share the code with a shopper.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map((coupon) => {
              const discount =
                coupon.discountType === 'PERCENT'
                  ? `${coupon.discountValue}% off`
                  : `$${coupon.discountValue.toFixed(2)} off`;

              return (
                <div
                  key={coupon.id}
                  className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-warm-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-4">
                    <code className="text-lg font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-lg">
                      {coupon.code}
                    </code>
                    <div>
                      <p className="font-semibold text-warm-900 dark:text-warm-100">{discount}</p>
                      {coupon.minPurchaseAmount && (
                        <p className="text-xs text-warm-500 dark:text-warm-400">
                          Min. purchase ${coupon.minPurchaseAmount.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-warm-500 dark:text-warm-400">
                      Expires {formatExpiry(coupon.expiresAt)}
                    </p>
                    <button
                      onClick={() => copyCode(coupon.code)}
                      className="px-3 py-1.5 border border-amber-300 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg transition"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* How it works */}
        <div className="mt-10 p-5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-warm-100 dark:border-gray-700">
          <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">How it works</h3>
          <ol className="space-y-2 text-sm text-warm-600 dark:text-warm-400 list-decimal list-inside">
            <li>Spend 50 XP to generate a unique $1-off coupon code.</li>
            <li>Share the code with a shopper — by text, email, or in person at your sale.</li>
            <li>Shopper enters the code at checkout. They pay $1 less.</li>
            <li>The $1 discount is deducted from your payout, not the platform fee.</li>
            <li>Each code is single-use and expires 30 days after creation.</li>
          </ol>
          <p className="text-xs text-warm-400 dark:text-warm-500 mt-3">
            You can generate up to 5 coupons per calendar month.{' '}
            <Link href="/organizer/dashboard" className="text-amber-600 hover:text-amber-700 underline">
              Earn more XP on your dashboard.
            </Link>
          </p>
        </div>
      </main>
    </>
  );
};

export default OrganizerCouponsPage;
