'use client';

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import HypeMeter from './HypeMeter';

interface Activity {
  id: string;
  type: 'save' | 'purchase' | 'viewing';
  message: string;
  timestamp: string;
}

interface Props {
  saleId: string;
}

const ActivityFeed = ({ saleId }: Props) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch activity data from the backend every 30 seconds
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/activity`);
        setActivities(response.data.activities || []);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
        setIsLoading(false);
      }
    };

    fetchActivity(); // Call immediately on mount
    const interval = setInterval(fetchActivity, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [saleId]);

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'save':
        return (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.172 2.172a4 4 0 015.656 0l2.828 2.828a4 4 0 010 5.656l-5 5a4 4 0 01-5.656 0l-2.828-2.828a4 4 0 010-5.656l2.829-2.829a.5.5 0 11.707.707l-2.828 2.829a3 3 0 000 4.242l2.828 2.828a3 3 0 004.242 0l5-5a3 3 0 000-4.242l-2.828-2.828a3 3 0 00-4.242 0l-2.829 2.829a.5.5 0 11-.707-.707l2.829-2.829z" />
          </svg>
        );
      case 'purchase':
        return (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1h7.586a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM5 16a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'viewing':
        return (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getColor = (type: Activity['type']) => {
    switch (type) {
      case 'save':
        return 'text-red-600';
      case 'purchase':
        return 'text-green-600';
      case 'viewing':
        return 'text-blue-600';
      default:
        return 'text-warm-600';
    }
  };

  const getTimeAgo = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (secondsAgo < 60) return 'just now';
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    return `${Math.floor(secondsAgo / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-bold text-warm-900 mb-4">Live Activity</h2>
        <div className="space-y-3">
          <div className="h-4 bg-warm-200 rounded animate-pulse" />
          <div className="h-4 bg-warm-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-lg font-bold text-warm-900 mb-4">Live Activity</h2>

      {/* Feature 34: Hype Meter — real-time viewer count */}
      <div className="mb-4">
        <HypeMeter saleId={saleId} />
      </div>

      {/* Recent Activities */}
      {activities.length === 0 ? (
        <p className="text-sm text-warm-500 italic">No activity yet</p>
      ) : (
        <div className="space-y-2">
          {activities.slice(0, 8).map((activity, index) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-2 hover:bg-warm-50 rounded transition animate-in fade-in duration-300"
              style={{
                animation: `fadeIn 0.3s ease-in ${index * 50}ms both`,
              }}
            >
              <div className={`flex-shrink-0 mt-0.5 ${getColor(activity.type)}`}>
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-warm-800 truncate">{activity.message}</p>
                <p className="text-xs text-warm-500">{getTimeAgo(activity.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default ActivityFeed;
