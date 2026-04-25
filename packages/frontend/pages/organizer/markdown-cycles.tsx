/**
 * Feature #XXX: Automatic Markdown Cycles Management
 * PRO+ tier only. Allows organizers to create time-based automatic price reductions.
 */

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import TierGate from '../../components/TierGate';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';
import { X, Plus, Edit2, Trash2, TrendingDown } from 'lucide-react';

interface MarkdownCycle {
  id: string;
  daysUntilFirst: number;
  firstPct: number;
  daysUntilSecond: number | null;
  secondPct: number | null;
  isActive: boolean;
  saleId: string | null;
  sale: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Sale {
  id: string;
  title: string;
}

const MarkdownCyclesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { canAccess } = useOrganizerTier();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<MarkdownCycle | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    daysUntilFirst: '',
    firstPct: '',
    daysUntilSecond: '',
    secondPct: '',
    saleId: '',
  });

  // Fetch markdown cycles
  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ['markdown-cycles'],
    queryFn: async () => {
      const response = await api.get('/markdown-cycles');
      return response.data;
    },
  });

  // Fetch organizer's sales for dropdown
  const { data: sales = [] } = useQuery({
    queryKey: ['organizer-sales-for-markdown'],
    queryFn: async () => {
      const response = await api.get('/organizer/sales');
      return response.data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        daysUntilFirst: parseInt(formData.daysUntilFirst, 10),
        firstPct: parseInt(formData.firstPct, 10),
      };

      if (formData.daysUntilSecond) {
        payload.daysUntilSecond = parseInt(formData.daysUntilSecond, 10);
      }

      if (formData.secondPct) {
        payload.secondPct = parseInt(formData.secondPct, 10);
      }

      if (formData.saleId) {
        payload.saleId = formData.saleId;
      }

      return api.post('/markdown-cycles', payload);
    },
    onSuccess: () => {
      showToast('Markdown cycle created', 'success');
      resetForm();
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['markdown-cycles'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create markdown cycle';
      showToast(message, 'error');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCycle) throw new Error('No cycle selected');
      const payload: any = {};

      if (formData.daysUntilFirst) {
        payload.daysUntilFirst = parseInt(formData.daysUntilFirst, 10);
      }

      if (formData.firstPct) {
        payload.firstPct = parseInt(formData.firstPct, 10);
      }

      if (formData.daysUntilSecond) {
        payload.daysUntilSecond = parseInt(formData.daysUntilSecond, 10);
      }

      if (formData.secondPct) {
        payload.secondPct = parseInt(formData.secondPct, 10);
      }

      return api.put(`/markdown-cycles/${editingCycle.id}`, payload);
    },
    onSuccess: () => {
      showToast('Markdown cycle updated', 'success');
      resetForm();
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['markdown-cycles'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update markdown cycle';
      showToast(message, 'error');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (cycleId: string) => {
      return api.delete(`/markdown-cycles/${cycleId}`);
    },
    onSuccess: () => {
      showToast('Markdown cycle deleted', 'success');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['markdown-cycles'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete markdown cycle';
      showToast(message, 'error');
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async (cycle: MarkdownCycle) => {
      return api.put(`/markdown-cycles/${cycle.id}`, {
        isActive: !cycle.isActive,
      });
    },
    onSuccess: () => {
      showToast('Markdown cycle updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['markdown-cycles'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update markdown cycle';
      showToast(message, 'error');
    },
  });

  const resetForm = () => {
    setFormData({
      daysUntilFirst: '',
      firstPct: '',
      daysUntilSecond: '',
      secondPct: '',
      saleId: '',
    });
    setEditingCycle(null);
  };

  const openEditModal = (cycle: MarkdownCycle) => {
    setEditingCycle(cycle);
    setFormData({
      daysUntilFirst: cycle.daysUntilFirst.toString(),
      firstPct: cycle.firstPct.toString(),
      daysUntilSecond: cycle.daysUntilSecond?.toString() || '',
      secondPct: cycle.secondPct?.toString() || '',
      saleId: cycle.saleId || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.daysUntilFirst || !formData.firstPct) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    // Validate percentages
    const firstPct = parseInt(formData.firstPct, 10);
    if (firstPct < 0 || firstPct > 100) {
      showToast('First percentage must be between 0 and 100', 'error');
      return;
    }

    if (formData.secondPct) {
      const secondPct = parseInt(formData.secondPct, 10);
      if (secondPct < 0 || secondPct > 100) {
        showToast('Second percentage must be between 0 and 100', 'error');
        return;
      }

      // Validate daysUntilSecond is greater than daysUntilFirst
      if (formData.daysUntilSecond) {
        const daysFirst = parseInt(formData.daysUntilFirst, 10);
        const daysSecond = parseInt(formData.daysUntilSecond, 10);
        if (daysSecond <= daysFirst) {
          showToast('Second markdown days must be greater than first markdown days', 'error');
          return;
        }
      }
    }

    if (editingCycle) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
        </div>
      </div>
    );
  }

  // Tier gate for PRO+
  if (!canAccess('PRO')) {
    return (
      <>
        <Head>
          <title>Auto Markdown — FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
          <div className="max-w-4xl mx-auto px-4">
            <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-8 text-center">
              <TrendingDown size={48} className="mx-auto mb-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                Auto Markdown
              </h2>
              <p className="text-warm-600 dark:text-warm-300 mb-6">
                Automatic price reductions to move inventory faster. Available on PRO tier and above.
              </p>
              <button
                onClick={() => router.push('/organizer/subscription')}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Upgrade to PRO
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Auto Markdown — FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                Auto Markdown
              </h1>
              <p className="text-warm-600 dark:text-warm-400">
                Set up automatic price reductions to move inventory faster as your sale progresses.
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Cycle
            </button>
          </div>

          {/* Cycles List */}
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : cycles.length === 0 ? (
            <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-8 text-center">
              <TrendingDown size={40} className="mx-auto mb-4 text-amber-500" />
              <p className="text-warm-600 dark:text-warm-300 mb-4">
                No markdown cycles yet — set up automatic price reductions to move inventory faster.
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                <Plus size={18} />
                Create your first cycle
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {cycles.map((cycle: MarkdownCycle) => (
                <div
                  key={cycle.id}
                  className="bg-white dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex-1">
                    {/* Cycle details */}
                    <div className="mb-2">
                      <h3 className="font-bold text-warm-900 dark:text-warm-100">
                        {cycle.daysUntilFirst} day{cycle.daysUntilFirst !== 1 ? 's' : ''}: {cycle.firstPct}% off
                        {cycle.daysUntilSecond && cycle.secondPct && (
                          <span className="ml-4">
                            + {cycle.daysUntilSecond} day{cycle.daysUntilSecond !== 1 ? 's' : ''}: {cycle.secondPct}% off
                          </span>
                        )}
                      </h3>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-warm-600 dark:text-warm-400">
                      {cycle.sale ? (
                        <span className="bg-warm-100 dark:bg-gray-600 px-2 py-1 rounded">
                          {cycle.sale.title}
                        </span>
                      ) : (
                        <span className="bg-warm-100 dark:bg-gray-600 px-2 py-1 rounded">
                          All sales
                        </span>
                      )}
                      <span className={cycle.isActive ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                        {cycle.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleActiveMutation.mutate(cycle)}
                      disabled={toggleActiveMutation.isPending}
                      className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                        cycle.isActive
                          ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
                      } disabled:opacity-50`}
                      title={cycle.isActive ? 'Deactivate cycle' : 'Activate cycle'}
                    >
                      {cycle.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => openEditModal(cycle)}
                      className="p-2 text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title="Edit cycle"
                    >
                      <Edit2 size={18} />
                    </button>
                    {deleteConfirmId === cycle.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(cycle.id)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white text-xs font-bold rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(cycle.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        title="Delete cycle"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl dark:shadow-gray-900/50 max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                {editingCycle ? 'Edit Markdown Cycle' : 'Create Markdown Cycle'}
              </h2>
              <button
                onClick={() => {
                  resetForm();
                  setModalOpen(false);
                }}
                className="p-1 text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Days Until First */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Days Until First Markdown *
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.daysUntilFirst}
                  onChange={(e) =>
                    setFormData({ ...formData, daysUntilFirst: e.target.value })
                  }
                  placeholder="e.g., 5"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Days after item creation before first markdown applies
                </p>
              </div>

              {/* First Percentage */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  First Markdown % *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.firstPct}
                    onChange={(e) =>
                      setFormData({ ...formData, firstPct: e.target.value })
                    }
                    placeholder="e.g., 10"
                    className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="flex items-center px-3 py-2 bg-warm-50 dark:bg-gray-700 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 font-semibold">
                    %
                  </span>
                </div>
              </div>

              {/* Days Until Second (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Days Until Second Markdown (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.daysUntilSecond}
                  onChange={(e) =>
                    setFormData({ ...formData, daysUntilSecond: e.target.value })
                  }
                  placeholder="e.g., 10"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Must be greater than first markdown days
                </p>
              </div>

              {/* Second Percentage (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Second Markdown % (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.secondPct}
                    onChange={(e) =>
                      setFormData({ ...formData, secondPct: e.target.value })
                    }
                    placeholder="e.g., 20"
                    className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="flex items-center px-3 py-2 bg-warm-50 dark:bg-gray-700 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 font-semibold">
                    %
                  </span>
                </div>
              </div>

              {/* Sale Scope (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Scope to Specific Sale (optional)
                </label>
                <select
                  value={formData.saleId}
                  onChange={(e) =>
                    setFormData({ ...formData, saleId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">All sales</option>
                  {sales.map((sale: Sale) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Leave empty to apply to all your sales
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setModalOpen(false);
                  }}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-bold rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingCycle
                      ? 'Update Cycle'
                      : 'Create Cycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MarkdownCyclesPage;
