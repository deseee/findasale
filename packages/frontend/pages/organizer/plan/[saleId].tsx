import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import TestCheckoutModal from '../../../components/TestCheckoutModal';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Clock,
  Zap,
  ListTodo,
  Send,
  Gift,
  Trophy,
  Sparkles,
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  stage: string;
  label: string;
  completed: boolean;
  isAuto: boolean;
  link?: string;
  tier?: string;
}

interface StageProgress {
  stageId: string;
  label: string;
  total: number;
  completed: number;
  isComplete: boolean;
}

interface ChecklistResponse {
  id: string;
  saleId: string;
  items: ChecklistItem[];
  stageProgress: StageProgress[];
  updatedAt: string;
}

const stageIcons: Record<string, React.ReactNode> = {
  'Setup': <ListTodo className="w-5 h-5" />,
  'Cataloging': <Zap className="w-5 h-5" />,
  'Pre-Sale': <Send className="w-5 h-5" />,
  'Live': <Trophy className="w-5 h-5" />,
  'Wrapping Up': <Clock className="w-5 h-5" />,
  'Complete': <CheckCircle2 className="w-5 h-5" />,
};

const SalePlanPage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [posTestLoading, setPosTestLoading] = useState(false);
  const [onlineCheckoutLoading, setOnlineCheckoutLoading] = useState(false);
  const [auctionCheckoutLoading, setAuctionCheckoutLoading] = useState(false);
  const [showTestInAppModal, setShowTestInAppModal] = useState(false);

  const handlePosTest = async () => {
    if (!saleId || typeof saleId !== 'string') return;
    setPosTestLoading(true);
    try {
      await api.post('/stripe/test-transaction', { saleId, amount: 1, paymentMethod: 'direct' });
      // live_pos is auto-detected from DB (hasTestTransaction) — invalidate so it refetches
      queryClient.invalidateQueries({ queryKey: ['checklist', saleId] });
      showToast('POS test passed — no inventory affected ✓', 'success');
    } catch {
      showToast('POS test failed. Check your Stripe connection.', 'error');
    } finally {
      setPosTestLoading(false);
    }
  };

  const handleOnlineCheckout = async () => {
    if (!saleId || typeof saleId !== 'string') return;
    setOnlineCheckoutLoading(true);
    try {
      const res = await api.post('/stripe/test-checkout-session', { saleId, type: 'standard' });
      const url = res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        showToast('Test failed. Check console for details.', 'error');
      }
    } catch {
      showToast('Test failed. Check your Stripe connection.', 'error');
    } finally {
      setOnlineCheckoutLoading(false);
    }
  };

  const handleAuctionCheckout = async () => {
    if (!saleId || typeof saleId !== 'string') return;
    setAuctionCheckoutLoading(true);
    try {
      const res = await api.post('/stripe/test-checkout-session', { saleId, type: 'auction' });
      const url = res.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        showToast('Test failed. Check console for details.', 'error');
      }
    } catch {
      showToast('Test failed. Check your Stripe connection.', 'error');
    } finally {
      setAuctionCheckoutLoading(false);
    }
  };

  // Fetch checklist
  const { data: checklist, isLoading } = useQuery<ChecklistResponse>({
    queryKey: ['checklist', saleId],
    queryFn: async () => {
      const res = await api.get(`/checklist/${saleId}`);
      return res.data;
    },
    enabled: !!saleId && typeof saleId === 'string',
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  // Update task mutation
  const { mutate: updateTask } = useMutation({
    mutationFn: async (payload: { itemId: string; completed: boolean }) => {
      return api.patch(`/checklist/${saleId}`, payload);
    },
    onMutate: async (payload) => {
      // Cancel in-flight re-fetches
      await queryClient.cancelQueries({ queryKey: ['checklist', saleId] });
      // Snapshot current data
      const previous = queryClient.getQueryData<ChecklistResponse>(['checklist', saleId]);
      // Optimistically update
      queryClient.setQueryData<ChecklistResponse>(['checklist', saleId], (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === payload.itemId ? { ...item, completed: payload.completed } : item
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _payload, context) => {
      // Roll back on failure
      if (context?.previous) {
        queryClient.setQueryData(['checklist', saleId], context.previous);
      }
      showToast('Failed to update task', 'error');
    },
    onSuccess: () => {
      // Invalidate so the GET re-fetches from the now-committed DB state.
      // The optimistic update from onMutate stays visible until the refetch resolves.
      queryClient.invalidateQueries({ queryKey: ['checklist', saleId] });
      showToast('Task updated', 'success');
    },
  });

  if (!saleId || typeof saleId !== 'string') return null;

  const items = checklist?.items || [];
  const stageProgress = checklist?.stageProgress || [];

  // Find current (active) stage
  const currentStage =
    stageProgress.find((s) => !s.isComplete) || stageProgress[stageProgress.length - 1];

  // Auto-expand current stage
  React.useEffect(() => {
    if (currentStage && !expandedStage) {
      setExpandedStage(currentStage.label);
    }
  }, [currentStage, expandedStage]);

  // Handle test checkout success redirect
  React.useEffect(() => {
    if (router.query.testCheckout === 'success') {
      const type = router.query.type as string;
      const label = type === 'auction' ? 'Auction checkout' : 'Online checkout';
      showToast(`${label} test passed — inventory untouched ✓`, 'success');

      // Auto-check the relevant checklist item
      const itemId = type === 'auction' ? 'pre_auction_checkout' : 'pre_online_checkout';
      updateTask({ itemId, completed: true });

      // Clean URL
      const { testCheckout, type: _, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [router.query.testCheckout, showToast, router, updateTask]);

  // Calculate overall progress
  const totalTasks = items.length;
  const completedTasks = items.filter((i) => i.completed).length;
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Group items by stage
  const itemsByStage: Record<string, ChecklistItem[]> = {};
  items.forEach((item) => {
    if (!itemsByStage[item.stage]) {
      itemsByStage[item.stage] = [];
    }
    itemsByStage[item.stage].push(item);
  });

  const stageOrder = ['Setup', 'Cataloging', 'Pre-Sale', 'Live', 'Wrapping Up', 'Complete'];

  return (
    <>
      <Head>
        <title>Sale Progress | FindA.Sale</title>
        <meta name="description" content="Track your sale progress through all stages" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 py-6">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
              <Link href="/organizer/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">
                Dashboard
              </Link>
              <span>/</span>
              <span>Sale Progress</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Track Your Progress</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Complete tasks across 6 stages to successfully run your sale
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-12">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
            </div>
          ) : (
            <>
              {/* Overall Progress */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-8 border border-warm-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Overall Progress</h2>
                  <span className="text-2xl font-bold text-amber-600">{overallPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                  <div
                    className="bg-amber-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {completedTasks} of {totalTasks} tasks completed
                </p>
              </div>

              {/* Timeline */}
              <div className="mb-12">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4 uppercase tracking-wide">
                  Progress Timeline
                </h3>
                <div className="flex items-center justify-between gap-1 mb-8">
                  {stageProgress.map((stage, idx) => (
                    <div key={stage.stageId} className="flex flex-col items-center flex-1">
                      {/* Dot */}
                      <button
                        onClick={() => setExpandedStage(stage.label)}
                        className={`
                          w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all
                          ${stage.isComplete
                            ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                            : currentStage?.label === stage.label
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 ring-2 ring-amber-600'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }
                        `}
                      >
                        {stage.isComplete ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </button>

                      {/* Label */}
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 text-center leading-tight">
                        {stage.label}
                      </p>

                      {/* Progress */}
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {stage.completed}/{stage.total}
                      </p>

                      {/* Connector */}
                      {idx < stageProgress.length - 1 && (
                        <div
                          className={`
                            absolute w-12 h-0.5 -right-6 top-6
                            ${stage.isComplete
                              ? 'bg-green-600 dark:bg-green-400'
                              : currentStage?.label === stage.label || idx < stageProgress.findIndex((s) => !s.isComplete)
                              ? 'bg-amber-600 dark:bg-amber-400'
                              : 'bg-gray-300 dark:bg-gray-600'
                            }
                          `}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {stageOrder.map((stageName) => {
                  const stageData = stageProgress.find((s) => s.label === stageName);
                  const stageTasks = itemsByStage[stageName] || [];

                  if (!stageData || stageTasks.length === 0) return null;

                  const isActive = currentStage?.label === stageName;
                  const isComplete = stageData.isComplete;
                  const isFuture = !isComplete && !isActive;

                  return (
                    <div
                      key={stageName}
                      className={`
                        border rounded-lg transition-all
                        ${isComplete
                          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                          : isActive
                          ? 'border-amber-400 dark:border-amber-600 bg-white dark:bg-gray-800 ring-1 ring-amber-400 dark:ring-amber-600'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                        }
                        ${isFuture ? 'opacity-50' : ''}
                      `}
                    >
                      {/* Stage Header */}
                      <button
                        onClick={() => setExpandedStage(expandedStage === stageName ? null : stageName)}
                        className="w-full p-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`
                              p-2 rounded-lg
                              ${isComplete
                                ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                                : isActive
                                ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                              }
                            `}
                          >
                            {stageIcons[stageName]}
                          </div>
                          <div className="text-left">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{stageName}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {stageData.completed} of {stageData.total} tasks
                            </p>
                          </div>
                        </div>
                        <ArrowRight
                          className={`
                            w-5 h-5 transition-transform
                            ${expandedStage === stageName ? 'rotate-90' : ''}
                            text-gray-600 dark:text-gray-400
                          `}
                        />
                      </button>

                      {/* Stage Tasks */}
                      {expandedStage === stageName && (
                        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
                          {stageTasks.map((task) => (
                            <div key={task.id} className="flex items-start gap-3 group">
                              {/* Checkbox — always present for non-auto tasks */}
                              {!task.isAuto && (
                                <button
                                  onClick={() => updateTask({ itemId: task.id, completed: !task.completed })}
                                  className={`
                                    mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all
                                    border-gray-300 dark:border-gray-600 hover:border-amber-600 dark:hover:border-amber-400
                                    ${task.completed
                                      ? 'bg-green-600 dark:bg-green-700 border-green-600 dark:border-green-700'
                                      : ''
                                    }
                                  `}
                                >
                                  {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                                </button>
                              )}

                              {/* Checkbox — disabled state for auto tasks */}
                              {task.isAuto && (
                                <div
                                  className={`
                                    mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all
                                    bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-not-allowed
                                    ${task.completed
                                      ? 'bg-green-600 dark:bg-green-700 border-green-600 dark:border-green-700'
                                      : ''
                                    }
                                  `}
                                >
                                  {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                                </div>
                              )}

                              {/* Label (clickable link if link exists, plain text for auto tasks) */}
                              <div className="flex-1">
                                {task.isAuto ? (
                                  <label className={`
                                    text-sm transition-all block
                                    ${task.completed
                                      ? 'line-through text-gray-500 dark:text-gray-500'
                                      : 'text-gray-900 dark:text-gray-100'
                                    }
                                    cursor-not-allowed
                                  `}>
                                    {task.label}
                                  </label>
                                ) : task.link ? (
                                  <Link
                                    href={task.link}
                                    className={`
                                      block text-sm transition-colors py-0.5 px-1
                                      ${task.completed
                                        ? 'line-through text-gray-500 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                                        : 'text-gray-900 dark:text-gray-100 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer'
                                      }
                                    `}
                                  >
                                    {task.label}
                                  </Link>
                                ) : (
                                  <label className={`
                                    text-sm transition-all block
                                    ${task.completed
                                      ? 'line-through text-gray-500 dark:text-gray-500'
                                      : 'text-gray-900 dark:text-gray-100'
                                    }
                                    cursor-pointer
                                  `}>
                                    {task.label}
                                  </label>
                                )}
                              </div>

                              {/* Badges + Test Buttons */}
                              <div className="flex gap-2 flex-shrink-0 items-center">
                                {task.isAuto && (
                                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                    Auto
                                  </span>
                                )}
                                {task.tier && (
                                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                    {task.tier}
                                  </span>
                                )}
                                {!task.completed && task.id === 'live_pos' && (
                                  <button
                                    onClick={handlePosTest}
                                    disabled={posTestLoading}
                                    className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white transition"
                                  >
                                    {posTestLoading ? '…' : 'Run Test'}
                                  </button>
                                )}
                                {!task.completed && task.id === 'pre_online_checkout' && (
                                  <button
                                    onClick={handleOnlineCheckout}
                                    disabled={onlineCheckoutLoading}
                                    className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white transition"
                                  >
                                    {onlineCheckoutLoading ? '…' : 'Run Test'}
                                  </button>
                                )}
                                {!task.completed && task.id === 'pre_auction_checkout' && (
                                  <button
                                    onClick={handleAuctionCheckout}
                                    disabled={auctionCheckoutLoading}
                                    className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white transition"
                                  >
                                    {auctionCheckoutLoading ? '…' : 'Run Test'}
                                  </button>
                                )}
                                {!task.completed && task.id === 'pre_in_app_payment' && (
                                  <button
                                    onClick={() => setShowTestInAppModal(true)}
                                    className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white transition"
                                  >
                                    Run Test
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {showTestInAppModal && typeof saleId === 'string' && (
        <TestCheckoutModal
          saleId={saleId}
          onClose={() => setShowTestInAppModal(false)}
          onDone={() => {
            setShowTestInAppModal(false);
            updateTask({ itemId: 'pre_in_app_payment', completed: true });
          }}
        />
      )}
    </>
  );
};

export default SalePlanPage;
