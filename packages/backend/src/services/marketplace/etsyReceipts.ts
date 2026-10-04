/**
 * etsyReceipts.ts -- Etsy receipt parsing and fetching for sold-on-Etsy detection (ADR-135 D6.2,
 * batch E-B4, acceptance items 1 and 2).
 *
 * Two callers feed it: the webhook handler (one receipt, URGENT) and the polling fallback in
 * jobs/etsySoldSyncCron.ts (a page of receipts, BACKGROUND). Every Etsy call goes through
 * etsyAuthedRequest -> etsyRequest (etsyHttp.ts, the one door), so the kill switch, the QPS gate and
 * the shared Postgres budget apply. This file names no Etsy host.
 *
 * Data minimization (ADR-135 D6.2, section 7 item 8). A receipt body carries buyer name, address and
 * email. extractEtsyTransactions copies out ONLY transaction_id, listing_id, quantity, receipt id and
 * the paid time into a fresh object; nothing else from the receipt survives this file, nothing from the
 * body is logged, and non-OK responses are reduced to their status code.
 *
 * SSRF rule (ADR-135 D6.2). A webhook payload carries a resource_url. It is NEVER fetched. It is
 * parsed with parseEtsyReceiptResource into two numeric ids, and the request path is rebuilt here
 * from those ids. The host of an absolute resource_url is ignored on purpose, because it is never used.
 *
 * Etsy API facts, confirmed this run from the OpenAPI spec 3.0.0 (https://www.etsy.com/openapi/generated/oas/3.0.0.json,
 * fetched 2026-10-03):
 *   - GET /v3/application/shops/{shop_id}/receipts/{receipt_id}  getShopReceipt, scope transactions_r.
 *   - GET /v3/application/shops/{shop_id}/receipts  getShopReceipts, scope transactions_r. Query:
 *     min_last_modified (unix seconds, minimum 946684800), was_paid, was_canceled, limit (max 100,
 *     default 25), offset, sort_on (created | updated | receipt_id), sort_order (asc | desc ...).
 *     Response { count, results: ShopReceipt[] }.
 *   - ShopReceipt: receipt_id, is_paid, status, created_timestamp, updated_timestamp (epoch seconds),
 *     transactions[]. ShopReceiptTransaction: transaction_id, listing_id, quantity, receipt_id,
 *     paid_timestamp (epoch seconds).
 * UNVERIFIED (needs a live paid order, ADR-135 test T10): whether sort_on=updated with sort_order=asc is
 * honored as the spec says (the poll checks the order it gets back and refuses to advance its cursor
 * past a truncated, unordered page), whether min_last_modified compares against updated_timestamp,
 * whether paid_timestamp is always present on a paid receipt, and what status a canceled receipt has.
 *
 * Import safety: no env reads, network or database access at module load.
 */

import { etsyAuthedRequest } from './etsyAuth';
import type { EtsyConnectorDeps } from './etsyConnector';
import type { EtsyRequestOptions, EtsyResponse } from './etsyHttp';

/** Receipts per page. The spec maximum is 100. */
export const ETSY_RECEIPT_PAGE_LIMIT = 100;
/** The spec minimum for min_last_modified (2000-01-01 UTC, in epoch seconds). */
export const ETSY_MIN_LAST_MODIFIED_SECONDS = 946684800;
/** Largest quantity a single transaction line may carry before we treat it as garbage. */
export const ETSY_MAX_TRANSACTION_QUANTITY = 999;

/** The only fields kept from a receipt. */
export interface EtsyReceiptTransaction {
  transactionId: string;
  listingId: string;
  quantity: number;
  receiptId: string;
  paidAt: Date;
}

export type EtsyReceiptFetchResult =
  | { ok: true; transactions: EtsyReceiptTransaction[] }
  | { ok: false; status: number };

export type EtsyReceiptsPageResult =
  | {
      ok: true;
      transactions: EtsyReceiptTransaction[];
      /** Receipts returned on this page (not transactions). */
      receiptCount: number;
      /** Newest updated_timestamp on the page, or null when none was readable. */
      maxUpdatedAt: Date | null;
      /** True when every updated_timestamp on the page was >= the one before it. */
      ascending: boolean;
    }
  | { ok: false; status: number };

const POSITIVE_ID = /^[1-9]\d{0,17}$/;
const MIN_SECONDS = ETSY_MIN_LAST_MODIFIED_SECONDS;
const MAX_SECONDS = 4102444800; // 2100-01-01, a sanity ceiling

/** A positive Etsy numeric id as a string, from a JS integer or a digit string. Otherwise null. */
export function toEtsyIdString(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value === 'string' && POSITIVE_ID.test(value)) return value;
  return null;
}

function toDateFromEpochSeconds(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const s = Math.floor(value);
  if (s < MIN_SECONDS || s > MAX_SECONDS) return null;
  return new Date(s * 1000);
}

/**
 * Parse a webhook resource_url into numeric ids. Accepts a bare path or an absolute http(s) URL (only
 * its path is read). The path must be exactly /v3/application/shops/{digits}/receipts/{digits} and the
 * shop id in it must equal the payload shop_id. Anything else returns null and must be ignored.
 */
