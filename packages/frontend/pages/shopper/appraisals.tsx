/**
 * Shopper Appraisals Page
 *
 * Shopper-facing view of the community appraisals feed
 * Route: /shopper/appraisals
 * Auth required: No (browse only), but auth required for estimate submission
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import {
  useAppraisalFeed,
  ITEM_CATEGORIES,
} from '../../hooks/useAppraisal';
import { useToast } from '../../components/ToastContext';
import AppraisalResponseForm from '../../components/AppraisalResponseForm';
import Skeleton from '../../components/Skeleton';

const ShopperAppraisalsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [feedPage, setFeedPage] = useState(1);
  const [respondingToId, setRespondingToId] = useState<string | null>(null);

  // Hooks
  const { data: feedData, isLoading: feedLoading } = useAppraisalFeed(
    feedPage
  );

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

  const AppraisalCard = ({ request }: any) => (
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
      {request.status !== 'COMPLETED' && (
        <button
          onClick={() => {
            if (!user) {
              router.push('/login?redirect=/shopper/appraisals');
              return;
            }
            setRespondingToId(
              respondingToId === request.id ? null : request.id
            );
          }}
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
          Smart Appraisal (Coming Soon)
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
        <title>Community Appraisals - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
              Community Appraisals
            </h1>
            <p className="text-sm text-warm-600 dark:text-gray-400 mt-1">
              Help price items and earn reputation
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Top explainer */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              Help fellow organizers price their items. Your expertise earns you reputation in the community and contributions to the Explorer&apos;s Guild.
            </p>
          </div>

          {/* Feed */}
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

          {/* Reputation note */}
          {!feedLoading && feedData && feedData.requests.length > 0 && (
            <p className="text-xs text-warm-500 dark:text-gray-400 mt-6 text-center">
              Appraisal responses contribute to your Explorer&apos;s Guild reputation.
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperAppraisalsPage;
