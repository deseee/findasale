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
import { ebayFetch, getRequiredAspectsForCategory, parseMissingRequiredAspectNames, pickSafeAspectDefault, resolveCoinConditionOverride } from './ebayPublishService';
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
  repairMethod?: 'best-offer-threshold' | 'category-aspect' | 'republish-escalation';
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
/**
 * Category-aspect repair, 2026-09-23 (Gap 1) -- item cmnzf780a0009pf19ru5qppqn "Amplifier
 * Type is missing" stuck in the sync-issues queue even after the 2026-09-22 fix to
 * ebayPublishService.ts's pickSafeAspectDefault(). That fix lives in the PUBLISH self-heal
 * chain (heal25002), which this price-only revision never goes through -- reviseEbayOfferPrice
 * only ever GETs/PUTs the OFFER object, never the inventory item where product.aspects
 * actually lives, so the earlier fix never had a chance to run here. This adapts heal25002's
 * approach (ebayPublishService.ts's heal25002: GET inventory item, inject product.aspects,
 * PUT back) reusing the same helpers, but stops short of heal25002's attemptPublish() call --
 * a price revision must never trigger a full republish. Returns true only when the inventory
 * item PUT itself succeeded; the caller still has to retry the offer PUT afterward.
 *
 * Return shape (2026-09-24, republish-escalation ADR): was a plain boolean until this
 * change made "nothing injected because eBay already had a valid value" indistinguishable
 * from every other no-op reason (couldn't parse a missing-aspect name, no confident value
 * found in title/description, inventory-item GET failed, aspect name didn't match a real
 * category aspect) -- live logs for 3 stuck items (cmnzf780a0009pf19ru5qppqn,
 * cmo3et2pb002djqsuyta1cslc, cmo3etpx2005hjqsuvzlkt8qz) showed this function correctly
 * reporting the aspect already-valid every cycle while the offer PUT kept failing
 * identically forever -- the caller needs to tell that ONE case apart to know when to
 * escalate to a republish (see reviseEbayOfferPrice's category-aspect repair branch).
 * `alreadyValid` is true only when an already-present value was confirmed valid and
 * skipped for that reason; every other no-op path (including "injected but the
 * inventory-item PUT itself failed") reports `alreadyValid: false`.
 */
