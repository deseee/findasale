import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Link from 'next/link';

interface HuntSummaryProps {
  saleId: string;
}

interface TreasureHuntQRClue {
  id: string;
  category?: string;
  createdAt: string;
}

interface Sale {
  id: string;
  treasureHuntQRClues: TreasureHuntQRClue[];
  treasureHuntEnabled: boolean;
}

export default function HuntSummary({ saleId }: HuntSummaryProps) {
  // Fetch sale data with treasure hunt clues
  const { data: saleData, isLoading } = useQuery({
    queryKey: ['hunt-summary', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    staleTime: 60000,
  });

  if (isLoading || !saleData) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
      </div>
    );
  }

  const clues = saleData.treasureHuntQRClues || [];
  const treasureHuntEnabled = saleData.treasureHuntEnabled ?? true;

  // Only show if treasure hunt is enabled and there are clues
  if (!treasureHuntEnabled || clues.length === 0) {
    return null;
  }

  // Group clues by category
  const byCategory: Record<string, number> = {};
  clues.forEach((clue) => {
    const cat = clue.category || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-amber-200 dark:border-amber-800">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        🎯 Treasure Hunt QR
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Clues Hidden
          </p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {clues.length}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Categories
          </p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {Object.keys(byCategory).length}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase">
          Categories
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(byCategory).map(([cat, count]) => (
            <span
              key={cat}
              className="bg-white dark:bg-gray-700 text-xs px-2 py-1 rounded-full text-gray-700 dark:text-gray-300"
            >
              {cat} ({count})
            </span>
          ))}
        </div>
      </div>

      <Link href={`/sales/${saleId}/treasure-hunt-qr/progress`}>
        <a className="block w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg text-center transition-colors">
          📱 Start Hunting
        </a>
      </Link>

      <p className="text-xs text-gray-600 dark:text-gray-400 text-center mt-3">
        Scan QR codes hidden around the sale to earn XP!
      </p>
    </div>
  );
}
