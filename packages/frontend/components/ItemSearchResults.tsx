/**
 * ItemSearchResults — Sprint 4b
 * Renders the FTS item search result grid with pagination, loading skeletons,
 * empty state, and error state.
 */
import React from 'react';
import Link from 'next/link';
import { getThumbnailUrl } from '../lib/imageUtils';
import { ItemSearchResult } from '../hooks/useItemSearch';

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------
const ItemCard = ({ item }: { item: ItemSearchResult }) => (
  <Link
    href={`/items/${item.id}`}
    className="bg-white rounded-xl overflow-hidden border border-warm-100 shadow-sm hover:shadow-md transition-shadow flex flex-col"
  >
    {item.photoUrls?.[0] ? (
      <img
        key={getThumbnailUrl(item.photoUrls[0])}
        src={getThumbnailUrl(item.photoUrls[0])}
        alt={item.title}
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
    ) : (
      <div className="aspect-square bg-warm-200 flex items-center justify-center">
        <span className="text-warm-400 text-3xl" aria-hidden="true">📦</span>
      </div>
    )}

    <div className="p-3 flex-1 flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-warm-900 line-clamp-2 leading-snug">
        {item.title}
      </h3>

      {item.price != null && (
        <p className="text-amber-600 font-bold text-sm">${Number(item.price).toFixed(2)}</p>
      )}

      <div className="flex flex-wrap gap-1 mt-auto pt-1">
        {item.category && (
          <span className="text-xs bg-warm-100 text-warm-700 rounded-full px-2 py-0.5 capitalize">
            {item.category}
          </span>
        )}
        {item.condition && (
          <span className="text-xs bg-warm-100 text-warm-600 rounded-full px-2 py-0.5 capitalize">
            {item.condition}
          </span>
        )}
      </div>

      {item.businessName && (
        <p className="text-xs text-warm-400 truncate mt-1">{item.businessName}</p>
      )}
    </div>
  </Link>
);

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------
const SkeletonCard = () => (
  <div className="bg-white rounded-xl overflow-hidden border border-warm-100 shadow-sm animate-pulse">
    <div className="aspect-square bg-warm-200" />
    <div className="p-3 space-y-2">
      <div className="h-3 bg-warm-200 rounded w-4/5" />
      <div className="h-3 bg-warm-200 rounded w-3/5" />
      <div className="h-3 bg-warm-200 rounded w-2/5" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ItemSearchResults
// ---------------------------------------------------------------------------
interface ItemSearchResultsProps {
  items: ItemSearchResult[];
  total: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  isError: boolean;
  query: string;
  onPageChange: (newOffset: number) => void;
  onRetry: () => void;
}

const SKELETON_COUNT = 8;

const ItemSearchResults: React.FC<ItemSearchResultsProps> = ({
  items,
  total,
  limit,
  offset,
  isLoading,
  isError,
  query,
  onPageChange,
  onRetry,
}) => {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // Loading skeleton
  if (isLoading) {
    return (
      <div>
        <div className="h-5 bg-warm-100 animate-pulse rounded w-36 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="text-warm-800 font-medium mb-1">Couldn't load results</p>
        <p className="text-warm-500 text-sm mb-6">Check your connection and try again.</p>
        <button
          onClick={onRetry}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-3xl mb-3">🔍</p>
        <p className="text-warm-800 font-semibold mb-1">
          {query ? `We couldn't find "${query}"` : 'No items match your search'}
        </p>
        <p className="text-warm-500 text-sm mb-4">
          {query ? 'Try different keywords or browse nearby sales for hidden gems.' : 'Start browsing estate sales to discover unique finds.'}
        </p>
        <button
          onClick={() => {
            // Navigate to browse page — would need router context
            window.location.href = '/';
          }}
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Browse All Sales
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Result header */}
      <p
        className="text-sm text-warm-500 mb-4"
        aria-live="polite"
        aria-atomic="true"
      >
        Showing {from}–{to} of {total} item{total !== 1 ? 's' : ''}
      </p>

      {/* Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4"
        role="list"
        aria-label="Search results"
      >
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <ItemCard item={item} />
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-2 mt-8"
          aria-label="Pagination"
        >
          <button
            onClick={() => onPageChange(Math.max(0, offset - limit))}
            disabled={currentPage === 1}
            className="px-3 py-2 rounded-lg border border-warm-200 text-sm text-warm-700 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            ‹ Prev
          </button>

          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
            const page = i + 1;
            return (
              <button
                key={page}
                onClick={() => onPageChange((page - 1) * limit)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-amber-600 text-white'
                    : 'border border-warm-200 text-warm-700 hover:bg-warm-50'
                }`}
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            );
          })}

          {totalPages > 7 && currentPage < totalPages && (
            <span className="text-warm-400 text-sm">…</span>
          )}

          <button
            onClick={() => onPageChange(Math.min((totalPages - 1) * limit, offset + limit))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 rounded-lg border border-warm-200 text-sm text-warm-700 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            Next ›
          </button>
        </nav>
      )}
    </div>
  );
};

export default ItemSearchResults;
