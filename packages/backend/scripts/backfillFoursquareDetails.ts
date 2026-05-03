/**
 * Backfill script for existing Foursquare RETAIL listings
 * 
 * Queries all RETAIL sales with fsqId but missing photoUrls, then calls
 * Foursquare Details API to enrich each record.
 * 
 * Usage:
 *   npx ts-node scripts/backfillFoursquareDetails.ts
 * 
 * Environment:
 *   Set DATABASE_URL and FOURSQUARE_API_KEY via .env or export
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FOURSQUARE_API_VERSION = '2025-06-17';
const DETAILS_DELAY_MS = 300;

interface FoursquarePlaceDetails {
  hours?: {
    display?: string;
    open_now?: boolean;
    regular?: Array<{ day: number; open: string; close: string }>;
  };
  photos?: Array<{
    prefix: string;
    suffix: string;
    width?: number;
    height?: number;
  }>;
  description?: string;
  rating?: number;
}

/**
 * Fetch detailed information for a single Foursquare place.
 */
async function fetchFoursquareDetails(
  apiKey: string,
  fsqId: string
): Promise<FoursquarePlaceDetails | null> {
  try {
    const url = new URL(`https://places-api.foursquare.com/places/${fsqId}`);
    url.searchParams.set('fields', 'hours,photos,description,rating');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Places-Api-Version': FOURSQUARE_API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn(`[Backfill] HTTP ${response.status} for fsqId=${fsqId}`);
      return null;
    }

    return (await response.json()) as FoursquarePlaceDetails;
  } catch (err) {
    console.warn(
      `[Backfill] Fetch error for fsqId=${fsqId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

async function backfillFoursquareDetails() {
  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FOURSQUARE_API_KEY is not set');
  }

  console.log('[Backfill] Starting Foursquare details backfill...');

  // Query all RETAIL sales with fsqId but no photoUrls
  const listings = await prisma.sale.findMany({
    where: {
      saleType: 'RETAIL',
      photoUrls: {
        isEmpty: true, // Array is empty
      },
      NOT: {
        scrapedMetadata: {
          equals: 'DbNull' as any,
        },
      },
    },
    select: {
      id: true,
      title: true,
      scrapedMetadata: true,
    },
    take: 10000, // Reasonable limit to avoid huge queries
  });

  console.log(`[Backfill] Found ${listings.length} RETAIL listings to enrich`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const listing of listings) {
    processed++;

    // Extract fsqId from scrapedMetadata
    const fsqId = (listing.scrapedMetadata as any)?.fsqId;
    if (!fsqId) {
      skipped++;
      continue;
    }

    // Fetch details
    const details = await fetchFoursquareDetails(apiKey, fsqId);

    if (!details) {
      failed++;
      console.log(`[Backfill] (${processed}/${listings.length}) ${listing.title}: API call failed`);
      await new Promise((resolve) => setTimeout(resolve, DETAILS_DELAY_MS));
      continue;
    }

    // Build photoUrls array
    const photoUrls: string[] = [];
    if (details.photos && details.photos.length > 0) {
      for (let i = 0; i < Math.min(3, details.photos.length); i++) {
        const photo = details.photos[i];
        photoUrls.push(`${photo.prefix}original${photo.suffix}`);
      }
    }

    // Update the sale record
    try {
      const updateData: any = {
        lastScrapedAt: new Date(),
      };

      if (photoUrls.length > 0) {
        updateData.photoUrls = photoUrls;
      }

      if (details.description) {
        updateData.description = details.description;
      }

      // Merge scrapedMetadata
      const currentMetadata = (listing.scrapedMetadata && typeof listing.scrapedMetadata === 'object' && !Array.isArray(listing.scrapedMetadata))
        ? (listing.scrapedMetadata as Record<string, unknown>)
        : {};
      updateData.scrapedMetadata = {
        ...currentMetadata,
        hours: details.hours ?? null,
        hours_display: details.hours?.display ?? null,
        rating: details.rating ?? null,
      };

      await prisma.sale.update({
        where: { id: listing.id },
        data: updateData,
      });

      updated++;
      if (processed % 50 === 0) {
        console.log(
          `[Backfill] Progress: ${processed}/${listings.length} processed, ${updated} updated, ${failed} failed`
        );
      }
    } catch (err) {
      failed++;
      console.error(`[Backfill] Failed to update sale ${listing.id}:`, err);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, DETAILS_DELAY_MS));
  }

  console.log(`[Backfill] Complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no fsqId): ${skipped}`);
  console.log(`  Failed: ${failed}`);
}

// Run the backfill
backfillFoursquareDetails()
  .then(() => {
    console.log('[Backfill] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Backfill] Fatal error:', err);
    process.exit(1);
  });
