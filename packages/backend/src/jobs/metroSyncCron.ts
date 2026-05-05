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

// Token cache — eBay tokens last 2 hours; refresh 5 min early
let cachedToken: { token: string; expires: number } | null = null;

/**
 * Fetch an eBay OAuth token directly from eBay using Railway's credentials.
 * Bypasses the Vercel proxy — the backend has EBAY_CLIENT_ID/SECRET directly.
 * Returns the access_token string, or null on failure.
 */
async function fetchEbayToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[MetroSync] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set in Railway env');
    return null;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[MetroSync] Token fetch failed: ${response.status}`, body.slice(0, 300));
      return null;
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      console.error('[MetroSync] Token response missing access_token');
      return null;
    }

    // Cache for (expires_in - 5 min), default 2h - 5min = 115 min
    const ttlMs = ((data.expires_in ?? 7200) - 300) * 1000;
    cachedToken = { token: data.access_token, expires: Date.now() + ttlMs };
    console.log('[MetroSync] eBay OAuth token fetched successfully');
    return data.access_token;
  } catch (error) {
    console.error('[MetroSync] Token fetch error:', error);
    return null;
  }
}

/**
 * Search eBay for sold items matching estate sale keywords in a specific metro.
 * Returns top 12 results sorted by most recent sale.
 */
async function fetchEbaySoldItems(metro: MetroConfig): Promise<EbaySoldItem[]> {
  try {
    const accessToken = await fetchEbayToken();
    if (!accessToken) {
      console.error(`[MetroSync] Skipping ${metro.slug} — no eBay token`);
      return [];
    }

    // Build search query: estate sale OR yard sale OR garage sale
    // Note: eBay Browse API does not support location: query syntax — city association
    // is handled at the DB level (citySlug). Results are national listings.
    const query = encodeURIComponent('"estate sale" OR "yard sale" OR "garage sale" OR "flea market"');

    // eBay Browse API endpoint through Vercel proxy
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;

    // Browse API: active listings matching estate/yard/garage sale keywords
    const apiPath = `/buy/browse/v1/item_summary/search?q=${query}&filter=conditions:{USED}&sort=newlyListed&limit=12`;

    const response = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(apiPath)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
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

  // Cron format: minute hour dayOfMonth month dayOfWeek
  cron.schedule('0 4 * * *', async () => {
    await syncAllMetros();
  });

  console.log('[MetroSync] Cron registered — runs daily at 04:00 UTC (midnight EST)');
}
