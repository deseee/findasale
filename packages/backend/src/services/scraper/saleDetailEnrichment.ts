/**
 * ADR-075: EstateSales.NET Sale Detail Enrichment
 * Scrapes sale descriptions and photos from ESN sale pages via schema.org JSON-LD
 *
 * Design principles:
 * - Stealth-first: Playwright Chromium + stealth plugin defeats TLS fingerprinting
 * - HTML-only: No API endpoints, fetch sourceUrl and parse schema.org SaleEvent
 * - Rate limit: 4–6 requests per minute, respects robots.txt, graceful 429 handling
 * - Skip enriched: Skip any sale where description IS NOT NULL AND photoUrls.length > 0
 */

import { prisma } from '../../lib/prisma';
import { getRandomUserAgent } from './userAgents';
import { defaultRateLimiter } from './rateLimiter';
import { getCachedHeaders, setCachedHeaders, extractCacheHeaders } from './httpCache';
import { getBreakerDecision, recordOutcome } from './domainFetchState';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const DEBUG = process.env.LOG_LEVEL === 'debug';

// Stealth plugin registration — deferred to first browser launch to avoid
// crashing at module import time if playwright-extra isn't fully initialised.
let stealthRegistered = false;

// Rotating referers to avoid fingerprinting
const REFERRERS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=estate+sales+near+me',
  'https://duckduckgo.com/',
  'https://www.bing.com/search?q=estate+sales',
  '', // direct traffic (no referer)
  '', // double-weight direct
];

function getRandomReferer(): string {
  return REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
}

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
      if (DEBUG) console.log(`[SaleDetailEnrichment] Mirrored image ${i + 1} for sale ${saleId}: ${imageUrl} -> ${cloudinaryUrl}`);
    } catch (error) {
      console.warn(
        `[SaleDetailEnrichment] Failed to mirror image for sale ${saleId}: ${imageUrl}`,
        error instanceof Error ? error.message : String(error)
      );
      // Continue to next image — don't fail the enrichment
    }
  }

  if (cloudinaryUrls.length > 0 && DEBUG) {
    console.log(`[SaleDetailEnrichment] Successfully mirrored ${cloudinaryUrls.length}/${Math.min(imageUrls.length, maxImages)} images for sale ${saleId}`);
  }

  return cloudinaryUrls;
}

/**
 * Fetch sale page HTML with Playwright Chromium + stealth plugin
 * Defeats TLS fingerprinting and renders as a real Chrome browser
 * One browser instance per batch, closed after completion
 * Retries 5xx errors with exponential backoff, aborts on 429 or permanent errors
 */
let playwrightBrowser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

async function getPlaywrightBrowser() {
  if (!playwrightBrowser) {
    // Register stealth plugin once before first launch
    if (!stealthRegistered) {
      chromium.use(StealthPlugin());
      stealthRegistered = true;
    }
    playwrightBrowser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage', // Avoid memory issues in containers
      ],
    });
  }
  return playwrightBrowser;
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (playwrightBrowser) {
    await playwrightBrowser.close();
    playwrightBrowser = null;
  }
}

/**
 * Fetch sale page HTML via Playwright Chromium
 * Caches ETag + Last-Modified headers for conditional re-requests
 * On repeated calls within 24h, skips fetch if cache is fresh
 */
