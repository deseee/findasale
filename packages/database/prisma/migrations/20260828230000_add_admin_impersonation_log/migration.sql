-- Migration: add_admin_impersonation_log
-- Admin "log in as user" QA/support tooling (2026-08-28). Purely additive: one new
-- table, no changes to any existing table. Records every admin-initiated
-- impersonation session (who, whom, when, optional reason) — see
-- adminController.ts `impersonateUser`.

CREATE TABLE IF NOT EXISTS "AdminImpersonationLog" (
    "id"           TEXT NOT NULL,
    "adminUserId"  TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "reason"       TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminImpersonationLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminImpersonationLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminImpersonationLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdminImpersonationLog_adminUserId_idx" ON "AdminImpersonationLog"("adminUserId");
CREATE INDEX IF NOT EXISTS "AdminImpersonationLog_targetUserId_idx" ON "AdminImpersonationLog"("targetUserId");
