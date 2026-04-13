/**
 * BulkStatusModal
 *
 * Modal to set status for selected items.
 * Shows status dropdown with standard estate sale statuses.
 */

import React, { useState } from 'react';

interface BulkStatusModalProps {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (status: string) => Promise<void>;
  loading?: boolean;
}

const ITEM_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'RESERVED', label: 'Reserved' },
];

const BulkStatusModal: React.FC<BulkStatusModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onApply,
  loading = false,
}) => {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedStatus.trim()) {
      setError('Please select a status');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(selectedStatus);
      setSelectedStatus('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
        {/* Header */}
        <h3 className="text-lg font-bold text-warm-900 mb-4">Set Status</h3>

        {/* Info */}
        <p className="text-warm-700 mb-4 text-sm">
          Update status for <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}.
        </p>

        {/* Status Dropdown */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setError('');
            }}
            disabled={isApplying || loading}
            className="w-full px-3 py-2 border border-warm-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            <option value="">Select a status...</option>
            {ITEM_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {/* Info Note */}
        <p className="text-xs text-warm-600 mb-4">
          Some statuses may not be allowed depending on item state (e.g., cannot delete SOLD items).
        </p>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
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
            disabled={!selectedStatus || isApplying || loading}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {isApplying || loading ? 'Updating...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkStatusModal;
