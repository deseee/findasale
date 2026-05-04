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
 * Rate limiting: 400ms between all requests (scrapes + API calls)
 * Timeout: 10 seconds per fetch
 * Batch sizes: Pass 1 (200), Pass 2 (100), Pass 3 (all with website from Pass 1)
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/enrichContactEmails.ts
 *   DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx ts-node scripts/enrichContactEmails.ts
 */

import { PrismaClient } from '@prisma/client';
import { extractEmails } from '../src/services/scraper/htmlParser';

const prisma = new PrismaClient();

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
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

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
    console.log('[Enrich] WARNING: GOOGLE_PLACES_API_KEY not set — Pass 2/3 Places queries will be skipped');
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

    const pass1Organizers = await prisma.organizer.findMany({
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
        website: true,
      },
      take: 200,
    });

    const pass1Total = pass1Organizers.length;
    console.log(`[Enrich] Found ${pass1Total} organizers with website to process\n`);

    for (let i = 0; i < pass1Organizers.length; i++) {
      const org = pass1Organizers[i];
      const processed = i + 1;
      let email: string | null = null;
      let source = '';

      try {
        const baseDomain = getBaseDomain(org.website!);
        if (!baseDomain) {
          console.log(`[Enrich] (${processed}/${pass1Total}) ${org.businessName}: invalid URL`);
          pass1Errors++;
          await sleep(400);
          continue;
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
          // Update database
          await prisma.organizer.update({
            where: { id: org.id },
            data: { contactEmail: email },
          });
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

      // Rate limiting already handled in loop — no additional sleep needed
    }

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

    for (let i = 0; i < pass2Organizers.length; i++) {
      const org = pass2Organizers[i];
      const processed = i + 1;
      let email: string | null = null;
      let foundWebsite: string | null = null;
      let source = '';

      try {
        const city = extractCityFromAddress(org.address);

        // Try Google Places first
        let website = await queryGooglePlaces(org.businessName, city);
        if (website) {
          foundWebsite = website;
          source = 'Places';
        } else if (GOOGLE_PLACES_API_KEY === '') {
          console.log(
            `[Enrich] (${processed}/${pass2Total}) ${org.businessName}: GOOGLE_PLACES_API_KEY not set — skipping Places`
          );
          pass2NotFound++;
          await sleep(400);
          continue;
        }


        // If website found, scrape for email and update DB
        if (foundWebsite) {
          // Update website first
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
              const contactUrl = `${baseDomain}/contact`;
              html = await fetchWithTimeout(contactUrl);
              if (html) {
                email = findFirstValidEmail(html);
              }
            }

            // Update email if found
            if (email) {
              await prisma.organizer.update({
                where: { id: org.id },
                data: { contactEmail: email },
              });
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
        } else {
          console.log(`[Enrich] (${processed}/${pass2Total}) ${org.businessName}: Places: no result`);
          pass2NotFound++;
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.log(`[Enrich] (${processed}/${pass2Total}) ${org.businessName}: error: ${message}`);
        pass2Errors++;
      }

      // Rate limiting
      await sleep(400);
    }

    console.log(`\n[Enrich] Pass 2 Summary:`);
    console.log(`  Found: ${pass2Found}`);
    console.log(`  Not found: ${pass2NotFound}`);
    console.log(`  Errors: ${pass2Errors}\n`);

    // ===== PASS 3: Enhanced fallback for Pass 1 misses =====
    if (!GOOGLE_PLACES_API_KEY) {
      console.log('[Enrich] Skipping Pass 3 (GOOGLE_PLACES_API_KEY not set)\n');
    } else {
      console.log('[Enrich] === PASS 3: Enhanced fallback (Places for Pass 1 misses) ===\n');

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

      for (let i = 0; i < pass3Organizers.length; i++) {
        const org = pass3Organizers[i];
        const processed = i + 1;
        let email: string | null = null;

        try {
          const city = extractCityFromAddress(org.address);
          if (!city) {
            console.log(
              `[Enrich] (${processed}/${pass3Total}) ${org.businessName}: could not extract city from address`
            );
            pass3NotFound++;
            await sleep(400);
            continue;
          }

          // Query Places for alternate website
          const altWebsite = await queryGooglePlaces(org.businessName, city);
          if (altWebsite && altWebsite !== org.website) {
            // Different website found, try to scrape it
            const baseDomain = getBaseDomain(altWebsite);
            if (baseDomain) {
              // Try homepage
              let html = await fetchWithTimeout(altWebsite);
              if (html) {
                email = findFirstValidEmail(html);
              }

              // Try /contact if homepage failed
              if (!email) {
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

        // Rate limiting
        await sleep(400);
      }

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
    if (GOOGLE_PLACES_API_KEY) {
      console.log(`  Pass 3: ${pass3Found} found, ${pass3NotFound} not found, ${pass3Errors} errors`);
    }
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
