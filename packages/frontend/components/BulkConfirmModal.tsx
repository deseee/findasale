/**
 * BulkConfirmModal
 *
 * Confirmation modal for bulk operations with:
 * - Operation name and affected item count
 * - Sample items (first 3)
 * - Preview (dry-run) button
 * - Apply button
 * - Cancel button
 * - Highlight destructive operations (delete) in red
 */

import React, { useState } from 'react';

interface BulkConfirmModalProps {
  isOpen: boolean;
  operation: string;
  affectedCount: number;
  sampleItems: Array<{ id: string; title: string }>;
  onCancel: () => void;
  onApply: () => void;
  onPreview?: () => Promise<void>;
  loading?: boolean;
}

const BulkConfirmModal: React.FC<BulkConfirmModalProps> = ({
  isOpen,
  operation,
  affectedCount,
  sampleItems,
  onCancel,
  onApply,
  onPreview,
  loading = false,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  if (!isOpen) return null;

  const isDestructive = operation === 'delete';
  const operationLabel = {
    delete: 'Delete Items',
    isActive: 'Hide/Show Items',
    price: 'Update Price',
    category: 'Update Category',
    status: 'Update Status',
    tags: 'Update Tags',
    photos: 'Manage Photos',
    backgroundRemoved: 'Remove Background',
    draftStatus: 'Update Draft Status',
  }[operation] || operation;

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      if (onPreview) {
        await onPreview();
      }
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div
        className={`bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl border-l-4 ${
          isDestructive ? 'border-l-red-600' : 'border-l-amber-600'
        }`}
      >
        {/* Header */}
        <h3
          className={`text-lg font-bold mb-2 ${
            isDestructive ? 'text-red-900' : 'text-warm-900'
          }`}
        >
          Confirm {operationLabel}
        </h3>

        {/* Summary */}
        <p className="text-warm-700 mb-4 text-sm">
          This will affect <span className="font-semibold">{affectedCount}</span>{' '}
          item{affectedCount !== 1 ? 's' : ''}.
          {isDestructive && (
            <span className="block mt-2 text-red-700 font-medium">
              ⚠️ This action cannot be undone.
            </span>
          )}
        </p>

        {/* Sample Items */}
        {sampleItems.length > 0 && (
          <div className="mb-4 p-3 bg-warm-50 rounded border border-warm-200">
            <p className="text-xs font-semibold text-warm-700 mb-2">
              Sample items:
            </p>
            <ul className="space-y-1 text-sm text-warm-700">
              {sampleItems.slice(0, 3).map((item) => (
                <li key={item.id} className="truncate">
                  • {item.title}
                </li>
              ))}
            </ul>
            {sampleItems.length > 3 && (
              <p className="text-xs text-warm-600 mt-2">
                +{sampleItems.length - 3} more item{sampleItems.length - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading || previewLoading}
            className="px-4 py-2 border border-warm-300 text-warm-700 rounded hover:bg-warm-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>

          {onPreview && (
            <button
              onClick={handlePreview}
              disabled={loading || previewLoading}
              className="px-4 py-2 border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              {previewLoading ? 'Loading...' : 'Preview'}
            </button>
          )}

          <button
            onClick={onApply}
            disabled={loading || previewLoading}
            className={`px-4 py-2 text-white rounded font-semibold disabled:opacity-50 transition-colors ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {loading ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkConfirmModal;
