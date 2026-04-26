/**
 * ebayNotificationSetup.ts — Register eBay Commerce Notification destination on startup
 *
 * Registers the shared webhook destination endpoint with eBay at server startup.
 * ORDER_CONFIRMATION subscriptions are user-based (per-organizer) and are created
 * in ebayOAuthCallback when an organizer connects their eBay account.
 *
 * Uses application-level OAuth (client credentials) — NOT a user token.
 *
 * ADR: adr-ebay-sync-architecture.md (2026-04-14)
 */

import { getEbayAccessToken } from '../controllers/ebayController';

const EBAY_NOTIFY_BASE = 'https://api.ebay.com/commerce/notification/v1';

/**
 * Register or verify the eBay Notification destination on startup.
 * The destination is the shared webhook endpoint used by all per-organizer subscriptions.
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
      // Suppress noisy log — eBay API is unreachable from Railway's IP range.
      // This is a known hosting provider block by eBay. Sync will resume when
      // routing is resolved. See STATE.md for tracking issue.
      return;
    }

    const headers = {
      Authorization: `Bearer ${appToken}`,
      'Content-Type': 'application/json',
    };

    // ── Find or create destination ───────────────────────────────────────────
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
      console.log(`[eBay Notify Setup] Destination created (id: ${destinationId})`);
    }

    if (!destinationId) {
      console.error('[eBay Notify Setup] No destinationId — cannot proceed');
      return;
    }

    // ORDER_CONFIRMATION subscriptions are user-based (per-organizer).
    // They are created in ebayOAuthCallback when an organizer connects their eBay account.
    // The destination registered above is shared across all organizer subscriptions.
    console.log(`[eBay Notify Setup] Destination ready (id: ${destinationId}) — ORDER_CONFIRMATION subscriptions are created per-organizer at OAuth connect time`);

  } catch (err: any) {
    console.error('[eBay Notify Setup] Exception:', err.message);
    // Non-fatal — polling cron continues as fallback
  }
}
