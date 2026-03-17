import React, { useState } from 'react';
import { Trash2, Copy, Clock } from 'lucide-react';

interface LibraryItemCardProps {
  id: string;
  title: string;
  category?: string;
  condition?: string;
  price?: number;
  photoUrls: string[];
  status: string;
  onPull?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
  isLoading?: boolean;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  AVAILABLE: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  IN_SALE: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200' },
  SOLD: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200' },
};

/**
 * LibraryItemCard — Display a library item with actions
 * Feature #25: Item Library (Consignment Rack)
 */
const LibraryItemCard: React.FC<LibraryItemCardProps> = ({
  id,
  title,
  category,
  condition,
  price,
  photoUrls,
  status,
  onPull,
  onDelete,
  onViewHistory,
  isLoading = false,
}) => {
  const [showActions, setShowActions] = useState(false);
  const colors = statusColors[status] || statusColors.AVAILABLE;
  const photoUrl = photoUrls?.[0] || '/placeholder-item.png';

  return (
    <div
      className="relative bg-white dark:bg-slate-800 rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Photo */}
      <div className="relative w-full h-32 bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <img
          src={photoUrl}
          alt={title}
          className="w-full h-full object-cover"
        />
        {/* Status badge */}
        <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text}`}>
          {status}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h3>

        {/* Meta */}
        <div className="mt-2 flex flex-wrap gap-2">
          {category && (
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">
              {category}
            </span>
          )}
          {condition && (
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">
              {condition}
            </span>
          )}
        </div>

        {/* Price */}
        {price && (
          <div className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100">
            ${price.toFixed(2)}
          </div>
        )}

        {/* Action buttons */}
        <div className={`mt-4 flex gap-2 transition-opacity ${showActions || isLoading ? 'opacity-100' : 'opacity-0'}`}>
          {status === 'AVAILABLE' && (
            <button
              onClick={onPull}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1 bg-[#8FB897] hover:bg-[#7BA380] text-white text-xs font-semibold py-2 rounded transition-colors disabled:opacity-50"
            >
              <Copy size={14} />
              Pull to Sale
            </button>
          )}

          <button
            onClick={onViewHistory}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded transition-colors disabled:opacity-50"
            title="View price history"
          >
            <Clock size={16} />
          </button>

          <button
            onClick={onDelete}
            disabled={isLoading}
            className="p-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded transition-colors disabled:opacity-50"
            title="Remove from library"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LibraryItemCard;
