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

import { prisma } from '../lib/prisma';

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

// Optional — when provided, a real send attempt is recorded in PushNotificationLog
// (userId + type identify who/why; the sentAt column is set by the DB default).
export interface PushLogInfo {
  userId: string;
  type: string;
}

export const sendPushNotification = async (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  logInfo?: PushLogInfo
): Promise<void> => {
  const wp = getWebPush();
  if (!wp) return;

  // Bug fix (P0 push-log investigation): wp.sendNotification() can reject (invalid
  // subscription, push service rejects it, network error, etc.). Previously that
  // rejection propagated straight out of this function BEFORE the log write below
  // ever ran, so a failed send left zero trace in PushNotificationLog — "0 rows"
  // in production was consistent with "every send silently failing," not just
  // "sends never attempted." Capture the error here so we can log regardless of
  // outcome, then re-throw at the end to preserve the existing contract: every
  // current caller does `.catch(err => ...)` (or a wrapping try/catch) on this
  // function's return value and expects a rejection on failure.
  let sendError: unknown = null;
  try {
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      JSON.stringify(payload)
    );
  } catch (err) {
    sendError = err;
  }

  if (logInfo) {
    try {
      // NOTE: PushNotificationLog (schema.prisma) has no dedicated status/error
      // column today — only id, userId, type, payload (Json), sentAt. Success/failure
      // is therefore recorded inside the flexible `payload` Json field. A future
      // migration adding a proper `success Boolean` / `error String?` column (with
      // an index on `success`) would make failure-rate queries far cheaper than
      // scanning JSON, but that's a schema change outside this fix's scope.
      await prisma.pushNotificationLog.create({
        data: {
          userId: logInfo.userId,
          type: logInfo.type,
          payload: sendError
            ? {
                title: payload.title,
                body: payload.body,
                url: payload.url ?? null,
                success: false,
                error: sendError instanceof Error ? sendError.message : String(sendError),
              }
            : {
                title: payload.title,
                body: payload.body,
                url: payload.url ?? null,
                success: true,
              },
        },
      });
    } catch (err) {
      console.warn('[webpush] Failed to write PushNotificationLog:', err);
    }
  }

  if (sendError) {
    throw sendError;
  }
};