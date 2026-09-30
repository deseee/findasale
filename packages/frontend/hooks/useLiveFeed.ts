import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';

/**
 * useLiveFeed — Hook for real-time sale activity stream
 * Feature #70: Connects to WebSocket with JWT auth, joins a sale feed room, listens for events
 * Hydrates on mount with recent events via REST (GET /api/sales/{saleId}/activity)
 * Returns recent events (max 20), connection status, loading state and a hydration error flag.
 *
 * 2026-09-29: saves now hydrate as their own SAVE type (previously every non-purchase activity was
 * mapped to HOLD_PLACED and the whole sentence stuffed into itemTitle, so saves rendered with the hold
 * icon). REST hydration also re-runs every 60s (paused while the tab is hidden, and once immediately
 * when the tab becomes visible again) so a dead websocket cannot leave the list stale. Live websocket
 * events are kept when the REST list is refreshed because holds and price drops only arrive live.
 */

export type FeedEventType =
  | 'SOLD'
  | 'HOLD_PLACED'
  | 'HOLD_RELEASED'
  | 'PRICE_DROP'
  | 'SAVE'
  | 'VIEWING'
  | 'ACTIVITY';

export interface FeedEvent {
  id: string;
  saleId: string;
  type: FeedEventType;
  itemTitle: string;
  /** Full display sentence from the REST activity feed (e.g. "Sam K. just saved Oak Table"). */
  message?: string;
  amount?: number;
  timestamp: Date;
}

interface UseLiveFeedReturn {
  events: FeedEvent[];
  connected: boolean;
  loading: boolean;
  /** True when the most recent REST hydration failed (cleared on the next success). */
  error: boolean;
}

const REHYDRATE_INTERVAL_MS = 60_000;
const MAX_EVENTS = 20;

// Map the REST activity `type` (lowercase: 'save' | 'purchase' | 'viewing') onto FeedEventType.
// Tolerant of unknown values so a backend addition never renders with the wrong icon.
const mapActivityType = (raw: unknown): FeedEventType => {
  switch (String(raw || '').toLowerCase()) {
    case 'purchase':
    case 'sold':
      return 'SOLD';
    case 'save':
    case 'saved':
    case 'favorite':
      return 'SAVE';
    case 'viewing':
    case 'view':
      return 'VIEWING';
    case 'hold':
    case 'hold_placed':
      return 'HOLD_PLACED';
    case 'hold_released':
      return 'HOLD_RELEASED';
    case 'price_drop':
      return 'PRICE_DROP';
    default:
      return 'ACTIVITY';
  }
};

// The backend is moving from full names to "first name + last initial". Accept either: prefer the
// ready-made `message` sentence, else compose one from whichever actor/item fields are present.
const buildActivityMessage = (activity: any, type: FeedEventType): string => {
  if (typeof activity?.message === 'string' && activity.message.trim()) return activity.message.trim();
  const who =
    activity?.actorName ||
    activity?.displayName ||
    [activity?.firstName, activity?.lastInitial ? `${activity.lastInitial}.` : ''].filter(Boolean).join(' ') ||
    'Someone';
  const item = activity?.itemTitle || activity?.item?.title || 'an item';
  switch (type) {
    case 'SOLD':
      return `${who} just bought ${item}`;
    case 'SAVE':
      return `${who} just saved ${item}`;
    case 'VIEWING':
      return `${who} is viewing ${item}`;
    default:
      return item;
  }
};

const toFeedEvent = (activity: any, saleId: string): FeedEvent | null => {
  if (!activity || activity.id == null) return null;
  const type = mapActivityType(activity.type);
  const ts = new Date(activity.timestamp);
  return {
    id: String(activity.id),
    saleId,
    type,
    itemTitle: activity.itemTitle || activity.item?.title || buildActivityMessage(activity, type),
    message: buildActivityMessage(activity, type),
    timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
  };
};

export const useLiveFeed = (saleId: string | undefined): UseLiveFeedReturn => {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!saleId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Hydrate (and periodically re-hydrate) via REST. Live websocket events are preserved by id,
    // because holds and price drops only exist on the socket; REST rows replace their earlier copies.
    const hydrate = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/activity`);
        if (cancelled) return;
        const restEvents: FeedEvent[] = (response.data?.activities || [])
          .slice(0, MAX_EVENTS)
          .map((activity: any) => toFeedEvent(activity, saleId))
          .filter((e: FeedEvent | null): e is FeedEvent => e !== null);
        setEvents((prev) => {
          const restIds = new Set(restEvents.map((e) => e.id));
          const liveOnly = prev.filter((e) => !restIds.has(e.id) && !e.message);
          return [...restEvents, ...liveOnly]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, MAX_EVENTS);
        });
        setError(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('[useLiveFeed] Failed to fetch activity:', err);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrate();

    // Re-hydrate every 60s so a dead websocket does not leave the list stale. Skipped while the tab
    // is hidden; refreshed immediately when it becomes visible again.
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      hydrate();
    }, REHYDRATE_INTERVAL_MS);
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) hydrate();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // Determine WebSocket URL — use NEXT_PUBLIC_SOCKET_URL if available, fallback to API URL
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
                      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');

    // S708: accessToken is in an httpOnly cookie post-migration. withCredentials carries it on
    // the handshake. Keep legacy localStorage token as a fallback for any older code paths.
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    // Create or reuse socket connection
    if (!socketRef.current) {
      socketRef.current = io(socketUrl, {
        auth: { token: token || undefined },
        withCredentials: true,
        transports: ['websocket'], // polling causes 502 on Railway
        upgrade: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      // Handle connection
      socketRef.current.on('connect', () => {
        setConnected(true);
        // Emit JOIN_SALE_FEED after connection
        if (socketRef.current) {
          socketRef.current.emit('JOIN_SALE_FEED', saleId);
        }
      });

      // Handle disconnection
      socketRef.current.on('disconnect', () => {
        setConnected(false);
      });

      // Handle feed events — store reference for cleanup
      const handleFeedEvent = (event: any) => {
        // Convert timestamp string to Date if needed
        const feedEvent: FeedEvent = {
          ...event,
          timestamp: typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp,
        };
        // Prepend to events array (newest first), keep max 20
        setEvents((prev) => [feedEvent, ...prev.slice(0, MAX_EVENTS - 1)]);
      };

      socketRef.current.on('FEED_EVENT', handleFeedEvent);
    } else if (socketRef.current.connected) {
      // Socket already connected, just join the feed
      socketRef.current.emit('JOIN_SALE_FEED', saleId);
      setConnected(true);
    }

    // Cleanup: leave feed and remove listeners on unmount
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (socketRef.current) {
        socketRef.current.emit('LEAVE_SALE_FEED', saleId);
        socketRef.current.off('FEED_EVENT');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [saleId]);

  return {
    events,
    connected,
    loading,
    error,
  };
};
