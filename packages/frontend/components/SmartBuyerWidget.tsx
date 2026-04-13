/**
 * Smart Buyer Intelligence Widget — Feature #231
 * "Who's Coming" card: shopper count by tier, top 3 avatar + rank chips, "See all" link
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface SmartBuyerWidgetProps {
  saleId: string;
}

interface BuyerEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  xp: number;
  rank: string;
  isFollowing: boolean;
}

const RANK_COLORS: Record<string, string> = {
  INITIATE: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  SCOUT: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  EXPLORER: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PATHFINDER: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  TRAILBLAZER: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  SAGE: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  LEGEND: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function SmartBuyerWidget({ saleId }: SmartBuyerWidgetProps) {
  const { data: buyers, isLoading, isError } = useQuery<BuyerEntry[]>({
    queryKey: ['smart-buyers', saleId],
    queryFn: () => api.get(`/organizers/smart-buyers/${saleId}`).then((r) => r.data),
    enabled: !!saleId,
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !buyers || buyers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Who&apos;s Coming</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No shoppers watching yet. Share your sale to attract buyers!
        </p>
      </div>
    );
  }

  const top3 = buyers.slice(0, 3);
  const totalCount = buyers.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Who&apos;s Coming</h3>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{totalCount} shoppers</span>
      </div>

      <div className="space-y-2 mb-3">
        {top3.map((buyer) => (
          <div key={buyer.userId} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
              {buyer.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {buyer.displayName}
                {buyer.isFollowing && (
                  <span className="ml-1 text-xs text-green-600 dark:text-green-400">follows you</span>
                )}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${RANK_COLORS[buyer.rank] || RANK_COLORS.INITIATE}`}
            >
              {buyer.rank}
            </span>
          </div>
        ))}
      </div>

      {totalCount > 3 && (
        <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          See all {totalCount} shoppers →
        </button>
      )}
    </div>
  );
}
