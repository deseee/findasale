/**
 * prune-scraped-sales-backfill.ts — one-time backfill for the scraped ENDED-sale prune.
 *
 * Runs the shared pruneScrapedSales module with NO per-run cap to clear the existing
 * backlog (~51k rows at design time). Default is a DRY RUN (count + sample only).
 * Pass --execute to actually delete.
 *
 * ADR: claude_docs/feature-notes/ADR-scraped-sale-prune-2026-07-05.md
 *
 * Usage (Railway DATABASE_URL must be set in the environment — never localhost):
 *   npx tsx src/scripts/prune-scraped-sales-backfill.ts            # dry run (safe)
 *   npx tsx src/scripts/prune-scraped-sales-backfill.ts --execute  # real delete
 */

import { pruneScrapedSales } from '../jobs/pruneScrapedSales';
import { prisma } from '../lib/prisma';

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  console.log(`[backfill] prune-scraped-sales — mode=${execute ? 'EXECUTE' : 'DRY RUN'}`);

  const result = await pruneScrapedSales({ dryRun: !execute });
  console.log('[backfill] result:', JSON.stringify(result));

  if (!execute) {
    console.log('[backfill] DRY RUN complete. Re-run with --execute to delete the rows above.');
  }
}

main()
  .catch((err) => {
    console.error('[backfill] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
