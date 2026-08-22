import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { triggerSaleAndCityRevalidation } from '../services/revalidationService';

/**
 * Auto-close expired PUBLISHED sales.
 * Runs every hour to transition PUBLISHED sales with endDate in the past to ENDED status.
 * Restricts to scraped sales (sourceUrl IS NOT NULL) to avoid closing organizer-owned sales
 * where the date may have been entered incorrectly but the sale is still active.
 */
// Capped batch size for post-autoclose ISR revalidation -- mirrors
// MAX_SCRAPER_REVALIDATION_CITY_PATHS (scraper/index.ts) and
// PRUNE_MAX_REVALIDATION_CITY_PATHS (pruneScrapedSales.ts) so a large
// autoclose batch can never become an unbounded ISR-write source itself.
// Added 2026-07-29 -- Patrick-approved via findasale-architect ADR.
// LOWERED 100 -> 25 (2026-08-22, S-REVALIDATION-TIMEOUT-INVESTIGATION):
// unlike the other two jobs, each path here is a distinct /sales/[id] page
// regeneration (not deduped like city touches), and /api/revalidate on the
// frontend processes paths SEQUENTIALLY via `await res.revalidate(path)` in
// a for loop (packages/frontend/pages/api/revalidate.ts). At 100 paths this
// batch could easily exceed revalidationService.ts's REVALIDATE_TIMEOUT_MS
// (10000ms), causing the client AbortController to fire mid-batch -- the
// prime suspect for the recurring hourly "[revalidationService] Revalidation
// request errored for" log seen right after this cron's :00 hourly tick.
// Realigned to the same 25-path cap already proven safe by the scraper and
// prune jobs. See revalidationService.ts for the matching diagnostic-logging
// fix (root cause not yet confirmed against live Railway logs -- see
// dispatch notes).
const MAX_AUTOCLOSE_REVALIDATION_PATHS = 25;

export function scheduleSaleAutoCloseCron(): void {
  // Every hour at minute 0
  cron.schedule('0 * * * *', cronGuard({ jobName: 'saleAutoCloseCron' }, async () => {
    const now = new Date();

    console.log(`[sale-auto-close] Starting auto-close of expired PUBLISHED sales`);

    // Find sales to close (collect IDs first for post-close liquidation logging)
    const salesToClose = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endDate: { lt: now },
        deletedAt: null,
        sourceUrl: { not: null }, // Only close scraped sales to protect organizer-owned sales
      },
      select: { id: true },
    });

    // Find and close all PUBLISHED scraped sales where endDate has passed
    const closedSales = await prisma.sale.updateMany({
      where: {
        status: 'PUBLISHED',
        endDate: { lt: now },
        deletedAt: null,
        sourceUrl: { not: null }, // Only close scraped sales to protect organizer-owned sales
      },
      data: { status: 'ENDED' }
    });

    console.log(`[sale-auto-close] Closed ${closedSales.count} expired sales`);

    // Roadmap #460: End-of-Sale Auto-Liquidation — log available items per closed sale
    if (salesToClose.length > 0) {
      const saleIds = salesToClose.map((s) => s.id);
      const liquidationCount = await prisma.item.count({
        where: {
          saleId: { in: saleIds },
          status: 'AVAILABLE',
          isActive: true,
        },
      });
      console.log(`[liquidation] Auto-close batch: ${saleIds.length} sales ended, ${liquidationCount} items queued for liquidation`);
      // Phase 2: clearance UI queries items WHERE status='AVAILABLE' AND isActive=true AND sale.status='ENDED'

      // ISR revalidation: transitioning to ENDED changes SEO metadata/JSON-LD on
      // /sales/[id] (staged-deindex policy) but this cron previously triggered no
      // revalidation at all, leaving those pages to catch up on their existing ISR
      // timer alone. Fire a capped, fire-and-forget batch -- never throws, never
      // blocks the cron -- mirroring the capped-batch pattern in
      // flushScraperRevalidation() (MAX_SCRAPER_REVALIDATION_CITY_PATHS) and
      // pruneScrapedSales.ts (PRUNE_MAX_REVALIDATION_CITY_PATHS). Added 2026-07-29 --
      // Patrick-approved via findasale-architect ADR.
      let revalidationIds = saleIds;
      if (revalidationIds.length > MAX_AUTOCLOSE_REVALIDATION_PATHS) {
        console.log(`[sale-auto-close] revalidation batch capped: ${revalidationIds.length} closed sales this run, revalidating first ${MAX_AUTOCLOSE_REVALIDATION_PATHS}`);
        revalidationIds = revalidationIds.slice(0, MAX_AUTOCLOSE_REVALIDATION_PATHS);
      }
      triggerSaleAndCityRevalidation(revalidationIds, []).catch((err) => {
        console.error('[sale-auto-close] revalidation trigger failed:', err);
      });
    }
  }));

  console.log('[sale-auto-close] Registered hourly auto-close cron for expired PUBLISHED sales');
}
