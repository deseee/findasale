/**
 * curatorReviewJob.ts — ADR-069 Phase 2
 *
 * Automated curator review for AUTO_GENERATED Encyclopedia entries.
 * Promotes entries to PUBLISHED when:
 * 1. Wikipedia content is found AND
 * 2. Price range passes sanity checks
 *
 * Runs weekly (Sunday 3am UTC).
 * Can be triggered manually via /api/admin/curator/run
 */

import cron from 'node-cron';
import axios from 'axios';
import { prisma } from '../lib/prisma';

const BATCH_SIZE = 20;
const WIKIPEDIA_DELAY_MS = 500; // Be a good citizen to Wikipedia API
const PRICE_SANITY_MIN_CENTS = 100; // $1.00
const PRICE_SANITY_MAX_CENTS = 5000000; // $50,000

interface WikipediaSearchResult {
  batchcomplete?: boolean;
  query?: {
    search?: Array<{
      ns: number;
      title: string;
      pageid: number;
      size: number;
      wordcount: number;
      timestamp: string;
    }>;
  };
}

interface WikipediaSummaryResponse {
  type?: string;
  title?: string;
  displaytitle?: string;
  namespace?: { id: number; case: string };
  wikibase_item?: string;
  titles?: { canonical: string; display: string };
  extract?: string;
  extract_html?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  lang?: string;
  dir?: string;
  revision?: string;
  lastrevdate?: string;
  description?: string;
}

/**
 * Fetch Wikipedia summary for a given title.
 * Returns null if not found or if extract is too short.
 */
async function fetchWikipediaSummary(title: string): Promise<string | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

    const response = await axios.get<WikipediaSummaryResponse>(url, {
      timeout: 5000,
    });

    if (response.data.extract && response.data.extract.length > 100) {
      return response.data.extract;
    }

    return null;
  } catch (error: any) {
    // 404 or other error — try search fallback
    if (error.response?.status === 404) {
      return await searchWikipediaAndFetchFirst(title);
    }
    console.warn(`[curatorReview] Wikipedia fetch failed for "${title}":`, error.message);
    return null;
  }
}

/**
 * Search Wikipedia and fetch summary for the first result.
 */
async function searchWikipediaAndFetchFirst(title: string): Promise<string | null> {
  try {
    const searchUrl = 'https://en.wikipedia.org/w/api.php';
    const searchResponse = await axios.get<WikipediaSearchResult>(searchUrl, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: title,
        format: 'json',
        srlimit: 1,
      },
      timeout: 5000,
    });

    const results = searchResponse.data?.query?.search;
    if (!results || results.length === 0) {
      return null;
    }

    // Fetch summary of first result
    const firstResultTitle = results[0].title;
    const encodedTitle = encodeURIComponent(firstResultTitle);
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

    const summaryResponse = await axios.get<WikipediaSummaryResponse>(summaryUrl, {
      timeout: 5000,
    });

    if (summaryResponse.data.extract && summaryResponse.data.extract.length > 100) {
      return summaryResponse.data.extract;
    }

    return null;
  } catch (error: any) {
    console.warn(`[curatorReview] Wikipedia search failed for "${title}":`, error.message);
    return null;
  }
}

/**
 * Validate price range against sanity checks.
 */
function isPriceRangePlausible(priceLowCents: number, priceHighCents: number): boolean {
  if (priceLowCents >= priceHighCents) {
    return false;
  }
  if (priceLowCents < PRICE_SANITY_MIN_CENTS) {
    return false;
  }
  if (priceHighCents > PRICE_SANITY_MAX_CENTS) {
    return false;
  }
  return true;
}

/**
 * Enrich content by prepending Wikipedia extract as an Overview section.
 */
function enrichContentWithWikipedia(existingContent: string, wikipediaExtract: string): string {
  const overviewSection = `## Overview\n\n${wikipediaExtract}\n\n---\n\n`;
  return overviewSection + existingContent;
}

/**
 * Run the curator review job for a batch of AUTO_GENERATED entries.
 */
