/**
 * Fraud Signals Dashboard — Feature #17: Bid Bot Detector
 *
 * Organizer views AI-detected fraud signals for their sales.
 * Shows bid bot indicators, suspicious bidding patterns, and risk levels.
 * Organizer can review and confirm/dismiss signals.
 *
 * Route: /organizer/fraud-signals
 * Tier: PRO minimum
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useToast } from '../../components/ToastContext';
import { useSaleFraudSignals, useReviewSignal, confidenceToRiskLevel, type FraudSignal, type RiskLevel } from '../../hooks/useBidBot';
import Skeleton from '../../components/Skeleton';
import TierGate from '../../components/TierGate';
import api from '../../lib/api';

interface Sale {
  id: string;
  title: string;
  status: string;
}

const riskLevelColors: Record<RiskLevel, { bg: string; text: string; badge: string }> = {
  HIGH: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-200',
    badge: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
  },
  MEDIUM: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-200',
    badge: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
  },
  LOW: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-200',
    badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
  },
};

const FraudSignalsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState(30);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);

  // Fetch user's sales
  const { data: salesData, isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['sales', 'mine'],
    queryFn: async () => {
      const res = await api.get('/sales/mine');
      return res.data.sales || [];
    },
    enabled: !!user && user.roles?.includes('ORGANIZER'),
  });

  // Fetch fraud signals for selected sale
  const { data: signalsData, isLoading: signalsLoading } = useSaleFraudSignals(
    selectedSaleId,
    page,
    minScore
  );

  const reviewMutation = useReviewSignal();

  // Show loading spinner during auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-warm-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated or not organizer
  if (!user || !user.roles?.includes('ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const handleReviewSignal = async (signalId: string, outcome: 'DISMISSED' | 'CONFIRMED') => {
    try {
      await reviewMutation.mutateAsync({
        signalId,
        outcome,
        notes: outcome === 'CONFIRMED' ? 'Confirmed by organizer' : 'Dismissed by organizer',
      });
      showToast(`Signal ${outcome.toLowerCase()}`, 'success');
      setExpandedSignalId(null);
    } catch (err) {
      showToast('Failed to review signal', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Fraud Signals - FindA.Sale</title>
      </Head>

      <TierGate requiredTier="PRO" featureName="Fraud Signals" description="Monitor suspicious bidding patterns, flag potential fraud, and protect your sales with AI-powered detection.">
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">Fraud Signals</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Bid Bot Detector</h2>
            <p className="text-warm-600 dark:text-gray-400">
              AI-powered fraud detection for suspicious bidding patterns. Review signals to protect your sales.
            </p>
          </div>

          {/* Sale Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 mb-8">
            <label className="block text-sm font-semibold text-warm-900 dark:text-gray-100 mb-3">
              Select Sale
            </label>
            {salesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <select
                value={selectedSaleId || ''}
                onChange={(e) => {
                  setSelectedSaleId(e.target.value || null);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-warm-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— Choose a sale —</option>
                {(salesData || []).map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.title} ({sale.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Signals Summary */}
          {selectedSaleId && signalsData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-4">
                <p className="text-warm-600 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Total Signals</p>
                <p className="text-2xl font-bold text-warm-900 dark:text-gray-100">{signalsData.total}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-4">
                <p className="text-warm-600 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Pending Review</p>
                <p className="text-2xl font-bold text-warm-900 dark:text-gray-100">
                  {signalsData.signals.filter(s => s.reviewOutcome === 'PENDING').length}
                </p>
              </div>
            </div>
          )}

          {/* Signals List */}
          {selectedSaleId ? (
            <>
              {signalsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-40" />
                  ))}
                </div>
              ) : (signalsData?.signals || []).length > 0 ? (
                <div className="space-y-4">
                  {signalsData!.signals.map((signal) => {
                    const riskLevel = confidenceToRiskLevel(signal.confidenceScore);
                    return (
                    <div
                      key={signal.id}
                      className={`rounded-lg shadow-md dark:shadow-gray-900/50 p-6 cursor-pointer transition-all border-l-4 ${
                        riskLevelColors[riskLevel].bg
                      } ${
                        riskLevel === 'HIGH'
                          ? 'border-l-red-500'
                          : riskLevel === 'MEDIUM'
                          ? 'border-l-amber-500'
                          : 'border-l-green-500'
                      }`}
                      onClick={() => setExpandedSignalId(expandedSignalId === signal.id ? null : signal.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className={`font-semibold text-lg ${riskLevelColors[riskLevel].text}`}>
                              {signal.signalType}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${riskLevelColors[riskLevel].badge}`}>
                              {riskLevel} (Score: {signal.confidenceScore})
                            </span>
                          </div>
                          <p className="text-xs text-warm-500 dark:text-gray-500">
                            Bidder: {signal.userName} ({signal.userEmail})
                          </p>
                          {signal.itemTitle && (
                            <p className="text-xs text-warm-500 dark:text-gray-500">
                              Item: {signal.itemTitle}
                            </p>
                          )}
                        </div>
                        <svg
                          className={`w-5 h-5 flex-shrink-0 transition-transform text-warm-600 dark:text-gray-400 ${
                            expandedSignalId === signal.id ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>

                      {/* Expanded Details */}
                      {expandedSignalId === signal.id && (
                        <div className="mt-6 pt-6 border-t border-warm-200 dark:border-gray-700">
                          <p className="text-xs text-warm-500 dark:text-gray-500 mb-4">
                            Detected: {new Date(signal.detectedAt).toLocaleString()}
                          </p>
                          {signal.reviewOutcome === 'PENDING' ? (
                            <div className="flex gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReviewSignal(signal.id, 'CONFIRMED');
                                }}
                                disabled={reviewMutation.isPending}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                              >
                                {reviewMutation.isPending ? 'Saving…' : 'Confirm Fraud'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReviewSignal(signal.id, 'DISMISSED');
                                }}
                                disabled={reviewMutation.isPending}
                                className="flex-1 px-4 py-2 bg-warm-200 dark:bg-warm-700 hover:bg-warm-300 dark:hover:bg-warm-600 text-warm-900 dark:text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                              >
                                {reviewMutation.isPending ? 'Saving…' : 'Dismiss'}
                              </button>
                            </div>
                          ) : (
                            <p className={`text-sm font-medium ${signal.reviewOutcome === 'CONFIRMED' ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`}>
                              Reviewed: {signal.reviewOutcome}
                              {signal.notes && ` • ${signal.notes}`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-12 text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m10.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-warm-600 dark:text-gray-400 text-lg font-semibold mb-2">No fraud signals detected</p>
                  <p className="text-warm-500 dark:text-gray-500">Your sale looks clean! Keep monitoring for protection.</p>
                </div>
              )}

              {/* Pagination */}
              {signalsData && signalsData.hasMore && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-warm-600 dark:text-gray-400">
                    Page {page}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={!signalsData.hasMore}
                    className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 border border-warm-200 dark:border-gray-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-warm-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4v2m0 0v2m0-6v0m6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-warm-600 dark:text-gray-400 text-lg font-semibold">Select a sale to view fraud signals</p>
            </div>
          )}
        </div>
      </div>
      </TierGate>
    </>
  );
};

export default FraudSignalsPage;
