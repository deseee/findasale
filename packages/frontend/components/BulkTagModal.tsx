/**
 * BulkTagModal
 *
 * Modal for bulk tag operations:
 * - Shows curated tags as checkboxes
 * - Toggle between Add/Remove mode
 * - Calls POST /api/items/bulk with operation: 'tags'
 */

import React, { useState } from 'react';

interface BulkTagModalProps {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (operation: 'add' | 'remove', tags: string[]) => Promise<void>;
  loading?: boolean;
}

// Curated tags vocabulary — matches backend expectation
const CURATED_TAGS = [
  'Antique',
  'Collectible',
  'Vintage',
  'Handmade',
  'Local Artist',
  'Furniture',
  'Decor',
  'Electronics',
  'Kitchen',
  'Textiles',
  'Art',
  'Books',
  'Jewelry',
  'Tools',
  'Sports',
  'Games',
  'Toys',
  'Fashion',
  'Plants',
  'Other',
];

const BulkTagModal: React.FC<BulkTagModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onApply,
  loading = false,
}) => {
  const [operation, setOperation] = useState<'add' | 'remove'>('add');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleTagToggle = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setSelectedTags(newTags);
    setError('');
  };

  const handleApply = async () => {
    if (selectedTags.size === 0) {
      setError('Please select at least one tag');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(operation, Array.from(selectedTags));
      setSelectedTags(new Set());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update tags');
    } finally {
      setIsApplying(false);
    }
  };

  const isFormValid = selectedTags.size > 0 && !isApplying && !loading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <h3 className="text-lg font-bold text-warm-900 mb-4">Manage Tags</h3>

        {/* Info */}
        <p className="text-warm-700 mb-4 text-sm">
          {operation === 'add' ? 'Add' : 'Remove'} tags for{' '}
          <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}.
        </p>

        {/* Operation Toggle */}
        <div className="mb-6 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="tagOperation"
              value="add"
              checked={operation === 'add'}
              onChange={(e) => {
                setOperation(e.target.value as 'add' | 'remove');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
              disabled={isApplying || loading}
            />
            <span className="text-warm-700 font-medium">Add Tags</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="tagOperation"
              value="remove"
              checked={operation === 'remove'}
              onChange={(e) => {
                setOperation(e.target.value as 'add' | 'remove');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
              disabled={isApplying || loading}
            />
            <span className="text-warm-700 font-medium">Remove Tags</span>
          </label>
        </div>

        {/* Tags Checkboxes */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-3">
            Select tags:
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-warm-200 rounded bg-warm-50">
            {CURATED_TAGS.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-2 cursor-pointer hover:bg-warm-100 p-2 rounded transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedTags.has(tag)}
                  onChange={() => handleTagToggle(tag)}
                  disabled={isApplying || loading}
                  className="w-4 h-4 text-amber-600 rounded"
                />
                <span className="text-sm text-warm-700">{tag}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Selected Count */}
        {selectedTags.size > 0 && (
          <div className="mb-4 p-2 bg-amber-50 rounded text-sm text-amber-700">
            {selectedTags.size} tag{selectedTags.size !== 1 ? 's' : ''} selected
          </div>
        )}

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
            disabled={!isFormValid}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {isApplying || loading ? 'Updating...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkTagModal;
