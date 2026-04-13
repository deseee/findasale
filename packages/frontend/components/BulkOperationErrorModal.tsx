/**
 * BulkOperationErrorModal
 *
 * Displays error details from bulk operations.
 * Shows per-item errors and reasons why items were skipped.
 */

import React from 'react';

interface BulkOperationErrorModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  errors?: Array<{ itemId: string; reason: string }>;
  itemCount?: number;
  onClose: () => void;
}

const BulkOperationErrorModal: React.FC<BulkOperationErrorModalProps> = ({
  isOpen,
  title,
  message,
  errors,
  itemCount,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[80vh] overflow-y-auto border-l-4 border-l-red-600">
        {/* Header */}
        <h3 className="text-lg font-bold text-red-900 mb-2">{title}</h3>

        {/* Message */}
        <p className="text-warm-700 mb-4 text-sm">{message}</p>

        {/* Item Count Summary */}
        {itemCount !== undefined && (
          <p className="text-sm text-warm-600 mb-4">
            {itemCount} item{itemCount !== 1 ? 's' : ''} skipped
          </p>
        )}

        {/* Errors List */}
        {errors && errors.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
            <p className="text-xs font-semibold text-red-700 mb-2">Reasons:</p>
            <ul className="space-y-1 text-xs text-red-700">
              {errors.slice(0, 10).map((error, idx) => (
                <li key={idx} className="leading-snug">
                  <span className="font-medium">{error.itemId}:</span> {error.reason}
                </li>
              ))}
            </ul>
            {errors.length > 10 && (
              <p className="text-xs text-red-600 mt-2">
                ... and {errors.length - 10} more
              </p>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkOperationErrorModal;
