import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface FlashDealBannerProps {
  saleId: string;
  itemIds: string[]; // Item IDs in this sale
}

interface FlashDeal {
  id: string;
  discountPct: number;
  startsAt: string;
  endsAt: string;
  timeRemainingMinutes: number;
  item: {
    id: string;
    title: string;
    price?: number;
  };
  sale: {
    id: string;
    title: string;
    city: string;
    state: string;
  };
}

const FlashDealBanner: React.FC<FlashDealBannerProps> = ({ saleId, itemIds }) => {
  const [countdownText, setCountdownText] = useState<string>('');

  const { data: flashDeals = [] } = useQuery({
    queryKey: ['flash-deals'],
    queryFn: async () => {
      const response = await api.get('/flash-deals');
      return response.data as FlashDeal[];
    },
    refetchInterval: 30000, // Update every 30 seconds
  });

  // Filter deals for this sale's items
  const relevantDeals = flashDeals.filter(
    (deal) => deal.sale.id === saleId && itemIds.includes(deal.item.id)
  );

  // Update countdown every minute
  useEffect(() => {
    if (relevantDeals.length === 0) return;

    const updateCountdown = () => {
      const now = new Date();
      const deals = relevantDeals.map((deal) => {
        const endsAt = new Date(deal.endsAt);
        const remaining = Math.max(0, endsAt.getTime() - now.getTime());
        const minutes = Math.floor(remaining / (1000 * 60)) % 60;
        const hours = Math.floor(remaining / (1000 * 60 * 60));

        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        } else {
          return `${minutes}m`;
        }
      });

      setCountdownText(deals[0]);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [relevantDeals]);

  if (relevantDeals.length === 0) {
    return null;
  }

  const deal = relevantDeals[0]; // Show the earliest ending deal

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg p-4 mb-6 shadow-lg animate-pulse">
      <div className="flex items-center gap-3">
        <div className="text-3xl">⚡</div>
        <div className="flex-1">
          <h3 className="font-bold text-lg">Flash Deal — {deal.discountPct}% off!</h3>
          <p className="text-sm opacity-90">
            {deal.item.title} {countdownText && `for next ${countdownText}`}
          </p>
        </div>
      </div>

      {/* Animated pulse background */}
      <div className="absolute top-0 left-0 w-full h-full bg-white opacity-0 animate-ping"></div>
    </div>
  );
};

export default FlashDealBanner;
