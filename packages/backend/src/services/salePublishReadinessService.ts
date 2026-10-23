/**
 * salePublishReadinessService.ts: which of a sale's unpublished items can go live together with the sale.
 *
 * 2026-10-23 (activation-funnel-2026-10-23.md, finding 1): publishing a sale never moved its items out of
 * draftStatus DRAFT / PENDING_REVIEW, so an organizer could publish a sale with 14 priced, photographed items
 * and shoppers still saw an empty sale. The sale publish (saleController.updateSaleStatus) now publishes the
 * READY items in the same transaction, by default, and the publish dialog lists the ones that are not ready.
 *
 * "Ready" is the same bar an item has to clear to be published on its own:
 *  - the review page's Approve rule (pages/organizer/add-items/[saleId]/review.tsx handleApproveItem and
 *    lib/itemReadiness.ts "red"): a title, a price above zero and at least one photo;
 *  - the server publish gate (itemController.publishItemForUser): draftStatus DRAFT or PENDING_REVIEW
 *    (a card item also needs a price, which the price rule above already covers).
 * Items the organizer hid (isActive false) are never published by this path; they are listed as not ready.
 * Soft-deleted items and POS-minted consignor price tags are ignored entirely, same as every item count.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type NotReadyReason = 'NO_TITLE' | 'NO_PRICE' | 'NO_PHOTO' | 'HIDDEN';

export const NOT_READY_REASON_LABEL: Record<NotReadyReason, string> = {
  NO_TITLE: 'Needs a title',
  NO_PRICE: 'Needs a price',
  NO_PHOTO: 'Needs a photo',
  HIDDEN: 'Hidden from shoppers',
};

/** Unpublished items that belong to the sale and count as the organizer's items. */
export const UNPUBLISHED_SALE_ITEM_FILTER: Prisma.ItemWhereInput = {
  deletedAt: null,
  listingType: { not: 'CONSIGNOR_TAG' },
  draftStatus: { in: ['DRAFT', 'PENDING_REVIEW'] },
};

export type ReadinessInputItem = {
  id: string;
  title: string | null;
  price: number | null;
  photoUrls: string[] | null;
  isActive: boolean | null;
};

/** Pure: the reasons an unpublished item cannot go live yet. Empty array = ready. */
export function itemNotReadyReasons(item: ReadinessInputItem): NotReadyReason[] {
  const reasons: NotReadyReason[] = [];
  if (!item.title || !item.title.trim()) reasons.push('NO_TITLE');
  const price = item.price === null || item.price === undefined ? NaN : Number(item.price);
  if (!Number.isFinite(price) || price <= 0) reasons.push('NO_PRICE');
  if (!Array.isArray(item.photoUrls) || item.photoUrls.length === 0) reasons.push('NO_PHOTO');
  if (item.isActive === false) reasons.push('HIDDEN');
  return reasons;
}

export type SalePublishReadiness = {
  readyItems: Array<{ id: string; title: string }>;
  notReadyItems: Array<{ id: string; title: string; reasons: NotReadyReason[]; reasonLabels: string[] }>;
  /** Items already published on this sale (shopper-visible once the sale is live). */
  publishedItemCount: number;
};

/** Pure split of loaded unpublished items into ready / not ready. */
export function splitReadiness(items: ReadinessInputItem[]): Omit<SalePublishReadiness, 'publishedItemCount'> {
  const readyItems: SalePublishReadiness['readyItems'] = [];
  const notReadyItems: SalePublishReadiness['notReadyItems'] = [];
  for (const item of items) {
    const reasons = itemNotReadyReasons(item);
    const title = item.title && item.title.trim() ? item.title.trim() : 'Untitled item';
    if (reasons.length === 0) readyItems.push({ id: item.id, title });
    else notReadyItems.push({ id: item.id, title, reasons, reasonLabels: reasons.map((r) => NOT_READY_REASON_LABEL[r]) });
  }
  return { readyItems, notReadyItems };
}

type ReadinessDb = Pick<typeof prisma, 'item'>;

export async function getSalePublishReadiness(saleId: string, db: ReadinessDb = prisma): Promise<SalePublishReadiness> {
  const [items, publishedItemCount] = await Promise.all([
    db.item.findMany({
      where: { saleId, ...UNPUBLISHED_SALE_ITEM_FILTER },
      select: { id: true, title: true, price: true, photoUrls: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.item.count({
      where: { saleId, deletedAt: null, listingType: { not: 'CONSIGNOR_TAG' }, draftStatus: 'PUBLISHED' },
    }),
  ]);
  return { ...splitReadiness(items as ReadinessInputItem[]), publishedItemCount };
}
