import React from 'react';
import Link from 'next/link';

interface SecondarySaleCardProps {
  sale: {
    id: string;
    title: string;
    status: string;
    startDate?: string | Date;
    saleType?: string;
    city?: string;
    state?: string;
    photoUrls?: string[];
  };
  stats?: {
    itemCount?: number;
    holdCount?: number;
    visitorCount?: number;
  };
  onMakePrimary: (saleId: string) => void;
}

const getStatusBadgeColor = (status: string): string => {
  switch (status) {
    case 'LIVE':
    case 'PUBLISHED':
      return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
    case 'DRAFT':
      return 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200';
    case 'SCHEDULED':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
  }
};

const getStatusLabel = (status: string): string => {
  if (status === 'PUBLISHED') return 'LIVE';
  return status;
};

const SecondarySaleCard: React.FC<SecondarySaleCardProps> = ({
  sale,
  stats = {},
  onMakePrimary,
}) => {
  const thumbnail = sale.photoUrls?.[0] || null;
  const visitorCount = stats.visitorCount || 0;
  const itemCount = stats.itemCount || 0;
  const holdCount = stats.holdCount || 0;

  return (
    <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={sale.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              📷
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate flex-1">
              {sale.title}
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadgeColor(
                sale.status
              )}`}
            >
              {getStatusLabel(sale.status)}
            </span>
          </div>

          {/* City and date */}
          {sale.city && (
            <p className="text-xs text-warm-600 dark:text-warm-400 truncate mb-2">
              {sale.city}
              {sale.startDate && (
                <>
                  {' • '}
                  {sale.status === 'LIVE' || sale.status === 'PUBLISHED'
                    ? 'Live now'
                    : new Date(sale.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                </>
              )}
            </p>
          )}

          {/* Stats chips */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
              {itemCount} items
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
              {holdCount} holds
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
              {visitorCount} visitors
            </span>
          </div>

          {/* Action row */}
          <div className="flex gap-2 flex-wrap text-xs">
            <Link
              href={`/sales/${sale.id}`}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              View Live
            </Link>
            <span className="text-gray-400">•</span>
            <Link
              href={`/organizer/add-items/${sale.id}`}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Add Items
            </Link>
            <span className="text-gray-400">•</span>
            <Link
              href={`/organizer/holds?saleId=${sale.id}`}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Holds
            </Link>
            <span className="text-gray-400">•</span>
            <button
              onClick={() => onMakePrimary(sale.id)}
              className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
            >
              Make Primary ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecondarySaleCard;
