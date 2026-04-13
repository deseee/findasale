/**
 * BulkCategoryModal
 *
 * Modal to set category for selected items.
 * Shows category dropdown and applies to all selected items.
 */

import React, { useState } from 'react';

interface BulkCategoryModalProps {
  isOpen: boolean;
  selectedCount: number;
  categories: string[];
  onClose: () => void;
  onApply: (category: string) => Promise<void>;
  loading?: boolean;
}

const BulkCategoryModal: React.FC<BulkCategoryModalProps> = ({
  isOpen,
  selectedCount,
  categories,
  onClose,
  onApply,
  loading = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedCategory.trim()) {
      setError('Please select a category');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(selectedCategory);
      setSelectedCategory('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
        {/* Header */}
        <h3 className="text-lg font-bold text-warm-900 mb-4">Set Category</h3>

        {/* Info */}
        <p className="text-warm-700 mb-4 text-sm">
          Update category for <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}.
        </p>

        {/* Category Dropdown */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setError('');
            }}
            disabled={isApplying || loading}
            className="w-full px-3 py-2 border border-warm-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            <option value="">Select a category...</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

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
            disabled={!selectedCategory || isApplying || loading}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {isApplying || loading ? 'Updating...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkCategoryModal;
