/**
 * ADR-075: EstateSales.NET Sale Detail Enrichment
 * Scrapes sale descriptions and photos from ESN sale pages via schema.org JSON-LD
 *
 * Design principles:
 * - Stealth-first: Random delays (4–12s), shuffled batch order, active-first weighting
 * - HTML-only: No API endpoints, fetch sourceUrl and parse schema.org SaleEvent
 * - Rate limit: 4–6 requests per minute, respects robots.txt, graceful 429 handling
 * - Skip enriched: Skip any sale where description IS NOT NULL AND photoUrls.length > 0
 */

import { prisma } from '../../lib/prisma';
import { getRandomUserAgent } from './userAgents';
import { defaultRateLimiter } from './rateLimiter';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

interface EnrichmentResult {
  processed: number;
  enriched: number;
  skipped: number;
  aborted: boolean;
}

interface SaleEventSchema {
  '@type'?: string;
  description?: string;
  image?: string | string[];
}

/**
 * Extract schema.org SaleEvent data from HTML
 */
function extractSaleEventData(html: string): { description: string | null; images: string[] } {
  const images: string[] = [];
  let description: string | null = null;

  try {
    // Find all <script type="application/ld+json"> blocks
    const schemaMatches = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
    if (!schemaMatches) {
      return { description, images };
    }

    for (const match of schemaMatches) {
      const jsonStr = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      if (!jsonStr) continue;

      try {
        const data = JSON.parse(jsonStr) as SaleEventSchema;

        if (data['@type'] === 'SaleEvent') {
          // Extract description
          if (data.description && !description) {
            description = data.description
              .replace(/<[^>]*>/g, '') // Strip HTML tags
              .replace(/\s+/g, ' ') // Collapse whitespace
              .trim();
          }

          // Extract images
          if (data.image) {
            if (typeof data.image === 'string') {
              if (data.image && !images.includes(data.image)) {
                images.push(data.image);
              }
            } else if (Array.isArray(data.image)) {
              for (const img of data.image) {
                if (typeof img === 'string' && img && !images.includes(img)) {
                  images.push(img);
                }
              }
            }
          }
        }
      } catch {
        // Skip malformed JSON blocks
        continue;
      }
    }
  } catch (error) {
    console.warn('[SaleDetailEnrichment] Error extracting schema data:', error);
  }

  return { description, images };
}

/**
 * Mirror hotlink-blocked images to Cloudinary
 * Downloads each image server-side (bypasses hotlink protection) and uploads to Cloudinary
 * Returns array of Cloudinary URLs; skips failed downloads/uploads gracefully
 */
async function mirrorImagesToCloudinary(imageUrls: string[], saleId: string): Promise<string[]> {
  const cloudinaryUrls: string[] = [];
  const maxImages = 5; // Limit to 5 images per sale

  // Configure Cloudinary if not already configured
  if (!cloudinary.config().cloud_name) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  for (let i = 0; i < Math.min(imageUrls.length, maxImages); i++) {
    const imageUrl = imageUrls[i];
    if (!imageUrl) continue;

    try {
      // Fetch image with axios — no browser Referer, bypasses hotlink protection
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const imageBuffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] || 'image/jpeg';

      // Upload to Cloudinary
      const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            folder: 'findasale/scraped',
          },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
            resolve(result.secure_url);
          }
        );
        stream.end(imageBuffer);
      });

      cloudinaryUrls.push(cloudinaryUrl);
      console.log(`[SaleDetailEnrichment] Mirrored image ${i + 1} for sale ${saleId}: ${imageUrl} -> ${cloudinaryUrl}`);
    } catch (error) {
      console.warn(
        `[SaleDetailEnrichment] Failed to mirror image for sale ${saleId}: ${imageUrl}`,
        error instanceof Error ? error.message : String(error)
      );
      // Continue to next image — don't fail the enrichment
    }
  }

  if (cloudinaryUrls.length > 0) {
    console.log(`[SaleDetailEnrichment] Successfully mirrored ${cloudinaryUrls.length}/${Math.min(imageUrls.length, maxImages)} images for sale ${saleId}`);
  }

  return cloudinaryUrls;
}

/**
 * Fetch sale page HTML with stealth headers
 */
