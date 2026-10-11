-- One-time setup: a restricted Postgres role for test/seed/one-off scripts, enforced
-- via row-level security so it can ONLY write Sale/Item rows under the existing
-- QA-prefix convention. Context: claude/data-persistence-health-2026-10-11.md --
-- 4 Sale rows appeared under REAL organizer IDs and were deleted within ~24h with
-- zero application trace, most likely a script that used a real org id instead of
-- a QA one. Today every script in scripts/ that touches the DB connects with the
-- same full-privilege DATABASE_URL as the live backend -- this role removes that
-- single point of ambiguity going forward, independent of which language/tool a
-- future script uses (raw psycopg2, a .mjs script, a manual psql session all go
-- through the same Postgres-level check).
--
-- Run this ONCE against Railway (Patrick, via the normal migration runbook --
-- this is role/policy DDL, not a Prisma migration, so it's not part of
-- `prisma migrate deploy`). Safe to re-run: every statement is idempotent.
--
-- After running, any new test/seed/cleanup script should connect using
-- findasale_test's credentials (see SECURITY.md "Database Write Isolation"), NOT
-- the backend's full-privilege DATABASE_URL. The live backend app's own role is
-- untouched by this script and keeps full read/write access to everything.

-- 1. The restricted role. Replace 'CHANGE_ME' with a generated password before
--    running, and store it the same way DATABASE_URL itself is stored (never in
--    git, never in claude_docs -- see SECURITY.md Sec.6).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'findasale_test') THEN
        CREATE ROLE findasale_test LOGIN PASSWORD 'CHANGE_ME';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE railway TO findasale_test;
GRANT USAGE ON SCHEMA public TO findasale_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Sale", "Item" TO findasale_test;
-- Needed so the role can satisfy its own RLS policy's subquery against Organizer,
-- and so seed scripts can read other tables they typically need (read-only elsewhere).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO findasale_test;

-- 2. Row-level security on Sale: this role may only write rows whose organizer
--    matches the existing QA-prefix exclusion convention (the same regex the daily
--    data-persistence monitor already uses to exclude test fixtures).
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_test_role_qa_only ON "Sale";
CREATE POLICY sale_test_role_qa_only ON "Sale"
    FOR ALL
    TO findasale_test
    USING (
        "organizerId" IN (
            SELECT id FROM "Organizer"
            WHERE "businessName" ~* '^(QA[ -]|DynTest|SecTest|ZZTEST)' OR id ILIKE 'qa-%'
        )
    )
    WITH CHECK (
        "organizerId" IN (
            SELECT id FROM "Organizer"
            WHERE "businessName" ~* '^(QA[ -]|DynTest|SecTest|ZZTEST)' OR id ILIKE 'qa-%'
        )
    );

-- 3. Same policy on Item, using its denormalized organizerId directly (Item doesn't
--    join through Sale for this -- see packages/database/prisma/schema.prisma,
--    "organizerId ... Denormalized from sale.organizerId for library queries").
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_test_role_qa_only ON "Item";
CREATE POLICY item_test_role_qa_only ON "Item"
    FOR ALL
    TO findasale_test
    USING (
        "organizerId" IS NULL OR "organizerId" IN (
            SELECT id FROM "Organizer"
            WHERE "businessName" ~* '^(QA[ -]|DynTest|SecTest|ZZTEST)' OR id ILIKE 'qa-%'
        )
    )
    WITH CHECK (
        "organizerId" IS NULL OR "organizerId" IN (
            SELECT id FROM "Organizer"
            WHERE "businessName" ~* '^(QA[ -]|DynTest|SecTest|ZZTEST)' OR id ILIKE 'qa-%'
        )
    );

-- 4. The live backend app's own role must NOT be subject to this restriction.
--    RLS policies only apply to roles they're defined FOR (here, just
--    findasale_test) UNLESS the table owner also has RLS forced on it via
--    FORCE ROW LEVEL SECURITY, which this script deliberately does NOT set.
--    The backend's role (whatever currently owns/uses these tables via
--    DATABASE_URL) is unaffected by the policies above and keeps full access,
--    with no changes needed on its side.