async function injectMissingCategoryAspects(
  sku: string | null | undefined,
  categoryId: string | null | undefined,
  itemTitle: string | null | undefined,
  itemDescription: string | null | undefined,
  errorDetail: string | undefined,
  accessToken: string
): Promise<{ injected: boolean; alreadyValid: boolean }> {
  if (!sku || !categoryId) {
    console.log(`[eBay PriceRevision] category-aspect repair skipped: sku=${sku ?? 'null'} categoryId=${categoryId ?? 'null'}`);
    return { injected: false, alreadyValid: false };
  }
  // 2026-09-23 fix (confirmed live -- item cmnzf780a0009pf19ru5qppqn kept failing identically
  // after this repair shipped, with ZERO log output from this function): putOffer()'s `detail`
  // string is "HTTP <status> <body>", not raw JSON. parseMissingRequiredAspectNames does its own
  // JSON.parse in a try/catch and silently returns [] on unparseable input, so the "HTTP 400 "
  // prefix was making every single call here a silent no-op. Strip the prefix before parsing.
  const rawErrorBody = (errorDetail || '').replace(/^HTTP\s+\d+\s+/, '');
  let missingNames = parseMissingRequiredAspectNames(rawErrorBody, 25002);
  // eBay Fashion Size Standardization fallback (2026-09-23, Gap confirmed live -- items
  // cmo3etpx2005hjqsuvzlkt8qz / cmo3et2pb002djqsuyta1cslc, errorId 25129): 25129's
  // parameters[] entries are full sentence fragments ("Enter a valid value for Size.",
  // "Unspecified is not a valid value for Size...") and a bare numeric code, never a clean
  // aspect-name label the way 25002's parameters[] are -- parseMissingRequiredAspectNames'
  // label-shape filter correctly rejects all of them, so missingNames is always empty for a
  // 25129 error above. The rejected aspect name IS reliably present, though, embedded in the
  // error's own message text: "...no longer support custom values for Size. Your listing..."
  // (repeats 3x per message, same name every time -- confirmed identically on both items
  // above). Extract it from there when the 25002-shaped parse comes up empty.
  if (missingNames.length === 0 && /"errorId":25129\b/.test(rawErrorBody)) {
    // 2026-09-23 regression fix, confirmed live (deployment b1b4a3fe, items
    // cmo3etpx2005hjqsuvzlkt8qz / cmo3et2pb002djqsuyta1cslc, 06:00 + 10:00 UTC cycles):
    // the original version of this fallback required a full JSON.parse(rawErrorBody) to
    // succeed before it could read err.message -- but rawErrorBody here is putOffer()'s
    // detail string, which is HARD-TRUNCATED to 600 chars (bodyText.slice(0, 600)) before
    // it ever reaches this function. eBay's real 25129 response body is 617+ chars (message
    // + 4-entry parameters array), so the truncation always lands mid-string inside
    // parameters[3], leaving invalid/unterminated JSON -- JSON.parse always threw, the
    // catch swallowed it, and missingNames stayed permanently empty. Reproduced exactly:
    // JSON.parse on the real truncated body throws "Unterminated string". Fix: match the
    // aspect name directly against the raw text instead of requiring valid JSON -- the
    // "message" field (and the "no longer support custom values for X." phrase inside it)
    // always survives the 600-char truncation since it appears near the start of the body,
    // well before the parameters array that gets cut off.
    const m = rawErrorBody.match(/no longer support custom values for ([A-Za-z][A-Za-z0-9/ ]{0,40}?)\.\s/);
    if (m) {
      missingNames = [m[1].trim()];
      console.log(`[eBay PriceRevision] sku=${sku}: errorId 25129 (Size standardization) -- extracted aspect name "${m[1].trim()}" from error message (raw-text match, JSON may be truncated)`);
    }
  }
  if (missingNames.length === 0) {
    console.log(`[eBay PriceRevision] sku=${sku}: category-aspect repair found no parseable missing-aspect name in error detail (raw="${rawErrorBody.slice(0, 200)}")`);
    return { injected: false, alreadyValid: false };
  }

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, accessToken, { method: 'GET' });
  trackEbayCall();
  if (!invGet.ok) {
    console.log(`[eBay PriceRevision] sku=${sku}: category-aspect repair bailed -- inventory item GET failed (HTTP ${invGet.status})`);
    return { injected: false, alreadyValid: false };
  }
  const invBody = (await invGet.json()) as any;

  if (!invBody.product || typeof invBody.product !== 'object') invBody.product = {};
  const aspectsObj: Record<string, string[]> =
    invBody.product.aspects && typeof invBody.product.aspects === 'object' ? invBody.product.aspects : {};

  const spec = await getRequiredAspectsForCategory(categoryId);
  let injected = false;
  // Tracks the ADR's "already valid" signal across the loop -- true only when an
  // already-present aspect value was confirmed to match a real eBay enum value (or had no
  // enum to validate against) and was therefore correctly skipped, not injected.
  let sawAlreadyValid = false;
  for (const name of missingNames) {
    // 2026-09-23 diagnostic (Gap 2, item cmnzf780a0009pf19ru5qppqn "Amplifier Type"):
    // this branch used to be silent, which is exactly what made the aspect-already-set
    // mystery unreadable from logs alone -- confirmed live this cycle: this item's
    // missingNames correctly parsed to ["Amplifier Type"], yet NO log line fired anywhere
    // in this function, meaning this hasKey() branch (or the no-injection bail below) is
    // where the trail went cold. Logging it now so the next cycle states the diagnosis
    // outright instead of requiring inference from silence.
    const aspectSpec = spec?.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!aspectSpec) {
      console.log(`[eBay PriceRevision] sku=${sku}: discarding aspect "${name}" -- no matching real category ${categoryId} aspect`);
      continue;
    }

    // 2026-09-23 fix: a present key is not necessarily a VALID value. eBay's Fashion Size
    // Standardization (errorId 25129) rejects the literal placeholder "Unspecified" even
    // though the key already exists on the inventory item -- confirmed live this cycle:
    // item cmo3etpx2005hjqsuvzlkt8qz's real inventory-item aspects had Size=["Unspecified"],
    // which the old presence-only check treated as "already fine" forever, so the repair
    // was a permanent no-op and the offer PUT kept failing with the identical error. Only
    // trust an existing value when the aspect has no enum spec to validate against (freeform
    // aspects like Brand/MPN/Model -- any non-empty value is acceptable, unchanged 25002
    // semantics) or the existing value actually matches one of the aspect's real eBay enum
    // values. Otherwise fall through and try to replace it exactly like a missing aspect.
    const existingKey = Object.keys(aspectsObj).find((k) => k.toLowerCase() === name.toLowerCase());
    if (existingKey) {
      const existingValues = aspectsObj[existingKey] ?? [];
      const hasEnumSpec = aspectSpec.enumValues.length > 0;
      const existingIsValid =
        !hasEnumSpec ||
        existingValues.some((v) => aspectSpec.enumValues.some((ev) => ev.toLowerCase() === String(v).toLowerCase()));
      if (existingIsValid) {
        console.log(`[eBay PriceRevision] sku=${sku}: aspect "${name}" already present with a valid value (${JSON.stringify(existingValues)}) -- not re-injecting`);
        sawAlreadyValid = true;
        continue;
      }
      console.log(`[eBay PriceRevision] sku=${sku}: aspect "${name}" present but value ${JSON.stringify(existingValues)} is not a valid eBay enum value for this category -- treating as needing repair, not skipping`);
    }
    const defaultValue = pickSafeAspectDefault(aspectSpec, itemTitle, itemDescription);
    if (defaultValue === null) {
      console.log(`[eBay PriceRevision] sku=${sku}: skipping aspect "${aspectSpec.name}" -- no confident value found in title/description (never guessing a Size-family aspect)`);
      continue;
    }
    if (existingKey && existingKey !== aspectSpec.name) delete aspectsObj[existingKey];
    aspectsObj[aspectSpec.name] = [defaultValue];
    injected = true;
    console.log(`[eBay PriceRevision] sku=${sku}: injecting ${existingKey ? 'corrected' : 'missing'} aspect "${aspectSpec.name}"=${defaultValue}`);
  }
  if (!injected) {
    console.log(`[eBay PriceRevision] sku=${sku}: category-aspect repair found ${missingNames.length} missing name(s) but none needed injection (already present on eBay's side or unmatched to a real category aspect) -- repair is a no-op this cycle; if the offer PUT still fails with the identical error, the aspect is already set on the inventory item and the blocker is elsewhere (propagation delay or offer/inventory-item validation-scope mismatch)`);
    return { injected: false, alreadyValid: sawAlreadyValid };
  }
  invBody.product.aspects = aspectsObj;
  // 2026-09-23 fix: mirror heal25101 (ebayPublishService.ts) -- this PUT carries eBay's own
  // GET response for the WHOLE inventory item back verbatim except for product.aspects, so an
  // existing packageWeightAndSize.packageType that's incompatible with this item's live
  // fulfillment-policy routing (confirmed live, errorId 25101, items cmo3etpx2005hjqsuvzlkt8qz
  // "MailingBoxes" and cmo3et2pb002djqsuyta1cslc "PaddedBags") gets re-validated and rejected on
  // every retry, permanently blocking the aspect fix from ever landing. Strip packageType the
  // same proven way heal25101 already does for the publish path.
  if (invBody.packageWeightAndSize && typeof invBody.packageWeightAndSize === 'object') {
    const strippedPkg = { ...(invBody.packageWeightAndSize as Record<string, unknown>) };
    delete (strippedPkg as any).packageType;
    invBody.packageWeightAndSize = strippedPkg;
  }

  const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, accessToken, {
    method: 'PUT',
    body: invBody,
  });
  trackEbayCall();
  const invPutOk = retryInvRes.ok || retryInvRes.status === 204;
  // 2026-09-23 diagnostic. Gap 1 remains unresolved after the parsing fix: item
  // cmnzf780a0009pf19ru5qppqn now correctly injects "Amplifier Type"=Cabinet, evidenced by
  // the injecting-missing-aspect log above, but the SUBSEQUENT offer PUT retry still fails
  // with the identical "Amplifier Type is missing" error -- meaning either this inventory-item
  // PUT itself is silently failing (this log line was missing before now, so we couldn't tell)
  // or eBay has a propagation delay between an inventory-item aspect update and the offer
  // validator seeing it. This log disambiguates which on the next cycle.
  if (!invPutOk) {
    const bodyText = await retryInvRes.text().catch(() => '');
    console.log(`[eBay PriceRevision] sku=${sku}: category-aspect repair FAILED -- inventory item PUT rejected (HTTP ${retryInvRes.status} ${bodyText.slice(0, 300)})`);
  } else {
    console.log(`[eBay PriceRevision] sku=${sku}: category-aspect repair -- inventory item PUT accepted (HTTP ${retryInvRes.status}), retrying offer PUT next`);
  }
  return { injected: invPutOk, alreadyValid: false };
}

