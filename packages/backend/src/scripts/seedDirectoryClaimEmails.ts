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

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico)(\b|$)/i;

const isValidEmail = (email: string): boolean => {
  // Simple email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  // Reject image filenames that accidentally match email pattern
  // (e.g. "wastelandlogo_250x@2x.png", "Pink_Yellow_Star@2x.jpeg")
  if (IMAGE_EXTENSION_RE.test(email)) return false;
  return true;
};

// Placeholder/template addresses that are syntactically valid but semantically junk.
// Source: scan of Organizer.contactEmail showed 22 distinct placeholders, 200+ rows.
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
  // Wix infrastructure (e.g. sentry-next.wixpress.com — error tracking endpoint, not user email)
  if (domain && domain.endsWith('.wixpress.com')) return true;
  // catch local-part-only junk like "info", "call", "3092" already filtered by isValidEmail
  return false;
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
  let placeholder = 0;
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
        // Skip emails marked as junk by emailDiscoveryService (confidence=0.0)
        // NULL confidence = scraper-set email (trusted); 0.0 = known junk (blocked)
        NOT: { emailDiscoveryConfidence: 0.0 },
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

      // Narrow nullable type — Prisma where: { not: null } does not narrow the result type
      const email = org.contactEmail;
      if (!email) {
        invalidEmail++;
        continue;
      }

      // Validate email
      if (!isValidEmail(email)) {
        invalidEmail++;
        if (IMAGE_EXTENSION_RE.test(email)) {
          console.warn(`[seedDirectoryClaimEmails] Skipped ${org.id} — contactEmail looks like an image filename: ${email}`);
        } else {
          console.log(`[seedDirectoryClaimEmails] Skipped ${org.id} — invalid email: ${email}`);
        }
        continue;
      }

      // Reject template/placeholder addresses (user@domain.com, email@example.com, etc.)
      if (isPlaceholderEmail(email)) {
        placeholder++;
        continue;
      }

      // Check suppression
      if (suppressedEmails.has(email.toLowerCase())) {
        suppressed++;
        console.log(`[seedDirectoryClaimEmails] Skipped ${org.id} — suppressed email: ${email}`);
        continue;
      }

      // Generate tracking IDs (match outreachEmailsCron pattern)
      const trackingPixelId = crypto.randomUUID();
      const trackingToken = crypto.randomBytes(32).toString('hex');

      toInsert.push({
        organizerId: org.id,
        emailAddress: email,
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
    console.log(`  Placeholder addresses: ${placeholder}`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`[seedDirectoryClaimEmails] Complete`);
  } catch (err) {
    console.error('[seedDirectoryClaimEmails] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
