/**
 * Web Push sender utility.
 *
 * Setup (one-time):
 *   npx web-push generate-vapid-keys
 *   Add to .env:
 *     VAPID_PUBLIC_KEY=...
 *     VAPID_PRIVATE_KEY=...
 *     VAPID_CONTACT_EMAIL=admin@finda.sale
 *
 * Install dependency (requires Docker rebuild):
 *   pnpm --filter backend add web-push
 *   pnpm --filter backend add -D @types/web-push
 */

let _webpush: any = null;

const getWebPush = () => {
  if (_webpush) return _webpush;
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  ) {
    return null;
  }
  try {
    const wp = require('web-push');
    wp.setVapidDetails(
      `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@finda.sale'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    _webpush = wp;
    return _webpush;
  } catch {
    console.warn('web-push not installed — push notifications are disabled');
    return null;
  }
};

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export const sendPushNotification = async (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<void> => {
  const wp = getWebPush();
  if (!wp) return;

  await wp.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    },
    JSON.stringify(payload)
  );
};