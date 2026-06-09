/**
 * backfill-warm-emails.ts
 *
 * One-time backfill: creates DirectoryClaimEmail records for WARM-tier organizers
 * that have a contactEmail but no existing outreach queue entry.
 *
 * These 462 leads are outreach-eligible but were never seeded because:
 * - autoSeedOutreachCron only processes organizers at the time it runs (forward-only)
 * - seedDirectoryClaimEmails.ts seeds by unmanaged status, not leadTier gap
 * - Lead scoring runs after the seed job, so newly WARM organizers fall through
 *
 * Safety:
 * - Creating PENDING records while OUTREACH_ENABLED=false is SAFE.
 *   outreachEmailsCron has a hard kill switch (OUTREACH_ENABLED !== 'true') at the
 *   very top of sendOutreachEmails() — no sends can occur until the flag is enabled.
 * - Dedup: skips organizers already in the queue (by organizerId OR emailAddress).
 * - No unique constraint on emailAddress in DirectoryClaimEmail, but dedup logic
 *   here mirrors autoSeedOutreachCron to avoid duplicate rows for the same address.
 * - suppressOutreach=true organizers are excluded.
 * - EmailSuppression list is checked before insert.
 *
 * Usage (always dry-run first):
 *   cd packages/backend
 *   DRY_RUN=true npx ts-node src/scripts/backfill-warm-emails.ts
 *   npx ts-node src/scripts/backfill-warm-emails.ts
 *
 * Environment Variables:
 *   DRY_RUN=true   Print what would be inserted without writing (default: false)
 *   LIMIT=N        Cap insert count to N records (default: unlimited)
 */

import { prisma } from '../lib/prisma';
import { isEmailDomainBlocked } from '../services/suppressionService';
import crypto from 'crypto';

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico)(\b|$)/i;

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  if (IMAGE_EXTENSION_RE.test(email)) return false;
  return true;
};

// Mirrors placeholder list from seedDirectoryClaimEmails.ts and autoSeedOutreachCron.ts
const PLACEHOLDER_DOMAINS = new Set([
  'domain.com', 'domain.org', 'domain.net',
  'example.com', 'example.org', 'example.net',
  'yourdomain.com', 'yourdomain.org', 'yourdomain.net',
  'test.com', 'test.org',
  'system.finda.sale', // scraper placeholder — never a real inbox
]);

const PLACEHOLDER_FULL_ADDRESSES = new Set([
  'name@email.com',
  'user@email.com',
  'noreply@gmail.com',
  'no-reply@gmail.com',
  'donotreply@gmail.com',
]);

