/**
 * saleReopenGuard.ts -- stops a marketplace sold signal from re-selling an item the organizer just reopened
 * (reopen-sale, 2026-10-10).
 *
 * WHY: reopening a cancelled marketplace sale sets the item back to AVAILABLE. The marketplace's own "sold" signal
 * (Vinted wardrobe report, Mercari / Facebook order email, Facebook sold-card scan) can still name the cancelled
 * listing, and commitFacebookNativeSale would happily sell the now-AVAILABLE item again. The reopen writes one
 * MarketplaceListingJob marker row (action REMOVE, status REMOVED, lastErrorMessage REOPEN_MARKER) for the sold
 * channel's platform BEFORE it flips the item; this guard reads that marker. No schema change.
 *
 * A sold report is treated as the cancelled sale when:
 *   - it names a listing id that was already on record (a POST row) before the marker, or
 *   - it names no id (title-only email, Facebook scan) and the item has not been listed on that platform again
 *     since the marker. A fresh POST row after the marker means a genuine new listing, so new sales go through.
 * Fails OPEN on any lookup error (a broken lookup must never block a real sale); the marker row itself is the
 * durable protection, this only reads it.
 *
 * eBay is protected by the EbaySoldEvent ledger (kept on purpose), Etsy by the EtsySoldEvent ledger (unique
 * transactionId), and Reverb / Discogs only ever match orders that are not cancelled or refunded.
 */

import { prisma } from '../lib/prisma';

export const REOPEN_MARKER = 'sale_cancelled_reopened';

/** Item.lastSoldVia value -> MarketplaceJobPlatform whose job rows carry that channel's listing history. */
export const SOLD_VIA_TO_JOB_PLATFORM: Record<string, 'FACEBOOK' | 'VINTED' | 'MERCARI' | 'POSHMARK' | 'GRAILED'> = {
  FB_NATIVE: 'FACEBOOK',
  FB_EMAIL_ORDER: 'FACEBOOK',
  VINTED: 'VINTED',
  MERCARI: 'MERCARI',
  POSHMARK: 'POSHMARK',
  GRAILED: 'GRAILED',
};

export async function isReportOfCancelledReopenedSale(
  itemId: string,
  soldVia: string,
  remoteListingId?: string | null,
): Promise<boolean> {
  const platform = SOLD_VIA_TO_JOB_PLATFORM[soldVia];
  if (!platform) return false;
  try {
    const marker = await (prisma as any).marketplaceListingJob.findFirst({
      where: { itemId, platform, action: 'REMOVE', status: 'REMOVED', lastErrorMessage: REOPEN_MARKER },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!marker || !marker.createdAt) return false;

    const rid = String(remoteListingId ?? '').trim();
    if (rid) {
      const older = await (prisma as any).marketplaceListingJob.findFirst({
        where: { itemId, platform, action: 'POST', remoteListingId: rid, createdAt: { lt: marker.createdAt } },
        select: { id: true },
      });
      return !!older;
    }
    const relisted = await (prisma as any).marketplaceListingJob.findFirst({
      where: { itemId, platform, action: 'POST', createdAt: { gt: marker.createdAt } },
      select: { id: true },
    });
    return !relisted;
  } catch {
    return false;
  }
}
