/**
 * Crowdsourced Appraisal API
 *
 * Feature #54: Organizer appraisal management (submit requests, view community feedback)
 * Route: /organizer/appraisals
 * Tier gating: PRO minimum (SIMPLE redirected to /organizer/upgrade)
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import {
  useMyAppraisals,
  useAppraisalFeed,
  useCreateAppraisal,
  ITEM_CATEGORIES,
} from '../../hooks/useAppraisal';
import { useToast } from '../../components/ToastContext';
import AppraisalResponseForm from '../../components/AppraisalResponseForm';
import Skeleton from '../../components/Skeleton';
import TierGate from '../../components/TierGate';

type Tab = 'my-requests' | 'community-feed';

const AppraisalsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('my-requests');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [feedPage, setFeedPage] = useState(1);
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(
    new Set()
  );
  const [respondingToId, setRespondingToId] = useState<string | null>(null);

  // Submit form state
  const [submitForm, setSubmitForm] = useState({
    itemTitle: '',
    itemDescription: '',
    itemCategory: '',
    photoUrls: '',
  });

  // Hooks
  const { data: myData, isLoading: myLoading } = useMyAppraisals();
  const { data: feedData, isLoading: feedLoading } = useAppraisalFeed(
    feedPage
  );
  const createMutation = useCreateAppraisal();

  // Auth checks
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

  if (!user || !user.roles?.includes('ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!submitForm.itemTitle.trim()) {
      showToast('Item title is required', 'error');
      return;
    }

    const photoUrls = submitForm.photoUrls
      .split('\n')
      .map((url) => url.trim())
      .filter((url) => url);

    if (photoUrls.length === 0) {
      showToast('Please provide at least one photo URL', 'error');
      return;
    }

    try {
      await createMutation.mutateAsync({
        itemTitle: submitForm.itemTitle.trim(),
        itemDescription: submitForm.itemDescription.trim() || undefined,
        itemCategory: submitForm.itemCategory || undefined,
        photoUrls,
      });

      showToast('Appraisal request submitted successfully!', 'success');
      setShowSubmitForm(false);
      setSubmitForm({
        itemTitle: '',
        itemDescription: '',
        itemCategory: '',
        photoUrls: '',
      });
    } catch (error: any) {
      showToast(
        error.response?.data?.message || 'Failed to submit appraisal request',
        'error'
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200">
            Pending
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
            In Review
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
            Completed
          </span>
        );
      default:
        return null;
    }
  };

  const AppraisalCard = ({ request, showEstimateButton = false }: any) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
            {request.itemTitle}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            {getStatusBadge(request.status)}
            <span className="text-xs text-warm-500 dark:text-gray-400">
              {request.responseCount} estimate{request.responseCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {request.itemDescription && (
        <p className="text-sm text-warm-700 dark:text-gray-300 mb-3">
          {request.itemDescription}
        </p>
      )}

      {/* Category */}
      {request.itemCategory && (
        <p className="text-xs text-warm-500 dark:text-gray-400 mb-3">
          Category: {request.itemCategory}
        </p>
      )}

      {/* Photos */}
      {request.photoUrls && request.photoUrls.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto">
          {request.photoUrls.map((url: string, idx: number) => (
            <img
              key={idx}
              src={url}
              alt={`Photo ${idx + 1}`}
              className="h-16 w-16 rounded-md object-cover flex-shrink-0"
            />
          ))}
        </div>
      )}

      {/* Consensus */}
      {request.consensus && (
        <div className="bg-warm-50 dark:bg-gray-700 rounded-md p-3 mb-3">
          <p className="text-xs font-semibold text-warm-700 dark:text-gray-300 uppercase">
            Community Consensus
          </p>
          <p className="text-lg font-bold text-warm-900 dark:text-gray-100 mt-1">
            ${(request.consensus.estimatedLow / 100).toFixed(2)} –{' '}
            ${(request.consensus.estimatedHigh / 100).toFixed(2)}
          </p>
          <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">
            {request.consensus.confidenceScore}% confidence
          </p>
        </div>
      )}

      {/* Action buttons */}
      {showEstimateButton && request.status !== 'COMPLETED' && (
        <button
          onClick={() =>
            setRespondingToId(
              respondingToId === request.id ? null : request.id
            )
          }
          className="w-full text-sm px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors font-medium"
        >
          {respondingToId === request.id ? 'Cancel' : 'Add My Estimate'}
        </button>
      )}

      {request.status === 'COMPLETED' && (
        <button
          disabled
          className="w-full text-sm px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-md cursor-not-allowed font-medium"
        >
          AI Appraisal (Coming Soon)
        </button>
      )}

      {/* Estimate form */}
      {respondingToId === request.id && (
        <div className="mt-3 pt-3 border-t border-warm-200 dark:border-gray-700">
          <AppraisalResponseForm
            requestId={request.id}
            onSuccess={() => setRespondingToId(null)}
            onCancel={() => setRespondingToId(null)}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <Head>
        <title>Appraisals - FindA.Sale</title>
      </Head>

      <TierGate requiredTier="PRO" featureName="Appraisals" description="Get community and AI-powered appraisals on items. Submit requests, browse the feed, and contribute your expertise.">
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link
              href="/organizer/dashboard"
              className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
            >
              ← Dashboard
            </Link>
            <span className="text-warm-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
              Crowdsourced Appraisals
            </h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Submit button */}
          <div className="mb-8">
            <button
              onClick={() => setShowSubmitForm(!showSubmitForm)}
              className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors"
            >
              {showSubmitForm ? 'Cancel' : 'Submit New Request'}
            </button>
          </div>

          {/* Submit form */}
          {showSubmitForm && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-4">
                New Appraisal Request
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Item Title */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Item Title *
                  </label>
                  <input
                    type="text"
                    value={submitForm.itemTitle}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        itemTitle: e.target.value,
                      })
                    }
                    placeholder="e.g., Victorian Mahogany Chair"
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={submitForm.itemDescription}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        itemDescription: e.target.value,
                      })
                    }
                    placeholder="Add any details about condition, era, materials, etc."
                    rows={3}
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={submitForm.itemCategory}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        itemCategory: e.target.value,
                      })
                    }
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
                  >
                    <option value="">Select category...</option>
                    {Object.entries(ITEM_CATEGORIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Photo URLs */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Photo URLs (one per line) *
                  </label>
                  <textarea
                    value={submitForm.photoUrls}
                    onChange={(e) =>
                      setSubmitForm({
                        ...submitForm,
                        photoUrls: e.target.value,
                      })
                    }
                    placeholder="https://cloudinary.com/..."
                    rows={4}
                    className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm font-mono"
                    required
                  />
                </div>

                {/* Submit */}
                <div className="flex gap-2 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setShowSubmitForm(false)}
                    className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-900 dark:text-gray-100 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
                  >
                    {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-warm-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('my-requests')}
              className={`pb-3 px-2 font-semibold border-b-2 transition-colors ${
                activeTab === 'my-requests'
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200'
              }`}
            >
              My Requests
            </button>
            <button
              onClick={() => setActiveTab('community-feed')}
              className={`pb-3 px-2 font-semibold border-b-2 transition-colors ${
                activeTab === 'community-feed'
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-warm-600 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-200'
              }`}
            >
              Community Feed
            </button>
          </div>

          {/* My Requests Tab */}
          {activeTab === 'my-requests' && (
            <div>
              {myLoading && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              )}
              {!myLoading && (!myData || myData.requests.length === 0) && (
                <p className="text-center text-warm-500 dark:text-gray-400 py-8">
                  No requests yet. Submit one to get started!
                </p>
              )}
              {!myLoading &&
                myData?.requests.map((request) => (
                  <AppraisalCard
                    key={request.id}
                    request={request}
                    showEstimateButton={false}
                  />
                ))}
            </div>
          )}

          {/* Community Feed Tab */}
          {activeTab === 'community-feed' && (
            <div>
              {feedLoading && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              )}
              {!feedLoading && (!feedData || feedData.requests.length === 0) && (
                <p className="text-center text-warm-500 dark:text-gray-400 py-8">
                  No appraisals to review at the moment.
                </p>
              )}
              {!feedLoading &&
                feedData?.requests.map((request) => (
                  <AppraisalCard
                    key={request.id}
                    request={request}
                    showEstimateButton={true}
                  />
                ))}

              {/* Pagination */}
              {!feedLoading && feedData && feedData.hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setFeedPage(feedPage + 1)}
                    className="px-4 py-2 bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-gray-100 rounded-lg font-medium hover:bg-warm-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Load More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </TierGate>
    </>
  );
};

export default AppraisalsPage;
