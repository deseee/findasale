-- SUPERSEDED, intentionally left as a no-op -- do not remove content from here without
-- understanding why first.
--
-- This migration was drafted, then abandoned in the same session before ever being applied
-- anywhere (never committed/pushed), because inserting a fix AFTER
-- 20260823180000_add_processed_webhook_event_primary_key doesn't work: Prisma's
-- `migrate deploy` applies migrations strictly in sorted order and halts on the first
-- failure, and 20260823180000 itself fails on a freshly-built database (CI, or any new dev
-- environment) before this migration would ever be reached. The real fix was made directly
-- inside 20260823180000's own migration.sql instead (made idempotent/defensive so it works
-- correctly whether the database was built by full migration replay or already carries
-- production's drifted history) -- see that file's comments for the full story.
--
-- This file is a genuine no-op by construction: by the time it would run, the fixed
-- 20260823180000 has already dropped the legacy "id" column and added the real primary key
-- on "eventId" everywhere, so both of this file's own conditional checks are already false.
-- Left in place rather than deleted (the mounted-repo delete-protection would require an
-- extra approval round-trip for something with zero functional effect either way).

SELECT 1; -- intentionally inert
