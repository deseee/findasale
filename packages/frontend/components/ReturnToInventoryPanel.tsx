import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import Link from 'next/link';

interface UnsoldItem {
  id: string;
  title: string;
  price: number | null;
  category: string | null;
}

interface ReturnToInventoryPanelProps {
  saleId: string;
  saleType: string; // 'ESTATE' | 'YARD' | 'FLEA_MARKET' | 'AUCTION' | 'CONSIGNMENT'
  unsoldItems: UnsoldItem[];
}

interface ReturnResult {
  returned: number;
  skipped: Array<{ id: string; title: string; reason: string }>;
}

function getDefaultCheckedState(saleType: string, items: UnsoldItem[]): Record<string, boolean> {
  // ESTATE: none pre-checked (organizer reviews individually)
  // FLEA_MARKET, YARD, AUCTION: all pre-checked
  const defaultChecked = saleType !== 'ESTATE';
  return items.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.id] = defaultChecked;
    return acc;
  }, {});
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'SOLD': return 'Sold';
    case 'DONATED': return 'Donated';
    case 'INVOICE_ISSUED': return 'Invoice pending';
    default: return reason;
  }
}

const ReturnToInventoryPanel: React.FC<ReturnToInventoryPanelProps> = ({
  saleId,
  saleType,
  unsoldItems,
}) => {
  const { showToast } = useToast();
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => getDefaultCheckedState(saleType, unsoldItems)
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnResult | null>(null);

  if (unsoldItems.length === 0) {
    return (
      <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-white mb-2">Return to Inventory</h3>
        <p className="text-sm text-warm-500 dark:text-gray-400">No unsold items to return.</p>
      </div>
    );
  }

  const selectedCount = Object.values(checked).filter(Boolean).length;

  const toggleAll = () => {
    const allChecked = Object.values(checked).every(Boolean);
    setChecked(unsoldItems.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.id] = !allChecked;
      return acc;
    }, {}));
  };

  const handleReturn = async () => {
    const itemIds = Object.entries(checked)
      .filter(([, val]) => val)
      .map(([id]) => id);

    if (itemIds.length === 0) {
      showToast('No items selected.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(`/sales/${saleId}/return-items`, { itemIds });
      setResult(res.data as ReturnResult);
      showToast(`${res.data.returned} item${res.data.returned !== 1 ? 's' : ''} returned to inventory.`, 'success');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to return items. Please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-lg border border-sage-200 dark:border-sage-700 bg-sage-50 dark:bg-gray-800 p-6">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-white mb-3">Return to Inventory</h3>
        <p className="text-warm-800 dark:text-gray-200 font-medium mb-2">
          ✓ {result.returned} item{result.returned !== 1 ? 's' : ''} returned to inventory.
        </p>
        {result.skipped.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-warm-600 dark:text-gray-400 mb-1">
              {result.skipped.length} item{result.skipped.length !== 1 ? 's' : ''} skipped:
            </p>
            <ul className="text-sm text-warm-500 dark:text-gray-500 space-y-1 pl-4">
              {result.skipped.map((item) => (
                <li key={item.id}>
                  {item.title} — <span className="italic">{reasonLabel(item.reason)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link
          href="/organizer/inventory"
          className="inline-block mt-2 text-sm text-sage-700 dark:text-sage-400 underline hover:no-underline"
        >
          View inventory →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-white">Return to Inventory</h3>
        <span className="text-sm text-warm-500 dark:text-gray-400">
          {selectedCount} of {unsoldItems.length} selected
        </span>
      </div>

      {saleType === 'YARD' || saleType === 'AUCTION' ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-3 py-2 mb-4">
          All items pre-selected — review before returning.
        </p>
      ) : saleType === 'ESTATE' ? (
        <p className="text-sm text-warm-500 dark:text-gray-400 mb-4">
          Estate sale items are not pre-selected — choose which items to return.
        </p>
      ) : null}

      <div className="mb-3">
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm text-sage-700 dark:text-sage-400 underline hover:no-underline"
        >
          {Object.values(checked).every(Boolean) ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <ul className="divide-y divide-warm-100 dark:divide-gray-700 mb-6 max-h-80 overflow-y-auto">
        {unsoldItems.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              id={`return-item-${item.id}`}
              checked={!!checked[item.id]}
              onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
              className="h-4 w-4 rounded border-warm-300 text-sage-600 focus:ring-sage-500"
            />
            <label
              htmlFor={`return-item-${item.id}`}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <span className="block text-sm font-medium text-warm-900 dark:text-white truncate">
                {item.title}
              </span>
              <span className="block text-xs text-warm-400 dark:text-gray-500">
                {item.category ?? 'Uncategorized'}
                {item.price != null ? ` · $${(item.price / 100).toFixed(2)}` : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleReturn}
        disabled={loading || selectedCount === 0}
        className="w-full py-2 px-4 rounded-lg bg-sage-600 hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
      >
        {loading
          ? 'Returning…'
          : `Return ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to inventory`}
      </button>
    </div>
  );
};

export default ReturnToInventoryPanel;
