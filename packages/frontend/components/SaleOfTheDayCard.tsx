/**
 * SaleOfTheDayCard.tsx — Feature #401: Sale of the Day
 *
 * Fetches the daily highlighted sale from /api/public/sale-of-the-day and renders
 * a prominent amber-accented card. Renders nothing if no sale is available.
 */

import React from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';
import { getSaleImageUrl } from '../lib/imageUtils';

interface SaleOfTheDayResult {
  saleId: string;
  title: string;
  organizerName: string;
  startDate: string;
  city: string;
  state: string;
  itemCount: number;
  photoUrl: string | null;
  saleType: string;
}

interface SaleOfTheDayResponse {
  sale: SaleOfTheDayResult | null;
}

const SALE_TYPE_LABEL: Record<string, string> = {
  ESTATE: 'Estate Sale',
  YARD: 'Yard Sale',
  GARAGE: 'Garage Sale',
  AUCTION: 'Auction',
  FLEA_MARKET: 'Flea Market',
  CONSIGNMENT: 'Consignment',
  MOVING: 'Moving Sale',
  DOWNSIZING: 'Downsizing Sale',
  SWAP_MEET: 'Swap Meet',
  POPUP: 'Pop-Up Sale',
  LIQUIDATION: 'Liquidation Sale',
  CHARITY: 'Charity Sale',
  RETAIL: 'Retail Store',
  ONLINE: 'Online Sale',
};

const SaleOfTheDayCard: React.FC = () => {
  const { data, isLoading } = useQuery<SaleOfTheDayResponse>({
    queryKey: ['sale-of-the-day'],
    queryFn: async () => {
      const res = await api.get('/public/sale-of-the-day');
      return res.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour — matches server Cache-Control
    retry: 1,
  });

  // Skeleton while loading
  if (isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 overflow-hidden">
        {/* Amber banner */}
        <div className="bg-amber-500 dark:bg-amber-700 px-4 py-2 flex items-center gap-2">
          <span className="text-base">🌟</span>
          <Skeleton className="h-4 w-32 bg-amber-300/50" />
        </div>
        <div className="flex flex-col sm:flex-row">
          <Skeleton className="w-full sm:w-48 h-40 rounded-none" />
          <div className="p-4 flex-1 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
    );
  }

  // No qualifying sale — render nothing
  if (!data?.sale) return null;

  const { sale } = data;
  const photoUrl = sale.photoUrl ? getSaleImageUrl(sale.photoUrl) : null;
  const saleTypeLabel = SALE_TYPE_LABEL[sale.saleType] ?? sale.saleType;
  let formattedDate = '';
  try {
    formattedDate = format(parseISO(sale.startDate), 'EEE, MMM d');
  } catch {
    formattedDate = sale.startDate;
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Amber accent banner */}
      <div className="bg-amber-500 dark:bg-amber-700 px-4 py-2 flex items-center gap-2">
        <span className="text-base" role="img" aria-label="star">🌟</span>
        <span className="text-sm font-semibold text-white tracking-wide uppercase">
          Sale of the Day
        </span>
        <span className="ml-auto text-xs text-amber-100 dark:text-amber-200 font-medium">
          {saleTypeLabel}
        </span>
      </div>

      {/* Card body */}
      <Link href={`/sales/${sale.saleId}`}>
        <a className="flex flex-col sm:flex-row group">
          {/* Photo */}
          <div className="relative w-full sm:w-52 h-44 bg-warm-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={sale.title}
                width={208}
                height={176}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-warm-300 dark:text-gray-500 text-4xl">
                🏷️
              </div>
            )}
          </div>

          {/* Details */}
          <div className="p-4 flex flex-col justify-between flex-1 min-w-0">
            <div className="space-y-1">
              <h3 className="font-heading text-xl font-bold text-warm-900 dark:text-gray-100 line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                {sale.title}
              </h3>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                {sale.organizerName}
              </p>
            </div>

            <div className="mt-3 space-y-1">
              <p className="text-sm font-medium text-warm-800 dark:text-gray-200">
                📅 {formattedDate} · {sale.city}, {sale.state}
              </p>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                {sale.itemCount} item{sale.itemCount !== 1 ? 's' : ''} listed
              </p>
            </div>

            <div className="mt-4">
              <span className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-sm font-semibold transition-colors">
                Shop Now →
              </span>
            </div>
          </div>
        </a>
      </Link>
    </div>
  );
};

export default SaleOfTheDayCard;
