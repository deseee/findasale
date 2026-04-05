import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useToast } from './ToastContext';
import api from '../lib/api';

interface HoldItem {
  reservationId: string;
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  shopperId: string;
  shopperName: string;
  shopperEmail: string;
  expiresAt: string;
}

interface PosInvoiceModalProps {
  hold: HoldItem;
  onClose: () => void;
  onSent: (reservationId: string) => void;
}

export default function PosInvoiceModal({ hold, onClose, onSent }: PosInvoiceModalProps) {
  const { showToast } = useToast();
  const [deliverVia, setDeliverVia] = useState<'EMAIL' | 'SMS' | 'BOTH'>('EMAIL');
  const [expiryHours, setExpiryHours] = useState(24);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemTotal = hold.itemPrice / 100;

  const handleSendInvoice = async () => {
    setSending(true);
    setError(null);

    try {
      await api.post(`/pos/holds/${hold.reservationId}/invoice`, {
        deliverVia,
        expiryHours,
      });

      setSent(true);
      showToast(`Invoice sent to ${hold.shopperEmail}`, 'success');
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || 'Failed to send invoice';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDone = () => {
    onSent(hold.reservationId);
    onClose();
  };

  const calculateExpiryDate = (): string => {
    const now = new Date();
    now.setHours(now.getHours() + expiryHours);
    return now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {sent ? 'Invoice Sent' : 'Send Invoice'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!sent ? (
            <>
              {/* Shopper Name */}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {hold.shopperName}
              </p>

              {/* Item Summary */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
                  Items (1):
                </p>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-900 dark:text-white">• {hold.itemTitle}</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      Total
                    </span>
                    <span className="text-sm font-semibold text-sage-700 dark:text-sage-400">
                      ${itemTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Send Via */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Send via:
                </p>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="deliverVia"
                      value="EMAIL"
                      checked={deliverVia === 'EMAIL'}
                      onChange={(e) => setDeliverVia(e.target.value as 'EMAIL')}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-gray-900 dark:text-white">
                      Email: {hold.shopperEmail}
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer opacity-50">
                    <input
                      type="radio"
                      name="deliverVia"
                      value="SMS"
                      disabled
                      className="w-4 h-4 cursor-not-allowed"
                    />
                    <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
                      SMS (coming soon)
                    </span>
                  </label>
                </div>
              </div>

              {/* Expiry */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Expiry:
                </p>
                <div className="space-y-2">
                  {[
                    { hours: 24, label: '24 hours (default)' },
                    { hours: 168, label: '7 days' },
                    { hours: 720, label: '30 days' },
                  ].map((option) => (
                    <label key={option.hours} className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="expiry"
                        value={option.hours}
                        checked={expiryHours === option.hours}
                        onChange={(e) => setExpiryHours(Number(e.target.value))}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="ml-3 text-sm text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleSendInvoice}
                  disabled={sending}
                  className="flex-1 py-2.5 rounded-lg bg-sage-700 text-white text-sm font-semibold hover:bg-sage-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sending ? 'Sending...' : 'Send Invoice'}
                </button>
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="flex-1 py-2.5 rounded-lg bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 text-sm font-semibold hover:bg-warm-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Invoice sent to
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  {hold.shopperEmail}
                </p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 text-left space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {calculateExpiryDate()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      Awaiting payment
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleDone}
                  className="w-full py-2.5 rounded-lg bg-sage-700 text-white text-sm font-semibold hover:bg-sage-800 transition"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
