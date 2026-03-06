import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../lib/api';
import { format, parseISO } from 'date-fns';

interface PricePoint {
  id: string;
  price: number;
  changedBy: string;
  note?: string;
  createdAt: string;
}

interface Props {
  itemId: string;
  currentPrice?: number;
}

const changedByLabel: Record<string, string> = {
  organizer: 'Manual',
  auction: 'Auction',
  reverseAuction: 'Auto-drop',
  flashDeal: 'Flash Deal',
};

export default function ItemPriceHistoryChart({ itemId, currentPrice }: Props) {
  const { data: history = [], isLoading } = useQuery<PricePoint[]>({
    queryKey: ['price-history', itemId],
    queryFn: async () => {
      const res = await api.get(`/items/${itemId}/price-history`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-xl h-24" aria-hidden="true" />
    );
  }

  if (history.length === 0) {
    return null; // No history yet — don't render anything
  }

  const chartData = history.map((h) => ({
    date: format(parseISO(h.createdAt), 'MMM d'),
    price: h.price,
    label: changedByLabel[h.changedBy] || h.changedBy,
  }));

  // Append current price as final point if it differs from last recorded
  if (currentPrice !== undefined && chartData.length > 0) {
    const last = history[history.length - 1];
    if (last.price !== currentPrice) {
      chartData.push({ date: 'Now', price: currentPrice, label: 'Current' });
    }
  }

  const minPrice = Math.min(...chartData.map((d) => d.price));
  const maxPrice = Math.max(...chartData.map((d) => d.price));

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Price History</h3>
      <div className="border border-gray-200 rounded-xl p-4 bg-white">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[Math.max(0, minPrice * 0.9), maxPrice * 1.1]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              formatter={(value: number, _: string, entry: any) => [
                `$${value.toFixed(2)}`,
                entry.payload?.label || 'Price',
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Line
              type="stepAfter"
              dataKey="price"
              stroke="#d97706"
              strokeWidth={2}
              dot={{ r: 3, fill: '#d97706' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
