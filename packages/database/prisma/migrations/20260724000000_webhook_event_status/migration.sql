-- ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151)
-- Add two-phase status + updatedAt to ProcessedWebhookEvent so a FAILED webhook
-- attempt no longer permanently strands a POS/QR sale, and so the two Stripe
-- endpoints (/api/stripe/webhook, /api/billing/webhook) can be namespaced apart
-- on the shared idempotency table.

ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: every historical row was only ever written AFTER successful processing
-- under the old model, so mark them COMPLETED to guarantee they are never reprocessed.
UPDATE "ProcessedWebhookEvent" SET "status" = 'COMPLETED';

-- Index for status lookups (reconciliation / duplicate checks).
CREATE INDEX "ProcessedWebhookEvent_status_idx" ON "ProcessedWebhookEvent"("status");
