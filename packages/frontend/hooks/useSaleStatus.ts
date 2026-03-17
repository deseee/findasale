/**
 * useSaleStatus — Feature #14: Real-Time Sale Status Updates
 *
 * Socket.io hook that:
 * - Fetches initial status via API
 * - Joins the sale room (sale:{saleId})
 * - Listens for SALE_STATUS_UPDATE events
 * - Returns live status counters
 * - Cleans up on unmount
 */

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';

export interface SaleStatus {
  saleId: string;
  itemsSoldToday: number;
  activeHolds: number;
  itemsRemaining: number;
  revenueToday: number; // in dollars
  timestamp: Date;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Singleton socket per session
let socketInstance: Socket | null = null;

const getSocket = (): Socket => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });
  }
  return socketInstance;
};

export const useSaleStatus = (saleId: string | null | undefined) => {
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initializeStatus = async () => {
      try {
        // Fetch initial status from API
        const response = await api.get(`/sales/${saleId}/status`);
        if (isMounted) {
          setStatus({
            ...response.data,
            timestamp: new Date(response.data.timestamp),
          });
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('[useSaleStatus] Failed to fetch initial status:', err);
          setError('Failed to load sale status');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeStatus();

    try {
      const socket = getSocket();

      // Join the sale room
      socket.emit('JOIN_SALE_FEED', saleId);
      console.log(`[useSaleStatus] Joined sale room: ${saleId}`);

      // Listen for status updates
      const handleStatusUpdate = (data: SaleStatus) => {
        if (isMounted) {
          setStatus({
            ...data,
            timestamp: new Date(data.timestamp),
          });
          setError(null);
        }
      };

      socket.on('SALE_STATUS_UPDATE', handleStatusUpdate);

      // Cleanup: leave room and remove listener
      return () => {
        isMounted = false;
        socket.emit('LEAVE_SALE_FEED', saleId);
        socket.off('SALE_STATUS_UPDATE', handleStatusUpdate);
        console.log(`[useSaleStatus] Left sale room: ${saleId}`);
      };
    } catch (err) {
      if (isMounted) {
        console.error('[useSaleStatus] Socket error:', err);
        // Don't overwrite API error with socket error
        if (!error) {
          setError('Failed to connect to live updates');
        }
      }
    }
  }, [saleId]);

  return {
    status,
    isLoading,
    error,
  };
};
