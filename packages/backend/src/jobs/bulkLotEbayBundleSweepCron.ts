/**
 * bulkLotEbayBundleSweepCron.ts (ADR-136 Addendum C, roadmap #659): every 10 minutes, bring the eBay listing of every bulk
 * lot bundle in line with the lot's counter stock.
 *
 * The sale paths call reconcileBulkLotEbayInBackgroundIfEnabled right after they change a lot's cards; this sweep is the
 * net under them. It catches a price change, a restock, a hold that expired, an end that failed, or a hook that never ran.
 * It revises quantity and price on a live listing, ends a listing that has fewer than one bundle left, and relists one
 * when stock returns. It only ever works on lots with bundle settings, never lists a lot for the first time, and does
 * nothing at all unless CARD_BULK_LOTS_ENABLED and CARD_BULK_EBAY_ENABLED are both on (read at run time).
 *
 * Why 10 minutes: the counter can sell cards faster than eBay learns about it. Every minute between a counter sale and
 * the next revise is a window in which eBay still shows the old quantity. The sold sync (15 minutes) absorbs any bundle
 * order placed in that window, and a shortfall is recorded and reported, never dropped.
 */
import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { isBulkEbayEnabled } from '../services/bulkLot/bulkLotEbayConfig';
import { sweepBundleListings } from '../services/bulkLot/bulkLotEbayService';
import { bundleDb, realBundleOps } from '../services/bulkLot/bulkLotEbayWiring';

export async function runBulkLotEbayBundleSweep(): Promise<void> {
  if (!isBulkEbayEnabled()) return;
  const res = await sweepBundleListings(bundleDb, realBundleOps);
  if (res.checked > 0 && (res.changed > 0 || res.failed > 0)) {
    console.log(`[bulkLotEbay] sweep: checked ${res.checked}, changed ${res.changed}, failed ${res.failed}`);
  }
}

export function startBulkLotEbayBundleSweepCron(): void {
  cron.schedule('*/10 * * * *', cronGuard({ jobName: 'bulkLotEbayBundleSweepCron' }, runBulkLotEbayBundleSweep));
  console.log('[bulkLotEbay] Bundle sweep cron registered (every 10 minutes; no-op unless CARD_BULK_EBAY_ENABLED)');
}
