#!/usr/bin/env node

/**
 * Email Enrichment Script for Organizers
 *
 * Three passes:
 * Pass 1: Organizers with website — sitemap discovery + fixed URL patterns, extract email
 *   Step 1: Fetch sitemap.xml, parse <loc> tags for contact/about/hire/team/staff/reach, try up to 5
 *   Step 2: Try fixed pattern list: homepage, /contact, /contact-us, /about, /hire-us, /book-now, /team, /staff, etc.
 *   Footer emails are scanned by findFirstValidEmail() — already included in HTML scrape
 * Pass 2: Organizers with no website — try Google Places to find website, then scrape
 * Pass 3: Enhanced fallback — for Pass 1 misses, try Places to find alternate website + scrape
 *
 * Rate limiting: 400ms between sequential URL attempts per organizer
 * Timeout: 10 seconds per fetch
 * Batch sizes: Pass 1 (200), Pass 2 (100), Pass 3 (100)
 * Concurrency: Pass 1 = 10 workers (different domains), Pass 2/3 = 5 workers (shared Places quota)
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/enrichContactEmails.ts
 *   DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx ts-node scripts/enrichContactEmails.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extractEmails } from '../src/services/scraper/htmlParser';

const prisma = new PrismaClient();

/**
 * Auto-queue a newly discovered email into the outreach pipeline.
 * No-op if OUTREACH_ENABLED is not 'true', email is suppressed, or a row already exists.
 */
async function queueForOutreach(organizerId: string, email: string): Promise<void> {
  if (process.env.OUTREACH_ENABLED !== 'true') return;
  try {
    const isSuppressed = await prisma.emailSuppression.findFirst({
      where: { emailAddress: email },
    });
    if (isSuppressed) return;
    const existing = await prisma.directoryClaimEmail.findFirst({
      where: { organizerId },
    });
    if (!existing) {
      await prisma.directoryClaimEmail.create({
        data: {
          organizerId,
          emailAddress: email,
          status: 'PENDING',
          attemptCount: 0,
          trackingPixelId: randomUUID(),
          trackingToken: randomUUID(),
        },
      });
      console.log(`[Enrich] Queued ${email} for outreach (organizer ${organizerId})`);
    }
  } catch (err) {
    console.error(`[Enrich] queueForOutreach error for organizer ${organizerId}:`, err);
  }
}

// Environment variables — optional
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';

// Email validation and filtering
const BLOCKED_EMAIL_PATTERNS = [
  /^noreply[@]/i,
  /^no-reply[@]/i,
  /^donotreply[@]/i,
  /[@]system\.finda\.sale$/i,
  // Third-party platform emails that appear in widgets on organizer sites
  /[@]estatesales\.net$/i,
  /[@]estatesales\.com$/i,
  /[@]gsalr\.com$/i,
  /[@]garagesalefinder\.com$/i,
  /[@]craigslist\.org$/i,
  /[@]facebook\.com$/i,
  /[@]google\.com$/i,
];

// File extensions that are NOT valid email TLDs — catches image/asset filenames like join-our-team@2x.png
const BLOCKED_TLDS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif',
  'css', 'js', 'json', 'xml', 'txt', 'pdf', 'zip',
  'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot',
]);

function isValidEmail(email: string): boolean {
  // Basic email format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;

  // Reject retina/HiDPI asset patterns like name@2x.png, name@3x.jpg
  if (/@\d+x\.[a-z]+$/i.test(email)) return false;

  // Reject if TLD is a file extension (catches asset filenames)
  const tld = email.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_TLDS.has(tld)) return false;

  // Check against blocked sender patterns
  for (const pattern of BLOCKED_EMAIL_PATTERNS) {
    if (pattern.test(email)) return false;
  }

  return true;
}

// Extract city from address string (format: "123 Main St, Grand Rapids, MI 49503")
function extractCityFromAddress(address: string): string {
  const parts = address.split(',').map(p => p.trim());
  return parts.length >= 2 ? parts[1] : '';
}

// Fetch with timeout and abort
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();
    return html;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return null;
    }
    return null;
  }
}

