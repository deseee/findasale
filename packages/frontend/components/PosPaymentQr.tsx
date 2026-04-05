/**
 * PosPaymentQr — Payment QR Code Component
 *
 * Displays payment QR code for shopper self-checkout.
 * States: idle (generate button), generating (spinner), waiting (QR displayed), paid (confirmation)
 * Features: Full-screen QR display, copy link (disabled for future), status indicators
 */

import { useState } from 'react';

interface PosPaymentQrProps {
  cartTotal: number;
  paymentLinkId: string;
  paymentLinkQr: string; // base64 data URL
  paymentLinkStatus: 'idle' | 'generating' | 'waiting' | 'paid';
  onGenerate: () => void;
  onNewTransaction: () => void;
}

export default function PosPaymentQr({
  cartTotal,
  paymentLinkId,
  paymentLinkQr,
  paymentLinkStatus,
  onGenerate,
  onNewTransaction,
}: PosPaymentQrProps) {
  const [fullScreenOpen, setFullScreenOpen] = useState(false);

  return (
    <>
      <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
        {/* Header */}
        <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
          📲 Shopper Scan to Pay
        </h4>
        <p className="text-xs text-warm-600 dark:text-warm-400 mb-4">
          Total: ${cartTotal.toFixed(2)}
        </p>

        {/* State: Idle (Generate Button) */}
        {(paymentLinkStatus === 'idle' || paymentLinkStatus === 'generating') && (
          <button
            onClick={onGenerate}
            disabled={paymentLinkStatus === 'generating'}
            className="w-full py-3 rounded-lg bg-sage-700 text-white font-semibold hover:bg-sage-800 transition disabled:opacity-50"
          >
            {paymentLinkStatus === 'generating' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generating…
              </span>
            ) : (
              'Generate QR Code'
            )}
          </button>
        )}

        {/* State: Waiting (QR Displayed) */}
        {paymentLinkStatus === 'waiting' && paymentLinkQr && (
          <div className="space-y-4">
            {/* QR Image */}
            <div className="flex justify-center">
              <div className="relative">
                <img
                  src={paymentLinkQr}
                  alt="Payment QR Code"
                  className="w-48 h-48 rounded-lg border-2 border-warm-200 dark:border-gray-600"
                />
              </div>
            </div>

            {/* Instruction Text */}
            <p className="text-center text-xs text-warm-600 dark:text-warm-400">
              Have the shopper scan this QR with their phone camera.
            </p>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFullScreenOpen(true)}
                className="flex-1 py-2 rounded-lg bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-semibold hover:bg-warm-200 dark:hover:bg-gray-600 transition"
              >
                Full Screen
              </button>
              <button
                disabled
                title="URL will be available in a future update"
                className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-semibold cursor-not-allowed opacity-50"
              >
                Copy Link
              </button>
            </div>

            {/* Status Indicator */}
            <div className="text-center">
              <p className="text-sm text-warm-600 dark:text-warm-400">
                ⏳ Waiting for payment…
              </p>
            </div>
          </div>
        )}

        {/* State: Paid (Confirmation) */}
        {paymentLinkStatus === 'paid' && (
          <div className="space-y-4">
            {/* Success Indicator */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
            </div>

            {/* Success Message */}
            <div className="text-center">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                Payment Received
              </p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                ${cartTotal.toFixed(2)}
              </p>
            </div>

            {/* New Transaction Button */}
            <button
              onClick={onNewTransaction}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
            >
              New Transaction
            </button>
          </div>
        )}
      </div>

      {/* Full Screen QR Modal */}
      {fullScreenOpen && paymentLinkQr && (
        <div
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-4"
          onClick={() => setFullScreenOpen(false)}
        >
          {/* Close Hint */}
          <p className="absolute top-4 left-4 text-xs text-warm-500 dark:text-warm-400">
            Tap to close
          </p>

          {/* Large QR Code */}
          <div className="flex-1 flex items-center justify-center">
            <img
              src={paymentLinkQr}
              alt="Payment QR Code - Full Screen"
              className="max-w-full max-h-full rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Footer Text */}
          <div className="text-center mt-8">
            <p className="text-sm text-warm-600 dark:text-warm-400">
              Have the shopper scan this QR with their phone camera.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
