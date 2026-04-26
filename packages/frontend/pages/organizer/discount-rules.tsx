/**
 * Feature #310: Color-tagged Discount Rules
 * TEAMS tier only. Allows organizers to assign discount percentages to item color tags.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import Head from 'next/head';
import Skeleton from '../../components/Skeleton';
import { X, Plus, Edit2, Trash2, Tag } from 'lucide-react';

interface DiscountRule {
  id: string;
  tagColor: string;
  label: string;
  discountPercent: number;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: string;
  updatedAt: string;
}

const DiscountRulesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { canAccess } = useOrganizerTier();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    tagColor: '',
    label: '',
    discountPercent: '',
    activeFrom: '',
    activeTo: '',
  });

  // Fetch discount rules
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['discount-rules'],
    queryFn: async () => {
      const response = await api.get('/discount-rules');
      return response.data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        tagColor: formData.tagColor,
        label: formData.label,
        discountPercent: parseFloat(formData.discountPercent),
      };

      if (formData.activeFrom) {
        payload.activeFrom = new Date(formData.activeFrom).toISOString();
      }

      if (formData.activeTo) {
        payload.activeTo = new Date(formData.activeTo).toISOString();
      }

      return api.post('/discount-rules', payload);
    },
    onSuccess: () => {
      showToast('Discount rule created', 'success');
      resetForm();
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create discount rule';
      showToast(message, 'error');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingRule) throw new Error('No rule selected');
      const payload: any = {};

      if (formData.tagColor) payload.tagColor = formData.tagColor;
      if (formData.label) payload.label = formData.label;
      if (formData.discountPercent) payload.discountPercent = parseFloat(formData.discountPercent);

      if (formData.activeFrom) {
        payload.activeFrom = new Date(formData.activeFrom).toISOString();
      } else {
        payload.activeFrom = null;
      }

      if (formData.activeTo) {
        payload.activeTo = new Date(formData.activeTo).toISOString();
      } else {
        payload.activeTo = null;
      }

      return api.put(`/discount-rules/${editingRule.id}`, payload);
    },
    onSuccess: () => {
      showToast('Discount rule updated', 'success');
      resetForm();
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update discount rule';
      showToast(message, 'error');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return api.delete(`/discount-rules/${ruleId}`);
    },
    onSuccess: () => {
      showToast('Discount rule deleted', 'success');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['discount-rules'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete discount rule';
      showToast(message, 'error');
    },
  });

  const resetForm = () => {
    setFormData({
      tagColor: '',
      label: '',
      discountPercent: '',
      activeFrom: '',
      activeTo: '',
    });
    setEditingRule(null);
  };

  const openEditModal = (rule: DiscountRule) => {
    setEditingRule(rule);
    setFormData({
      tagColor: rule.tagColor,
      label: rule.label,
      discountPercent: rule.discountPercent.toString(),
      activeFrom: rule.activeFrom ? new Date(rule.activeFrom).toISOString().split('T')[0] : '',
      activeTo: rule.activeTo ? new Date(rule.activeTo).toISOString().split('T')[0] : '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tagColor || !formData.label || !formData.discountPercent) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    const discountPct = parseFloat(formData.discountPercent);
    if (isNaN(discountPct) || discountPct < 0 || discountPct > 100) {
      showToast('Discount percent must be a number between 0 and 100', 'error');
      return;
    }

    if (editingRule) {
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

  // Tier gate for TEAMS
  if (!canAccess('TEAMS')) {
    return (
      <>
        <Head>
          <title>Discount Rules — FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
          <div className="max-w-4xl mx-auto px-4">
            <div className="bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded-lg p-8 text-center">
              <Tag size={48} className="mx-auto mb-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-2">
                Color-Tagged Discount Rules
              </h2>
              <p className="text-blue-600 dark:text-blue-300 mb-6">
                Apply discounts by item color tags. Available on TEAMS tier and above.
              </p>
              <button
                onClick={() => router.push('/organizer/subscription')}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Upgrade to TEAMS
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
        <title>Discount Rules — FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                Discount Rules
              </h1>
              <p className="text-warm-600 dark:text-warm-400">
                Create discount rules tied to item color tags to apply bulk discounts instantly.
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Rule
            </button>
          </div>

          {/* Rules List */}
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : rules.length === 0 ? (
            <div className="bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded-lg p-8 text-center">
              <Tag size={40} className="mx-auto mb-4 text-blue-500" />
              <p className="text-warm-600 dark:text-warm-300 mb-4">
                No discount rules yet — create a rule to apply bulk discounts by color tag.
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                <Plus size={18} />
                Create your first rule
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {rules.map((rule: DiscountRule) => (
                <div
                  key={rule.id}
                  className="bg-white dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-6 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex-1">
                    {/* Rule details */}
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-md border-2 border-gray-300 dark:border-gray-500"
                        style={{ backgroundColor: rule.tagColor }}
                        title={rule.tagColor}
                      />
                      <div>
                        <h3 className="font-bold text-warm-900 dark:text-warm-100">
                          {rule.label}
                        </h3>
                        <p className="text-sm text-warm-600 dark:text-warm-400">
                          {rule.discountPercent}% off
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-warm-600 dark:text-warm-400">
                      <span className="bg-warm-100 dark:bg-gray-600 px-2 py-1 rounded">
                        {rule.tagColor}
                      </span>
                      {rule.activeFrom && (
                        <span className="bg-warm-100 dark:bg-gray-600 px-2 py-1 rounded">
                          From: {new Date(rule.activeFrom).toLocaleDateString()}
                        </span>
                      )}
                      {rule.activeTo && (
                        <span className="bg-warm-100 dark:bg-gray-600 px-2 py-1 rounded">
                          Until: {new Date(rule.activeTo).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title="Edit rule"
                    >
                      <Edit2 size={18} />
                    </button>
                    {deleteConfirmId === rule.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(rule.id)}
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
                        onClick={() => setDeleteConfirmId(rule.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        title="Delete rule"
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
                {editingRule ? 'Edit Discount Rule' : 'Create Discount Rule'}
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
              {/* Color Tag */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Color Tag *
                </label>
                <div className="flex gap-2">
                  <div
                    className="w-12 h-10 rounded-lg border-2 border-gray-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: formData.tagColor || '#999999' }}
                  />
                  <input
                    type="text"
                    value={formData.tagColor}
                    onChange={(e) =>
                      setFormData({ ...formData, tagColor: e.target.value })
                    }
                    placeholder="e.g., #EF4444 or red"
                    className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Hex code (e.g., #EF4444) or color name
                </p>
              </div>

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Label *
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) =>
                    setFormData({ ...formData, label: e.target.value })
                  }
                  placeholder="e.g., 25% Off — Red Tag"
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Human-readable name for this rule
                </p>
              </div>

              {/* Discount Percent */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Discount % *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.discountPercent}
                    onChange={(e) =>
                      setFormData({ ...formData, discountPercent: e.target.value })
                    }
                    placeholder="e.g., 25"
                    className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="flex items-center px-3 py-2 bg-warm-50 dark:bg-gray-700 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 font-semibold">
                    %
                  </span>
                </div>
              </div>

              {/* Active From (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Active From (optional)
                </label>
                <input
                  type="date"
                  value={formData.activeFrom}
                  onChange={(e) =>
                    setFormData({ ...formData, activeFrom: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Leave empty to make active immediately
                </p>
              </div>

              {/* Active To (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Active Until (optional)
                </label>
                <input
                  type="date"
                  value={formData.activeTo}
                  onChange={(e) =>
                    setFormData({ ...formData, activeTo: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Leave empty for no expiry date
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
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingRule
                      ? 'Update Rule'
                      : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default DiscountRulesPage;
