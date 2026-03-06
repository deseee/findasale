import React, { useState } from 'react';

interface BulkItemToolbarProps {
  selectedCount: number;
  onDelete: () => void;
  onStatusChange: (status: 'AVAILABLE' | 'SOLD' | 'ON_HOLD') => void;
  onCategoryChange: (category: string) => void;
  onPriceAdjust: (percentChange: number) => void;
  loading?: boolean;
  categories: string[];
}

const BulkItemToolbar: React.FC<BulkItemToolbarProps> = ({
  selectedCount,
  onDelete,
  onStatusChange,
  onCategoryChange,
  onPriceAdjust,
  loading = false,
  categories,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('');

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
  };

  const handleApplyDiscount = () => {
    const percent = parseFloat(discountPercent);
    if (!isNaN(percent)) {
      onPriceAdjust(percent);
      setDiscountPercent('');
    }
  };

  return (
    <>
      {/* Sticky toolbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 shadow-lg z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Selection count */}
            <div className="text-sm font-semibold text-warm-700">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Delete button */}
              <button
                onClick={handleDeleteClick}
                disabled={loading}
                className="px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Delete Selected
              </button>

              {/* Status dropdown */}
              <select
                onChange={(e) => onStatusChange(e.target.value as any)}
                disabled={loading}
                className="px-3 py-2 border border-warm-300 rounded text-sm bg-white hover:border-warm-400 disabled:opacity-50"
                defaultValue=""
              >
                <option value="" disabled>
                  Mark Status
                </option>
                <option value="AVAILABLE">Available</option>
                <option value="SOLD">Sold</option>
                <option value="ON_HOLD">On Hold</option>
              </select>

              {/* Category dropdown */}
              <select
                onChange={(e) => onCategoryChange(e.target.value)}
                disabled={loading}
                className="px-3 py-2 border border-warm-300 rounded text-sm bg-white hover:border-warm-400 disabled:opacity-50"
                defaultValue=""
              >
                <option value="" disabled>
                  Change Category
                </option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Discount input */}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="-10"
                  className="w-16 px-2 py-2 border border-warm-300 rounded text-sm text-right"
                  disabled={loading}
                />
                <span className="text-sm text-warm-600">%</span>
                <button
                  onClick={handleApplyDiscount}
                  disabled={loading || !discountPercent}
                  className="px-3 py-2 bg-amber-600 text-white text-sm font-semibold rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-warm-900 mb-2">Delete Items?</h3>
            <p className="text-warm-700 mb-6">
              Are you sure you want to permanently delete {selectedCount} item{selectedCount !== 1 ? 's' : ''}? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-warm-300 text-warm-700 rounded hover:bg-warm-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkItemToolbar;
