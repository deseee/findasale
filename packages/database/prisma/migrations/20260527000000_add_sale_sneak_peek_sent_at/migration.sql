-- Feature #409: Pre-Sale Sneak Peek Email
-- Adds sneakPeekSentAt timestamp to Sale for idempotent cron guard
-- (prevents duplicate emails across server restarts)

ALTER TABLE "Sale" ADD COLUMN "sneakPeekSentAt" TIMESTAMP(3);