export async function runCuratorReview(): Promise<{
  processed: number;
  promoted: number;
  enrichedButFlagged: number;
  notFound: number;
  errors: string[];
}> {
  const startTime = Date.now();
  console.log('[curatorReview] Starting curator review job');

  const result = {
    processed: 0,
    promoted: 0,
    enrichedButFlagged: 0,
    notFound: 0,
    errors: [] as string[],
  };

  try {
    // Fetch AUTO_GENERATED entries in batch
    const entries = await prisma.encyclopediaEntry.findMany({
      where: { status: 'AUTO_GENERATED' },
      include: { benchmarks: true },
      take: BATCH_SIZE,
    });

    console.log(`[curatorReview] Found ${entries.length} AUTO_GENERATED entries to process`);

    for (const entry of entries) {
      result.processed++;

      try {
        // Fetch Wikipedia content
        const wikipediaExtract = await fetchWikipediaSummary(entry.title);

        if (!wikipediaExtract) {
          console.log(`[curatorReview] No Wikipedia match for: ${entry.slug}`);
          result.notFound++;
          continue;
        }

        // Check price benchmarks
        const benchmark = entry.benchmarks[0];
        if (!benchmark) {
          console.warn(
            `[curatorReview] No price benchmark found for entry ${entry.id} (${entry.slug})`
          );
          result.enrichedButFlagged++;
          // Enrich content but keep AUTO_GENERATED
          const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
          await prisma.encyclopediaEntry.update({
            where: { id: entry.id },
            data: { content: enrichedContent },
          });
          continue;
        }

        const priceRangePlausible = isPriceRangePlausible(
          benchmark.priceRangeLow,
          benchmark.priceRangeHigh
        );

        if (priceRangePlausible) {
          // Promote to PUBLISHED
          const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
          await prisma.encyclopediaEntry.update({
            where: { id: entry.id },
            data: {
              status: 'PUBLISHED',
              content: enrichedContent,
            },
          });
          console.log(
            `[curatorReview] ✓ PUBLISHED: ${entry.slug} (price range: $${(benchmark.priceRangeLow / 100).toFixed(2)}–$${(benchmark.priceRangeHigh / 100).toFixed(2)})`
          );
          result.promoted++;
        } else {
          // Enrich but flag price range as bad
          const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
          await prisma.encyclopediaEntry.update({
            where: { id: entry.id },
            data: {
              content: enrichedContent,
              // Leave as AUTO_GENERATED — requires manual review
            },
          });
          console.warn(
            `[curatorReview] ⚠️  FLAGGED (bad price): ${entry.slug} (range: ${benchmark.priceRangeLow}–${benchmark.priceRangeHigh} cents)`
          );
          result.enrichedButFlagged++;
        }

        // Rate limiting — be respectful to Wikipedia
        await new Promise((resolve) => setTimeout(resolve, WIKIPEDIA_DELAY_MS));
      } catch (error: any) {
        const errorMsg = `Failed to process entry ${entry.slug}: ${error.message}`;
        console.error(`[curatorReview] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[curatorReview] Job complete in ${elapsed}ms. Promoted: ${result.promoted}, Flagged: ${result.enrichedButFlagged}, Not found: ${result.notFound}, Errors: ${result.errors.length}`
    );

    return result;
  } catch (error: any) {
    const errorMsg = `Curator review job failed: ${error.message}`;
    console.error(`[curatorReview] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Test endpoint — run curator review for a single entry.
 */
export async function runCuratorReviewSingle(entryId: string): Promise<{
  success: boolean;
  promoted: boolean;
  message: string;
  error?: string;
}> {
  try {
    const entry = await prisma.encyclopediaEntry.findUnique({
      where: { id: entryId },
      include: { benchmarks: true },
    });

    if (!entry) {
      return {
        success: false,
        promoted: false,
        message: `Entry not found: ${entryId}`,
        error: `Entry not found: ${entryId}`,
      };
    }

    if (entry.status !== 'AUTO_GENERATED') {
      return {
        success: false,
        promoted: false,
        message: `Entry is not AUTO_GENERATED (current status: ${entry.status})`,
      };
    }

    // Fetch Wikipedia content
    const wikipediaExtract = await fetchWikipediaSummary(entry.title);

    if (!wikipediaExtract) {
      return {
        success: true,
        promoted: false,
        message: `No Wikipedia match for: ${entry.slug}`,
      };
    }

    // Check price benchmarks
    const benchmark = entry.benchmarks[0];
    if (!benchmark) {
      const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
      await prisma.encyclopediaEntry.update({
        where: { id: entry.id },
        data: { content: enrichedContent },
      });
      return {
        success: true,
        promoted: false,
        message: `Enriched but flagged: no price benchmark found`,
      };
    }

    const priceRangePlausible = isPriceRangePlausible(
      benchmark.priceRangeLow,
      benchmark.priceRangeHigh
    );

    if (priceRangePlausible) {
      const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
      await prisma.encyclopediaEntry.update({
        where: { id: entry.id },
        data: {
          status: 'PUBLISHED',
          content: enrichedContent,
        },
      });
      return {
        success: true,
        promoted: true,
        message: `✓ PUBLISHED: ${entry.slug} (price range: $${(benchmark.priceRangeLow / 100).toFixed(2)}–$${(benchmark.priceRangeHigh / 100).toFixed(2)})`,
      };
    } else {
      const enrichedContent = enrichContentWithWikipedia(entry.content, wikipediaExtract);
      await prisma.encyclopediaEntry.update({
        where: { id: entry.id },
        data: { content: enrichedContent },
      });
      return {
        success: true,
        promoted: false,
        message: `Enriched but flagged: bad price range (${benchmark.priceRangeLow}–${benchmark.priceRangeHigh} cents)`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      promoted: false,
      message: `Error processing entry: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Schedule the curator review job to run weekly on Sunday at 3am UTC.
 */
cron.schedule('0 3 * * 0', async () => {
  console.log('[curatorReview] Scheduled job triggered');
  await runCuratorReview();
});

console.log('[curatorReview] Curator review job scheduled (Sunday 3am UTC)');
