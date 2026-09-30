-- Sale Passport BACKFILL (2026-09-29). NOT RUN. For Patrick to review, then run manually.
--
-- PREREQUISITE: migration 20260929120000_sale_passport_stamps must already be applied
-- ("ShopperPassportStamp" table + "StampMilestone"."seenAt").
--
-- WHAT IT DOES: derives past Sale Passport stamps from existing rows (SaleCheckin, Purchase,
-- Review, Favorite, UGCPhoto, BoostPurchase, ReferralReward) using the SAME rules as
-- packages/backend/src/services/loyaltyService.ts, then creates the Bronze/Silver/Gold/Platinum
-- milestone rows those stamps add up to. Every row is inserted with seenAt = now(), so no one
-- gets a flood of unlock toasts for old activity; the stamps simply appear, dated, in their
-- Passport. earnedAt is the real date the action happened.
--
-- SAFETY: additive and idempotent. Only INSERTs into "ShopperPassportStamp" / "StampMilestone"
-- with ON CONFLICT DO NOTHING on the unique keys. Never updates or deletes an existing row,
-- so it is safe to run twice, and safe to run even after the app has already derived some
-- stamps on its own (the app derives the same rows lazily on each shopper's first passport
-- read, so this script is an optimization and a way to see the numbers up front, not a
-- requirement).
--
-- RUNS INSIDE A TRANSACTION and ends with COMMIT. To preview, change the final COMMIT to
-- ROLLBACK and read the summary result. The summary query is the last statement before it.
--
-- Rules mirrored from the app (UTC everywhere):
--   FIRST_STEPS      first SaleCheckin
--   WEEKEND_WARRIOR  5th distinct sale checked into within one UTC calendar month (one row per month)
--   ROAD_TRIPPER     3rd distinct area (state + 3-digit ZIP prefix) within one season (one row per season;
--                    winter = Dec-Feb keyed by the December year)
--   FIRST_FIND       first qualifying purchase (PAID/COMPLETED, not test, not POS, not the organizer's own sale)
--   TREASURE_HUNTER  5th distinct order (order = payment intent / Square payment id, else purchase id)
--   LAKEFRONT_HAUL   cumulative spend at one sale reaches $50 (one row per sale)
--   STORYTELLER      first APPROVED review
--   ITEM_KEEPER      10th favorited item
--   HAUL_CURATOR     first APPROVED haul post
--   CROWD_FAVORITE   first APPROVED haul post with 10+ likes
--   COMMUNITY_GUIDE  first non-refunded GUIDE_PUBLICATION purchase
--   FRIEND_FINDER    referred friend (fraud status CLEAR/APPROVED) with a qualifying purchase (one row per friend)

BEGIN;

-- Helper: a unique text id for inserted rows (the app uses cuids; any unique text id is valid).
-- 'bf' prefix marks these rows as backfilled.

-- 1. FIRST_STEPS
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT DISTINCT ON (c."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || c."id"), 1, 22),
  c."userId", 'FIRST_STEPS', 'FIRST_STEPS', c."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  c."checkinAt", now()
FROM "SaleCheckin" c
JOIN "Sale" s ON s."id" = c."saleId"
ORDER BY c."userId", c."checkinAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 2. WEEKEND_WARRIOR
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || r."userId" || r.mk), 1, 22),
  r."userId", 'WEEKEND_WARRIOR', 'WEEKEND_WARRIOR:' || r.mk, r."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  r.first_at, now()
FROM (
  SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x."userId", x.mk ORDER BY x.first_at, x."saleId") AS rn
  FROM (
    SELECT c."userId", c."saleId",
           to_char(c."checkinAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS mk,
           MIN(c."checkinAt") AS first_at
    FROM "SaleCheckin" c
    GROUP BY c."userId", c."saleId", to_char(c."checkinAt" AT TIME ZONE 'UTC', 'YYYY-MM')
  ) x
) r
JOIN "Sale" s ON s."id" = r."saleId"
WHERE r.rn = 5
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 3. ROAD_TRIPPER
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || r."userId" || r.sk), 1, 22),
  r."userId", 'ROAD_TRIPPER', 'ROAD_TRIPPER:' || r.sk, r."saleId",
  lower(trim(r.city)) || '|' || upper(trim(r.state)),
  r.region,
  trim(r.city) || ', ' || upper(trim(r.state)),
  r.first_at, now()
