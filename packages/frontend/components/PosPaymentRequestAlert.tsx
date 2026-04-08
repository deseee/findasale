/**
 * PosPaymentRequestAlert — Global fullscreen overlay for incoming POS payment requests.
 *
 * Mounts once in _app.tsx. Opens a persistent socket connection for authenticated
 * shoppers and intercepts POS_PAYMENT_REQUEST events server-side, showing a
 * fullscreen bottom-sheet wherever the shopper is in the app.
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface POSRequestPayload {
  requestId: string;
  organizerName: string;
  saleName: string;
  saleLocation?: string;
  itemNames: string[];
  totalAmountCents: number;
  displayAmount: string;
  expiresAt: string;
  deepLink: string;
}

export function PosPaymentRequestAlert() {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<POSRequestPayload | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;

    // Only activate for shoppers — organizers have their own POS view
    const isOrganizer = user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER';
    const isAdmin = user.roles?.includes('ADMIN') || user.role === 'ADMIN';
    if (isOrganizer || isAdmin) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');

    socketRef.current = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketRef.current.on('POS_PAYMENT_REQUEST', (payload: POSRequestPayload) => {
      setPending(payload);

      // Fire a browser notification if the tab is backgrounded
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('💳 Payment Request', {
          body: `${payload.displayAmount} from ${payload.saleName}`,
          icon: '/icons/icon-192x192.png',
        });
      }
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]); // reconnect only if user changes

  if (!pending) return null;

  const handlePayNow = () => {
    router.push(`/shopper/pay-request/${pending.requestId}`);
    setPending(null);
  };

  const handleDismiss = () => setPending(null);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Bottom-sheet card (full-width on mobile, centered card on desktop) */}
      <div className="relative w-full sm:max-w-sm mx-0 sm:mx-4 bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 p-6 pb-10 sm:pb-6">
        {/* Icon + heading */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">📱</div>
          <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 font-fraunces">
            Payment Request
          </h2>
          <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">{pending.saleName}</p>
          {pending.saleLocation && (
            <p className="text-xs text-warm-400 dark:text-warm-500 mt-0.5">{pending.saleLocation}</p>
          )}
        </div>

        {/* Amount */}
        <div className="text-center mb-6">
          <p className="text-5xl font-bold text-sage-700 dark:text-sage-400 font-fraunces">
            {pending.displayAmount}
          </p>
          {pending.itemNames?.length > 0 && (
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
              {pending.itemNames.slice(0, 3).join(' · ')}
              {pending.itemNames.length > 3 ? ` +${pending.itemNames.length - 3} more` : ''}
            </p>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={handlePayNow}
          className="w-full py-4 rounded-2xl bg-sage-700 text-white font-bold text-lg mb-3 hover:bg-sage-800 dark:bg-sage-600 dark:hover:bg-sage-500 transition active:scale-95"
        >
          Pay Now
        </button>
        <button
          onClick={handleDismiss}
          className="w-full py-2 text-sm text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200 transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default PosPaymentRequestAlert;
