/**
 * Shopper Dispute History Page
 *
 * Displays a buyer's submitted disputes with:
 * - Dispute date, item name, reason, status, resolution
 * - Status color-coded badges
 * - Pagination support
 * - Link back to shopper dashboard
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import EmptyState from '../../components/EmptyState';

interface Dispute {
  id: string;
  itemId: string;
  reason: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  seller: {
    name: string;
    email: string;
  };
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ShopperDisputesPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');

  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  const { data, isLoading: isLoadingDisputes } = useQuery({
    queryKey: ['shopper-disputes', currentPage, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ page: currentPage.toString() });
      if (filterStatus) params.append('status', filterStatus);
      const response = await api.get(`/disputes/my?${params}`);
      return response.data;
    },
    enabled: !!user?.id,
  });

  const disputes: Dispute[] = data?.disputes || [];
  const pagination: PaginationData = data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'under_review':
        return 'bg-blue-100 text-blue-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const getReasionLabel = (reason: string) => {
    const labels: Record<string, string> = {
      condition_mismatch: 'Condition Mismatch',
      item_missing: 'Item Missing',
      wrong_item: 'Wrong Item',
      other: 'Other',
    };
    return labels[reason] || reason;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isLoading && !isLoadingDisputes && disputes.length === 0) {
    return (
      <>
        <Head>
          <title>My Disputes | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 py-8">
          <div className="max-w-4xl mx-auto px-4">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-3xl font-bold text-warm-900">My Disputes</h1>
              <Link
                href="/shopper/dashboard"
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                Back to Dashboard
              </Link>
            </div>

            <EmptyState
              heading="No Disputes"
              subtext="You haven't reported any issues yet. If you encounter a problem with an item, you can report it here."
              cta={{
                label: 'View My Purchases',
                href: '/shopper/dashboard',
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>My Disputes | FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-warm-900">My Disputes</h1>
            <Link
              href="/shopper/dashboard"
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Dashboard
            </Link>
          </div>

          {/* Status Filter */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Filter by Status
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setFilterStatus('');
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filterStatus === ''
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-warm-700 border border-warm-300 hover:bg-warm-50'
                }`}
              >
                All
              </button>
              {['open', 'under_review', 'resolved', 'closed'].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setFilterStatus(status);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filterStatus === status
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-warm-700 border border-warm-300 hover:bg-warm-50'
                  }`}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          {/* Disputes Table */}
          {isLoadingDisputes ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-warm-200 border-t-amber-600 rounded-full"></div>
              </div>
              <p className="mt-4 text-warm-600">Loading disputes...</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-warm-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-warm-100 border-b border-warm-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-warm-900">Date</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-warm-900">Item</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-warm-900">Reason</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-warm-900">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-warm-900">Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-200">
                      {disputes.map((dispute) => (
                        <tr key={dispute.id} className="hover:bg-warm-50 transition">
                          <td className="px-6 py-4 text-sm text-warm-700">
                            {formatDate(dispute.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-sm text-warm-900 font-medium">
                            <Link
                              href={`/item/${dispute.itemId}`}
                              className="text-amber-600 hover:text-amber-700 underline"
                            >
                              View Item
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm text-warm-700">
                            {getReasionLabel(dispute.reason)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(dispute.status)}`}>
                              {getStatusLabel(dispute.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-warm-600">
                            {dispute.resolution ? (
                              <details>
                                <summary className="cursor-pointer text-amber-600 hover:text-amber-700">
                                  View
                                </summary>
                                <p className="mt-2 text-warm-700 text-xs">{dispute.resolution}</p>
                              </details>
                            ) : (
                              <span className="text-warm-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-warm-300 rounded-lg text-warm-700 font-medium hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 rounded-lg font-medium transition ${
                          page === currentPage
                            ? 'bg-amber-600 text-white'
                            : 'border border-warm-300 text-warm-700 hover:bg-warm-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
                    disabled={currentPage === pagination.pages}
                    className="px-3 py-2 border border-warm-300 rounded-lg text-warm-700 font-medium hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperDisputesPage;
