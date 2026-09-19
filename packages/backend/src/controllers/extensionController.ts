import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrlWithQR, ensureQrCodeAsset } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';
import { applyNeverShippableOverride, computeEffectivePackageWeight, endEbayListingIfExists } from './ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { commitItemSale, ItemAlreadyCommittedError } from '../services/itemSaleGuard';
import { decideMessageAutosend } from '../services/messageAutosendService';
import { checkEligibility } from '../services/marketplaceEligibilityRules';
import { computeCheapestForOrigin, ShippingHardBlockError } from '../services/ebayRateEstimateService';

// Facebook Marketplace condition values. Mirrors mapConditionForFacebook() in
// exportController.ts (kept in sync; trivial pure map — not worth a shared import).
function toFacebookCondition(condition: string | null | undefined): string {
  switch ((condition || '').toUpperCase()) {
    case 'NEW': return 'New';
    case 'REFURBISHED': return 'Used - Like New';
    case 'PARTS_OR_REPAIR': return 'Used - Fair';
    default: return 'Used - Good'; // USED and unknown
  }
}

// Append the finda.sale backlink so Marketplace traffic returns home (ADR-084).
function buildDescription(description: string | null | undefined, saleId: string | null | undefined): string {
  const base = (description || '').trim();
  if (!saleId) return base;
  const link = `View full listing: https://finda.sale/sales/${saleId}`;
  return base ? `${base}\n\n${link}` : link;
}

// Facebook Commerce Policy (coins/currency, and as of S-FB-WEAPON-COIN-FIX-2026-09-03, weapons/
// ammunition/explosives too) + the other 4 platforms' category eligibility now live in a single
// shared registry (marketplaceEligibilityRules.ts, S-EXT-BATCH-2026-08-19). Renamed from the old
// coin/currency-only function name 2026-09-03 -- it stopped being coin/currency-only the moment
// the weapons rule was added to the registry; every call site below updated to match.
// FACEBOOK-SPECIFIC ONLY -- must never affect eBay, native checkout, Craigslist, or Gumtree AU's
// pushability (those platforms have no rule in the registry -- checkEligibility returns
// eligible:true for any platform with no rule defined). `title` added 2026-09-03 (see
// EligibilityCheckItem.title comment, marketplaceEligibilityRules.ts) -- required for the
// exclude-keyword carve-out to see accessory words that only appear in the title, not category.
function isFacebookRestrictedItem(
  category: string | null | undefined,
  ebayCategoryId: string | null | undefined,
  title: string | null | undefined
): boolean {
  return !checkEligibility('FACEBOOK', { category, ebayCategoryId, title }).eligible;
}

// Returns the actual blocking reason (weapons vs coin/currency vs none) instead of a boolean --
// used wherever the caller needs to surface WHY an item is blocked, not just that it is.
function facebookRestrictionReason(
  category: string | null | undefined,
  ebayCategoryId: string | null | undefined,
  title: string | null | undefined
): string | null {
  return checkEligibility('FACEBOOK', { category, ebayCategoryId, title }).reason;
}

