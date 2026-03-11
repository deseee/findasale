// X1: Webhook delivery service
// Signs payloads with HMAC-SHA256 and POSTs to registered URLs.
// Non-fatal: failures are logged but never crash the calling request.

import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';

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
      const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
      await axios.post(hook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-FindASale-Signature': `sha256=${sig}`,
          'X-FindASale-Event': event,
        },
        timeout: 8000,
      });
    } catch (err: any) {
      console.error(`[webhook] delivery failed to ${hook.url} (${hook.id}): ${err.message}`);
    }
  }
}