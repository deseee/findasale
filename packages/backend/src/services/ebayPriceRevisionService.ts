/**
 * ebayPriceRevisionService.ts — eBay offer price-only revision helper
 *
 * ADR markdown-cycle-ebay-price-sync (2026-09-15), Dev Instructions step 3: a price-only
 * GET-offer-then-PUT-offer helper, modeled on ebayPublishService.ts's heal25005 self-heal
 * pattern (GET /sell/inventory/v1/offer/{offerId}, mutate, PUT back — see
 * services/ebayPublishService.ts ~line 1057-1088) but scoped to touch ONLY
 * pricingSummary.price.value. heal25005's full GET/mutate/PUT rewrites the whole offer
 * body (category, policies, etc.) — that's more blast radius than a price-only revision
 * needs, per the ADR's explicit instruction not to reuse that function wholesale.
 *
 * Used by:
 *  - markdownCycleCron.ts's propagateMarkdownPriceToMarketplaces (push after a markdown
 *    cuts Item.price)
 *  - ebayListingSyncCron.ts's pullSyncForOrganizer push-first step (push a locally-pending
 *    price change before pulling)
 *
 * Rate limiting: this is the single call site both callers route through, so the
 * isEbayRateLimited() guard lives HERE (checked first, before any network call) rather
 * than being re-implemented at every call site — matches the ADR's constraint that every
 * new eBay call added under this work must respect the existing soft-cap guard.
 */
import { ebayFetch } from './ebayPublishService';
import { isEbayRateLimited, trackEbayCall } from '../lib/ebayRateLimiter';

export interface EbayPriceRevisionResult {
  ok: boolean;
  reason?: 'rate-limited' | 'no-offer-id' | 'get-failed' | 'put-failed' | 'error';
  detail?: string;
}

/**
 * Revise ONLY the price on an existing eBay offer via GET-then-PUT.
 *
 * @param offerId     Item.ebayOfferId — the live offer to revise. If null/undefined,
 *                     returns { ok: false, reason: 'no-offer-id' } without any network call.
 * @param newPrice    The new price to push (FindA.Sale's current Item.price).
 * @param accessToken A valid eBay user access token for this offer's organizer
 *                     (refreshEbayAccessToken(organizerId) — caller's responsibility).
 */
export async function reviseEbayOfferPrice(
  offerId: string | null | undefined,
  newPrice: number,
  accessToken: string
): Promise<EbayPriceRevisionResult> {
  // Don't spend eBay calls when rate-limited — skip and let the caller defer to next cycle.
  if (isEbayRateLimited()) {
    return { ok: false, reason: 'rate-limited' };
  }
  if (!offerId) {
    return { ok: false, reason: 'no-offer-id' };
  }

  try {
    const getRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken, { method: 'GET' });
    trackEbayCall();
    if (!getRes.ok) {
      const bodyText = await getRes.text().catch(() => '');
      return { ok: false, reason: 'get-failed', detail: `HTTP ${getRes.status} ${bodyText.slice(0, 200)}` };
    }
    const offerBody = (await getRes.json()) as Record<string, unknown>;

    // Scoped mutation: ONLY pricingSummary.price.value/currency change. Every other
    // field on the offer is preserved exactly as eBay returned it — this is a
    // price-only revision, not a full offer rewrite (that's heal25005's job, a
    // different blast radius for a different failure class).
    const updatedOffer: Record<string, unknown> = {
      ...offerBody,
      pricingSummary: {
        ...(offerBody.pricingSummary as Record<string, unknown> | undefined),
        price: {
          currency: 'USD',
          value: newPrice.toFixed(2),
        },
      },
    };
    // Same read-only-field strip heal25005 already applies before PUTting a GET body back
    // (services/ebayPublishService.ts heal25005) — eBay rejects these if echoed back.
    for (const ro of ['offerId', 'status', 'listing', 'listingId', 'listingStatus', 'marketplaceId']) {
      delete updatedOffer[ro];
    }

    const putRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken, {
      method: 'PUT',
      body: updatedOffer,
    });
    trackEbayCall();
    if (!putRes.ok && putRes.status !== 204) {
      const bodyText = await putRes.text().catch(() => '');
      return { ok: false, reason: 'put-failed', detail: `HTTP ${putRes.status} ${bodyText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', detail: (err as Error).message };
  }
}
