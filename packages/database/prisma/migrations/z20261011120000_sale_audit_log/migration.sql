-- SaleAuditLog: trigger-populated audit trail for Sale rows under MANAGED organizers.
-- See claude/data-persistence-health-2026-10-11.md: 4 Sale rows under real organizer
-- IDs were created and hard-deleted within ~24h with zero application-level trace.
-- This is deliberately a DATABASE TRIGGER, not app-level logging in saleController.ts/
-- adminController.ts, because that incident's writes bypassed the app entirely (raw
-- psql / a script / a test harness). A trigger fires on any write regardless of how
-- it got there. Scoped to Organizer.isClaimed = true to skip the heavy unmanaged
-- scraper churn (16k+/day) this DB otherwise sees -- that volume doesn't need auditing
-- here and would make the log useless as a signal.

-- 1. The audit table itself (matches the SaleAuditLog Prisma model above).
CREATE TABLE IF NOT EXISTS "SaleAuditLog" (
    "id"          TEXT NOT NULL,
    "saleId"      TEXT NOT NULL,
    "organizerId" TEXT,
    "title"       TEXT,
    "status"      TEXT,
    "action"      TEXT NOT NULL,
    "source"      TEXT,
    "actorUserId" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaleAuditLog_saleId_idx" ON "SaleAuditLog"("saleId");
CREATE INDEX IF NOT EXISTS "SaleAuditLog_organizerId_idx" ON "SaleAuditLog"("organizerId");
CREATE INDEX IF NOT EXISTS "SaleAuditLog_createdAt_idx" ON "SaleAuditLog"("createdAt");

-- 2. Trigger function. Prisma's cuid() isn't available in plain SQL, so this generates
--    a reasonably unique id with gen_random_uuid() (pgcrypto) -- good enough for an
--    internal audit row that's never looked up by id directly, only by saleId/organizerId.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION sale_audit_log_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_is_managed BOOLEAN;
    v_action TEXT;
    v_row RECORD;
BEGIN
    v_row := COALESCE(NEW, OLD);

    SELECT "isClaimed" INTO v_is_managed
    FROM "Organizer"
    WHERE "id" = v_row."organizerId";

    IF v_is_managed IS NOT TRUE THEN
        RETURN NEW; -- unmanaged/scraped org, or organizerId not found -- not what this log is for
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'HARD_DELETE';
    ELSIF TG_OP = 'UPDATE' AND OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN
        v_action := 'SOFT_DELETE';
    ELSE
        RETURN NEW; -- UPDATE that isn't a soft-delete transition -- not logged here
    END IF;

    INSERT INTO "SaleAuditLog" ("id", "saleId", "organizerId", "title", "status", "action", "source", "createdAt")
    VALUES (
        gen_random_uuid()::TEXT,
        v_row."id",
        v_row."organizerId",
        v_row."title",
        v_row."status",
        v_action,
        'db_trigger',
        CURRENT_TIMESTAMP
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Triggers. AFTER so they never block or alter the write itself.
DROP TRIGGER IF EXISTS sale_audit_log_insert ON "Sale";
CREATE TRIGGER sale_audit_log_insert
    AFTER INSERT ON "Sale"
    FOR EACH ROW EXECUTE FUNCTION sale_audit_log_trigger();

DROP TRIGGER IF EXISTS sale_audit_log_delete ON "Sale";
CREATE TRIGGER sale_audit_log_delete
    AFTER DELETE ON "Sale"
    FOR EACH ROW EXECUTE FUNCTION sale_audit_log_trigger();

DROP TRIGGER IF EXISTS sale_audit_log_soft_delete ON "Sale";
CREATE TRIGGER sale_audit_log_soft_delete
    AFTER UPDATE OF "deletedAt" ON "Sale"
    FOR EACH ROW EXECUTE FUNCTION sale_audit_log_trigger();