// GET /api/extension/items — the organizer's listable items + Marketplace status.
export const getExtensionItems = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    // 2026-08-06: include the account email so Craigslist's own required "email" reply-option
    // field can be pre-filled from data we already have -- same principle as the saleCity/saleZip
    // fix above, no reason to leave a field blank that the organizer already gave us at signup.
    include: { user: { select: { email: true } } },
  });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  // Apply the finda.sale watermark to photos unless this organizer is allowed to remove it
  // (TEAMS + toggle on). Mirrors export/social/eBay channels so Facebook is not the one
  // channel leaking un-watermarked images. Adds the FindA.Sale text watermark + a QR code that
  // links back to the finda.sale listing. getWatermarkedUrlWithQR passes non-Cloudinary URLs through.
  const applyWatermark = !canRemoveWatermark(organizer);

  const sales = await prisma.sale.findMany({
    // 2026-07-26 (S1169): exclude soft-deleted sales -- deleteSale only sets Sale.deletedAt
    // and deliberately leaves Item rows untouched, so without this filter items belonging to
    // a deleted sale kept surfacing here forever (organizer report: "deleted test sale" items
    // still showing after refresh).
    where: { organizerId: organizer.id, deletedAt: null },
    // city/zip added 2026-08-06: fas-craigslist.js already had the field-fill logic for
    // geographicArea/postal (item.saleCity/item.saleZip) but this endpoint never actually
    // supplied them, so Craigslist's own required ZIP field was always left blank -- live-QA'd
    // by Patrick, confirmed via screenshot (title/price/description filled correctly, ZIP
    // rejected as missing). Never invents a value if a sale is missing city/zip (isOnlineOnly
    // sales, for instance) -- fas-craigslist.js already only fills when the value is present.
    // address added 2026-08-06: geoverify-step fix -- Craigslist's "add map" screen
    // (?s=geoverify, a step BEFORE the title/price/description form, live-confirmed via a
    // real guest-posting walkthrough) asks for a street address that our script never filled
    // because the step wasn't even detected. Sale.address already exists and is exactly the
    // right data -- same never-invent-a-value rule as city/zip below.
    select: { id: true, title: true, city: true, zip: true, address: true },
  });
  const saleTitleById = new Map(sales.map((s) => [s.id, s.title]));
  const saleLocationById = new Map(sales.map((s) => [s.id, { city: s.city, zip: s.zip, address: s.address }]));

  const items = await prisma.item.findMany({
    // ADR-084 amendment 2026-07-15: exclude DONT_LIST items -- mirrors PostSaleEbayPanel's
    // auto-unselect on the eBay side, applied here at the query level instead of frontend-only.
    // 2026-07-16 fix: Prisma `NOT: { field: value }` compiles to `field <> value`, which SQL
    // evaluates as NULL (row dropped) for the ~99% of items whose ebayShippingOverride IS NULL.
    // That silently hid all but the rare non-null rows (extension showed only 1 of 126 items).
    // The OR keeps NULL-override items while still excluding explicit DONT_LIST.
    where: {
      // 2026-07-26 (S1169): sale.deletedAt filter -- see matching comment on the sales query above.
      sale: { organizerId: organizer.id, deletedAt: null },
      status: 'AVAILABLE',
      OR: [
        { ebayShippingOverride: null },
        { ebayShippingOverride: { not: 'DONT_LIST' } },
      ],
    },
    take: 2000,
    select: {
      id: true, saleId: true, title: true, description: true, price: true,
      category: true, condition: true, photoUrls: true, qrEmbedEnabled: true, qrAssetReady: true, createdAt: true,
      // S-EXT-BATCH-12 (2026-08-20): ebayCategoryName -- see the `category` field build below for why.
      ebayCategoryName: true,
      // 2026-08-18 (S-CROSSLISTER-ESTATE-VERTICAL-RESEARCH batch 5): brand/size/color/material --
      // fas-poshmark.js/fas-mercari.js/fas-vinted.js/fas-grailed.js already reference
      // item.brand/item.size/item.color/item.material(s), but NONE of the four were ever in
      // this select, so those autofill lines were silent no-ops even for brand (which the
      // organizer-facing edit-item page has captured all along via a separate, unrelated select).
      brand: true, size: true, color: true, material: true,
      // BUG FIX 2026-09-03 (ADR-090 follow-up, Patrick-reported the Vinted ISBN fill "didn't
      // work" after reloading the extension): same silent-no-op class as the brand/size/color/
      // material bug fixed 2026-08-18 above -- fas-vinted.js's ISBN tryFill call always saw
      // item.isbn === undefined because isbn was never in this select either, regardless of
      // what's actually stored on the item.
      isbn: true,
      packageWeightOz: true, aiPackageWeightOz: true, ebayShippingOverride: true, shippingAvailable: true,
      // 2026-08-27: organizer's per-item crosslister free-shipping toggle -- see the `shaped`
      // payload build below (crosslisterFreeShipping field) for why this exists.
      crosslisterFreeShipping: true,
      // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-4, Patrick-directed): bestOfferAutoAcceptAmt
      // added -- Patrick's explicit direction is that the eBay auto-accept threshold should be
      // the DEFAULT Smart Pricing floor source (ahead of the old 25%-of-price fallback), but it
      // was never selected here so it could never reach the extension at all.
      allowBestOffer: true, bestOfferMinimumAmt: true, bestOfferAutoAcceptAmt: true,
      // ADR fb-package-weight-estimator (2026-07-22): needed to call
      // computeEffectivePackageWeight below, the same package-weight resolver eBay's
      // publish flow uses (package-estimation isolation ADR, 2026-08-05: the resolver
      // is now split into a persisting never-shippable-override helper and a pure,
      // non-persisting weight/dims compute function).
      ebayCategoryId: true, packageConfirmedByOrganizer: true,
      packageLengthIn: true, packageWidthIn: true, packageHeightIn: true, packageType: true,
      aiPackageDimsJson: true, aiPackageConfidence: true, packageEstimateSource: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Resolve missing package weights the same way eBay's publish flow does (ADR
  // fb-package-weight-estimator, 2026-07-22). Previously this endpoint read only the raw
  // packageWeightOz/aiPackageWeightOz columns -- any item whose upload-time AI photo pass
  // wasn't confident (aiPackageConfidence < 0.5) got NO weight at all and was force-switched
  // to LOCAL_PICKUP_ONLY on Facebook, even when a PackageProfile category/keyword default
  // existed (e.g. the seeded 'lamp' keyword profile). Package-estimation isolation ADR
  // (2026-08-05): computeEffectivePackageWeight is now a PURE function -- it is called
  // fresh on every request and its result is used ONLY to build this response's in-memory
  // payload below, never persisted to the Item (packageWeightOz/dims on the Item row are
  // now organizer-confirmed-only). Cheap to recompute -- small PackageProfile table lookups
  // + already-stored AI columns, no external API calls. No-ops (single early return, no
  // extra queries) for any item that already has a confirmed/measured weight or is pickup-only.

  // Shared trust gate for package weight/dims provenance (2026-09-14) -- used by BOTH the
  // FB-specific weight-resolution loop immediately below and the `shaped` response object
  // further down (aiPackageWeightOz/packageWeightOz/packageLengthIn/WidthIn/HeightIn gating).
  // Previously each had its OWN local copy (this loop's UNTRUSTED_SOURCES, `shaped`'s
  // UNTRUSTED_PACKAGE_SOURCES) and both shared the identical bug:
  // `!UNTRUSTED_SOURCES.includes(it.packageEstimateSource || '')` coerces a NULL
  // packageEstimateSource (unknown provenance -- exactly what the frontend save-flow bug
  // fixed the same day, S-PKG-WEIGHT-LEAK-2026-09-14, was writing) to '', which is not in
  // ['SEED','AI'], so it registered as "trusted" -- backwards for data whose provenance is
  // simply unrecorded. Fixed: only a KNOWN, non-untrusted source (or organizer confirmation)
  // counts as trusted now. One shared definition so the two checks can't drift apart again.
  const UNTRUSTED_PACKAGE_SOURCES = ['SEED', 'AI'];
  const hasTrustedPackage = (it: { packageEstimateSource: string | null; packageConfirmedByOrganizer: boolean | null }) =>
    it.packageConfirmedByOrganizer === true ||
    (it.packageEstimateSource != null && !UNTRUSTED_PACKAGE_SOURCES.includes(it.packageEstimateSource));

  for (const it of items) {
    if (it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') continue;
    // 2026-07-22 follow-up: don't treat a persisted 'SEED' (generic fallback) or 'AI'
    // (unmeasured single-photo vision guess) weight as already-resolved -- items with
    // either source need to keep re-running through resolvePublishPackageWeight so they
    // self-heal on next fetch, instead of being silently skipped forever because *a*
    // weight is already set. Patrick's call (2026-07-23): FB should not ship on a raw AI
    // guess any more than it should ship on the generic fallback -- neither is a real
    // measurement. Only a PackageProfile CATEGORY/KEYWORD match or an organizer-confirmed
    // value counts as "already resolved" now.
    if (
      it.packageWeightOz != null &&
      Number(it.packageWeightOz) > 0 &&
      hasTrustedPackage(it)
    ) continue;
    try {
      // Package-estimation isolation ADR (2026-08-05): the old combined
      // resolvePublishPackageWeight() persisted its resolved estimate straight into
      // the Item's organizer-facing fields as a side effect. It is now split into
      // applyNeverShippableOverride() (still persists -- a structural classification,
      // not a weight guess) and computeEffectivePackageWeight() (pure -- recomputes the
      // cascade on every call, writes nothing). Facebook has no organizer-confirmation
      // gate the way eBay's publish path does, so this endpoint genuinely needs a
      // resolved number; computeEffectivePackageWeight's return value is used ONLY to
      // build this response's in-memory payload below, never persisted back to the Item.
      //
      // computeEffectivePackageWeight unconditionally short-circuits and returns null
      // whenever packageWeightOz is already set -- it has no idea *why* a weight is
      // set, only that one is. That's correct for a real organizer-confirmed or
      // category-matched value, but wrong for a persisted 'SEED' or 'AI' value we've
      // explicitly decided not to trust on FB: we need the shared resolver to actually
      // recompute, not treat the untrusted guess as already-resolved. Pass null here
      // (FB-side only, not touching the shared function's own semantics used by eBay)
      // so it falls through to a fresh estimate.
      const isUntrustedSource = !hasTrustedPackage(it);

      const overrideResult = await applyNeverShippableOverride({
        id: it.id,
        title: it.title,
        description: it.description,
        category: it.category,
        ebayShippingOverride: it.ebayShippingOverride,
        packageConfirmedByOrganizer: it.packageConfirmedByOrganizer,
      });

      const resolved = overrideResult?.pickupOnlyForced
        ? null
        : await computeEffectivePackageWeight({
            id: it.id,
            title: it.title,
            description: it.description,
            category: it.category,
            ebayCategoryId: it.ebayCategoryId,
            ebayShippingOverride: it.ebayShippingOverride,
            packageConfirmedByOrganizer: it.packageConfirmedByOrganizer,
            packageWeightOz: isUntrustedSource ? null : it.packageWeightOz,
            packageLengthIn: it.packageLengthIn != null ? Number(it.packageLengthIn) : null,
            packageWidthIn: it.packageWidthIn != null ? Number(it.packageWidthIn) : null,
            packageHeightIn: it.packageHeightIn != null ? Number(it.packageHeightIn) : null,
            packageType: it.packageType,
            aiPackageWeightOz: it.aiPackageWeightOz,
            aiPackageDimsJson: it.aiPackageDimsJson,
            aiPackageConfidence: it.aiPackageConfidence != null ? Number(it.aiPackageConfidence) : null,
          });

      if (overrideResult?.pickupOnlyForced) {
        // Never-shippable keyword match (e.g. tankless water heater, RO system) --
        // applyNeverShippableOverride already persisted ebayShippingOverride to the DB;
        // mirror it in-memory so the shippingOverride computed below reflects pickup-only
        // on THIS response instead of a stale null override from the initial query.
        (it as { ebayShippingOverride: string | null }).ebayShippingOverride = 'LOCAL_PICKUP_ONLY';
      } else if (resolved && !UNTRUSTED_PACKAGE_SOURCES.includes(resolved.source)) {
        // 'SEED' (generic 24oz/0.25-confidence last-resort guess) and 'AI' (unmeasured
        // single-photo vision guess) are NOT curated PackageProfile rows (those come back
        // as 'CATEGORY'/'KEYWORD') and are not organizer-confirmed either. Per the ADR and
        // Patrick's 2026-07-23 follow-up decision, FB should never ship a weight built on
        // either -- pickup-only is the safer default. resolvePublishPackageWeight already
        // persisted it to the Item as a side effect (shared with eBay's publish path), so
        // explicitly revert that persistence for this item rather than silently using a
        // value we've decided not to trust.
        (it as { packageWeightOz: number | null }).packageWeightOz = resolved.weightOz;
      } else if (resolved && UNTRUSTED_PACKAGE_SOURCES.includes(resolved.source)) {
        try {
          await prisma.item.update({
            where: { id: it.id },
            data: { packageWeightOz: null, packageEstimateSource: null },
          });
          // Also reflect the revert in-memory -- this same request's response payload
          // (built from `it` further down) must NOT keep showing the stale weight just
          // because the DB write happened after `it` was already loaded from the initial
          // query. Without this, this endpoint would silently serve the untrusted 24oz
          // value for one more request even though the DB was already corrected.
          (it as { packageWeightOz: number | null }).packageWeightOz = null;
        } catch (revertErr: any) {
          console.warn('[FB AutoWeight] failed to revert untrusted-source weight for item', it.id, revertErr?.message || revertErr);
        }
      }
    } catch (e: any) {
      console.warn('[FB AutoWeight] applyNeverShippableOverride/computeEffectivePackageWeight failed for item', it.id, e?.message || e);
    }
  }

  const itemIds = items.map((i) => i.id);
  const jobs = itemIds.length
    ? await prisma.marketplaceListingJob.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, action: true, status: true, platform: true, createdAt: true },
      })
    : [];
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  // Duplicate-listing suppression fix (2026-08-08): the two any-platform sets above conflate
  // every channel into one flag, so an item posted on Facebook only was showing as
  // "already listed" (hidden) when browsing the Craigslist channel too, and vice versa --
  // neither over- nor under-hiding is correct; the organizer needs to know per-CHANNEL whether
  // they already posted there. Kept the any-platform sets for backward compatibility
  // (marketplaceListed field below, no longer read by popup.js but left intact in case anything
  // else does) and added per-platform sets for the new marketplaceListedFacebook /
  // marketplaceListedCraigslist fields popup.js now actually filters/badges on.
  const postedByItemPlatform = new Set<string>(); // key: `${itemId}:${platform}`
  const removedByItemPlatform = new Set<string>();
  // BUG FIX (2026-08-15, "Silent Service" NES cartridge cmrqprbs80063l0susxwmzv5b -- Patrick
  // live FB crosslisting report): the loop below used to add to postedBy*/removedBy* for
  // EVERY POST/POSTED or REMOVE/REMOVED row seen, with no time-ordering. Real job history:
  // POST/POSTED (7/19) -> REMOVE/REMOVED (7/20) -> POST/POSTED again (7/23, 7/24, 8/14 with
  // renewDueAt set, proving the repost genuinely succeeded). Because a REMOVE/REMOVED row
  // existed ANYWHERE in history, the item was permanently flagged removed/available-to-push
  // even after later successful reposts. Status must reflect only the MOST RECENT job row per
  // item+platform. Find the latest row per key by createdAt first, then derive posted/removed
  // from that single latest row alone.
  const latestByItemPlatform = new Map<string, { itemId: string; action: string; status: string; createdAt: Date }>();
  for (const j of jobs) {
    const key = `${j.itemId}:${j.platform}`;
    const existing = latestByItemPlatform.get(key);
    if (!existing || j.createdAt > existing.createdAt) {
      latestByItemPlatform.set(key, { itemId: j.itemId, action: j.action, status: j.status, createdAt: j.createdAt });
    }
  }
  for (const [key, latest] of latestByItemPlatform) {
    if (latest.action === 'POST' && latest.status === 'POSTED') {
      postedByItem.add(latest.itemId);
      postedByItemPlatform.add(key);
    } else if (latest.action === 'REMOVE' && latest.status === 'REMOVED') {
      removedByItem.add(latest.itemId);
      removedByItemPlatform.add(key);
    }
  }

  // BUG FIX 2026-09-14 (Patrick-directed, Q12E Chromatic Guitar Tuner Mercari $30-shipping
  // incident, live-verified this session): an unconfirmed AI/SEED-sourced package weight or
  // dimension estimate must never reach ANY content-script marketplace as if it were real data.
  // Previously only packageWeightOz got this treatment (the FB-specific resolve loop above) --
  // packageLengthIn/WidthIn/HeightIn and the raw aiPackageWeightOz column were selected and
  // returned to every platform (Mercari, Vinted, Poshmark, Craigslist, Grailed, Gumtree AU)
  // completely ungated regardless of packageConfirmedByOrganizer or packageEstimateSource. Live
  // case: this item's AI vision pass estimated a guitar-case-sized package (40x14x5in, 12lb) for
  // a small tuner accessory, which fas-mercari.js filled straight into Mercari's real shipping
  // wizard producing an actual $30 buyer-facing delivery fee (vs. the correct ~$5.66-15.99
  // range once corrected). Mirrors the UNTRUSTED_SOURCES list used above for weight; a curated
  // PackageProfile CATEGORY/KEYWORD default (Patrick's "media mail"-style strict-known case) or
  // an organizer-confirmed value is still trusted and passes through unchanged.
  // (hasTrustedPackage/UNTRUSTED_PACKAGE_SOURCES are now defined once, shared with the
  // FB weight-resolution loop above -- see that shared block's own comment, 2026-09-14.)

  // ADR eBay-freight-and-Vinted-shipping-cap-pricing (2026-09-17): Vinted hard-caps shipping at
  // $100 (Patrick, confirmed live from his own real listing) with no working freight/custom-
  // shipping alternative today (Vinted's own help docs are self-contradictory on whether "Custom
  // shipping" still exists for new listings, and separately document a live bug where selecting
  // it disables the Buy Now button -- treated as unavailable, not built around). When an item's
  // real shipping cost exceeds that cap, bump the Vinted-specific price by the difference so the
  // organizer isn't shorted, instead of a silent shortfall -- and always surface this visibly via
  // vintedShippingNote (fas-vinted.js pushes it onto the same on-screen warnings list Category
  // misses already use), never silently. Reuses the SAME cheapest-carrier rate engine eBay flat-
  // rate/native-checkout pricing already uses (computeCheapestForOrigin) -- no second cost-
  // estimation system, see nativeShippingSuggestionService.ts for the identical reuse pattern.
  //
  // Gated on hasTrustedPackage(it) for the SAME reason packageWeightOz/dims are gated in `shaped`
  // below (2026-09-14 fix, the Q12E tuner incident): an unconfirmed AI/SEED package guess must
  // never drive a real dollar decision on any content-script marketplace. When the package isn't
  // trusted or a weight isn't set, this does NOT guess a bump -- it surfaces a warning asking the
  // organizer to confirm package weight/dimensions first, same posture as every other
  // UNVERIFIED-guess field in this payload.
  const VINTED_SHIPPING_CAP = 100;
  const vintedPricingByItemId = new Map<string, { vintedPrice: number; vintedShippingNote: string | null }>();
  for (const it of items) {
    if (it.price == null) continue;
    const basePrice = Number(it.price.toFixed(2));
    if (!hasTrustedPackage(it) || it.packageWeightOz == null || Number(it.packageWeightOz) <= 0) {
      vintedPricingByItemId.set(it.id, {
        vintedPrice: basePrice,
        vintedShippingNote:
          "This item's shipping cost hasn't been confirmed, so FindA.Sale could not check it against Vinted's $100 shipping cap -- confirm the item's package weight/dimensions, then re-check before publishing to Vinted.",
      });
      continue;
    }
    try {
      const zip = saleLocationById.get(it.saleId || '')?.zip || null;
      const cheapest = await computeCheapestForOrigin({
        weightOz: Number(it.packageWeightOz),
        dims: {
          length: it.packageLengthIn != null ? Number(it.packageLengthIn) : null,
          width: it.packageWidthIn != null ? Number(it.packageWidthIn) : null,
          height: it.packageHeightIn != null ? Number(it.packageHeightIn) : null,
        },
        origin: { zip },
        packageType: it.packageType ?? null,
        category: it.ebayCategoryName || it.category || null,
        categoryId: it.ebayCategoryId || null,
        priceUsd: basePrice,
      });
      if (cheapest.rate > VINTED_SHIPPING_CAP) {
        const overage = Math.round((cheapest.rate - VINTED_SHIPPING_CAP) * 100) / 100;
        vintedPricingByItemId.set(it.id, {
          vintedPrice: Math.round((basePrice + overage) * 100) / 100,
          vintedShippingNote: `Price includes $${overage.toFixed(2)} to cover shipping over Vinted's $100 cap (real shipping cost: $${cheapest.rate.toFixed(2)}).`,
        });
      } else {
        vintedPricingByItemId.set(it.id, { vintedPrice: basePrice, vintedShippingNote: null });
      }
    } catch (e: any) {
      if (e instanceof ShippingHardBlockError) {
        vintedPricingByItemId.set(it.id, {
          vintedPrice: basePrice,
          vintedShippingNote:
            'Shipping cost for this item could not be estimated for Vinted (it exceeds standard carrier limits) -- please review shipping and pricing manually before publishing.',
        });
      } else {
        console.warn('[Vinted pricing] computeCheapestForOrigin failed for item', it.id, e?.message || e);
        vintedPricingByItemId.set(it.id, { vintedPrice: basePrice, vintedShippingNote: null });
      }
    }
  }

  const shaped = items.map((it) => ({
    id: it.id,
    saleId: it.saleId,
    saleTitle: saleTitleById.get(it.saleId || '') || 'Sale',
    title: it.title,
    price: it.price != null ? Number(it.price.toFixed(2)) : null,
    vintedPrice: vintedPricingByItemId.get(it.id)?.vintedPrice ?? (it.price != null ? Number(it.price.toFixed(2)) : null),
    vintedShippingNote: vintedPricingByItemId.get(it.id)?.vintedShippingNote ?? null,
    condition: toFacebookCondition(it.condition),
    description: buildDescription(it.description, it.saleId),
    // S-EXT-BATCH-12 (2026-08-20, Patrick + live-Chrome-confirmed root cause): `category` on Item
    // is documented as "eBay L1 category name" (schema.prisma) but in practice holds whatever the
    // AI-tagging pipeline wrote, which for this item was a full colon-delimited eBay-taxonomy
    // breadcrumb ("Clothing, Shoes & Accessories:men:men's Clothing:activewear:tracksuits & Sets") --
    // none of Poshmark/Mercari/Vinted/Grailed's own category pickers are colon-delimited-breadcrumb
    // trees, so every content script's segment-matching logic was fighting a format mismatch on top
    // of each platform's own real UI quirks. `ebayCategoryName` (separate field, set when an organizer
    // confirms a category via EbayCategoryPicker.tsx, e.g. "Tracksuits & Sets") is a single clean leaf
    // name -- much closer to what a real marketplace category list actually contains. Prefer it when
    // present; fall back to the legacy `category` value for items with no confirmed eBay category yet
    // (better than sending nothing). `category` itself is left untouched everywhere else in this file
    // (eligibility/facebookRestricted checks below still read it directly) -- this only changes what's
    // sent to the crosslister extension as the `category` field in ITS payload.
    category: it.ebayCategoryName || it.category || null,
    // Full original breadcrumb, kept as a SEPARATE field so content scripts that benefit from
    // department/gender-level signal (e.g. Grailed's Menswear/Womenswear picker) can still use it --
    // never a straight replacement, since ebayCategoryName alone drops that signal entirely.
    categoryBreadcrumb: it.category || null,
    // Facebook Commerce Policy gate (coins/currency AND weapons/ammunition/explosives as of
    // S-FB-WEAPON-COIN-FIX-2026-09-03) -- see isFacebookRestrictedItem above. FB-specific only;
    // does not affect eBay/craigslist/gumtree/native-checkout fields elsewhere in this same
    // payload. Surfaced so popup.js can disable/badge the item on the Facebook channel
    // specifically while leaving it selectable for every other channel. Reason now comes directly
    // from the registry's own per-rule reason string instead of a hardcoded coin/currency-only
    // message, so a blocked weapon shows the correct weapons reason, not a misleading coins one.
    facebookRestricted: isFacebookRestrictedItem(it.category, it.ebayCategoryId, it.title),
    facebookRestrictedReason: facebookRestrictionReason(it.category, it.ebayCategoryId, it.title),
    // Per-marketplace category eligibility (S-EXT-BATCH-2026-08-19, marketplaceEligibilityRules.ts)
    // -- Grailed/Poshmark/Mercari/Vinted only; Craigslist/Gumtree AU/Facebook have no entry here
    // (Facebook keeps its own dedicated facebookRestricted/-Reason fields above for backward
    // compatibility with existing popup.js code). popup.js hides an ineligible item on that
    // platform's tab BY DEFAULT, with a "Show all items" override toggle -- this is UI guidance,
    // same defense-in-depth posture as facebookRestricted: markItemListed below is the real,
    // authoritative reject.
    // BUG FIX 2026-08-24 (Patrick-reported live: a real tracksuit -- brand Adidas, ebayCategoryName
    // "Tracksuits & Sets" -- was flagged "may not fit this marketplace" for Grailed). Root-caused via
    // direct DB query (packages/database/.env, Railway prod): this item's raw `category` column is a
    // stale generic value ("Everything Else"), while `ebayCategoryName` (the organizer-confirmed,
    // specific leaf name) is the correct "Tracksuits & Sets" -- and the `category` field built above
    // (see its own S-EXT-BATCH-12 comment) ALREADY prefers `ebayCategoryName` for what the extension
    // actually displays/fills, but this eligibility block was reading the raw `it.category` directly,
    // a genuine field-consistency bug, not a keyword-list gap (that part was already fixed separately
    // this session). Confirmed NOT a one-off: a live COUNT query found 203 items in production where
    // `ebayCategoryName` differs from `category`, so this affected real eligibility decisions at
    // scale, not just this one item. Fixed by using the exact same `ebayCategoryName || category`
    // fallback the extension-facing `category` field above already uses, so the eligibility check
    // reasons about the SAME resolved category value the organizer will actually see filled in.
    // `title: it.title` added S-FB-WEAPON-COIN-FIX-2026-09-03 -- same category+title combined
    // haystack fix as the FACEBOOK checks above, applied here too since these platforms share
    // the exact same excludeKeywords carve-out mechanism (e.g. Mercari's kitchen/cutlery carve-out
    // has the identical category-vs-title gap the coin-accessory bug had).
    // CRAIGSLIST/GUMTREE_AU added S-CROSS-MARKETPLACE-AUDIT-2026-09-03 -- both previously had NO
    // entry here at all (not even a comment explaining why, unlike Facebook's deliberate omission
    // for backward-compat reasons) despite fas-craigslist.js supporting full auto-publish CHECKED
    // BY DEFAULT. This is what lets popup.js's PLATFORM_ELIGIBILITY_KEY map (see popup.js, updated
    // same session) hide/badge ineligible items on those two tabs the same way it already does for
    // Grailed/Poshmark/Mercari/Vinted.
    eligibility: {
      CRAIGSLIST: checkEligibility('CRAIGSLIST', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
      GUMTREE_AU: checkEligibility('GUMTREE_AU', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
      GRAILED: checkEligibility('GRAILED', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
      POSHMARK: checkEligibility('POSHMARK', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
      MERCARI: checkEligibility('MERCARI', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
      VINTED: checkEligibility('VINTED', { category: it.ebayCategoryName || it.category, ebayCategoryId: it.ebayCategoryId, title: it.title }),
    },
    photoUrls: applyWatermark ? (it.photoUrls || []).map((u) => getWatermarkedUrlWithQR(u, it.id, it.qrEmbedEnabled !== false, it.qrAssetReady)) : (it.photoUrls || []),
    // Gated 2026-09-14 (see hasTrustedPackage above) -- previously exposed the raw,
    // untrusted packageWeightOz value unconditionally; the FB-specific loop above already
    // reverts THIS field to null in-memory for FB when untrusted, but that in-memory revert
    // only happens inside that loop's own try/catch -- gate here too as defense-in-depth for
    // every platform this response is shaped for (Mercari, Vinted, Poshmark, etc), not just FB.
    packageWeightOz: hasTrustedPackage(it) ? it.packageWeightOz : null,
    // Gated 2026-09-14 (see hasTrustedPackage above) -- previously exposed the raw, untrusted AI
    // guess unconditionally, which fas-mercari.js's/fas-vinted.js's own
    // `packageWeightOz ?? aiPackageWeightOz` fallback then used directly, fully defeating the
    // FB-specific packageWeightOz revert-to-null loop above for every OTHER platform.
    aiPackageWeightOz: hasTrustedPackage(it) ? it.aiPackageWeightOz : null,
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-8, live-confirmed via Patrick's screenshots): these
    // three were already selected from Prisma (see the `select` block above) but never actually
    // included in this response object -- same silent-drop pattern as bestOfferAutoAcceptAmt
    // earlier this session. Needed so fas-mercari.js can answer Mercari's real "will your item fit
    // in a shoebox?" shipping-label question from real item dimensions instead of guessing.
    // Gated 2026-09-14 (see hasTrustedPackage above) -- these were previously passed through
    // completely ungated regardless of confirmation status or estimate source.
    packageLengthIn: hasTrustedPackage(it) && it.packageLengthIn != null ? Number(it.packageLengthIn) : null,
    packageWidthIn: hasTrustedPackage(it) && it.packageWidthIn != null ? Number(it.packageWidthIn) : null,
    packageHeightIn: hasTrustedPackage(it) && it.packageHeightIn != null ? Number(it.packageHeightIn) : null,
    // BUG FIX 2026-08-20 (S-EXT-BATCH-12, Patrick-reported + confirmed by direct code read): brand/
    // size/color/material were already added to the Prisma `select` above (2026-08-18) and popup.js's
    // queue-building map already passes them through (its own comment there even claims "getExtensionItems
    // now returns them") -- but this `shaped` object, built field-by-field rather than spread from `it`,
    // never actually included them. So every one of these four values was silently dropped here, at the
    // one hop between the database and the extension, regardless of what the organizer edited on the
    // item -- explains Patrick's report that editing brand/size/color/material on a FindA.Sale listing
    // "didn't seem to take" on Vinted (or any of the other three platforms). Never invents a value: an
    // unset field stays `null`/`undefined` exactly like every other never-invent field in this payload
    // (saleCity/saleZip/saleAddress above), the content scripts already skip cleanly on that.
    brand: it.brand,
    size: it.size,
    color: it.color,
    material: it.material,
    // BUG FIX 2026-09-03 (ADR-090 follow-up): same field-by-field-drop bug documented in the
    // comment above for brand/size/color/material -- isbn was in the Prisma select (now) but
    // never listed in this hand-built `shaped` object, so fas-vinted.js's ISBN tryFill always
    // received undefined regardless of what's actually stored on the item.
    isbn: it.isbn,
    // FB shipping eligibility. Force LOCAL_PICKUP_ONLY when the item is not actually shippable:
    // an explicit LOCAL_PICKUP_ONLY override, OR no usable package weight (FB cannot issue a
    // prepaid label without a weight, so the extension would otherwise stall on the Delivery
    // step). Otherwise pass the eBay override through (null = FB default ship+pickup).
    // BUG FIX (2026-07-18, Patrick live report -- "Hofnar tin" cmrqpqatn005ul0sum3ij77kx):
    // this used to ALSO force pickup-only whenever `shippingAvailable===false`, but
    // `shippingAvailable` is a SEPARATE legacy field for FindA.Sale's own flat-rate native
    // checkout shipping (organizer-toggled, defaults false, paired with `shippingPrice` --
    // see stripeController.ts's shippingRequested gate) and has nothing to do with eBay/FB's
    // real weight-based computed shipping. The Hofnar tin has packageWeightOz=4 and ships fine
    // on eBay (ebayShippingOverride=null) but `shippingAvailable` was never toggled (still its
    // default false) -- so the extension was wrongly force-picking pickup-only on FB for any
    // item where the organizer simply never touched that unrelated legacy checkbox. Removed the
    // `shippingAvailable` condition; shippability is now determined the same way eBay does:
    // explicit override or missing weight only.
    // 2026-07-23 fix: this used to also require aiPackageWeightOz == null before forcing
    // pickup-only, on the assumption that packageWeightOz null implied no AI weight either.
    // That broke the moment SEED/AI-sourced weights started being deliberately reverted to
    // null above (raw aiPackageWeightOz column is untouched by that revert) -- items like
    // the 3 lamps ended up with packageWeightOz=null AND aiPackageWeightOz still populated,
    // so this condition silently failed to trigger and FB was left with no weight and no
    // pickup-only fallback (worse than either state alone). packageWeightOz is now the
    // single source of truth for "does FB have a usable weight" -- check it alone.
    shippingOverride:
      it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY' || it.packageWeightOz == null
        ? 'LOCAL_PICKUP_ONLY'
        : it.ebayShippingOverride,
    // Crosslister shipping-payer preference (2026-08-27) -- organizer's per-item opt-in to offer
    // free shipping (they absorb the cost) when this item is cross-listed to an external
    // marketplace (Mercari today via fas-mercari.js's fillMercariShippingPayer(); other
    // marketplaces can read the same field once they implement their own equivalent control).
    // Straight passthrough, default false (see Item.crosslisterFreeShipping's own schema
    // comment for why it must never default true) -- SEPARATE from shippingAvailable/
    // shippingPrice above, which are FindA.Sale's own native-checkout shipping, not this.
    crosslisterFreeShipping: it.crosslisterFreeShipping === true,
    // Mirror the item's existing eBay Best Offer settings onto Facebook's Offer step.
    // bestOfferMinimumAmt is a Prisma Decimal (stored in DOLLARS, same unit as price) --
    // coerce to a plain number so it serializes as JSON number, not a Decimal string.
    allowBestOffer: it.allowBestOffer,
    bestOfferMinimumAmt: it.bestOfferMinimumAmt != null ? Number(it.bestOfferMinimumAmt) : null,
    // BUG FIX 2026-08-23 (S-EXT-MERCARI-BATCH-4, Patrick-directed): same Decimal->Number
    // coercion as bestOfferMinimumAmt above -- needed so fas-mercari.js/fas-grailed.js can prefer
    // this as the Smart Pricing floor default ahead of the 25%-of-price fallback.
    bestOfferAutoAcceptAmt: it.bestOfferAutoAcceptAmt != null ? Number(it.bestOfferAutoAcceptAmt) : null,
    marketplaceListed: postedByItem.has(it.id) && !removedByItem.has(it.id),
    // Per-platform listed flags (2026-08-08 fix) -- see the postedByItemPlatform /
    // removedByItemPlatform comment above. popup.js uses these instead of the any-platform
    // marketplaceListed field so switching the "Post to" channel shows the correct LISTED
    // badge / hide-filter for THAT channel, not whichever channel the item happened to be
    // posted to first.
    marketplaceListedFacebook: postedByItemPlatform.has(`${it.id}:FACEBOOK`) && !removedByItemPlatform.has(`${it.id}:FACEBOOK`),
    marketplaceListedCraigslist: postedByItemPlatform.has(`${it.id}:CRAIGSLIST`) && !removedByItemPlatform.has(`${it.id}:CRAIGSLIST`),
    // ADR-102 (2026-08-09): Gumtree Australia -- same per-platform pattern as the two above,
    // read by popup.js's currentListedFlag() when the 'gumtree_au' channel is selected.
    marketplaceListedGumtreeAu: postedByItemPlatform.has(`${it.id}:GUMTREE_AU`) && !removedByItemPlatform.has(`${it.id}:GUMTREE_AU`),
    // S-EXT-POSHMARK-LISTED-BADGE (2026-08-22, Patrick live report -- "tracksuit doesn't show as
    // already listed on poshmark"): markItemListed (below) has created a real MarketplaceListingJob
    // row with platform POSHMARK/MERCARI/VINTED/GRAILED since the 2026-08-19 platform-coercion fix
    // (see MarketplaceListingPlatform's own comment), and postedByItemPlatform/removedByItemPlatform
    // above are already generic/platform-agnostic (keyed by `${itemId}:${platform}` for ANY
    // platform) -- so the data has been correct all along. The bug was narrower than it looked:
    // this `shaped` object -- built field-by-field, not spread from a generic map -- simply never
    // read these 4 platforms' keys out into the response, exactly the same class of gap as the
    // brand/size/color/material bug fixed 2026-08-20 just above. popup.js's currentListedFlag()
    // already reads marketplaceListedPoshmark/-Mercari/-Vinted/-Grailed and has since 2026-08-18
    // (its own comment there documented this exact gap and is now stale/resolved) -- these were
    // simply always undefined -> false. Confirmed via direct source read this session; not the
    // guessed "maybe markListed never fires for these platforms" theory -- markItemListed's
    // job-creation call (`prisma.marketplaceListingJob.create`) is platform-agnostic and unconditional.
    marketplaceListedPoshmark: postedByItemPlatform.has(`${it.id}:POSHMARK`) && !removedByItemPlatform.has(`${it.id}:POSHMARK`),
    marketplaceListedMercari: postedByItemPlatform.has(`${it.id}:MERCARI`) && !removedByItemPlatform.has(`${it.id}:MERCARI`),
    marketplaceListedVinted: postedByItemPlatform.has(`${it.id}:VINTED`) && !removedByItemPlatform.has(`${it.id}:VINTED`),
    marketplaceListedGrailed: postedByItemPlatform.has(`${it.id}:GRAILED`) && !removedByItemPlatform.has(`${it.id}:GRAILED`),
    // Craigslist ZIP/area autofill (2026-08-06) -- fas-craigslist.js reads these exact field
    // names (item.saleCity / item.saleZip) and only fills when present, never invents a value.
    saleCity: saleLocationById.get(it.saleId || '')?.city || null,
    saleZip: saleLocationById.get(it.saleId || '')?.zip || null,
    // Craigslist geoverify-step street address (2026-08-06) -- fills fas-craigslist.js's
    // #xstreet0 field on the ?s=geoverify "add map" screen. Same never-invent rule.
    saleAddress: saleLocationById.get(it.saleId || '')?.address || null,
  }));

  // Generate + store each item's QR overlay asset on Cloudinary once (fire-and-forget, never
  // awaited/blocking) so subsequent calls can use the short public_id instead of re-deriving
  // the external QR-service URL on every photo. Outside the `shaped` .map() so it fires once
  // per item, not once per photo.
  for (const it of items) {
    if (it.qrAssetReady === false) {
      ensureQrCodeAsset(it.id).catch(() => {});
    }
  }

  res.json({
    organizer: {
      businessName: organizer.businessName,
      // Feature #602 (2026-08-05): client-side convenience gate for the content script --
      // it should not even attempt a message-autosend-decision call when this is false, but
      // the backend endpoint re-checks it authoritatively regardless (never trust the client).
      autosendPriceAvailabilityEnabled: (organizer as any).autosendPriceAvailabilityEnabled ?? false,
      // 2026-08-06: Craigslist reply-option email autofill -- the organizer's own account
      // email, data we already collect and store, not invented or guessed.
      email: organizer.user?.email || null,
      // S-EXT-BATCH (2026-08-20): Grailed's Smart Pricing floor price needs a real source of
      // truth instead of being left blank (Patrick-directed fix). `organizer` above is fetched
      // with `include` (not `select`), which Prisma returns with ALL scalar fields already
      // present -- defaultBestOfferDeclinePct (Int?, suggested default 25 per schema.prisma
      // comment) is already on this object with zero query changes needed. Surfaced here so
      // fas-grailed.js can compute floorPrice = item.bestOfferMinimumAmt ?? price * (1 - pct/100)
      // the same way fas-content.js already derives Facebook's Best Offer minimum.
      defaultBestOfferDeclinePct: organizer.defaultBestOfferDeclinePct,
      // FIX 2026-09-15: Smart Pricing floor fallback needs the ACCEPT pct (auto-accept up
      // to this discount, suggested default 10), not the DECLINE pct above (a different,
      // more permissive boundary, suggested default 25) -- same zero-query-change basis as
      // defaultBestOfferDeclinePct just above (organizer fetched with `include`).
      defaultBestOfferAcceptPct: organizer.defaultBestOfferAcceptPct,
    },
    items: shaped,
  });
};

// Verify an item belongs to the requesting organizer; returns the organizer id or null.
async function assertItemOwned(userId: string, itemId: string): Promise<boolean> {
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  if (!organizer) return false;
  const item = await prisma.item.findFirst({
    where: { id: itemId, sale: { organizerId: organizer.id } },
    select: { id: true },
  });
  return !!item;
}

// ADR-100 §7 Q1 CONFIRMED 2026-08-09: Patrick confirmed Facebook leans toward 7 days
// before the platform surfaces its own renew/delete-relist options, matching Craigslist's
// published for-sale-category norm (craigslist.org/about/help/faqs/lifespan: free postings
// live 7-45 days depending on category; for-sale categories are typically the 7-day end).
// Marketplace Listing Auto-Renew. Which channel a POST row belongs to, and how many days
// after posting that channel's listing is treated as due for renewal.
type MarketplaceRenewalPlatform = 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU';
const VALID_RENEWAL_PLATFORMS: MarketplaceRenewalPlatform[] = ['FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU'];
const RENEWAL_LAPSE_WINDOW_DAYS: Record<MarketplaceRenewalPlatform, number> = {
  FACEBOOK: 7, // ADR-100 §7 Q1 confirmed 2026-08-09 (Patrick) -- was 30, corrected to 7
  CRAIGSLIST: 7, // ADR-100 §7 Q1 confirmed 2026-08-09 -- matches craigslist.org official for-sale-category norm
  // ADR-102 (2026-08-09): UNVERIFIED PLACEHOLDER, not a confirmed value -- Gumtree Australia's
  // own listing-lifespan/renewal cadence has never been checked live (no FindA.Sale Gumtree AU
  // account exists yet to check it against, see ADR-102 §9). Deliberately set more conservative
  // than FB/Craigslist's confirmed 7-day figure, following this same file's own precedent of
  // starting cautious and correcting down only after a real live check (FB started at 30, was
  // corrected to 7 -- see comment above). Revisit the moment a real Gumtree AU account exists;
  // do not treat this number as researched.
  GUMTREE_AU: 14,
};
// ADR-100 §7 Q2 CONFIRMED 2026-08-30 (Patrick): same-day (0) is correct.
const RENEWAL_NOTIFY_LEAD_TIME_DAYS = 0;

// Listing platforms accepted by markItemListed below -- a SUPERSET of the 3 renewal-eligible
// platforms above (Grailed/Poshmark/Mercari/Vinted are content-script crosslisting targets that
// are NOT wired into renewal at all -- Grailed/Poshmark/Mercari simply have no renewal automation
// built yet, and Vinted is deliberately, permanently excluded per its file header's anti-bump
// legal constraint). Kept as a separate type/list from MarketplaceRenewalPlatform rather than
// widening that one, so RENEWAL_LAPSE_WINDOW_DAYS's Record type still only needs to cover
// platforms that actually have a lapse window.
//
// BUG FOUND + FIXED 2026-08-19 (S-EXT-BATCH): markItemListed used to validate `platform` against
// VALID_RENEWAL_PLATFORMS ONLY (FACEBOOK/CRAIGSLIST/GUMTREE_AU) and silently coerced anything
// else -- including every real 'GRAILED'/'POSHMARK'/'MERCARI'/'VINTED' markListed call sent by
// those 4 content scripts (see fas-grailed.js/fas-poshmark.js/fas-mercari.js/fas-vinted.js's own
// showReviewOverlay handlers) -- down to 'FACEBOOK'. Every organizer confirmation ("I posted") on
// any of these 4 platforms was being written to the database as a FACEBOOK MarketplaceListingJob
// row instead of its real platform. Found by code inspection while wiring this same platform
// value through checkEligibility below -- the coercion would have silently defeated the new
// per-platform eligibility gate too (a Grailed post would have been checked against Facebook's
// coin/currency rule instead of Grailed's fashion-only rule). Never caught live because nothing
// previously read marketplaceListedGrailed/-Poshmark/-Mercari/-Vinted server-side (popup.js's
// own 2026-08-18 comment already flags those fields as not yet returned by this endpoint).
type MarketplaceListingPlatform = MarketplaceRenewalPlatform | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED';
const VALID_LISTING_PLATFORMS: MarketplaceListingPlatform[] = [
  ...VALID_RENEWAL_PLATFORMS, 'GRAILED', 'POSHMARK', 'MERCARI', 'VINTED',
];
function isRenewalEligiblePlatform(p: MarketplaceListingPlatform): p is MarketplaceRenewalPlatform {
  return (VALID_RENEWAL_PLATFORMS as string[]).includes(p);
}

// POST /api/extension/items/:id/listed — record that the organizer listed this item to Marketplace.
// ADR-100: now accepts an optional `platform` (defaults 'FACEBOOK' -- the only caller that
// omitted it before this change was the existing FB flow, so default preserves today's
// behavior exactly) and computes renewDueAt = now() + that platform's lapse-window.
export const markItemListed = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const remoteListingId = typeof req.body?.remoteListingId === 'string' ? req.body.remoteListingId : null;
  const platformRaw = typeof req.body?.platform === 'string' ? req.body.platform.toUpperCase() : 'FACEBOOK';
  // BUG FIX 2026-08-19 (see MarketplaceListingPlatform comment above): validate against the full
  // VALID_LISTING_PLATFORMS superset, not just the 3 renewal-eligible platforms -- a real
  // GRAILED/POSHMARK/MERCARI/VINTED value must no longer be silently coerced to FACEBOOK.
  const platform: MarketplaceListingPlatform = (VALID_LISTING_PLATFORMS as string[]).includes(platformRaw)
    ? (platformRaw as MarketplaceListingPlatform)
    : 'FACEBOOK';

  // Facebook Commerce Policy gate (coins/currency) -- this is the AUTHORITATIVE reject, run
  // regardless of whatever the extension's own client-side checks (popup.js/background.js/
  // fas-content.js) already decided. Only blocks platform === 'FACEBOOK' -- eBay, native
  // checkout, and every other platform's markItemListed call is unaffected.
  //
  // DELIBERATELY NOT extended to GRAILED/POSHMARK/MERCARI/VINTED -- see the CORRECTED note below
  // for why "those 4 never auto-publish" (this paragraph's original justification) is itself stale.
  // A backend reject here would not prevent a bad listing (it already happened, on the real
  // platform) -- it would only corrupt FindA.Sale's own record of what the organizer just told us
  // they did, and would directly defeat popup.js's "Show all items" override (the whole point of
  // that toggle is letting the organizer list an item the category filter got wrong -- see
  // PLATFORM_ELIGIBILITY_KEY/checkResumeableQueue in popup.js). The category registry
  // (checkEligibility, marketplaceEligibilityRules.ts) stays a client-side UX filter (hide by
  // default + override) for these platforms, not a server-side hard gate here.
  // CORRECTED S-CROSS-MARKETPLACE-AUDIT-2026-09-03: this comment used to justify Facebook's special
  // treatment as "fully automated... Facebook is different in kind, not just degree" -- that premise
  // is now STALE. Craigslist ALSO auto-publishes by default (2026-07-17 locked decision, confirmed
  // this session), and Grailed/Poshmark/Mercari/Vinted support auto-publish as a PRO/TEAMS opt-in
  // too -- Facebook is no longer uniquely automated. The REAL reason this endpoint's hard reject
  // stays Facebook-only: mark()/markItemListed always fires AFTER a successful publish click (a
  // post-hoc "record what happened" call, confirmed by reading fas-content.js's own call site), so
  // it was never actually a pre-submit gate for ANY platform including Facebook -- the real pre-
  // submit protection lives in each platform's own content script.
  // CORRECTED AGAIN 2026-09-16: the line above used to end "...Gumtree AU/Grailed/Poshmark/Mercari/
  // Vinted do not yet have one, flagged as a follow-up." That was already false by the time it was
  // read this session -- confirmed via direct grep of every fas-*.js file, ALL SEVEN
  // (Facebook/Craigslist/Gumtree AU/Grailed/Poshmark/Mercari/Vinted) have their own
  // <platform>RestrictionReason(category, title) pre-submit gate today, most added in the SAME
  // 2026-09-03 S-CROSS-MARKETPLACE-AUDIT-2026-09-03 sweep that added Craigslist's and Facebook's
  // weapons coverage (see S-EXT-POSHMARK-PROHIBITED-GATE / S-EXT-MERCARI-PROHIBITED-GATE / Grailed's
  // and Gumtree AU's own dated comments in their respective files). A findasale-hacker deep dive
  // this session initially flagged this as a live CRITICAL/P0 gap based on THIS comment alone,
  // without re-checking the content scripts directly -- corrected before any code was written on
  // that mistaken premise. Lesson: this comment is exactly the kind of stale fact that costs a
  // session real time; if you're about to cite it, grep the actual fas-*.js files first.
  // Generalizing this endpoint's reject to every platform would only risk breaking the
  // "Show all items" override for a legitimate miscategorized item, for no real preventive gain --
  // left Facebook-only on purpose, not by oversight.
  if (platform === 'FACEBOOK') {
    const fbItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { category: true, ebayCategoryId: true, title: true },
    });
    // S-FB-WEAPON-COIN-FIX-2026-09-03: message now comes from the registry's own reason string
    // (covers weapons/ammunition/explosives, not just coins/currency) instead of a hardcoded
    // coin-only message -- a blocked dagger used to get no server-side reject message at all
    // (no weapons rule existed), and would have shown a misleading "coins and currency" message
    // even after the rule existed, if the message string hadn't been generalized too.
    if (fbItem) {
      const reason = facebookRestrictionReason(fbItem.category, fbItem.ebayCategoryId, fbItem.title);
      if (reason) {
        res.status(400).json({ message: reason });
        return;
      }
    }
  }

  // renewDueAt only applies to the 3 renewal-eligible platforms (RENEWAL_LAPSE_WINDOW_DAYS has no
  // entries for Grailed/Poshmark/Mercari/Vinted -- none of the 4 are wired into auto-renewal, see
  // MarketplaceListingPlatform's comment above). getPendingRenewals already treats a null
  // renewDueAt as "never surfaces a renewal nudge" (same as any pre-ADR-100 row), so this is safe.
  const renewDueAt = isRenewalEligiblePlatform(platform)
    ? new Date(Date.now() + RENEWAL_LAPSE_WINDOW_DAYS[platform] * 24 * 60 * 60 * 1000)
    : null;

  // BUG FIX 2026-09-16 (S-EXT-LISTED-REPORT-NOT-IDEMPOTENT, found during a findasale-hacker deep
  // dive on a proposed auto-fan-out feature -- flagged as a prerequisite for that feature, but
  // fixed now since it's a real gap in today's shipped code too, same bug CLASS as
  // markItemRemoved's 2026-09-04 fix directly below (S-EXT-REMOVAL-REPORT-NOT-IDEMPOTENT, 695
  // duplicate-row incident) which this endpoint never got the equivalent of. Any retry of this
  // request (extension network hiccup, a double-fire, or a future queue-consumer re-processing
  // the same job after a crash) previously created a brand new MarketplaceListingJob row every
  // time, unconditionally. Scoped to (item, platform) and keyed off the LATEST row, same shape as
  // markItemRemoved's fix -- a genuine re-list after a REMOVE still creates a fresh POSTED row;
  // this only suppresses a duplicate report against an already-POSTED listing.
  const latestForPlatform = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (latestForPlatform && latestForPlatform.action === 'POST' && latestForPlatform.status === 'POSTED') {
    res.json({ ok: true, deduped: true });
    return;
  }

  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'POST', status: 'POSTED', remoteListingId, platform, renewDueAt },
  });
  res.json({ ok: true });
};

