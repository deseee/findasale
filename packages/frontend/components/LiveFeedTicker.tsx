import React, { useEffect, useState } from 'react';
import { useLiveFeed, FeedEvent, FeedEventType } from '../hooks/useLiveFeed';

/**
 * LiveFeedTicker (Feature #70: Live activity ticker component)
 * Shows a compact card with the last 5 sale events (sold, saved, holds, price drops, viewing).
 * Each event type has its own icon and colour (SAVE added 2026-09-29; it previously rendered with the
 * hold icon). Shows a loading skeleton while the first fetch is in flight, an empty state when there
 * is no activity, and a soft error state if the feed could not be loaded. Relative times refresh every
 * 30s. Dark mode aware, works down to phone width.
 */

interface LiveFeedTickerProps {
  saleId: string;
}

const ICON_PATHS: Record<FeedEventType, { d: string; evenodd?: boolean }> = {
  SOLD: {
    // cart (same glyph the old ActivityFeed used for purchases)
    d: 'M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1h7.586a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM5 16a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0z',
  },
  SAVE: {
    // heart
    d: 'M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z',
  },
  HOLD_PLACED: {
    // clock
    d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z',
    evenodd: true,
  },
  HOLD_RELEASED: {
    // check circle
    d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
    evenodd: true,
  },
  PRICE_DROP: {
    // trending down
    d: 'M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586 3.707 5.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z',
    evenodd: true,
  },
  VIEWING: {
    // eye (same glyph the old ActivityFeed used for viewing)
    d: 'M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0zm-4 2a2 2 0 100-4 2 2 0 000 4z',
    evenodd: true,
  },
  ACTIVITY: {
    d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm0-5a3 3 0 100-6 3 3 0 000 6z',
    evenodd: true,
  },
};

const ICON_COLORS: Record<FeedEventType, string> = {
  SOLD: 'text-green-600 dark:text-green-400',
  SAVE: 'text-red-600 dark:text-red-400',
  HOLD_PLACED: 'text-amber-600 dark:text-amber-400',
  HOLD_RELEASED: 'text-sage-600 dark:text-sage-300',
  PRICE_DROP: 'text-purple-600 dark:text-purple-400',
  VIEWING: 'text-blue-600 dark:text-blue-400',
  ACTIVITY: 'text-warm-500 dark:text-gray-400',
};

const getEventLabel = (type: FeedEventType): string => {
  switch (type) {
    case 'SOLD':
      return 'Sold';
    case 'SAVE':
      return 'Saved';
    case 'HOLD_PLACED':
      return 'On hold';
    case 'HOLD_RELEASED':
      return 'Hold released';
    case 'PRICE_DROP':
      return 'Price drop';
    case 'VIEWING':
      return 'Viewing';
    default:
      return 'Activity';
  }
};

const EventIcon: React.FC<{ type: FeedEventType }> = ({ type }) => {
  const icon = ICON_PATHS[type] || ICON_PATHS.ACTIVITY;
  return (
    <span
      className={`flex-shrink-0 flex items-center justify-center w-6 h-6 ${ICON_COLORS[type] || ICON_COLORS.ACTIVITY}`}
      title={getEventLabel(type)}
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule={icon.evenodd ? 'evenodd' : undefined} clipRule={icon.evenodd ? 'evenodd' : undefined} d={icon.d} />
      </svg>
      <span className="sr-only">{getEventLabel(type)}</span>
    </span>
  );
};

// Text for a row: the REST sentence when present ("Sam K. just saved Oak Table"), else the live
// websocket shape ("<Label>: <item title>").
const getEventText = (event: FeedEvent): string =>
  event.message || (event.itemTitle ? `${getEventLabel(event.type)}: ${event.itemTitle}` : getEventLabel(event.type));

const getRelativeTime = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - new Date(timestamp).getTime();
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${Math.floor(diffHours / 24)}d ago`;
  }
};

export const LiveFeedTicker: React.FC<LiveFeedTickerProps> = ({ saleId }) => {
  const { events, connected, loading, error } = useLiveFeed(saleId);
  // Re-render every 30s so "2m ago" style labels keep moving without new events.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

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

      {/* Events List / loading / empty / error */}
      {loading && displayEvents.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading live activity">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="w-6 h-6 rounded-full bg-warm-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="h-3 flex-1 rounded bg-warm-200 dark:bg-gray-700" />
              <div className="h-3 w-10 rounded bg-warm-200 dark:bg-gray-700 flex-shrink-0" />
            </div>
          ))}
        </div>
      ) : displayEvents.length > 0 ? (
        <ul className="space-y-2">
          {displayEvents.map((event: FeedEvent) => (
            <li key={event.id} className="flex items-center gap-2 text-xs">
              {/* Icon (own glyph and colour per event type) */}
              <EventIcon type={event.type} />

              {/* Text truncated with ellipsis */}
              <span className="flex-1 min-w-0 text-warm-700 dark:text-gray-300 truncate" title={getEventText(event)}>
                {getEventText(event)}
              </span>

              {/* Relative time, right-aligned */}
              <span className="flex-shrink-0 text-warm-500 dark:text-gray-400 text-xs whitespace-nowrap">
                {getRelativeTime(event.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      ) : error ? (
        <p className="text-xs text-warm-500 dark:text-gray-400 italic">
          Live activity is unavailable right now. We will keep trying.
        </p>
      ) : (
        <p className="text-xs text-warm-500 dark:text-gray-400 italic">
          No activity yet. Saves and purchases will show up here as they happen.
        </p>
      )}

      {/* Connection status indicator: hidden per H-001 */}
    </div>
  );
};
