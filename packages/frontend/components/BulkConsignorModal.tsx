/**
 * BulkConsignorModal
 *
 * Modal to attach a consignor to multiple selected items in one action.
 * Cloned from BulkCategoryModal.tsx's structure -- same shape, consignor list
 * instead of a static category list (consignors are workspace data, fetched
 * by the parent page and passed down as a prop, same as `categories` is).
 */

import React, { useState } from 'react';
import AccessibleModal from './AccessibleModal';

interface ConsignorOption {
  id: string;
  name: string;
}

interface BulkConsignorModalProps {
  isOpen: boolean;
  selectedCount: number;
  consignors: ConsignorOption[];
  onClose: () => void;
  onApply: (consignorId: string) => Promise<void>;
  loading?: boolean;
}

const BulkConsignorModal: React.FC<BulkConsignorModalProps> = ({
  isOpen,
  selectedCount,
  consignors,
  onClose,
  onApply,
  loading = false,
}) => {
  const [selectedConsignorId, setSelectedConsignorId] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedConsignorId) {
      setError('Please select a consignor');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(selectedConsignorId);
      setSelectedConsignorId('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to attach consignor');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="bulk-consignor-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
        {/* Header */}
        <h3 id="bulk-consignor-modal-title" className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Attach Consignor</h3>

        {/* Info */}
        <p className="text-warm-700 mb-4 text-sm">
          Attach a consignor to <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}. Items already attributed to a vendor booth will be
          skipped.
        </p>

        {/* Consignor Dropdown */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Consignor
          </label>
          <select
            id="consignor-select"
            value={selectedConsignorId}
            aria-invalid={!!error}
            aria-describedby={error ? "consignor-error" : undefined}
            onChange={(e) => {
              setSelectedConsignorId(e.target.value);
              setError('');
            }}
            disabled={isApplying || loading}
            className="w-full px-3 py-2 border border-warm-300 dark:border-warm-600 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-warm-800 text-warm-900 dark:text-warm-100"
          >
            <option value="">Select a consignor...</option>
            {consignors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Error Message */}
        {error && (
          <div id="consignor-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isApplying || loading}
            className="px-4 py-2 border border-warm-300 text-warm-700 rounded hover:bg-warm-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedConsignorId || isApplying || loading}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {isApplying || loading ? 'Attaching...' : 'Apply'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default BulkConsignorModal;
