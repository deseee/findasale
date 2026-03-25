import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Link from 'next/link';

interface HuntSummaryProps {
  saleId: string;
}

interface ItemWithQr {
  id: string;
  title: string;
  qrScanCount: number;
  photoUrls: string[];
}

interface HuntLeaderboardEntry {
  userId: string;
  userName: string;
  scansCount: number;
}

export default function HuntSummary({ saleId }: HuntSummaryProps) {
  // Fetch items for this sale with QR counts
  const { data: saleData, isLoading } = useQuery({
    queryKey: ['hunt-summary', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}`);
      return response.data;
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

  const items = saleData.items || [];
  const itemsWithQr = items.filter((item: any) => item.qrScanCount > 0);

  if (itemsWithQr.length === 0) {
    return null; // Don't show section if no QR codes
  }

  const totalScans = itemsWithQr.reduce(
    (sum: number, item: any) => sum + item.qrScanCount,
    0
  );
  const totalItems = items.length;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        🎯 Treasure Hunt
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Items Hidden
          </p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {itemsWithQr.length}/{totalItems}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Scans
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {totalScans}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Avg Scans per Item
          </p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {itemsWithQr.length > 0
              ? (totalScans / itemsWithQr.length).toFixed(1)
              : 0}
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
        📱 Scan QR codes on items to earn XP and badges!
      </p>
    </div>
  );
}
