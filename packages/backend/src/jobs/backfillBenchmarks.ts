import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * backfillBenchmarks.ts
 *
 * Weekly cron job to backfill PriceBenchmark entries from Items with aiSuggestedPrice
 * or sold prices (via Purchase records).
 *
 * Purpose: Populate the PriceBenchmark table with AUTO_GENERATED entries so that
 * valuationService.ts has a robust fallback when insufficient comparables exist.
 *
 * Logic:
 * 1. Find Items with aiSuggestedPrice (or a sold price from Purchase) but no matching
 *    PriceBenchmark row (same category + condition + dataSource within $10 price band)
 * 2. For each item, create a PriceBenchmark with:
 *    - dataSource: 'haiku_inferred'
 *    - status: 'AUTO_GENERATED'
 *    - region: infer from sale zip code, default to 'NATIONAL'
 *    - priceRangeLow: aiSuggestedPrice * 0.7
 *    - priceRangeHigh: aiSuggestedPrice * 1.3
 * 3. Process in batches of 100 to avoid memory pressure
 *
 * Schedule: Weekly, Wednesdays 2 AM UTC (offset from Sunday curator job at 3 AM)
 */

const BATCH_SIZE = 100;

/**
 * Infer region from zip code.
 * Simplistic mapping for now — can be expanded with full zip code ranges.
 */
function inferRegionFromZip(zip?: string): string {
  if (!zip) return 'NATIONAL';

  const zipNum = parseInt(zip.substring(0, 2), 10);
  if (isNaN(zipNum)) return 'NATIONAL';

  // Rough USPS regions:
  if (zipNum >= 0 && zipNum <= 27) return 'NORTHEAST'; // 00000–27999
  if (zipNum >= 28 && zipNum <= 42) return 'SOUTHEAST'; // 28000–42999
  if (zipNum >= 43 && zipNum <= 71) return 'MIDWEST'; // 43000–71999
  if (zipNum >= 72 && zipNum <= 99) return 'WEST'; // 72000–99999

  return 'NATIONAL';
}

/**
 * Run a single batch of backfill operations.
 */
