/**
 * HoldToPayModal Component
 * Organizer confirmation modal for Mark Sold with hold-to-pay flow.
 * Shows item details, fees breakdown, and sends invoice to shopper.
 */

import { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useFeedbackSurvey } from '../hooks/useFeedbackSurvey';
import AccessibleModal from './AccessibleModal';

interface HoldToPayModalProps {
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  itemPhoto?: string;
  shopperId: string;
  shopperName: string;
  shopperEmail: string;
  organizerTier: 'SIMPLE' | 'PRO' | 'TEAMS';
  expiresAt: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isAuction?: boolean;
  /**
   * Every hold that will land on this ONE invoice. The server bundles by shopper + sale
   * (markSoldAndCreateInvoice), so a click on a single hold can bill several items. When
   * more than one is passed, the modal itemises them -- the organizer should never send a
   * 2-item invoice believing it was a 1-item invoice.
   */
  bundleItems?: { id: string; title: string; price: number; photoUrl?: string }[];
}

interface InvoiceResponse {
  invoiceId: string;
  stripeSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  itemPrice: number;
  platformFeeAmount: number;
  estimatedOrganizerPayout: number;
}

export default function HoldToPayModal({
  itemId,
  itemTitle,
  itemPrice,
  itemPhoto,
  shopperId,
  shopperName,
  shopperEmail,
  organizerTier,
  expiresAt,
  isOpen,
  onClose,
  onSuccess,
  isAuction = false,
  bundleItems,
}: HoldToPayModalProps) {
  const { showToast } = useToast();
  const { showSurvey } = useFeedbackSurvey();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBundle = (bundleItems?.length ?? 0) > 1;
  const platformFee = itemPrice * (organizerTier === 'PRO' ? 0.08 : 0.10);
  const estimatedPayout = itemPrice - platformFee;

  const handleSendInvoice = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post<InvoiceResponse>(
        `/reservations/${itemId}/mark-sold`,
        { action: 'markSold' }
      );

      showToast(
        `Invoice sent to ${shopperName} at ${shopperEmail}. Link expires in 2 hours.`,
        'success'
      );

      onClose();
      onSuccess?.();
      showSurvey('OG-3').catch(() => {});
    } catch (err: any) {
      const message =
        err.response?.data?.message || 'Failed to send invoice. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="hold-to-pay-modal-title"
      contentClassName="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto"
    >
      <h2 id="hold-to-pay-modal-title" className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Send Payment Request
      </h2>

        {/* Item Details */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          {itemPhoto && (
            <img
              src={itemPhoto}
              alt={itemTitle}
              className="w-full h-32 object-cover rounded-lg mb-3"
            />
          )}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {itemTitle}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              For: <span className="font-medium">{shopperName}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {shopperEmail}
            </p>
          </div>
        </div>

        {/* What is actually on this invoice. Only shown when the server will bundle more
            than one hold -- a single-item request needs no list. */}
        {isBundle && (
          <div className="mb-6 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              {bundleItems!.length} items on this one payment request
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              Everything {shopperName} is holding at this sale is billed together.
            </p>
            <ul className="mt-2 divide-y divide-blue-200/70 dark:divide-blue-800">
              {bundleItems!.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm text-blue-900 dark:text-blue-100 truncate">{b.title}</span>
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100 flex-shrink-0">
                    ${b.price.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Price Breakdown */}
        <div className="mb-6 space-y-2 border-t border-b border-gray-200 dark:border-gray-700 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{isBundle ? 'Invoice total' : 'Item Price'}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              ${itemPrice.toFixed(2)}
            </span>
          </div>
          {isAuction && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Platform Fee ({organizerTier === 'PRO' ? '8%' : '10%'})
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                -${platformFee.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2">
            <span className="text-gray-900 dark:text-gray-100">{isAuction ? 'You Receive (after Stripe fees)' : 'You Receive'}</span>
            <span className="text-amber-600 dark:text-amber-400">
              ~${estimatedPayout.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Expiry Info */}
        <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>Payment Link Expires:</strong> {new Date(expiresAt).toLocaleString()}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {shopperName} gets an email with a secure payment link for this amount. The
            items stay held for them until they pay or the link expires, and they can
            retry as many times as they need before then. Anything else they are holding
            at this sale is bundled into the same payment.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvoice}
            disabled={isLoading}
            className="flex-1 py-2 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Sending...' : 'Send Invoice'}
          </button>
        </div>
    </AccessibleModal>
  );
}
