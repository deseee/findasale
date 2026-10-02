/**
 * ebayOrderState.ts -- eBay sync hardening (2026-10-01)
 *
 * Pure classification of an eBay Fulfillment API order (cancel / payment / refund state) plus a
 * read-only single-order fetch. Used by:
 *   - jobs/ebaySoldSyncCron.ts (skip cancelled / unpaid / fully refunded lines; reverse-reconcile
 *     already-recorded sales whose order was later cancelled or refunded)
 *   - services/ebaySaleReopenService.ts (verify "this order is verifiably cancelled/refunded per eBay")
 *
 * Shape reference (eBay Sell Fulfillment API getOrder):
 *   cancelStatus.cancelState : NONE_REQUESTED | CANCEL_REQUESTED | IN_PROGRESS | CANCELED | ...
 *   orderPaymentStatus       : PAID | PENDING | FAILED | FULLY_REFUNDED | PARTIALLY_REFUNDED
 *   lineItems[].refunds[]    : { amount: { value } }  (refunds applied to that line)
 *   lineItems[].total / lineItemCost : { value } strings
 *   paymentSummary.refunds[] : order-level refunds
 * Every field is optional in this module: a missing field is treated as "no signal" (NOT as a
 * cancellation), so an unexpected response shape never blocks a real sale.
 */

import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders } from './ebayHttp';

export interface EbayOrderMoney {
  value?: string | number;
}

export interface EbayOrderLineItemShape {
  sku?: string;
  legacyItemId?: string;
  title?: string;
  lineItemId?: string;
  quantity?: number;
  total?: EbayOrderMoney;
  lineItemCost?: EbayOrderMoney;
  refunds?: Array<{ amount?: EbayOrderMoney }>;
}

export interface EbayOrderShape {
  orderId: string;
  cancelStatus?: { cancelState?: string };
  orderPaymentStatus?: string;
  paymentSummary?: { refunds?: Array<{ amount?: EbayOrderMoney }> };
  lineItems?: EbayOrderLineItemShape[];
}

export type EbayOrderVerdict =
  | { counts: true }
  | { counts: false; kind: 'CANCELLED' | 'CANCEL_PENDING' | 'REFUNDED' | 'UNPAID'; reason: string };

const toNum = (m: EbayOrderMoney | undefined): number => {
  if (!m || m.value === undefined || m.value === null) return 0;
  const n = typeof m.value === 'number' ? m.value : parseFloat(m.value);
  return Number.isFinite(n) ? n : 0;
};

/** True when refunds recorded against this line cover its full total (or its cost when total is absent). */
export function isLineFullyRefunded(line: EbayOrderLineItemShape): boolean {
  const refunded = (line.refunds || []).reduce((sum, r) => sum + toNum(r.amount), 0);
  if (refunded <= 0) return false;
  const lineTotal = toNum(line.total) || toNum(line.lineItemCost);
  if (lineTotal <= 0) return false;
  return refunded + 0.005 >= lineTotal;
}

/**
 * Decide whether an order line should count as a real sale.
 *  - cancelState other than NONE_REQUESTED (missing = none) -> does not count
 *  - orderPaymentStatus FULLY_REFUNDED / PENDING / FAILED -> does not count (missing = PAID)
 *  - PARTIALLY_REFUNDED counts only while the line itself is not fully refunded
 */
export function classifyEbayOrderLine(order: EbayOrderShape, line?: EbayOrderLineItemShape): EbayOrderVerdict {
  const cancelState = order.cancelStatus?.cancelState;
  if (cancelState && cancelState !== 'NONE_REQUESTED') {
    const kind = cancelState === 'CANCELED' ? 'CANCELLED' : 'CANCEL_PENDING';
    return { counts: false, kind, reason: `cancelState=${cancelState}` };
  }
  const pay = order.orderPaymentStatus;
  if (pay === 'FULLY_REFUNDED') {
    return { counts: false, kind: 'REFUNDED', reason: 'orderPaymentStatus=FULLY_REFUNDED' };
  }
  if (pay && pay !== 'PAID' && pay !== 'PARTIALLY_REFUNDED') {
    return { counts: false, kind: 'UNPAID', reason: `orderPaymentStatus=${pay}` };
  }
  if (line && isLineFullyRefunded(line)) {
    return { counts: false, kind: 'REFUNDED', reason: 'line fully refunded' };
  }
  return { counts: true };
}

/** Read-only GET of one order. Returns null when eBay cannot be reached or the order is unknown. */
export async function fetchEbayOrder(accessToken: string, orderId: string): Promise<EbayOrderShape | null> {
  try {
    const res = await fetch(
      ebayProxyUrl(encodeURIComponent(`/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`)),
      { method: 'GET', headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) {
      console.warn(`[eBay Order] GET order ${orderId} failed: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as EbayOrderShape;
  } catch (err: any) {
    console.warn(`[eBay Order] GET order ${orderId} error:`, err?.message);
    return null;
  }
}
