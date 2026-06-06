/**
 * autoSeedOutreachCron.ts
 *
 * Daily cron (06:00 UTC) that finds newly scraped unmanaged organizers with a
 * contactEmail and creates DirectoryClaimEmail rows so they enter the outreach
 * queue automatically — without requiring a manual seed script run.
 *
 * Runs AFTER email discovery (03:00 UTC) and lead scoring (02:00 UTC) so newly
 * discovered emails and fresh scores are ready.
 *
 * Gated by OUTREACH_ENABLED=true env var (same gate as outreachEmailsCron).
 * Cap: 500 new rows per run to avoid runaway inserts after large scraper batches.
 * Idempotent: skips organizers that already have a DirectoryClaimEmail row.
 */

import cron from 'node-cron';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

const MAX_PER_RUN = 500;

// Placeholder/template addresses that are syntactically valid but semantically junk.
// Mirrors the same list in seedDirectoryClaimEmails.ts.
const PLACEHOLDER_DOMAINS = new Set([
  'domain.com', 'domain.org', 'domain.net',
  'example.com', 'example.org', 'example.net',
  'yourdomain.com', 'yourdomain.org', 'yourdomain.net',
  'test.com', 'test.org',
]);

const PLACEHOLDER_FULL_ADDRESSES = new Set([
  'name@email.com',
  'user@email.com',
  'noreply@gmail.com',
  'no-reply@gmail.com',
  'donotreply@gmail.com',
]);

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico)(\b|$)/i;

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  // Reject image filenames that accidentally match email pattern
  // (e.g. "wastelandlogo_250x@2x.png", "Pink_Yellow_Star@2x.jpeg")
  if (IMAGE_EXTENSION_RE.test(email)) return false;
  return true;
};

const isPlaceholderEmail = (email: string): boolean => {
  const lower = email.toLowerCase().trim();
  if (PLACEHOLDER_FULL_ADDRESSES.has(lower)) return true;
  const domain = lower.split('@')[1];
  if (domain && PLACEHOLDER_DOMAINS.has(domain)) return true;
  if (domain && domain.endsWith('.wixpress.com')) return true;
  return false;
};

