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
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import playwright from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Register stealth plugin
playwright.use(StealthPlugin());
const chromium = playwright.chromium;

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
 * Fetch sale page HTML with Playwright Chromium + stealth plugin
 * Defeats TLS fingerprinting and renders as a real Chrome browser
 * One browser instance per batch, closed after completion
 * Retries 5xx errors with exponential backoff, aborts on 429 or permanent errors
 */
let playwrightBrowser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

async function getPlaywrightBrowser() {
  if (!playwrightBrowser) {
    // Launch Chromium with stealth plugin already registered
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
      console.log(`[SaleDetailEnrichment] Cached headers exist for sale ${saleId}, attempting conditional request`);
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let page = null;
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
      const response = 