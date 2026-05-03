#!/usr/bin/env node

/**
 * Email Enrichment Script for Organizers
 *
 * Finds contact email addresses for organizers by:
 * 1. Fetching their website homepage
 * 2. If no email, trying /contact page
 * 3. Extracting emails from HTML using htmlParser.extractEmails()
 * 4. Validating against exclusion list and basic rules
 * 5. Updating Organizer.contactEmail in database
 *
 * Rate limiting: 400ms between requests
 * Timeout: 10 seconds per fetch
 * Batch size: 200 organizers per run
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/enrichContactEmails.ts
 */

import { PrismaClient } from '@prisma/client';
import { extractEmails } from '../src/services/scraper/htmlParser';

const prisma = new PrismaClient();

// Email validation and filtering
const BLOCKED_EMAIL_PATTERNS = [
  /^noreply[@]/i,
  /^no-reply[@]/i,
  /^donotreply[@]/i,
  /[@]system\.finda\.sale$/i,
];

function isValidEmail(email: string): boolean {
  // Basic email format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;

  // Check against blocked patterns
  for (const pattern of BLOCKED_EMAIL_PATTERNS) {
    if (pattern.test(email)) return false;
  }

  return true;
}

// Fetch with timeout and abort
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

async function main() {
  console.log('[Enrich] Starting contact email enrichment...\n');

  const startTime = Date.now();
  let processed = 0;
  let found = 0;
  let notFound = 0;
  let errors = 0;

  try {
    // Query organizers with website but no contactEmail
    const organizers = await prisma.organizer.findMany({
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

    const total = organizers.length;
    console.log(`[Enrich] Found ${total} organizers to process\n`);

    for (const org of organizers) {
      processed++;
      let email: string | null = null;
      let source = '';

      try {
        const baseDomain = getBaseDomain(org.website!);
        if (!baseDomain) {
          console.log(`[Enrich] (${processed}/${total}) ${org.businessName}: invalid URL`);
          errors++;
          await sleep(400);
          continue;
        }

        // Try homepage first
        let html = await fetchWithTimeout(org.website!);
        if (html) {
          email = findFirstValidEmail(html);
          if (email) {
            source = 'homepage';
          }
        }

        // Try /contact page if not found
        if (!email) {
          const contactUrl = `${baseDomain}/contact`;
          html = await fetchWithTimeout(contactUrl);
          if (html) {
            email = findFirstValidEmail(html);
            if (email) {
              source = '/contact';
            }
          }
        }

        if (email) {
          // Update database
          await prisma.organizer.update({
            where: { id: org.id },
            data: { contactEmail: email },
          });
          console.log(
            `[Enrich] (${processed}/${total}) ${org.businessName}: found ${email} (from ${source})`
          );
          found++;
        } else {
          console.log(`[Enrich] (${processed}/${total}) ${org.businessName}: no email found`);
          notFound++;
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.log(`[Enrich] (${processed}/${total}) ${org.businessName}: fetch error: ${message}`);
        errors++;
      }

      // Rate limiting
      await sleep(400);
    }

    const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Enrich] Summary:`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Found: ${found}`);
    console.log(`  Not found: ${notFound}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Duration: ${elapsedSecs}s\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[Enrich] Fatal error:', error);
  process.exit(1);
});
