import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';
import { getThumbnailUrl } from '../lib/imageUtils';

interface SimilarItem {
  id: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  condition: string | null;
  saleId: string;
  sale: { title: string; city: string } | null;
}

interface SimilarItemsGridProps {
  currentItemId: string;
  currentSaleId: string;
  category: string | null;
}

function ConditionPill({ condition }: { condition: string | null }) {
  if (!condition) return null;
  const label = condition.replace('_', ' ');
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
      {label}
    </span>
  );
}

function ItemCard({ item }: { item: SimilarItem }) {
  return (
    <Link href={`/items/${item.id}`}>
      <a className="group block rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
        <div className="aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
          {item.photoUrl ? (
            <img
              src={getThumbnailUrl(item.photoUrl)}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              No photo
            </div>
          )}
        </div>
        <div className="p-2 space-y-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
            {item.title}
          </p>
          {item.price != null && (
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              ${item.price.toFixed(2)}
            </p>
          )}
          <ConditionPill condition={item.condition} />
          {item.sale?.title && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.sale.title}</p>
          )}
        </div>
      </a>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <Skeleton className="aspect-square w-full" />
      <div className="p-2 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

const SimilarItemsGrid: React.FC<SimilarItemsGridProps> = ({
  currentItemId,
  currentSaleId,
  category: _category,
}) => {
  const { data, isLoading } = useQuery<{ items: SimilarItem[] }>({
    queryKey: ['similar-items', currentItemId],
    queryFn: async () => {
      const response = await api.get(`/items/${currentItemId}/similar`);
      return response.data;
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="mt-8">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const sameSale = items.filter((i) => i.saleId === currentSaleId).slice(0, 3);
  const crossSale = items.filter((i) => i.saleId !== currentSaleId).slice(0, 3);

  // Find sale title for the same-sale section header
  const sameSaleTitle = sameSale[0]?.sale?.title ?? 'this sale';

  return (
    <div className="mt-8 space-y-8">
      {sameSale.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
            Still at {sameSaleTitle}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sameSale.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
      {crossSale.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
            From other active sales
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {crossSale.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimilarItemsGrid;
