import React from 'react';
import Link from 'next/link';
import type { SaleMetrics } from '../types/commandCenter';

interface CommandCenterCardProps {
  sale: SaleMetrics;
}

const CommandCenterCard: React.FC<CommandCenterCardProps> = ({ sale }) => {
  const startDate = new Date(sale.startDate);
  const endDate = new Date(sale.endDate);
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Compute date-aware display status
  const now = new Date();
  let displayStatus: 'LIVE' | 'UPCOMING' | 'DRAFT' | 'ENDED';
  if (sale.status === 'DRAFT') {
    displayStatus = 'DRAFT';
  } else if (sale.status === 'PUBLISHED' && now < startDate) {
    displayStatus = 'UPCOMING';
  } else if (sale.status === 'PUBLISHED' && now >= startDate && now <= endDate) {
    displayStatus = 'LIVE';
  } else {
    displayStatus = 'ENDED';
  }

  const statusStyles = {
    LIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    UPCOMING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    ENDED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  };

  const statusBg = statusStyles[displayStatus];

  const totalPending = sale.pendingActions.total;
  let pendingBadgeColor = 'bg-green-500';
  if (totalPending > 0 && totalPending <= 3) pendingBadgeColor = 'bg-yellow-500';
  if (totalPending > 3) pendingBadgeColor = 'bg-red-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow relative">
      {totalPending > 0 && (
        <div className={`absolute top-3 right-3 ${pendingBadgeColor} text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center`}>
          {totalPending}
        </div>
      )}

      <div className="p-6">
        <div className="mb-4">
          <Link href={`/organizer/add-items/${sale.id}`}>
            <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-2 hover:text-amber-600 dark:hover:text-amber-400 hover:underline transition-colors cursor-pointer">{sale.title}</h3>
          </Link>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBg}`}>
            {displayStatus === 'LIVE' && '● LIVE'}
            {displayStatus === 'UPCOMING' && '◷ UPCOMING'}
            {displayStatus === 'DRAFT' && '◌ DRAFT'}
            {displayStatus === 'ENDED' && '◉ ENDED'}
          </span>
        </div>

        <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
          {formatDate(startDate)} – {formatDate(endDate)}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Listed</p>
            <p className="text-2xl font-bold text-warm-900 dark:text-gray-100">{sale.itemsListed}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Sold</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{sale.itemsSold}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Revenue</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">${sale.revenue.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 dark:text-gray-400 uppercase font-semibold mb-1">Conv. Rate</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{sale.conversionRate.toFixed(1)}%</p>
          </div>
        </div>

        {totalPending > 0 && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Pending Actions</p>
            <div className="space-y-1">
              {sale.pendingActions.itemsNeedingPhotos > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">📷 {sale.pendingActions.itemsNeedingPhotos} items need photos</p>
              )}
              {sale.pendingActions.pendingHolds > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">🤝 {sale.pendingActions.pendingHolds} pending holds</p>
              )}
              {sale.pendingActions.unpaidPurchases > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">💰 {sale.pendingActions.unpaidPurchases} unpaid purchases</p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/organizer/add-items/${sale.id}`}
            className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Manage <span>→</span>
          </Link>
          <Link
            href={`/sales/${sale.id}`}
            className="inline-flex items-center gap-1 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            View Sale <span>↗</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CommandCenterCard;
