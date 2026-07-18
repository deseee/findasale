import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';

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
    },
    orderBy: { createdAt: 'desc' },
  });

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
