/**
 * Admin Video Pipeline Page — ADR-080 Stage 2 handoff UI.
 *
 * Added 2026-07-13 to close a real gap: before this page, the only way to
 * answer a staged question, reject a batch, or retry a FAILED one was a raw
 * authenticated fetch()/curl call to the backend routes in
 * routes/videoPipelineAdmin.ts. This page is the admin-facing surface for
 * those same routes -- it adds no new backend logic, it only calls:
 *   GET  /api/admin/video-pipeline/footage-batch/needs-input
 *   POST /api/admin/video-pipeline/footage-batch/:id/answer
 *   POST /api/admin/video-pipeline/footage-batch/:id/reject
 *   POST /api/admin/video-pipeline/footage-batch/:id/retry
 *   GET  /api/admin/video-pipeline/footage-batch/awaiting-review
 *   POST /api/admin/video-pipeline/footage-batch/:id/approve
 *
 * The awaiting-review section (added same day) closes a second real gap: the
 * render stage's staged review markdown used to live ONLY on Railway's
 * ephemeral filesystem -- never committed to git, unreachable once written.
 * It's now persisted in the DB and read straight from the API below.
 *
 * Mirrors the pattern in pages/admin/disputes.tsx (useAuth guard, useQuery +
 * useMutation, EmptyState, warm/amber palette, dark mode classes).
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

interface FootageBatchRow {
  id: string;
  status: 'NEEDS_INPUT' | 'FAILED';
  openQuestion: string | null;
  questionField: string | null;
  templateId: string | null;
  templateConfidence: number | null;
  reviewNotes: string | null;
  sealedAt: string | null;
  createdAt: string;
  assetCount: number;
}

interface AwaitingReviewBatchRow {
  id: string;
  templateId: string | null;
  templateConfidence: number | null;
  videoJobId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  stagedContent: string | null;
  updatedAt: string;
}

// A batch rendered BEFORE the 2026-07-13 notes-persistence fix stored only the
// on-disk markdown PATH in stagedFile (the actual content lived on an ephemeral
// server disk, now gone). Detect that legacy single-line path so the card can
// explain it instead of showing a bare path as if it were the review notes.
// Real notes always start with the multi-line "STATUS: AWAITING EDIT" body.
const CONTENT_PIPELINE_PATH_RE = /^[\w./-]*content-pipeline\/[\w./-]+\.md$/;
function looksLikeBareStagedPath(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return !trimmed.includes('\n') && CONTENT_PIPELINE_PATH_RE.test(trimmed);
}

const AdminVideoPipelinePage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectingReviewId, setRejectingReviewId] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  const isAdmin = !!user?.id && (user?.roles?.includes('ADMIN') || user?.role === 'ADMIN');

  const { data, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['admin-video-pipeline-needs-input'],
    queryFn: async () => {
      const response = await api.get('/admin/video-pipeline/footage-batch/needs-input');
      return response.data;
    },
    enabled: isAdmin,
    // Batches can also be answered/rejected via the raw API by hand (or by a
    // future automated flow) -- keep this list fresh without a manual refresh.
    refetchInterval: 20000,
  });

  const { data: reviewData, isLoading: isLoadingReview } = useQuery({
    queryKey: ['admin-video-pipeline-awaiting-review'],
    queryFn: async () => {
      const response = await api.get('/admin/video-pipeline/footage-batch/awaiting-review');
      return response.data;
    },
    enabled: isAdmin,
    refetchInterval: 20000,
  });

  const describeResult = (result: any): string => {
    if (!result) return 'Done.';
    if (result.status === 'ASSEMBLING') {
      return `Classified as ${result.templateId ?? 'a template'} (confidence ${result.templateConfidence ?? '?'}). Sent to render.`;
    }
    if (result.status === 'NEEDS_INPUT') {
      return `Next question staged: ${result.question ?? '(see list)'}`;
    }
    if (result.status === 'FAILED') {
      return 'Batch failed again -- check Railway logs.';
    }
    return `Result: ${result.status ?? 'unknown'}`;
  };

  const answerMutation = useMutation({
    mutationFn: async ({ batchId, answer }: { batchId: string; answer: string }) => {
      const response = await api.post(`/admin/video-pipeline/footage-batch/${batchId}/answer`, { answer });
      return response.data;
    },
    onSuccess: (data) => {
      showToast(describeResult(data?.result ?? { status: data?.status }), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-video-pipeline-needs-input'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to submit answer', 'error');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ batchId, reason }: { batchId: string; reason?: string }) => {
      const response = await api.post(`/admin/video-pipeline/footage-batch/${batchId}/reject`, { reason });
      return response.data;
    },
    onSuccess: () => {
      showToast('Batch rejected', 'success');
      setRejectingId(null);
      setRejectingReviewId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-video-pipeline-needs-input'] });
      queryClient.invalidateQueries({ queryKey: ['admin-video-pipeline-awaiting-review'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to reject batch', 'error');
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await api.post(`/admin/video-pipeline/footage-batch/${batchId}/retry`);
      return response.data;
    },
    onSuccess: (data) => {
      showToast(describeResult(data?.result ?? { status: data?.status }), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-video-pipeline-needs-input'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to retry batch', 'error');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await api.post(`/admin/video-pipeline/footage-batch/${batchId}/approve`);
      return response.data;
    },
    onSuccess: () => {
      showToast('Batch approved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-video-pipeline-awaiting-review'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to approve batch', 'error');
    },
  });

  if (!isLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!isLoading && user?.role !== 'ADMIN' && !user?.roles?.includes('ADMIN')) {
    router.push('/');
    return null;
  }

  const batches: FootageBatchRow[] = data?.batches || [];

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Head>
        <title>Video Pipeline | Admin Panel | FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Video Pipeline</h1>
            <Link href="/admin" className="text-amber-600 hover:text-amber-700 font-medium">
              Back to Admin
            </Link>
          </div>
          <p className="text-warm-600 dark:text-warm-400 text-sm mb-6">
            Footage batches blocked on a human -- either a staged question (NEEDS_INPUT) or an
            unrecoverable error (FAILED). Answering/retrying re-runs real classification (Vision +
            Whisper + OCR + Haiku) -- not free, not instant.
          </p>

          {isLoadingBatches ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-warm-200 dark:border-gray-700 border-t-amber-600 rounded-full"></div>
              </div>
              <p className="mt-4 text-warm-600 dark:text-warm-400">Loading batches...</p>
            </div>
          ) : batches.length === 0 ? (
            <EmptyState
              heading="Nothing needs you right now"
              subtext="No footage batches are staged on a question or stuck in a failed state."
            />
          ) : (
            <div className="space-y-4">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 shadow-sm overflow-hidden px-6 py-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        batch.status === 'FAILED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {batch.status}
                    </span>
                    <span className="text-xs text-warm-500 dark:text-warm-400">
                      {batch.assetCount} clip{batch.assetCount === 1 ? '' : 's'} · sealed{' '}
                      {formatDate(batch.sealedAt)}
                    </span>
                  </div>

                  <div className="text-xs text-warm-500 dark:text-warm-400 mb-3 font-mono break-all">
                    {batch.id}
                  </div>

                  {batch.status === 'NEEDS_INPUT' ? (
                    <p className="text-warm-800 dark:text-warm-200 text-sm mb-3">
                      {batch.openQuestion}
                    </p>
                  ) : (
                    <p className="text-warm-800 dark:text-warm-200 text-sm mb-3">
                      {batch.reviewNotes || 'Unrecoverable error during classification (no details recorded).'}
                    </p>
                  )}

                  {batch.status === 'NEEDS_INPUT' && (
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={answerDrafts[batch.id] ?? ''}
                        onChange={(e) =>
                          setAnswerDrafts((prev) => ({ ...prev, [batch.id]: e.target.value }))
                        }
                        placeholder="Type your answer..."
                        className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 text-sm"
                      />
                      <button
                        onClick={() =>
                          answerMutation.mutate({
                            batchId: batch.id,
                            answer: (answerDrafts[batch.id] ?? '').trim(),
                          })
                        }
                        disabled={answerMutation.isPending || !(answerDrafts[batch.id] ?? '').trim()}
                        className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm whitespace-nowrap"
                      >
                        Submit Answer
                      </button>
                    </div>
                  )}

                  {batch.status === 'FAILED' && (
                    <div className="mb-2">
                      <button
                        onClick={() => retryMutation.mutate(batch.id)}
                        disabled={retryMutation.isPending}
                        className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                      >
                        Retry Classification
                      </button>
                    </div>
                  )}

                  {rejectingId === batch.id ? (
                    <div className="flex gap-2 mt-2 border-t border-warm-200 dark:border-gray-700 pt-3">
                      <input
                        type="text"
                        value={rejectDrafts[batch.id] ?? ''}
                        onChange={(e) =>
                          setRejectDrafts((prev) => ({ ...prev, [batch.id]: e.target.value }))
                        }
                        placeholder="Reason (optional)..."
                        className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                      />
                      <button
                        onClick={() =>
                          rejectMutation.mutate({
                            batchId: batch.id,
                            reason: (rejectDrafts[batch.id] ?? '').trim() || undefined,
                          })
                        }
                        disabled={rejectMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm whitespace-nowrap"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => setRejectingId(null)}
                        className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRejectingId(batch.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium mt-1"
                    >
                      Reject this batch
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 mb-4">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">Awaiting Review</h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
              Batches that finished rendering. Review the video + staged notes, then approve or
              reject. Approving only records the decision -- there is no automatic publish yet.
            </p>
          </div>

          {isLoadingReview ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-warm-200 dark:border-gray-700 border-t-amber-600 rounded-full"></div>
              </div>
              <p className="mt-4 text-warm-600 dark:text-warm-400">Loading review queue...</p>
            </div>
          ) : (reviewData?.batches ?? []).length === 0 ? (
            <EmptyState
              heading="Nothing waiting on review"
              subtext="No rendered batches are currently staged for approval."
            />
          ) : (
            <div className="space-y-4">
              {(reviewData?.batches as AwaitingReviewBatchRow[]).map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 shadow-sm overflow-hidden px-6 py-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                      AWAITING_REVIEW
                    </span>
                    <span className="text-xs text-warm-500 dark:text-warm-400">
                      {batch.templateId ?? 'unknown template'}
                      {typeof batch.templateConfidence === 'number' ? ` · confidence ${batch.templateConfidence.toFixed(2)}` : ''}
                    </span>
                  </div>

                  <div className="text-xs text-warm-500 dark:text-warm-400 mb-3 font-mono break-all">
                    {batch.id}
                  </div>

                  {batch.videoUrl && (
                    <video
                      src={batch.videoUrl}
                      poster={batch.thumbnailUrl ?? undefined}
                      controls
                      className="w-full max-w-xs rounded-lg mb-3 bg-black"
                    />
                  )}

                  <button
                    onClick={() => setExpandedReviewId(expandedReviewId === batch.id ? null : batch.id)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium mb-2 block"
                  >
                    {expandedReviewId === batch.id ? 'Hide staged review notes' : 'View staged review notes'}
                  </button>

                  {expandedReviewId === batch.id &&
                    (looksLikeBareStagedPath(batch.stagedContent) ? (
                      <div className="text-xs bg-warm-50 dark:bg-gray-900 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 mb-3 text-warm-700 dark:text-warm-300">
                        Staged review notes were not saved for this batch. It was rendered before
                        notes were persisted to the database (fixed 2026-07-13), so only the
                        original file path remains —{' '}
                        <span className="font-mono break-all">{batch.stagedContent}</span> — and
                        that file lived on an ephemeral server disk that is now gone. Newly
                        rendered batches show their full notes here; re-render this shoot as a new
                        batch to regenerate them.
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg p-3 mb-3 max-h-96 overflow-y-auto text-warm-800 dark:text-warm-200">
                        {batch.stagedContent ?? '(no staged content recorded)'}
                      </pre>
                    ))}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => approveMutation.mutate(batch.id)}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                    >
                      Approve
                    </button>
                    {rejectingReviewId !== batch.id && (
                      <button
                        onClick={() => setRejectingReviewId(batch.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Reject this batch
                      </button>
                    )}
                  </div>

                  {rejectingReviewId === batch.id && (
                    <div className="flex gap-2 mt-3 border-t border-warm-200 dark:border-gray-700 pt-3">
                      <input
                        type="text"
                        value={rejectDrafts[batch.id] ?? ''}
                        onChange={(e) =>
                          setRejectDrafts((prev) => ({ ...prev, [batch.id]: e.target.value }))
                        }
                        placeholder="Reason (optional)..."
                        className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-900 dark:text-warm-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                      />
                      <button
                        onClick={() =>
                          rejectMutation.mutate({
                            batchId: batch.id,
                            reason: (rejectDrafts[batch.id] ?? '').trim() || undefined,
                          })
                        }
                        disabled={rejectMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm whitespace-nowrap"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => setRejectingReviewId(null)}
                        className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 font-medium rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminVideoPipelinePage;
