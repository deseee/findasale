import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import ConditionBadge from './ConditionBadge';
import { getThumbnailUrl } from '../lib/imageUtils';

interface SimilarItemsProps {
  itemId: string;
  category: string;
}

interface SimilarItem {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  condition: string | null;
  saleId: string;
  saleName: string;
  city: string;
}

interface SimilarItemsResponse {
  items: SimilarItem[];
  total: number;
}

const SimilarItemsSkeleton: React.FC = () => (
  <div className="w-full">
    <h2 className="text-lg font-semibold mb-4">You might also like</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse">
          <div className="w-full aspect-square bg-gray-300 rounded-lg mb-3" />
          <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-300 rounded w-1/2" />
        </div>
      ))}
    </div>
  </div>
);

const SimilarItems: React.FC<SimilarItemsProps> = ({ itemId, category }) => {
  const { data, isLoading, error } = useQuery<SimilarItemsResponse>({
    queryKey: ['similarItems', itemId],
    queryFn: async () => {
      const response = await api.get(`/api/items/${itemId}/similar`);
      return response.data;
    },
  });

  // Show nothing if no items or error
  if (!data || data.total === 0) {
    return null;
  }

  if (isLoading) {
    return <SimilarItemsSkeleton />;
  }

  if (error) {
    return null;
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold mb-4">You might also like</h2>

      {/* Mobile: horizontal scroll, Desktop: 3-column grid */}
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.items.map((item) => (
          <Link key={item.id} href={`/items/${item.id}`}>
            <div className="cursor-pointer hover:shadow-lg transition-shadow rounded-lg overflow-hidden">
              {/* Photo thumbnail */}
              <div className="relative w-full aspect-square bg-gray-200 rounded-lg overflow-hidden">
                {item.photoUrl ? (
                  <img
                    src={getThumbnailUrl(item.photoUrl, 300)}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    No image
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3 bg-white">
                {/* Title */}
                <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                  {item.title.length > 40
                    ? item.title.substring(0, 40) + '...'
                    : item.title}
                </h3>

                {/* Price */}
                <p className="text-base font-bold text-warm-600 mb-2">
                  {item.price !== null
                    ? `$${item.price.toFixed(2)}`
                    : 'Price TBA'}
                </p>

                {/* Condition Badge */}
                {item.condition && (
                  <div className="mb-2">
                    <ConditionBadge condition={item.condition} size="sm" />
                  </div>
                )}

                {/* Sale Info */}
                <div className="text-xs text-gray-600">
                  <p className="font-medium truncate">{item.saleName}</p>
                  <p>{item.city}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="sm:hidden overflow-x-auto pb-4">
        <div className="flex gap-4 w-max">
          {data.items.map((item) => (
            <Link key={item.id} href={`/items/${item.id}`}>
              <div className="cursor-pointer min-w-[220px]">
                {/* Photo thumbnail */}
                <div className="relative w-full aspect-square bg-gray-200 rounded-lg overflow-hidden">
                  {item.photoUrl ? (
                    <img
                      src={getThumbnailUrl(item.photoUrl, 250)}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No image
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-2 bg-white">
                  {/* Title */}
                  <h3 className="font-semibold text-sm line-clamp-2 mb-1">
                    {item.title.length > 40
                      ? item.title.substring(0, 40) + '...'
                      : item.title}
                  </h3>

                  {/* Price */}
                  <p className="text-base font-bold text-warm-600 mb-1">
                    {item.price !== null
                      ? `$${item.price.toFixed(2)}`
                      : 'Price TBA'}
                  </p>

                  {/* Condition Badge */}
                  {item.condition && (
                    <div className="mb-1">
                      <ConditionBadge condition={item.condition} size="sm" />
                    </div>
                  )}

                  {/* Sale Info */}
                  <div className="text-xs text-gray-600">
                    <p className="font-medium truncate">{item.saleName}</p>
                    <p>{item.city}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SimilarItems;
