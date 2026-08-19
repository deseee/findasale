import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';
import { applyNeverShippableOverride, computeEffectivePackageWeight, endEbayListingIfExists } from './ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { commitItemSale, ItemAlreadyCommittedError } from '../services/itemSaleGuard';
import { decideMessageAutosend } from '../services/messageAutosendService';
import { checkEligibility } from '../services/marketplaceEligibilityRules';

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

// Facebook Commerce Policy (coins/currency) + the other 4 platforms' category eligibility now
// live in a single shared registry (marketplaceEligibilityRules.ts, S-EXT-BATCH-2026-08-19) --
// this function is kept as a thin wrapper so none of its existing call sites below need to
// change. FACEBOOK-SPECIFIC ONLY -- must never affect eBay, native checkout, Craigslist, or
// Gumtree AU's pushability (those platforms have no rule in the registry -- checkEligibility
// returns eligible:true for any platform with no rule defined).
function isFacebookRestrictedCoinOrCurrencyItem(
  category: string | null | undefined,
  ebayCategoryId: string | null | undefined
): boolean {
  return !checkEligibility('FACEBOOK', { category, ebayCategoryId }).eligible;
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
      category: true, condition: true, photoUrls: true, qrEmbedEnabled: true, createdAt: true,
      // 2026-08-18 (S-CROSSLISTER-ESTATE-VERTICAL-RESEARCH batch 5): brand/size/color/material --
      // fas-poshmark.js/fas-mercari.js/fas-vinted.js/fas-grailed.js already reference
      // item.brand/item.size/item.color/item.material(s), but NONE of the four were ever in
      // this select, so those autofill lines were silent no-ops even for brand (which the
      // organizer-facing edit-item page has captured all along via a separate, unrelated select).
      brand: true, size: true, color: true, material: true,
      packageWeightOz: true, aiPackageWeightOz: true, ebayShippingOverride: true, shippingAvailable: true,
      allowBestOffer: true, bestOfferMinimumAmt: true,
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
    const UNTRUSTED_SOURCES = ['SEED', 'AI'];
    if (
      it.packageWeightOz != null &&
      Number(it.packageWeightOz) > 0 &&
      !UNTRUSTED_SOURCES.includes(it.packageEstimateSource || '')
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
      const isUntrustedSource = UNTRUSTED_SOURCES.includes(it.packageEstimateSource || '');

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
      } else if (resolved && !UNTRUSTED_SOURCES.includes(resolved.source)) {
        // 'SEED' (generic 24oz/0.25-confidence last-resort guess) and 'AI' (unmeasured
        // single-photo vision guess) are NOT curated PackageProfile rows (those come back
        // as 'CATEGORY'/'KEYWORD') and are not organizer-confirmed either. Per the ADR and
        // Patrick's 2026-07-23 follow-up decision, FB should never ship a weight built on
        // either -- pickup-only is the safer default. resolvePublishPackageWeight already
        // persisted it to the Item as a side effect (shared with eBay's publish path), so
        // explicitly revert that persistence for this item rather than silently using a
        // value we've decided not to trust.
        (it as { packageWeightOz: number | null }).packageWeightOz = resolved.weightOz;
      } else if (resolved && UNTRUSTED_SOURCES.includes(resolved.source)) {
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

  const shaped = items.map((it) => ({
    id: it.id,
    saleId: it.saleId,
    saleTitle: saleTitleById.get(it.saleId || '') || 'Sale',
    title: it.title,
    price: it.price != null ? Number(it.price.toFixed(2)) : null,
    condition: toFacebookCondition(it.condition),
    description: buildDescription(it.description, it.saleId),
    category: it.category || null,
    // Facebook Commerce Policy gate (coins/currency) -- see isFacebookRestrictedCoinOrCurrencyItem
    // above. FB-specific only; does not affect eBay/craigslist/gumtree/native-checkout fields
    // elsewhere in this same payload. Surfaced so popup.js can disable/badge the item on the
    // Facebook channel specifically while leaving it selectable for every other channel.
    facebookRestricted: isFacebookRestrictedCoinOrCurrencyItem(it.category, it.ebayCategoryId),
    facebookRestrictedReason: isFacebookRestrictedCoinOrCurrencyItem(it.category, it.ebayCategoryId)
      ? 'Facebook Marketplace does not allow listing coins or currency (Commerce Policy).'
      : null,
    // Per-marketplace category eligibility (S-EXT-BATCH-2026-08-19, marketplaceEligibilityRules.ts)
    // -- Grailed/Poshmark/Mercari/Vinted only; Craigslist/Gumtree AU/Facebook have no entry here
    // (Facebook keeps its own dedicated facebookRestricted/-Reason fields above for backward
    // compatibility with existing popup.js code). popup.js hides an ineligible item on that
    // platform's tab BY DEFAULT, with a "Show all items" override toggle -- this is UI guidance,
    // same defense-in-depth posture as facebookRestricted: markItemListed below is the real,
    // authoritative reject.
    eligibility: {
      GRAILED: checkEligibility('GRAILED', { category: it.category, ebayCategoryId: it.ebayCategoryId }),
      POSHMARK: checkEligibility('POSHMARK', { category: it.category, ebayCategoryId: it.ebayCategoryId }),
      MERCARI: checkEligibility('MERCARI', { category: it.category, ebayCategoryId: it.ebayCategoryId }),
      VINTED: checkEligibility('VINTED', { category: it.category, ebayCategoryId: it.ebayCategoryId }),
    },
    photoUrls: applyWatermark ? (it.photoUrls || []).map((u) => getWatermarkedUrlWithQR(u, it.id, it.qrEmbedEnabled !== false)) : (it.photoUrls || []),
    packageWeightOz: it.packageWeightOz,
    aiPackageWeightOz: it.aiPackageWeightOz,
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
    // Mirror the item's existing eBay Best Offer settings onto Facebook's Offer step.
    // bestOfferMinimumAmt is a Prisma Decimal (stored in DOLLARS, same unit as price) --
    // coerce to a plain number so it serializes as JSON number, not a Decimal string.
    allowBestOffer: it.allowBestOffer,
    bestOfferMinimumAmt: it.bestOfferMinimumAmt != null ? Number(it.bestOfferMinimumAmt) : null,
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
    // Craigslist ZIP/area autofill (2026-08-06) -- fas-craigslist.js reads these exact field
    // names (item.saleCity / item.saleZip) and only fills when present, never invents a value.
    saleCity: saleLocationById.get(it.saleId || '')?.city || null,
    saleZip: saleLocationById.get(it.saleId || '')?.zip || null,
    // Craigslist geoverify-step street address (2026-08-06) -- fills fas-craigslist.js's
    // #xstreet0 field on the ?s=geoverify "add map" screen. Same never-invent rule.
    saleAddress: saleLocationById.get(it.saleId || '')?.address || null,
  }));

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
// TODO Patrick: confirm notify-lead-time per ADR-100 §7 Q2 -- how many days before renewDueAt
// the nudge/auto-renewal should fire. Placeholder: same-day (0) until Patrick decides.
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
  // DELIBERATELY NOT extended to GRAILED/POSHMARK/MERCARI/VINTED (considered, then reverted, this
  // same session): those 4 content scripts never auto-publish -- the organizer always reviews the
  // filled form and clicks that platform's own final publish/list button THEMSELVES first, and
  // markItemListed only fires afterward as their "I posted" confirmation (see each fas-*.js's
  // showReviewOverlay). By the time this endpoint is called, the human has already made the real
  // decision. A backend reject here would not prevent a bad listing (it already happened, on the
  // real platform) -- it would only corrupt FindA.Sale's own record of what the organizer just
  // told us they did, and would directly defeat popup.js's new "Show all items" override (the
  // whole point of that toggle is letting the organizer list an item the category filter got
  // wrong -- see PLATFORM_ELIGIBILITY_KEY/checkResumeableQueue in popup.js). The category registry
  // (checkEligibility, marketplaceEligibilityRules.ts) stays a client-side UX filter (hide by
  // default + override) for these 4 platforms, not a server-side hard gate. Facebook is different
  // in kind, not just degree -- its flow is fully automated (fas-content.js fills AND submits),
  // so its policy check genuinely prevents an attempted auto-publish, which is why it keeps its
  // authoritative reject unchanged below.
  if (platform === 'FACEBOOK') {
    const fbItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { category: true, ebayCategoryId: true },
    });
    if (fbItem && isFacebookRestrictedCoinOrCurrencyItem(fbItem.category, fbItem.ebayCategoryId)) {
      res.status(400).json({ message: 'Coins and currency items cannot be listed on Facebook Marketplace (Facebook Commerce Policy).' });
      return;
    }
  }

  // renewDueAt only applies to the 3 renewal-eligible platforms (RENEWAL_LAPSE_WINDOW_DAYS has no
  // entries for Grailed/Poshmark/Mercari/Vinted -- none of the 4 are wired into auto-renewal, see
  // MarketplaceListingPlatform's comment above). getPendingRenewals already treats a null
  // renewDueAt as "never surfaces a renewal nudge" (same as any pre-ADR-100 row), so this is safe.
  const renewDueAt = isRenewalEligiblePlatform(platform)
    ? new Date(Date.now() + RENEWAL_LAPSE_WINDOW_DAYS[platform] * 24 * 60 * 60 * 1000)
    : null;

  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'POST', status: 'POSTED', remoteListingId, platform, renewDueAt },
  });
  res.json({ ok: true });
};

