/**
 * ebayListingFeeCheck.ts — Live per-item eBay insertion-fee check (ADR-115)
 *
 * Calls eBay's own POST /sell/inventory/v1/offer/get_listing_fees for a single
 * unpublished offer and reports whether publishing it right now would be free
 * or would incur a real insertion fee, per eBay's OWN account state at call
 * time -- this replaces the old local concurrent-count guess that used to gate
 * ebayListingQueueCron.ts, which had no visibility into eBay's real monthly
 * free-listing allotment (Good-Til-Cancelled renewals and relists also consume
 * from that same monthly pool, not just brand-new listings).
 *
 * eBay's own docs (developer.ebay.com "Retrieving expected listing fees" guide)
 * note two real limits: this call only works on UNPUBLISHED offers, and its
 * numbers are an estimate at call time, not a guarantee at actual publish time.
 * Treat 'unknown' conservatively -- callers must NOT publish when the result is
 * 'unknown', the same fail-closed posture this codebase already uses for the
 * weight/dims guard in ebayListingQueueCron.ts.
 *
 * NOT independently verified against eBay's sandbox from this session (no eBay
 * credentials available in this environment) -- the request/response shape
 * below is sourced from eBay's own published API docs
 * (developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/getListingFees
 * and the FeeSummary/Fee type references), not from a live test call. Flagged
 * in the Dev Handoff for a real integration check before this gates production
 * traffic at volume.
 *
 * UPDATE (2026-09-20, Patrick-reported mismatch): the Fee type
 * (developer.ebay.com/api-docs/sell/inventory/types/slr:Fee) documents a
 * `promotionalDiscount` field alongside `amount` on each Fee entry -- "any
 * eBay promotional discount applied toward the listing fee type." This was
 * previously ignored, so an organizer with remaining monthly free-listing
 * quota could be shown the raw pre-discount InsertionFee (e.g. $0.35) as if
 * it were a real charge, when eBay's own account page showed free slots still
 * available. Below now nets amount - promotionalDiscount before deciding
 * free vs fee. This net-of-discount computation is ALSO still unverified
 * against a live eBay response from this codebase's integration -- it is the
 * best reading of eBay's documented field semantics, not a confirmed-correct
 * observation. Needs a real-account smoke test before being trusted at scale.
 */

import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders } from '../services/ebayHttp';

export type EbayFeeCheckResult =
  | { status: 'free' }
  | { status: 'fee'; amount: number; currency: string }
  | { status: 'unknown'; reason: string };

export async function checkEbayListingFee(
  offerId: string,
  accessToken: string
): Promise<EbayFeeCheckResult> {
  try {
    const path = encodeURIComponent('/sell/inventory/v1/offer/get_listing_fees');
    const resp = await fetch(ebayProxyUrl(path), {
      method: 'POST',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
      body: JSON.stringify({ offers: [{ offerId }] }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { status: 'unknown', reason: `HTTP ${resp.status} — ${errText.slice(0, 200)}` };
    }

    const data = (await resp.json()) as {
      feeSummaries?: Array<{
        fees?: Array<{
          feeType?: string;
          amount?: { value?: string; currency?: string };
          promotionalDiscount?: { value?: string; currency?: string };
        }>;
      }>;
    };

    const summaries = data.feeSummaries ?? [];
    for (const summary of summaries) {
      for (const fee of summary.fees ?? []) {
        if (fee.feeType === 'InsertionFee') {
          const raw = fee.amount?.value;
          const amount = raw != null ? parseFloat(raw) : NaN;
          if (Number.isNaN(amount)) {
            return { status: 'unknown', reason: `InsertionFee.amount.value unparseable: ${raw}` };
          }
          // eBay's Fee type carries a separate `promotionalDiscount` (e.g. the seller's
          // remaining monthly free-listing credit applied to this InsertionFee) -- a
          // missing/absent discount field is treated as 0 (no discount), not as unknown,
          // per eBay's own docs noting many fee types/fields are returned even at 0.0.
          const rawDiscount = fee.promotionalDiscount?.value;
          const parsedDiscount = rawDiscount != null ? parseFloat(rawDiscount) : 0;
          const discount = Number.isNaN(parsedDiscount) ? 0 : parsedDiscount;
          const netAmount = amount - discount;
          if (netAmount <= 0.001) {
            return { status: 'free' };
          }
          return { status: 'fee', amount: netAmount, currency: fee.amount?.currency ?? 'USD' };
        }
      }
    }

    // eBay's docs say fee types are "often returned even when 0.0" -- but don't
    // assume free if InsertionFee is simply absent from the response.
    return { status: 'unknown', reason: 'No InsertionFee line item in getListingFees response' };
  } catch (err) {
    return {
      status: 'unknown',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
