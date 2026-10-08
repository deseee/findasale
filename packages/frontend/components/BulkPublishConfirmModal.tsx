/**
 * BulkPublishConfirmModal
 *
 * Confirmation for publishing the selected items from the Add Items toolbar.
 * Shows how many will go live and how many are already published (skipped).
 */

import React from 'react';
import AccessibleModal from './AccessibleModal';

interface BulkPublishConfirmModalProps {
  isOpen: boolean;
  /** Items that will actually be published. */
  publishCount: number;
  /** Selected items that are already published and will be left alone. */
  alreadyPublishedCount: number;
  sampleTitles: string[];
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

const BulkPublishConfirmModal: React.FC<BulkPublishConfirmModalProps> = ({
  isOpen,
  publishCount,
  alreadyPublishedCount,
  sampleTitles,
  onCancel,
  onConfirm,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onCancel}
      ariaLabelledBy="bulk-publish-confirm-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl border-l-4 border-l-amber-600">
        <h3 id="bulk-publish-confirm-title" className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
          Publish {publishCount} item{publishCount !== 1 ? 's' : ''}?
        </h3>
        <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
          Published items become visible to shoppers on your sale.
          {alreadyPublishedCount > 0 && (
            <span className="block mt-1 text-warm-600 dark:text-warm-400">
              {alreadyPublishedCount} selected item{alreadyPublishedCount !== 1 ? 's are' : ' is'} already published and will be skipped.
            </span>
          )}
        </p>
        {sampleTitles.length > 0 && (
          <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-700/50 rounded border border-warm-200 dark:border-gray-600">
            <ul className="space-y-1 text-sm text-warm-700 dark:text-warm-300">
              {sampleTitles.slice(0, 3).map((t, i) => (
                <li key={i} className="truncate">&bull; {t}</li>
              ))}
            </ul>
            {publishCount > 3 && (
              <p className="text-xs text-warm-600 dark:text-warm-400 mt-2">
                +{publishCount - 3} more item{publishCount - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 rounded hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || publishCount === 0}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default BulkPublishConfirmModal;
