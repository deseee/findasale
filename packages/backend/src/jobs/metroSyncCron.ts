/**
 * metroSyncCron.ts — ADR-074: Metro Sync
 *
 * Nightly cron job (04:00 UTC) that polls eBay for sold items matching estate sale keywords
 * for major US metro areas, then upserts the top 12 results into MetroTopFinds table.
 *
 * Used by city pages to display regional sales trends and market data to organizers.
 */

import cron from 'node-cron';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

// Phase 1: 20 major metro markets (can expand to 50+ in Phase 2)
interface MetroConfig {
  slug: string;      // e.g., "grand-rapids-mi"
  metro: string;     // Display name: "Grand Rapids, MI"
  ebayLocation: string; // eBay search location filter
}

const METRO_CITIES: MetroConfig[] = [
  { slug: 'grand-rapids-mi', metro: 'Grand Rapids, MI', ebayLocation: 'Grand Rapids, Michigan' },
  { slug: 'chicago-il', metro: 'Chicago, IL', ebayLocation: 'Chicago, Illinois' },
  { slug: 'detroit-mi', metro: 'Detroit, MI', ebayLocation: 'Detroit, Michigan' },
  { slug: 'cleveland-oh', metro: 'Cleveland, OH', ebayLocation: 'Cleveland, Ohio' },
  { slug: 'columbus-oh', metro: 'Columbus, OH', ebayLocation: 'Columbus, Ohio' },
  { slug: 'cincinnati-oh', metro: 'Cincinnati, OH', ebayLocation: 'Cincinnati, Ohio' },
  { slug: 'indianapolis-in', metro: 'Indianapolis, IN', ebayLocation: 'Indianapolis, Indiana' },
  { slug: 'milwaukee-wi', metro: 'Milwaukee, WI', ebayLocation: 'Milwaukee, Wisconsin' },
  { slug: 'minneapolis-mn', metro: 'Minneapolis, MN', ebayLocation: 'Minneapolis, Minnesota' },
  { slug: 'st-louis-mo', metro: 'St. Louis, MO', ebayLocation: 'St. Louis, Missouri' },
  { slug: 'kansas-city-mo', metro: 'Kansas City, MO', ebayLocation: 'Kansas City, Missouri' },
  { slug: 'nashville-tn', metro: 'Nashville, TN', ebayLocation: 'Nashville, Tennessee' },
  { slug: 'louisville-ky', metro: 'Louisville, KY', ebayLocation: 'Louisville, Kentucky' },
  { slug: 'memphis-tn', metro: 'Memphis, TN', ebayLocation: 'Memphis, Tennessee' },
  { slug: 'atlanta-ga', metro: 'Atlanta, GA', ebayLocation: 'Atlanta, Georgia' },
  { slug: 'charlotte-nc', metro: 'Charlotte, NC', ebayLocation: 'Charlotte, North Carolina' },
  { slug: 'pittsburgh-pa', metro: 'Pittsburgh, PA', ebayLocation: 'Pittsburgh, Pennsylvania' },
  { slug: 'buffalo-ny', metro: 'Buffalo, NY', ebayLocation: 'Buffalo, New York' },
  { slug: 'richmond-va', metro: 'Richmond, VA', ebayLocation: 'Richmond, Virginia' },
  { slug: 'baltimore-md', metro: 'Baltimore, MD', ebayLocation: 'Baltimore, Maryland' },
];

interface EbaySoldItem {
  title: string;
  price: {
    value: string;
    currency: string;
  };
  condition?: string;
  image?: {
    imageUrl: string;
  };
  itemId: string;
}

/**
 * Search eBay for sold items matching estate sale keywords in a specific metro.
 * Returns top 12 results sorted by most recent sale.
 */
