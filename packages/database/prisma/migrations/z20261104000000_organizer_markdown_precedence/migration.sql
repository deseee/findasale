-- OrganizerMarkdownPrecedence (2026-11-04): optional per-organizer choice of which automatic markdown wins when the
-- sale's Day-2/Day-3 markdowns and a markdown cycle could both apply to one item. No row = FIRST_WINS (the existing
-- 2026-10-30 "first one to cut the item owns it" behavior), so nothing changes for anyone until they choose.
--
-- SAFETY: additive. New table only; no existing table or data changes. Idempotent (IF NOT EXISTS).
-- No FK on purpose: schema.prisma models no relation (so every Organizer read is unaffected if this table is
-- missing), and a row left behind by a deleted organizer is never read.
-- Values are validated in code (services/markdownPrecedence.ts); the CHECK keeps the column to the known set.
-- ROLLBACK: DROP TABLE IF EXISTS "OrganizerMarkdownPrecedence"; (code treats a missing table as FIRST_WINS).
CREATE TABLE IF NOT EXISTS "OrganizerMarkdownPrecedence" (
  "organizerId" TEXT NOT NULL,
  "precedence" TEXT NOT NULL DEFAULT 'FIRST_WINS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizerMarkdownPrecedence_pkey" PRIMARY KEY ("organizerId"),
  CONSTRAINT "OrganizerMarkdownPrecedence_precedence_check" CHECK ("precedence" IN ('FIRST_WINS', 'SALE_TIERS_WIN', 'CYCLES_WIN'))
);
