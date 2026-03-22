import React, { useEffect, useRef } from 'react';
import { useLiveFeed, FeedEvent } from '../hooks/useLiveFeed';

interface LiveFeedWidgetProps {
  saleId: string;
}

/**
 * LiveFeedWidget — Feature #70: Real-time activity stream display
 * Shows last 5 events visible with scrollable container for all 20 events
 * Theme: Sage-green from SocialProofBadge
 */
const LiveFeedWidget: React.FC<LiveFeedWidgetProps> = ({ saleId }) => {
  const { events, connected, loading } = useLiveFeed(saleId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest event
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [events]);

  const getEventIcon = (type: FeedEvent['type']): string => {
    switch (type) {
      case 'SOLD':
        return '🛒';
      case 'HOLD_PLACED':
        return '🤝';
      case 'HOLD_RELEASED':
        return '🔓';
      case 'PRICE_DROP':
        return '💰';
      default:
        return '📌';
    }
  };

  const getEventLabel = (type: FeedEvent['type']): string => {
    switch (type) {
      case 'SOLD':
        return 'sold';
      case 'HOLD_PLACED':
        return 'hold placed';
      case 'HOLD_RELEASED':
        return 'hold released';
      case 'PRICE_DROP':
        return 'price dropped';
      default:
        return 'activity';
    }
  };

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="w-full p-4 rounded-lg bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 border border-[#6B8F71]/20">
        <div className="text-sm text-[#5a7a60]">Connecting to live feed...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="w-full p-4 rounded-lg bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 border border-[#6B8F71]/20">
        <div className="text-sm text-[#5a7a60]">No activity yet</div>
      </div>
    );
  }

  // Display first 5 events visible, allow scroll for more
  const visibleEvents = events.slice(0, 5);
  const totalEvents = events.length;

  return (
    <div className="w-full rounded-lg bg-gradient-to-r from-[#6B8F71]/10 to-[#5a7a60]/10 border border-[#6B8F71]/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#6B8F71]/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#6B8F71] animate-pulse" />
          <h3 className="text-xs font-semibold text-[#5a7a60]">Live Activity</h3>
        </div>
        {connected && (
          <span className="text-xs text-[#6B8F71]">{totalEvents} event{totalEvents !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Scrollable Events Container */}
      <div
        ref={scrollContainerRef}
        className="max-h-96 overflow-y-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="divide-y divide-[#6B8F71]/10">
          {events.map((event) => (
            <div key={event.id} className="px-4 py-3 hover:bg-[#6B8F71]/5 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{getEventIcon(event.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-[#5a7a60]">
                        <span className="font-medium">{event.itemTitle}</span>
                        {' '}
                        <span className="text-[#6B8F71]">{getEventLabel(event.type)}</span>
                      </p>
                      {event.amount !== undefined && (
                        <p className="text-xs text-[#6B8F71] mt-1">
                          ${event.amount.toFixed(2)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-[#6B8F71] flex-shrink-0 whitespace-nowrap">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: Connection Status (hidden while reconnecting) */}
    </div>
  );
};

export default LiveFeedWidget;
