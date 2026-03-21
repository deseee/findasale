import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface ActivityStats {
  totalPurchases: number;
  activeWatchlist: number;
  savedItems: number;
  streakPoints: number;
}

const ActivitySummary: React.FC = () => {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['activity-stats'],
    queryFn: async (): Promise<ActivityStats> => {
      const [purchasesRes, favoritesRes, subscriptionsRes, userRes] = await Promise.all([
        api.get('/users/purchases'),
        api.get('/favorites'),
        api.get('/notifications/subscriptions').catch(() => ({ data: [] })),
        api.get('/users/me'),
      ]);

      return {
        totalPurchases: (purchasesRes.data || []).length,
        activeWatchlist: (subscriptionsRes.data || []).length,
        savedItems: favoritesRes.data?.total ?? (favoritesRes.data?.favorites || []).length,
        streakPoints: userRes.data?.streakPoints || userRes.data?.points || 0,
      };
    },
    enabled: !!user?.id,
  });

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 h-24 bg-warm-50 animate-pulse" />
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Purchases',
      value: stats.totalPurchases,
      icon: '🛍️',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
    },
    {
      label: 'Active Watchlist',
      value: stats.activeWatchlist,
      icon: '👀',
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-700',
    },
    {
      label: 'Saved Items',
      value: stats.savedItems,
      icon: '❤️',
      color: 'bg-pink-50 border-pink-200',
      textColor: 'text-pink-700',
    },
    {
      label: 'Streak Points',
      value: stats.streakPoints,
      icon: '⚡',
      color: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {statCards.map((card, idx) => (
        <div
          key={idx}
          className={`card border ${card.color} p-4 rounded-lg transition-transform hover:scale-105`}
        >
          <div className="text-3xl mb-2">{card.icon}</div>
          <div className={`text-2xl font-bold ${card.textColor} mb-1`}>
            {card.value}
          </div>
          <div className="text-xs text-warm-600">{card.label}</div>
        </div>
      ))}
    </div>
  );
};

export default ActivitySummary;