// POST /api/extension/items/:id/removed — record that the organizer removed this item from Marketplace.
// BUG FIX 2026-08-22 (S-EXT-CROSS-PLATFORM-AUTOREMOVE, found while building cross-platform
// auto-remove-on-sale-elsewhere per Patrick's explicit directive -- "it must be built for all of
// them, that's part of the extension"): this used to create the REMOVE job with NO platform at
// all, which the schema defaults to FACEBOOK (MarketplaceListingJob.platform @default(FACEBOOK)).
// That was harmless while Facebook was the only caller (fas-remove.js), but the moment ANY other
// platform's removal flow calls this same endpoint, a Poshmark/Mercari/etc. removal would get
// silently recorded as a FACEBOOK REMOVE row instead -- getExtensionItems' per-platform
// postedByItemPlatform/removedByItemPlatform sets (keyed by `${itemId}:${platform}`) would then
// never see a REMOVE row under the real platform's key, so marketplaceListedPoshmark (etc.) would
// stay stuck "listed" forever even after a genuinely successful removal. Exact same bug class as
// markItemListed's pre-2026-08-19 silent-coercion-to-FACEBOOK bug (see MarketplaceListingPlatform's
// comment above) -- same fix shape: accept an optional `platform`, validate against the same
// VALID_LISTING_PLATFORMS superset, default 'FACEBOOK' only to preserve every existing caller's
// exact current behavior (fas-remove.js never sent one before this fix).
export const markItemRemoved = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const platformRaw = typeof req.body?.platform === 'string' ? req.body.platform.toUpperCase() : 'FACEBOOK';
  const platform: MarketplaceListingPlatform = (VALID_LISTING_PLATFORMS as string[]).includes(platformRaw)
    ? (platformRaw as MarketplaceListingPlatform)
    : 'FACEBOOK';

  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-REPORT-NOT-IDEMPOTENT): "removed" is a STATE, not an event
  // log, but this endpoint appended a row on every call with no dedupe at all. Live incident:
  // item cmp5iwn0g000f118erlt7mc3w accumulated 695 identical POSHMARK REMOVE/REMOVED rows in five
  // minutes (2026-09-04 20:10:39Z-20:15:35Z, ~0.4s apart) -- 54% of the entire table -- from a
  // client-side loop whose exact trigger was never identified. Whatever the client does, the
  // server must not let a repeated report multiply rows. Scoped to (item, platform) and keyed off
  // the LATEST row so a genuine relist (a later POST/POSTED) still allows a fresh REMOVE
  // afterwards -- this only suppresses a duplicate report against an already-removed listing.
  const latestForPlatform = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (latestForPlatform && latestForPlatform.action === 'REMOVE' && latestForPlatform.status === 'REMOVED') {
    res.json({ ok: true, deduped: true });
    return;
  }

  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'REMOVE', status: 'REMOVED', platform },
  });
  res.json({ ok: true });
};

