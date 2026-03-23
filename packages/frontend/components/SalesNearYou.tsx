import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface Sale {
  id: string;
  title: string;
  startDate: string;
  organizerName?: string;
  organizer?: {
    businessName: string;
  };
  address: string;
  lat: number;
  lng: number;
  status: string;
}

const SalesNearYou: React.FC = () => {
  const { data: sales, isLoading, isError } = useQuery({
    queryKey: ['sales-near-you'],
    queryFn: async () => {
      const res = await api.get('/sales', {
        params: {
          status: 'PUBLISHED',
          limit: 3,
        },
      });
      // In a real app, filter by distance using user's geolocation
      return (res.data || []).slice(0, 3) as Sale[];
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-warm-900 mb-4">Sales Near You</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64 h-20 bg-warm-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Sales Near You</h3>
        <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-4 text-center">
          <p className="text-warm-600 dark:text-warm-400">Unable to load nearby sales. Please try again later.</p>
        </div>
      </div>
    );
  }

  if (!sales || sales.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-warm-900">Sales Near You</h3>
        <Link href="/" className="text-sm text-amber-600 hover:text-amber-700">
          View all
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {sales.map((sale) => (
          <Link key={sale.id} href={`/sales/${sale.id}`}>
            <div className="flex-shrink-0 w-64 card p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-warm-900 flex-1 pr-2 line-clamp-2">
                  {sale.title}
                </h4>
                <span className="flex-shrink-0 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 rounded-full">
                  Upcoming
                </span>
              </div>
              <p className="text-xs text-warm-600 mb-2 line-clamp-1">
                {sale.organizer?.businessName || sale.organizerName || 'Estate Sale'}
              </p>
              <p className="text-xs text-warm-500 mb-2">
                Starts {formatDistanceToNow(parseISO(sale.startDate), { addSuffix: true })}
              </p>
              <p className="text-xs text-warm-600 truncate">
                📍 {sale.address}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SalesNearYou;
