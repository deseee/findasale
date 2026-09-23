/**
 * BulkStatusModal
 *
 * Modal to set status for selected items.
 * Shows status dropdown with standard estate sale statuses.
 *
 * 2026-09-06 (BYOR): added "Sold -- outside FindA.Sale" as a distinct
 * option from the existing "Sold" status. Patrick's direction was to add
 * the new off-platform-sale capability to this existing select + dropdown
 * control rather than build a brand-new separate action/modal. Selecting
 * it does not fire the generic bulk status update (that endpoint has no
 * concept of this value) -- it expands an inline confirmation with
 * optional bookkeeping fields and calls a dedicated per-item endpoint
 * instead (see onApplyOffPlatform).
 */

import React, { useState } from 'react';
import Link from 'next/link';
import AccessibleModal from './AccessibleModal';

export interface OffPlatformFields {
  reportedAmount?: string;
  paymentMethodNote?: string;
  buyerNameNote?: string;
  buyerEmailNote?: string;
}

interface BulkStatusModalProps {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (status: string) => Promise<void>;
  loading?: boolean;
  /** Whether the organizer has opted in to Off-Platform Sales billing. */
  offPlatformEnabled?: boolean;
  /** Where to send the organizer to turn it on. */
  offPlatformSettingsHref?: string;
  /** Called instead of onApply when "Sold -- outside FindA.Sale" is confirmed. */
  onApplyOffPlatform?: (fields: OffPlatformFields) => Promise<void>;
}

const ITEM_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'RESERVED', label: 'Reserved' },
];

export const OFF_PLATFORM_STATUS_VALUE = 'SOLD_OFF_PLATFORM';

const BulkStatusModal: React.FC<BulkStatusModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onApply,
  loading = false,
  offPlatformEnabled = false,
  offPlatformSettingsHref = '/organizer/settings?tab=subscription',
  onApplyOffPlatform,
}) => {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const [reportedAmount, setReportedAmount] = useState('');
  const [paymentMethodNote, setPaymentMethodNote] = useState('');
  const [buyerNameNote, setBuyerNameNote] = useState('');
  const [buyerEmailNote, setBuyerEmailNote] = useState('');

  if (!isOpen) return null;

  const isOffPlatform = selectedStatus === OFF_PLATFORM_STATUS_VALUE;

  const resetOffPlatformFields = () => {
    setReportedAmount('');
    setPaymentMethodNote('');
    setBuyerNameNote('');
    setBuyerEmailNote('');
  };

  const handleClose = () => {
    setSelectedStatus('');
    setError('');
    resetOffPlatformFields();
    onClose();
  };

  const handleApply = async () => {
    if (!selectedStatus.trim()) {
      setError('Please select a status');
      return;
    }

    if (isOffPlatform) {
      if (!offPlatformEnabled) {
        setError('Turn on Off-Platform Sales in Settings first');
        return;
      }
      setIsApplying(true);
      try {
        await onApplyOffPlatform?.({
          reportedAmount: reportedAmount.trim() || undefined,
          paymentMethodNote: paymentMethodNote.trim() || undefined,
          buyerNameNote: buyerNameNote.trim() || undefined,
          buyerEmailNote: buyerEmailNote.trim() || undefined,
        });
        setSelectedStatus('');
        resetOffPlatformFields();
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to mark items sold off-platform');
      } finally {
        setIsApplying(false);
      }
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
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledBy="bulk-status-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <h3 id="bulk-status-modal-title" className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Set Status</h3>

        {/* Info */}
        <p className="text-warm-700 dark:text-gray-300 mb-4 text-sm">
          Update status for <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}.
        </p>

        {/* Status Dropdown */}
        <div className="mb-4">
          <label htmlFor="status-select" className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-2">
            Status
          </label>
          <select
            id="status-select"
            value={selectedStatus}
            aria-invalid={!!error}
            aria-describedby={error ? "status-error" : undefined}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setError('');
              if (e.target.value !== OFF_PLATFORM_STATUS_VALUE) resetOffPlatformFields();
            }}
            disabled={isApplying || loading}
            className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100"
          >
            <option value="">Select a status...</option>
            {ITEM_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
            <option value={OFF_PLATFORM_STATUS_VALUE}>Sold outside FindA.Sale (cash, Venmo, etc.)</option>
          </select>
        </div>

        {/* Off-platform: not opted in yet -- explain and link out, never hide the option */}
        {isOffPlatform && !offPlatformEnabled && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-sm">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Off-Platform Sales isn&apos;t turned on for your account yet. Turn it on to mark items sold when a shopper pays you directly (cash, Venmo, your own card reader) instead of through FindA.Sale.
            </p>
            <Link
              href={offPlatformSettingsHref}
              className="font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Turn on Off-Platform Sales in Settings &rarr;
            </Link>
          </div>
        )}

        {/* Off-platform: opted in -- optional bookkeeping fields */}
        {isOffPlatform && offPlatformEnabled && (
          <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-700/50 border border-warm-200 dark:border-gray-600 rounded-lg">
            <p className="text-xs text-warm-600 dark:text-gray-400 mb-3">
              This marks the item{selectedCount !== 1 ? 's' : ''} sold without a FindA.Sale-processed payment, for cash, Venmo, or other outside-the-app sales. Everything below is optional, for your own records.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="off-platform-amount" className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                  Amount received (optional)
                </label>
                <input
                  id="off-platform-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={reportedAmount}
                  onChange={(e) => setReportedAmount(e.target.value)}
                  disabled={isApplying || loading}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="off-platform-method" className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                  Payment method (optional)
                </label>
                <input
                  id="off-platform-method"
                  type="text"
                  value={paymentMethodNote}
                  onChange={(e) => setPaymentMethodNote(e.target.value)}
                  disabled={isApplying || loading}
                  placeholder="Cash, Venmo, Zelle, etc."
                  className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="off-platform-buyer-name" className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Buyer name (optional)
                  </label>
                  <input
                    id="off-platform-buyer-name"
                    type="text"
                    value={buyerNameNote}
                    onChange={(e) => setBuyerNameNote(e.target.value)}
                    disabled={isApplying || loading}
                    className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="off-platform-buyer-email" className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                    Buyer email (optional)
                  </label>
                  <input
                    id="off-platform-buyer-email"
                    type="email"
                    value={buyerEmailNote}
                    onChange={(e) => setBuyerEmailNote(e.target.value)}
                    disabled={isApplying || loading}
                    className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Note */}
        {!isOffPlatform && (
          <p className="text-xs text-warm-600 dark:text-gray-400 mb-4">
            Some statuses may not be allowed depending on item state (e.g., cannot delete SOLD items).
          </p>
        )}

        {/* Error Message */}
        {error && (
          <div id="status-error" role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={isApplying || loading}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 rounded hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedStatus || isApplying || loading || (isOffPlatform && !offPlatformEnabled)}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {isApplying || loading ? 'Updating...' : (isOffPlatform ? 'Mark Sold' : 'Apply')}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default BulkStatusModal;
