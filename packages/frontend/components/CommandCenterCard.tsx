import React from 'react';
import Link from 'next/link';
import type { SaleMetrics } from '@findasale/shared';

interface CommandCenterCardProps {
  sale: SaleMetrics;
}

const CommandCenterCard: React.FC<CommandCenterCardProps> = ({ sale }) => {
  const startDate = new Date(sale.startDate);
  const endDate = new Date(sale.endDate);
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const statusStyles = {
    PUBLISHED: 'bg-green-100 text-green-800',
    DRAFT: 'bg-gray-100 text-gray-800',
    ENDED: 'bg-blue-100 text-blue-800',
  };

  const statusBg = statusStyles[sale.status as keyof typeof statusStyles] || statusStyles.DRAFT;

  const totalPending = sale.pendingActions.total;
  let pendingBadgeColor = 'bg-green-500';
  if (totalPending > 0 && totalPending <= 3) pendingBadgeColor = 'bg-yellow-500';
  if (totalPending > 3) pendingBadgeColor = 'bg-red-500';

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow relative">
      {totalPending > 0 && (
        <div className={`absolute top-3 right-3 ${pendingBadgeColor} text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center`}>
          {totalPending}
        </div>
      )}

      <div className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-warm-900 mb-2">{sale.title}</h3>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBg}`}>
            {sale.status === 'PUBLISHED' && '● LIVE'}
            {sale.status === 'DRAFT' && '◌ DRAFT'}
            {sale.status === 'ENDED' && '◉ ENDED'}
          </span>
        </div>

        <p className="text-sm text-warm-600 mb-4">
          {formatDate(startDate)} – {formatDate(endDate)}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-warm-500 uppercase font-semibold mb-1">Listed</p>
            <p className="text-2xl font-bold text-warm-900">{sale.itemsListed}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 uppercase font-semibold mb-1">Sold</p>
            <p className="text-2xl font-bold text-green-600">{sale.itemsSold}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 uppercase font-semibold mb-1">Revenue</p>
            <p className="text-2xl font-bold text-green-700">${sale.revenue.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-warm-500 uppercase font-semibold mb-1">Conv. Rate</p>
            <p className="text-2xl font-bold text-indigo-600">{sale.conversionRate.toFixed(1)}%</p>
          </div>
        </div>

        {totalPending > 0 && (
          <div className="mb-4 p-3 bg-amber-50 rounded-md border border-amber-200">
            <p className="text-xs font-semibold text-amber-800 mb-2">Pending Actions</p>
            <div className="space-y-1">
              {sale.pendingActions.itemsNeedingPhotos > 0 && (
                <p className="text-xs text-amber-700">📷 {sale.pendingActions.itemsNeedingPhotos} items need photos</p>
              )}
              {sale.pendingActions.pendingHolds > 0 && (
                <p className="text-xs text-amber-700">🤝 {sale.pendingActions.pendingHolds} pending holds</p>
              )}
              {sale.pendingActions.unpaidPurchases > 0 && (
                <p className="text-xs text-amber-700">💰 {sale.pendingActions.unpaidPurchases} unpaid purchases</p>
              )}
            </div>
          </div>
        )}

        <Link
          href={`/organizer/add-items/${sale.id}`}
          className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Manage <span>→</span>
        </Link>
      </div>
    </div>
  );
};

export default CommandCenterCard;
