/**
 * Controller-facing binding of the bulk lot export guard to the shared Prisma client (ADR-136 Addendum C). Kept apart
 * from bulkLotExportGuard so the pure part can be tested without a database client.
 */
import type { Response } from 'express';
import { isBulkLotsEnabled } from './bulkLotConfig';
import { isBulkLotError, type BulkLotDb } from './bulkLotService';
import { allLotsMessage, lotRefusalForPlatform, partitionBulkLots, skippedLotsHeaders, type BulkLotPartition, type MarketplaceLotRefusal } from './bulkLotExportGuard';

/** The shared client, loaded on first use so importing this module (and every controller that uses it) never builds a Prisma client by itself. */
function sharedPrisma(): Pick<BulkLotDb, 'itemBulkLot'> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../lib/prisma').prisma as Pick<BulkLotDb, 'itemBulkLot'>;
}

export interface ExportLotSplit<T> extends BulkLotPartition<T> {
  /** Sets the "left out" headers on the response (no-op when nothing was skipped). */
  markResponse(res: Response): void;
}

/**
 * Removes bulk lots from `items` for an export. Returns null AFTER answering the request (503) when the lot check could
 * not run with the flag on: an export never goes out with a lot in it because a lookup failed. When every item was a lot
 * it answers 400 with a plain message and also returns null, so the caller just `return`s.
 */
export async function filterBulkLotsForExport<T extends { id: string; title?: string | null } = any>(items: readonly T[], res: Response, db?: Pick<BulkLotDb, 'itemBulkLot'>): Promise<ExportLotSplit<T> | null> {
  let part: BulkLotPartition<T>;
  try {
    part = await partitionBulkLots(db ?? sharedPrisma(), items, isBulkLotsEnabled());
  } catch (err) {
    if (!isBulkLotsEnabled()) {
      // Flag off: the check is best effort. A client that cannot be loaded must not break an export that never had lots.
      console.warn('[bulkLot] lot check could not run (failing open, flag off):', err);
      part = { kept: [...items], skipped: [] };
    } else {
      const status = isBulkLotError(err) ? err.status : 503;
      res.status(status).json({ message: 'Could not check this sale for bulk lots, so nothing was exported. Try again in a moment.', code: 'BULK_CHECK_FAILED' });
      return null;
    }
  }
  if (part.kept.length === 0 && part.skipped.length > 0) {
    res.status(400).json({ message: allLotsMessage(part.skipped), code: 'BULK_LOTS_NOT_EXPORTED' });
    return null;
  }
  return {
    ...part,
    markResponse: (r: Response) => {
      const headers = skippedLotsHeaders(part.skipped);
      for (const [k, v] of Object.entries(headers)) r.setHeader(k, v);
    },
  };
}

export type { MarketplaceLotRefusal };

/** Prisma-bound form of lotRefusalForPlatform (see bulkLotExportGuard). */
export async function marketplaceLotRefusal(platformName: string, itemIds: ReadonlyArray<string | null | undefined>, db?: Pick<BulkLotDb, 'itemBulkLot'>): Promise<MarketplaceLotRefusal | null> {
  let client: Pick<BulkLotDb, 'itemBulkLot'>;
  try {
    client = db ?? sharedPrisma();
  } catch {
    if (!isBulkLotsEnabled()) return null; // flag off: best effort, same as the lookup itself
    return { status: 503, code: 'BULK_CHECK_FAILED', message: 'Could not check whether this item is a bulk lot. Try again in a moment.' };
  }
  return lotRefusalForPlatform(client, platformName, itemIds, isBulkLotsEnabled());
}