// 2026-09-24 fix (ADR-ebay-loynorrix-inventory-item-fix-2026-09-24.md): the two earlier
// fixes today both edited offerBody.packageWeightAndSize on the Offer PUT
// (/sell/inventory/v1/offer/{offerId}) -- confirmed via eBay's own docs that
// packageWeightAndSize is NOT a field on the Offer resource at all. eBay's real
// validation runs against the Inventory Item resource, which this file never wrote to.
// This helper writes the corrected packageWeightAndSize to the actual resource eBay
// validates, using the exact same GET+merge+PUT shape as injectMissingCategoryAspects
// above (GET the whole inventory item, mutate ONLY packageWeightAndSize, PUT the whole
// thing back untouched otherwise). Caller passes in the already-computed weight/dims/
// includePackageType decision (from the fulfillment-policy costType lookup) rather than
// this function recomputing it -- single source of truth for that decision stays in
// reviseEbayOfferPrice.
async function ensureInventoryItemPackaging(
  sku: string,
  accessToken: string,
  itemId: string | undefined,
  packageWeightOz: number,
  dims: { lengthIn: number; widthIn: number; heightIn: number } | null,
  includePackageType: string | undefined
): Promise<{ ok: boolean }> {
  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, accessToken, { method: 'GET' });
  trackEbayCall();
  if (!invGet.ok) {
    const bodyText = await invGet.text().catch(() => '');
    console.warn(`[eBay PriceRevision] sku=${sku} item=${itemId ?? 'n/a'}: ensureInventoryItemPackaging bailed -- inventory item GET failed (HTTP ${invGet.status} ${bodyText.slice(0, 200)}) -- offer PUT will still be attempted`);
    return { ok: false };
  }
  const invBody = (await invGet.json()) as any;
  // Only packageWeightAndSize is reassigned -- every other field on eBay's own GET
  // response for this inventory item is preserved exactly as returned, same as
  // injectMissingCategoryAspects only reassigns invBody.product.aspects above.
  invBody.packageWeightAndSize = {
    weight: { unit: 'OUNCE', value: packageWeightOz },
    ...(dims ? { dimensions: { unit: 'INCH', length: dims.lengthIn, width: dims.widthIn, height: dims.heightIn } } : {}),
    ...(includePackageType ? { packageType: includePackageType } : {}),
  };

  const putRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, accessToken, {
    method: 'PUT',
    body: invBody,
  });
  trackEbayCall();
  const putOk = putRes.ok || putRes.status === 204;
  if (!putOk) {
    const bodyText = await putRes.text().catch(() => '');
    console.warn(`[eBay PriceRevision] sku=${sku} item=${itemId ?? 'n/a'}: ensureInventoryItemPackaging PUT FAILED -- inventory item packageWeightAndSize not written (HTTP ${putRes.status} ${bodyText.slice(0, 300)}) -- offer PUT will still be attempted`);
  } else {
    console.log(`[eBay PriceRevision] sku=${sku} item=${itemId ?? 'n/a'}: ensureInventoryItemPackaging -- inventory item PUT accepted (HTTP ${putRes.status}), packageWeightAndSize written to the resource eBay actually validates`);
  }
  return { ok: putOk };
}

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
          // 2026-09-24 fix (ADR-ebay-loynorrix-packagetype-fix-2026-09-24.md): the 2026-09-23
          // fix below this comment used to unconditionally omit packageType from a rebuilt
          // packageWeightAndSize. That correctly protected LSAS-calculated-shipping items (e.g.
          // the tracksuit, errorId 25002 / err:216314 from an INCOMPATIBLE packageType value)
          // but incorrectly starved items on non-calculated (flat-rate) policies of a valid,
          // organizer-confirmed packageType -- eBay's full-offer re-validation then rejects the
          // PUT for a MISSING Shipping Package type instead (Loy Norrix vinyl record,
          // PACKAGE_THICK_ENVELOPE, same errorId/err code -- the mirror-image failure). Fix:
          // read the offer's OWN already-assigned listingPolicies.fulfillmentPolicyId (same
          // idiom as ebayController.ts's applyFulfillmentPolicyToOffer ~line 4998) and look up
          // that one policy's real shippingOptions[].costType via a read-only GET against
          // /sell/account/v1/fulfillment_policy (same endpoint/parsing idiom as
          // ebayPublishService.ts ~line 1315-1320 and ebayController.ts's pickFulfillmentPolicySmart
          // hasCostType helper ~line 4335-4337). packageType is included ONLY when a real policy
          // match is found, it is NOT CALCULATED shipping, and the normalized value is in
          // VALID_PACKAGE_TYPES -- any lookup failure, no policy id, or no match falls back to
          // the original safe omission (never guess).
          let includePackageType: string | undefined;
          let packageTypeSkipReason = 'no packageType on item record';
          if (pkg.packageType) {
            packageTypeSkipReason = 'fulfillment policy lookup failed or no match';
            const fulfillmentPolicyId = (offerBody.listingPolicies as Record<string, unknown> | undefined)?.fulfillmentPolicyId as string | undefined;
            if (fulfillmentPolicyId) {
              try {
                const policyRes = await ebayFetch('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100', accessToken, { method: 'GET' });
                trackEbayCall();
                if (policyRes.ok) {
                  const policyData = (await policyRes.json()) as any;
                  const policies: any[] = policyData.fulfillmentPolicies || [];
                  const matched = policies.find((p) => p?.fulfillmentPolicyId === fulfillmentPolicyId);
                  if (matched) {
                    const isCalculatedShipping = Array.isArray(matched.shippingOptions) &&
                      matched.shippingOptions.some((opt: any) => opt?.costType === 'CALCULATED');
                    if (isCalculatedShipping) {
                      packageTypeSkipReason = 'assigned fulfillment policy is CALCULATED shipping';
                    } else {
                      const normalized = String(pkg.packageType).trim().toUpperCase().replace(/\s+/g, '_');
                      if (VALID_PACKAGE_TYPES.has(normalized)) {
                        includePackageType = normalized;
                      } else {
                        packageTypeSkipReason = `packageType="${pkg.packageType}" not in eBay enum`;
                        console.warn(`[eBay PriceRevision] item=${itemId} dropping invalid packageType="${pkg.packageType}" (not in eBay enum)`);
                      }
                    }
                  }
                }
              } catch (policyErr) {
                console.warn(`[eBay PriceRevision] item=${itemId} fulfillment policy lookup failed: ${(policyErr as Error).message}`);
              }
            } else {
              packageTypeSkipReason = 'offer has no assigned fulfillmentPolicyId';
            }
          }
          offerBody.packageWeightAndSize = {
            weight: { unit: 'OUNCE', value: Number(pkg.packageWeightOz) },
            ...(pkg.packageLengthIn && pkg.packageWidthIn && pkg.packageHeightIn
              ? { dimensions: { unit: 'INCH', length: Number(pkg.packageLengthIn), width: Number(pkg.packageWidthIn), height: Number(pkg.packageHeightIn) } }
              : {}),
            ...(includePackageType ? { packageType: includePackageType } : {}),
          };
          console.log(`[eBay PriceRevision] item=${itemId} rebuilt missing packageWeightAndSize from Item record before PUT (packageType ${includePackageType ? `included="${includePackageType}"` : `omitted -- reason: ${packageTypeSkipReason}`})`);

          // 2026-09-24 fix (ADR-ebay-loynorrix-inventory-item-fix-2026-09-24.md): also write
          // the same corrected packageWeightAndSize to the actual Inventory Item resource
          // eBay validates (the offerBody edit above is harmless but was confirmed a no-op
          // against a field that doesn't exist on the Offer resource). Diagnostics-only --
          // its result never changes the offer-PUT retry flow below.
          const packagingSku = typeof offerBody.sku === 'string' ? offerBody.sku : null;
          if (packagingSku) {
            await ensureInventoryItemPackaging(
              packagingSku,
              accessToken,
              itemId,
              Number(pkg.packageWeightOz),
              pkg.packageLengthIn && pkg.packageWidthIn && pkg.packageHeightIn
                ? { lengthIn: Number(pkg.packageLengthIn), widthIn: Number(pkg.packageWidthIn), heightIn: Number(pkg.packageHeightIn) }
                : null,
              includePackageType
            );
          } else {
            console.warn(`[eBay PriceRevision] item=${itemId} offer=${offerId}: skipping ensureInventoryItemPackaging -- offer has no sku`);
          }
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
        // Widened from 200->600 chars (2026-09-19): the truncated 200-char version was
        // cutting off eBay's "parameters" array on 25002 errors, hiding exactly which
        // field name it considers invalid (e.g. the Loy Norrix Shipping-Package-type
        // rejection that persisted even after rebuilding packageWeightAndSize).
        return { ok: false, detail: `HTTP ${putRes.status} ${bodyText.slice(0, 600)}` };
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
      // Gap 1 fix (2026-09-23): actually inject the missing eBay aspect before retrying --
      // see injectMissingCategoryAspects doc comment. Falls back to the pre-existing
      // reanalyzeItem-then-retry afterward regardless (it still keeps FindA.Sale's own Item
      // record in sync, and covers any category-aspect failure this narrower aspect-name
      // parse doesn't catch).
      const itemRecord = await prisma.item.findUnique({ where: { id: itemId }, select: { title: true, description: true, ebayCategoryId: true } });
      const sku = typeof offerBody.sku === 'string' ? offerBody.sku : null;
      const categoryId = (typeof offerBody.categoryId === 'string' ? offerBody.categoryId : null) || itemRecord?.ebayCategoryId || null;
      const aspectResult = await injectMissingCategoryAspects(sku, categoryId, itemRecord?.title ?? null, itemRecord?.description ?? null, firstAttempt.detail, accessToken);
      if (aspectResult.injected) {
        const repairAttempt = await putOffer(buildUpdatedOffer());
        if (repairAttempt.ok) {
          return { ok: true, method: 'inventory-api', repaired: true, repairMethod: 'category-aspect' };
        }
      }
      const reanalysis = await reanalyzeItem(itemId, { apply: true, syncEbay: false });
      if ('ok' in reanalysis && reanalysis.ok) {
        const repairAttempt = await putOffer(buildUpdatedOffer());
        if (repairAttempt.ok) {
          return { ok: true, method: 'inventory-api', repaired: true, repairMethod: 'category-aspect' };
        }
      }

      // Republish escalation (ADR ebay-price-revision-republish-escalation, 2026-09-24): live
      // Railway logs (24+ hours, 3 items across 3 different eBay categories --
      // cmnzf780a0009pf19ru5qppqn Amplifier Type, cmo3et2pb002djqsuyta1cslc /
      // cmo3etpx2005hjqsuvzlkt8qz Size) confirmed a consistent pattern: when
      // injectMissingCategoryAspects reports the aspect was ALREADY present and valid
      // (aspectResult.alreadyValid) -- a true no-op, not "couldn't find a confident value" --
      // and both the injection retry above and the reanalyze-then-retry fallback above ALSO
      // fail with the identical error, the offer-level price PUT does not appear to pick up a
      // corrected inventory-item aspect on an already-published, live listing. Escalate to one
      // full republish, which re-validates and updates the SAME existing listing in place --
      // this is the exact same POST /sell/inventory/v1/offer/{offerId}/publish call
      // ebayPublishService.ts's attemptPublish() already makes routinely and safely for new
      // listings; republishing an offer that already has a live listingId is not a new
      // capability, just a new caller of a trusted one. Deliberately narrow: only fires when
      // (a) the aspect was confirmed already-valid (never for "couldn't find a value" -- that
      // keeps failing normally here, no guessing) and (b) offerBody (this function's own
      // earlier GET) already shows a live listingId, so an offer that was never published in
      // the first place is never force-published by this branch.
      if (aspectResult.alreadyValid && typeof offerBody.listingId === 'string' && offerBody.listingId) {
        try {
          const publishRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, accessToken, { method: 'POST', body: {} });
          trackEbayCall();
          if (publishRes.ok) {
            console.log(`[eBay PriceRevision] offer=${offerId} item=${itemId ?? 'n/a'}: republish escalation succeeded (aspect confirmed already-valid, retry+reanalyze both failed) -- retrying price PUT`);
            const repairAttempt = await putOffer(buildUpdatedOffer());
            if (repairAttempt.ok) {
              return { ok: true, method: 'inventory-api', repaired: true, repairMethod: 'republish-escalation' };
            }
          } else {
            const bodyText = await publishRes.text().catch(() => '');
            console.log(`[eBay PriceRevision] offer=${offerId} item=${itemId ?? 'n/a'}: republish escalation FAILED (HTTP ${publishRes.status} ${bodyText.slice(0, 300)})`);
          }
        } catch (publishErr) {
          console.warn(`[eBay PriceRevision] offer=${offerId} item=${itemId ?? 'n/a'}: republish escalation threw: ${(publishErr as Error).message}`);
        }
      }

      // Report the ORIGINAL failure either way -- the republish escalation (if it ran and
      // still failed) never masks firstAttempt's real error, same principle the best-offer-
      // threshold repair above already follows.
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
/**
 * Coin/Card Condition Descriptor repair, 2026-09-23 (Gap 2) -- confirmed live via 3 items
 * in the sync-issues queue (cmo3euaz1008djqsu9p5gpa4p, cmo3et8oj0035jqsukotk3dft,
 * cmo3etrl4005pjqsulrojltne, all coins): once the ListingDetails Best-Offer fix stopped
 * masking it, eBay's real rejection for these legacy listings was "Coin Condition (2) is
 * a required field" -- errorId 25064, the SAME Coin/Card Condition Requirements policy
 * ebayPublishService.ts's heal25064 already resolves for Inventory-API items via
 * resolveCoinConditionOverride(), but these legacy (Trading-API, no ebayOfferId) listings
 * had no path to supply it on revise at all. Confirmed via eBay's own Trading API docs
 * (ConditionDescriptorType / ConditionDescriptorsType, fetched live 2026-09-23): ReviseItem
 * DOES support <ConditionDescriptors>, and its Name/Value fields take the SAME numeric
 * conditionDescriptorId/conditionDescriptorValueId that resolveCoinConditionOverride already
 * resolves via the Metadata API -- so its {name, values} output maps directly onto
 * <ConditionDescriptor><Name>/<Value>. Returns null (never a guess) when
 * resolveCoinConditionOverride can't confidently resolve a value, matching its own
 * "never silently default a certified coin" design.
 */
