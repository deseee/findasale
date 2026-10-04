/**
 * etsyWebhookController.ts -- POST /api/etsy/webhook (ADR-135 D6.2, batch E-B4, acceptance 1).
 *
 * Etsy tells us a sale happened (event order.paid) so we do not wait for the 15 minute poll. Polling in
 * jobs/etsySoldSyncCron.ts always stays on as the safety net; anything this handler skips or loses is
 * recovered from the poll cursor.
 *
 * Order of work for every request:
 *   1. Kill switch. ETSY_CONNECTOR_ENABLED not exactly 'true': answer 200 and do nothing at all (no
 *      signature check, no database, no Etsy call). The route is public and must keep answering 200 when
 *      the connector is off, so it is mounted WITHOUT the per-route kill switch the other Etsy routes use.
 *   2. The body must be the raw Buffer (index.ts mounts express.raw for this path BEFORE the global JSON
 *      parser). If it is not a Buffer the signature cannot be checked: 400 and a Sentry error.
 *   3. Signature (verifyEtsyWebhookSignature), with ETSY_WEBHOOK_SECRET read at call time. A missing
 *      secret answers 503 (Etsy retries; the poll covers meanwhile). A bad signature or a timestamp more
 *      than 300 seconds from now answers 401 with a fixed body; a Sentry warning is sampled to one per
 *      10 minutes. Nothing from the body is logged.
 *   4. Parse the JSON payload { event_type, resource_url, shop_id } and claim the event in
 *      ProcessedWebhookEvent under eventId `etsy:{webhook-id}` (PENDING, then COMPLETED or FAILED, the
 *      same pattern as the Square webhook): a repeat of a COMPLETED id is a duplicate (200, not
 *      processed again); a FAILED id, or a PENDING id older than 10 minutes, is re-claimed with one
 *      conditional updateMany so exactly one retry runs.
 *   5. Answer 200 immediately, then process asynchronously (processEtsyWebhookEvent). Only order.paid is
 *      acted on; order.canceled leaves an info breadcrumb (reversal semantics are not built, ADR D6.2);
 *      other events are ignored.
 *   6. Process: shop_id must match an EtsyShopSettings.shopId whose MarketplaceAccount is ACTIVE.
 *      resource_url is NEVER fetched. parseEtsyReceiptResource reduces it to two numeric ids (the shop id
 *      must equal the payload shop_id), and fetchEtsyReceipt builds the path itself (URGENT).
 *      processEtsyTransactions then records only transaction id, listing id, quantity, receipt id and the
 *      paid time (no buyer fields), exactly like the poll does.
 *
 * Signature scheme, from the Etsy webhooks documentation fetched this run
 * (https://developer.etsy.com/documentation/essentials/webhooks, 2026-10-03) and ADR-135 D6.2:
 *   headers webhook-id, webhook-timestamp (unix seconds), webhook-signature; the secret is shown as
 *   `whsec_<base64>`: remove the prefix, base64-decode; signed content is
 *   webhook-id + "." + webhook-timestamp + "." + raw body; signature = base64(HMAC-SHA256(key, content));
 *   reject when the timestamp is more than 300 seconds from the server clock.
 * UNVERIFIED (needs a live delivery, ADR-135 test T9): the exact syntax of the webhook-signature header
 * value. The fetched page does not show it. This code accepts either a bare base64 value or `v1,<base64>`
 * entries, one or several separated by spaces, and compares every entry with crypto.timingSafeEqual over
 * decoded buffers. Also UNVERIFIED: whether a Personal Access app can register a webhook at all, the
 * response code and time Etsy expects (this handler answers 200 quickly, as the retry schedule in the
 * documentation implies), and the receipt fetch needing the transactions_r scope (it is requested).
 *
 * Import safety: no env reads, network or database access at module load.
 */

import * as crypto from 'crypto';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { captureEtsyEvent, scrubEtsySecrets } from '../services/marketplace/etsyBudget';
import { isEtsyConnectorEnabled } from '../services/marketplace/etsyHttp';
import { fetchEtsyReceipt, parseEtsyReceiptResource, toEtsyIdString } from '../services/marketplace/etsyReceipts';
import type { EtsyReceiptFetchResult } from '../services/marketplace/etsyReceipts';
import { processEtsyTransactions } from '../services/marketplace/etsySoldService';
import type { EtsySoldDeps, EtsyTransactionsOutcome } from '../services/marketplace/etsySoldService';