export async function runAutoSeedOutreach(): Promise<void> {
  console.log('[AutoSeedCron] Starting auto-seed outreach run...');
  const t0 = Date.now();

  try {
    // Find unmanaged organizers with contactEmail who are eligible for outreach.
    // Canadian orgs are identified by province abbreviation or full name in the address field
    // (no country column on Organizer — detection is address-string based).
    // OUTREACH_CANADA_ENABLED=true → include Canadian orgs. Default: excluded (paused, not permanent).
    const canadaExclusions = process.env.OUTREACH_CANADA_ENABLED === 'true' ? [] : [
      { address: { contains: ', ON', mode: 'insensitive' as const } },
      { address: { contains: ', BC', mode: 'insensitive' as const } },
      { address: { contains: ', AB', mode: 'insensitive' as const } },
      { address: { contains: ', MB', mode: 'insensitive' as const } },
      { address: { contains: ', SK', mode: 'insensitive' as const } },
      { address: { contains: ', QC', mode: 'insensitive' as const } },
      { address: { contains: ', NS', mode: 'insensitive' as const } },
      { address: { contains: ', NB', mode: 'insensitive' as const } },
      { address: { contains: ', NL', mode: 'insensitive' as const } },
      { address: { contains: ', PE', mode: 'insensitive' as const } },
      { address: { contains: ', YT', mode: 'insensitive' as const } },
      { address: { contains: ', NT', mode: 'insensitive' as const } },
      { address: { contains: ', NU', mode: 'insensitive' as const } },
      { address: { contains: 'Ontario', mode: 'insensitive' as const } },
      { address: { contains: 'British Columbia', mode: 'insensitive' as const } },
      { address: { contains: 'Alberta', mode: 'insensitive' as const } },
      { address: { contains: 'Canada', mode: 'insensitive' as const } },
    ];
    const organizers = await prisma.organizer.findMany({
      where: {
        OR: [{ isClaimed: false }, { isUnmanagedListing: true }],
        contactEmail: { not: null },
        claimStatus: { notIn: ['CLAIMED', 'OPTED_OUT'] },
        suppressOutreach: false,
        NOT: [{ emailDiscoveryConfidence: 0.0 }, ...canadaExclusions],
      },
      select: {
        id: true,
        contactEmail: true,
      },
    });

    console.log(`[AutoSeedCron] Found ${organizers.length} eligible unmanaged organizers`);

    // Load suppressed emails
    const suppressions = await prisma.emailSuppression.findMany({
      select: { emailAddress: true },
    });
    const suppressedEmails = new Set(suppressions.map(s => s.emailAddress.toLowerCase()));

    // Load existing DirectoryClaimEmail organizerIds to avoid duplicates
    const existingClaims = await prisma.directoryClaimEmail.findMany({
      select: { organizerId: true },
      distinct: ['organizerId'],
    });
    const existingOrgIds = new Set(existingClaims.map(c => c.organizerId));

    console.log(`[AutoSeedCron] ${existingOrgIds.size} organizers already in outreach queue`);

    // Build insert list
    const toInsert: Array<{
      organizerId: string;
      emailAddress: string;
      status: string;
      attemptCount: number;
      nextAttemptAt: Date;
      createdAt: Date;
      trackingPixelId: string;
      trackingToken: string;
    }> = [];

    // Track email addresses already queued this run to prevent two organizers
    // sharing the same contactEmail from both entering the outreach queue.
    // We also need to check the DB for emails already present in existing rows
    // (different organizers may share sam@gmail.com across 48 rows, etc.).
    const existingClaimEmails = await prisma.directoryClaimEmail.findMany({
      select: { emailAddress: true },
      distinct: ['emailAddress'],
    });
    const existingEmailAddresses = new Set(existingClaimEmails.map(c => c.emailAddress.toLowerCase()));
    const seenEmailAddresses = new Set<string>();

    for (const org of organizers) {
      if (toInsert.length >= MAX_PER_RUN) break;

      if (existingOrgIds.has(org.id)) continue;

      const email = org.contactEmail;
      if (!email) continue;
      if (!isValidEmail(email)) {
        if (IMAGE_EXTENSION_RE.test(email)) {
          console.warn(`[AutoSeedCron] Skipped organizer ${org.id} — contactEmail looks like an image filename: ${email}`);
        }
        continue;
      }
      if (isPlaceholderEmail(email)) continue;
      if (suppressedEmails.has(email.toLowerCase())) continue;

      // Dedup by email address: skip if another organizer already has a DirectoryClaimEmail
      // row with this address, or if we already queued this email address this run.
      const emailLower = email.toLowerCase();
      if (existingEmailAddresses.has(emailLower)) {
        console.log(`[AutoSeedCron] Skipped organizer ${org.id} — emailAddress already in outreach queue: ${emailLower}`);
        continue;
      }
      if (seenEmailAddresses.has(emailLower)) {
        console.log(`[AutoSeedCron] Skipped organizer ${org.id} — duplicate emailAddress in this run: ${emailLower}`);
        continue;
      }
      seenEmailAddresses.add(emailLower);

      toInsert.push({
        organizerId: org.id,
        emailAddress: email,
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
        trackingPixelId: uuid(),
        trackingToken: crypto.randomBytes(32).toString('hex'),
      });
    }

    if (toInsert.length === 0) {
      console.log('[AutoSeedCron] No new organizers to seed. Run complete.');
      return;
    }

    const result = await prisma.directoryClaimEmail.createMany({
      data: toInsert,
      skipDuplicates: true,
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[AutoSeedCron] Created ${result.count} new DirectoryClaimEmail rows in ${elapsed}s`);

    if (toInsert.length >= MAX_PER_RUN) {
      console.log(`[AutoSeedCron] Hit cap of ${MAX_PER_RUN} — remaining organizers will be picked up on the next run`);
    }
  } catch (err) {
    console.error('[AutoSeedCron] Error:', err instanceof Error ? err.message : String(err));
  }
}

export function initAutoSeedOutreachCron(): void {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[AutoSeedCron] OUTREACH_ENABLED is not set to true — skipping cron registration');
    return;
  }

  // Run daily at 06:00 UTC — after email discovery (03:00) and lead scoring (02:00)
  cron.schedule('0 6 * * *', async () => {
    await runAutoSeedOutreach();
  });

  console.log('[AutoSeedCron] Registered — daily at 06:00 UTC');
}
