-- ============================================================================================
-- consignor_payout_status_backfill.sql
--
-- *** NOT APPLIED. *** Do NOT run this until Patrick has checked the preview below against real data.
-- This file deliberately lives OUTSIDE prisma/migrations/, so `prisma migrate deploy` never runs it.
--
-- WHY IT IS OPTIONAL: the backend already maps legacy status values on READ
-- (consignorLedgerService.normalizePayoutStatus / normalizeBatchStatus), so nothing breaks if this is
-- never applied. Applying it makes the stored values match the new vocabulary (PENDING | ON_HOLD |
-- PAID | VOID) so reports and ad-hoc SQL are simpler.
--
--   SIMULATED         -> VOID     (Stripe test mode, no money ever moved)
--   MANUAL_CASH_CHECK -> PENDING  (flagged "pay this one by hand", not yet recorded as paid)
--   COMPLETED         -> PAID     (a real transfer completed)
--
-- READ THIS FIRST: legacy rows have NO ConsignorPayoutItem lines, so the ledger cannot know which sold
-- items they covered. The backend therefore holds back sold items that pre-date a legacy payout
-- for the same consignor (reason LEGACY_PAYOUT_OVERLAP) until the organizer confirms them. Flipping
-- statuses here does not change that. COMPLETED rows should be checked against real bank/Stripe
-- records before being relabelled PAID.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- STEP 1. READ-ONLY PREVIEW (safe to run any time). Review every number before going further.
-- --------------------------------------------------------------------------------------------
SELECT p."status"                       AS current_status,
       COALESCE(p."method", '(none)')   AS method,
       (p."settlementBatchId" IS NULL)  AS standalone_no_batch,
       COUNT(*)                         AS payout_rows,
       COALESCE(SUM(p."netPayout"), 0)  AS total_net_payout,
       MIN(p."createdAt")               AS oldest,
       MAX(p."createdAt")               AS newest
FROM "ConsignorPayout" p
WHERE p."status" IN ('SIMULATED', 'MANUAL_CASH_CHECK', 'COMPLETED')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- Legacy standalone rows written by the old "Process payout" modal: they sit at the default PENDING
-- with no batch and no lines, even though the organizer meant them as "I paid this". These are NOT
-- touched by the statements below. List them and decide by hand.
SELECT p."id", p."consignorId", p."saleId", p."netPayout", p."method", p."paidAt", p."createdAt", p."notes"
FROM "ConsignorPayout" p
WHERE p."status" = 'PENDING'
  AND p."settlementBatchId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ConsignorPayoutItem" i WHERE i."payoutId" = p."id")
ORDER BY p."createdAt";

-- Batches that would look like test runs (COMPLETED, every payout SIMULATED):
SELECT b."id", b."saleId", b."status", b."createdAt", COUNT(p."id") AS payouts
FROM "ConsignorSettlementBatch" b
JOIN "ConsignorPayout" p ON p."settlementBatchId" = b."id"
GROUP BY b."id"
HAVING BOOL_AND(p."status" = 'SIMULATED');

-- --------------------------------------------------------------------------------------------
-- STEP 2. THE BACKFILL. Everything below is commented out on purpose. Uncomment ONE block at a
-- time, run it inside a transaction, check the row counts, then COMMIT.
-- --------------------------------------------------------------------------------------------

-- BEGIN;
--
-- -- A. Test-mode rows become VOID. (No money moved.) Void metadata is stamped so the audit is honest.
-- UPDATE "ConsignorPayout"
--    SET "status" = 'VOID',
--        "voidedAt" = COALESCE("voidedAt", NOW()),
--        "voidReason" = COALESCE("voidReason", 'Backfill: Stripe test-mode simulation, no money moved')
--  WHERE "status" = 'SIMULATED';
--
-- -- B. Manual cash/check flags become PENDING (owed, not yet recorded as paid).
-- UPDATE "ConsignorPayout"
--    SET "status" = 'PENDING'
--  WHERE "status" = 'MANUAL_CASH_CHECK';
--
-- -- C. Completed transfers become PAID. Only after the STEP 1 preview matches real bank/Stripe records.
-- UPDATE "ConsignorPayout"
--    SET "status" = 'PAID',
--        "paidAmount" = COALESCE("paidAmount", "netPayout"),
--        "paidRecordedAt" = COALESCE("paidRecordedAt", "paidAt")
--  WHERE "status" = 'COMPLETED';
--
-- -- Verify, then COMMIT (or ROLLBACK if anything looks wrong):
-- SELECT "status", COUNT(*) FROM "ConsignorPayout" GROUP BY 1 ORDER BY 1;
-- COMMIT;

-- Rollback for a committed backfill is NOT automatic (original values are not stored). Take a snapshot
-- first if you want one:
--   CREATE TABLE "_ConsignorPayout_status_backup_20260929" AS SELECT "id", "status", "paidAmount", "paidRecordedAt", "voidedAt", "voidReason" FROM "ConsignorPayout";