// POST /api/extension/items/:id/removal-skipped — (2026-07-26, dead-letter fix) record a
// genuine removal attempt that couldn't be resolved (zero/ambiguous title match on Facebook's
// "Your listings" page, or couldn't confirm the Sold flip in time) -- NOT the "already sold,
// nothing to do" case, which is reported as a normal /removed success instead (see
// fas-remove.js's alreadySoldCardByTitle fix, same date). Root cause this closes: before this,
// a skip was purely a client-side toast that vanished in 4s with no server-side record, so
// getPendingRemovals kept re-serving the exact same unresolvable item forever, once per poll,
// with zero visibility into "this has already failed N times". attemptCount here is a running
// count of REMOVE/SKIPPED rows for this item, read back by getPendingRemovals to give up after
// MAX_REMOVAL_SKIP_ATTEMPTS and surface it as needsManualReview instead of retrying it forever.
export const markItemRemovalSkipped = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  // BUG FIX 2026-09-04 (S-EXT-REMOVAL-SKIP-COUNTER-NOT-PLATFORM-SCOPED): this row was created
  // WITHOUT a `platform`, so every skip from every platform was filed under the schema default
  // (FACEBOOK) and `priorSkips` counted them all together as one pool. Combined with
  // getPendingRemovals' then item-level skip counter, one platform's failures dead-lettered every
  // OTHER platform's still-live listing. Confirmed live against production on items
  // cmtad5zdg001lqwgm7b21bfux ("Jimmy Buffett Coconut Telegraph Vinyl LP") and
  // cmtad6d53001sqwgm4t4eczs7 ("Time in a Bottle: Jim Croce's Greatest Love Songs Vinyl LP"):
  // three FACEBOOK REMOVE/SKIPPED rows written inside four minutes (against a Facebook listing
  // that had legitimately been REMOVED days earlier) pushed each ITEM to the cap and hid a
  // POSHMARK listing that was still live and had ZERO removal attempts of its own on record.
  // Same validate-against-VALID_LISTING_PLATFORMS, default-'FACEBOOK' pattern as markItemListed /
  // markItemRemoved above: fas-remove.js sends no platform, so the default preserves its exact
  // current behaviour, and an unvalidated string can never reach the Prisma enum field.
  const platformRaw = typeof req.body?.platform === 'string' ? req.body.platform.toUpperCase() : 'FACEBOOK';
  const platform: MarketplaceListingPlatform = (VALID_LISTING_PLATFORMS as string[]).includes(platformRaw)
    ? (platformRaw as MarketplaceListingPlatform)
    : 'FACEBOOK';
  const priorSkips = await prisma.marketplaceListingJob.count({
    where: { itemId, action: 'REMOVE', status: 'SKIPPED', platform },
  });
  await prisma.marketplaceListingJob.create({
    data: {
      itemId,
      action: 'REMOVE',
      status: 'SKIPPED',
      platform,
      attemptCount: priorSkips + 1,
      lastAttemptAt: new Date(),
      lastErrorMessage: reason,
    },
  });
  res.json({ ok: true });
};

