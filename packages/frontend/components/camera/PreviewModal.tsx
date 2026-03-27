/**
 * PreviewModal — Phase 3B item review overlay
 *
 * Full-screen overlay (mobile) / centered modal (desktop)
 * Shows large photo + AI tags with inline editing
 *
 * Fields: Title, Category, Condition, Description (truncated/expandable), Price (grayed)
 * Each field has pencil icon to edit inline
 *
 * Calls onSave with organizer edits when Done Reviewing is clicked
 * Saves via PATCH /api/items/:id
 */

import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastContext';
import api from '../../lib/api';

export interface PreviewModalProps {
  isOpen: boolean;
  item: {
    id: string;
    thumbnailUrl?: string;
    draftStatus: string;
    title?: string;
    category?: string;
    condition?: string;
    description?: string;
    aiErrorLog?: object;
  };
  onClose: () => void;
  onSave: (edits: {
    title?: string;
    category?: string;
    condition?: string;
    description?: string;
  }) => Promise<void>;
  onDelete: (itemId: string) => void;
  onRetake: (itemId: string) => void;
}

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools & Hardware',
  'Collectibles',
  'Electronics',
  'Books & Media',
  'Other',
];

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  item,
  onClose,
  onSave,
  onDelete,
  onRetake,
}) => {
  const { showToast } = useToast();
  const [edits, setEdits] = useState({
    title: item.title || '',
    category: item.category || '',
    condition: item.condition || '',
    description: item.description || '',
  });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandDescription, setExpandDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullItem, setFullItem] = useState<any>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Fetch full item data when modal opens to ensure we have AI-analyzed fields
  useEffect(() => {
    if (!isOpen || !item.id || item.id.startsWith('temp-')) {
      setFullItem(null);
      setImgFailed(false);
      return;
    }

    setImgFailed(false);
    setLoading(true);
    api
      .get(`/items/${item.id}`)
      .then((res) => {
        const fetchedItem = res.data;
        setFullItem(fetchedItem);
        // Update edits with fetched data
        setEdits({
          title: fetchedItem.title || '',
          category: fetchedItem.category || '',
          condition: fetchedItem.condition || '',
          description: fetchedItem.description || '',
        });
      })
      .catch((err) => {
        console.error('Failed to fetch full item data:', err);
        // Fallback to local state data
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, item.id]);

  if (!isOpen) return null;

  const aiErrored = item.draftStatus === 'DRAFT' && item.aiErrorLog;

  const handleSave = async () => {
    if (!edits.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave(edits);
      showToast('Item saved', 'success');
      onClose();
    } catch (error: any) {
      showToast(error.message || 'Failed to save item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (confirm('Delete this item? This cannot be undone.')) {
      onDelete(item.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">Review Item</h2>
          <button
            onClick={onClose}
            className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {aiErrored && (
          <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-400">
            AI analysis failed. Please review and fill in details manually.
            <button
              onClick={() => onRetake(item.id)}
              className="block mt-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium underline"
            >
              Retake photo
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Photo */}
          {(fullItem?.photoUrls?.[0] || item.thumbnailUrl) && (
            <div className="flex justify-center">
              {!imgFailed ? (
                <img
                  src={fullItem?.photoUrls?.[0] || item.thumbnailUrl}
                  alt={fullItem?.title || item.title || 'Item'}
                  className="max-h-80 rounded-lg shadow-md object-cover"
                  onError={() => {
                    setImgFailed(true);
                  }}
                />
              ) : (
                <div className="max-h-80 w-80 rounded-lg shadow-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-6xl">
                  📷
                </div>
              )}
            </div>
          )}

          {/* Loading state for missing fields */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-warm-600 dark:text-warm-400 bg-warm-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="w-4 h-4 border-2 border-warm-400 border-t-warm-600 rounded-full animate-spin" />
              Fetching item details...
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4">
            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-warm-700 dark:text-warm-300">Title *</label>
                <button
                  onClick={() =>
                    setEditingField(editingField === 'title' ? null : 'title')
                  }
                  className="text-amber-600 hover:text-amber-700 text-sm"
                >
                  ✏️
                </button>
              </div>
              {editingField === 'title' ? (
                <input
                  type="text"
                  value={edits.title}
                  onChange={(e) => setEdits({ ...edits, title: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="w-full px-3 py-2 border border-amber-400 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                />
              ) : (
                <p className="text-warm-900 dark:text-warm-100 font-semibold text-base">
                  {edits.title || '—'}
                </p>
              )}
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-warm-700 dark:text-warm-300">Category</label>
                <button
                  onClick={() =>
                    setEditingField(
                      editingField === 'category' ? null : 'category'
                    )
                  }
                  className="text-amber-600 hover:text-amber-700 text-sm"
                >
                  ✏️
                </button>
              </div>
              {editingField === 'category' ? (
                <select
                  value={edits.category}
                  onChange={(e) =>
                    setEdits({ ...edits, category: e.target.value })
                  }
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="w-full px-3 py-2 border border-amber-400 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-warm-700 dark:text-warm-300 text-sm">
                  {edits.category || '—'}
                </p>
              )}
            </div>

            {/* Condition */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-warm-700 dark:text-warm-300">Condition</label>
                <button
                  onClick={() =>
                    setEditingField(
                      editingField === 'condition' ? null : 'condition'
                    )
                  }
                  className="text-amber-600 hover:text-amber-700 text-sm"
                >
                  ✏️
                </button>
              </div>
              {editingField === 'condition' ? (
                <select
                  value={edits.condition}
                  onChange={(e) =>
                    setEdits({ ...edits, condition: e.target.value })
                  }
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  className="w-full px-3 py-2 border border-amber-400 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                >
                  <option value="">Select condition</option>
                  {CONDITIONS.map((cond) => (
                    <option key={cond} value={cond}>
                      {cond}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-warm-700 dark:text-warm-300 text-sm">
                  {edits.condition || '—'}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-warm-700 dark:text-warm-300">Description</label>
                <button
                  onClick={() =>
                    setEditingField(
                      editingField === 'description' ? null : 'description'
                    )
                  }
                  className="text-amber-600 hover:text-amber-700 text-sm"
                >
                  ✏️
                </button>
              </div>
              {editingField === 'description' ? (
                <textarea
                  value={edits.description}
                  onChange={(e) =>
                    setEdits({ ...edits, description: e.target.value })
                  }
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  rows={4}
                  className="w-full px-3 py-2 border border-amber-400 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 text-sm"
                />
              ) : (
                <div>
                  <p className="text-warm-700 dark:text-warm-300 text-sm line-clamp-3">
                    {edits.description || '—'}
                  </p>
                  {edits.description && edits.description.length > 150 && (
                    <button
                      onClick={() => setExpandDescription(!expandDescription)}
                      className="text-amber-600 hover:text-amber-700 text-xs mt-1"
                    >
                      {expandDescription ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Price (read-only note) */}
            <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-3">
              <p className="text-xs text-warm-600 dark:text-warm-400">
                Price will be set at the review stage before publishing.
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-warm-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium text-sm"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Done Reviewing'}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 border border-red-300 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;