/**
 * ebayNotificationSetup.ts — Register eBay Commerce Notification subscription on startup
 *
 * eBay Notification API requires a two-step flow:
 *   1. POST /commerce/notification/v1/destination — register the endpoint URL + verificationToken
 *      Returns a destinationId.
 *   2. POST /commerce/notification/v1/subscription — subscribe a topic to that destinationId.
 *
 * Both steps are idempotent: we check for existing destination/subscription before creating.
 * Uses application-level OAuth (client credentials) — NOT a user token.
 *
 * ADR: adr-ebay-sync-architecture.md (2026-04-14)
 */

import { getEbayAccessToken } from '../controllers/ebayController';

const EBAY_NOTIFICATION_TOPIC = 'ORDER_CONFIRMATION';
const EBAY_NOTIFY_BASE = 'https://api.ebay.com/commerce/notification/v1';

/**
 * Register or verify the eBay Notification destination + subscription for order.paid events.
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
      console.warn('[eBay Notify Setup] Could not get application token — skipping');
      return;
    }

    const headers = {
      Authorization: `Bearer ${appToken}`,
      'Content-Type': 'application/json',
    };

    // ── Step 1: Find or create destination ──────────────────────────────────
    let destinationId: string | null = null;

    const destListResp = await fetch(`${EBAY_NOTIFY_BASE}/destination`, {
      method: 'GET',
      headers,
    });

    if (destListResp.ok) {
      const destListText = await destListResp.text();
      const destListData = destListText ? JSON.parse(destListText) : {};
      const destinations: any[] = destListData.destinations || [];
      const existing = destinations.find(
        (d: any) => d.deliveryConfig?.endpoint === endpointUrl
      );
      if (existing) {
        destinationId = existing.destinationId;
        console.log(`[eBay Notify Setup] Destination already exists (id: ${destinationId})`);
      }
    } else {
      const errText = await destListResp.text();
      console.warn(`[eBay Notify Setup] Could not list destinations: HTTP ${destListResp.status} — ${errText.slice(0, 200)}`);
    }

    if (!destinationId) {
      const destCreateResp = await fetch(`${EBAY_NOTIFY_BASE}/destination`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'FindA.Sale Order Notifications',
          status: 'ENABLED',
          deliveryConfig: {
            endpoint: endpointUrl,
            verificationToken,
          },
        }),
      });

      if (!destCreateResp.ok) {
        const err = await destCreateResp.text();
        console.error(`[eBay Notify Setup] Failed to create destination: HTTP ${destCreateResp.status} — ${err.slice(0, 300)}`);
        return;
      }

      const destText = await destCreateResp.text();
      const destData = destText ? JSON.parse(destText) : {};
      destinationId = destData.destinationId;
      console.log(`[eBay Notify Setup] Destination create response: ${destText.slice(0, 300)}`);
      console.log(`[eBay Notify Setup] Destination created (id: ${destinationId})`);
    }

    if (!destinationId) {
      console.error('[eBay Notify Setup] No destinationId — cannot create subscription');
      return;
    }

    // ── Step 1b: Discover schema version for this topic ─────────────────────
    // schemaVersion goes inside the payload object (not top-level).
    // Call per-topic endpoint to discover supported versions; default to '1.0'.
    let schemaVersion = '1.0';
    const topicResp = await fetch(`${EBAY_NOTIFY_BASE}/topic/${EBAY_NOTIFICATION_TOPIC}`, {
      method: 'GET',
      headers,
    });
    if (topicResp.ok) {
      const topicText = await topicResp.text();
      const topicData = topicText ? JSON.parse(topicText) : {};
      const versions: string[] = topicData.supportedSchemaVersions || [];
      if (versions.length > 0) {
        schemaVersion = versions[versions.length - 1];
        console.log(`[eBay Notify Setup] Topic ${EBAY_NOTIFICATION_TOPIC} schemaVersion=${schemaVersion}`);
      } else {
        console.log(`[eBay Notify Setup] Topic ${EBAY_NOTIFICATION_TOPIC} found — no schema versions listed, using default ${schemaVersion}`);
      }
    } else {
      const errText = await topicResp.text();
      console.warn(`[eBay Notify Setup] Could not fetch topic ${EBAY_NOTIFICATION_TOPIC}: HTTP ${topicResp.status} — ${errText.slice(0, 200)}`);
    }

    // ── Step 2: Find or create subscription ─────────────────────────────────
    const subListResp = await fetch(`${EBAY_NOTIFY_BASE}/subscription`, {
      method: 'GET',
      headers,
    });

    if (subListResp.ok) {
      const subListText = await subListResp.text();
      const subListData = subListText ? JSON.parse(subListText) : {};
      const subscriptions: any[] = subListData.subscriptions || [];
      const existingSub = subscriptions.find(
        (s: any) => s.topicId === EBAY_NOTIFICATION_TOPIC && s.destinationId === destinationId
      );
      if (existingSub) {
        console.log(`[eBay Notify Setup] Subscription already exists (id: ${existingSub.subscriptionId}) — no action needed`);
        return;
      }
    }

    // schemaVersion lives inside payload object — NOT as a top-level field
    const subBody = {
      topicId: EBAY_NOTIFICATION_TOPIC,
      status: 'ENABLED',
      destinationId: destinationId as string,
      payload: {
        deliveryProtocol: 'HTTPS',
        format: 'JSON',
        schemaVersion,
      },
    };
    console.log(`[eBay Notify Setup] Creating subscription:`, JSON.stringify(subBody));

    const subCreateResp = await fetch(`${EBAY_NOTIFY_BASE}/subscription`, {
      method: 'POST',
      headers,
      body: JSON.stringify(subBody),
    });

    if (subCreateResp.status === 204 || subCreateResp.ok) {
      console.log(`[eBay Notify Setup] Subscription registered: ${EBAY_NOTIFICATION_TOPIC} → ${endpointUrl}`);
    } else {
      const err = await subCreateResp.text();
      console.error(`[eBay Notify Setup] Failed to create subscription: HTTP ${subCreateResp.status} — ${err.slice(0, 300)}`);
    }
  } catch (err: any) {
    console.error('[eBay Notify Setup] Exception:', err.message);
    // Non-fatal — polling cron continues as fallback
  }
}
