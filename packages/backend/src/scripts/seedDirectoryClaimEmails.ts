/**
 * Seed DirectoryClaimEmail Script
 *
 * Populates the DirectoryClaimEmail table from existing unmanaged organizers.
 * This initializes the cold outreach pipeline with eligible contact emails.
 *
 * Eligibility criteria:
 * - Organizer must be UNMANAGED: isClaimed=false OR isUnmanagedListing=true
 * - contactEmail must be non-null and look like a valid email
 * - DirectoryClaimEmail entry must NOT already exist for this organizerId
 * - Email address must NOT be in EmailSuppression table
 * - claimStatus must NOT be 'CLAIMED' or 'OPTED_OUT'
 *
 * Usage (dry-run first):
 *   cd packages/backend
 *   DRY_RUN=true npx ts-node src/scripts/seedDirectoryClaimEmails.ts
 *
 * Real run (caution — creates database records):
 *   LIMIT=10 npx ts-node src/scripts/seedDirectoryClaimEmails.ts  # Test batch
 *   npx ts-node src/scripts/seedDirectoryClaimEmails.ts           # Full run
 *
 * Environment Variables:
 *   DRY_RUN=true      Print what would be inserted without writing
 *   LIMIT=N           Cap insert count to N records
 *
 * Idempotent: Running it twice will not duplicate — checks for existing DirectoryClaimEmail by organizerId.
 */

import { prisma } from '../lib/prisma';
import crypto from 'crypto';

const isValidEmail = (email: string): boolean => {
  // Simple email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

async function main() {
  const dryRun = process.env.DRY_RUN === 'true';
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;

  console.log('[seedDirectoryClaimEmails] Starting...');
  console.log(`[seedDirectoryClaimEmails] DRY_RUN=${dryRun}, LIMIT=${limit || 'unlimited'}`);

  const t0 = Date.now();
  let eligible = 0;
  let alreadyExists = 0;
  let suppressed = 0;
  let invalidEmail = 0;
  let inserted = 0;

  try {
    // Find all unmanaged organizers with contactEmail
    const organizers = await prisma.organizer.findMany({
      where: {
        // Unmanaged: either isClaimed=false or isUnmanagedListing=true
        OR: [{ isClaimed: false }, { isUnmanagedListing: true }],
        // Must have a contactEmail
        contactEmail: { not: null },
        // Must not be CLAIMED or OPTED_OUT
        claimStatus: { notIn: ['CLAIMED', 'OPTED_OUT'] },
      },
      select: {
        id: true,
        businessName: true,
        contactEmail: true,
      },
    });

    console.log(`[seedDirectoryClaimEmails] Found ${organizers.length} unmanaged organizers with contactEmail`);

    // Fetch all suppressed emails in one query for efficiency
    const suppressedEmails = new Set<string>();
    const suppressions = await prisma.emailSuppression.findMany({
      select: { emailAddress: true },
    });
    for (const supp of suppressions) {
      suppressedEmails.add(supp.emailAddress.toLowerCase());
    }
    console.log(`[seedDirectoryClaimEmails] Loaded ${suppressedEmails.size} suppressed emails`);

    // Check for existing DirectoryClaimEmail entries
    const existingClaimsByOrgId = new Set<string>();
    const existingClaims = await prisma.directoryClaimEmail.findMany({
      select: { organizerId: true },
    });
    for (const claim of existingClaims) {
      existingClaimsByOrgId.add(claim.organizerId);
    }
    console.log(`[seedDirectoryClaimEmails] ${existingClaimsByOrgId.size} organizers already have DirectoryClaimEmail entries`);

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

    for (const org of organizers) {
      eligible++;

      // Check if already exists
      if (existingClaimsByOrgId.has(org.id)) {
        alreadyExists++;
        continue;
      }

      // Validate email
      if (!isValidEmail(org.contactEmail)) {
        invalidEmail++;
        console.log(`[seedDirectoryClaimEmails] Skipped ${org.id} — invalid email: ${org.contactEmail}`);
        continue;
      }

      // Check suppression
      if (suppressedEmails.has(org.contactEmail.toLowerCase())) {
        suppressed++;
        console.log(`[seedDirectoryClaimEmails] Skipped ${org.id} — suppressed email: ${org.contactEmail}`);
        continue;
      }

      // Generate tracking IDs (match outreachEmailsCron pattern)
      const trackingPixelId = crypto.randomUUID();
      const trackingToken = crypto.randomBytes(32).toString('hex');

      toInsert.push({
        organizerId: org.id,
        emailAddress: org.contactEmail,
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(), // Ready to send immediately
        createdAt: new Date(),
        trackingPixelId,
        trackingToken,
      });

      if (limit && toInsert.length >= limit) {
        break;
      }
    }

    console.log(`[seedDirectoryClaimEmails] Ready to insert: ${toInsert.length}`);
    if (toInsert.length > 0 && !dryRun) {
      console.log(`[seedDirectoryClaimEmails] First 3 samples:`);
      for (let i = 0; i < Math.min(3, toInsert.length); i++) {
        const item = toInsert[i];
        console.log(`  ${i + 1}. ${item.organizerId} → ${item.emailAddress}`);
      }
    }

    if (dryRun) {
      console.log(`[seedDirectoryClaimEmails] *** DRY RUN — not writing to database ***`);
    } else {
      // Batch insert
      if (toInsert.length > 0) {
        await prisma.directoryClaimEmail.createMany({
          data: toInsert,
          skipDuplicates: true, // In case of race condition
        });
        inserted = toInsert.length;
      }
      console.log(`[seedDirectoryClaimEmails] ✓ Inserted ${inserted} records`);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[seedDirectoryClaimEmails] Summary (${elapsed}s):`);
    console.log(`  Eligible: ${eligible}`);
    console.log(`  Already exists: ${alreadyExists}`);
    console.log(`  Suppressed: ${suppressed}`);
    console.log(`  Invalid email: ${invalidEmail}`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`[seedDirectoryClaimEmails] Complete`);
  } catch (err) {
    console.error('[seedDirectoryClaimEmails] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
