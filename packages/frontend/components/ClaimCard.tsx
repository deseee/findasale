/**
 * ClaimCard Component
 * For shoppers: displays pending payment requests with countdown timer and CTA.
 * Shows when shopper has an INVOICE_ISSUED hold (awaiting payment).
 */

import { useState } from 'react';
import HoldTimer from './HoldTimer';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface ClaimCardProps {
  invoiceId: string;
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  itemPhoto?: string;
  checkoutUrl: string;
  expiresAt: string;
  organizerName: string;
  onPaymentSuccess?: () => void;
  onReleaseHold?: () => void;
}

export default function ClaimCard({
  invoiceId,
  itemId,
  itemTitle,
  itemPrice,
  itemPhoto,
  checkoutUrl,
  expiresAt,
  organizerName,
  onPaymentSuccess,
  onReleaseHold,
}: ClaimCardProps) {
  const { showToast } = useToast();
  const [isReleasing, setIsReleasing] = useState(false);

  const handlePayment = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
    }
  };

  const handleReleaseHold = async () => {
    setIsReleasing(true);
    try {
      await api.delete(`/reservations/${itemId}`);
      showToast('Hold released', 'success');
      onReleaseHold?.();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to release hold';
      showToast(message, 'error');
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-700 rounded-xl p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-amber-900 dark:text-amber-100">Payment Requested</h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            From {organizerName}
          </p>
        </div>
        <div className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded">
          Pending
        </div>
      </div>

      {/* Item Info */}
      <div className="mb-4 flex gap-3">
        {itemPhoto && (
          <img
            src={itemPhoto}
            alt={itemTitle}
            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {itemTitle}
          </p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
            ${itemPrice.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Timer */}
      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
        <HoldTimer expiresAt={expiresAt} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handlePayment}
          className="flex-1 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors"
        >
          Complete Payment →
        </button>
      </div>

      {/* Secondary Action */}
      <button
        onClick={handleReleaseHold}
        disabled={isReleasing}
        className="w-full mt-2 py-1 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-medium disabled:opacity-50 transition-colors"
      >
        {isReleasing ? 'Releasing...' : 'Release Hold'}
      </button>
    </div>
  );
}