async function backfillBatch(skip: number): Promise<{
  processed: number;
  created: number;
  skipped: number;
}> {
  const result = { processed: 0, created: 0, skipped: 0 };

  // Fetch items with aiSuggestedPrice
  const items = await prisma.item.findMany({
    where: {
      aiSuggestedPrice: { not: null },
      category: { not: null },
      condition: { not: null },
    },
    include: {
      sale: {
        select: { zipCode: true },
      },
      purchases: {
        where: { status: 'PAID' },
        select: { finalPrice: true },
        take: 1,
      },
    },
    skip,
    take: BATCH_SIZE,
  });

  if (items.length === 0) {
    return result;
  }

  console.log(`[backfillBenchmarks] Processing batch: skip=${skip}, items=${items.length}`);

  for (const item of items) {
    result.processed++;

    // Determine price: prefer aiSuggestedPrice, fallback to sold price
    const priceInDollars = item.aiSuggestedPrice
      ? Number(item.aiSuggestedPrice)
      : item.purchases[0]?.finalPrice ?? 0;

    if (priceInDollars <= 0) {
      result.skipped++;
      continue;
    }

    const category = item.category!;
    const condition = item.condition!;
    const priceInCents = Math.round(priceInDollars * 100);

    // Check if a benchmark already exists for this category + condition + dataSource
    // within $10 price band
    const existingBenchmark = await prisma.priceBenchmark.findFirst({
      where: {
        entry: {
          // PriceBenchmark doesn't have category/condition directly — it has a relation to EncyclopediaEntry
          // But we're creating standalone benchmarks, so we need to understand the schema better.
          // Re-read: PriceBenchmark has entryId (FK to EncyclopediaEntry), condition, dataSource
          // So we can't query by item.category directly. Instead, find similar benchmarks by condition + region
        },
      },
    });

    // Actually, looking at the schema more carefully: PriceBenchmark is tied to EncyclopediaEntry, not Item.
    // But the task says to create benchmarks from Items. This suggests we either:
    // 1. Create EncyclopediaEntry records first (but that seems wrong — those are curated)
    // 2. Store benchmarks differently, OR
    // 3. The design allows PriceBenchmark to exist without an entry (entryId optional)?
    //
    // Looking at valuationService.ts line 64, benchmarks ARE queried with:
    //   where: { entry: { category: ... }, condition: ... }
    // This means benchmarks are tied to encyclopedia entries, which have categories.
    //
    // Decision: Create EncyclopediaEntry stubs with AUTO_GENERATED status + benchmarks.
    // This way: (a) benchmarks are correctly tied to entries, (b) curator job can later enrich them,
    // (c) valuationService queries continue to work.

    const infoStr = `[backfillBenchmarks] Item ${item.id}: category=${category}, condition=${condition}, price=$${(priceInCents / 100).toFixed(2)}`;

    // Create or retrieve encyclopedia entry for this category
    let entry = await prisma.encyclopediaEntry.findFirst({
      where: {
        category,
        status: 'AUTO_GENERATED',
      },
      include: {
        benchmarks: {
          where: {
            dataSource: 'haiku_inferred',
            condition,
          },
        },
      },
    });

    if (!entry) {
      // Create a minimal encyclopedia entry stub
      entry = await prisma.encyclopediaEntry.create({
        data: {
          slug: `${category.toLowerCase().replace(/\s+/g, '-')}-auto`,
          title: `${category} (auto-generated)`,
          category,
          status: 'AUTO_GENERATED',
          content: '(AI-generated benchmark entry)',
          benchmarks: {
            create: {
              condition,
              region: inferRegionFromZip(item.sale?.zipCode),
              priceRangeLow: Math.round(priceInCents * 0.7),
              priceRangeHigh: Math.round(priceInCents * 1.3),
              dataSource: 'haiku_inferred',
            },
          },
        },
        include: {
          benchmarks: {
            where: { dataSource: 'haiku_inferred', condition },
          },
        },
      });

      console.log(`${infoStr} → CREATED entry + benchmark`);
      result.created++;
    } else {
      // Entry exists. Check if a benchmark with the same condition exists within $10 band
      const existingBench = entry.benchmarks.find(
        (b) =>
          b.condition === condition &&
          Math.abs(b.priceRangeLow / 100 - priceInDollars) <= 10 &&
          Math.abs(b.priceRangeHigh / 100 - priceInDollars) <= 10
      );

      if (existingBench) {
        console.log(`${infoStr} → SKIPPED (benchmark within $10 band already exists)`);
        result.skipped++;
      } else {
        // Create new benchmark for this condition
        await prisma.priceBenchmark.create({
          data: {
            entryId: entry.id,
            condition,
            region: inferRegionFromZip(item.sale?.zipCode),
            priceRangeLow: Math.round(priceInCents * 0.7),
            priceRangeHigh: Math.round(priceInCents * 1.3),
            dataSource: 'haiku_inferred',
          },
        });

        console.log(`${infoStr} → CREATED benchmark (condition variant)`);
        result.created++;
      }
    }
  }

  return result;
}

/**
 * Main backfill loop — process items in batches until exhausted.
 */
export async function runBackfillBenchmarks(): Promise<{
  totalProcessed: number;
  totalCreated: number;
  totalSkipped: number;
  errors: string[];
}> {
  const startTime = Date.now();
  console.log('[backfillBenchmarks] Starting backfill job');

  const result = {
    totalProcessed: 0,
    totalCreated: 0,
    totalSkipped: 0,
    errors: [] as string[],
  };

  try {
    let skip = 0;
    let batchNum = 0;

    while (true) {
      batchNum++;
      try {
        const batchResult = await backfillBatch(skip);

        result.totalProcessed += batchResult.processed;
        result.totalCreated += batchResult.created;
        result.totalSkipped += batchResult.skipped;

        if (batchResult.processed < BATCH_SIZE) {
          // Last batch was incomplete — we're done
          break;
        }

        skip += BATCH_SIZE;
      } catch (error: any) {
        const errorMsg = `Batch ${batchNum} failed: ${error.message}`;
        console.error(`[backfillBenchmarks] ${errorMsg}`);
        result.errors.push(errorMsg);
        break; // Stop on batch error to avoid infinite loop
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[backfillBenchmarks] Job complete in ${elapsed}ms. Processed: ${result.totalProcessed}, Created: ${result.totalCreated}, Skipped: ${result.totalSkipped}, Errors: ${result.errors.length}`
    );

    return result;
  } catch (error: any) {
    const errorMsg = `Backfill benchmarks job failed: ${error.message}`;
    console.error(`[backfillBenchmarks] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Schedule the backfill job to run weekly on Wednesdays at 2 AM UTC.
 * Cron: minute hour dayOfMonth month dayOfWeek
 *        0     2    *           *     3 (Wednesday)
 */
cron.schedule('0 2 * * 3', async () => {
  console.log('[backfillBenchmarks] Scheduled job triggered');
  await runBackfillBenchmarks();
});

console.log('[backfillBenchmarks] Backfill benchmarks job scheduled (Wednesday 2 AM UTC)');