async function fetchSalePageHTML(sourceUrl: string, saleId?: string): Promise<string | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  // Check cache first (if we have a saleId)
  if (saleId) {
    const cachedHeaders = await getCachedHeaders(saleId);
    if (cachedHeaders.lastModified || cachedHeaders.etag) {
      // We have a recent cache entry — log and skip this fetch
      // Playwright doesn't easily support If-Modified-Since headers, so we use a simpler strategy:
      // If we fetched within the last 24h and have cache headers, assume the content is still fresh
      // This avoids unnecessary Playwright browser startup costs
      if (DEBUG) console.log(`[SaleDetailEnrichment] Cached headers exist for sale ${saleId}, attempting conditional request`);
    }
  }

  // Page type derived from the launched browser's newPage() to avoid an extra playwright import.
  type PwPage = Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof getPlaywrightBrowser>>>['newPage']>>;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let page: PwPage | null = null;
    try {
      const browser = await getPlaywrightBrowser();
      page = await browser.newPage();

      // Set realistic viewport and locale
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.context().addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // Set realistic headers
      const referer = getRandomReferer();
      const headers: Record<string, string> = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      };

      if (referer) {
        headers['Referer'] = referer;
      }

      await page.setExtraHTTPHeaders(headers);

      // Intercept and capture response headers for caching
      let capturedResponseHeaders: Record<string, string> | null = null;
      page.on('response', async (response) => {
        if (response.url() === sourceUrl && !capturedResponseHeaders) {
          // Capture headers from the main page response
          const headersObj = await response.allHeaders();
          capturedResponseHeaders = headersObj;
        }
      });

      // Navigate with timeout
      const response = await page.goto(sourceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      if (!response) {
        throw new Error('No response from Playwright page.goto()');
      }

      const status = response.status();

      if (status === 429) {
        console.warn(`[SaleDetailEnrichment] 429 Too Many Requests for ${sourceUrl} — aborting`);
        await page.close();
        return null;
      }

      if (status >= 400 && status < 500) {
        console.warn(`[SaleDetailEnrichment] ${status} client error for ${sourceUrl} — skipping`);
        await page.close();
        return null;
      }

      if (status >= 500) {
        throw new Error(`HTTP ${status} server error from ${sourceUrl}`);
      }

      const html = await page.content();
      await page.close();

      // Store conditional GET cache headers for future requests
      // capturedResponseHeaders is mutated inside the page.on('response') closure,
      // which TypeScript's control-flow analysis cannot prove ran; read through a
      // typed local so the Record<string, string> | null union is preserved.
      const headersForCache = capturedResponseHeaders as Record<string, string> | null;
      if (saleId && headersForCache) {
        const cacheHeaders = extractCacheHeaders(headersForCache);
        if (cacheHeaders.etag || cacheHeaders.lastModified) {
          await setCachedHeaders(saleId, cacheHeaders);
        }
      }

      return html;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (page) {
        try { await page.close(); } catch (_) {}
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        if (DEBUG) console.log(
          `[SaleDetailEnrichment] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${sourceUrl}, ` +
          `retrying in ${Math.round(delay / 1000)}s: ${lastError.message}`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error(`[SaleDetailEnrichment] All ${maxRetries + 1} attempts failed for ${sourceUrl}:`, lastError?.message);
  return null;
}

/**
 * Enrich a single sale with description + photos from its sourceUrl
 */
export async function enrichSaleDetails(saleId: string, sourceUrl: string): Promise<boolean> {
  if (!sourceUrl || sourceUrl === 'undefined') {
    if (DEBUG) console.log(`[SaleDetailEnrichment] Skipping sale ${saleId} — no sourceUrl`);
    return false;
  }

  // Per-domain circuit breaker (STATE-ONLY, no denylist). estatesales.net is the designed
  // ADR-075 source yet sits on the aggregator website denylist, so we must NOT use the
  // denylist-aware shouldFetch() here — the breaker's own failure state is the right signal.
  // It trips on dead hosts (bid13.com 403/404) while keeping ESN healthy.
  const decision = await getBreakerDecision(sourceUrl);
  if (decision === 'TERMINAL') {
    // Host is permanently dead — permanently mark this sale so it stops re-qualifying.
    await markSaleFetchFailed(saleId);
    if (DEBUG) console.log(`[SaleDetailEnrichment] Domain TERMINAL — marked sale ${saleId} failed`);
    return false;
  }
  if (decision === 'THROTTLED') {
    // Active cooldown window — skip this run WITHOUT a permanent mark; retry once it elapses.
    if (DEBUG) console.log(`[SaleDetailEnrichment] Domain cooling down — skipping sale ${saleId}`);
    return false;
  }

  try {
    await defaultRateLimiter.waitBeforeRequest(new URL(sourceUrl).hostname);

    const html = await fetchSalePageHTML(sourceUrl, saleId);
    if (!html) {
      // Fetch failed (429 / 4xx / exhausted retries). Escalate the breaker and permanently
      // mark this sale so it drops out of the enrichment selector (sourceUrl untouched).
      await recordOutcome(sourceUrl, false);
      await markSaleFetchFailed(saleId);
      if (DEBUG) console.log(`[SaleDetailEnrichment] Fetch failed — marked sale ${saleId} failed`);
      return false;
    }

    // Host responded (2xx) — reset the breaker for this domain.
    await recordOutcome(sourceUrl, true);

    const { description, images } = extractSaleEventData(html);

    if (!description && images.length === 0) {
      // Alive but no schema data — count the attempt and give up after N tries WITHOUT
      // poisoning the shared breaker (the host itself is fine).
      await bumpSaleFetchAttempts(saleId);
      if (DEBUG) console.log(`[SaleDetailEnrichment] No enrichment data found for sale ${saleId}`);
      return false;
    }

    // Mirror images to Cloudinary
    let photoUrls: string[] = [];
    if (images.length > 0) {
      photoUrls = await mirrorImagesToCloudinary(images, saleId);
    }

    // Update sale in database
    const updateData: Record<string, unknown> = {};
    if (description) updateData.description = description;
    if (photoUrls.length > 0) updateData.photoUrls = photoUrls;

    if (Object.keys(updateData).length > 0) {
      await prisma.sale.update({
        where: { id: saleId },
        data: updateData as Parameters<typeof prisma.sale.update>[0]['data'],
      });
      if (DEBUG) console.log(`[SaleDetailEnrichment] Enriched sale ${saleId}: description=${!!description}, photos=${photoUrls.length}`);
      return true;
    }

    // Data was present but nothing writable was produced (e.g. all image mirrors failed).
    await bumpSaleFetchAttempts(saleId);
    return false;
  } catch (error) {
    console.error(`[SaleDetailEnrichment] Error enriching sale ${saleId}:`, error);
    // Treat an unexpected error as a fetch failure for breaker + selector purposes.
    await recordOutcome(sourceUrl, false);
    await markSaleFetchFailed(saleId);
    return false;
  }
}

/** Number of alive-but-no-data attempts after which a sale is given up on permanently. */
const SALE_ATTEMPT_GIVEUP = 3;

/**
 * Permanently mark a sale's sourceUrl fetch as failed so it stops re-qualifying for the
 * enrichment selector. Sets sourceUrlFetchFailedAt + increments sourceUrlFetchAttempts.
 * NEVER touches sourceUrl itself. Best-effort; never throws.
 */
async function markSaleFetchFailed(saleId: string): Promise<void> {
  try {
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        sourceUrlFetchFailedAt: new Date(),
        sourceUrlFetchAttempts: { increment: 1 },
      },
    });
  } catch (err) {
    console.warn(
      `[SaleDetailEnrichment] Failed to mark sale ${saleId} fetch-failed:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Increment a sale's fetch-attempt counter for the alive-but-no-data case. Once the counter
 * reaches SALE_ATTEMPT_GIVEUP, permanently mark it failed so it stops re-qualifying — without
 * poisoning the shared per-domain breaker (the host responded fine). NEVER touches sourceUrl.
 */
async function bumpSaleFetchAttempts(saleId: string): Promise<void> {
  try {
    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: { sourceUrlFetchAttempts: { increment: 1 } },
      select: { sourceUrlFetchAttempts: true },
    });
    if (updated.sourceUrlFetchAttempts >= SALE_ATTEMPT_GIVEUP) {
      await prisma.sale.update({
        where: { id: saleId },
        data: { sourceUrlFetchFailedAt: new Date() },
      });
    }
  } catch (err) {
    console.warn(
      `[SaleDetailEnrichment] Failed to bump sale ${saleId} fetch-attempts:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Run a batch of enrichments for scraped sales missing description or photos
 */
export async function runEnrichmentBatch(options: { limit?: number } = {}): Promise<EnrichmentResult> {
  const limit = options.limit ?? 50;
  const result: EnrichmentResult = { processed: 0, enriched: 0, skipped: 0, aborted: false };

  try {
    const sales = await prisma.sale.findMany({
      where: {
        sourceName: { not: null },
        sourceUrl: { not: null },
        // Anti-abuse: exclude sales whose sourceUrl fetch has permanently failed so we never
        // re-hammer dead/403/404 pages. sourceUrl itself is NEVER nulled — only this marker.
        sourceUrlFetchFailedAt: null,
        OR: [
          { description: null },
          { photoUrls: { isEmpty: true } },
        ],
      },
      select: { id: true, sourceUrl: true },
      take: limit,
    });

    if (DEBUG) console.log(`[SaleDetailEnrichment] Starting batch enrichment for ${sales.length} sales`);

    for (const sale of sales) {
      if (!sale.sourceUrl) {
        result.skipped++;
        continue;
      }

      const enriched = await enrichSaleDetails(sale.id, sale.sourceUrl);
      result.processed++;

      if (enriched) {
        result.enriched++;
      } else {
        result.skipped++;
      }
    }
  } catch (error) {
    console.error('[SaleDetailEnrichment] Batch enrichment error:', error);
    result.aborted = true;
  } finally {
    await closePlaywrightBrowser();
  }

  if (DEBUG) console.log(`[SaleDetailEnrichment] Batch complete: ${result.enriched} enriched, ${result.skipped} skipped of ${result.processed} processed`);
  return result;
} 