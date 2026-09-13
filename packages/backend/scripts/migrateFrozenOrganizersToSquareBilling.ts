// One-time migration-notice script for organizers "frozen-but-not-billing" on PRO/TEAMS
// since Stripe's platform account was permanently closed for fraud (early September 2026).
// These organizers currently keep PRO/TEAMS access with zero live billing enforcement
// (Stripe's webhooks are dead, so nothing has ever downgraded them) -- this script starts
// their migration clock: a 7-day grace window (same DUNNING_GRACE_DAYS figure used
// everywhere else in the Square Plan B billing build, for one consistent "you have a week"
// story) to add a Square payment method via /organizer/subscription before
// jobs/squareBillingChargeJob.ts's processFrozenMigrationDeadlines() downgrades them to
// SIMPLE for real. Never a silent cutover -- every organizer this script touches gets an
// email + in-app notification explaining exactly what's happening and by when, per
// Patrick's explicit "banner + grace window, never silent cutover" migration-comms
// direction (claude_docs/STATE.md's Square Subscriptions/Hunt Pass Blocked Queue entry).
//
// Scope: Organizer where subscriptionTier IN (PRO, TEAMS) AND billingProcessor IS NULL
// (never migrated to Square) AND billingGraceEndsAt IS NULL (migration clock not already
// started -- makes this script idempotent/safe to re-run: a second run only catches
// organizers who became frozen-PRO/TEAMS *after* the first run, never re-notifies or
// re-starts the clock for someone already in their grace window).
//
// Read-only until --apply is passed -- prints exactly who would be notified first.
// Not wired into any cron -- run manually, once, when Patrick is ready to start enforcing
// real Square billing again.
//
// Run from packages/backend:
//   npx tsx scripts/migrateFrozenOrganizersToSquareBilling.ts
//   npx tsx scripts/migrateFrozenOrganizersToSquareBilling.ts --apply

import { PrismaClient } from '@prisma/client';
import { createNotification } from '../src/lib/notificationService';
import { DUNNING_GRACE_DAYS } from '../src/services/squareBillingService';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

async function main() {
  console.log(`=== Frozen PRO/TEAMS -> Square migration notice -- ${APPLY ? 'APPLY mode (writing + emailing)' : 'DRY RUN (no writes)'} ===\n`);

  const candidates = await prisma.organizer.findMany({
    where: {
      subscriptionTier: { in: ['PRO', 'TEAMS'] },
      billingProcessor: null,
      billingGraceEndsAt: null,
    },
    select: {
      id: true,
      businessName: true,
      subscriptionTier: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  });

  console.log(`Found ${candidates.length} frozen organizer(s) never notified of the Square migration.\n`);

  if (candidates.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  for (const org of candidates) {
    console.log(`- ${org.businessName} (${org.id}, tier=${org.subscriptionTier}, email=${org.user?.email ?? 'none'})`);
  }

  if (!APPLY) {
    console.log(
      `\nDRY RUN: no organizer was touched. Re-run with --apply to start each organizer's ` +
      `${DUNNING_GRACE_DAYS}-day migration grace window and send the notice email.`
    );
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  const graceEndsAt = new Date(now.getTime() + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000);
  let notified = 0;
  let failed = 0;

  for (const org of candidates) {
    try {
      await prisma.organizer.update({
        where: { id: org.id },
        data: {
          billingGraceEndsAt: graceEndsAt,
          billingMigrationNoticeSentAt: now,
        },
      });

      if (org.userId) {
        await createNotification({
          userId: org.userId,
          type: 'square_billing_migration_notice',
          title: `Action needed: add a payment method for your ${org.subscriptionTier} subscription`,
          body:
            `FindA.Sale's old payment processor (Stripe) is permanently closed, so we're moving ` +
            `${org.subscriptionTier} billing to Square. Your account keeps full ${org.subscriptionTier} ` +
            `access for now, but please add a Square payment method within ${DUNNING_GRACE_DAYS} days ` +
            `(by ${graceEndsAt.toLocaleDateString()}) to keep it -- otherwise your account will be ` +
            `downgraded to SIMPLE tier automatically. Nothing else about your account changes.`,
          link: '/organizer/subscription',
          channel: 'OPERATIONAL',
          sendEmail: true,
        });
      }

      console.log(`  notified ${org.businessName} (${org.id}) -- grace ends ${graceEndsAt.toISOString()}`);
      notified++;
    } catch (err) {
      console.error(`  FAILED to notify ${org.businessName} (${org.id}):`, err);
      failed++;
    }
  }

  console.log(`\nDone. Notified: ${notified}, Failed: ${failed}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration notice script failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
