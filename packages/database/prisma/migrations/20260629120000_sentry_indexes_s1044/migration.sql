-- Sentry slow query indexes (S1044, 2026-06-29)
-- See: packages/database/prisma/schema.prisma for matching @@index entries

-- NODEJS-49: leaderboard cron getShopperLeaderboard WHERE role='USER' — seq scan 1220ms on 83k rows
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User" ("role");

-- NODEJS-3F, 2T, 10: Sale RETAIL dedup findFirst WHERE saleType+city+state — 138-row bitmap scan → index seek
CREATE INDEX IF NOT EXISTS "Sale_saleType_city_state_idx" ON "Sale" ("saleType", "city", "state");

-- NODEJS-2N: outreachEmailsCron Organizer JOIN WHERE emailDiscoveryMethod IN ('website_scrape', 'whois_rdap', 'smtp_pattern', 'sale_description')
CREATE INDEX IF NOT EXISTS "Organizer_emailDiscoveryMethod_idx" ON "Organizer" ("emailDiscoveryMethod");

-- NODEJS-2N: outreachEmailsCron Organizer JOIN WHERE emailDiscoveryConfidence >= 0.5
CREATE INDEX IF NOT EXISTS "Organizer_emailDiscoveryConfidence_idx" ON "Organizer" ("emailDiscoveryConfidence");

-- NODEJS-32, 3M: Autoclose planner ignores Sale_status_endDate_autoclose_idx partial index due to
-- column correlation blindness (estimates 11,571 rows, actual 1). Extended statistics teach the
-- planner that status=PUBLISHED + endDate < NOW() nearly always matches 0 rows.
CREATE STATISTICS IF NOT EXISTS "Sale_status_endDate_stats" (dependencies) ON status, "endDate" FROM "Sale";
ANALYZE "Sale";