const isPlaceholderEmail = (email: string): boolean => {
  const lower = email.toLowerCase().trim();
  if (PLACEHOLDER_FULL_ADDRESSES.has(lower)) return true;
  const domain = lower.split('@')[1];
  if (domain && PLACEHOLDER_DOMAINS.has(domain)) return true;
  if (domain && domain.endsWith('.wixpress.com')) return true;
  return false;
};

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === 'true';
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;

  console.log('[BackfillWarmEmails] Starting...');
  console.log(`[BackfillWarmEmails] DRY_RUN=${dryRun}, LIMIT=${limit ?? 'unlimited'}`);

  const t0 = Date.now();

  // ── Step 1: Load WARM organizers with contactEmail ────────────────────────
  const warmOrganizers = await prisma.organizer.findMany({
    where: {
      leadTier: 'WARM',
      contactEmail: { not: null },
      // Must be unmanaged (unclaimed or scraped listing)
      OR: [{ isClaimed: false }, { isUnmanagedListing: true }],
      // Skip opted-out or claimed
      claimStatus: { notIn: ['CLAIMED', 'OPTED_OUT'] },
      // Respect outreach suppression flag
      suppressOutreach: false,
      // Skip known-junk emails (confidence=0.0 means emailDiscoveryService marked it invalid)
      NOT: { emailDiscoveryConfidence: 0.0 },
    },
    select: {
      id: true,
      businessName: true,
      contactEmail: true,
    },
  });

  console.log(`[BackfillWarmEmails] Found ${warmOrganizers.length} WARM organizers with contactEmail`);

  // ── Step 2: Load existing queue entries (by organizerId AND emailAddress) ──
  const existingClaims = await prisma.directoryClaimEmail.findMany({
    select: { organizerId: true, emailAddress: true },
  });
  const existingOrgIds = new Set(existingClaims.map(c => c.organizerId));
  const existingEmailAddresses = new Set(existingClaims.map(c => c.emailAddress.toLowerCase()));
  console.log(`[BackfillWarmEmails] ${existingOrgIds.size} organizers already in outreach queue`);
  console.log(`[BackfillWarmEmails] ${existingEmailAddresses.size} unique email addresses already in outreach queue`);

  // ── Step 3: Load suppression list ─────────────────────────────────────────
  const suppressions = await prisma.emailSuppression.findMany({
    select: { emailAddress: true },
  });
  const suppressedEmails = new Set(suppressions.map(s => s.emailAddress.toLowerCase()));
  console.log(`[BackfillWarmEmails] Loaded ${suppressedEmails.size} suppressed emails`);

  // ── Step 4: Build insert list ──────────────────────────────────────────────
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

  let skippedAlreadyQueued = 0;
  let skippedEmailAlreadyQueued = 0;
  let skippedInvalidEmail = 0;
  let skippedPlaceholder = 0;
  let skippedSuppressed = 0;

  // Track email addresses added this run to avoid inserting the same address twice
  // (multiple WARM organizers could share a contactEmail)
  const seenThisRun = new Set<string>();

  for (const org of warmOrganizers) {
    if (limit && toInsert.length >= limit) break;

    // Skip if this organizer already has a queue entry
    if (existingOrgIds.has(org.id)) {
      skippedAlreadyQueued++;
      continue;
    }

    const email = org.contactEmail;
    if (!email) {
      skippedInvalidEmail++;
      continue;
    }

    if (!isValidEmail(email)) {
      skippedInvalidEmail++;
      console.log(`[BackfillWarmEmails] Skipped ${org.id} (${org.businessName}) — invalid email: ${email}`);
      continue;
    }

    if (isPlaceholderEmail(email)) {
      skippedPlaceholder++;
      continue;
    }

    if (suppressedEmails.has(email.toLowerCase())) {
      skippedSuppressed++;
      console.log(`[BackfillWarmEmails] Skipped ${org.id} (${org.businessName}) — suppressed: ${email}`);
      continue;
    }
    if (isEmailDomainBlocked(email)) {
      skippedSuppressed++;
      console.log(`[BackfillWarmEmails] Skipped ${org.id} (${org.businessName}) — blocked domain: ${email}`);
      continue;
    }

    const emailLower = email.toLowerCase();

    // Skip if another organizer already has a queue row with this email address
    if (existingEmailAddresses.has(emailLower)) {
      skippedEmailAlreadyQueued++;
      console.log(`[BackfillWarmEmails] Skipped ${org.id} (${org.businessName}) — email already in queue under different organizer: ${emailLower}`);
      continue;
    }

    // Skip if we've already queued this email address in this run
    if (seenThisRun.has(emailLower)) {
      skippedEmailAlreadyQueued++;
      console.log(`[BackfillWarmEmails] Skipped ${org.id} (${org.businessName}) — duplicate email in this run: ${emailLower}`);
      continue;
    }

    seenThisRun.add(emailLower);

    toInsert.push({
      organizerId: org.id,
      emailAddress: email,
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      createdAt: new Date(),
      trackingPixelId: crypto.randomUUID(),
      trackingToken: crypto.randomBytes(32).toString('hex'),
    });
  }

  // ── Step 5: Report + insert ───────────────────────────────────────────────
  console.log('');
  console.log('[BackfillWarmEmails] Pre-insert summary:');
  console.log(`  WARM organizers with contactEmail:   ${warmOrganizers.length}`);
  console.log(`  Already in queue (by organizerId):   ${skippedAlreadyQueued}`);
  console.log(`  Already in queue (by emailAddress):  ${skippedEmailAlreadyQueued}`);
  console.log(`  Invalid email:                       ${skippedInvalidEmail}`);
  console.log(`  Placeholder/template email:          ${skippedPlaceholder}`);
  console.log(`  Suppressed:                          ${skippedSuppressed}`);
  console.log(`  Ready to insert:                     ${toInsert.length}`);

  if (toInsert.length > 0) {
    console.log('');
    console.log('[BackfillWarmEmails] First 5 records to insert:');
    for (let i = 0; i < Math.min(5, toInsert.length); i++) {
      const item = toInsert[i];
      console.log(`  ${i + 1}. organizerId=${item.organizerId}  email=${item.emailAddress}`);
    }
  }

  if (dryRun) {
    console.log('');
    console.log('[BackfillWarmEmails] *** DRY RUN — no records written ***');
  } else {
    if (toInsert.length === 0) {
      console.log('[BackfillWarmEmails] Nothing to insert. Done.');
    } else {
      const result = await prisma.directoryClaimEmail.createMany({
        data: toInsert,
        skipDuplicates: true, // Safety net for trackingPixelId/trackingToken uniqueness collisions
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log('');
      console.log(`[BackfillWarmEmails] Created ${result.count} DirectoryClaimEmail records for WARM leads (${elapsed}s)`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[BackfillWarmEmails] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
