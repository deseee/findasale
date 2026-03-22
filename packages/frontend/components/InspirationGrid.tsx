import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import FavoriteButton from './FavoriteButton';

interface InspirationItem {
  id: string;
  title: string;
  photoUrls: string[];
  price?: number;
  aiConfidence: number;
  category?: string;
  sale: {
    id: string;
    title: string;
    organizer: {
      businessName: string;
    };
  };
}

interface InspirationGridProps {
  items: InspirationItem[];
  isLoading?: boolean;
}

/**
 * InspirationGrid — Masonry card grid of items for #78 Inspiration Page
 * 2-col mobile, 3-col desktop. Each card links to item detail.
 */
const InspirationGrid: React.FC<InspirationGridProps> = ({ items, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bg-warm-200 dark:bg-gray-700 rounded-lg overflow-hidden animate-pulse aspect-square"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-warm-600 dark:text-warm-400 text-lg">No items found yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
      {items.map((item) => {
        const photoUrl = item.photoUrls?.[0];
        const displayPrice = item.price ? `$${item.price.toFixed(2)}` : 'No price';

        return (
          <Link
            key={item.id}
            href={`/items/${item.id}`}
            className="group block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            {/* Image Container */}
            <div className="relative overflow-hidden bg-gradient-to-br from-warm-100 to-warm-200 dark:from-gray-700 dark:to-gray-600 aspect-square">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 768px) 50vw, 33vw"
                  priority={false}
                  onError={(e) => {
                    // If image fails to load, hide it
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                  }}
                />
              ) : null}
              {/* Placeholder when no image */}
              {!photoUrl && (
                <div className="w-full h-full flex flex-col items-center justify-center text-warm-400 dark:text-gray-500">
                  <svg
                    className="w-12 h-12 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-xs text-warm-500 dark:text-gray-400">No image</span>
                </div>
              )}
              {/* Favorite Button — top-right */}
              <div className="absolute top-2 right-2 flex flex-col gap-2 items-end">
                <FavoriteButton itemId={item.id} variant="icon" size="md" />
              </div>
            </div>

            {/* Card Content */}
            <div className="p-3">
              {/* Title */}
              <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                {item.title}
              </h3>

              {/* Price */}
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">
                {displayPrice}
              </p>

              {/* Organizer Name */}
              <p className="text-xs text-warm-600 dark:text-warm-400 mt-2 truncate">
                {item.sale?.organizer?.businessName || 'Unknown Organizer'}
              </p>

              {/* Category Tag */}
              {item.category && (
                <p className="text-xs text-warm-500 dark:text-warm-300 mt-1">
                  {item.category}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default InspirationGrid;
