/**
 * ebayNotificationSetup.ts — Register eBay Commerce Notification subscription on startup
 *
 * Registers a subscription for 'marketplace.order.paid' events so eBay pushes
 * real-time order notifications to /api/ebay/notifications.
 * Registration is idempotent — safe to call on every startup.
 * Falls back gracefully if env vars are missing or eBay API is unavailable.
 *
 * ADR: adr-ebay-sync-architecture.md (2026-04-14)
 */

import { getEbayAccessToken } from '../controllers/ebayController';

const EBAY_NOTIFICATION_TOPIC = 'marketplace.order.paid';

/**
 * Register or verify the eBay Notification subscription for order.paid events.
 * Called once at server startup (see index.ts).
 */
export async function registerEbayNotificationSubscription(): Promise<void> {
  const verificationToken = process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;
  const endpointUrl = process.env.EBAY_NOTIFICATION_ENDPOINT_URL;

  if (!verificationToken || !endpointUrl) {
    console.warn('[eBay Notify Setup] Skipping — EBAY_NOTIFICATION_VERIFICATION_TOKEN or EBAY_NOTIFICATION_ENDPOINT_URL not set');
    return;
  }

  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) {
      console.warn('[eBay Notify Setup] Could not get application token — skipping subscription registration');
      return;
    }

    // Check if a subscription already exists for this topic
    const listResp = await fetch(`https://api.ebay.com/commerce/notification/v1/subscription?topic_id=${EBAY_NOTIFICATION_TOPIC}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (listResp.ok) {
      const listData = (await listResp.json()) as any;
      const subscriptions: any[] = listData.subscriptions || [];
      const existing = subscriptions.find(
        (s: any) => s.topicId === EBAY_NOTIFICATION_TOPIC && s.deliveryConfig?.endpoint === endpointUrl
      );

      if (existing) {
        console.log(`[eBay Notify Setup] Subscription already registered (id: ${existing.subscriptionId}) — no action needed`);
        return;
      }
    }

    // Create new subscription
    const createResp = await fetch('https://api.ebay.com/commerce/notification/v1/subscription', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicId: EBAY_NOTIFICATION_TOPIC,
        status: 'ENABLED',
        deliveryConfig: {
          endpoint: endpointUrl,
          verificationToken,
        },
      }),
    });

    if (createResp.status === 204 || createResp.ok) {
      console.log(`[eBay Notify Setup] Subscription registered for ${EBAY_NOTIFICATION_TOPIC} → ${endpointUrl}`);
    } else {
      const errText = await createResp.text();
      console.error(`[eBay Notify Setup] Failed to register subscription: HTTP ${createResp.status} — ${errText.slice(0, 300)}`);
    }
  } catch (err: any) {
    console.error('[eBay Notify Setup] Exception during subscription registration:', err.message);
    // Non-fatal — polling cron is still running as fallback
  }
}
