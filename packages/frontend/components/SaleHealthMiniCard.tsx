import React from 'react';
import Link from 'next/link';
import type { SaleMetrics } from '../types/commandCenter';

interface SaleHealthMiniCardProps {
  sale: SaleMetrics;
}

const SaleHealthMiniCard: React.FC<SaleHealthMiniCardProps> = ({ sale }) => {
  const healthScore = Math.round(
    (sale.itemsListed > 0 ? (sale.itemsSold / sale.itemsListed) * 100 : 0) * 0.5 +
      Math.min((sale.favoritesCount / Math.max(sale.itemsListed, 1)) * 100, 100) * 0.3 +
      Math.min((sale.viewsCount / Math.max(sale.itemsListed * 10, 1)) * 100, 100) * 0.2
  );

  const getHealthColor = (score: number): string => {
    if (score >= 75) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
  };

  return (
    <Link href={`/organizer/add-items/${sale.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4 hover:shadow-md transition-shadow cursor-pointer h-full">
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-sm font-semibold text-warm-900 dark:text-gray-100 truncate flex-1 pr-2">
            {sale.title}
          </h4>
          <div className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${getHealthColor(healthScore)}`}>
            {healthScore}%
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-warm-50 dark:bg-gray-700/50 p-2 rounded">
            <p className="text-warm-600 dark:text-gray-400 font-semibold mb-1">Items</p>
            <p className="text-lg font-bold text-warm-900 dark:text-gray-100">{sale.itemsListed}</p>
            <p className="text-xs text-warm-500 dark:text-gray-400">{sale.itemsSold} sold</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
            <p className="text-green-700 dark:text-green-300 font-semibold mb-1">Revenue</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">${sale.revenue.toFixed(0)}</p>
            <p className="text-xs text-green-600 dark:text-green-400">{sale.conversionRate.toFixed(1)}% conv</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded">
            <p className="text-red-700 dark:text-red-300 font-semibold mb-1">Favorites</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{sale.favoritesCount}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
            <p className="text-blue-700 dark:text-blue-300 font-semibold mb-1">Views</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{sale.viewsCount}</p>
          </div>
        </div>

        {sale.pendingActions.total > 0 && (
          <div className="mt-3 pt-3 border-t border-warm-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              ⚠️ {sale.pendingActions.total} pending actions
            </p>
          </div>
        )}
      </div>
    </Link>
  );
};

export default SaleHealthMiniCard;