// GET /api/extension/pending-removals — items that were listed to Marketplace by this
// extension and have since sold via ANY channel (POS, storefront, eBay, anything that
// flips Item.status to SOLD) but haven't been marked removed yet. ADR-084 amendment
// 2026-07-15: Facebook has no API, so there's no server-to-Facebook withdraw call the way
// endEbayListingIfExists() calls eBay directly -- this is a poll target for the extension's
// own background alarm instead. Pure read composed from data every existing sale path
// already updates (Item.status, MarketplaceListingJob) -- no new schema, no migration.
// (2026-07-26, then S1179 2026-07-30) An item stuck on a genuine skip (title can't be matched
// on Facebook at all -- never the "already sold" case, which now self-resolves as a normal
// /removed success) was, until S1179, EXCLUDED FOREVER once it crossed MAX_REMOVAL_SKIP_ATTEMPTS
// -- a permanent one-way dead-letter with no way back, even after later fixes to the client-side
// matching logic (e.g. alreadySoldCardByTitle, same date as the original dead-letter). Confirmed
// on the live Artifact account: 3 items burned their 3 attempts before that later fix shipped and
// were then dead-lettered forever, unrelated to whether they could now actually resolve.
// S1179 fix: past MAX_REMOVAL_SKIP_ATTEMPTS, stop hammering Facebook on every ~20min poll (still
// surface once as needsManualReview so the organizer knows), but give the item a genuine retry
// again after RETRY_COOLDOWN_MS has passed since its last recorded skip -- a decaying backoff,
// not a one-way ratchet. Each fresh failure after cooldown just resets the clock via a new
// SKIPPED row (markItemRemovalSkipped), so a permanently-unmatchable item still only gets
// hammered once per cooldown window, while one that becomes matchable again (client-side fix,
// title corrected, etc.) gets a real chance to succeed instead of being stuck forever.
// Exported (2026-08-06, admin backlog visibility gap): single source of truth for the
// dead-letter threshold, now also read by adminController.ts's platform-wide
// getMarketplaceReviewBacklog so the admin view and every organizer-facing computation
// (getPendingRemovals, getSyncHealth above) can never drift to a second divergent value.
export const MAX_REMOVAL_SKIP_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h between retries once past the fast-fail cap

export const getPendingRemovals = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const soldItems = await prisma.item.findMany({
    // 2026-07-26 (S1169): same sale.deletedAt gap as getExtensionItems -- a sold item under a
    // soft-deleted sale must not keep surfacing as a pending Facebook removal forever.
    where: { sale: { organizerId: organizer.id, deletedAt: null }, status: 'SOLD' },
    select: { id: true, title: true },
  });
  if (!soldItems.length) { res.json({ items: [], needsManualReview: [] }); return; }

  const itemIds = soldItems.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true, lastErrorMessage: true, lastAttemptAt: true, platform: true, createdAt: true },
  });
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  // BUG FIX 2026-09-04 (S-EXT-GETPENDINGREMOVALS-CROSS-PLATFORM-MASKING, second half -- see the
  // full root-cause note above `stillPending` below): these three were keyed by itemId ALONE, so
  // one platform's skips gated retry eligibility for every other platform on the same item. Now
  // keyed `${itemId}:${platform}`, the same convention `latestByItemPlatform` just below already
  // uses (split back apart with lastIndexOf(':') -- item ids are cuids and contain no colon).
  const skipCountByItemPlatform = new Map<string, number>();
  const lastSkipReasonByItemPlatform = new Map<string, string | null>();
  const lastSkipAtByItemPlatform = new Map<string, Date>();
  // FEATURE 2026-08-22 (S-EXT-CROSS-PLATFORM-AUTOREMOVE, Patrick-directed: "it must be built for
  // all of them, that's part of the extension" -- extending Facebook's existing sold-elsewhere
  // auto-removal to every platform). This endpoint's `items` response has always been
  // platform-AGNOSTIC (any POST, not yet any REMOVE) -- correct for the "should we even consider
  // this item" gate, but not enough to tell the extension WHICH platform(s) still have a live
  // listing to actually remove. getExtensionItems already computes exactly this per-platform
  // breakdown (postedByItemPlatform/removedByItemPlatform, keyed by `${itemId}:${platform}`) for
  // AVAILABLE items -- but that endpoint filters to status:'AVAILABLE' only, so it never returns
  // SOLD items at all. Mirroring the same latest-row-per-item+platform-wins computation here
  // instead of a second divergent implementation of "is this platform's listing still live".
  const latestByItemPlatform = new Map<string, { action: string; status: string; createdAt: Date }>();
  for (const j of jobs) {
    const key = j.itemId + ':' + j.platform;
    const existing = latestByItemPlatform.get(key);
    if (!existing || j.createdAt > existing.createdAt) {
      latestByItemPlatform.set(key, { action: j.action, status: j.status, createdAt: j.createdAt });
    }
  }
  const stillListedPlatformsByItem = new Map<string, string[]>();
  for (const [key, latest] of latestByItemPlatform) {
    if (latest.action !== 'POST' || latest.status !== 'POSTED') continue;
    const sepIdx = key.lastIndexOf(':');
    const itemId = key.slice(0, sepIdx);
    const platform = key.slice(sepIdx + 1);
    const arr = stillListedPlatformsByItem.get(itemId) || [];
    arr.push(platform);
    stillListedPlatformsByItem.set(itemId, arr);
  }
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') postedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'SKIPPED') {
      const skipKey = j.itemId + ':' + j.platform;
      skipCountByItemPlatform.set(skipKey, (skipCountByItemPlatform.get(skipKey) || 0) + 1);
      lastSkipReasonByItemPlatform.set(skipKey, j.lastErrorMessage ?? null);
      // S1179: track the MOST RECENT skip per item+platform (jobs aren't guaranteed ordered) so we
      // can gate the cooldown off it -- a fresh retry is only offered once RETRY_COOLDOWN_MS has
      // elapsed since the last actual failure, not since it first crossed the cap.
      const attemptedAt = j.lastAttemptAt;
      if (attemptedAt && (!lastSkipAtByItemPlatform.has(skipKey) || attemptedAt > lastSkipAtByItemPlatform.get(skipKey)!)) {
        lastSkipAtByItemPlatform.set(skipKey, attemptedAt);
      }
    }
  }

  const now = Date.now();
  // 2026-09-04: now scoped to ONE platform's own skip history. The internal logic below is
  // unchanged from S1179 -- only the counters it reads are per-platform instead of per-item.
  const isRetryEligible = (itemId: string, platform: string): boolean => {
    const skipKey = itemId + ':' + platform;
    const skipCount = skipCountByItemPlatform.get(skipKey) || 0;
    if (skipCount < MAX_REMOVAL_SKIP_ATTEMPTS) return true;
    // S1179: past the fast-fail cap, only retry again once the cooldown since the last
    // recorded skip has elapsed -- covers items that were dead-lettered before this fix
    // shipped (their lastAttemptAt is already well past the cooldown, so they're eligible
    // again on the very next poll) as well as future items that hit the cap going forward.
    const lastSkipAt = lastSkipAtByItemPlatform.get(skipKey);
    if (!lastSkipAt) return true; // no timestamp on record -- fail open rather than stuck forever
    return now - lastSkipAt.getTime() >= RETRY_COOLDOWN_MS;
  };

  // BUG FIX 2026-09-04 (S-EXT-GETPENDINGREMOVALS-CROSS-PLATFORM-MASKING, Patrick-directed live
  // investigation -- Poshmark auto-removal "never fires" report). Root cause, confirmed live via
  // direct DB query against production (MarketplaceListingJob rows for item
  // cmtad5zdg001lqwgm7b21bfux, "Jimmy Buffett Coconut Telegraph Vinyl LP"): FACEBOOK POST/POSTED,
  // POSHMARK POST/POSTED, FACEBOOK REMOVE/REMOVED -- no Poshmark REMOVE row exists at all, the
  // Poshmark listing was never touched. `postedByItem`/`removedByItem` above are ITEM-level, not
  // platform-scoped: any single platform's successful REMOVE (here, Facebook's) added the item to
  // `removedByItem`, which excluded the WHOLE item from `stillPending` below -- silently hiding
  // Poshmark's still-live listing from this endpoint forever, with no error and no signal to the
  // organizer. `stillListedPlatformsByItem` above already computes the correct, per-platform
  // "is this platform's latest job still POST/POSTED" answer (used to build the `platforms` array
  // on each returned item) -- using it here too instead of the broken item-level sets.
  //
  // SECOND HALF OF THE SAME MASKING BUG (2026-09-04, same investigation): making `stillPending`
  // per-platform-correct was necessary but not sufficient -- the skip COUNTER was left item-level
  // in that same pass, so an item could pass this filter and still be withheld from the response
  // entirely by another platform's failures. Live evidence, same two items
  // (cmtad5zdg001lqwgm7b21bfux, cmtad6d53001sqwgm4t4eczs7): FACEBOOK POST/POSTED then FACEBOOK
  // REMOVE/REMOVED days earlier (Facebook genuinely done), then THREE FACEBOOK REMOVE/SKIPPED rows
  // created today inside four minutes -- 19:46, 19:48, 19:49 -- each "No confident match for this
  // listing on the page". Those three hit MAX_REMOVAL_SKIP_ATTEMPTS for the ITEM, so
  // isRetryEligible returned false and the whole item was dropped from `items` for a full
  // RETRY_COOLDOWN_MS, taking down POSHMARK POST/POSTED -- still live, and with no POSHMARK REMOVE
  // row of ANY kind on record, i.e. never attempted even once. Fixed on three fronts: the skip
  // maps above are keyed itemId:platform, isRetryEligible takes the platform, and each returned
  // item's `platforms` array is filtered to the still-listed platforms that are individually
  // retry-eligible (an item with no eligible platform left is omitted rather than returned with an
  // empty array, which would hand the extension an item with nothing to do). markItemRemovalSkipped
  // above now stamps `platform` on the SKIPPED row it writes -- without that, every skip still
  // lands on the FACEBOOK default and per-platform counting here is meaningless.
  const stillPending = soldItems.filter((i) => (stillListedPlatformsByItem.get(i.id) || []).length > 0);
  // `platforms` is additive -- fas-remove.js (Facebook's own consumer) only ever read
  // id/title and is unaffected. New per-platform consumers (background.js's generalized
  // multi-platform removal engine) use this to route each item to the right platform's own
  // removal tab instead of assuming Facebook.
  // 2026-09-04: retry eligibility is applied PER PLATFORM inside the `platforms` array, not to the
  // item as a whole. An item is returned only if at least one of its still-listed platforms is
  // itself eligible -- so Facebook burning its cap can no longer withhold Poshmark's live listing.
  const items = stillPending
    .map((i) => ({
      id: i.id,
      title: i.title,
      platforms: (stillListedPlatformsByItem.get(i.id) || []).filter((p) => isRetryEligible(i.id, p)),
    }))
    .filter((i) => i.platforms.length > 0);
  // S1179: still surfaced here for organizer visibility once an item crosses the cap, even
  // during the cooldown windows where it's also (periodically) back in `items` above -- this
  // is now a "heads up, this one's been stubborn" signal rather than "we've given up on this
  // forever". background.js's notifyManualReviewIfNew already dedupes notifications per id, so
  // an item cycling through cooldown retries doesn't re-spam the organizer.
  // 2026-09-04: an item needs manual review when ANY of its still-listed platforms has burned the
  // cap on its own. Response fields id/title/skipCount/lastErrorMessage are UNCHANGED -- they are
  // exactly what background.js's notifyManualReviewIfNew consumes -- and skipCount/lastErrorMessage
  // now report the worst-affected platform (highest skip count) for that item. `platforms` is
  // purely additive: the names of the platforms that are actually stuck.
  const needsManualReview: Array<{
    id: string;
    title: string;
    skipCount: number;
    lastErrorMessage: string | null;
    platforms: string[];
  }> = [];
  for (const i of stillPending) {
    const stuck = (stillListedPlatformsByItem.get(i.id) || [])
      .map((p) => ({ platform: p, skipCount: skipCountByItemPlatform.get(i.id + ':' + p) || 0 }))
      .filter((p) => p.skipCount >= MAX_REMOVAL_SKIP_ATTEMPTS)
      .sort((a, b) => b.skipCount - a.skipCount);
    if (!stuck.length) continue;
    needsManualReview.push({
      id: i.id,
      title: i.title,
      skipCount: stuck[0].skipCount,
      lastErrorMessage: lastSkipReasonByItemPlatform.get(i.id + ':' + stuck[0].platform) || null,
      platforms: stuck.map((p) => p.platform),
    });
  }

  res.json({ items, needsManualReview });
};

