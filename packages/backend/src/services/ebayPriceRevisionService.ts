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
import { reanalyzeItem } from './reanalyzeService';
import { prisma } from '../lib/prisma';

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
  // eBay-sync-issues auto-repair (2026-09-19): set when the FIRST plain-price revision
  // attempt failed and a repair retry succeeded. Absent on a first-try success (the common
  // case) and absent (not false) when no repair was attempted at all.
  repaired?: boolean;
  repairMethod?: 'best-offer-threshold' | 'category-aspect';
}

// ── eBay-sync-issues auto-repair helpers (2026-09-19) ──────────────────────────
// Root-caused via live Railway logs against 35 items stuck in the eBay sync-issues
// queue (markdown-sync-issues audit, 2026-09-19): 26/35 were a live eBay listing's
// EXISTING BestOfferAutoAcceptPrice/MinimumBestOfferPrice (set once at initial listing
// time, never recomputed since) sitting above a newly-markdown'd price; 4/35 were
// category-aspect/required-field errors (some likely eBay taxonomy drift, some
// possibly missing at listing time); the rest are the $0.99 floor (see
// markdownCycleCron.ts/markdownCron.ts fixes) or one-off data issues this file does
// not attempt to auto-repair (invalid Shipping Package type, a VideoID the seller
// account doesn't own -- these need someone to look at that specific listing, not an
// automatic retry, since retrying an unchanged bad field never succeeds).

function isBestOfferThresholdError(detail: string | undefined): boolean {
  if (!detail) return false;
  return (
    /best offer auto accept/i.test(detail) ||
    /auto decline amount/i.test(detail) ||
    /minimum best offer price/i.test(detail)
  );
}

function isCategoryAspectError(detail: string | undefined): boolean {
  if (!detail) return false;
  return (
    /required field/i.test(detail) ||
    /item specific/i.test(detail) ||
    /aspects for this category/i.test(detail)
  );
}

/**
 * Recompute safe Best-Offer thresholds proportional to a new (lower) price, so a
 * markdown never leaves BestOfferAutoAcceptPrice/MinimumBestOfferPrice sitting above
 * the new Buy-It-Now price. Ratios mirror ebayController.ts's publish-path Best-Offer
 * shape -- not a new design decision, just applying the same proportions at revise time
 * that already exist at initial-listing time.
 */
// Same eBay Inventory API packageType enum ebayController.ts's publish-path payload
// builder validates against (~line 2864) -- kept in sync manually since it's a strict
// eBay-side enum, not a schema-driven list.
const VALID_PACKAGE_TYPES = new Set([
  'LETTER', 'BULKY_GOODS', 'CARAVAN', 'CARS', 'EUROPALLET', 'EXPANDABLE_TOUGH_BAGS',
  'EXTRA_LARGE_PACK', 'FURNITURE', 'INDUSTRY_VEHICLES', 'LARGE_CANADA_POSTBOX',
  'LARGE_CANADA_POST_BUBBLE_MAILER', 'LARGE_ENVELOPE', 'MAILING_BOX',
  'MEDIUM_CANADA_POST_BOX', 'MEDIUM_CANADA_POST_BUBBLE_MAILER', 'MOTORBIKES',
  'ONE_WAY_PALLET', 'PACKAGE_THICK_ENVELOPE', 'PADDED_BAGS',
  'PARCEL_OR_PADDED_ENVELOPE', 'ROLL', 'SMALL_CANADA_POST_BOX',
  'SMALL_CANADA_POST_BUBBLE_MAILER', 'TOUGH_BAGS', 'UPS_LETTER',
  'USPS_FLAT_RATE_ENVELOPE', 'USPS_LARGE_PACK', 'VERY_LARGE_PACK',
  'WINE_PRESENTATION_BOX',
]);

