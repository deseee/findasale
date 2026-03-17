import { useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../components/AuthContext';

/**
 * Subscribes the current user to PWA push notifications after permission is granted.
 *
 * Setup required:
 *   1. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to .env (frontend)
 *   2. Install web-push on backend: pnpm --filter backend add web-push
 *   3. Add VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to backend .env
 *   4. Run: npx web-push generate-vapid-keys
 */

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const usePushSubscription = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return; // Push not configured yet

    const subscribe = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;

        // Check existing subscription first
        const existing = await registration.pushManager.getSubscription();
        if (existing) return; // Already subscribed

        // Request permission if not already granted
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          if (result !== 'granted') return;
        }

        // Subscribe — cast to any to avoid TS5 Uint8Array<ArrayBufferLike> vs BufferSource mismatch
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
        });

        // Send to backend
        const { endpoint, keys } = subscription.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };

        await api.post('/push/subscribe', { endpoint, keys });
      } catch (err) {
        console.warn('Push subscription failed:', err);
      }
    };

    subscribe();
  }, [user]);
};