// GET /api/extension/pending-updates — ADR-086: items whose FindA.Sale price has drifted from
// the price last successfully synced to their live Facebook post. Same "poll, not push" pattern
// as getPendingRemovals (Facebook has no API for a live edit either) -- pure read composed from
// Item.price / Item.marketplaceListedPrice / MarketplaceListingJob, no queued job created.
// FAIL-CLOSED per legal condition 2 (non-negotiable): any item without a confirmed
// remoteListingId is skipped entirely, never returned here -- there is no acceptable fuzzy
// fallback for a price EDIT the way removal has a title-match fallback (editing the wrong live
// listing shows a real buyer the wrong price with no undo, a strictly worse failure mode).
export const getPendingUpdates = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  // Mirrors getExtensionItems' base item-list filter (status AVAILABLE, excluding DONT_LIST via
  // the same NULL-safe OR -- see the 2026-07-16 fix comment above) so a sold/removed/do-not-list
  // item can never surface here.
  const items = await prisma.item.findMany({
    where: {
      // 2026-07-26 (S1169): sale.deletedAt filter -- see matching comment in getExtensionItems.
      sale: { organizerId: organizer.id, deletedAt: null },
      status: 'AVAILABLE',
      OR: [
        { ebayShippingOverride: null },
        { ebayShippingOverride: { not: 'DONT_LIST' } },
      ],
    },
    select: { id: true, title: true, price: true, marketplaceListedPrice: true },
  });
  if (!items.length) { res.json({ items: [] }); return; }

  const itemIds = items.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true, remoteListingId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  const remoteListingIdByItem = new Map<string, string | null>();
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') {
      postedByItem.add(j.itemId);
      // jobs is ordered createdAt desc, so the first POST/POSTED row seen per item is the
      // most recent one -- only set it once so an older job can't overwrite a newer remoteListingId.
      if (!remoteListingIdByItem.has(j.itemId)) remoteListingIdByItem.set(j.itemId, j.remoteListingId);
    }
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
  }

  const pending = items
    .filter((it) => postedByItem.has(it.id) && !removedByItem.has(it.id))
    .filter((it) => it.price != null && Math.round(it.price) !== it.marketplaceListedPrice)
    .map((it) => ({ id: it.id, title: it.title, newPrice: Math.round(it.price as number), remoteListingId: remoteListingIdByItem.get(it.id) || null }))
    // Fail-closed: skip any item without a confirmed remoteListingId (legal condition 2).
    .filter((it) => !!it.remoteListingId);

  res.json({ items: pending });
};

// POST /api/extension/items/:id/price-synced — ADR-086: record that this item's current price
// was successfully pushed to its live Facebook post. Reads the item's price fresh from the DB
// (never trusts a client-supplied value) and does not touch MarketplaceListingJob -- a price
// sync is a recurring "is FB currently out of date" check, not a one-time queued job.
export const markItemPriceSynced = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { price: true } });
  if (!item || item.price == null) { res.status(404).json({ message: 'Item not found' }); return; }

  await prisma.item.update({
    where: { id: itemId },
    data: { marketplaceListedPrice: Math.round(item.price) },
  });
  res.json({ ok: true });
};

// GET /api/extension/pending-sold-checks — items currently AVAILABLE that this extension
// actually posted LIVE to Facebook Marketplace (MarketplaceListingJob action=POST/POSTED,
// not yet action=REMOVE/REMOVED) -- candidates for the content script's reverse-direction
// scan (fas-remove.js): "did one of MY live FB listings quietly flip to Sold on Facebook's
// own UI, with FindA.Sale never told?" Facebook has no webhook/API for this, same "poll a DOM
// signal" gap as pending-removals/pending-updates above.
//
// Deliberately gated on MarketplaceListingJob (the exact postedByItem/removedByItem
// computation getExtensionItems already does for its `marketplaceListed` flag, and the same
// set getPendingRemovals filters `stillPending` against) rather than the passive
// Item.fbExportedAt column. fbExportedAt only means "was included in a CSV/XLSX Marketplace
// export" at some point in the past -- it says nothing about whether a live Facebook listing
// currently exists to go check, and using it here would hand the content script titles to
// search for that may never have actually been posted (or were posted then removed), wasting
// scan cycles and risking a coincidental title collision on an unrelated FB listing. Only an
// item this extension itself confirmed POSTED (and not yet REMOVED) can plausibly show up as
// a Sold card on facebook.com/marketplace/you/selling.
export const getPendingSoldChecks = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const availableItems = await prisma.item.findMany({
    where: { sale: { organizerId: organizer.id, deletedAt: null }, status: 'AVAILABLE' },
    select: { id: true, title: true },
  });
  if (!availableItems.length) { res.json({ items: [] }); return; }

  const itemIds = availableItems.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true },
  });
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') postedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
  }

  const items = availableItems
    .filter((i) => postedByItem.has(i.id) && !removedByItem.has(i.id))
    .map((i) => ({ id: i.id, title: i.title }));

  res.json({ items });
};

// GET /api/extension/pending-renewals -- ADR-100 (2026-08-06/07): items this extension posted
// to Facebook or Craigslist (MarketplaceListingJob action=POST/POSTED, not yet
// action=REMOVE/REMOVED) whose per-platform renewDueAt has arrived (within
// RENEWAL_NOTIFY_LEAD_TIME_DAYS). Same postedByItem/removedByItem set-difference shape as
// getPendingSoldChecks above -- deliberately not a fourth divergent computation of "is this
// item's listing still live." saleId is included (unlike getPendingSoldChecks) so the
// extension's renewal notification can deep-link straight to the item's sale page.
//
// Consumed two ways by background.js's renewal alarm (extension/background.js):
// - fasAutoRenew toggle OFF (default): notify-only, organizer renews manually (ADR-100 §5).
// - fasAutoRenew toggle ON: background.js separately calls GET /extension/items for full
//   item fields (title/price/description/photos/etc.) and cross-references by id here to
//   build a fresh posting queue, reusing fas-content.js/fas-craigslist.js's EXISTING posting
//   flow rather than duplicating it (ADR-100 §8 amendment).
export const getPendingRenewals = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  // category/ebayCategoryId added for the Facebook Commerce Policy gate below (coins/currency)
  // -- defense against a LEGACY/grandfathered item that already has a FACEBOOK POST/POSTED
  // MarketplaceListingJob row from before this gate existed (markItemListed now refuses to
  // create new ones, but pre-existing rows are untouched data, not retroactively cleaned up
  // here). Without this filter, auto-renew would keep refreshing/reposting an already-live
  // Facebook coin listing forever.
  const availableItems = await prisma.item.findMany({
    where: { sale: { organizerId: organizer.id, deletedAt: null }, status: 'AVAILABLE' },
    select: { id: true, title: true, saleId: true, category: true, ebayCategoryId: true },
  });
  if (!availableItems.length) { res.json({ items: [] }); return; }
  const availableItemById = new Map(availableItems.map((i) => [i.id, i]));

  const itemIds = availableItems.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true, platform: true, renewDueAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  // jobs is ordered createdAt desc, so the first POST/POSTED row seen per item is the most
  // recent one -- only set it once so an older renewal job can't overwrite a newer renewDueAt
  // (same "first-seen wins under desc order" idiom getPendingUpdates uses for remoteListingId).
  const renewalInfoByItem = new Map<string, { platform: MarketplaceRenewalPlatform; renewDueAt: Date | null }>();
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') {
      postedByItem.add(j.itemId);
      if (!renewalInfoByItem.has(j.itemId)) {
        renewalInfoByItem.set(j.itemId, { platform: j.platform as MarketplaceRenewalPlatform, renewDueAt: j.renewDueAt });
      }
    }
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
  }

  const dueThreshold = Date.now() + RENEWAL_NOTIFY_LEAD_TIME_DAYS * 24 * 60 * 60 * 1000;
  const items = availableItems
    .filter((i) => postedByItem.has(i.id) && !removedByItem.has(i.id))
    .map((i) => ({ id: i.id, title: i.title, saleId: i.saleId, ...renewalInfoByItem.get(i.id)! }))
    // renewDueAt is null for every pre-ADR-100 row (no backfill, ADR-100 §7 Q4) -- such items
    // simply never surface a renewal nudge until a fresh POST row is written for them.
    .filter((i) => i.renewDueAt != null && i.renewDueAt.getTime() <= dueThreshold)
    // Facebook Commerce Policy gate (coins/currency) -- see comment on availableItems' select
    // above. Only excludes platform === 'FACEBOOK'; a coin/currency item due for renewal on
    // Craigslist or Gumtree AU is unaffected.
    .filter((i) => {
      if (i.platform !== 'FACEBOOK') return true;
      const full = availableItemById.get(i.id);
      return !full || !isFacebookRestrictedItem(full.category, full.ebayCategoryId, full.title);
    })
    .map((i) => ({ id: i.id, title: i.title, saleId: i.saleId, platform: i.platform, renewDueAt: (i.renewDueAt as Date).toISOString() }));

  res.json({ items });
};

// POST /api/extension/items/:id/sold-on-facebook — the reverse-direction cascade: the content
// script's new sold-detection scan (fas-remove.js, SEL.allSoldListingCards()) confidently
// matched this item's title against a card on facebook.com/marketplace/you/selling that
// Facebook's OWN UI already shows as Sold ("Mark as available"/"Relist this item"), meaning
// the item sold NATIVELY on Facebook -- something FindA.Sale had no other way to learn.
//
// IDOR: ownership verified via assertItemOwned before any mutation, same pattern as
// markItemRemoved/markItemListed above -- this is a real, unauthenticated-adjacent,
// money-relevant mutation reachable from an extension endpoint; ownership is mandatory here,
// not optional.
//
// Idempotent by design: the content script's scan re-runs on the same ~20-min alarm cadence
// and can report the SAME item sold-on-Facebook more than once before this endpoint's write is
// reflected back out of getPendingSoldChecks (that list only re-queries AVAILABLE items, so a
// repeat report can arrive for an item this endpoint already flipped to SOLD moments earlier).
// commitItemSale's own atomic guard (ADR-098) is what makes a repeat call safe: it can't match
// `status IN ('AVAILABLE')` a second time and throws ItemAlreadyCommittedError, which this
// handler treats as a successful no-op -- never an error -- exactly like a second call for an
// item already sold via any other channel (POS, checkout, eBay sync, etc.).
//
// Cascade mirrors itemController.ts's updateItem SOLD-transition block (same ADR-098 call
// site, same commitItemSale helper) with ONE deliberate omission: notifyFacebookExportedItemSold
// is NEVER called here. That hook's entire job is telling the extension to go remove the
// matching Facebook listing -- meaningless in this direction, since the sale happened ON
// Facebook; there is nothing left to remove there, it is already gone/Sold. eBay + Shopify
// withdrawal fire exactly as they do for every other SOLD-transition call site (fire-and-forget,
// same `.catch(err => console.warn(...))` style, never blocking the response).
export const markItemSoldOnFacebook = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  try {
    await commitItemSale(itemId, 'SOLD', ['AVAILABLE']);
  } catch (err: any) {
    if (err instanceof ItemAlreadyCommittedError) {
      // Already SOLD (this call, a prior poll cycle, or any other channel) -- idempotent
      // success, never an error. See idempotency note above.
      res.json({ ok: true });
      return;
    }
    throw err;
  }

  // Sold-channel observability (2026-08-05): tag this item as sold via the FB-native
  // detection cascade. Deliberately a separate follow-up write, NOT folded into
  // commitItemSale() -- that helper is the single ADR-098 atomic status-transition guard
  // shared by other call sites (itemController.ts, posController.ts) and is documented as
  // the ONLY function that should write a sale-completing status; widening its signature
  // for one call site's metadata field is out of scope here. This line only runs on a
  // genuine fresh transition (the ItemAlreadyCommittedError branch above already returned),
  // so a repeat/idempotent report never re-stamps the field.
  await prisma.item.update({ where: { id: itemId }, data: { lastSoldVia: 'FB_NATIVE' } });

  endEbayListingIfExists(itemId).catch((err: any) =>
    console.warn(`[eBay] withdraw-on-SOLD (FB-native) failed for item ${itemId}:`, err.message)
  );
  markShopifyItemSold(itemId).catch((err: any) =>
    console.warn(`[Shopify] mark-sold-on-SOLD (FB-native) failed for item ${itemId}:`, err.message)
  );
  withdrawDiscogsListingIfExists(itemId).catch((err: any) =>
    console.warn(`[Discogs] withdraw-on-SOLD (FB-native) failed for item ${itemId}:`, err.message)
  );

  res.json({ ok: true });
};

// POST /api/extension/items/:id/mark-posted -- manual counterpart to markItemListed above.
// Covers the case where the organizer posted this item to Facebook Marketplace by hand
// (outside the extension's automated flow -- e.g. the automation stalled, or they simply
// did it themselves on facebook.com directly), so FindA.Sale has no MarketplaceListingJob
// row for it at all. Without a real POST/POSTED row: (1) the extension popup keeps showing
// the item as "available to push" forever even though it's genuinely already live, and
// (2) getPendingSoldChecks above filters its candidate pool to
// `postedByItem.has(i.id) && !removedByItem.has(i.id)` -- i.e. ONLY items with a real
// POST/POSTED job row are ever checked by the reverse sold-detection scan -- so the item
// would also never be picked up if it later sells on Facebook. A separate boolean flag on
// Item would silently satisfy neither of those; this MUST write a real MarketplaceListingJob
// row shaped exactly like a genuine automated post (same fields, same platform/action/status,
// same renewDueAt convention) or the item drops out of sold-detection permanently.
//
// IDOR: ownership verified via assertItemOwned before any mutation, same pattern as
// markItemListed/markItemRemoved/markItemSoldOnFacebook above.
//
// Facebook Commerce Policy gate (coins/currency AND weapons/ammunition/explosives as of
// S-FB-WEAPON-COIN-FIX-2026-09-03) -- reuses isFacebookRestrictedItem/facebookRestrictionReason,
// the same reject markItemListed applies for platform === 'FACEBOOK'. Deliberately still
// Facebook-only, not generalized to the other 6 platforms -- see markItemListed's own comment
// (S-CROSS-MARKETPLACE-AUDIT-2026-09-03) for why: this is post-hoc bookkeeping, not a real
// pre-submit gate for any platform, so generalizing it would only risk breaking the "Show all
// items" override with no real preventive benefit.
//
// Idempotent: mirrors the "most-recent-row-per-item+platform wins" idiom used by
// getExtensionItems' latestByItemPlatform / getPendingRenewals' renewalInfoByItem (first-seen
// under `orderBy: { createdAt: 'desc' }`) -- if the latest job for this item+platform is
// already POST/POSTED, this is a no-op success rather than inserting a duplicate row.
//
// GENERALIZED 2026-08-30 (S-EXT-MARK-POSTED-PARITY, Patrick-directed -- "make it so the others
// are similar to facebook with the already posted buttons"): this used to be hardcoded to
// platform: 'FACEBOOK' throughout, exactly mirroring markItemListed's pre-2026-08-19 bug (see
// MarketplaceListingPlatform's comment above) -- a Poshmark/Mercari/Vinted/etc. "Already
// posted?" click would have written a FACEBOOK row instead of that platform's own row, leaving
// marketplaceListedPoshmark (etc.) stuck false forever. Now follows markItemListed's exact
// established pattern: platform from req.body, validated against VALID_LISTING_PLATFORMS,
// Facebook Commerce Policy gate scoped to platform === 'FACEBOOK' only (see markItemListed's own
// comment for why this is deliberately NOT extended to the other 6 platforms), and renewDueAt
// gated by isRenewalEligiblePlatform instead of unconditionally reading
// RENEWAL_LAPSE_WINDOW_DAYS.FACEBOOK (which has no entry for Grailed/Poshmark/Mercari/Vinted).
export const markItemAlreadyPostedManually = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const platformRaw = typeof req.body?.platform === 'string' ? req.body.platform.toUpperCase() : 'FACEBOOK';
  const platform: MarketplaceListingPlatform = (VALID_LISTING_PLATFORMS as string[]).includes(platformRaw)
    ? (platformRaw as MarketplaceListingPlatform)
    : 'FACEBOOK';

  if (platform === 'FACEBOOK') {
    const fbItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { category: true, ebayCategoryId: true, title: true },
    });
    // See markItemListed's identical gate above for why this reads the registry's own reason
    // string now instead of a hardcoded coin/currency-only message (S-FB-WEAPON-COIN-FIX-2026-09-03).
    if (fbItem) {
      const reason = facebookRestrictionReason(fbItem.category, fbItem.ebayCategoryId, fbItem.title);
      if (reason) {
        res.status(400).json({ message: reason });
        return;
      }
    }
  }

  const latestJob = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (latestJob && latestJob.action === 'POST' && latestJob.status === 'POSTED') {
    // Already posted (this call, a prior manual mark, or the automated flow) -- idempotent
    // success, never a duplicate row.
    res.json({ ok: true, status: 'POSTED' });
    return;
  }

  const renewDueAt = isRenewalEligiblePlatform(platform)
    ? new Date(Date.now() + RENEWAL_LAPSE_WINDOW_DAYS[platform] * 24 * 60 * 60 * 1000)
    : null;
  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'POST', status: 'POSTED', platform, renewDueAt },
  });
  res.json({ ok: true, status: 'POSTED' });
};

