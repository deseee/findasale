import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';
import { resolvePublishPackageWeight } from './ebayController';

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

// GET /api/extension/items — the organizer's listable items + Marketplace status.
export const getExtensionItems = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  // Apply the finda.sale watermark to photos unless this organizer is allowed to remove it
  // (TEAMS + toggle on). Mirrors export/social/eBay channels so Facebook is not the one
  // channel leaking un-watermarked images. Adds the FindA.Sale text watermark + a QR code that
  // links back to the finda.sale listing. getWatermarkedUrlWithQR passes non-Cloudinary URLs through.
  const applyWatermark = !canRemoveWatermark(organizer);

  const sales = await prisma.sale.findMany({
    where: { organizerId: organizer.id },
    select: { id: true, title: true },
  });
  const saleTitleById = new Map(sales.map((s) => [s.id, s.title]));

  const items = await prisma.item.findMany({
    // ADR-084 amendment 2026-07-15: exclude DONT_LIST items -- mirrors PostSaleEbayPanel's
    // auto-unselect on the eBay side, applied here at the query level instead of frontend-only.
    // 2026-07-16 fix: Prisma `NOT: { field: value }` compiles to `field <> value`, which SQL
    // evaluates as NULL (row dropped) for the ~99% of items whose ebayShippingOverride IS NULL.
    // That silently hid all but the rare non-null rows (extension showed only 1 of 126 items).
    // The OR keeps NULL-override items while still excluding explicit DONT_LIST.
    where: {
      sale: { organizerId: organizer.id },
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
      packageWeightOz: true, aiPackageWeightOz: true, ebayShippingOverride: true, shippingAvailable: true,
      allowBestOffer: true, bestOfferMinimumAmt: true,
      // ADR fb-package-weight-estimator (2026-07-22): needed to call resolvePublishPackageWeight
      // below, the same package-weight resolver eBay's publish flow already uses.
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
  // existed (e.g. the seeded 'lamp' keyword profile). resolvePublishPackageWeight persists
  // its result to the Item, so both eBay and Facebook converge on the same stored weight
  // instead of two channels silently disagreeing. No-ops (single early return, no extra
  // queries) for any item that already has a confirmed/measured weight or is pickup-only.
  for (const it of items) {
    if (it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') continue;
    // 2026-07-22 follow-up: don't treat a persisted 'SEED' (generic fallback) weight as
    // already-resolved -- items that got the bad 24oz fallback before this file's SEED
    // guard existed (e.g. items persisted between the two deploys today) need to keep
    // re-running through resolvePublishPackageWeight so they self-heal on next fetch,
    // instead of being silently skipped forever because a (bad) weight is already set.
    if (it.packageWeightOz != null && Number(it.packageWeightOz) > 0 && it.packageEstimateSource !== 'SEED') continue;
    try {
      // resolvePublishPackageWeight (shared with eBay's publish path) unconditionally
      // short-circuits and returns null whenever packageWeightOz is already set -- it
      // has no idea *why* a weight is set, only that one is. That's correct for a real
      // organizer-confirmed or category-matched value, but wrong for a persisted 'SEED'
      // (generic fallback) value we've explicitly decided not to trust on FB: we need
      // the shared resolver to actually recompute, not treat the untrusted guess as
      // already-resolved. Pass null here (FB-side only, not touching the shared
      // function's own semantics used by eBay) so it falls through to a fresh estimate.
      const isUntrustedSeed = it.packageEstimateSource === 'SEED';
      const resolved = await resolvePublishPackageWeight({
        id: it.id,
        title: it.title,
        category: it.category,
        ebayCategoryId: it.ebayCategoryId,
        ebayShippingOverride: it.ebayShippingOverride,
        packageConfirmedByOrganizer: it.packageConfirmedByOrganizer,
        packageWeightOz: isUntrustedSeed ? null : it.packageWeightOz,
        packageLengthIn: it.packageLengthIn != null ? Number(it.packageLengthIn) : null,
        packageWidthIn: it.packageWidthIn != null ? Number(it.packageWidthIn) : null,
        packageHeightIn: it.packageHeightIn != null ? Number(it.packageHeightIn) : null,
        packageType: it.packageType,
        aiPackageWeightOz: it.aiPackageWeightOz,
        aiPackageDimsJson: it.aiPackageDimsJson,
        aiPackageConfidence: it.aiPackageConfidence != null ? Number(it.aiPackageConfidence) : null,
      });
      if (resolved && resolved.source !== 'SEED') {
        // 'SEED' here means resolvePublishPackageWeight fell all the way through to its
        // own generic last-resort guess (24oz/0.25 confidence, no category or keyword
        // match, not the AI photo estimate either) -- NOT a curated PackageProfile row
        // (those come back as 'CATEGORY'/'KEYWORD'). Per the ADR, FB should never ship a
        // real weight built on that low a confidence -- pickup-only is the safer default.
        // resolvePublishPackageWeight already persisted it to the Item as a side effect
        // (shared with eBay's publish path), so explicitly revert that persistence for
        // this item rather than silently using a value we've decided not to trust.
        (it as { packageWeightOz: number | null }).packageWeightOz = resolved.weightOz;
      } else if (resolved && resolved.source === 'SEED') {
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
          console.warn('[FB AutoWeight] failed to revert generic-fallback weight for item', it.id, revertErr?.message || revertErr);
        }
      }
    } catch (e: any) {
      console.warn('[FB AutoWeight] resolvePublishPackageWeight failed for item', it.id, e?.message || e);
    }
  }

  const itemIds = items.map((i) => i.id);
  const jobs = itemIds.length
    ? await prisma.marketplaceListingJob.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, action: true, status: true },
      })
    : [];
  const postedByItem = new Set<string>();
  const removedByItem = new Set<string>();
  for (const j of jobs) {
    if (j.action === 'POST' && j.status === 'POSTED') postedByItem.add(j.itemId);
    if (j.action === 'REMOVE' && j.status === 'REMOVED') removedByItem.add(j.itemId);
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
    shippingOverride:
      it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY' ||
      (it.packageWeightOz == null && it.aiPackageWeightOz == null)
        ? 'LOCAL_PICKUP_ONLY'
        : it.ebayShippingOverride,
    // Mirror the item's existing eBay Best Offer settings onto Facebook's Offer step.
    // bestOfferMinimumAmt is a Prisma Decimal (stored in DOLLARS, same unit as price) --
    // coerce to a plain number so it serializes as JSON number, not a Decimal string.
    allowBestOffer: it.allowBestOffer,
    bestOfferMinimumAmt: it.bestOfferMinimumAmt != null ? Number(it.bestOfferMinimumAmt) : null,
    marketplaceListed: postedByItem.has(it.id) && !removedByItem.has(it.id),
  }));

  res.json({ organizer: { businessName: organizer.businessName }, items: shaped });
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