async function fetchEbaySoldItems(metro: MetroConfig): Promise<EbaySoldItem[]> {
  try {
    // Build search query: estate sale OR yard sale OR garage sale + location
    const query = encodeURIComponent(`("estate sale" OR "yard sale" OR "garage sale") location:"${metro.ebayLocation}"`);

    // eBay Browse API endpoint through Vercel proxy
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;

    // Browse API: search_for_items_by_keyword (completed items only)
    const apiPath = `/buy/browse/v1/item_summary/search?q=${query}&filter=conditions:{USED|NOT_SPECIFIED}&sort=newlyListed&limit=12`;

    const response = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(apiPath)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
        },
      }
    );

    if (!response.ok) {
      console.error(
        `[MetroSync] eBay API error for ${metro.slug}: ${response.status}`
      );
      return [];
    }

    const data = (await response.json()) as { itemSummaries?: EbaySoldItem[] };
    return data.itemSummaries || [];
  } catch (error) {
    console.error(`[MetroSync] Fetch error for ${metro.slug}:`, error);
    return [];
  }
}

/**
 * Sync sold items for a single metro area.
 */
async function syncMetroTopFinds(metro: MetroConfig): Promise<number> {
  let count = 0;

  try {
    console.log(`[MetroSync] Starting sync for ${metro.metro}...`);

    const items = await fetchEbaySoldItems(metro);

    if (!items.length) {
      console.log(`[MetroSync] No items found for ${metro.metro}`);
      return count;
    }

    // Upsert each item into MetroTopFinds
    for (const item of items) {
      try {
        const soldPrice = parseFloat(item.price?.value || '0');
        if (soldPrice <= 0) continue; // Skip invalid prices

        await prisma.metroTopFinds.upsert({
          where: {
            citySlug_ebayListingId: {
              citySlug: metro.slug,
              ebayListingId: item.itemId,
            },
          },
          update: {
            itemTitle: item.title,
            itemCategory: item.condition,
            soldPrice: new Decimal(soldPrice),
            imageUrl: item.image?.imageUrl || null,
            updatedAt: new Date(),
          },
          create: {
            citySlug: metro.slug,
            metro: metro.metro,
            itemTitle: item.title,
            itemCategory: item.condition,
            soldPrice: new Decimal(soldPrice),
            imageUrl: item.image?.imageUrl || null,
            ebayListingId: item.itemId,
            soldAt: new Date(),
          },
        });

        count++;
      } catch (err) {
        console.warn(
          `[MetroSync] Failed to upsert item ${item.itemId} for ${metro.slug}:`,
          err
        );
        // Continue — one item failure shouldn't block others
      }
    }

    console.log(
      `[MetroSync] ${metro.metro}: synced ${count} items`
    );
  } catch (error) {
    console.error(`[MetroSync] Error syncing ${metro.slug}:`, error);
  }

  return count;
}

/**
 * Main cron function: sync all metro areas.
 */
async function syncAllMetros(): Promise<void> {
  const startTime = new Date();
  let totalSynced = 0;

  try {
    console.log('[MetroSync] Starting nightly sync (04:00 UTC)...');

    // Process metros sequentially to avoid eBay rate limits
    for (const metro of METRO_CITIES) {
      const synced = await syncMetroTopFinds(metro);
      totalSynced += synced;

      // Small delay between metros to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const elapsed = Math.round((Date.now() - startTime.getTime()) / 1000);
    console.log(
      `[MetroSync] Sync complete: ${totalSynced} items across ${METRO_CITIES.length} metros in ${elapsed}s`
    );
  } catch (error) {
    console.error('[MetroSync] Fatal error:', error);
  }
}

/**
 * Initialize and schedule the cron job.
 * Gated by METRO_SYNC_ENABLED env var.
 */
export function initMetroSyncCron(): void {
  if (process.env.METRO_SYNC_ENABLED !== 'true') {
    console.log('[MetroSync] Disabled (METRO_SYNC_ENABLED not set to true)');
    return;
  }

  // TEMP: one-time run at 17:20 UTC 2026-05-04 to seed MetroTopFinds — revert to '0 4 * * *' after
  cron.schedule('20 17 * * *', async () => {
    await syncAllMetros();
  });

  console.log('[MetroSync] Cron registered — runs at 17:20 UTC (TEMP — revert to 04:00 after seeding)');
}
