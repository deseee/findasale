-- Drop redundant 2-column index subsumed by the 3-column covering index
-- Fixes Sentry FINDASALE-NODEJS-2J: planner was choosing 2-col index
-- and applying startDate as a post-filter against 15k+ PUBLISHED rows
DROP INDEX IF EXISTS "Sale_status_markdownEnabled_idx";