// POST /api/extension/items/:id/removed — record that the organizer removed this item from Marketplace.
export const markItemRemoved = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'REMOVE', status: 'REMOVED' },
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
  const priorSkips = await prisma.marketplaceListingJob.count({
    where: { itemId, action: 'REMOVE', status: 'SKIPPED' },
  });
  await prisma.marketplaceListingJob.create({
    data: {
      itemId,
      action: 'REMOVE',
      status: 'SKIPPED',
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
    select: { itemId: true, action: true, status: true, lastErrorMessage: true, lastAttemptAt: true },
  });
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  const skipCountByItem = new Map<string, number>();
  const lastSkipReasonByItem = new Map<string, string | null>();
  const lastSkipAtByItem = new Map<string, Date>();
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') postedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'SKIPPED') {
      skipCountByItem.set(j.itemId, (skipCountByItem.get(j.itemId) || 0) + 1);
      lastSkipReasonByItem.set(j.itemId, j.lastErrorMessage ?? null);
      // S1179: track the MOST RECENT skip per item (jobs aren't guaranteed ordered) so we can
      // gate the cooldown off it -- a fresh retry is only offered once RETRY_COOLDOWN_MS has
      // elapsed since the last actual failure, not since the item first crossed the cap.
      const attemptedAt = j.lastAttemptAt;
      if (attemptedAt && (!lastSkipAtByItem.has(j.itemId) || attemptedAt > lastSkipAtByItem.get(j.itemId)!)) {
        lastSkipAtByItem.set(j.itemId, attemptedAt);
      }
    }
  }

  const now = Date.now();
  const isRetryEligible = (itemId: string): boolean => {
    const skipCount = skipCountByItem.get(itemId) || 0;
    if (skipCount < MAX_REMOVAL_SKIP_ATTEMPTS) return true;
    // S1179: past the fast-fail cap, only retry again once the cooldown since the last
    // recorded skip has elapsed -- covers items that were dead-lettered before this fix
    // shipped (their lastAttemptAt is already well past the cooldown, so they're eligible
    // again on the very next poll) as well as future items that hit the cap going forward.
    const lastSkipAt = lastSkipAtByItem.get(itemId);
    if (!lastSkipAt) return true; // no timestamp on record -- fail open rather than stuck forever
    return now - lastSkipAt.getTime() >= RETRY_COOLDOWN_MS;
  };

  const stillPending = soldItems.filter((i) => postedByItem.has(i.id) && !removedByItem.has(i.id));
  const items = stillPending
    .filter((i) => isRetryEligible(i.id))
    .map((i) => ({ id: i.id, title: i.title }));
  // S1179: still surfaced here for organizer visibility once an item crosses the cap, even
  // during the cooldown windows where it's also (periodically) back in `items` above -- this
  // is now a "heads up, this one's been stubborn" signal rather than "we've given up on this
  // forever". background.js's notifyManualReviewIfNew already dedupes notifications per id, so
  // an item cycling through cooldown retries doesn't re-spam the organizer.
  const needsManualReview = stillPending
    .filter((i) => (skipCountByItem.get(i.id) || 0) >= MAX_REMOVAL_SKIP_ATTEMPTS)
    .map((i) => ({ id: i.id, title: i.title, skipCount: skipCountByItem.get(i.id) || 0, lastErrorMessage: lastSkipReasonByItem.get(i.id) || null }));

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
      return !full || !isFacebookRestrictedCoinOrCurrencyItem(full.category, full.ebayCategoryId);
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
// Facebook Commerce Policy gate (coins/currency) -- reuses isFacebookRestrictedCoinOrCurrencyItem,
// the same authoritative reject markItemListed applies for platform === 'FACEBOOK'. A
// coin/currency item can't be auto-posted to Facebook for policy reasons, so it must not be
// manually markable as Facebook-posted either -- same restriction, same reasoning.
//
// Idempotent: mirrors the "most-recent-row-per-item+platform wins" idiom used by
// getExtensionItems' latestByItemPlatform / getPendingRenewals' renewalInfoByItem (first-seen
// under `orderBy: { createdAt: 'desc' }`) -- if the latest FACEBOOK job for this item is
// already POST/POSTED, this is a no-op success rather than inserting a duplicate row.
export const markItemAlreadyPostedManually = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const fbItem = await prisma.item.findUnique({
    where: { id: itemId },
    select: { category: true, ebayCategoryId: true },
  });
  if (fbItem && isFacebookRestrictedCoinOrCurrencyItem(fbItem.category, fbItem.ebayCategoryId)) {
    res.status(400).json({ message: 'Coins and currency items cannot be listed on Facebook Marketplace (Facebook Commerce Policy).' });
    return;
  }

  const latestJob = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform: 'FACEBOOK' },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (latestJob && latestJob.action === 'POST' && latestJob.status === 'POSTED') {
    // Already posted (this call, a prior manual mark, or the automated flow) -- idempotent
    // success, never a duplicate row.
    res.json({ ok: true, status: 'POSTED' });
    return;
  }

  const renewDueAt = new Date(Date.now() + RENEWAL_LAPSE_WINDOW_DAYS.FACEBOOK * 24 * 60 * 60 * 1000);
  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'POST', status: 'POSTED', platform: 'FACEBOOK', renewDueAt },
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
        select: { itemId: true, action: true, status: true, lastErrorMessage: true, lastAttemptAt: true },
      })
    : [];
  const postedByRemovalItem = new Set<string>();
  const removedByRemovalItem = new Set<string>();
  const skipCountByItem = new Map<string, number>();
  const lastSkipReasonByItem = new Map<string, string | null>();
  const lastSkipAtByItem = new Map<string, Date>();
  for (const j of removalJobs) {
    if (j.action === 'POST' && j.status === 'POSTED') postedByRemovalItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByRemovalItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'SKIPPED') {
      skipCountByItem.set(j.itemId, (skipCountByItem.get(j.itemId) || 0) + 1);
      lastSkipReasonByItem.set(j.itemId, j.lastErrorMessage ?? null);
      const attemptedAt = j.lastAttemptAt;
      if (attemptedAt && (!lastSkipAtByItem.has(j.itemId) || attemptedAt > lastSkipAtByItem.get(j.itemId)!)) {
        lastSkipAtByItem.set(j.itemId, attemptedAt);
      }
    }
  }
  const stillPendingRemoval = soldItems.filter((i) => postedByRemovalItem.has(i.id) && !removedByRemovalItem.has(i.id));
  const manualReviewBacklog = stillPendingRemoval
    .filter((i) => (skipCountByItem.get(i.id) || 0) >= MAX_REMOVAL_SKIP_ATTEMPTS)
    .map((i) => ({
      itemId: i.id,
      title: i.title,
      saleTitle: saleTitleById.get(i.saleId || '') || 'Sale',
      skipCount: skipCountByItem.get(i.id) || 0,
      lastErrorMessage: lastSkipReasonByItem.get(i.id) || null,
      lastAttemptAt: lastSkipAtByItem.get(i.id)?.toISOString() || null,
    }));

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
