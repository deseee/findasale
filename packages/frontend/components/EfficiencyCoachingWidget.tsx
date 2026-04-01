/**
 * Organizer Efficiency Coaching Widget — Feature #233
 * Benchmark card: two stat rows (photo speed, sell-through %), percentile badge, "Tips to improve" expandable
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Tooltip from './Tooltip';

export default function EfficiencyCoachingWidget() {
  const [showTips, setShowTips] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['efficiency-stats'],
    queryFn: () => api.get('/organizers/efficiency-stats').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3" />
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Efficiency Coach</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Complete your first sale to unlock efficiency benchmarks.
        </p>
      </div>
    );
  }

  const percentileColor =
    data.percentileRank >= 75
      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      : data.percentileRank >= 50
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Efficiency Coach</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${percentileColor}`}>
          Top {100 - data.percentileRank}%
        </span>
      </div>

      {/* Stats rows */}
      <div className="space-y-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Photo → Published</p>
              <Tooltip content="Average time from adding an item to publishing it. Faster = more items live sooner." position="top" />
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {data.avgPhotoToPublishMinutes < 60
                ? `${data.avgPhotoToPublishMinutes}m`
                : `${Math.round(data.avgPhotoToPublishMinutes / 60)}h`}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 mb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Sell-Through</p>
              <Tooltip content="Percentage of your listed items that have sold. Industry average is 60–80% for estate sales." position="top" />
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {Math.round(data.sellThroughRate * 100)}%
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        Compared to {data.cohortSize} organizers
      </p>

      {/* Expandable tips */}
      <button
        onClick={() => setShowTips(!showTips)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
      >
        {showTips ? 'Hide tips' : 'Tips to improve'} {showTips ? '↑' : '↓'}
      </button>

      {showTips && data.tips && (
        <ul className="mt-2 space-y-1">
          {data.tips.map((tip: string, i: number) => (
            <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1">
              <span className="text-green-500 mt-0.5">•</span>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
