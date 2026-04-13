/**
 * Post-Sale Momentum Card — Feature #237
 * Appears in State 3 only: completed sale summary stats + "Start Next Sale" button
 */
import React from 'react';
import Link from 'next/link';

interface PostSaleMomentumCardProps {
  saleId: string;
  saleTitle: string;
  totalRevenue: number;
  itemsSold: number;
  totalItems: number;
  saleType?: string;
}

export default function PostSaleMomentumCard({
  saleId,
  saleTitle,
  totalRevenue,
  itemsSold,
  totalItems,
  saleType,
}: PostSaleMomentumCardProps) {
  const sellThrough = totalItems > 0 ? Math.round((itemsSold / totalItems) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎉</span>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sale Complete</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{saleTitle}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-lg font-bold text-green-700 dark:text-green-400">
            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Revenue</p>
        </div>
        <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{itemsSold}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Items Sold</p>
        </div>
        <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{sellThrough}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Sell-Through</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Link
          href={`/organizer/settlement/${saleId}`}
          className="flex-1 text-center py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Settle This Sale
        </Link>
        <Link
          href="/organizer/create-sale"
          className="flex-1 text-center py-2 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          Start Next Sale
        </Link>
      </div>
    </div>
  );
}
