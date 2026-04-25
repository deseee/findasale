/**
 * Affiliate Program — Organizer page
 * Shows referral code, earnings summary, and referrals table
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Copy, Gift, CheckCircle } from 'lucide-react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import EmptyState from '../../components/EmptyState';
import {
  useAffiliateCode,
  useAffiliateEarnings,
  useAffiliateReferrals,
  useGenerateAffiliateCode,
} from '../../hooks/useAffiliate';

const AffiliateOrganizer = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [copiedCode, setCopiedCode] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | undefined>(undefined);
  const [currentOffset, setCurrentOffset] = useState(0);

  // Redirect if not authenticated/authorized
  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch affiliate code
  const { data: codeData, isLoading: codeLoading, refetch: refetchCode } = useAffiliateCode();

  // Fetch earnings summary
  const { data: earnings, isLoading: earningsLoading } = useAffiliateEarnings();

  // Fetch referrals with pagination and status filter
  const { data: referralsData, isLoading: referralsLoading } = useAffiliateReferrals(
    currentStatus,
    25,
    currentOffset
  );

  // Generate code mutation
  const generateCodeMutation = useGenerateAffiliateCode();

  // Handle copy to clipboard
  const handleCopyLink = () => {
    if (codeData?.shareUrl) {
      navigator.clipboard.writeText(codeData.shareUrl);
      setCopiedCode(true);
      showToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Handle generate code
  const handleGenerateCode = async () => {
    try {
      await generateCodeMutation.mutateAsync();
      refetchCode();
      showToast('Affiliate code generated!', 'success');
    } catch (error: any) {
      showToast(
        error.response?.data?.error || 'Failed to generate affiliate code',
        'error'
      );
    }
  };

  // Status filter tabs
  const statuses = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Qualified', value: 'QUALIFIED' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  // Pagination
  const handlePrevPage = () => {
    if (currentOffset >= 25) {
      setCurrentOffset(currentOffset - 25);
    }
  };

  const handleNextPage = () => {
    if (referralsData && currentOffset + 25 < referralsData.pagination.total) {
      setCurrentOffset(currentOffset + 25);
    }
  };

  // Gate render after all hooks
  if (authLoading || !user || !user.roles?.includes('ORGANIZER')) {
    return null;
  }

  const hasCode = !!codeData?.referralCode;
  const totalReferrals = referralsData?.pagination.total || 0;
  const pageStart = currentOffset + 1;
  const pageEnd = Math.min(currentOffset + 25, referralsData?.pagination.total || 0);

  // Status badge color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
      case 'QUALIFIED':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'PAID':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'CANCELLED':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-warm-100 dark:bg-gray-700 text-warm-800 dark:text-warm-200';
    }
  };

  return (
    <>
      <Head>
        <title>Affiliate Program - FindA.Sale</title>
        <meta name="description" content="Earn commissions by referring other organizers" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link href="/organizer/dashboard" className="text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 text-sm mb-2 inline-block">
                ← Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Affiliate Program</h1>
              <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">Earn commissions when organizers sign up with your link</p>
            </div>
            <Gift size={48} className="text-amber-500 opacity-30" />
          </div>

          {/* Section 1: Your Affiliate Link */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-4">Your Affiliate Link</h2>

            {codeLoading ? (
              <p className="text-warm-600 dark:text-warm-400">Loading your affiliate code...</p>
            ) : hasCode ? (
              <div>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Your Referral Code</p>
                      <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 font-mono">
                        {codeData?.referralCode}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors"
                    >
                      {copiedCode ? (
                        <>
                          <CheckCircle size={16} />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy Link
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-warm-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-warm-600 dark:text-warm-400 uppercase mb-2">Share URL</p>
                  <p className="text-sm text-warm-900 dark:text-warm-100 break-all font-mono">
                    {codeData?.shareUrl}
                  </p>
                </div>

                <p className="text-sm text-warm-600 dark:text-warm-400">
                  When another organizer signs up with your link and completes their first paid sale, you earn a commission.
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-warm-600 dark:text-warm-400 mb-4">
                  You don't have an affiliate code yet. Generate one to start earning!
                </p>
                <button
                  onClick={handleGenerateCode}
                  disabled={generateCodeMutation.isPending}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md disabled:opacity-50 transition-colors"
                >
                  {generateCodeMutation.isPending ? 'Generating...' : 'Generate Your Affiliate Link'}
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Earnings Summary */}
          {hasCode && (
            <>
              {earningsLoading ? (
                <p className="text-warm-600 dark:text-warm-400 mb-8">Loading earnings summary...</p>
              ) : earnings && (earnings.totalEarned > 0 || earnings.unpaidBalance > 0 || earnings.thisMonthEarnings > 0) ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {/* Total Earned */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-warm-600 dark:text-warm-400">Total Earned</p>
                        <p className="text-3xl font-bold text-green-700 dark:text-green-400 mt-2">
                          ${(earnings.totalEarned / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-4xl">💰</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-500 mt-3">
                      From paid referrals
                    </p>
                  </div>

                  {/* Unpaid Balance */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-warm-600 dark:text-warm-400">Unpaid Balance</p>
                        <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-400 mt-2">
                          ${(earnings.unpaidBalance / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-4xl">⏳</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-500 mt-3">
                      Qualified, awaiting payout
                    </p>
                  </div>

                  {/* This Month */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-warm-600 dark:text-warm-400">This Month</p>
                        <p className="text-3xl font-bold text-amber-700 dark:text-amber-400 mt-2">
                          ${(earnings.thisMonthEarnings / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-4xl">📅</span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-500 mt-3">
                      Current month earnings
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
                  <EmptyState
                    icon="🌱"
                    heading="No referrals yet"
                    subtext="Share your link to start earning. When another organizer signs up and completes their first paid sale, you'll see earnings here."
                  />
                </div>
              )}
            </>
          )}

          {/* Section 3: Referrals Table */}
          {hasCode && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                  Referrals
                </h2>

                {/* Status filter tabs */}
                <div className="flex flex-wrap gap-2">
                  {statuses.map((status) => (
                    <button
                      key={status.value || 'all'}
                      onClick={() => {
                        setCurrentStatus(status.value);
                        setCurrentOffset(0);
                      }}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        currentStatus === status.value
                          ? 'bg-amber-600 text-white'
                          : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              {referralsLoading ? (
                <div className="px-6 py-8">
                  <p className="text-warm-600 dark:text-warm-400">Loading referrals...</p>
                </div>
              ) : referralsData && referralsData.referrals.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                            Referred User
                          </th>
                          <th className="text-left px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                            Status
                          </th>
                          <th className="text-right px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                            Amount
                          </th>
                          <th className="text-left px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-100 dark:divide-gray-700">
                        {referralsData.referrals.map((referral) => (
                          <tr
                            key={referral.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-medium text-warm-900 dark:text-warm-100">
                                  {referral.referredUserName}
                                </p>
                                <p className="text-xs text-warm-500 dark:text-warm-400">
                                  {referral.referredUserEmail}
                                </p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(referral.status)}`}>
                                {referral.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-warm-900 dark:text-warm-100">
                              ${(referral.payoutAmountCents / 100).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                              {new Date(referral.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-warm-600 dark:text-warm-400">
                        Showing {pageStart}–{pageEnd} of {totalReferrals}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handlePrevPage}
                          disabled={currentOffset === 0}
                          className="px-3 py-1.5 text-sm border border-warm-300 dark:border-gray-600 rounded-md hover:bg-warm-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-warm-700 dark:text-warm-300"
                        >
                          ← Previous
                        </button>
                        <button
                          onClick={handleNextPage}
                          disabled={currentOffset + 25 >= totalReferrals}
                          className="px-3 py-1.5 text-sm border border-warm-300 dark:border-gray-600 rounded-md hover:bg-warm-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-warm-700 dark:text-warm-300"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-6 py-8">
                  <p className="text-center text-warm-600 dark:text-warm-400">No referrals yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AffiliateOrganizer;