// POST /api/extension/items/:id/listed — record that the organizer listed this item to Marketplace.
export const markItemListed = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const itemId = req.params.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  if (!(await assertItemOwned(userId, itemId))) { res.status(404).json({ message: 'Item not found' }); return; }

  const remoteListingId = typeof req.body?.remoteListingId === 'string' ? req.body.remoteListingId : null;
  await prisma.marketplaceListingJob.create({
    data: { itemId, action: 'POST', status: 'POSTED', remoteListingId },
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

// GET /api/extension/pending-removals — items that were listed to Marketplace by this
// extension and have since sold via ANY channel (POS, storefront, eBay, anything that
// flips Item.status to SOLD) but haven't been marked removed yet. ADR-084 amendment
// 2026-07-15: Facebook has no API, so there's no server-to-Facebook withdraw call the way
// endEbayListingIfExists() calls eBay directly -- this is a poll target for the extension's
// own background alarm instead. Pure read composed from data every existing sale path
// already updates (Item.status, MarketplaceListingJob) -- no new schema, no migration.
export const getPendingRemovals = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }

  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) { res.status(404).json({ message: 'Organizer profile not found' }); return; }

  const soldItems = await prisma.item.findMany({
    where: { sale: { organizerId: organizer.id }, status: 'SOLD' },
    select: { id: true, title: true },
  });
  if (!soldItems.length) { res.json({ items: [] }); return; }

  const itemIds = soldItems.map((i) => i.id);
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

  const pending = soldItems
    .filter((i) => postedByItem.has(i.id) && !removedByItem.has(i.id))
    .map((i) => ({ id: i.id, title: i.title }));

  res.json({ items: pending });
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
      sale: { organizerId: organizer.id },
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
