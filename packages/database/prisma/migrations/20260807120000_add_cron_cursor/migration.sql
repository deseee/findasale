-- DEV: Resumable-position store for long-running backfill/backlog batch jobs.
-- Root cause fixed: emailDiscoveryBatchJob, leadScoringService's backfill, and
-- websiteEnrichmentJob's backfill each held their pagination cursor only in a local
-- variable, so every Railway redeploy (multiple/day) killed the job mid-run and it
-- restarted from row 1 -- a 14k-row backlog never actually advanced.
-- Additive and non-locking only: new table, no column changes, no backfill, no drops.
-- Rollback:
--   DROP TABLE "CronCursor";

-- CreateTable
CREATE TABLE "CronCursor" (
    "jobName" TEXT NOT NULL,
    "cursor" TEXT,
    "rowsProcessedLastRun" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronCursor_pkey" PRIMARY KEY ("jobName")
);
