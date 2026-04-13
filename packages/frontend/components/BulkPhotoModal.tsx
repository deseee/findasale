/**
 * BulkPhotoModal
 *
 * Modal for bulk photo operations:
 * - Select operation: Add or Remove
 * - Input for photo URL(s)
 * - Shows selected item count
 * - Calls POST /api/items/bulk/photos
 */

import React, { useState } from 'react';

interface BulkPhotoModalProps {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onApply: (operation: 'add' | 'remove', photoUrls: string[]) => Promise<void>;
  loading?: boolean;
}

const BulkPhotoModal: React.FC<BulkPhotoModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onApply,
  loading = false,
}) => {
  const [operation, setOperation] = useState<'add' | 'remove'>('add');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const handleAddUrl = () => {
    setError('');

    if (!photoUrl.trim()) {
      setError('Please enter a photo URL');
      return;
    }

    if (!isValidUrl(photoUrl.trim())) {
      setError('Please enter a valid URL');
      return;
    }

    if (photoUrls.includes(photoUrl.trim())) {
      setError('This URL is already added');
      return;
    }

    if (operation === 'add' && photoUrls.length >= 5) {
      setError('Maximum 5 photos per operation');
      return;
    }

    setPhotoUrls([...photoUrls, photoUrl.trim()]);
    setPhotoUrl('');
  };

  const handleRemoveUrl = (index: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== index));
  };

  const handleApply = async () => {
    if (photoUrls.length === 0) {
      setError('Please add at least one photo URL');
      return;
    }

    setIsApplying(true);
    try {
      await onApply(operation, photoUrls);
      setPhotoUrls([]);
      setPhotoUrl('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update photos');
    } finally {
      setIsApplying(false);
    }
  };

  const isFormValid = photoUrls.length > 0 && !isApplying && !loading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <h3 className="text-lg font-bold text-warm-900 mb-4">Manage Photos</h3>

        {/* Info */}
        <p className="text-warm-700 mb-4 text-sm">
          {operation === 'add' ? 'Add' : 'Remove'} photos for{' '}
          <span className="font-semibold">{selectedCount}</span> item
          {selectedCount !== 1 ? 's' : ''}.
        </p>

        {/* Operation Toggle */}
        <div className="mb-6 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="operation"
              value="add"
              checked={operation === 'add'}
              onChange={(e) => {
                setOperation(e.target.value as 'add' | 'remove');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
              disabled={isApplying || loading}
            />
            <span className="text-warm-700 font-medium">Add Photos</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="operation"
              value="remove"
              checked={operation === 'remove'}
              onChange={(e) => {
                setOperation(e.target.value as 'add' | 'remove');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
              disabled={isApplying || loading}
            />
            <span className="text-warm-700 font-medium">Remove Photos</span>
          </label>
        </div>

        {/* Photo URL Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-2">
            Photo URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                setError('');
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddUrl();
                }
              }}
              placeholder="https://example.com/photo.jpg"
              className="flex-1 px-3 py-2 border border-warm-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              disabled={isApplying || loading}
            />
            <button
              onClick={handleAddUrl}
              disabled={isApplying || loading || !photoUrl.trim()}
              className="px-3 py-2 bg-amber-600 text-white text-sm font-semibold rounded hover:bg-amber-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Added URLs List */}
        {photoUrls.length > 0 && (
          <div className="mb-4 p-3 bg-warm-50 rounded border border-warm-200">
            <p className="text-xs font-semibold text-warm-700 mb-2">
              {photoUrls.length} URL{photoUrls.length !== 1 ? 's' : ''} ready:
            </p>
            <ul className="space-y-2">
              {photoUrls.map((url, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between text-sm text-warm-700 p-2 bg-white rounded border border-warm-100"
                >
                  <span className="truncate flex-1 text-xs">{url}</span>
                  <button
                    onClick={() => handleRemoveUrl(idx)}
                    disabled={isApplying || loading}
                    className="ml-2 text-red-600 hover:text-red-700 font-medium text-xs disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Helper text */}
        <p className="text-xs text-warm-600 mb-4">
          {operation === 'add'
            ? 'Add up to 5 photos per operation. Accepts any public image URL.'
            : 'Enter the exact URL to remove. Leave other fields empty to remove all instances.'}
        </p>

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

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

export default BulkPhotoModal;