// GET /api/extension/sync-health -- organizer-facing summary of Marketplace Autofill
// activity, powering the "Marketplace Sync Health" card on marketplace-extension.tsx
// (the organizer's install page, NOT the extension itself -- this is a normal
// cookie-authenticated web request, unlike the Bearer-only endpoints above).
// Pure read, no writes, no new schema. Reuses the SAME organizer-scoping pattern as
// getExtensionItems/getPendingRemovals/getPendingSoldChecks above (sale: { organizerId,
// deletedAt: null }) and the SAME MAX_REMOVAL_SKIP_ATTEMPTS dead-letter threshold
// getPendingRemovals uses (~L358 above) -- deliberately not a fourth divergent
// implementation of the posted/removed-set computation.
export const getSyncHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const sales = await prisma.sale.findMany({
    where: { organizerId: organizer.id, deletedAt: null },
    select: { id: true, title: true },
  });
  const saleTitleById = new Map(sales.map((s) => [s.id, s.title]));

  // --- lastSyncActivity + activePostedCount ---
  // Scoped to ALL items under this organizer's non-deleted sales, regardless of
  // Item.status -- a POST/REMOVE job's history is still real "last activity" even for
  // an item that has since sold or been archived, unlike the AVAILABLE-only scoping
  // getExtensionItems/getPendingUpdates use for their listable-item sets above.
  const allItems = await prisma.item.findMany({
    where: { sale: { organizerId: organizer.id, deletedAt: null } },
    select: { id: true },
  });
  const allItemIds = allItems.map((i) => i.id);
  const activityJobs = allItemIds.length
    ? await prisma.marketplaceListingJob.findMany({
        where: { itemId: { in: allItemIds } },
        select: { itemId: true, action: true, status: true, createdAt: true },
      })
    : [];
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  let lastPostAt: Date | null = null;
  let lastRemoveAt: Date | null = null;
  for (const j of activityJobs) {
    if (j.action === 'POST' && j.status === 'POSTED') {
      postedByItem.add(j.itemId);
      if (!lastPostAt || j.createdAt > lastPostAt) lastPostAt = j.createdAt;
    }
    if (j.action === 'REMOVE' && j.status === 'REMOVED') {
      removedByItem.add(j.itemId);
      if (!lastRemoveAt || j.createdAt > lastRemoveAt) lastRemoveAt = j.createdAt;
    }
  }
  const activePostedCount = allItemIds.filter((id) => postedByItem.has(id) && !removedByItem.has(id)).length;

  // --- manualReviewBacklog ---
  // Mirrors getPendingRemovals' needsManualReview computation exactly (same
  // MAX_REMOVAL_SKIP_ATTEMPTS threshold declared above, same soldItems/jobs shape),
  // with a saleTitle join and lastAttemptAt surfaced for display on this card.
  const soldItems = await prisma.item.findMany({
    where: { sale: { organizerId: organizer.id, deletedAt: null }, status: 'SOLD' },
    select: { id: true, title: true, saleId: true },
  });
  const soldItemIds = soldItems.map((i) => i.id);
  const removalJobs = soldItemIds.length
    ? await prisma.marketplaceListingJob.findMany({
        where: { itemId: { in: soldItemIds } },
        select: { itemId: true, action: true, status: true, lastErrorMessage: true, lastAttemptAt: true, platform: true, createdAt: true },
      })
    : [];
  // BUG FIX 2026-09-04 (S-EXT-SYNCHEALTH-CROSS-PLATFORM-MASKING): everything below used to be a
  // byte-identical copy of getPendingRemovals' pre-fix ITEM-level logic. When that endpoint was
  // made per-platform earlier the same day (S-EXT-GETPENDINGREMOVALS-CROSS-PLATFORM-MASKING) this
  // copy was left behind, so the organizer's status card and the removal engine could disagree
  // outright -- the card saying "nothing needs review" while a platform was in fact dead-lettered,
  // or the reverse. Now mirrors getPendingRemovals exactly: the LATEST job row per
  // `${itemId}:${platform}` decides whether that platform's listing is still live (POST/POSTED),
  // the skip counters are keyed per item+platform, and an item enters the backlog when ANY of its
  // still-listed platforms has burned MAX_REMOVAL_SKIP_ATTEMPTS on its own -- reporting the
  // worst-affected platform's skipCount/lastErrorMessage/lastAttemptAt.
  // DELIBERATE MIRROR of getPendingRemovals above: if that computation changes, change this one in
  // the same pass, or the card and the engine drift apart again exactly as they just did.
  // Every pre-existing response field (itemId/title/saleTitle/skipCount/lastErrorMessage/
  // lastAttemptAt) is unchanged for MarketplaceSyncHealthCard.tsx; `platforms` is purely additive.
  const latestByRemovalItemPlatform = new Map<string, { action: string; status: string; createdAt: Date }>();
  for (const j of removalJobs) {
    const key = j.itemId + ':' + j.platform;
    const existing = latestByRemovalItemPlatform.get(key);
    if (!existing || j.createdAt > existing.createdAt) {
      latestByRemovalItemPlatform.set(key, { action: j.action, status: j.status, createdAt: j.createdAt });
    }
  }
  const stillListedPlatformsByRemovalItem = new Map<string, string[]>();
  for (const [key, latest] of latestByRemovalItemPlatform) {
    if (latest.action !== 'POST' || latest.status !== 'POSTED') continue;
    // Same split convention as getPendingRemovals -- item ids are cuids and contain no colon.
    const sepIdx = key.lastIndexOf(':');
    const rowItemId = key.slice(0, sepIdx);
    const rowPlatform = key.slice(sepIdx + 1);
    const arr = stillListedPlatformsByRemovalItem.get(rowItemId) || [];
    arr.push(rowPlatform);
    stillListedPlatformsByRemovalItem.set(rowItemId, arr);
  }
  const skipCountByItemPlatform = new Map<string, number>();
  const lastSkipReasonByItemPlatform = new Map<string, string | null>();
  const lastSkipAtByItemPlatform = new Map<string, Date>();
  for (const j of removalJobs) {
    if (j.action === 'REMOVE' && j.status === 'SKIPPED') {
      const skipKey = j.itemId + ':' + j.platform;
      skipCountByItemPlatform.set(skipKey, (skipCountByItemPlatform.get(skipKey) || 0) + 1);
      lastSkipReasonByItemPlatform.set(skipKey, j.lastErrorMessage ?? null);
      const attemptedAt = j.lastAttemptAt;
      if (attemptedAt && (!lastSkipAtByItemPlatform.has(skipKey) || attemptedAt > lastSkipAtByItemPlatform.get(skipKey)!)) {
        lastSkipAtByItemPlatform.set(skipKey, attemptedAt);
      }
    }
  }
  const stillPendingRemoval = soldItems.filter((i) => (stillListedPlatformsByRemovalItem.get(i.id) || []).length > 0);
  const manualReviewBacklog: Array<{
    itemId: string;
    title: string;
    saleTitle: string;
    skipCount: number;
    lastErrorMessage: string | null;
    lastAttemptAt: string | null;
    platforms: string[];
  }> = [];
  for (const i of stillPendingRemoval) {
    const stuck = (stillListedPlatformsByRemovalItem.get(i.id) || [])
      .map((p) => ({ platform: p, skipCount: skipCountByItemPlatform.get(i.id + ':' + p) || 0 }))
      .filter((p) => p.skipCount >= MAX_REMOVAL_SKIP_ATTEMPTS)
      .sort((a, b) => b.skipCount - a.skipCount);
    if (!stuck.length) continue;
    const worstKey = i.id + ':' + stuck[0].platform;
    manualReviewBacklog.push({
      itemId: i.id,
      title: i.title,
      saleTitle: saleTitleById.get(i.saleId || '') || 'Sale',
      skipCount: stuck[0].skipCount,
      lastErrorMessage: lastSkipReasonByItemPlatform.get(worstKey) || null,
      lastAttemptAt: lastSkipAtByItemPlatform.get(worstKey)?.toISOString() || null,
      platforms: stuck.map((p) => p.platform),
    });
  }

  // --- recentFbNativeSold ---
  // Items that sold NATIVELY on Facebook via the reverse-direction cascade
  // (markItemSoldOnFacebook above sets lastSoldVia='FB_NATIVE'). Capped at the last 30
  // days / 20 rows -- this card is a recent-activity glance, not a full history.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fbNativeSoldItems = await prisma.item.findMany({
    where: {
      sale: { organizerId: organizer.id, deletedAt: null },
      status: 'SOLD',
      lastSoldVia: 'FB_NATIVE',
      updatedAt: { gte: thirtyDaysAgo },
    },
    select: { id: true, title: true, saleId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const recentFbNativeSold = fbNativeSoldItems.map((i) => ({
    itemId: i.id,
    title: i.title,
    saleTitle: saleTitleById.get(i.saleId || '') || 'Sale',
    soldAt: i.updatedAt.toISOString(),
  }));

  res.json({
    lastSyncActivity: {
      lastPostAt: lastPostAt ? lastPostAt.toISOString() : null,
      lastRemoveAt: lastRemoveAt ? lastRemoveAt.toISOString() : null,
      activePostedCount,
    },
    manualReviewBacklog,
    recentFbNativeSold,
  });
};

// POST /api/extension/items/:id/message-autosend-decision — Feature #602 (2026-08-05):
// AI Message-Reply Autosend, Price + Availability. The content script calls this with
// the latest buyer message text for a Facebook Messenger thread it has matched to this
// item (title match, same idiom fas-remove.js's sold-detection scan already uses); the
// response tells it whether to autosend a reply (and what text) or leave it draft-only.
//
// IDOR: ownership verified via assertItemOwned before any read/decision, same pattern as
// every other mutation-adjacent endpoint in this file. The extension is a client and is
// never trusted for the autosendPriceAvailabilityEnabled gate or the threshold math --
// both are re-derived server-side inside decideMessageAutosend from the organizer/item
// rows this handler loads itself.
//
// Security self-check (rule 5 of this feature's dispatch spec): parsing is a plain
// regex extraction of a single unambiguous "$X" figure, never an LLM call -- see
// messageAutosendService.ts's file-level comment for the full reasoning. A buyer can
// only trigger an unintended AUTOSENT_ACCEPT by typing a real dollar figure at or above
// the organizer's OWN configured threshold -- the same trust boundary eBay's built-in
// Best Offer auto-accept already has today, not a new exploit surface.
export const decideMessageAutosendForItem = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const messageText = typeof req.body?.messageText === 'string' ? req.body.messageText : '';
  if (!messageText.trim()) { res.status(400).json({ message: 'messageText is required' }); return; }

  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: {
      id: true,
      autosendPriceAvailabilityEnabled: true,
      defaultBestOfferAcceptPct: true,
      defaultBestOfferDeclinePct: true,
    },
  });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const item = await prisma.item.findFirst({
    where: { id: itemId, sale: { organizerId: organizer.id } },
    select: { id: true, price: true, bestOfferAutoAcceptAmt: true, bestOfferMinimumAmt: true },
  });
  if (!item) { res.status(404).json({ message: 'Item not found' }); return; }

  const result = await decideMessageAutosend({
    organizerId: organizer.id,
    itemId: item.id,
    messageText,
    organizer: {
      autosendPriceAvailabilityEnabled: organizer.autosendPriceAvailabilityEnabled,
      defaultBestOfferAcceptPct: organizer.defaultBestOfferAcceptPct,
      defaultBestOfferDeclinePct: organizer.defaultBestOfferDeclinePct,
    },
    item: {
      price: item.price,
      bestOfferAutoAcceptAmt: item.bestOfferAutoAcceptAmt,
      bestOfferMinimumAmt: item.bestOfferMinimumAmt,
    },
  });

  res.json(result);
};

// GET /extension/autolist-queue — Approve-to-Autolist Fan-Out, content-script tier
// (ADR-DRAFT-approve-to-autolist-fanout-2026-09-16.md, "Architect Handoff — 2026-09-17",
// section D). Covers Craigslist, Facebook, Gumtree AU, Grailed, Poshmark, Mercari --
// Discogs/Reverb are the API tier and go through autoFanoutDispatcher.ts instead, not this
// endpoint. Stateless and safe to poll repeatedly: no MarketplaceListingJob rows are written
// here, no claim/lock semantics -- background.js's alarm just merges whatever comes back into
// its existing chrome.storage.local queues (see the ADR's section E).
//
// Ownership: mirrors assertItemOwned/getExtensionItems exactly -- organizer is resolved from
// req.user.id server-side; every item query is scoped to sale.organizerId = organizer.id.
// Never accepts a client-supplied organizer/account id.
type AutoListPlatform = 'CRAIGSLIST' | 'FACEBOOK' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI';

