-- Drop confirmed-dead columns/model/enum, per architect investigation
-- claude_docs/architecture/column-usage-investigation-2026-08-09.md (16 DEAD columns
-- identified; 15 dropped here -- osmNodeId excluded, it was re-wired live same session
-- in getOrCreateScrapedOrganizer()/osmScraper.ts and is no longer dead).
-- Re-verified 100% NULL / single-default-value / zero-row across all applicable tables
-- immediately before this migration was applied directly to production (2026-08-09).
-- Applied live via pg8000 same session; this file records it for migration history.

-- Lucky Roll cluster (feature killed by Patrick 2026-08-08, superseded by Early Access Cache)
DROP TABLE "LuckyRoll";
DROP TYPE "LuckyRollOutcome";
ALTER TABLE "User" DROP COLUMN "luckyRollPityCount";
ALTER TABLE "User" DROP COLUMN "luckyRollPityYear";
ALTER TABLE "User" DROP COLUMN "luckyRollLastRolledAt";
ALTER TABLE "User" DROP COLUMN "luckyRollStreakBad";

-- Abandoned directory recheck-scheduler + claim-email-scheduler designs
-- (superseded by DirectoryCrawlQueue / DirectoryClaimEmail.nextAttemptAt, same migration)
ALTER TABLE "Organizer" DROP COLUMN "directoryNextCheckAt";
ALTER TABLE "Organizer" DROP COLUMN "directoryCheckIntervalDays";
ALTER TABLE "Organizer" DROP COLUMN "directoryLastCheckedSource";
ALTER TABLE "Organizer" DROP COLUMN "directoryDataHash";
ALTER TABLE "Organizer" DROP COLUMN "directoryHashUpdatedAt";
ALTER TABLE "Organizer" DROP COLUMN "directoryNextClaimEmailAt";
ALTER TABLE "Organizer" DROP COLUMN "claimEmailIntervalDays";

-- Lead-scoring fields scaffolded but excluded from the shipped leadScoringService.ts formula
ALTER TABLE "Organizer" DROP COLUMN "annualSalesEstimate";
ALTER TABLE "Organizer" DROP COLUMN "staffSizeEstimate";
ALTER TABLE "Organizer" DROP COLUMN "reviewVelocity";

-- Stripe Identity session tracking -- never wired; Stripe Connect's own account.requirements
-- already handles identity checks (legal-stripe-consignor-payout-compliance-2026-07-26.md)
ALTER TABLE "Organizer" DROP COLUMN "stripeIdentitySessionId";
