import React from 'react';
import { useLiveFeed, FeedEvent } from '../hooks/useLiveFeed';

/**
 * LiveFeedTicker — Feature #70: Live activity ticker component
 * Shows a compact card with the last 5 sale events (SOLD, HOLD, etc.)
 * Displays icon + item title + relative time
 * Hides if not connected and no events (graceful degradation)
 * Dark mode aware
 */

interface LiveFeedTickerProps {
  saleId: string;
}

const getEventIcon = (type: string): string => {
  switch (type) {
    case 'SOLD':
      return '🔴';
    case 'HOLD_PLACED':
      return '🟡';
    case 'HOLD_RELEASED':
      return '🟢';
    case 'PRICE_DROP':
      return '🔻';
    default:
      return '⭕';
  }
};

const getRelativeTime = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(timestamp).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${Math.floor(diffHours / 24)}d ago`;
  }
};

export const LiveFeedTicker: React.FC<LiveFeedTickerProps> = ({ saleId }) => {
  const { events, connected } = useLiveFeed(saleId);

  // Show nothing if not connected and no events
  if (!connected && events.length === 0) {
    return null;
  }

  // Show last 5 events
  const displayEvents = events.slice(0, 5);

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-warm-900 dark:text-gray-100">
          Live Activity
        </h3>
        {connected && (
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Connected" />
        )}
      </div>

      {/* Events List */}
      {displayEvents.length > 0 ? (
        <ul className="space-y-2">
          {displayEvents.map((event: FeedEvent) => (
            <li key={event.id} className="flex items-center gap-2 text-xs">
              {/* Icon */}
              <span className="text-lg flex-shrink-0">{getEventIcon(event.type)}</span>

              {/* Title truncated with ellipsis */}
              <span className="flex-1 text-warm-700 dark:text-gray-300 truncate">
                {event.itemTitle}
              </span>

              {/* Relative time, right-aligned */}
              <span className="flex-shrink-0 text-warm-500 dark:text-gray-400 text-xs whitespace-nowrap">
                {getRelativeTime(event.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-warm-500 dark:text-gray-400 italic">
          No activity yet. Join when things heat up!
        </p>
      )}

      {/* Connection status indicator — hidden per H-001 */}
    </div>
  );
};
