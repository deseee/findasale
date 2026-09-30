-- OPTIONAL ONE-TIME COPY: SmartFollow -> Follow (2026-09-29). NOT RUN. Patrick applies manually.
-- Idempotent: rows that already exist in "Follow" are skipped (ON CONFLICT DO NOTHING on the
-- ("userId","organizerId") unique index), so it is safe to run more than once.
-- Nothing is deleted from "SmartFollow". Self-follows are excluded to match the app rule.
-- Note: the app also copies a user's legacy rows lazily when they open GET /smart-follows/my,
-- so running this is optional; it just makes the notifier and the follower counts complete now.
-- Run smartfollow-vs-follow-check-2026-09-29.sql first to preview.

BEGIN;

INSERT INTO "Follow" ("id", "userId", "organizerId", "notifyEmail", "notifyPush", "createdAt")
SELECT
  'sf_' || sf."id",
  sf."userId",
  sf."organizerId",
  sf."notifyEmail",
  sf."notifyPush",
  sf."createdAt"
FROM "SmartFollow" sf
JOIN "Organizer" o ON o."id" = sf."organizerId"
WHERE o."userId" <> sf."userId"
ON CONFLICT ("userId", "organizerId") DO NOTHING;

-- Verify: this should return 0 rows (except self-follow rows, which are intentionally skipped)
SELECT COUNT(*) AS still_missing
FROM "SmartFollow" sf
JOIN "Organizer" o ON o."id" = sf."organizerId"
LEFT JOIN "Follow" f ON f."userId" = sf."userId" AND f."organizerId" = sf."organizerId"
WHERE f."id" IS NULL AND o."userId" <> sf."userId";

COMMIT;
