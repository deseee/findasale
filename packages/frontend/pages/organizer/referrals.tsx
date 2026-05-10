/**
 * Organizer Referral Dashboard (#398 — Org Referral Loop)
 * Shows referral link, stats, and reward explanation.
 * Refer another organizer → they publish their first sale → you earn 30 days free tier upgrade.
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface ReferralStats {
  referralCode: string | null;
  referralLink: string;
  totalOrgsReferred: number;
  firstSalePublished: number;
  totalXpEarned: number;
}

const OrganizerReferralsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['organizer-referral-stats'],
    queryFn: async () => {
      const response = await api.get('/organizers/me/referral-stats');
      return response.data as ReferralStats;
    },
    enabled: !!user?.id,
  });

  const handleCopy = async () => {
    if (!stats?.referralLink) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      showToast('Referral link copied!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  if (authLoading || !user || !user.roles?.includes('ORGANIZER')) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Referrals - FindA.Sale</title>
        <meta name="description" content="Refer other organizers and earn rewards when they publish their first sale." />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-8">
            <Link
              href="/organizer/dashboard"
              className="text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 text-sm mb-2 inline-block"
            >
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Referrals</h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
              Share your link. When a fellow organizer signs up and publishes their first sale, you earn a reward.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-700 dark:text-red-400">
                Failed to load referral data. Please try again.
              </p>
            </div>
          )}

          {/* Referral Link Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Your Referral Link</h2>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Share this link with other sale organizers.
            </p>

            {isLoading ? (
              <div className="h-10 bg-warm-100 dark:bg-gray-700 rounded-md animate-pulse" />
            ) : stats?.referralLink ? (
              <div className="flex items-center gap-3">
                <input
                  readOnly
                  value={stats.referralLink}
                  className="flex-1 px-3 py-2 text-sm border border-warm-300 dark:border-gray-600 rounded-md bg-warm-50 dark:bg-gray-700 text-warm-800 dark:text-warm-200 font-mono focus:outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-warm-500 dark:text-warm-400">Generating your link…</p>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 text-center">
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">
                {isLoading ? '—' : (stats?.totalOrgsReferred ?? 0)}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Organizers Referred</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 text-center">
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                {isLoading ? '—' : (stats?.firstSalePublished ?? 0)}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">First Sales Published</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 text-center">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {isLoading ? '—' : (stats?.totalXpEarned ?? 0)}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">XP Earned</p>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">How It Works</h2>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-bold flex items-center justify-center">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-warm-100">Share your link</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Send your referral link to another sale organizer — estate sales, yard sales, consignment, auctions, flea markets.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-bold flex items-center justify-center">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-warm-100">They sign up and publish</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">When they create their account using your link and publish their first sale, you qualify for a reward.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-bold flex items-center justify-center">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-warm-100">You earn a 30-day reward</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Your account receives a 30-day free tier upgrade benefit, applied automatically. Each referred organizer who publishes earns you another 30 days.</p>
                </div>
              </li>
            </ol>
          </div>

        </div>
      </div>
    </>
  );
};

export default OrganizerReferralsPage;