async function resolveLegacyConditionDescriptors(
  itemId: string | undefined
): Promise<Array<{ name: string; values: string[] }> | null> {
  if (!itemId) return null;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { title: true, description: true, tags: true, ebayCategoryId: true },
  });
  if (!item?.ebayCategoryId) return null;
  const resolution = await resolveCoinConditionOverride(item.ebayCategoryId, item);
  return resolution.status === 'resolved' ? resolution.conditionDescriptors : null;
}

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
  //
  // Structure fix v2 (2026-09-23, root-caused via getListingDebugInfo live GetItem
  // pull against listing 136164918832 + eBay's own official Trading API docs, fetched
  // live this session: developer.ebay.com/DevZone/xml/docs/Reference/eBay/types/
  // ListingDetailsType.html and .../reference/ebay/ReviseItem.html). The 2026-09-19
  // "fix" below (Item-level siblings) was itself wrong -- eBay's own schema docs
  // confirm BestOfferAutoAcceptPrice and MinimumBestOfferPrice are children of
  // ListingDetailsType, i.e. they belong nested under an <Item><ListingDetails> block,
  // NOT as direct Item siblings and NOT under BestOfferDetails (BestOfferDetails only
  // takes BestOfferEnabled/BestOfferCount/etc, same as the 09-19 comment correctly
  // noted -- just the alternative placement it chose was also wrong). Live evidence
  // (GetItem via the new listing-debug endpoint) confirmed this listing's BuyItNowPrice
  // reads back 0.0 -- consistent with the misplaced Item-level fields never having been
  // accepted by eBay at all, so every repair attempt kept failing the same threshold
  // check regardless of the (correctly-computed, always <StartPrice) accept price tried.
  // Nesting under <ListingDetails> is the real fix; StartPrice and BestOfferDetails
  // placement were already correct and are unchanged.
  // conditionDescriptors param added 2026-09-23 (Gap 2) -- see resolveLegacyConditionDescriptors
  // doc comment. Name/Value are eBay's numeric conditionDescriptorId/conditionDescriptorValueId,
  // confirmed via eBay's own ConditionDescriptorType docs to be the same IDs
  // resolveCoinConditionOverride already resolves for the Inventory-API path.
  const buildReviseXml = (
    bestOffer?: { accept: number; minimum: number },
    conditionDescriptors?: Array<{ name: string; values: string[] }>
  ): string => `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${ebayListingId}</ItemID>
    <StartPrice currencyID="USD">${newPrice.toFixed(2)}</StartPrice>${bestOffer ? `
    <BestOfferDetails>
      <BestOfferEnabled>true</BestOfferEnabled>
    </BestOfferDetails>
    <ListingDetails>
      <BestOfferAutoAcceptPrice currencyID="USD">${bestOffer.accept.toFixed(2)}</BestOfferAutoAcceptPrice>
      <MinimumBestOfferPrice currencyID="USD">${bestOffer.minimum.toFixed(2)}</MinimumBestOfferPrice>
    </ListingDetails>` : ''}${conditionDescriptors && conditionDescriptors.length > 0 ? `
    <ConditionDescriptors>${conditionDescriptors.map((d) => `
      <ConditionDescriptor>
        <Name>${d.name}</Name>
        <Value>${d.values[0]}</Value>
      </ConditionDescriptor>`).join('')}
    </ConditionDescriptors>` : ''}
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
    // Gap 2 fix (2026-09-23): the repair retry can separately fail on a missing Coin/Card
    // Condition descriptor (errorId 25064, e.g. "Coin Condition (2) is a required field") --
    // previously always masked by the ListingDetails placement bug failing first. Try once
    // more with BOTH the price/threshold fix and a resolved condition descriptor together.
    if (isCategoryAspectError(repairAttempt.detail)) {
      const descriptors = await resolveLegacyConditionDescriptors(itemId);
      if (descriptors) {
        const conditionRepairAttempt = await sendRevise(buildReviseXml(thresholds, descriptors));
        if (conditionRepairAttempt.ok) {
          return { ...conditionRepairAttempt, repaired: true, repairMethod: 'best-offer-threshold' };
        }
        console.warn(`[eBay PriceRevision] legacy coin-condition repair FAILED item=${itemId ?? 'n/a'} listing=${ebayListingId} repairDetail=${conditionRepairAttempt.detail ?? 'n/a'}`);
      }
    }
    // Diagnostic (2026-09-19): repair retry #1 didn't resolve it -- log its own detail
    // (distinct from firstAttempt.detail) so a persisting failure shows exactly what the
    // REPAIRED thresholds were rejected for, instead of only ever seeing the original error.
    console.warn(`[eBay PriceRevision] legacy best-offer repair FAILED item=${itemId ?? 'n/a'} listing=${ebayListingId} triedAccept=${thresholds.accept} triedMinimum=${thresholds.minimum} newPrice=${newPrice} repairDetail=${repairAttempt.detail ?? 'n/a'}`);
    return firstAttempt;
  }

  // Repair retry #2: category-aspect / required-field conflict.
  if (isCategoryAspectError(firstAttempt.detail) && itemId) {
    // Gap 2 fix (2026-09-23): try a resolved Coin/Card Condition descriptor first -- see
    // resolveLegacyConditionDescriptors doc comment. Falls back to the pre-existing
    // reanalyzeItem-then-retry when no descriptor can be confidently resolved (not a coin,
    // or a coin whose condition text can't be parsed -- reanalyzeItem still keeps FindA.Sale's
    // own Item record in sync either way).
    const descriptors = await resolveLegacyConditionDescriptors(itemId);
    if (descriptors) {
      const conditionRepairAttempt = await sendRevise(buildReviseXml(undefined, descriptors));
      if (conditionRepairAttempt.ok) {
        return { ...conditionRepairAttempt, repaired: true, repairMethod: 'category-aspect' };
      }
    }
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
