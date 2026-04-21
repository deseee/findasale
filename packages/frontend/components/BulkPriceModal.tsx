import React, { useState } from 'react';

interface BulkPriceModalProps {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onConfirm: (priceType: 'fixed' | 'discount', value: number) => void;
  loading?: boolean;
}

const BulkPriceModal: React.FC<BulkPriceModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
  loading = false,
}) => {
  const [priceType, setPriceType] = useState<'fixed' | 'discount'>('fixed');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    setError('');

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return;
    }

    if (priceType === 'fixed') {
      if (numValue < 0.01) {
        setError('Price must be at least $0.01');
        return;
      }
    } else if (priceType === 'discount') {
      if (numValue < -99 || numValue > 100) {
        setError('Discount must be between -99% and 100%');
        return;
      }
    }

    onConfirm(priceType, numValue);
    setValue('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
        <h3 className="text-lg font-bold text-warm-900 dark:text-gray-100 mb-4">Update Prices</h3>

        <p className="text-warm-700 mb-6 text-sm">
          Updating {selectedCount} item{selectedCount !== 1 ? 's' : ''}
        </p>

        {/* Price Type Selection */}
        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="priceType"
              value="fixed"
              checked={priceType === 'fixed'}
              onChange={(e) => {
                setPriceType(e.target.value as 'fixed' | 'discount');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
            />
            <span className="text-warm-700 font-medium">Set Fixed Price</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="priceType"
              value="discount"
              checked={priceType === 'discount'}
              onChange={(e) => {
                setPriceType(e.target.value as 'fixed' | 'discount');
                setError('');
              }}
              className="w-4 h-4 text-amber-600"
            />
            <span className="text-warm-700 font-medium">Apply Discount %</span>
          </label>
        </div>

        {/* Value Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-warm-700 mb-2">
            {priceType === 'fixed' ? 'New Price ($)' : 'Discount (%)'}
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            placeholder={priceType === 'fixed' ? '25.00' : '-10'}
            step={priceType === 'fixed' ? '0.01' : '1'}
            className="w-full px-3 py-2 border border-warm-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            disabled={loading}
          />
          {priceType === 'discount' && (
            <p className="text-xs text-warm-600 mt-1">
              Positive = price increase, Negative = price decrease
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-warm-300 text-warm-700 rounded hover:bg-warm-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !value}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkPriceModal;
