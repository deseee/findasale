/**
 * backfill-null-source-esn.ts
 *
 * One-time backfill: fixes 2,195 EstateSales.NET organizer records created before
 * the S654 scraper-hardening session added sourcesJson / directoryMostRecentSource
 * tracking to getOrCreateScrapedOrganizer.
 *
 * Root cause (investigated S[current]):
 *   - ESN scraper ran ~May 2, 2026 using the pre-S654 version of scraper/index.ts
 *     which created organizers WITHOUT setting sourcesJson or directoryMostRecentSource.
 *   - Identification: system User.email LIKE '%estatesalesnet@system.finda.sale'
 *   - Count: 2,195 organizers with NULL directoryMostRecentSource
 *   - These make up 63% of recent hard bounces (48 with contactEmail in outreach queue)
 *
 * This script also cleans up the 3 sentry-domain entries in DirectoryClaimEmail
 * that slipped through pre-hardening placeholder filters.
 *
 * Safety:
 *   - DRY_RUN=true (default) prints what would change without writing.
 *   - Only touches organizers where User.email ends in 'estatesalesnet@system.finda.sale'
 *     AND directoryMostRecentSource IS NULL — never overwrites existing attribution.
 *   - Does NOT modify contactEmail or any other field.
 *
 * Usage:
 *   cd packages/backend
 *   DRY_RUN=true npx ts-node src/scripts/backfill-null-source-esn.ts  # preview
 *   npx ts-node src/scripts/backfill-null-source-esn.ts               # run it
 */

import { prisma } from '../lib/prisma';

const BATCH_SIZE = 500;
const SOURCE_NAME = 'EstateSalesNet';

// Sentry-domain emails confirmed in DirectoryClaimEmail queue (pre-hardening artifact)
// These get status → 'INVALID' to prevent future outreach attempts.
const SENTRY_DOMAIN_PATTERN = '%sentry%';

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN !== 'false';

  console.log('[BackfillNullSourceESN] Starting...');
  console.log(`[BackfillNullSourceESN] DRY_RUN=${dryRun}`);
  console.log('[BackfillNullSourceESN] Target: ESN organizers with NULL directoryMostRecentSource');

  const t0 = Date.now();

  // ── Step 1: Find all affected organizer IDs ────────────────────────────────
  // We identify via User.email pattern — the system email slug always ends with
  // -{source}@system.finda.sale, so 'estatesalesnet@system.finda.sale' is the fingerprint.
  const affectedUsers = await prisma.user.findMany({
    where: {
      email: {
        endsWith: 'estatesalesnet@system.finda.sale',
      },
      organizer: {
        directoryMostRecentSource: null,
      },
    },
    select: {
      id: true,
      email: true,
      organizer: {
        select: { id: true, businessName: true, sourcesJson: true },
      },
    },
  });

  const affected = affectedUsers
    .filter((u) => u.organizer !== null)
    .map((u) => ({ orgId: u.organizer!.id, bizName: u.organizer!.businessName, email: u.email }));

  console.log(`[BackfillNullSourceESN] Found ${affected.length} organizers to backfill`);

  if (affected.length === 0) {
    console.log('[BackfillNullSourceESN] Nothing to do — already clean.');
  } else if (dryRun) {
    console.log('[BackfillNullSourceESN] DRY RUN — first 5 that would be updated:');
    for (let i = 0; i < Math.min(5, affected.length); i++) {
      console.log(`  ${i + 1}. ${affected[i].bizName} (${affected[i].orgId})`);
    }
    console.log(`[BackfillNullSourceESN] ... and ${Math.max(0, affected.length - 5)} more`);
  } else {
    // ── Step 2: Update in batches ────────────────────────────────────────────
    const now = new Date().toISOString();
    const sourceEntry = { sourceName: SOURCE_NAME, lastSeen: now };
    let updated = 0;

    for (let i = 0; i < affected.length; i += BATCH_SIZE) {
      const batch = affected.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((b) => b.orgId);

      await prisma.organizer.updateMany({
        where: { id: { in: batchIds } },
        data: {
          directoryMostRecentSource: SOURCE_NAME,
          directoryMostRecentAt: new Date(),
          sourcesJson: [sourceEntry] as any,
          sourceCount: 1,
          // corroborationScore stays at 0.5 — single-source is correct
        },
      });

      updated += batch.length;
      console.log(
        `[BackfillNullSourceESN] Batch ${Math.ceil((i + 1) / BATCH_SIZE)}: updated ${updated}/${affected.length}`,
      );
    }

    console.log(`[BackfillNullSourceESN] ✓ Updated ${updated} organizers with source='${SOURCE_NAME}'`);
  }

  // ── Step 3: Clean up sentry-domain entries in DirectoryClaimEmail ──────────
  // These slipped through before the sentry.io domain was added to UNSENDABLE_DOMAINS.
  // Mark them INVALID so outreachEmailsCron skips them permanently.
  const sentryInQueue = await prisma.directoryClaimEmail.findMany({
    where: {
      emailAddress: { contains: 'sentry' },
      status: { not: 'INVALID' },
    },
    select: { id: true, emailAddress: true, status: true },
  });

  console.log(
    `\n[BackfillNullSourceESN] DirectoryClaimEmail sentry entries (status != INVALID): ${sentryInQueue.length}`,
  );

  if (sentryInQueue.length === 0) {
    console.log('[BackfillNullSourceESN] Sentry queue — already clean.');
  } else if (dryRun) {
    console.log('[BackfillNullSourceESN] DRY RUN — sentry entries that would be invalidated:');
    for (const row of sentryInQueue) {
      console.log(`  ${row.id}: ${row.emailAddress} (status=${row.status})`);
    }
  } else {
    await prisma.directoryClaimEmail.updateMany({
      where: { id: { in: sentryInQueue.map((r) => r.id) } },
      data: { status: 'INVALID' },
    });
    console.log(
      `[BackfillNullSourceESN] ✓ Marked ${sentryInQueue.length} sentry DirectoryClaimEmail entries as INVALID`,
    );
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`\n[BackfillNullSourceESN] Complete (${elapsed}s)`);
  if (dryRun) {
    console.log('[BackfillNullSourceESN] Re-run with DRY_RUN=false to apply changes.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[BackfillNullSourceESN] Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
