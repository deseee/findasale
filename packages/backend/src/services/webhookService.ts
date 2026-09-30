// X1: Webhook delivery service
// Signs payloads with HMAC-SHA256 and POSTs to registered URLs.
// Non-fatal: failures are logged but never crash the calling request.

import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { isSafePublicFetchUrl, SAFE_PUBLIC_AXIOS_OPTIONS } from '../utils/safeFetchPublicUrl';
import { isSafeWebhookUrl, webhookLogHost } from '../utils/webhookUrl';

export type WebhookEventType =
  | 'bid.placed'
  | 'purchase.completed'
  | 'sale.published'
  | 'sale.ended'
  | 'item.sold'
  | 'item.published'
  | 'bounty.created';

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function fireWebhooks(
  userId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  let hooks: { id: string; url: string; secret: string }[] = [];
  try {
    hooks = await prisma.webhook.findMany({
      where: { userId, isActive: true, events: { has: event } },
      select: { id: true, url: true, secret: true },
    });
  } catch (err) {
    console.error(`[webhook] failed to query hooks for ${event}:`, err);
    return;
  }

  if (!hooks.length) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  for (const hook of hooks) {
    try {
      // Outbound safety (SSRF): re-validate at DELIVERY time, not just at registration. A hook saved before
      // this guard existed (or whose DNS now points inward) must never be called. Syntax first, then DNS:
      // every resolved address has to be public. The pinned axios options re-check at connect time.
      if (!isSafeWebhookUrl(hook.url)) {
        console.warn(`[webhook] skipped unsafe destination for hook ${hook.id} (${webhookLogHost(hook.url)})`);
        continue;
      }
      const preflightUrl = /^http:/i.test(hook.url) ? hook.url.replace(/^http:/i, 'https:') : hook.url;
      if (!(await isSafePublicFetchUrl(preflightUrl))) {
        console.warn(`[webhook] skipped non-public destination for hook ${hook.id} (${webhookLogHost(hook.url)})`);
        continue;
      }
      const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
      await axios.post(hook.url, body, {
        ...SAFE_PUBLIC_AXIOS_OPTIONS, // maxRedirects 0, no env proxy, pinned public-only DNS lookup, size bounds
        headers: {
          'Content-Type': 'application/json',
          'X-FindASale-Signature': `sha256=${sig}`,
          'X-FindASale-Event': event,
        },
        timeout: 8000,
        maxContentLength: 64 * 1024, // the response body is never read; refuse anything large
      });
    } catch (err: any) {
      // Host only: the path or query string of a webhook URL can carry a token.
      console.error(`[webhook] delivery failed to ${webhookLogHost(hook.url)} (${hook.id}): ${err?.message ?? 'error'}`);
    }
  }
}
