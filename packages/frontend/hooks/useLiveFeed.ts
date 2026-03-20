import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';

/**
 * useLiveFeed — Hook for real-time sale activity stream
 * Feature #70: Connects to WebSocket with JWT auth, joins a sale feed room, listens for events
 * Hydrates on mount with recent events via REST (GET /api/sales/{saleId}/activity)
 * Returns recent events (max 20), connection status, and loading state
 */

export interface FeedEvent {
  id: string;
  saleId: string;
  type: 'SOLD' | 'HOLD_PLACED' | 'HOLD_RELEASED' | 'PRICE_DROP';
  itemTitle: string;
  amount?: number;
  timestamp: Date;
}

interface UseLiveFeedReturn {
  events: FeedEvent[];
  connected: boolean;
  loading: boolean;
}

export const useLiveFeed = (saleId: string | undefined): UseLiveFeedReturn => {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!saleId) {
      setLoading(false);
      return;
    }

    // Fetch initial events via REST for hydration
    const fetchInitialEvents = async () => {
      try {
        const response = await api.get(`/sales/${saleId}/activity`);
        // Filter activities to feed-like events (purchases, saves become simplified events)
        const feedEvents: FeedEvent[] = (response.data.activities || []).slice(0, 20).map((activity: any) => ({
          id: activity.id,
          saleId,
          type: activity.type === 'purchase' ? 'SOLD' : 'HOLD_PLACED',
          itemTitle: activity.message || 'Activity',
          timestamp: new Date(activity.timestamp),
        }));
        setEvents(feedEvents);
      } catch (error) {
        console.warn('[useLiveFeed] Failed to fetch initial events:', error);
      }
    };

    // Determine WebSocket URL — use NEXT_PUBLIC_SOCKET_URL if available, fallback to API URL
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
                      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');

    // Get JWT token from localStorage for authentication
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    // Create or reuse socket connection
    if (!socketRef.current) {
      socketRef.current = io(socketUrl, {
        auth: { token: token || undefined },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      // Handle connection
      socketRef.current.on('connect', () => {
        console.log('[useLiveFeed] Connected to socket server');
        setConnected(true);
        setLoading(false);
        // Emit JOIN_SALE_FEED after connection
        if (socketRef.current) {
          socketRef.current.emit('JOIN_SALE_FEED', saleId);
        }
      });

      // Handle disconnection
      socketRef.current.on('disconnect', () => {
        console.log('[useLiveFeed] Disconnected from socket server');
        setConnected(false);
      });

      // Handle feed events — store reference for cleanup
      const handleFeedEvent = (event: any) => {
        console.log('[useLiveFeed] Received event:', event);
        // Convert timestamp string to Date if needed
        const feedEvent: FeedEvent = {
          ...event,
          timestamp: typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp,
        };
        // Prepend to events array (newest first), keep max 20
        setEvents((prev) => [feedEvent, ...prev.slice(0, 19)]);
      };

      socketRef.current.on('FEED_EVENT', handleFeedEvent);

      // Fetch initial events to populate the feed on load
      fetchInitialEvents();
    } else if (socketRef.current.connected) {
      // Socket already connected, just join the feed
      socketRef.current.emit('JOIN_SALE_FEED', saleId);
      setLoading(false);
      setConnected(true);
    }

    // Cleanup: leave feed and remove listeners on unmount
    return () => {
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
  };
};
