import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { getThumbnailUrl } from '../lib/imageUtils';

interface Item {
  id: string;
  title: string;
  category?: string;
  condition?: string;
  price?: number;
  auctionStartPrice?: number;
  status: string;
  photoUrls?: string[];
  createdAt?: string;
}

interface ItemListWithBulkSelectionProps {
  items: Item[];
  selectedIds: Set<string>;
  onSelectItem: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  loading?: boolean;
}

const ItemListWithBulkSelection: React.FC<ItemListWithBulkSelectionProps> = ({
  items,
  selectedIds,
  onSelectItem,
  onSelectAll,
  onDeselectAll,
  loading = false,
}) => {
  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someSelected = items.length > 0 && items.some(item => selectedIds.has(item.id)) && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-warm-600">No items yet. Add one above!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Select all header */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-warm-50 rounded-lg border border-warm-200">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => (allSelected || someSelected ? onDeselectAll() : onSelectAll())}
            className="w-5 h-5 text-amber-600 rounded cursor-pointer"
            aria-label="Select all items"
          />
          <span className="text-sm font-medium text-warm-700">
            {allSelected ? `All ${items.length} items selected` : `Select All (${items.length} items)`}
          </span>
        </div>
      )}

      {/* Item grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const primaryPhotoUrl = item.photoUrls?.[0];
    const photoUrl = primaryPhotoUrl ? getThumbnailUrl(primaryPhotoUrl) : undefined;
          const displayPrice = item.price || item.auctionStartPrice;
          const statusColors: Record<string, string> = {
            AVAILABLE: 'bg-green-100 text-green-800',
            SOLD: 'bg-gray-100 text-gray-800',
            ON_HOLD: 'bg-yellow-100 text-yellow-800',
            RESERVED: 'bg-blue-100 text-blue-800',
            AUCTION_ENDED: 'bg-red-100 text-red-800',
          };

          return (
            <div
              key={item.id}
              className={`relative rounded-lg border-2 p-4 transition-all ${
                isSelected ? 'border-amber-500 bg-amber-50' : 'border-warm-200 bg-white hover:border-warm-300'
              }`}
            >
              {/* Checkbox overlay */}
              <div className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelectItem(item.id)}
                  className="w-5 h-5 text-amber-600 rounded cursor-pointer"
                  aria-label={`Select ${item.title}`}
                />
              </div>

              {/* Photo thumbnail */}
              {photoUrl && (
                <div className="mb-3 rounded-lg overflow-hidden bg-warm-100 h-40">
                  <img
                    key={photoUrl}
                    src={photoUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Item details */}
              <div className="space-y-2">
                <h3 className="font-semibold text-warm-900 line-clamp-2 pr-6">
                  {item.title}
                </h3>

                {/* Category & Condition */}
                <div className="flex gap-2 flex-wrap text-xs">
                  {item.category && (
                    <span className="px-2 py-1 bg-warm-100 text-warm-700 rounded-full">
                      {item.category}
                    </span>
                  )}
                  {item.condition && (
                    <span className="px-2 py-1 bg-warm-100 text-warm-700 rounded-full">
                      {item.condition}
                    </span>
                  )}
                </div>

                {/* Price */}
                {displayPrice && (
                  <p className="font-bold text-amber-700 text-lg">
                    ${displayPrice.toFixed(2)}
                  </p>
                )}

                {/* Status badge */}
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                    statusColors[item.status] || 'bg-warm-100 text-warm-700'
                  }`}
                >
                  {item.status}
                </span>
              </div>

              {/* Edit link */}
              <Link
                href={`/organizer/edit-item/${item.id}`}
                className="absolute bottom-2 right-2 text-xs text-amber-600 hover:text-amber-700 underline"
              >
                Edit
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ItemListWithBulkSelection;