export function parseEtsyReceiptResource(
  resourceUrl: unknown,
  payloadShopId: unknown
): { shopId: string; receiptId: string } | null {
  if (typeof resourceUrl !== 'string') return null;
  const raw = resourceUrl.trim();
  if (!raw || raw.length > 500) return null;
  const shopId = toEtsyIdString(payloadShopId);
  if (!shopId) return null;

  let path: string;
  if (raw.startsWith('/')) {
    path = raw.split(/[?#]/)[0];
  } else {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      path = u.pathname;
    } catch {
      return null;
    }
  }
  const m = /^\/v3\/application\/shops\/([1-9]\d{0,17})\/receipts\/([1-9]\d{0,17})$/.exec(path);
  if (!m || m[1] !== shopId) return null;
  return { shopId, receiptId: m[2] };
}

/**
 * Copy the sale facts out of a receipt body. A receipt that says is_paid false yields nothing. A
 * transaction needs a valid transaction_id, listing_id and a positive whole quantity; its paid time is
 * paid_timestamp, or (only when the receipt says is_paid true) the transaction or receipt creation time.
 * The returned objects are fresh and hold only the five fields of EtsyReceiptTransaction.
 */
export function extractEtsyTransactions(receipt: unknown): EtsyReceiptTransaction[] {
  if (!receipt || typeof receipt !== 'object') return [];
  const r = receipt as Record<string, unknown>;
  if (r.is_paid === false) return [];
  const receiptLevelId = toEtsyIdString(r.receipt_id);
  const list = Array.isArray(r.transactions) ? r.transactions : [];
  const out: EtsyReceiptTransaction[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const tx = t as Record<string, unknown>;
    const transactionId = toEtsyIdString(tx.transaction_id);
    const listingId = toEtsyIdString(tx.listing_id);
    const receiptId = toEtsyIdString(tx.receipt_id) ?? receiptLevelId;
    const quantity = tx.quantity;
    if (!transactionId || !listingId || !receiptId) continue;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > ETSY_MAX_TRANSACTION_QUANTITY) continue;
    if (seen.has(transactionId)) continue;
    let paidAt = toDateFromEpochSeconds(tx.paid_timestamp);
    if (!paidAt && r.is_paid === true) {
      paidAt =
        toDateFromEpochSeconds(tx.created_timestamp) ??
        toDateFromEpochSeconds(r.updated_timestamp) ??
        toDateFromEpochSeconds(r.created_timestamp);
    }
    if (!paidAt) continue;
    seen.add(transactionId);
    out.push({ transactionId, listingId, quantity, receiptId, paidAt });
  }
  return out;
}

function authedFn(deps: EtsyConnectorDeps) {
  return (
    deps.authedRequest ??
    ((organizerId: string, opts: Omit<EtsyRequestOptions, 'accessToken' | 'organizerId'>) => etsyAuthedRequest(organizerId, opts, deps))
  );
}

/**
 * Fetch one receipt for the webhook (URGENT). The path is built from the two numeric ids only. Throws
 * EtsyError from the door (disabled, budget, needs reauth ...); an HTTP failure returns { ok:false, status }.
 */
export async function fetchEtsyReceipt(
  args: { organizerId: string; shopId: string; receiptId: string },
  deps: EtsyConnectorDeps = {}
): Promise<EtsyReceiptFetchResult> {
  if (!POSITIVE_ID.test(args.shopId) || !POSITIVE_ID.test(args.receiptId)) return { ok: false, status: 400 };
  const res: EtsyResponse = await authedFn(deps)(args.organizerId, {
    method: 'GET',
    path: `/v3/application/shops/${args.shopId}/receipts/${args.receiptId}`,
    priority: 'URGENT',
    endpoint: 'GET getShopReceipt',
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, transactions: extractEtsyTransactions(res.data) };
}

/**
 * Fetch one page of paid, not-canceled receipts changed since a time, oldest change first (BACKGROUND).
 * Throws EtsyError from the door; an HTTP failure returns { ok:false, status }.
 */
export async function fetchEtsyReceiptsPage(
  args: { organizerId: string; shopId: string; minLastModified: Date; offset: number; limit?: number },
  deps: EtsyConnectorDeps = {}
): Promise<EtsyReceiptsPageResult> {
  if (!POSITIVE_ID.test(args.shopId)) return { ok: false, status: 400 };
  const limit = Math.max(1, Math.min(args.limit ?? ETSY_RECEIPT_PAGE_LIMIT, ETSY_RECEIPT_PAGE_LIMIT));
  const offset = Math.max(0, Math.floor(args.offset));
  const since = Math.max(MIN_SECONDS, Math.floor(args.minLastModified.getTime() / 1000));
  const res: EtsyResponse = await authedFn(deps)(args.organizerId, {
    method: 'GET',
    path: `/v3/application/shops/${args.shopId}/receipts`,
    priority: 'BACKGROUND',
    endpoint: 'GET getShopReceipts',
    query: {
      was_paid: true,
      was_canceled: false,
      min_last_modified: since,
      sort_on: 'updated',
      sort_order: 'asc',
      limit,
      offset,
    },
  });
  if (!res.ok) return { ok: false, status: res.status };

  const results: unknown[] = res.data && Array.isArray(res.data.results) ? res.data.results : [];
  const transactions: EtsyReceiptTransaction[] = [];
  let maxUpdatedAt: Date | null = null;
  let previous: number | null = null;
  let ascending = true;
  for (const receipt of results) {
    transactions.push(...extractEtsyTransactions(receipt));
    const rec = receipt && typeof receipt === 'object' ? (receipt as Record<string, unknown>) : {};
    const updated = toDateFromEpochSeconds(rec.updated_timestamp ?? rec.update_timestamp);
    if (updated) {
      if (previous !== null && updated.getTime() < previous) ascending = false;
      previous = updated.getTime();
      if (!maxUpdatedAt || updated.getTime() > maxUpdatedAt.getTime()) maxUpdatedAt = updated;
    }
  }
  return { ok: true, transactions, receiptCount: results.length, maxUpdatedAt, ascending };
}
