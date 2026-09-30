/**
 * Feature: Automatic Markdown Cycles Management
 * PRO+ tier only to create, edit or turn ON. Allows organizers to create time-based automatic
 * price reductions.
 *
 * 2026-09-29 (Patrick D1): a downgraded (non-PRO) organizer no longer hits a full-page tier gate.
 * They see their existing cycles read-only under a "Paused: PRO required" banner and can still
 * turn a cycle OFF or delete it (the API allows GET, DELETE and PUT {isActive:false} at any tier,
 * see routes/markdownCycles.ts). Creating, editing and turning a cycle back on stay PRO, with an
 * upgrade prompt. A non-PRO organizer with no cycles at all still sees the PRO upsell gate.
 *
 * ADR-markdown-cycle-n-steps (2026-09-28): a cycle now holds 1-6 ordered steps
 * (day threshold + % off, both increasing) instead of a fixed first/second pair.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../components/Skeleton';
import { X, Plus, Edit2, Trash2, TrendingDown } from 'lucide-react';

const MAX_STEPS = 6;

interface MarkdownCycleStep {
  id: string;
  stepOrder: number;
  dayThreshold: number;
  pctOff: number;
}

interface MarkdownCycle {
  id: string;
  steps: MarkdownCycleStep[];
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

interface StepFormRow {
  dayThreshold: string;
  pctOff: string;
}

const emptyStepRow = (): StepFormRow => ({ dayThreshold: '', pctOff: '' });

const MarkdownCyclesPage = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { canAccess, tierKnown, tierLoading } = useOrganizerTier();
  // PRO/TEAMS can create, edit and turn cycles on. Everyone else can only view, turn off and delete.
  const canManage = canAccess('PRO');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<MarkdownCycle | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [steps, setSteps] = useState<StepFormRow[]>([emptyStepRow()]);
  const [saleId, setSaleId] = useState('');

  // Fetch markdown cycles
  const { data: cycles = [], isLoading, isError: cyclesError } = useQuery({
    queryKey: ['markdown-cycles'],
    queryFn: async () => {
      const response = await api.get('/markdown-cycles');
      return response.data;
    },
  });

  // Fetch organizer's sales for dropdown
  const { data: sales = [], isError: salesError } = useQuery({
    queryKey: ['organizer-sales-for-markdown'],
    queryFn: async () => {
      const response = await api.get('/organizers/me/sales');
      return response.data;
    },
  });

  const buildStepsPayload = () =>
    steps.map((step) => ({
      dayThreshold: parseInt(step.dayThreshold, 10),
      pctOff: parseInt(step.pctOff, 10),
    }));

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { steps: buildStepsPayload() };
      if (saleId) {
        payload.saleId = saleId;
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
      return api.put(`/markdown-cycles/${editingCycle.id}`, { steps: buildStepsPayload() });
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
    setSteps([emptyStepRow()]);
    setSaleId('');
    setEditingCycle(null);
  };

  const openEditModal = (cycle: MarkdownCycle) => {
    setEditingCycle(cycle);
    setSteps(
      cycle.steps.length > 0
        ? cycle.steps.map((step) => ({
            dayThreshold: step.dayThreshold.toString(),
            pctOff: step.pctOff.toString(),
          }))
        : [emptyStepRow()]
    );
    setSaleId(cycle.saleId || '');
    setModalOpen(true);
  };

  const addStepRow = () => {
    if (steps.length >= MAX_STEPS) return;
    setSteps([...steps, emptyStepRow()]);
  };

  const removeStepRow = (index: number) => {
    if (steps.length <= 1) return; // at least one step required
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepRow = (index: number, field: keyof StepFormRow, value: string) => {
    setSteps(steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (steps.length === 0) {
      showToast('Add at least one markdown step', 'error');
      return;
    }
    if (steps.length > MAX_STEPS) {
      showToast(`You can have at most ${MAX_STEPS} steps`, 'error');
      return;
    }

    let prevDay = -Infinity;
    let prevPct = -Infinity;
    for (let i = 0; i < steps.length; i++) {
      const { dayThreshold, pctOff } = steps[i];
      if (!dayThreshold || !pctOff) {
        showToast('Please fill in every step', 'error');
        return;
      }
      const day = parseInt(dayThreshold, 10);
      const pct = parseInt(pctOff, 10);
      if (pct <= 0 || pct > 100) {
        showToast(`Step ${i + 1}: percentage must be between 1 and 100`, 'error');
        return;
      }
      if (day <= prevDay) {
        showToast(`Step ${i + 1}: days must be greater than the previous step`, 'error');
        return;
      }
      if (pct <= prevPct) {
        showToast(`Step ${i + 1}: percentage must be greater than the previous step`, 'error');
        return;
      }
      prevDay = day;
      prevPct = pct;
    }

    if (editingCycle) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const formatSteps = (cycleSteps: MarkdownCycleStep[]) =>
    cycleSteps
      .map((step) => `${step.dayThreshold} day${step.dayThreshold !== 1 ? 's' : ''}: ${step.pctOff}% off`)
      .join(' + ');

  if (authLoading || tierLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
        </div>
      </div>
    );
  }

  const pageBody = (
    <>
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Error banner */}
          {(cyclesError || salesError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 mb-6 text-sm text-red-700 dark:text-red-400">
              Something went wrong loading your markdown cycles. Please refresh to try again.
            </div>
          )}

          {/* Read-only banner for organizers who are not on PRO/TEAMS (2026-09-29, D1) */}
          {!canManage && cycles.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 mb-6">
              <p className="font-semibold text-amber-900 dark:text-amber-200">Paused: PRO required</p>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                Your automatic markdown cycles are paused because your account is not on a PRO or TEAMS plan. They
                will not lower prices or update your marketplace listings. Your cycle settings and any prices already
                changed are kept, and nothing is restored automatically. You can turn cycles off or delete them here.
                The free Day 2 and Day 3 sale markdowns keep running. Upgrade to PRO to create or edit cycles and turn
                them back on.
              </p>
              <Link
                href="/pricing"
                className="inline-block mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300 underline hover:text-amber-900 dark:hover:text-amber-100"
              >
                Upgrade to PRO
              </Link>
            </div>
          )}

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
            {canManage ? (
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
            ) : (
              <Link
                href="/pricing"
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                title="Creating cycles needs a PRO plan"
              >
                <Plus size={18} />
                Upgrade to add cycles
              </Link>
            )}
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
                No markdown cycles yet. Set up automatic price reductions to move inventory faster.
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
                        {formatSteps(cycle.steps)}
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
                      <span className={
                        !canManage && cycle.isActive
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : cycle.isActive ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'
                      }>
                        {!canManage && cycle.isActive ? 'Paused: PRO required' : cycle.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleActiveMutation.mutate(cycle)}
                      disabled={toggleActiveMutation.isPending || (!canManage && !cycle.isActive)}
                      className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                        cycle.isActive
                          ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500'
                      } disabled:opacity-50`}
                      title={
                        !canManage
                          ? (cycle.isActive ? 'Turn this cycle off' : 'Turning a cycle on needs a PRO plan')
                          : (cycle.isActive ? 'Deactivate cycle' : 'Activate cycle')
                      }
                    >
                      {!canManage ? (cycle.isActive ? 'Turn off' : 'Off') : (cycle.isActive ? 'Active' : 'Inactive')}
                    </button>
                    {canManage ? (
                      <button
                        onClick={() => openEditModal(cycle)}
                        className="p-2 text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        title="Edit cycle"
                      >
                        <Edit2 size={18} />
                      </button>
                    ) : (
                      <Link
                        href="/pricing"
                        className="p-2 text-amber-600 dark:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        title="Editing a cycle needs a PRO plan. Upgrade to edit."
                        aria-label="Upgrade to PRO to edit this cycle"
                      >
                        <Edit2 size={18} />
                      </Link>
                    )}
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl dark:shadow-gray-900/50 max-w-xl w-full max-h-[90vh] overflow-y-auto">
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
              {/* Steps */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Markdown Steps *
                </label>
                <p className="text-xs text-warm-500 dark:text-warm-400 mb-3">
                  Each step's percentage is off the item's original price, not the previous step's
                  price. Days and percentages must each increase from one step to the next.
                </p>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-warm-500 dark:text-warm-400 w-14 flex-shrink-0">
                        Step {index + 1}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={step.dayThreshold}
                        onChange={(e) => updateStepRow(index, 'dayThreshold', e.target.value)}
                        placeholder="Days, e.g. 30"
                        aria-label={`Step ${index + 1} days`}
                        className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={step.pctOff}
                          onChange={(e) => updateStepRow(index, 'pctOff', e.target.value)}
                          placeholder="% off, e.g. 10"
                          aria-label={`Step ${index + 1} percent off`}
                          className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-warm-500 dark:text-warm-400 text-sm">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStepRow(index)}
                        disabled={steps.length <= 1}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                        title="Remove step"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addStepRow}
                  disabled={steps.length >= MAX_STEPS}
                  className="mt-3 flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={16} />
                  Add step {steps.length >= MAX_STEPS ? `(max ${MAX_STEPS})` : ''}
                </button>
              </div>

              {/* Sale Scope (Optional) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Scope to Specific Sale (optional)
                </label>
                <select
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
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

  // Non-PRO organizers with existing cycles see them read-only (pageBody handles the banner and the
  // disabled controls). A non-PRO organizer with nothing to show, or whose tier could not be read,
  // still gets the full PRO upsell gate, exactly as before.
  const gateWholePage = !canManage && (!tierKnown || (!isLoading && !cyclesError && cycles.length === 0));

  return (
    <>
      <Head>
        <title>Auto Markdown. FindA.Sale</title>
      </Head>
      {gateWholePage ? (
        <TierGate requiredTier="PRO" featureName="Auto Markdown" description="Automatic price reductions to move inventory faster. Available on PRO tier and above.">
          {pageBody}
        </TierGate>
      ) : (
        pageBody
      )}
    </>
  );
};

export default MarkdownCyclesPage;