function computeSafeBestOfferThresholds(newPrice: number): { accept: number; minimum: number } {
  const accept = Math.max(0.99, Math.round(newPrice * 0.9 * 100) / 100);
  const minimum = Math.max(0.5, Math.round(accept * 0.75 * 100) / 100);
  return { accept, minimum };
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
  ebayListingId?: string | null,
  itemId?: string
): Promise<EbayPriceRevisionResult> {
  // Don't spend eBay calls when rate-limited — skip and let the caller defer to next cycle.
  if (isEbayRateLimited()) {
    return { ok: false, reason: 'rate-limited' };
  }
  // eBay-sync-issues auto-repair (2026-09-19): never even attempt a sub-$0.99 price --
  // eBay rejects it outright (errorId 25016) and retrying the identical value forever
  // never succeeds. The real fix is at the caller (markdownCycleCron.ts/markdownCron.ts
  // both floor at $0.99 now too); this is a defensive last-resort floor for any other
  // future caller of this function.
  const safeNewPrice = Math.max(0.99, newPrice);
  if (!offerId) {
    if (!ebayListingId) {
      return { ok: false, reason: 'no-offer-id' };
    }
    // Legacy listing: no Offer object exists (never pushed through the Inventory-API
    // publish flow), but a live eBay listing (Item.ebayListingId) does. Revise its price
    // in place via the Trading API -- same ItemID, never a new listing, never a delete.
    return reviseLegacyListingPrice(ebayListingId, safeNewPrice, accessToken, itemId);
  }

  try {
    const getRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken, { method: 'GET' });
    trackEbayCall();
    if (!getRes.ok) {
      const bodyText = await getRes.text().catch(() => '');
      return { ok: false, reason: 'get-failed', detail: `HTTP ${getRes.status} ${bodyText.slice(0, 200)}` };
    }
    const offerBody = (await getRes.json()) as Record<string, unknown>;
    // Diagnostic (2026-09-19): the Loy Norrix vinyl-record shipping-package-type
    // rejection is a GET-then-PUT round-trip failure we haven't been able to see the
    // literal shape of yet -- log exactly what eBay's GET returns for the packaging
    // block so the next failure (if any) tells us precisely what's wrong instead of
    // requiring another guess. Cheap and low-noise: one line per priced item per sync.
    console.log(`[eBay PriceRevision] offer=${offerId} item=${itemId ?? 'n/a'} packageWeightAndSize=${JSON.stringify(offerBody.packageWeightAndSize ?? null)}`);

    // eBay-sync-issues auto-repair (2026-09-19, root-caused live via the diagnostic log
    // above): some legacy-import offers have NO packageWeightAndSize on eBay's side at
    // all -- confirmed empirically for the Loy Norrix vinyl-record item (offer GET
    // returned packageWeightAndSize=null). A price-only PUT that spreads that null
    // straight back leaves the offer with no packaging block, and eBay's full-offer
    // re-validation then rejects the PUT for a missing/invalid Shipping Package type --
    // even though FindA.Sale's own Item record has valid weight/dims/packageType that
    // were simply never pushed. Rebuild the block from our own data (same enum
    // allowlist ebayController.ts's publish payload uses) so the round-trip carries it
    // along instead of dropping it.
    if (!offerBody.packageWeightAndSize && itemId) {
      try {
        const pkg = await prisma.item.findUnique({
          where: { id: itemId },
          select: { packageWeightOz: true, packageLengthIn: true, packageWidthIn: true, packageHeightIn: true, packageType: true },
        });
        if (pkg?.packageWeightOz) {
          const pt = pkg.packageType ? String(pkg.packageType).trim().toUpperCase().replace(/\s+/g, '_') : '';
          offerBody.packageWeightAndSize = {
            weight: { unit: 'OUNCE', value: Number(pkg.packageWeightOz) },
            ...(pkg.packageLengthIn && pkg.packageWidthIn && pkg.packageHeightIn
              ? { dimensions: { unit: 'INCH', length: Number(pkg.packageLengthIn), width: Number(pkg.packageWidthIn), height: Number(pkg.packageHeightIn) } }
              : {}),
            ...(pt && VALID_PACKAGE_TYPES.has(pt) ? { packageType: pt } : {}),
          };
          console.log(`[eBay PriceRevision] item=${itemId} rebuilt missing packageWeightAndSize from Item record before PUT`);
        }
      } catch (pkgErr) {
        console.warn(`[eBay PriceRevision] item=${itemId} failed to rebuild packageWeightAndSize: ${(pkgErr as Error).message}`);
      }
    }

    // Scoped mutation: ONLY pricingSummary.price.value/currency (and, when repairing a
    // Best-Offer-threshold failure below, bestOfferTerms) change. Every other field on
    // the offer is preserved exactly as eBay returned it — this is a price-only
    // revision, not a full offer rewrite (that's heal25005's job, a different blast
    // radius for a different failure class).
    const buildUpdatedOffer = (bestOffer?: { accept: number; minimum: number }): Record<string, unknown> => {
      const offer: Record<string, unknown> = {
        ...offerBody,
        pricingSummary: {
          ...(offerBody.pricingSummary as Record<string, unknown> | undefined),
          price: {
            currency: 'USD',
            value: safeNewPrice.toFixed(2),
          },
        },
      };
      if (bestOffer) {
        // Shape mirrors ebayController.ts's publish-path bestOfferTerms exactly.
        offer.bestOfferTerms = {
          bestOfferEnabled: true,
          autoAcceptPrice: { value: bestOffer.accept.toFixed(2), currency: 'USD' },
          autoDeclinePrice: { value: bestOffer.minimum.toFixed(2), currency: 'USD' },
        };
      }
      // Same read-only-field strip heal25005 already applies before PUTting a GET body back
      // (services/ebayPublishService.ts heal25005) — eBay rejects these if echoed back.
      for (const ro of ['offerId', 'status', 'listing', 'listingId', 'listingStatus', 'marketplaceId']) {
        delete offer[ro];
      }
      return offer;
    };

    const putOffer = async (offer: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> => {
      const putRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken, {
        method: 'PUT',
        body: offer,
      });
      trackEbayCall();
      if (!putRes.ok && putRes.status !== 204) {
        const bodyText = await putRes.text().catch(() => '');
        return { ok: false, detail: `HTTP ${putRes.status} ${bodyText.slice(0, 200)}` };
      }
      return { ok: true };
    };

    const firstAttempt = await putOffer(buildUpdatedOffer());
    if (firstAttempt.ok) {
      return { ok: true, method: 'inventory-api' };
    }

    // ── eBay-sync-issues auto-repair (2026-09-19) ──────────────────────────────────
    // Repair retry #1: Best-Offer threshold conflict.
    if (isBestOfferThresholdError(firstAttempt.detail)) {
      const thresholds = computeSafeBestOfferThresholds(safeNewPrice);
      const repairAttempt = await putOffer(buildUpdatedOffer(thresholds));
      if (repairAttempt.ok) {
        return { ok: true, method: 'inventory-api', repaired: true, repairMethod: 'best-offer-threshold' };
      }
      // Repair itself failed too -- report the ORIGINAL failure, not the repair
      // attempt's (possibly different) error, so existing logging/notifications stay
      // meaningful.
      return { ok: false, reason: 'put-failed', detail: firstAttempt.detail };
    }

    // Repair retry #2: category-aspect / required-field conflict.
    if (isCategoryAspectError(firstAttempt.detail) && itemId) {
      const reanalysis = await reanalyzeItem(itemId, { apply: true, syncEbay: false });
      if ('ok' in reanalysis && reanalysis.ok) {
        const repairAttempt = await putOffer(buildUpdatedOffer());
        if (repairAttempt.ok) {
          return { ok: true, method: 'inventory-api', repaired: true, repairMethod: 'category-aspect' };
        }
      }
      return { ok: false, reason: 'put-failed', detail: firstAttempt.detail };
    }

    return { ok: false, reason: 'put-failed', detail: firstAttempt.detail };
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
  accessToken: string,
  itemId?: string
): Promise<EbayPriceRevisionResult> {
  // eBay-sync-issues auto-repair (2026-09-19): this is the path that hit 26/35 of the
  // stuck items in the 2026-09-19 audit, all with the SAME root cause -- these legacy
  // (April-2026-batch, pre-Inventory-API) listings' existing BestOfferAutoAcceptPrice /
  // MinimumBestOfferPrice (set once at initial listing time, never recomputed since)
  // sitting above a newly-markdown'd StartPrice. bestOffer, when supplied, adds a
  // <BestOfferDetails> block to the ReviseItemRequest so both move together.
  const buildReviseXml = (bestOffer?: { accept: number; minimum: number }): string => `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${ebayListingId}</ItemID>
    <StartPrice currencyID="USD">${newPrice.toFixed(2)}</StartPrice>${bestOffer ? `
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
      <BestOfferAutoAcceptPrice currencyID="USD">${bestOffer.accept.toFixed(2)}</BestOfferAutoAcceptPrice>
      <MinimumBestOfferPrice currencyID="USD">${bestOffer.minimum.toFixed(2)}</MinimumBestOfferPrice>
    </BestOfferDetails>` : ''}
  </Item>
</ReviseItemRequest>`;

  const sendRevise = async (xml: string): Promise<EbayPriceRevisionResult> => {
    try {
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
        body: xml,
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
  };

  const firstAttempt = await sendRevise(buildReviseXml());
  if (firstAttempt.ok) {
    return firstAttempt;
  }

  // Repair retry #1: Best-Offer threshold conflict (the dominant failure class found in
  // the 2026-09-19 sync-issues audit).
  if (isBestOfferThresholdError(firstAttempt.detail)) {
    const thresholds = computeSafeBestOfferThresholds(newPrice);
    const repairAttempt = await sendRevise(buildReviseXml(thresholds));
    if (repairAttempt.ok) {
      return { ...repairAttempt, repaired: true, repairMethod: 'best-offer-threshold' };
    }
    // Diagnostic (2026-09-19): repair retry #1 didn't resolve it -- log its own detail
    // (distinct from firstAttempt.detail) so a persisting failure shows exactly what the
    // REPAIRED thresholds were rejected for, instead of only ever seeing the original error.
    console.warn(`[eBay PriceRevision] legacy best-offer repair FAILED item=${itemId ?? 'n/a'} listing=${ebayListingId} triedAccept=${thresholds.accept} triedMinimum=${thresholds.minimum} newPrice=${newPrice} repairDetail=${repairAttempt.detail ?? 'n/a'}`);
    return firstAttempt;
  }

  // Repair retry #2: category-aspect / required-field conflict.
  if (isCategoryAspectError(firstAttempt.detail) && itemId) {
    const reanalysis = await reanalyzeItem(itemId, { apply: true, syncEbay: false });
    if ('ok' in reanalysis && reanalysis.ok) {
      const repairAttempt = await sendRevise(buildReviseXml());
      if (repairAttempt.ok) {
        return { ...repairAttempt, repaired: true, repairMethod: 'category-aspect' };
      }
    }
    return firstAttempt;
  }

  return firstAttempt;
}