FROM (
  SELECT y.*, ROW_NUMBER() OVER (PARTITION BY y."userId", y.sk ORDER BY y.first_at, y."saleId") AS rn
  FROM (
    SELECT DISTINCT ON (z."userId", z.sk, z.region) z.*
    FROM (
      SELECT c."userId", c."saleId", c."checkinAt" AS first_at, s."city", s."state",
        CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
             THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
             ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END AS region,
        CASE
          WHEN extract(month FROM c."checkinAt" AT TIME ZONE 'UTC') BETWEEN 3 AND 5
            THEN extract(year FROM c."checkinAt" AT TIME ZONE 'UTC')::int || '-SPRING'
          WHEN extract(month FROM c."checkinAt" AT TIME ZONE 'UTC') BETWEEN 6 AND 8
            THEN extract(year FROM c."checkinAt" AT TIME ZONE 'UTC')::int || '-SUMMER'
          WHEN extract(month FROM c."checkinAt" AT TIME ZONE 'UTC') BETWEEN 9 AND 11
            THEN extract(year FROM c."checkinAt" AT TIME ZONE 'UTC')::int || '-FALL'
          WHEN extract(month FROM c."checkinAt" AT TIME ZONE 'UTC') = 12
            THEN extract(year FROM c."checkinAt" AT TIME ZONE 'UTC')::int || '-WINTER'
          ELSE (extract(year FROM c."checkinAt" AT TIME ZONE 'UTC')::int - 1) || '-WINTER'
        END AS sk
      FROM "SaleCheckin" c
      JOIN "Sale" s ON s."id" = c."saleId"
    ) z
    ORDER BY z."userId", z.sk, z.region, z.first_at
  ) y
) r
WHERE r.rn = 3
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- Qualifying purchases (shared by stamps 4-6 and FRIEND_FINDER): a temp view-like CTE is repeated
-- inline below because CREATE TEMP TABLE would need scratch space; each statement stays standalone.

-- 4. FIRST_FIND
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT DISTINCT ON (p."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 22),
  p."userId", 'FIRST_FIND', 'FIRST_FIND', p."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  p."createdAt", now()
FROM "Purchase" p
LEFT JOIN "Sale" s ON s."id" = p."saleId"
LEFT JOIN "Organizer" o ON o."id" = s."organizerId"
WHERE p."userId" IS NOT NULL
  AND p."status" IN ('PAID','COMPLETED')
  AND p."isTestTransaction" = false
  AND p."source" <> 'POS'
  AND (o."userId" IS NULL OR o."userId" <> p."userId")
ORDER BY p."userId", p."createdAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 5. TREASURE_HUNTER (5th distinct order)
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || r."userId"), 1, 22),
  r."userId", 'TREASURE_HUNTER', 'TREASURE_HUNTER', r."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  r.first_at, now()
