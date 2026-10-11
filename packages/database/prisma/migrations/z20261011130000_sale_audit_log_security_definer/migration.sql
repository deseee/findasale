-- Follow-up fix to z20261011120000_sale_audit_log: the trigger function was not
-- SECURITY DEFINER, so it ran with the CALLING role's own privileges. That broke
-- the findasale_test role (added by scripts/setup-test-role-rls.sql, same incident)
-- the moment it tried a legitimate write under a QA-prefixed organizer: Postgres
-- let the Sale write through RLS, but the trigger's own INSERT into "SaleAuditLog"
-- then failed with "permission denied for table SaleAuditLog", because
-- findasale_test was only ever granted write access to "Sale"/"Item", not the
-- audit table.
--
-- Fix: make the trigger function SECURITY DEFINER so it always runs as the
-- function's owner (the backend's own full-privilege role) regardless of which
-- role performed the write that fired it. This is also the more correct shape
-- for an audit-log trigger in general -- no future restricted role should need
-- its own direct grant on SaleAuditLog just to be auditable. search_path is
-- pinned explicitly, standard practice for SECURITY DEFINER functions.
--
-- Verified live on 2026-10-11: findasale_test can write/clean up a QA-org Sale
-- row (trigger fires, audit row written, no permission error) and is still
-- correctly blocked by RLS from writing to a real organizer's Sale row.

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
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'HARD_DELETE';
    ELSIF TG_OP = 'UPDATE' AND OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN
        v_action := 'SOFT_DELETE';
    ELSE
        RETURN NEW;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
