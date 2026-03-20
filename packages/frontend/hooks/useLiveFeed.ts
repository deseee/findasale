import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * useLiveFeed — Hook for real-time sale activity stream
 * Connects to WebSocket, joins a sale feed room, listens for events
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

export const useLiveFeed = (saleId: string): UseLiveFeedReturn => {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!saleId) {
      setLoading(false);
      return;
    }

    // Determine WebSocket URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const wsUrl = apiUrl.replace(/^http/, 'ws');

    // Create or reuse socket connection
    if (!socketRef.current) {
      socketRef.current = io(wsUrl, {
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
      }
    };
  }, [saleId]);

  return {
    events,
    connected,
    loading,
  };
};
