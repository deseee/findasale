-- Gamification Legacy Cleanup — S268: Remove legacy points system
-- Replaces purchase-count-based points with Explorer Rank (guildXp-based)
-- PointsTransaction table remains for audit/history

-- Remove User.points column (legacy purchase points tally)
-- New system uses User.guildXp (never resets, used for rank calculation)
-- and User.explorerRank (derived from guildXp: INITIATE→SCOUT→RANGER→SAGE→GRANDMASTER)
ALTER TABLE "User" DROP COLUMN IF EXISTS "points";
