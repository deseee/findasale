import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import { useRouter } from 'next/router';
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle, Image as ImageIcon, CreditCard } from 'lucide-react';
import api from '../../../lib/api';
import { useToast } from '../../../components/ToastContext';
import CheckoutModal from '../../../components/CheckoutModal';
interface BountySubmission {
  id: string;
  bounty: {
    id: string;
    description?: string;
  };
  item: {
    id: string;
    title: string;
    price?: number;
    photoUrls: string[];
    saleId?: string;
  };
  organizer: {
    id: string;
    name: string;
  };
  status: string;
  submittedAt: string;
  expiresAt: string;
  message?: string;
}

interface DeclineModalState {
  isOpen: boolean;
  submissionId: string | null;
  message: string;
  isSubmitting: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING_REVIEW: { label: 'Pending Review', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  APPROVED: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  REJECTED: { label: 'Declined', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  EXPIRED: { label: 'Expired', color: 'text-gray-600', bgColor: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800' },
  PURCHASED: { label: 'Purchased', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' },
};

export default function SubmissionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [submissions, setSubmissions] = useState<BountySubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [declineModal, setDeclineModal] = useState<DeclineModalState>({
    isOpen: false,
    submissionId: null,
    message: '',
    isSubmitting: false,
  });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSubmission, setCheckoutSubmission] = useState<BountySubmission | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  useEffect(() => {
    loadSubmissions();
  }, [activeFilter]);

  const loadSubmissions = async () => {
    try {
      setIsLoading(true);
      const statusParam = activeFilter === 'all' ? '' : activeFilter.toUpperCase();
      const response = await api.get('/bounties/submissions', {
        params: statusParam ? { status: statusParam } : {},
      });
      setSubmissions(response.data.submissions || []);
    } catch (error: any) {
      console.error('Error fetching submissions:', error);
      showToast('Failed to load submissions', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    try {
      setApprovingId(submissionId);
      await api.patch(`/bounties/submissions/${submissionId}`, { action: 'APPROVE' });
      showToast('Submission approved!', 'success');
      await loadSubmissions();
    } catch (error: any) {
      console.error('Error approving submission:', error);
      showToast('Failed to approve submission', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const openDeclineModal = (submissionId: string) => {
    setDeclineModal((prev: DeclineModalState) => ({
      isOpen: true,
      submissionId,
      message: '',
      isSubmitting: false,
    }));
  };

  const handleDecline = async () => {
    if (!declineModal.submissionId) return;

    try {
      setDeclineModal((prev: DeclineModalState) => ({ ...prev, isSubmitting: true }));
      await api.patch(`/bounties/submissions/${declineModal.submissionId}`, {
        action: 'DECLINE',
        message: declineModal.message.trim() || undefined,
      });
      showToast('Submission declined', 'success');
      setDeclineModal({ isOpen: false, submissionId: null, message: '', isSubmitting: false });
      await loadSubmissions();
    } catch (error: any) {
      console.error('Error declining submission:', error);
      showToast('Failed to decline submission', 'error');
    } finally {
      setDeclineModal((prev: DeclineModalState) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleCompletePurchase = async (submission: BountySubmission) => {
    try {
      setPurchasingId(submission.id);
      setCheckoutError(null);
      const response = await api.post(`/bounties/submissions/${submission.id}/purchase`);
      setCheckoutSubmission(submission);
      setCheckoutOpen(true);
      showToast('Ready to complete purchase. Please proceed with payment.', 'info');
    } catch (error: any) {
      console.error('Error initiating bounty purchase:', error);
      if (error.response?.status === 402) {
        setCheckoutError('You need at least 50 XP to complete this bounty purchase. Visit /coupons to earn more XP.');
        showToast('Insufficient XP to complete this purchase', 'error');
      } else {
        const errorMsg = error.response?.data?.message || 'Failed to initiate purchase';
        setCheckoutError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } finally {
      setPurchasingId(null);
    }
  };

  const handleCheckoutClose = () => {
    setCheckoutOpen(false);
    setCheckoutSubmission(null);
    setCheckoutError(null);
  };

  const handleCheckoutSuccess = () => {
    showToast('Purchase completed successfully!', 'success');
    setCheckoutOpen(false);
    setCheckoutSubmission(null);
    loadSubmissions();
  };
  const isExpiringSoon = (expiresAt: string): boolean => {
    const now = new Date();
    const expireDate = new Date(expiresAt);
    const daysUntilExpiry = (expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const isExpired = (expiresAt: string): boolean => {
    return new Date(expiresAt) < new Date();
  };

  const filteredSubmissions = submissions.filter(submission => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'pending') return submission.status === 'PENDING_REVIEW';
    if (activeFilter === 'approved') return submission.status === 'APPROVED';
    if (activeFilter === 'rejected') return submission.status === 'REJECTED';
    return true;
  });

  return (
    <>
      <Head>
        <title>My Bounty Submissions - FindA.Sale</title>
        <meta name="description" content="Review and manage submissions to your bounties" />
      </Head>

      {/* Decline Modal */}
      {declineModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Decline Submission
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              The organizer will be notified that their submission doesn't match your bounty. Your bounty will remain open for other organizers to submit matches.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Optional Message <span className="text-gray-400">(leave blank for no message)</span>
              </label>
              <textarea
                value={declineModal.message}
                onChange={(e) => {
                  const text = e.target.value.slice(0, 500);
                  setDeclineModal(prev => ({ ...prev, message: text }));
                }}
                placeholder="e.g., Not quite what I was looking for, thanks for trying!"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {declineModal.message.length}/500
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeclineModal({ isOpen: false, submissionId: null, message: '', isSubmitting: false })}
                className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={declineModal.isSubmitting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {declineModal.isSubmitting ? 'Declining...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/shopper/bounties" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mb-4">
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Bounties</span>
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            My Bounty Submissions
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Review and manage submissions from organizers matching your bounties
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-200 dark:border-gray-700">
          {[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Declined' },
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeFilter === filter.value
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">Loading submissions...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 text-center">
            <Clock size={48} className="mx-auto mb-4 text-blue-500" />
            <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
              {activeFilter === 'all'
                ? 'No submissions yet'
                : `No ${activeFilter === 'pending' ? 'pending' : activeFilter === 'approved' ? 'approved' : 'declined'} submissions`}
            </h3>
            <p className="text-blue-800 dark:text-blue-300">
              {activeFilter === 'all'
                ? 'Post a bounty and organizers will match items to it.'
                : `Try adjusting your filters or post a new bounty to get more submissions.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSubmissions.map((submission: BountySubmission) => {
              const statusInfo = STATUS_LABELS[submission.status] || STATUS_LABELS.PENDING_REVIEW;
              const expiring = isExpiringSoon(submission.expiresAt) && submission.status === 'PENDING_REVIEW';
              const expired = isExpired(submission.expiresAt);
              const itemPhoto = submission.item.photoUrls?.[0];

              return (
                <div
                  key={submission.id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition-all overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row gap-4 p-6">
                    {/* Item Photo */}
                    <div className="flex-shrink-0 w-full sm:w-32 h-32 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                      {itemPhoto ? (
                        <img
                          src={itemPhoto}
                          alt={submission.item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={32} className="text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                            {submission.item.title}
                          </h3>
                          {submission.item.price && (
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                              ${submission.item.price.toFixed(2)}
                            </p>
                          )}
                        </div>
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 border ${statusInfo.bgColor}`}>
                          <span className={statusInfo.color}>{statusInfo.label}</span>
                        </span>
                      </div>

                      {/* Bounty and Organizer */}
                      <div className="space-y-2 mb-4 text-sm">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Bounty:</span> {submission.bounty.description || 'Custom bounty'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Organizer:</span> {submission.organizer.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 dark:text-gray-400">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Submitted:</span> {new Date(submission.submittedAt).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Expiry Warning */}
                        {expiring && (
                          <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-800">
                            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                            <p className="text-xs">
                              This submission expires {new Date(submission.expiresAt).toLocaleDateString()}. Approve or decline soon!
                            </p>
                          </div>
                        )}

                        {expired && submission.status === 'PENDING_REVIEW' && (
                          <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/20 p-3 rounded border border-gray-200 dark:border-gray-800">
                            <Clock size={16} className="mt-0.5 flex-shrink-0" />
                            <p className="text-xs">
                              This submission has expired and can no longer be reviewed.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {submission.status === 'PENDING_REVIEW' && !expired && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(submission.id)}
                            disabled={approvingId === submission.id}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            <CheckCircle size={16} />
                            {approvingId === submission.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => openDeclineModal(submission.id)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            <XCircle size={16} />
                            Decline
                          </button>
                        </div>
                      )}

                      {submission.status === 'APPROVED' && !expired && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleCompletePurchase(submission)}
                            disabled={purchasingId === submission.id}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          >
                            <CreditCard size={16} />
                            {purchasingId === submission.id ? 'Processing...' : 'Complete Purchase'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

      {/* Checkout Modal for Bounty Purchase */}
      {checkoutOpen && checkoutSubmission && (
        <CheckoutModal
          itemId={checkoutSubmission.item.id}
          itemTitle={checkoutSubmission.item.title}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Insufficient XP Error */}
      {checkoutError && (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 shadow-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{checkoutError}</p>
          <button
            onClick={() => setCheckoutError(null)}
            className="text-xs text-red-600 dark:text-red-400 hover:underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}
          </div>
        )}
      </div>
    </>
  );
}
