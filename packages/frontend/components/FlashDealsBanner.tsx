import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface FlashDeal {
  id: string;
  title: string;
  discountPercent: number;
  startTime: string;
  endTime: string;
}

const FlashDealsBanner: React.FC = () => {
  const { data: flashDeals } = useQuery({
    queryKey: ['flash-deals-active'],
    queryFn: async () => {
      try {
        const res = await api.get('/flash-deals');
        return res.data as FlashDeal[];
      } catch {
        return [];
      }
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (!flashDeals || flashDeals.length === 0) {
    return null;
  }

  return (
    <Link href="/search?filter=flashDeals">
      <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg p-4 mb-6 cursor-pointer hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">⚡ Active Flash Deals</h3>
            <p className="text-sm text-red-50">
              {flashDeals.length} deal{flashDeals.length !== 1 ? 's' : ''} available right now
            </p>
          </div>
          <div className="text-3xl">🔥</div>
        </div>
      </div>
    </Link>
  );
};

export default FlashDealsBanner;
