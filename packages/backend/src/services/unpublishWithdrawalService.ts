/**
 * unpublishWithdrawalService.ts -- Patrick's rule (2026-10-11): when an item goes from Published back to Draft / Pending
 * Review it must come down from EVERY marketplace it is listed on.
 *
 * Shared by every Published -> Draft / Pending Review path: POST /items/bulk (draftStatus), the generic single-item
 * update (itemController.updateItem) and anything added later. Two halves:
 *
 *   1. API-driven channels (eBay, Discogs, Reverb, Etsy): the exact self-guarding withdraw calls the delete path
 *      (itemDeletionService.prepareItemForDeletion) and the SOLD path use. Each no-ops when the item was never on that
 *      channel. Best-effort: nothing here throws, a channel failure or timeout becomes a warning, and the status change
 *      that already happened is never rolled back.
 *   2. Extension-driven channels (Facebook, Craigslist, Vinted, Poshmark, Mercari, ...): there is no removal API, so the
 *      browser extension takes the listing down. NOTHING is written here. getPendingRemovals (extensionController.ts)
 *      serves every AVAILABLE item whose draftStatus is not PUBLISHED and whose latest non-SKIPPED job for a platform is
 *      POST/POSTED as a removal (reason 'UNPUBLISHED'); the extension then reports /removed, which writes the normal
 *      REMOVE/REMOVED job row. Because the removal is DERIVED from live state (never a queued row) it is idempotent by
 *      construction, survives the Item row still existing, and is cancelled implicitly if the item is re-published
 *      before the extension acts (the live listing simply stays). countLiveExtensionListings() only COUNTS those
 *      pending removals so the response can tell the organizer.
 */

import { prisma } from '../lib/prisma';
import { liveListingsByItemPlatform } from './liveListingState'; // 2026-10-27: shared live-listing rule
import { endEbayListingIfExists } from '../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from './marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from './marketplace/etsyConnector';

export type UnpublishWithdrawalWarning = { itemId: string; channel: 'eBay' | 'Discogs' | 'Reverb' | 'Etsy'; reason: string };

export interface UnpublishWithdrawalResult {
  /** API-channel listings confirmed ended (eBay / Reverb / Etsy; Discogs reports no outcome). */
  withdrawn: number;
  warnings: UnpublishWithdrawalWarning[];
  /** Extension-channel listings (platform x item) that the browser extension will now take down. */
  extensionRemovalsQueued: number;
}

const WITHDRAW_TIMEOUT_MS = 20000;
const WITHDRAW_CHUNK = 5;

function boundedWithdraw<T>(call: () => Promise<T>, ms: number): Promise<{ value?: T; error?: string; timedOut?: boolean }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ timedOut: true }), ms);
    Promise.resolve()
      .then(call)
      .then(
        (value) => { clearTimeout(t); resolve({ value }); },
        (err: any) => { clearTimeout(t); resolve({ error: err?.message || 'unknown error' }); }
      );
  });
}

/**
 * Count the extension-channel listings that are still live for these items: per (item, platform), the LATEST job that is
 * not a REMOVE/SKIPPED row (a failed removal attempt, not a state change) is POST/POSTED. Same rule getPendingRemovals
 * applies. Never throws; returns 0 on any error.
 */
export async function countLiveExtensionListings(itemIds: string[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  try {
    const jobs = await prisma.marketplaceListingJob.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, platform: true, action: true, status: true, createdAt: true, lastErrorMessage: true, syncedQuantity: true },
    });
    // 2026-10-27 (liveListingState.ts): also counts a Poshmark Multi Item listing still showing units after a unit sale there.
    return liveListingsByItemPlatform(jobs).size;
  } catch (err: any) {
    console.warn('[unpublish] extension listing count failed (non-fatal):', err?.message);
    return 0;
  }
}

/**
 * Take every live listing of these just-unpublished items down. Call AFTER the draftStatus write. Never throws.
 * `source` only labels log lines.
 */
export async function withdrawLiveListingsOnUnpublish(itemIds: string[], source: string = 'unpublish'): Promise<UnpublishWithdrawalResult> {
  const warnings: UnpublishWithdrawalWarning[] = [];
  let withdrawn = 0;
  for (let i = 0; i < itemIds.length; i += WITHDRAW_CHUNK) {
    const chunk = itemIds.slice(i, i + WITHDRAW_CHUNK);
    await Promise.all(
      chunk.map(async (itemId) => {
        try {
          const [ebay, discogs, reverb, etsy] = await Promise.all([
            boundedWithdraw(() => endEbayListingIfExists(itemId, 'delete'), WITHDRAW_TIMEOUT_MS),
            boundedWithdraw(() => withdrawDiscogsListingIfExists(itemId), WITHDRAW_TIMEOUT_MS),
            boundedWithdraw(() => withdrawReverbListingIfExists(itemId), WITHDRAW_TIMEOUT_MS),
            boundedWithdraw(() => withdrawEtsyListingIfExists(itemId), WITHDRAW_TIMEOUT_MS),
          ]);
          if (ebay.error || ebay.timedOut || ebay.value === false) {
            warnings.push({ itemId, channel: 'eBay', reason: ebay.error || (ebay.timedOut ? 'timed out' : 'could not be ended') });
          } else if (ebay.value === true) {
            withdrawn++;
          }
          // Discogs reports no outcome (void, never throws): only a thrown error or a timeout is detectable.
          if (discogs.error || discogs.timedOut) {
            warnings.push({ itemId, channel: 'Discogs', reason: discogs.error || 'timed out' });
          }
          if (reverb.error || reverb.timedOut || reverb.value === 'failed') {
            warnings.push({ itemId, channel: 'Reverb', reason: reverb.error || (reverb.timedOut ? 'timed out' : 'could not be ended') });
          } else if (reverb.value === 'withdrawn' || reverb.value === 'gone') {
            withdrawn++;
          }
          if (etsy.error || etsy.timedOut || etsy.value === 'failed') {
            warnings.push({ itemId, channel: 'Etsy', reason: etsy.error || (etsy.timedOut ? 'timed out' : 'could not be ended') });
          } else if (etsy.value === 'withdrawn' || etsy.value === 'gone') {
            withdrawn++;
          }
        } catch (err: any) {
          console.warn(`[${source}] withdraw on unpublish failed for item ${itemId}:`, err?.message);
          warnings.push({ itemId, channel: 'eBay', reason: 'withdraw check failed unexpectedly' });
        }
      })
    );
  }
  if (warnings.length > 0) {
    console.warn(`[${source}] ${warnings.length} listing withdrawal warning(s):`, JSON.stringify(warnings));
  }
  const extensionRemovalsQueued = await countLiveExtensionListings(itemIds);
  return { withdrawn, warnings, extensionRemovalsQueued };
}