async function fetchSalePageHTML(sourceUrl: string): Promise<string | null> {
  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': 'https://www.estatesales.net/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      console.warn(`[SaleDetailEnrichment] 429 Too Many Requests from ${sourceUrl}`);
      defaultRateLimiter.recordBackoff('estatesales.net');
      return null; // Signal abort condition
    }

    if (!response.ok) {
      console.warn(`[SaleDetailEnrichment] HTTP ${response.status} for ${sourceUrl}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(
      `[SaleDetailEnrichment] Fetch error for ${sourceUrl}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Main enrichment function - processes a batch of unenriched sales
 * Returns stats and abort flag on 429
 */
export async function enrichSaleDetails(batchSize?: number): Promise<EnrichmentResult> {
  const actualBatchSize = batchSize || parseInt(process.env.ESN_DETAIL_BATCH_SIZE || '75', 10);
  const result: EnrichmentResult = { processed: 0, enriched: 0, skipped: 0, aborted: false };

  try {
    // Load robots.txt once per batch
    await defaultRateLimiter.loadRobotsTxt('https://www.estatesales.net/');

    // Query unenriched sales with active-first weighting
    const now = new Date();
    const recentPastCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Get sales that need enrichment
    const unenrichedSales = await prisma.sale.findMany({
      where: {
        sourceName: 'EstateSalesNet',
        sourceUrl: { not: null },
        OR: [
          { description: null },
          { photoUrls: { equals: [] } },
        ],
      },
      select: {
        id: true,
        sourceUrl: true,
        endDate: true,
        description: true,
        photoUrls: true,
      },
      orderBy: {
        createdAt: 'asc', // Will be shuffled below
      },
    });

    if (unenrichedSales.length === 0) {
      console.log('[SaleDetailEnrichment] No unenriched sales found');
      return result;
    }

    console.log(`[SaleDetailEnrichment] Found ${unenrichedSales.length} unenriched sales, processing batch of ${actualBatchSize}`);

    // Apply active-first weighting: 80% active, 20% recent past
    const activeSales = unenrichedSales.filter((s) => s.endDate >= now);
    const recentPastSales = unenrichedSales.filter(
      (s) => s.endDate < now && s.endDate >= recentPastCutoff
    );
    const olderSales = unenrichedSales.filter((s) => s.endDate < recentPastCutoff);

    // Build weighted batch
    const batch = [];
    const targetActive = Math.floor(actualBatchSize * 0.8);
    const targetRecent = Math.floor(actualBatchSize * 0.2);

    // Shuffle and take from each pool
    const shuffleArray = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    batch.push(...shuffleArray(activeSales).slice(0, targetActive));
    batch.push(...shuffleArray(recentPastSales).slice(0, targetRecent));
    batch.push(...shuffleArray(olderSales).slice(0, actualBatchSize - batch.length));

    console.log(
      `[SaleDetailEnrichment] Batch composition: ${batch.filter((s) => s.endDate >= now).length} active, ` +
      `${batch.filter((s) => s.endDate < now && s.endDate >= recentPastCutoff).length} recent past, ` +
      `${batch.filter((s) => s.endDate < recentPastCutoff).length} older`
    );

    // Process batch
    for (const sale of batch) {
      result.processed++;

      // Skip if already enriched
      if (sale.description && sale.photoUrls && sale.photoUrls.length > 0) {
        result.skipped++;
        if (result.processed % 10 === 0) {
          console.log(`[SaleDetailEnrichment] Progress: ${result.processed}/${batch.length}`);
        }
        continue;
      }

      // Respect rate limits
      await defaultRateLimiter.waitBeforeRequest('estatesales.net');

      // Check robots.txt
      if (!defaultRateLimiter.isAllowed(sale.sourceUrl || '', 'FindASaleBot/1.0')) {
        console.warn(`[SaleDetailEnrichment] Robots.txt blocked: ${sale.id}`);
        result.skipped++;
        continue;
      }

      // Fetch and parse
      const html = await fetchSalePageHTML(sale.sourceUrl || '');
      if (html === null) {
        // 429 received - abort batch
        result.aborted = true;
        console.log(`[SaleDetailEnrichment] Aborting batch due to 429`);
        break;
      }

      const { description, images } = extractSaleEventData(html);

      // Update sale if we got data
      if (description || images.length > 0) {
        const updateData: Record<string, any> = {};

        if (description && !sale.description) {
          updateData.description = description;
        }

        if (images.length > 0 && (!sale.photoUrls || sale.photoUrls.length === 0)) {
          try {
            // Mirror images to Cloudinary to bypass hotlink protection
            const cloudinaryUrls = await mirrorImagesToCloudinary(images, sale.id);
            if (cloudinaryUrls.length > 0) {
              updateData.photoUrls = cloudinaryUrls;
            }
          } catch (error) {
            console.warn(
              `[SaleDetailEnrichment] Cloudinary mirroring failed for sale ${sale.id}, using original URLs as fallback`,
              error instanceof Error ? error.message : String(error)
            );
            // Fallback to original URLs if Cloudinary is down
            updateData.photoUrls = images;
          }
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: updateData,
          });

          result.enriched++;
        }
      }

      // Random delay between requests (4–12 seconds for stealth)
      const delay = Math.random() * 8000 + 4000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      if (result.processed % 10 === 0) {
        console.log(`[SaleDetailEnrichment] Progress: ${result.processed}/${batch.length} (enriched: ${result.enriched})`);
      }
    }

    console.log(
      `[SaleDetailEnrichment] Batch complete: ${result.processed} processed, ` +
      `${result.enriched} enriched, ${result.skipped} skipped, aborted: ${result.aborted}`
    );
  } catch (error) {
    console.error(
      '[SaleDetailEnrichment] Batch error:',
      error instanceof Error ? error.message : String(error)
    );
  }

  return result;
}
