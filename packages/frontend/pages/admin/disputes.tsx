/**
 * Admin Disputes Management Page
 *
 * Displays all disputes with:
 * - Filterable by status
 * - Expandable rows showing full description
 * - Status update controls
 * - Resolution field for notes
 * - Color-coded badges
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import EmptyState from '../../components/EmptyState';

interface Dispute {
  id: string;
  orderId: string;
  itemId: string;
  saleId: string;
  reason: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  buyer: {
    id: string;
    name: string;
    email: string;
  };
  seller: {
    id: string;
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

const AdminDisputesPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editResolution, setEditResolution] = useState<string>('');

  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!isLoading && user?.role !== 'ADMIN') {
    router.push('/');
    return null;
  }

  const { data, isLoading: isLoadingDisputes } = useQuery({
    queryKey: ['admin-disputes', currentPage, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ page: currentPage.toString() });
      if (filterStatus) params.append('status', filterStatus);
      const response = await api.get(`/disputes/admin?${params}`);
      return response.data;
    },
    enabled: !!user?.id && user?.role === 'ADMIN',
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ disputeId, status, resolution }: { disputeId: string; status: string; resolution?: string }) => {
      const response = await api.patch(`/disputes/${disputeId}/status`, {
        status,
        ...(resolution && { resolution }),
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Dispute updated successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      setEditingId(null);
      setEditResolution('');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update dispute', 'error');
    },
  });

  const disputes: Dispute[] = data?.disputes || [];
  const pagination: PaginationData = data?.pagination || { page: 1, limit: 50, total: 0, pages: 0 };

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

  const getReasonLabel = (reason: string) => {
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStatusChange = (disputeId: string, newStatus: string) => {
    updateStatusMutation.mutate({
      disputeId,
      status: newStatus,
      resolution: editResolution || undefined,
    });
  };

  const handleEditClick = (dispute: Dispute) => {
    setEditingId(dispute.id);
    setEditResolution(dispute.resolution || '');
  };

  if (!isLoading && !isLoadingDisputes && disputes.length === 0) {
    return (
      <>
        <Head>
          <title>Disputes | Admin Panel | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 py-8">
          <div className="max-w-6xl mx-auto px-4">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-3xl font-bold text-warm-900">Disputes</h1>
              <Link
                href="/admin"
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                Back to Admin
              </Link>
            </div>

            <EmptyState
              heading="No Disputes"
              subtext="No disputes have been reported yet."
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Disputes | Admin Panel | FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-warm-900">Disputes</h1>
            <Link
              href="/admin"
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Back to Admin
            </Link>
          </div>

          {/* Status Filter Tabs */}
          <div className="mb-6">
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
                All {pagination.total > 0 && `(${pagination.total})`}
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

          {/* Disputes List */}
          {isLoadingDisputes ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-warm-200 border-t-amber-600 rounded-full"></div>
              </div>
              <p className="mt-4 text-warm-600">Loading disputes...</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {disputes.map((dispute) => (
                  <div
                    key={dispute.id}
                    className="bg-white rounded-lg border border-warm-200 shadow-sm overflow-hidden"
                  >
                    {/* Row Header */}
                    <div
                      onClick={() =>
                        setExpandedId(expandedId === dispute.id ? null : dispute.id)
                      }
                      className="px-6 py-4 cursor-pointer hover:bg-warm-50 transition flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(dispute.status)}`}>
                            {getStatusLabel(dispute.status)}
                          </span>
                          <span className="text-sm font-medium text-warm-600">
                            {getReasonLabel(dispute.reason)}
                          </span>
                        </div>
                        <div className="text-sm text-warm-600">
                          <strong>Buyer:</strong> {dispute.buyer.name} ({dispute.buyer.email})
                        </div>
                        <div className="text-sm text-warm-600">
                          <strong>Seller:</strong> {dispute.seller.name} ({dispute.seller.email})
                        </div>
                        <div className="text-xs text-warm-500 mt-1">
                          Submitted: {formatDate(dispute.createdAt)}
                        </div>
                      </div>
                      <div className="text-warm-400 ml-4">
                        {expandedId === dispute.id ? '▼' : '▶'}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedId === dispute.id && (
                      <div className="border-t border-warm-200 px-6 py-4 bg-warm-50">
                        {/* Description */}
                        <div className="mb-4">
                          <h4 className="font-semibold text-warm-900 mb-2">Description</h4>
                          <p className="text-warm-700 text-sm">{dispute.description}</p>
                        </div>

                        {/* Edit Mode or View Mode */}
                        {editingId === dispute.id ? (
                          <div className="space-y-3 border-t border-warm-200 pt-4">
                            <div>
                              <label className="block text-sm font-medium text-warm-700 mb-2">
                                Resolution Notes
                              </label>
                              <textarea
                                value={editResolution}
                                onChange={(e) => setEditResolution(e.target.value)}
                                placeholder="Add resolution notes..."
                                className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 resize-none"
                                rows={3}
                              />
                            </div>

                            <div className="flex gap-2 pt-2">
                              {['open', 'under_review', 'resolved', 'closed'].map((status) => (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(dispute.id, status)}
                                  disabled={updateStatusMutation.isPending}
                                  className="flex-1 px-3 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                                >
                                  Mark {getStatusLabel(status)}
                                </button>
                              ))}
                            </div>

                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditResolution('');
                              }}
                              className="w-full px-3 py-2 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-100 transition text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="border-t border-warm-200 pt-4">
                            {dispute.resolution && (
                              <div className="mb-3">
                                <h4 className="font-semibold text-warm-900 mb-1">Resolution</h4>
                                <p className="text-warm-700 text-sm">{dispute.resolution}</p>
                              </div>
                            )}
                            <button
                              onClick={() => handleEditClick(dispute)}
                              className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition text-sm"
                            >
                              Update Status & Resolution
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
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

export default AdminDisputesPage;
