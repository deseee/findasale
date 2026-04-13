import React from 'react';
import Link from 'next/link';
import type { ActivityFeedItem } from '../hooks/useOrganizerActivityFeed';

interface OrganizerActivityFeedCardProps {
  activities: ActivityFeedItem[];
  isLoading?: boolean;
}

const OrganizerActivityFeedCard: React.FC<OrganizerActivityFeedCardProps> = ({
  activities,
  isLoading = false,
}) => {
  const getIcon = (type: ActivityFeedItem['type']) => {
    switch (type) {
      case 'favorite':
        return '❤️';
      case 'purchase':
        return '🛒';
      case 'rsvp':
        return '✓';
      case 'message':
        return '💬';
      case 'review':
        return '⭐';
      case 'hold':
        return '🤝';
      default:
        return '•';
    }
  };

  const getActivityText = (activity: ActivityFeedItem): string => {
    switch (activity.type) {
      case 'favorite':
        return `Someone favorited ${activity.saleName}`;
      case 'purchase':
        return `Purchase completed for ${activity.saleName}${activity.amount ? ` — $${activity.amount.toFixed(2)}` : ''}`;
      case 'rsvp':
        return `New RSVP for ${activity.saleName}`;
      case 'message':
        return `New message about ${activity.saleName}`;
      case 'review':
        return `New review for ${activity.saleName}`;
      case 'hold':
        return `Item held at ${activity.saleName}`;
      default:
        return activity.message;
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

  const getTypeColor = (type: ActivityFeedItem['type']): string => {
    switch (type) {
      case 'favorite':
        return 'text-red-600 dark:text-red-400';
      case 'purchase':
        return 'text-green-600 dark:text-green-400';
      case 'rsvp':
        return 'text-blue-600 dark:text-blue-400';
      case 'message':
        return 'text-purple-600 dark:text-purple-400';
      case 'review':
        return 'text-amber-600 dark:text-amber-400';
      case 'hold':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-warm-600 dark:text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6">
        <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">Live Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-warm-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6">
      <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">Live Activity</h3>

      {activities.length === 0 ? (
        <p className="text-sm text-warm-500 dark:text-gray-400 text-center py-8">
          No recent activity. When shoppers interact with your sales, it will appear here.
        </p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {activities.slice(0, 8).map((activity, index) => (
            <Link
              key={activity.id}
              href={`/sales/${activity.saleId}`}
              className="flex items-start gap-3 p-3 rounded-md hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer"
              style={{
                animation: `slideIn 0.3s ease-out ${index * 50}ms both`,
              }}
            >
              <div className="flex-shrink-0 text-lg mt-0.5">{getIcon(activity.type)}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${getTypeColor(activity.type)} group-hover:underline truncate`}>
                  {getActivityText(activity)}
                </p>
                <p className="text-xs text-warm-500 dark:text-gray-400 mt-1">{getTimeAgo(activity.timestamp)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default OrganizerActivityFeedCard;