export const getAutolistQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: {
      id: true,
      subscriptionTier: true,
      removeWatermarkEnabled: true,
      craigslistAutoListEnabled: true,
      facebookAutoListEnabled: true,
      gumtreeAuAutoListEnabled: true,
      grailedAutoListEnabled: true,
      poshmarkAutoListEnabled: true,
      mercariAutoListEnabled: true,
    },
  });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const emptyQueues: Record<AutoListPlatform, unknown[]> = {
    CRAIGSLIST: [], FACEBOOK: [], GUMTREE_AU: [], GRAILED: [], POSHMARK: [], MERCARI: [],
  };

  const enabledPlatforms: AutoListPlatform[] = [];
  if (organizer.craigslistAutoListEnabled === true) enabledPlatforms.push('CRAIGSLIST');
  if (organizer.facebookAutoListEnabled === true) enabledPlatforms.push('FACEBOOK');
  if (organizer.gumtreeAuAutoListEnabled === true) enabledPlatforms.push('GUMTREE_AU');
  if (organizer.grailedAutoListEnabled === true) enabledPlatforms.push('GRAILED');
  if (organizer.poshmarkAutoListEnabled === true) enabledPlatforms.push('POSHMARK');
  if (organizer.mercariAutoListEnabled === true) enabledPlatforms.push('MERCARI');

  if (enabledPlatforms.length === 0) {
    res.json({ ok: true, queues: emptyQueues });
    return;
  }

  // Candidate items: approved/published only (draftStatus: 'PUBLISHED' per the handoff),
  // still AVAILABLE (never auto-fan-out something already sold/reserved between polls -- same
  // status filter getExtensionItems' own base query uses), owned by this organizer, sale not
  // soft-deleted, and not opted out of cross-listing entirely (ebayShippingOverride !=
  // 'DONT_LIST' -- same ADR-084 amendment getExtensionItems already applies at the query level).
  const applyWatermark = !canRemoveWatermark(organizer);

  const items = await prisma.item.findMany({
    where: {
      sale: { organizerId: organizer.id, deletedAt: null },
      draftStatus: 'PUBLISHED',
      status: 'AVAILABLE',
      OR: [
        { ebayShippingOverride: null },
        { ebayShippingOverride: { not: 'DONT_LIST' } },
      ],
    },
    take: 2000,
    select: {
      id: true, saleId: true, title: true, description: true, price: true,
      category: true, ebayCategoryName: true, ebayCategoryId: true, condition: true,
      photoUrls: true, qrEmbedEnabled: true, qrAssetReady: true,
      brand: true, size: true, color: true, material: true, isbn: true,
      packageWeightOz: true, aiPackageWeightOz: true,
      packageLengthIn: true, packageWidthIn: true, packageHeightIn: true,
      packageConfirmedByOrganizer: true, packageEstimateSource: true,
      ebayShippingOverride: true, crosslisterFreeShipping: true,
      allowBestOffer: true, bestOfferMinimumAmt: true, bestOfferAutoAcceptAmt: true,
    },
  });

  if (items.length === 0) {
    res.json({ ok: true, queues: emptyQueues });
    return;
  }

  const saleIds = Array.from(new Set(items.map((i) => i.saleId).filter((id): id is string => !!id)));
  const sales = saleIds.length
    ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, title: true, city: true, zip: true, address: true } })
    : [];
  const saleTitleById = new Map(sales.map((s) => [s.id, s.title]));
  const saleLocationById = new Map(sales.map((s) => [s.id, { city: s.city, zip: s.zip, address: s.address }]));

  // Already-listed dedupe -- reuse the exact same "latest MarketplaceListingJob row per
  // item+platform wins" signal getExtensionItems computes for its marketplaceListedX booleans
  // (see that function's own 2026-08-15 "Silent Service" comment for why time-ordering, not just
  // row existence, matters), rather than reinventing it. Once markItemListed (or background.js's
  // own post-success confirmation, once Track B wires it up) writes a POST/POSTED row for an
  // item+platform, this dedupe stops it from reappearing on the next poll.
  const itemIds = items.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true, platform: true, createdAt: true },
  });
  const latestByItemPlatform = new Map<string, { action: string; status: string; createdAt: Date }>();
  for (const j of jobs) {
    const key = `${j.itemId}:${j.platform}`;
    const existing = latestByItemPlatform.get(key);
    if (!existing || j.createdAt > existing.createdAt) {
      latestByItemPlatform.set(key, { action: j.action, status: j.status, createdAt: j.createdAt });
    }
  }
  const isAlreadyListed = (itemId: string, platform: AutoListPlatform): boolean => {
    const latest = latestByItemPlatform.get(`${itemId}:${platform}`);
    return !!latest && latest.action === 'POST' && latest.status === 'POSTED';
  };

  // Same package-weight/dimension trust gate getExtensionItems applies (2026-09-14 fix) --
  // never surface an unconfirmed AI/SEED package estimate to a content script as if it were
  // real data. Kept as an independent copy here (not cross-imported), same posture the
  // resolveOwnedOrganizerAndItem helpers in discogsMarketplaceController.ts/reverbMarketplaceController.ts
  // already take for their own small duplicated helpers.
  const UNTRUSTED_PACKAGE_SOURCES = ['SEED', 'AI'];
  const hasTrustedPackage = (it: { packageEstimateSource: string | null; packageConfirmedByOrganizer: boolean | null }) =>
    it.packageConfirmedByOrganizer === true ||
    (it.packageEstimateSource != null && !UNTRUSTED_PACKAGE_SOURCES.includes(it.packageEstimateSource));

  const shapeItem = (it: (typeof items)[number]) => ({
    id: it.id,
    saleId: it.saleId,
    saleTitle: saleTitleById.get(it.saleId || '') || 'Sale',
    title: it.title,
    price: it.price != null ? Number(it.price.toFixed(2)) : null,
    condition: toFacebookCondition(it.condition),
    description: buildDescription(it.description, it.saleId),
    category: it.ebayCategoryName || it.category || null,
    categoryBreadcrumb: it.category || null,
    photoUrls: applyWatermark
      ? (it.photoUrls || []).map((u) => getWatermarkedUrlWithQR(u, it.id, it.qrEmbedEnabled !== false, it.qrAssetReady))
      : (it.photoUrls || []),
    packageWeightOz: hasTrustedPackage(it) ? it.packageWeightOz : null,
    aiPackageWeightOz: hasTrustedPackage(it) ? it.aiPackageWeightOz : null,
    packageLengthIn: hasTrustedPackage(it) && it.packageLengthIn != null ? Number(it.packageLengthIn) : null,
    packageWidthIn: hasTrustedPackage(it) && it.packageWidthIn != null ? Number(it.packageWidthIn) : null,
    packageHeightIn: hasTrustedPackage(it) && it.packageHeightIn != null ? Number(it.packageHeightIn) : null,
    brand: it.brand,
    size: it.size,
    color: it.color,
    material: it.material,
    isbn: it.isbn,
    shippingOverride:
      it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY' || it.packageWeightOz == null
        ? 'LOCAL_PICKUP_ONLY'
        : it.ebayShippingOverride,
    crosslisterFreeShipping: it.crosslisterFreeShipping === true,
    allowBestOffer: it.allowBestOffer,
    bestOfferMinimumAmt: it.bestOfferMinimumAmt != null ? Number(it.bestOfferMinimumAmt) : null,
    bestOfferAutoAcceptAmt: it.bestOfferAutoAcceptAmt != null ? Number(it.bestOfferAutoAcceptAmt) : null,
    saleCity: saleLocationById.get(it.saleId || '')?.city || null,
    saleZip: saleLocationById.get(it.saleId || '')?.zip || null,
    saleAddress: saleLocationById.get(it.saleId || '')?.address || null,
  });

  // Generate + store each item's QR overlay asset on Cloudinary once (fire-and-forget, never
  // awaited/blocking) so subsequent calls can use the short public_id instead of re-deriving
  // the external QR-service URL on every photo. Iterates `items` directly (not `shapeItem`,
  // which runs once per item per enabled platform below) so it fires exactly once per item.
  for (const it of items) {
    if (it.qrAssetReady === false) {
      ensureQrCodeAsset(it.id).catch(() => {});
    }
  }

  const queues: Record<AutoListPlatform, unknown[]> = {
    CRAIGSLIST: [], FACEBOOK: [], GUMTREE_AU: [], GRAILED: [], POSHMARK: [], MERCARI: [],
  };
  for (const it of items) {
    const eligibilityCategory = it.ebayCategoryName || it.category;
    for (const platform of enabledPlatforms) {
      if (isAlreadyListed(it.id, platform)) continue;
      // TOCTOU-safe: re-run fresh on every call, never cached -- a category/title edit between
      // polls is picked up automatically (per the handoff's section D).
      const eligibility = checkEligibility(platform, { category: eligibilityCategory, ebayCategoryId: it.ebayCategoryId, title: it.title });
      if (!eligibility.eligible) continue;
      queues[platform].push(shapeItem(it));
    }
  }

  res.json({ ok: true, queues });
};

// FACEBOOK excluded -- see getPriceSyncQueue's doc comment for why it already has its own
// dedicated ADR-086 mechanism above and isn't duplicated here.
type PriceSyncPlatform = Exclude<AutoListPlatform, 'FACEBOOK'>;

/**
 * GET /api/extension/price-sync-queue -- ADR-129 (2026-09-19), Patrick: "ebay, facebook, and
 * all other markets need to do things automatically ... no rollbacks -- fix the issues."
 *
 * DETECTS which already-listed items have a local price change (Item.priceUpdatedAt) that
 * hasn't reached a given content-script-tier platform's live listing yet. Deliberately covers
 * only the 5 platforms getPendingUpdates/markItemPriceSynced above does NOT already handle --
 * Facebook already has its own dedicated ADR-086 detector (Item.marketplaceListedPrice, a
 * single-column signal that only ever made sense for one platform). CRAIGSLIST, GUMTREE_AU,
 * GRAILED, POSHMARK, MERCARI have no equivalent at all -- Craigslist/Gumtree AU only get an
 * incidental, DELAYED price refresh as a side effect of their renewal repost cycle
 * (autoRenewDueItems in background.js), not an immediate one, and Grailed/Poshmark/Mercari have
 * no renewal automation either, so a markdown on an item live there could go stale indefinitely
 * with nothing to ever notice. Reuses the exact same "latest MarketplaceListingJob row per
 * item+platform wins" signal getAutolistQueue's isAlreadyListed already computes, generalized
 * via the new priceSyncedAt column (per (item, platform) job row, not a single Item-level
 * scalar, since these 5 platforms need to be tracked independently of each other and of
 * Facebook) -- a platform needs a sync when its latest POST/POSTED row's priceSyncedAt is null
 * or older than the item's priceUpdatedAt.
 *
 * Deliberately does NOT attempt to auto-edit the live listing -- that would mean driving each
 * platform's own "edit my listing" DOM flow (a different, higher-risk flow than the initial-post
 * automation these content scripts already do, and unverified against any live account this
 * session had access to) -- same Phase-A-detection-only posture ADR-086 already established for
 * Facebook, extended here rather than reinvented. background.js's poller merges this into
 * chrome.storage.local and popup.js surfaces it as a plain "N items need a price update on X"
 * notice so the organizer knows exactly what to go fix by hand until a verified Phase B ships.
 */
export const getPriceSyncQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const emptyQueues: Record<PriceSyncPlatform, { id: string; title: string; price: number | null }[]> = {
    CRAIGSLIST: [], GUMTREE_AU: [], GRAILED: [], POSHMARK: [], MERCARI: [],
  };

  // Any item with a pending local price change -- not gated on the organizer's
  // *AutoListEnabled toggles (unlike getAutolistQueue above), because this is about keeping an
  // ALREADY-live listing honest, not about creating a new one the organizer never opted into.
  const items = await prisma.item.findMany({
    where: {
      sale: { organizerId: organizer.id, deletedAt: null },
      status: 'AVAILABLE',
      priceUpdatedAt: { not: null },
    },
    take: 2000,
    select: { id: true, title: true, price: true, priceUpdatedAt: true },
  });

  if (items.length === 0) {
    res.json({ ok: true, queues: emptyQueues });
    return;
  }

  const itemIds = items.map((i) => i.id);
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, action: true, status: true, platform: true, createdAt: true, priceSyncedAt: true },
  });
  const latestByItemPlatform = new Map<string, { action: string; status: string; createdAt: Date; priceSyncedAt: Date | null }>();
  for (const j of jobs) {
    const key = `${j.itemId}:${j.platform}`;
    const existing = latestByItemPlatform.get(key);
    if (!existing || j.createdAt > existing.createdAt) {
      latestByItemPlatform.set(key, { action: j.action, status: j.status, createdAt: j.createdAt, priceSyncedAt: j.priceSyncedAt });
    }
  }

  const PRICE_SYNC_PLATFORMS: PriceSyncPlatform[] = ['CRAIGSLIST', 'GUMTREE_AU', 'GRAILED', 'POSHMARK', 'MERCARI'];
  const queues: Record<PriceSyncPlatform, { id: string; title: string; price: number | null }[]> = {
    CRAIGSLIST: [], GUMTREE_AU: [], GRAILED: [], POSHMARK: [], MERCARI: [],
  };

  for (const it of items) {
    for (const platform of PRICE_SYNC_PLATFORMS) {
      const latest = latestByItemPlatform.get(`${it.id}:${platform}`);
      const isLive = !!latest && latest.action === 'POST' && latest.status === 'POSTED';
      if (!isLive) continue;
      const needsSync = latest!.priceSyncedAt == null || (it.priceUpdatedAt != null && latest!.priceSyncedAt < it.priceUpdatedAt);
      if (!needsSync) continue;
      queues[platform].push({ id: it.id, title: it.title, price: it.price != null ? Number(it.price.toFixed(2)) : null });
    }
  }

  res.json({ ok: true, queues });
};

/**
 * POST /api/extension/items/:id/price-synced-for-platform -- content-script (or, for now, the
 * organizer manually) confirms a SPECIFIC platform's live listing now matches Item.price.
 * Separate route/name from ADR-086's existing markItemPriceSynced (Facebook-only, no platform
 * param, writes Item.marketplaceListedPrice) -- this one requires an explicit platform and
 * writes to MarketplaceListingJob.priceSyncedAt instead, per getPriceSyncQueue's doc comment.
 * Idempotent -- calling this when there's nothing to sync (no live job for that pair) is a 404,
 * not an error to retry around.
 */
const PRICE_SYNC_FOR_PLATFORM_PLATFORMS: PriceSyncPlatform[] = ['CRAIGSLIST', 'GUMTREE_AU', 'GRAILED', 'POSHMARK', 'MERCARI'];

export const markItemPriceSyncedForPlatform = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  // Scoped to this endpoint's own 5 platforms, not the broader VALID_LISTING_PLATFORMS --
  // FACEBOOK has its own dedicated markItemPriceSynced above, and VINTED is excluded from
  // every auto-feature per the standing ToS decision. A FACEBOOK/VINTED value here is a caller
  // bug, not a valid request.
  const platformRaw = typeof req.body?.platform === 'string' ? req.body.platform.toUpperCase() : null;
  if (!platformRaw || !(PRICE_SYNC_FOR_PLATFORM_PLATFORMS as string[]).includes(platformRaw)) {
    res.status(400).json({ message: 'A valid platform (CRAIGSLIST, GUMTREE_AU, GRAILED, POSHMARK, or MERCARI) is required' });
    return;
  }
  const platform = platformRaw as PriceSyncPlatform;

  const latest = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform, action: 'POST', status: 'POSTED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!latest) { res.status(404).json({ message: 'No live listing found for this item on that platform' }); return; }

  await prisma.marketplaceListingJob.update({
    where: { id: latest.id },
    data: { priceSyncedAt: new Date() },
  });
  res.json({ ok: true });
};
