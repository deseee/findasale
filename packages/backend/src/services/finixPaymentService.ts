import { getFinixClient } from './finixConnectService';

/**
 * Finix Payment Service (2026-09-18, sandbox build-ahead-of-approval)
 * Mirrors squarePaymentService.ts's shape (single choke-point charge function, ok/code/
 * message result type) but for Finix's Transfer + split_transfers model.
 *
 * ================================================================================
 * IMPORTANT -- API SHAPE CONFIDENCE LEVEL: same caveat as finixConnectService.ts -- this
 * is written against Finix's PUBLIC docs (docs.finix.com/guides/online-payments/
 * payment-features/split-transactions, pulled 2026-09-18), NOT verified against a live
 * sandbox account or a real API response. Treat field names as documented-but-unconfirmed.
 * ================================================================================
 *
 * SPLIT-TRANSFER PARTY COUNT -- CONFIRMED, not just documented (2026-09-18, same session,
 * later pass): real sandbox testing ran 2-way, 3-way, and 4-way split_transfers calls
 * against a live Finix Transfer -- all returned 201/SUCCEEDED. ADR-127's assumed 3-party
 * real-time ceiling (based on something Patrick was told directly by Finix) is NOT
 * enforced by Finix's API, at least through 4 parties tested. See claude_docs/feature-notes/
 * finix-sandbox-smoke-test-results-2026-09-18.md "Update (same session, later pass)" for
 * the exact request/response evidence. Patrick still wants to confirm the discrepancy
 * directly with Finix (it may have been about the production account specifically, or a
 * manual-review threshold, not an API-enforced cap) -- but the code should keep building
 * splitTransfers as the generic N-length array it already is below (FinixSplitTransfer[]),
 * no code change needed there, this file's comments were just stale.
 */

// ---------------------------------------------------------------------------
// Money helper -- Finix amounts are in cents, same convention this codebase already uses
// for Square/Stripe (toSquareMoney's sibling). No conversion needed beyond passing the
// integer cents value through -- kept as a named export for call-site clarity/parity with
// squarePaymentService.ts's toSquareMoney, and as a single place to fix if Finix's actual
// response format turns out to need something else once confirmed against a real account.
// ---------------------------------------------------------------------------
export const toFinixAmountCents = (amountCents: number): number => Math.round(amountCents);

export interface FinixSplitTransfer {
  /** Recipient Finix Merchant id. */
  merchantId: string;
  /** Amount in cents allocated to this merchant. Sum of all splits must equal the parent transfer amount. */
  amountCents: number;
  /** Optional fee (cents) collected from this specific split -- UNCONFIRMED exact semantics, see docs.finix.com split-transactions guide. */
  feeCents?: number;
  tags?: Record<string, string>;
}

export interface FinixTransferParams {
  /** The merchant the funds are sourced from / the "parent" transfer merchant -- UNCONFIRMED exact required-field semantics against a real charge (card charge vs merchant-to-merchant transfer may differ). */
  merchantId: string;
  /** Payment instrument id (tokenized card) -- UNCONFIRMED exact field name ("source" per the split-transactions example pulled 2026-09-18). */
  source: string;
  amountCents: number;
  currency?: string; // defaults to 'USD'
  /** Real-time split across N approved Merchants. Empty/omitted = no split, full amount to merchantId.
   * CONFIRMED 2026-09-19 (real sandbox testing, full test suite pass): two hard constraints, both
   * enforced server-side with a 422 BAD_REQUEST if violated -- (1) the sum of every entry's amountCents
   * in this array MUST equal the parent transfer's amountCents exactly (a naive "splits are the
   * platform's cut, the rest implicitly goes to merchantId" model is WRONG -- there is no implicit
   * remainder); (2) `merchantId` (the top-level/primary merchant on this transfer) MUST also appear
   * as one of the entries in this array with its own explicit amountCents, or Finix rejects the whole
   * request with "the primary merchant must be present in the split_transfers". Confirmed working up
   * through a 7-way split (primary + 6 others) with no cap hit. See claude_docs/feature-notes/
   * finix-sandbox-smoke-test-results-2026-09-18.md, "Update (same session, fourth pass -- full test
   * suite)" for the exact request/response evidence. Whoever wires this into ADR-127's hub design
   * needs to build the splits array as primary-merchant-inclusive and sum-exact, not additive-on-top.
   */
  splitTransfers?: FinixSplitTransfer[];
  idempotencyKey?: string; // CONFIRMED 2026-09-18: sent as an `idempotency_id` field in the request body (NOT an Idempotency-Key header -- that was tested and does not dedupe at all). A duplicate idempotencyKey on a second call returns a 422 ("Duplicate transfer <id> already exists...") rather than transparently replaying the original success like Stripe/Square -- the original transfer's id is included in the error body if a caller wants to recover it, but that recovery logic is not implemented here yet. See the feature note referenced in this file's header.
  tags?: Record<string, string>;
}

export interface FinixTransferSuccess {
  ok: true;
  transferId: string;
  status: string;
  raw: unknown;
}

export interface FinixTransferFailure {
  ok: false;
  code: string;
  message: string;
  raw?: unknown;
}

export type FinixTransferResult = FinixTransferSuccess | FinixTransferFailure;

const DECLINE_MESSAGE = 'Your card was declined. Please check your card details or try a different card.';

/**
 * Single choke point for every Finix transfer/charge call, mirroring
 * squarePaymentService.ts's createSquareCharge(). Supports an optional real-time
 * multi-party split via splitTransfers -- this is the function ADR-127's Maple Lake Mall
 * hub design (platform / mall / vendor-booth split) will eventually call once Finix
 * production approval lands and the party-count question above is resolved.
 *
 * NOT wired into any controller/route yet -- this is isolated new code per this
 * dispatch's scope, not yet reachable from any live checkout path.
 */
