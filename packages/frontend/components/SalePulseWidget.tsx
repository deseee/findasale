/**
 * Sale Pulse Widget — Feature #230
 * Engagement score card with buzz meter (0-100), 3 sub-metrics, "Boost visibility" link
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Link from 'next/link';
import Tooltip from './Tooltip';

interface SalePulseWidgetProps {
  saleId: string;
}

export default function SalePulseWidget({ saleId }: SalePulseWidgetProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sale-pulse', saleId],
    queryFn: () => api.get(`/organizers/sale-pulse/${saleId}`).then((r) => r.data),
    enabled: !!saleId,
    refetchInterval: 60000, // refresh every minute
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-3" />
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your sale hasn&apos;t gone live yet — come back when shoppers start browsing.
        </p>
      </div>
    );
  }

  const buzzColor =
    data.buzzscore >= 70
      ? 'bg-green-500'
      : data.buzzscore >= 40
        ? 'bg-yellow-500'
        : 'bg-red-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sale Pulse</h3>
          <Tooltip content="Your sale's visibility score based on views, saves, and shopper engagement. Higher = more discovery." position="top" />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{data.shopperCount} shoppers</span>
      </div>

      {/* Buzz score */}
      <div className="flex items-end gap-2 mb-3">
        <span className="text-3xl font-bold text-gray-900 dark:text-white">{data.buzzscore}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">/ 100</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
        <div
          className={`${buzzColor} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${data.buzzscore}%` }}
        />
      </div>

      {/* Sub-metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.pageViews}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Views</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.itemSaves}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Saves</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.shopperQuestions}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Questions</p>
        </div>
      </div>

      <Link
        href={`/organizer/ripples?saleId=${saleId}`}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Boost visibility →
      </Link>
    </div>
  );
}
