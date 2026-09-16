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
import { ebayProxyUrl, ebayProxyHeaders } from './ebayHttp';

export interface EbayPriceRevisionResult {
  ok: boolean;
  reason?:
    | 'rate-limited'
    | 'no-offer-id'
    | 'get-failed'
    | 'put-failed'
    | 'error'
    // Legacy Trading-API path (eBay-sync-issues investigation, 2026-09-16): these items
    // predate FindA.Sale's Inventory-API push flow (April 2026 batch, imported via
    // GetItem/GetMyeBaySelling sync) -- they have Item.ebayListingId (classic numeric
    // ItemID) but no Item.ebayOfferId, so there is no Offer object for the GET/PUT path
    // above to revise. See reviseLegacyListingPrice() below.
    | 'legacy-revise-failed';
  detail?: string;
  /** Which code path actually handled this revision -- absent on failures before either path ran. */
  method?: 'inventory-api' | 'trading-api-legacy';
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
  accessToken: string,
  ebayListingId?: string | null
): Promise<EbayPriceRevisionResult> {
  // Don't spend eBay calls when rate-limited — skip and let the caller defer to next cycle.
  if (isEbayRateLimited()) {
    return { ok: false, reason: 'rate-limited' };
  }
  if (!offerId) {
    if (!ebayListingId) {
      return { ok: false, reason: 'no-offer-id' };
    }
    // Legacy listing: no Offer object exists (never pushed through the Inventory-API
    // publish flow), but a live eBay listing (Item.ebayListingId) does. Revise its price
    // in place via the Trading API -- same ItemID, never a new listing, never a delete.
    return reviseLegacyListingPrice(ebayListingId, newPrice, accessToken);
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
    return { ok: true, method: 'inventory-api' };
  } catch (err) {
    return { ok: false, reason: 'error', detail: (err as Error).message };
  }
}

// Minimal local copy of the XML-value extractor ebayController.ts's Trading API parsing
// uses (module-scope `xmlVal` there is not exported) -- same regex, same behavior.
function xmlVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

/**
 * Revise price on a LEGACY eBay listing -- one that has Item.ebayListingId (a classic
 * Trading-API ItemID) but no Item.ebayOfferId, meaning FindA.Sale never created an Offer
 * object for it (imported/synced in, not published through this app's Inventory-API flow --
 * see ebayController.ts's reviseNativeListingShippingPolicy(), the same-shaped fix already
 * shipped for shipping-policy drift on these listings, which this mirrors for price).
 *
 * Uses the Trading API's ReviseItem call to update StartPrice directly on the existing
 * ItemID -- updates the SAME live listing in place. This must never create a new listing
 * or delete-then-recreate one (that burns eBay's free-listing-slot quota); ReviseItem does
 * neither -- it is a pure in-place field update on an ItemID that already exists.
 */
async function reviseLegacyListingPrice(
  ebayListingId: string,
  newPrice: number,
  accessToken: string
): Promise<EbayPriceRevisionResult> {
  try {
    const reviseXml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${ebayListingId}</ItemID>
    <StartPrice currencyID="USD">${newPrice.toFixed(2)}</StartPrice>
  </Item>
</ReviseItemRequest>`;

    const reviseRes = await fetch(ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'ReviseItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        ...ebayProxyHeaders(),
      },
      body: reviseXml,
    });
    trackEbayCall();

    if (!reviseRes.ok) {
      const bodyText = await reviseRes.text().catch(() => '');
      return { ok: false, reason: 'legacy-revise-failed', detail: `HTTP ${reviseRes.status} ${bodyText.slice(0, 200)}` };
    }

    const reviseText = await reviseRes.text();
    const ack = xmlVal(reviseText, 'Ack');
    if (ack && ack !== 'Success' && ack !== 'Warning') {
      const errMsg = xmlVal(reviseText, 'LongMessage') || xmlVal(reviseText, 'ShortMessage') || 'Unknown error';
      return { ok: false, reason: 'legacy-revise-failed', detail: `${ack}:${errMsg}`.slice(0, 200) };
    }

    return { ok: true, method: 'trading-api-legacy' };
  } catch (err) {
    return { ok: false, reason: 'legacy-revise-failed', detail: (err as Error).message };
  }
}
