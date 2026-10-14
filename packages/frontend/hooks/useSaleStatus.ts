/**
 * useSaleStatus — Feature #14: Real-Time Sale Status Updates
 *
 * Socket.io hook that:
 * - Fetches initial status via API
 * - Joins the private organizer status room (sale-status:{saleId}); the server admits only the
 *   sale's organizer, its workspace staff and admins, so the socket must carry the session cookie
 * - Listens for SALE_STATUS_UPDATE events
 * - Returns live status counters
 * - Cleans up on unmount
 */

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../lib/api';

// Financial fields (sold, holds, revenue) are only sent to the sale's organizer, staff and admin;
// everyone else receives saleId, itemsRemaining and timestamp only (backend 2026-10-13).
export interface SaleStatus {
  saleId: string;
  itemsSoldToday?: number;
  activeHolds?: number;
  itemsRemaining: number;
  revenueToday?: number; // in dollars
  timestamp: Date;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Singleton socket per session
let socketInstance: Socket | null = null;

const getSocket = (): Socket => {
  if (!socketInstance) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    // accessToken is an httpOnly cookie: withCredentials carries it on the handshake
    socketInstance = io(SOCKET_URL, {
      auth: { token: token || undefined },
      withCredentials: true,
      transports: ['websocket'], // polling causes 502 on Railway
      upgrade: false,
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

      // Join the private status room (re-joined after every reconnect, rooms do not survive one)
      const joinStatusRoom = () => socket.emit('JOIN_SALE_STATUS', saleId);
      joinStatusRoom();
      socket.on('connect', joinStatusRoom);

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
        socket.emit('LEAVE_SALE_STATUS', saleId);
        socket.off('connect', joinStatusRoom);
        socket.off('SALE_STATUS_UPDATE', handleStatusUpdate);
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