FROM (
  SELECT o2.*, ROW_NUMBER() OVER (PARTITION BY o2."userId" ORDER BY o2.first_at, o2.order_key) AS rn
  FROM (
    SELECT p."userId",
           COALESCE(p."stripePaymentIntentId", p."squarePaymentId", p."id") AS order_key,
           MIN(p."createdAt") AS first_at,
           (array_agg(p."saleId" ORDER BY p."createdAt"))[1] AS "saleId"
    FROM "Purchase" p
    LEFT JOIN "Sale" s0 ON s0."id" = p."saleId"
    LEFT JOIN "Organizer" og ON og."id" = s0."organizerId"
    WHERE p."userId" IS NOT NULL
      AND p."status" IN ('PAID','COMPLETED')
      AND p."isTestTransaction" = false
      AND p."source" <> 'POS'
      AND (og."userId" IS NULL OR og."userId" <> p."userId")
    GROUP BY p."userId", COALESCE(p."stripePaymentIntentId", p."squarePaymentId", p."id")
  ) o2
) r
LEFT JOIN "Sale" s ON s."id" = r."saleId"
WHERE r.rn = 5
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 6. LAKEFRONT_HAUL (cumulative spend at one sale reaches $50)
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT DISTINCT ON (r."userId", r."saleId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || r."id"), 1, 22),
  r."userId", 'LAKEFRONT_HAUL', 'LAKEFRONT_HAUL:' || r."saleId", r."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  r."createdAt", now()
FROM (
  SELECT p."id", p."userId", p."saleId", p."createdAt",
         SUM(p."amount") OVER (PARTITION BY p."userId", p."saleId" ORDER BY p."createdAt", p."id") AS running
  FROM "Purchase" p
  LEFT JOIN "Sale" s0 ON s0."id" = p."saleId"
  LEFT JOIN "Organizer" og ON og."id" = s0."organizerId"
  WHERE p."userId" IS NOT NULL
    AND p."saleId" IS NOT NULL
    AND p."status" IN ('PAID','COMPLETED')
    AND p."isTestTransaction" = false
    AND p."source" <> 'POS'
    AND (og."userId" IS NULL OR og."userId" <> p."userId")
) r
JOIN "Sale" s ON s."id" = r."saleId"
WHERE r.running >= 50
ORDER BY r."userId", r."saleId", r."createdAt", r."id"
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 7. STORYTELLER
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","cityKey","regionKey","placeLabel","earnedAt","seenAt")
SELECT DISTINCT ON (rv."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || rv."id"), 1, 22),
  rv."userId", 'STORYTELLER', 'STORYTELLER', rv."saleId",
  lower(trim(s."city")) || '|' || upper(trim(s."state")),
  CASE WHEN length(regexp_replace(coalesce(s."zip",''), '\D', '', 'g')) >= 3
       THEN upper(trim(s."state")) || '-' || substr(regexp_replace(s."zip", '\D', '', 'g'), 1, 3)
       ELSE upper(trim(s."state")) || '-' || lower(trim(s."city")) END,
  trim(s."city") || ', ' || upper(trim(s."state")),
  rv."createdAt", now()
FROM "Review" rv
LEFT JOIN "Sale" s ON s."id" = rv."saleId"
WHERE rv."userId" IS NOT NULL AND rv."moderationStatus" = 'APPROVED'
ORDER BY rv."userId", rv."createdAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 8. ITEM_KEEPER (10th favorited item)
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || f."id"), 1, 22),
  f."userId", 'ITEM_KEEPER', 'ITEM_KEEPER', f."createdAt", now()