// Normalize URL to domain (remove protocol, path, query)
function getBaseDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.origin;
  } catch {
    return '';
  }
}

// Find first valid email from HTML text
function findFirstValidEmail(html: string): string | null {
  const emails = extractEmails(html);
  for (const email of emails) {
    if (isValidEmail(email)) {
      return email;
    }
  }
  return null;
}

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Concurrency limits
const SCRAPE_CONCURRENCY = 10; // Each organizer hits a different domain — safe to parallelize
const PLACES_CONCURRENCY = 5;  // Shared API quota — conservative cap

/**
 * Process items with bounded concurrency using a pull-queue pattern.
 * Each worker slot pulls the next available item until the queue is empty.
 * No external dependencies required.
 */
async function processWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number, total: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  const total = items.length;
  async function runSlot(): Promise<void> {
    while (idx < total) {
      const i = idx++;
      await worker(items[i], i, total);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, runSlot)
  );
}

// Query Google Places Text Search API
interface GooglePlacesResponse {
  places?: Array<{
    websiteUri?: string;
    displayName?: { text: string };
  }>;
}

async function queryGooglePlaces(
  businessName: string,
  city: string
): Promise<string | null> {
  // BILLING LOCKDOWN — May 2026: $201 incident. Hard-coded off.
  // Do NOT remove this block or gate on GOOGLE_MAPS_ENABLED — that env var is no longer the control.
  return null;

  const query = `${businessName} ${city}`.trim();
  
  try {
    const body = JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
    });

    const response = await fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.websiteUri,places.displayName',
        },
        body,
      }
    );

    if (!response) return null;

    const data: GooglePlacesResponse = JSON.parse(response);
    if (data.places && data.places.length > 0 && data.places[0].websiteUri) {
      return data.places[0].websiteUri;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Free fallback: search DuckDuckGo HTML for a business website.
 * Returns the first organic result URL that is not a directory/social media site.
 */
async function queryDuckDuckGo(
  businessName: string,
  city: string
): Promise<string | null> {
  const BLOCKED_DOMAINS = [
    'facebook.com', 'yelp.com', 'google.com', 'yellowpages.com',
    'bbb.org', 'manta.com', 'linkedin.com', 'twitter.com',
    'instagram.com', 'estatesales.net', 'estatesales.org',
    'nextdoor.com', 'mapquest.com', 'tripadvisor.com',
    'white-pages.com', 'whitepages.com', 'spokeo.com',
    'finda.sale', 'craigslist.org', 'ebay.com',
  ];

  const query = encodeURIComponent(`"${businessName}" ${city}`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;

  try {
    const html = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!html) return null;

    // DuckDuckGo HTML result links appear as: class="result__url" href="https://..."
    // or as data-href inside result__a elements
    const hrefMatches = html.match(/result__a[^>]+href="([^"]+)"/gi) || [];
    for (const match of hrefMatches) {
      const urlMatch = match.match(/href="([^"]+)"/);
      if (!urlMatch) continue;
      let resultUrl = urlMatch[1];
      // DuckDuckGo may use redirect URLs — extract the actual URL from uddg= param
      try {
        const parsed = new URL(resultUrl);
        const uddg = parsed.searchParams.get('uddg');
        if (uddg) resultUrl = decodeURIComponent(uddg);
      } catch { /* not a redirect URL */ }

      // Skip blocked domains
      try {
        const resultDomain = new URL(resultUrl).hostname.replace(/^www\./, '');
        if (BLOCKED_DOMAINS.some(d => resultDomain.includes(d))) continue;
        if (!resultUrl.startsWith('http')) continue;
        return resultUrl;
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch sitemap and extract contact-related URLs
async function fetchSitemapUrls(baseDomain: string): Promise<string[]> {
  const candidateUrls: string[] = [];
  const sitemapPatterns = [
    `${baseDomain}/sitemap.xml`,
    `${baseDomain}/sitemap_index.xml`,
  ];

  for (const sitemapUrl of sitemapPatterns) {
    try {
      const sitemapHtml = await fetchWithTimeout(sitemapUrl);
      if (sitemapHtml) {
        // Extract <loc> URLs from sitemap XML
        const locMatches = sitemapHtml.match(/<loc>([^<]+)<\/loc>/g);
        if (locMatches) {
          for (const match of locMatches) {
            const url = match.replace(/<\/?loc>/g, '');
            // Check if URL contains contact-related keywords (case-insensitive)
            const lowerUrl = url.toLowerCase();
            if (
              lowerUrl.includes('contact') ||
              lowerUrl.includes('about') ||
              lowerUrl.includes('hire') ||
              lowerUrl.includes('book') ||
              lowerUrl.includes('team') ||
              lowerUrl.includes('staff') ||
              lowerUrl.includes('reach')
            ) {
              candidateUrls.push(url);
              if (candidateUrls.length >= 5) break; // Limit to 5 candidates
            }
          }
        }
      }
    } catch {
      // Sitemap fetch failed, continue
    }

    if (candidateUrls.length >= 5) break;
  }

  return candidateUrls;
}

async function main() {
  console.log('[Enrich] Starting contact email enrichment...\n');

  if (!GOOGLE_PLACES_API_KEY) {
    console.log('[Enrich] INFO: GOOGLE_PLACES_API_KEY not set — using DuckDuckGo as free website discovery source');
  }
  console.log('');

  const startTime = Date.now();
  let pass1Found = 0;
  let pass1NotFound = 0;
  let pass1Errors = 0;
  let pass2Found = 0;
  let pass2NotFound = 0;
  let pass2Errors = 0;
  let pass3Found = 0;
  let pass3NotFound = 0;
  let pass3Errors = 0;

  try {
    // ===== PASS 1: Organizers with website =====
    console.log('[Enrich] === PASS 1: Organizers with website ===\n');

    const pass1BaseWhere = {
      website: { not: null },
      contactEmail: null,
      isUnmanagedListing: true,
    };
    const hotWarm = await prisma.organizer.findMany({
      where: { ...pass1BaseWhere, leadTier: { in: ['HOT', 'WARM'] } },
      select: { id: true, businessName: true, website: true },
      take: 150,
    });
    const cold = await prisma.organizer.findMany({
      where: { ...pass1BaseWhere, leadTier: { notIn: ['HOT', 'WARM'] } },
      select: { id: true, businessName: true, website: true },
      take: 200 - hotWarm.length,
    });
    const pass1Organizers = [...hotWarm, ...cold];

    const pass1Total = pass1Organizers.length;
    console.log(`[Enrich] Found ${pass1Total} organizers with website to process\n`);

    await processWithConcurrency(pass1Organizers, async (org, i) => {
      const processed = i + 1;
      let email: string | null = null;
      let source = '';

      try {
        const baseDomain = getBaseDomain(org.website!);
        if (!baseDomain) {
          console.log(`[Enrich] (${processed}/${pass1Total}) ${org.businessName}: invalid URL`);
          pass1Errors++;
          return;
        }

        // Fixed URL pattern list — try in order, stop on first email found
        const urlPatterns = [
          org.website!, // Homepage
          `${baseDomain}/contact`,
          `${baseDomain}/contact-us`,
          `${baseDomain}/contactus`,
          `${baseDomain}/about`,
          `${baseDomain}/about-us`,
          `${baseDomain}/about-us/contact`,
          `${baseDomain}/hire-us`,
          `${baseDomain}/book-now`,
          `${baseDomain}/booking`,
          `${baseDomain}/work-with-us`,
          `${baseDomain}/reach-us`,
          `${baseDomain}/team`,
          `${baseDomain}/staff`,
        ];

        // Step 1: Try sitemap-discovered contact URLs first (most targeted)
        const sitemapUrls = await fetchSitemapUrls(baseDomain);
        for (const url of sitemapUrls) {
          const html = await fetchWithTimeout(url);
          if (html) {
            email = findFirstValidEmail(html);
            if (email) {
              source = `sitemap→${new URL(url).pathname || 'root'}`;
              break;
            }
          }
          await sleep(400);
        }

        // Step 2: If not found in sitemap, try fixed URL patterns
        if (!email) {
          for (const url of urlPatterns) {
            const html = await fetchWithTimeout(url);
            if (html) {
              email = findFirstValidEmail(html);
              if (email) {
                source = new URL(url).pathname || 'homepage';
                break;
              }
            }
            await sleep(400);
          }
        }

        if (email) {
          await prisma.organizer.update({
            where: { id: org.id },
            data: { contactEmail: email },
          });
          await queueForOutreach(org.id, email);
          console.log(
            `[Enrich] (${processed}/${pass1Total}) ${org.businessName}: found ${email} (from ${source})`
          );
          pass1Found++;
        } else {
          console.log(`[Enrich] (${processed}/${pass1Total}) ${org.businessName}: no email found`);
          pass1NotFound++;
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.log(`[Enrich] (${processed}/${pass1Total}) ${org.businessName}: fetch error: ${message}`);
        pass1Errors++;
      }
    }, SCRAPE_CONCURRENCY);

    console.log(`\n[Enrich] Pass 1 Summary:`);
    console.log(`  Found: ${pass1Found}`);
    console.log(`  Not found: ${pass1NotFound}`);
    console.log(`  Errors: ${pass1Errors}\n`);

    // ===== PASS 2: Organizers without website =====
    console.log('[Enrich] === PASS 2: Organizers without website (Places) ===\n');

    const pass2Organizers = await prisma.organizer.findMany({
      where: {
        website: null,
        contactEmail: null,
        isUnmanagedListing: true,
      },
      select: {
        id: true,
        businessName: true,
        address: true,
      },
      take: 100,
    });

    const pass2Total = pass2Organizers.length;
    console.log(`[Enrich] Found ${pass2Total} organizers without website to process\n`);

    await processWithConcurrency(pass2Organizers, async (org, i) => {
      const processed = i + 1;
      let email: string | null = null;
      let foundWebsite: string | null = null;
      let source = '';

      try {
        const city = extractCityFromAddress(org.address);

        // Free sources first, Places only as last resort
        let website = await queryDuckDuckGo(org.businessName, city);
        if (website) {
          foundWebsite = website;
          source = 'DuckDuckGo';
        } else if (GOOGLE_PLACES_API_KEY) {
          const placesResult = await queryGooglePlaces(org.businessName, city);
          if (placesResult) {
            foundWebsite = placesResult;
            source = 'Places';
          }
        }
        if (!foundWebsite) {
          console.log(`[Enrich] (${processed}/${pass2Total}) ${org.businessName}: no website found via free search or Places`);
          pass2NotFound++;
          return;
        }

        // Scrape the discovered website for email and update DB
        await prisma.organizer.update({
          where: { id: org.id },
          data: { website: foundWebsite },
        });

        const baseDomain = getBaseDomain(foundWebsite);
        if (baseDomain) {
          // Try homepage
          let html = await fetchWithTimeout(foundWebsite);
          if (html) {
            email = findFirstValidEmail(html);
          }

          // Try /contact if homepage failed
          if (!email) {
            await sleep(400);
            const contactUrl = `${baseDomain}/contact`;
            html = await fetchWithTimeout(contactUrl);
            if (html) {
              email = findFirstValidEmail(html);
            }
          }

          if (email) {
            await prisma.organizer.update({
              where: { id: org.id },
              data: { contactEmail: email },
            });
            await queueForOutreach(org.id, email);
            console.log(
              `[Enrich] (${processed}/${pass2Total}) ${org.businessName}: found ${email} (from ${source}→website scrape)`
            );
            pass2Found++;
          } else {
            console.log(
              `[Enrich] (${processed}/${pass2Total}) ${org.businessName}: found website ${foundWebsite} via ${source}, wrote to DB (no email yet)`
            );
            pass2NotFound++;
          }
        } else {
          console.log(
            `[Enrich] (${processed}/${pass2Total}) ${org.businessName}: invalid website URL from ${source}`
          );
          pass2Errors++;
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.log(`[Enrich] (${processed}/${pass2Total}) ${org.businessName}: error: ${message}`);
        pass2Errors++;
      }
    }, PLACES_CONCURRENCY);

    console.log(`\n[Enrich] Pass 2 Summary:`);
    console.log(`  Found: ${pass2Found}`);
    console.log(`  Not found: ${pass2NotFound}`);
    console.log(`  Errors: ${pass2Errors}\n`);

    // ===== PASS 3: Enhanced fallback for Pass 1 misses =====
    {
      console.log('[Enrich] === PASS 3: Enhanced fallback (free search + Places for Pass 1 misses) ===\n');

      const pass3Organizers = await prisma.organizer.findMany({
        where: {
          website: {
            not: null,
          },
          contactEmail: null,
          isUnmanagedListing: true,
        },
        select: {
          id: true,
          businessName: true,
          address: true,
          website: true,
        },
        take: 100,
      });

      const pass3Total = pass3Organizers.length;
      console.log(`[Enrich] Found ${pass3Total} organizers from Pass 1 with no email\n`);

      await processWithConcurrency(pass3Organizers, async (org, i) => {
        const processed = i + 1;
        let email: string | null = null;

        try {
          const city = extractCityFromAddress(org.address);
          if (!city) {
            console.log(
              `[Enrich] (${processed}/${pass3Total}) ${org.businessName}: could not extract city from address`
            );
            pass3NotFound++;
            return;
          }

          // Query free sources then Places for alternate website
          const altWebsite = await queryDuckDuckGo(org.businessName, city)
            ?? (GOOGLE_PLACES_API_KEY ? await queryGooglePlaces(org.businessName, city) : null);
          if (altWebsite && altWebsite !== org.website) {
            const baseDomain = getBaseDomain(altWebsite);
            if (baseDomain) {
              // Try homepage
              let html = await fetchWithTimeout(altWebsite);
              if (html) {
                email = findFirstValidEmail(html);
              }

              // Try /contact if homepage failed
              if (!email) {
                await sleep(400);
                const contactUrl = `${baseDomain}/contact`;
                html = await fetchWithTimeout(contactUrl);
                if (html) {
                  email = findFirstValidEmail(html);
                }
              }

              if (email) {
                await prisma.organizer.update({
                  where: { id: org.id },
                  data: { contactEmail: email, website: altWebsite },
                });
                await queueForOutreach(org.id, email);
                console.log(
                  `[Enrich] (${processed}/${pass3Total}) ${org.businessName}: found ${email} (from Places alt-website scrape)`
                );
                pass3Found++;
              } else {
                console.log(
                  `[Enrich] (${processed}/${pass3Total}) ${org.businessName}: found alt-website via Places, no email`
                );
                pass3NotFound++;
              }
            } else {
              console.log(
                `[Enrich] (${processed}/${pass3Total}) ${org.businessName}: invalid alt-website from Places`
              );
              pass3Errors++;
            }
          } else {
            console.log(`[Enrich] (${processed}/${pass3Total}) ${org.businessName}: Places: no alt-website`);
            pass3NotFound++;
          }
        } catch (fetchError) {
          const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.log(`[Enrich] (${processed}/${pass3Total}) ${org.businessName}: error: ${message}`);
          pass3Errors++;
        }
      }, PLACES_CONCURRENCY);

      console.log(`\n[Enrich] Pass 3 Summary:`);
      console.log(`  Found: ${pass3Found}`);
      console.log(`  Not found: ${pass3NotFound}`);
      console.log(`  Errors: ${pass3Errors}\n`);
    }

    // Final summary
    const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[Enrich] === FINAL SUMMARY ===');
    console.log(`  Pass 1: ${pass1Found} found, ${pass1NotFound} not found, ${pass1Errors} errors`);
    console.log(`  Pass 2: ${pass2Found} found, ${pass2NotFound} not found, ${pass2Errors} errors`);
    console.log(`  Pass 3: ${pass3Found} found, ${pass3NotFound} not found, ${pass3Errors} errors`);
    console.log(`  Total found: ${pass1Found + pass2Found + pass3Found}`);
    console.log(`  Duration: ${elapsedSecs}s\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[Enrich] Fatal error:', error);
  process.exit(1);
});
