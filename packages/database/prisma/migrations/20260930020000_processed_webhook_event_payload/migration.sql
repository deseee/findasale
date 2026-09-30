-- ProcessedWebhookEvent.payload (2026-09-30, payment review follow-up)
--
-- WHY: the stale-PENDING Square webhook sweep (posStrandedSaleReconcileCron.sweepStaleSquareWebhookEvents) could only
-- mark an abandoned event FAILED, because the row stored no payload. squareWebhookController now stores the
-- signature-verified event body on the row when it claims the event, and the sweep re-drives it through the same
-- (idempotent) handler. webhookEventPruneJob already deletes the row, and so the payload, after 30 days.
--
-- SAFETY: additive only. One nullable column, no default, no rewrite of existing rows (they keep payload NULL and the
-- sweep keeps marking those FAILED as before). Idempotent (IF NOT EXISTS). Apply manually. The app degrades safely if
-- this is not applied yet: with the column missing the claim insert fails its Prisma validation, so apply this BEFORE
-- deploying the matching backend build.
--
-- Down migration (safe at any time once the backend no longer writes the column):
--   ALTER TABLE "ProcessedWebhookEvent" DROP COLUMN IF EXISTS "payload";

ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN IF NOT EXISTS "payload" JSONB;
