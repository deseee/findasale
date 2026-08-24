-- Production drift fix: ProcessedWebhookEvent has no PRIMARY KEY constraint.
--
-- Root cause: `schema.prisma` declares `eventId String @id` on this model (ADR
-- pos-webhook-idempotency, 2026-07-23), but the ORIGINAL migration that created this table
-- (20260309200001_add_processed_webhook_event) used a different shape entirely:
--   "id" TEXT NOT NULL PRIMARY KEY,
--   "eventId" TEXT NOT NULL UNIQUE
-- -- i.e. a separate "id" primary key column plus a UNIQUE (not primary) "eventId" column.
-- Schema.prisma was updated at some point to make `eventId` the sole `@id` field, but no
-- migration was ever written to actually perform that change on the database -- so two
-- different real-world states now exist depending on how a given database's history played
-- out:
--   (a) PRODUCTION: at some point had its "id" column dropped via an undocumented `db push`
--       or manual operation (confirmed live 2026-08-23: production currently has only
--       eventId/processedAt/status/updatedAt, no "id" column at all), leaving "eventId" with
--       just a UNIQUE constraint and no primary key.
--   (b) Any database built from a CLEAN REPLAY of migration history -- CI's ephemeral
--       Postgres, or a fresh dev environment -- still has the ORIGINAL "id" column, since no
--       migration ever dropped it there.
--
-- FIRST VERSION OF THIS FILE (2026-08-23) only handled case (a) via
-- `ADD CONSTRAINT ... PRIMARY KEY USING INDEX`, which failed on PRODUCTION itself for a
-- different, narrower reason (that index was already the backing index for the named UNIQUE
-- constraint, and Postgres won't let a second constraint claim it) -- fixed same day via a
-- plain DROP CONSTRAINT + ADD CONSTRAINT, which succeeded on production. But that fix was
-- STILL only correct for case (a) -- it collides on case (b), because a fresh build already
-- has a PRIMARY KEY named "ProcessedWebhookEvent_pkey" on "id" (Postgres's default auto-name
-- for an inline PRIMARY KEY), so adding ANOTHER constraint with that same name on "eventId"
-- fails outright (one primary key per table, and the name collides too). Confirmed via a
-- real CI failure: GitHub Actions run #32679530014, "Apply migrations to CI Postgres" step,
-- 2026-08-24.
--
-- THIS VERSION handles both (a) and (b) with defensive, idempotent checks, so it produces
-- the same end state (schema.prisma's single-column `eventId String @id`, no separate "id")
-- regardless of which starting shape a given database has -- including production, where
-- this exact file content was already applied successfully; re-deriving the same end state
-- from an already-correct state is a genuine no-op (both conditions below are already false
-- there).

DO $$
BEGIN
  -- Case (b): the original "id" column still exists (fresh/CI builds). Drop whatever primary
  -- key constraint currently backs it, then drop the column itself.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProcessedWebhookEvent' AND column_name = 'id'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE "ProcessedWebhookEvent" DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = '"ProcessedWebhookEvent"'::regclass AND contype = 'p'
      LIMIT 1
    );
    ALTER TABLE "ProcessedWebhookEvent" DROP COLUMN "id";
  END IF;

  -- Promote "eventId" to the real primary key, unless it already is one (already true on
  -- production as of the 2026-08-23 same-day fix -- this whole block is then a no-op there).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ProcessedWebhookEvent"'::regclass AND contype = 'p'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = '"ProcessedWebhookEvent"'::regclass AND conname = 'ProcessedWebhookEvent_eventId_key'
    ) THEN
      ALTER TABLE "ProcessedWebhookEvent" DROP CONSTRAINT "ProcessedWebhookEvent_eventId_key";
    END IF;
    ALTER TABLE "ProcessedWebhookEvent" ADD CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("eventId");
  END IF;
END $$;
