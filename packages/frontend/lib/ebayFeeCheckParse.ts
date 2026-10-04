/**
 * Pure helpers for EbayFeeCheckBadge: parse the eBay fee-check response and turn failures into copy.
 *
 * Backend contract (Wave 2): POST /ebay/organizer/items/:id/ebay-fee-check answers 200 with either
 *   { ready: false, reasons: [{ code, message }] }   (not ready: no offer yet, already listed, temporarily unavailable)
 *   { ready: true, itemId, feeCheck }                (success)
 * A response without a `ready` field but with a valid `feeCheck` (the older shape) is treated as ready.
 * No React and no network here so node:test can run it.
 */

// Mirrors EbayFeeCheckResult in packages/backend/src/lib/ebayListingFeeCheck.ts.
export type EbayFeeCheckResult =
  | { status: 'free' }
  | { status: 'fee'; amount: number; currency: string }
  | { status: 'unknown'; reason: string };

export type ParsedFeeCheck =
  | { kind: 'ready'; feeCheck: EbayFeeCheckResult }
  | { kind: 'not_ready'; code: string | null; message: string }
  | { kind: 'invalid' };

export const FEE_CHECK_NOT_READY_FALLBACK = 'eBay fees cannot be checked for this item yet.';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readFeeCheck(v: unknown): EbayFeeCheckResult | null {
  if (!isObject(v)) return null;
  if (v.status === 'free') return { status: 'free' };
  if (v.status === 'fee') {
    if (typeof v.amount !== 'number' || !Number.isFinite(v.amount)) return null;
    return { status: 'fee', amount: v.amount, currency: typeof v.currency === 'string' ? v.currency : 'USD' };
  }
  if (v.status === 'unknown') {
    return { status: 'unknown', reason: typeof v.reason === 'string' ? v.reason : '' };
  }
  return null;
}

export function parseFeeCheckResponse(data: unknown): ParsedFeeCheck {
  if (!isObject(data)) return { kind: 'invalid' };

  if (data.ready === false) {
    const reasons = Array.isArray(data.reasons) ? data.reasons : [];
    const first = reasons.find((r) => isObject(r) && typeof r.message === 'string' && r.message.trim().length > 0);
    const message = first && isObject(first) ? String(first.message).trim() : FEE_CHECK_NOT_READY_FALLBACK;
    const code = first && isObject(first) && typeof first.code === 'string' ? first.code : null;
    return { kind: 'not_ready', code, message };
  }

  // ready === true, or the older shape with no `ready` field.
  const feeCheck = readFeeCheck(data.feeCheck);
  if (feeCheck) return { kind: 'ready', feeCheck };
  return { kind: 'invalid' };
}

export type FeeCheckErrorKind = 'network' | 'rate_limited' | 'client' | 'server' | 'unknown';

export const FEE_CHECK_COPY = {
  button: 'Check eBay fees',
  buttonPending: 'Checking eBay listing fee…',
  buttonAgain: 'Check again',
  couldNotConfirm: "Couldn't confirm eBay listing fee. Proceed with caution",
  network: "Couldn't reach eBay to check fees. Check your connection and try again.",
  rateLimited: 'Too many fee checks. Wait a moment and try again.',
  client: "Couldn't check eBay fees for this item right now.",
  server: 'The eBay fee check hit a problem on our side. Try again in a moment.',
} as const;

export function classifyFeeCheckError(err: unknown): { kind: FeeCheckErrorKind; message: string } {
  const response = isObject(err) && isObject(err.response) ? err.response : null;
  if (!response) {
    // axios with no response = the request never completed (offline, DNS, CORS, timeout).
    return { kind: 'network', message: FEE_CHECK_COPY.network };
  }
  const status = typeof response.status === 'number' ? response.status : 0;
  if (status === 429) return { kind: 'rate_limited', message: FEE_CHECK_COPY.rateLimited };
  if (status >= 400 && status < 500) return { kind: 'client', message: FEE_CHECK_COPY.client };
  if (status >= 500) return { kind: 'server', message: FEE_CHECK_COPY.server };
  return { kind: 'unknown', message: FEE_CHECK_COPY.couldNotConfirm };
}
