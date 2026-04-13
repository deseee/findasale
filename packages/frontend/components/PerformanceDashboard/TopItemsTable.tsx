/**
 * TopItemsTable Component
 * Sortable table of top-selling items
 */

import React, { useState } from 'react';
import Link from 'next/link';

interface TopItem {
  itemId: string;
  title: string;
  category: string;
  unitsSold: number;
  totalRevenue: number;
  avgPrice: number;
  healthScore: number;
}

interface TopItemsTableProps {
  items: TopItem[];
}

type SortKey = 'revenue' | 'units' | 'avgPrice' | 'healthScore';

const TopItemsTable: React.FC<TopItemsTableProps> = ({ items }) => {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    let aVal: any = 0;
    let bVal: any = 0;

    switch (sortKey) {
      case 'revenue':
        aVal = a.totalRevenue;
        bVal = b.totalRevenue;
        break;
      case 'units':
        aVal = a.unitsSold;
        bVal = b.unitsSold;
        break;
      case 'avgPrice':
        aVal = a.avgPrice;
        bVal = b.avgPrice;
        break;
      case 'healthScore':
        aVal = a.healthScore;
        bVal = b.healthScore;
        break;
    }

    if (sortAsc) {
      return aVal - bVal;
    }
    return bVal - aVal;
  });

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="text-warm-400">↕</span>;
    return <span className="text-amber-600">{sortAsc ? '↑' : '↓'}</span>;
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-warm-600">
        No items sold yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-warm-200 bg-warm-50">
            <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Item</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Category</th>
            <th
              onClick={() => handleSort('units')}
              className="px-4 py-3 text-right text-sm font-semibold text-warm-900 cursor-pointer hover:bg-warm-100"
            >
              <div className="flex items-center justify-end gap-2">
                <span>Units Sold</span>
                <SortIndicator column="units" />
              </div>
            </th>
            <th
              onClick={() => handleSort('revenue')}
              className="px-4 py-3 text-right text-sm font-semibold text-warm-900 cursor-pointer hover:bg-warm-100"
            >
              <div className="flex items-center justify-end gap-2">
                <span>Revenue</span>
                <SortIndicator column="revenue" />
              </div>
            </th>
            <th
              onClick={() => handleSort('avgPrice')}
              className="px-4 py-3 text-right text-sm font-semibold text-warm-900 cursor-pointer hover:bg-warm-100"
            >
              <div className="flex items-center justify-end gap-2">
                <span>Avg Price</span>
                <SortIndicator column="avgPrice" />
              </div>
            </th>
            <th
              onClick={() => handleSort('healthScore')}
              className="px-4 py-3 text-right text-sm font-semibold text-warm-900 cursor-pointer hover:bg-warm-100"
            >
              <div className="flex items-center justify-end gap-2">
                <span>Health</span>
                <SortIndicator column="healthScore" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => (
            <tr
              key={item.itemId}
              className="border-b border-warm-100 hover:bg-warm-50 transition-colors"
            >
              <td className="px-4 py-3 text-sm">
                <Link
                  href={`/items/${item.itemId}`}
                  className="text-amber-600 hover:underline font-medium"
                >
                  {item.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-warm-700 capitalize">{item.category}</td>
              <td className="px-4 py-3 text-sm text-right font-medium text-warm-900">
                {item.unitsSold}
              </td>
              <td className="px-4 py-3 text-sm text-right font-medium text-warm-900">
                ${item.totalRevenue.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-medium text-warm-900">
                ${item.avgPrice.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                <span className={`inline-flex items-center justify-center w-12 h-6 rounded text-white text-xs font-bold ${
                  item.healthScore >= 80
                    ? 'bg-green-600'
                    : item.healthScore >= 60
                    ? 'bg-amber-600'
                    : 'bg-red-600'
                }`}>
                  {Math.round(item.healthScore)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopItemsTable;
