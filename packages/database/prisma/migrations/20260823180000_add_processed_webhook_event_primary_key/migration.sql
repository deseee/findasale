-- Production drift fix: ProcessedWebhookEvent has no PRIMARY KEY constraint.
--
-- Root cause: `schema.prisma` has always declared `eventId String @id` on this
-- model (ADR pos-webhook-idempotency, 2026-07-23), but the live production
-- table only ever got a UNIQUE constraint + supporting index, never an actual
-- PRIMARY KEY constraint (pg_constraint contype='p' returns 0 rows for this
-- table). Confirmed via read-only inspection 2026-08-23:
--   - eventId: text, NOT NULL, 0 NULLs, 0 duplicate values (6 rows total)
--   - existing constraint: "ProcessedWebhookEvent_eventId_key" (UNIQUE)
--   - existing index:      "ProcessedWebhookEvent_eventId_key" (unique btree)
--
-- Fix: promote the existing unique index to the primary key via
-- `ADD CONSTRAINT ... PRIMARY KEY USING INDEX`, which reuses the index in
-- place (no table rewrite, no new index build) rather than creating a
-- redundant index. This is purely additive — nothing is dropped.

ALTER TABLE "ProcessedWebhookEvent"
  ADD CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY USING INDEX "ProcessedWebhookEvent_eventId_key";
