/**
 * googleMerchantFeedService.ts — Feature #463
 *
 * Owns: (1) querying eligible items from the DB, (2) building the TSV,
 * (3) an in-memory cache shared between the nightly cron and the public route.
 *
 * The cron calls buildAndCacheFeed() nightly to refresh both the in-memory cache
 * and the Cloudinary raw artifact. The route calls getCachedFeed() and, on a cold
 * cache (e.g. fresh boot before the first cron run), falls back to building
 * on-demand so the endpoint never returns a 0-byte or empty response.
 */

import { prisma } from '../lib/prisma';
import { v2 as cloudinary } from 'cloudinary';
import {
  buildGoogleMerchantTsv,
  FeedItem,
} from '../utils/googleMerchantFeed';

// Cloudinary public_id for the raw feed artifact (overwritten each run).
const CLOUDINARY_PUBLIC_ID = 'findasale/feeds/google-merchant';

// 6-hour soft TTL for the on-demand fallback path. The cron is the primary
// refresh mechanism (nightly); this only matters if the cron hasn't run yet.
const FALLBACK_TTL_MS = 6 * 60 * 60 * 1000;

interface FeedCache {
  tsv: string;
  builtAt: number; // epoch ms
  itemCount: number;
  cloudinaryUrl: string | null;
}

let cache: FeedCache | null = null;

function ensureCloudinaryConfigured(): void {
  if (!cloudinary.config().cloud_name) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}

/**
 * Query all candidate items joined to their parent sale. We pre-filter as much
 * as possible at the DB layer for performance, then apply the full eligibility
 * predicate in JS (single source of truth in googleMerchantFeed.ts).
 */
async function fetchFeedItems(): Promise<FeedItem[]> {
  const rows = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      isActive: true,
      deletedAt: null,
      draftStatus: 'PUBLISHED',
      price: { gt: 0 },
      listingType: { notIn: ['AUCTION', 'REVERSE_AUCTION'] },
      sale: {
        is: {
          status: 'PUBLISHED',
          deletedAt: null,
        },
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      currency: true,
      photoUrls: true,
      condition: true,
      brand: true,
      upc: true,
      ean: true,
      isbn: true,
      mpn: true,
      category: true,
      status: true,
      isActive: true,
      deletedAt: true,
      draftStatus: true,
      listingType: true,
      sale: {
        select: {
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  return rows as unknown as FeedItem[];
}

/**
 * Build the TSV from current DB state and store it in the in-memory cache.
 * Returns the cache entry. Does NOT upload to Cloudinary (route fallback path).
 */
export async function buildFeed(): Promise<FeedCache> {
  const items = await fetchFeedItems();
  const tsv = buildGoogleMerchantTsv(items);
  cache = {
    tsv,
    builtAt: Date.now(),
    itemCount: items.length,
    cloudinaryUrl: cache?.cloudinaryUrl ?? null,
  };
  return cache;
}

/**
 * Build the feed AND upload the TSV to Cloudinary as a raw artifact.
 * Called nightly by the cron. Cloudinary failure is non-fatal — the in-memory
 * cache is still refreshed so the route keeps serving.
 */
export async function buildAndCacheFeed(): Promise<FeedCache> {
  const entry = await buildFeed();

  try {
    ensureCloudinaryConfigured();
    const buffer = Buffer.from(entry.tsv, 'utf-8');

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: CLOUDINARY_PUBLIC_ID,
          overwrite: true,
          invalidate: true,
          format: 'tsv',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new Error('No result from Cloudinary'));
          }
          resolve(result as { secure_url: string });
        }
      );
      stream.end(buffer);
    });

    if (cache) {
      cache.cloudinaryUrl = uploadResult.secure_url;
    }
    console.log(
      `[google-merchant-feed] Uploaded feed to Cloudinary (${entry.itemCount} items): ${uploadResult.secure_url}`
    );
  } catch (err) {
    console.error(
      '[google-merchant-feed] Cloudinary upload failed (in-memory cache still refreshed):',
      err instanceof Error ? err.message : String(err)
    );
  }

  return cache!;
}

/**
 * Return the cached TSV. On a cold or stale cache, rebuild on-demand so the
 * route never serves an empty or 0-byte body.
 */
export async function getCachedFeed(): Promise<FeedCache> {
  const now = Date.now();
  if (!cache || now - cache.builtAt > FALLBACK_TTL_MS) {
    return buildFeed();
  }
  return cache;
}

/** Exposed for the cron's logging. */
export function getCacheMeta(): { builtAt: number; itemCount: number } | null {
  if (!cache) return null;
  return { builtAt: cache.builtAt, itemCount: cache.itemCount };
}