export const ETSY_WEBHOOK_TOLERANCE_SECONDS = 300;
export const ETSY_WEBHOOK_PENDING_STALE_MS = 10 * 60 * 1000;
export const ETSY_WEBHOOK_ALERT_GAP_MS = 10 * 60 * 1000;
export const ETSY_WEBHOOK_PAID_EVENT = 'order.paid';
export const ETSY_WEBHOOK_CANCELED_EVENT = 'order.canceled';

const SECRET_PREFIX = 'whsec_';
const WEBHOOK_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const TIMESTAMP_RE = /^\d{1,12}$/;
const MAX_SIGNATURE_ENTRIES = 10;

// ---------------------------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------------------------

/** Remove the whsec_ prefix and base64-decode. Returns null when nothing usable is left. */
export function decodeEtsyWebhookSecret(secret: string | undefined | null): Buffer | null {
  if (typeof secret !== 'string') return null;
  let s = secret.trim();
  if (s.startsWith(SECRET_PREFIX)) s = s.slice(SECRET_PREFIX.length);
  if (!s) return null;
  const key = Buffer.from(s, 'base64');
  return key.length > 0 ? key : null;
}

/** base64(HMAC-SHA256(key, `${id}.${timestamp}.` + rawBody)). */
export function computeEtsyWebhookSignature(key: Buffer, webhookId: string, timestamp: string, rawBody: Buffer): string {
  const signed = Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`, 'utf8'), rawBody]);
  return crypto.createHmac('sha256', key).update(signed).digest('base64');
}

export type EtsySignatureFailure = 'missing-headers' | 'bad-timestamp' | 'stale-timestamp' | 'no-secret' | 'mismatch';

export interface EtsySignatureInput {
  secret?: string | null;
  webhookId?: string | null;
  timestamp?: string | null;
  signature?: string | null;
  rawBody: Buffer;
  nowSeconds: number;
  toleranceSeconds?: number;
}

/**
 * Check the headers against the raw body. The timestamp window is checked first (cheap), then every
 * candidate entry of the signature header is compared in constant time; no entry short-circuits the others.
 */
export function verifyEtsyWebhookSignature(input: EtsySignatureInput): { ok: true } | { ok: false; reason: EtsySignatureFailure } {
  const { webhookId, timestamp, signature } = input;
  if (!webhookId || !timestamp || !signature) return { ok: false, reason: 'missing-headers' };
  if (!WEBHOOK_ID_RE.test(webhookId) || !TIMESTAMP_RE.test(timestamp)) return { ok: false, reason: 'bad-timestamp' };
  const tolerance = input.toleranceSeconds ?? ETSY_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(input.nowSeconds - parseInt(timestamp, 10)) > tolerance) return { ok: false, reason: 'stale-timestamp' };

  const key = decodeEtsyWebhookSecret(input.secret);
  if (!key) return { ok: false, reason: 'no-secret' };
  const expected = Buffer.from(computeEtsyWebhookSignature(key, webhookId, timestamp, input.rawBody), 'base64');

  const entries = signature.split(/\s+/).filter(Boolean).slice(0, MAX_SIGNATURE_ENTRIES);
  let matched = false;
  for (const entry of entries) {
    let b64: string | null = entry;
    const comma = entry.indexOf(',');
    if (comma >= 0) b64 = entry.slice(0, comma) === 'v1' ? entry.slice(comma + 1) : null;
    if (!b64) continue;
    const candidate = Buffer.from(b64, 'base64');
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'mismatch' };
}

// ---------------------------------------------------------------------------------------------
// Idempotency claim (ProcessedWebhookEvent, same pattern as the Square webhook)
// ---------------------------------------------------------------------------------------------

export type EtsyWebhookClaim =
  | { proceed: true; via: 'NEW' | 'FAILED_RETRY' | 'STALE_PENDING_RETRY' }
  | { proceed: false; reason: 'COMPLETED' | 'IN_FLIGHT' | 'LOST_CLAIM' };

/** Claim `eventKey`. Throws on a database error other than the duplicate-key case. */
export async function claimEtsyWebhookEvent(db: any, eventKey: string, now: Date): Promise<EtsyWebhookClaim> {
  try {
    await db.processedWebhookEvent.create({ data: { eventId: eventKey, status: 'PENDING' } });
    return { proceed: true, via: 'NEW' };
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err;
  }
  const existing: any = await db.processedWebhookEvent.findUnique({ where: { eventId: eventKey } });
  if (existing?.status === 'COMPLETED') return { proceed: false, reason: 'COMPLETED' };
  if (existing?.status === 'FAILED') {
    const claim = await db.processedWebhookEvent.updateMany({
      where: { eventId: eventKey, status: 'FAILED' },
      data: { status: 'PENDING', updatedAt: now },
    });
    return claim.count === 1 ? { proceed: true, via: 'FAILED_RETRY' } : { proceed: false, reason: 'LOST_CLAIM' };
  }
  const updatedMs = existing?.updatedAt instanceof Date ? existing.updatedAt.getTime() : NaN;
  if (existing?.status === 'PENDING' && Number.isFinite(updatedMs) && now.getTime() - updatedMs >= ETSY_WEBHOOK_PENDING_STALE_MS) {
    const claim = await db.processedWebhookEvent.updateMany({
      where: { eventId: eventKey, status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - ETSY_WEBHOOK_PENDING_STALE_MS) } },
      data: { updatedAt: now },
    });
    return claim.count === 1 ? { proceed: true, via: 'STALE_PENDING_RETRY' } : { proceed: false, reason: 'LOST_CLAIM' };
  }
  return { proceed: false, reason: 'IN_FLIGHT' };
}

// ---------------------------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------------------------

export interface EtsyWebhookDeps extends EtsySoldDeps {
  /** Fetch one receipt. Defaults to fetchEtsyReceipt (the only Etsy call this handler makes). */
  fetchReceipt?: (args: { organizerId: string; shopId: string; receiptId: string }) => Promise<EtsyReceiptFetchResult>;
  /** Run the asynchronous part. Defaults to setImmediate; tests collect the promise instead. */
  schedule?: (fn: () => Promise<void>) => void;
}

export interface EtsyWebhookEvent {
  eventType: string;
  shopId: string;
  resourceUrl: string | null;
}

export type EtsyWebhookOutcome =
  | 'recorded'
  | 'ignored-event'
  | 'ignored-unknown-shop'
  | 'ignored-inactive-account'
  | 'ignored-bad-resource'
  | 'canceled-noted'
  | 'receipt-fetch-failed'
  | 'failed';

export async function processEtsyWebhookEvent(
  event: EtsyWebhookEvent,
  deps: EtsyWebhookDeps = {}
): Promise<{ outcome: EtsyWebhookOutcome; transactions?: EtsyTransactionsOutcome }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = deps.db ?? require('../lib/prisma').prisma;
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();

  try {
    if (event.eventType === ETSY_WEBHOOK_CANCELED_EVENT) {
      try {
        Sentry.addBreadcrumb({ category: 'etsy.webhook', level: 'info', message: 'order.canceled received (not reversed in v1)', data: { shopId: event.shopId } });
      } catch {
        /* Sentry may not be initialized */
      }
      return { outcome: 'canceled-noted' };
    }
    if (event.eventType !== ETSY_WEBHOOK_PAID_EVENT) return { outcome: 'ignored-event' };

    const settings: any = (await db.etsyShopSettings.findFirst({ where: { shopId: event.shopId } })) ?? null;
    if (!settings) return { outcome: 'ignored-unknown-shop' };
    const account: any =
      (await db.marketplaceAccount.findFirst({ where: { id: settings.marketplaceAccountId, platform: 'ETSY', status: 'ACTIVE' } })) ?? null;
    if (!account) return { outcome: 'ignored-inactive-account' };

    const ids = parseEtsyReceiptResource(event.resourceUrl, event.shopId);
    if (!ids || ids.shopId !== String(settings.shopId)) return { outcome: 'ignored-bad-resource' };

    await db.etsyShopSettings.updateMany({ where: { id: settings.id }, data: { lastWebhookAt: now } });

    const organizerId: string = settings.organizerId;
    const fetchReceipt = deps.fetchReceipt ?? ((a: { organizerId: string; shopId: string; receiptId: string }) => fetchEtsyReceipt(a, deps));
    const receipt = await fetchReceipt({ organizerId, shopId: ids.shopId, receiptId: ids.receiptId });
    if (!receipt.ok) return { outcome: 'receipt-fetch-failed' };

    const transactions = await processEtsyTransactions(
      { shopId: ids.shopId, organizerId, transactions: receipt.transactions, source: 'WEBHOOK' },
      deps
    );
    return { outcome: transactions.failed > 0 ? 'failed' : 'recorded', transactions };
  } catch (err: any) {
    console.error('[etsy-webhook] processing failed:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
    return { outcome: 'failed' };
  }
}

// ---------------------------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------------------------

let lastSignatureAlertMs = 0;

/** Test hook: forget the sampling clock for signature-failure alerts. */
export function resetEtsyWebhookAlertStateForTests(): void {
  lastSignatureAlertMs = 0;
}

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers?.[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

export function makeEtsyWebhookHandler(deps: EtsyWebhookDeps = {}) {
  return async function etsyWebhookHandler(req: Request, res: Response): Promise<void> {
    const env = deps.env ?? process.env;
    const nowFn = deps.now ?? (() => new Date());
    try {
      // 1. Kill switch: acknowledge and ignore.
      if (!isEtsyConnectorEnabled(env)) {
        res.status(200).json({ received: true, ignored: true });
        return;
      }

      // 2. Raw body.
      const rawBody: unknown = (req as any).body;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        captureEtsyEvent('error', 'Etsy webhook arrived without a raw body (check the express.raw mount order)', { area: 'webhook', step: 'raw-body' }, env);
        res.status(400).json({ received: false });
        return;
      }

      // 3. Signature.
      const secret = env.ETSY_WEBHOOK_SECRET;
      if (!secret || !secret.trim()) {
        captureEtsyEvent('warning', 'Etsy webhook received but ETSY_WEBHOOK_SECRET is not set', { area: 'webhook', step: 'no-secret' }, env);
        res.status(503).json({ received: false });
        return;
      }
      const now = nowFn();
      const webhookId = headerValue(req, 'webhook-id');
      const verdict = verifyEtsyWebhookSignature({
        secret,
        webhookId,
        timestamp: headerValue(req, 'webhook-timestamp'),
        signature: headerValue(req, 'webhook-signature'),
        rawBody,
        nowSeconds: Math.floor(now.getTime() / 1000),
      });
      if (!verdict.ok) {
        if (now.getTime() - lastSignatureAlertMs >= ETSY_WEBHOOK_ALERT_GAP_MS) {
          lastSignatureAlertMs = now.getTime();
          captureEtsyEvent('warning', 'Etsy webhook signature check failed', { area: 'webhook', step: 'signature', extra: { reason: verdict.reason } }, env);
        }
        res.status(401).json({ received: false });
        return;
      }

      // 4. Payload and idempotency claim.
      let payload: any;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        payload = null;
      }
      const shopId = payload && typeof payload === 'object' ? toEtsyIdString(payload.shop_id) : null;
      if (!payload || typeof payload.event_type !== 'string' || !shopId || !webhookId) {
        res.status(400).json({ received: false });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const db = deps.db ?? require('../lib/prisma').prisma;
      const eventKey = `etsy:${webhookId}`;
      let claim: EtsyWebhookClaim;
      try {
        claim = await claimEtsyWebhookEvent(db, eventKey, now);
      } catch (err: any) {
        console.error('[etsy-webhook] could not claim the event:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
        res.status(500).json({ received: false });
        return;
      }
      if (!claim.proceed) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      // 5. Answer now, process after.
      res.status(200).json({ received: true });
      const event: EtsyWebhookEvent = {
        eventType: payload.event_type,
        shopId,
        resourceUrl: typeof payload.resource_url === 'string' ? payload.resource_url : null,
      };
      const run = async (): Promise<void> => {
        const result = await processEtsyWebhookEvent(event, { ...deps, db });
        const failed = result.outcome === 'failed' || result.outcome === 'receipt-fetch-failed';
        try {
          await db.processedWebhookEvent.updateMany({ where: { eventId: eventKey }, data: { status: failed ? 'FAILED' : 'COMPLETED' } });
        } catch (err: any) {
          console.error('[etsy-webhook] could not record the event status:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
        }
      };
      const schedule = deps.schedule ?? ((fn: () => Promise<void>) => { setImmediate(() => { fn().catch(() => undefined); }); });
      schedule(run);
    } catch (err: any) {
      console.error('[etsy-webhook] handler error:', err?.code || scrubEtsySecrets(err?.message || String(err), env));
      if (!res.headersSent) res.status(500).json({ received: false });
    }
  };
}

/** The handler routes/etsyWebhook.ts mounts. */
export const etsyWebhookHandler = makeEtsyWebhookHandler();
