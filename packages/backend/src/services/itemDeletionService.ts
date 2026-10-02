/**
 * itemDeletionService.ts -- eBay sync hardening (2026-10-01)
 *
 * One shared "about to hard-delete an Item" path, used by itemController.deleteItem, the bulk
 * 'delete' in routes/items.ts and jobs/cleanupStaleDrafts.ts. Before this existed the withdraw +
 * snapshot logic lived only in deleteItem, so bulk delete orphaned live eBay listings.
 *
 *   prepareItemForDeletion(): withdraw the item from eBay / Discogs / Reverb (self-guarding, never
 *     throws) and snapshot still-live extension-platform listings into PendingListingRemoval (no FK
 *     to Item, so they survive the delete). Withdraws are started together and awaited with a bounded
 *     timeout: the Item row must still exist while they read it, and the eBay outcome is what
 *     recordItemDeletion() stores as withdrawSucceeded.
 *   recordItemDeletion(): writes one ItemDeletionLog row. Never throws into the delete path.
 *
 * Callers: prepare -> (their own cleanup) -> prisma.item.delete -> recordItemDeletion.
 */

import { prisma } from '../lib/prisma';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from './marketplace/reverbConnector';

export type ItemDeletionSource = 'single_delete' | 'bulk_delete' | 'cleanup_stale_drafts' | (string & {});

export interface ItemDeletionSnapshot {
  itemId: string;
  organizerId: string | null;
  title: string;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  status: string | null;
  /** true = eBay end/withdraw confirmed; false = attempted and failed; null = nothing to withdraw / still pending at timeout */
  withdrawSucceeded: boolean | null;
}

const WITHDRAW_TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

/**
 * Withdraw every marketplace channel for an item that is about to be deleted and snapshot
 * extension-platform listings. Never throws. `organizerId` is stored on PendingListingRemoval rows.
 */
export async function prepareItemForDeletion(
  itemId: string,
  opts: { organizerId: string | null }
): Promise<ItemDeletionSnapshot> {
  const snapshot: ItemDeletionSnapshot = {
    itemId,
    organizerId: opts.organizerId,
    title: '',
    ebayListingId: null,
    ebayOfferId: null,
    status: null,
    withdrawSucceeded: null,
  };

  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { title: true, ebayListingId: true, ebayOfferId: true, status: true },
    });
    if (item) {
      snapshot.title = item.title;
      snapshot.ebayListingId = item.ebayListingId;
      snapshot.ebayOfferId = item.ebayOfferId;
      snapshot.status = item.status;
    }
  } catch (err: any) {
    console.warn(`[ItemDeletion] snapshot read failed for item ${itemId}:`, err?.message);
  }

  // ADR item-delete-cross-marketplace-removal (2026-09-28): eBay / Discogs / Reverb withdraw. All three
  // self-guard to a no-op when the item was never on that channel and never throw.
  const ebayPromise = endEbayListingIfExists(itemId, 'delete').catch((err: any) => {
    console.warn(`[eBay] withdraw-on-delete failed for item ${itemId}:`, err?.message);
    return false as boolean | null;
  });
  const discogsPromise = withdrawDiscogsListingIfExists(itemId).catch((err: any) =>
    console.warn(`[Discogs] withdraw-on-delete failed for item ${itemId}:`, err?.message)
  );
  const reverbPromise = withdrawReverbListingIfExists(itemId).catch((err: any) =>
    console.warn(`[Reverb] withdraw-on-delete failed for item ${itemId}:`, err?.message)
  );
  const [ebayOutcome] = await Promise.all([
    withTimeout<boolean | null | void>(ebayPromise, null, WITHDRAW_TIMEOUT_MS),
    withTimeout<unknown>(discogsPromise, null, WITHDRAW_TIMEOUT_MS),
    withTimeout<unknown>(reverbPromise, null, WITHDRAW_TIMEOUT_MS),
  ]);
  snapshot.withdrawSucceeded = typeof ebayOutcome === 'boolean' ? ebayOutcome : null;

  // The extension-driven platforms have no removal API: snapshot any still-live listing into
  // PendingListingRemoval BEFORE the Item row goes, so getPendingRemovals can still queue it.
  try {
    if (opts.organizerId) {
      const listingJobs = await prisma.marketplaceListingJob.findMany({
        where: { itemId },
        select: { platform: true, status: true, action: true, remoteListingId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const latestJobByPlatform = new Map<string, (typeof listingJobs)[number]>();
      for (const job of listingJobs) {
        if (!latestJobByPlatform.has(job.platform)) latestJobByPlatform.set(job.platform, job);
      }
      const stillLivePlatforms = [...latestJobByPlatform.values()].filter(
        (job) => job.action === 'POST' && job.status === 'POSTED'
      );
      if (stillLivePlatforms.length > 0) {
        await prisma.pendingListingRemoval.createMany({
          data: stillLivePlatforms.map((job) => ({
            organizerId: opts.organizerId as string,
            itemTitle: snapshot.title,
            platform: job.platform,
            remoteListingId: job.remoteListingId,
          })),
        });
      }
    }
  } catch (err: any) {
    console.warn(`[ItemDeletion] PendingListingRemoval snapshot failed for item ${itemId}:`, err?.message);
  }

  return snapshot;
}

/** Write one ItemDeletionLog row. Never throws (the delete already happened; the log is best-effort). */
export async function recordItemDeletion(
  snapshot: ItemDeletionSnapshot,
  source: ItemDeletionSource,
  actorUserId: string | null
): Promise<void> {
  try {
    await prisma.itemDeletionLog.create({
      data: {
        itemId: snapshot.itemId,
        organizerId: snapshot.organizerId,
        title: snapshot.title || '(unknown)',
        ebayListingId: snapshot.ebayListingId,
        ebayOfferId: snapshot.ebayOfferId,
        status: snapshot.status,
        source,
        actorUserId,
        withdrawSucceeded: snapshot.withdrawSucceeded,
      },
    });
    console.log(
      `[ItemDeletion] item=${snapshot.itemId} source=${source} actor=${actorUserId ?? 'system'} ` +
        `ebayListingId=${snapshot.ebayListingId ?? 'none'} withdrawSucceeded=${snapshot.withdrawSucceeded}`
    );
  } catch (err: any) {
    console.warn(`[ItemDeletion] failed to write ItemDeletionLog for item ${snapshot.itemId}:`, err?.message);
  }
}