FROM (
  SELECT fv."id", fv."userId", fv."createdAt",
         ROW_NUMBER() OVER (PARTITION BY fv."userId" ORDER BY fv."createdAt", fv."id") AS rn
  FROM "Favorite" fv
  WHERE fv."itemId" IS NOT NULL
) f
WHERE f.rn = 10
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 9. HAUL_CURATOR
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","earnedAt","seenAt")
SELECT DISTINCT ON (u."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || u."id"::text), 1, 22),
  u."userId", 'HAUL_CURATOR', 'HAUL_CURATOR', u."saleId", u."createdAt", now()
FROM "UGCPhoto" u
WHERE u."isHaulPost" = true AND u."status" = 'APPROVED'
ORDER BY u."userId", u."createdAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 10. CROWD_FAVORITE
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","earnedAt","seenAt")
SELECT DISTINCT ON (u."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || u."id"::text), 1, 22),
  u."userId", 'CROWD_FAVORITE', 'CROWD_FAVORITE', u."saleId", u."updatedAt", now()
FROM "UGCPhoto" u
WHERE u."isHaulPost" = true AND u."status" = 'APPROVED' AND u."likesCount" >= 10
ORDER BY u."userId", u."createdAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 11. COMMUNITY_GUIDE
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","earnedAt","seenAt")
SELECT DISTINCT ON (b."userId")
  'bf' || substr(md5(random()::text || clock_timestamp()::text || b."id"), 1, 22),
  b."userId", 'COMMUNITY_GUIDE', 'COMMUNITY_GUIDE', b."createdAt", now()
FROM "BoostPurchase" b
WHERE b."boostType" = 'GUIDE_PUBLICATION'
  AND b."refundedAt" IS NULL
  AND b."status" NOT IN ('REFUNDED','FAILED','PENDING')
ORDER BY b."userId", b."createdAt" ASC
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 12. FRIEND_FINDER (one row per referred friend with a qualifying purchase)
INSERT INTO "ShopperPassportStamp" ("id","userId","stampKey","dedupeKey","saleId","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || rr."id"), 1, 22),
  rr."referrerId", 'FRIEND_FINDER', 'FRIEND_FINDER:' || rr."referredUserId", fp."saleId", fp."createdAt", now()
FROM "ReferralReward" rr
JOIN LATERAL (
  SELECT p."saleId", p."createdAt"
  FROM "Purchase" p
  WHERE p."userId" = rr."referredUserId"
    AND p."status" IN ('PAID','COMPLETED')
    AND p."isTestTransaction" = false
    AND p."source" <> 'POS'
  ORDER BY p."createdAt" ASC
  LIMIT 1
) fp ON true
WHERE rr."fraudReviewStatus" IN ('CLEAR','APPROVED')
  AND rr."referrerId" <> rr."referredUserId"
ON CONFLICT ("userId","dedupeKey") DO NOTHING;

-- 13. Milestones: Bronze 3 / Silver 6 / Gold 9 / Platinum 12 distinct stamps.
-- earnedAt = the date the shopper's Nth distinct stamp was earned.
INSERT INTO "StampMilestone" ("id","userId","milestone","badgeType","earnedAt","seenAt")
SELECT
  'bf' || substr(md5(random()::text || clock_timestamp()::text || r."userId" || m.milestone::text), 1, 22),
  r."userId", m.milestone, m.badge, r.first_at, now()
FROM (
  SELECT f."userId", f.first_at,
         ROW_NUMBER() OVER (PARTITION BY f."userId" ORDER BY f.first_at, f."stampKey") AS rn
  FROM (
    SELECT "userId", "stampKey", MIN("earnedAt") AS first_at
    FROM "ShopperPassportStamp"
    WHERE "stampKey" IN ('FIRST_STEPS','WEEKEND_WARRIOR','ROAD_TRIPPER','FIRST_FIND','TREASURE_HUNTER','LAKEFRONT_HAUL',
                         'STORYTELLER','ITEM_KEEPER','HAUL_CURATOR','FRIEND_FINDER','COMMUNITY_GUIDE','CROWD_FAVORITE')
    GROUP BY "userId", "stampKey"
  ) f
) r
JOIN (VALUES (3,'BRONZE'),(6,'SILVER'),(9,'GOLD'),(12,'PLATINUM')) AS m(milestone, badge) ON r.rn = m.milestone
ON CONFLICT ("userId","milestone") DO NOTHING;

-- OPTIONAL, COMMENTED OUT: align the legacy MAKE_PURCHASE counter with the spec (2 stamps per
-- purchase; production rows were written at 1 per purchase). This UPDATES existing rows, so it is
-- deliberately not part of the default run. Uncomment only if you want the legacy tally corrected.
-- UPDATE "ShopperStamp" ss
--    SET "count" = 2 * sub.n
--   FROM (SELECT p."userId", count(*) AS n FROM "Purchase" p
--          WHERE p."userId" IS NOT NULL AND p."status" IN ('PAID','COMPLETED')
--            AND p."isTestTransaction" = false AND p."source" <> 'POS'
--          GROUP BY p."userId") sub
--  WHERE ss."userId" = sub."userId" AND ss."type" = 'MAKE_PURCHASE';

-- Summary: stamps and milestones now on file, by type.
SELECT "stampKey", count(*) AS rows, count(DISTINCT "userId") AS shoppers
FROM "ShopperPassportStamp"
WHERE "stampKey" <> 'ACTIVITY'
GROUP BY "stampKey"
ORDER BY "stampKey";

SELECT "badgeType", count(*) AS shoppers
FROM "StampMilestone"
WHERE "milestone" IN (3,6,9,12)
GROUP BY "badgeType"
ORDER BY min("milestone");

COMMIT; -- change to ROLLBACK to preview only
