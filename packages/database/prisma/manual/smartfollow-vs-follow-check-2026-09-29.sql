-- READ-ONLY CHECK (2026-09-29). Safe to run any time; changes nothing.
-- Follow is the canonical shopper->organizer follow table. This reports how many legacy
-- "SmartFollow" rows still need to be copied into "Follow".

-- 1. Row counts in each table
SELECT 'Follow' AS table_name, COUNT(*) AS rows FROM "Follow"
UNION ALL
SELECT 'SmartFollow', COUNT(*) FROM "SmartFollow";

-- 2. SmartFollow rows that have NO matching Follow row (these are what the copy script would insert)
SELECT sf."id", sf."userId", sf."organizerId", sf."notifyEmail", sf."notifyPush", sf."createdAt"
FROM "SmartFollow" sf
LEFT JOIN "Follow" f
  ON f."userId" = sf."userId" AND f."organizerId" = sf."organizerId"
WHERE f."id" IS NULL
ORDER BY sf."createdAt";

-- 3. Users present in BOTH tables for the same organizer (would previously have received duplicate
--    new-sale notifications; the notifier now dedupes, so this is informational only)
SELECT sf."userId", sf."organizerId"
FROM "SmartFollow" sf
JOIN "Follow" f
  ON f."userId" = sf."userId" AND f."organizerId" = sf."organizerId";

-- 4. Sanity: SmartFollow rows pointing at a self-owned organizer (a user cannot follow themselves)
SELECT sf."id", sf."userId", sf."organizerId"
FROM "SmartFollow" sf
JOIN "Organizer" o ON o."id" = sf."organizerId"
WHERE o."userId" = sf."userId";