export async function createFinixTransfer(params: FinixTransferParams): Promise<FinixTransferResult> {
  const client = getFinixClient();

  if (params.splitTransfers && params.splitTransfers.length > 0) {
    const splitSum = params.splitTransfers.reduce((sum, s) => sum + s.amountCents, 0);
    if (splitSum !== params.amountCents) {
      return {
        ok: false,
        code: 'SPLIT_SUM_MISMATCH',
        message: `Split transfer amounts (${splitSum}) do not sum to the parent transfer amount (${params.amountCents}).`,
      };
    }
  }

  try {
    // Field shape per docs.finix.com/guides/online-payments/payment-features/
    // split-transactions (2026-09-18) -- UNCONFIRMED against a live response, see file header.
    const response = await client.post('/transfers', {
      merchant: params.merchantId,
      source: params.source,
      amount: toFinixAmountCents(params.amountCents),
      currency: params.currency || 'USD',
      ...(params.splitTransfers && params.splitTransfers.length > 0
        ? {
            split_transfers: params.splitTransfers.map((s) => ({
              merchant: s.merchantId,
              amount: toFinixAmountCents(s.amountCents),
              ...(s.feeCents ? { fee: toFinixAmountCents(s.feeCents) } : {}),
              ...(s.tags ? { tags: s.tags } : {}),
            })),
          }
        : {}),
      // Confirmed field name/behavior 2026-09-18 -- see idempotencyKey's JSDoc above.
      ...(params.idempotencyKey ? { idempotency_id: params.idempotencyKey } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
    });

    const data = response.data as any;
    if (!data?.id) {
      return { ok: false, code: 'NO_TRANSFER_IN_RESPONSE', message: DECLINE_MESSAGE, raw: data };
    }

    // CONFIRMED BUG FIX 2026-09-18 (real sandbox decline test): a declined transfer still
    // returns HTTP 201 with a valid `id` -- Finix puts the actual result in `state`
    // ('SUCCEEDED' | 'FAILED' | ...), not the HTTP status. A decline-test card (PAN
    // 4000000000000002) confirmed this: 201 response, id present, state: 'FAILED',
    // failure_code: 'DO_NOT_HONOR'. Checking only `data?.id` above would have silently
    // treated a declined charge as successful. See claude_docs/feature-notes/
    // finix-sandbox-smoke-test-results-2026-09-18.md "Update (same session, third pass)".
    if (data.state !== 'SUCCEEDED') {
      return {
        ok: false,
        code: data.failure_code || 'TRANSFER_NOT_SUCCEEDED',
        message: DECLINE_MESSAGE,
        raw: data,
      };
    }

    return {
      ok: true,
      transferId: data.id,
      status: data.state || data.status || 'UNKNOWN',
      raw: data,
    };
  } catch (err: any) {
    // Finix's error response shape is UNCONFIRMED against a live failure -- this catch
    // deliberately does not try to parse a specific error-code field yet (unlike Square's
    // structured SquareError.errors array, which this codebase already knows how to
    // unpack). Logs the raw error for whoever does the real sandbox validation pass.
    const raw = err?.response?.data ?? err?.message ?? err;
    return {
      ok: false,
      code: 'FINIX_REQUEST_FAILED',
      message: DECLINE_MESSAGE,
      raw,
    };
  }
}

/**
 * Refunds/reverses a Finix transfer. Field shape CONFIRMED against a real sandbox
 * response, 2026-09-18: `POST /transfers/{id}/reversals` with `{refund_amount}` returns a
 * new Transfer (`type: 'REVERSAL'`, `operation_key: 'CARD_NOT_PRESENT_REFUND'`,
 * `parent_transfer` pointing at the original) -- see the feature note referenced above,
 * "Update (same session, third pass)".
 *
 * IMPORTANT: unlike a card charge, a reversal's initial state on a successful sandbox
 * call was 'PENDING', not 'SUCCEEDED' (it settles asynchronously) -- confirmed via one
 * real successful reversal only. A reversal's FAILURE state value was NOT observed this
 * session (no failing reversal was tested), so this function does not assume 'SUCCEEDED'
 * the way createFinixTransfer() does. Instead it trusts `!data?.id` plus a present
 * `data.failure_code` as the failure signal (the one successful reversal tested had
 * `failure_code: null`) -- this is a reasonable inference, not independently confirmed
 * against a real failing reversal. Revisit once a real declined/failed reversal has been
 * observed.
 */
export async function createFinixReversal(
  transferId: string,
  refundAmountCents: number
): Promise<FinixTransferResult> {
  const client = getFinixClient();

  try {
    const response = await client.post(`/transfers/${transferId}/reversals`, {
      refund_amount: toFinixAmountCents(refundAmountCents),
    });

    const data = response.data as any;
    if (!data?.id || data.failure_code) {
      return {
        ok: false,
        code: data?.failure_code || 'NO_REVERSAL_IN_RESPONSE',
        message: DECLINE_MESSAGE,
        raw: data,
      };
    }

    return {
      ok: true,
      transferId: data.id,
      status: data.state || data.status || 'UNKNOWN',
      raw: data,
    };
  } catch (err: any) {
    const raw = err?.response?.data ?? err?.message ?? err;
    return {
      ok: false,
      code: 'FINIX_REQUEST_FAILED',
      message: DECLINE_MESSAGE,
      raw,
    };
  }
}
