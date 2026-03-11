-- P0 Fix: Add ProcessedWebhookEvent model for Stripe webhook idempotency
-- Prevents double-processing when Stripe retries webhook delivery

CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL UNIQUE,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProcessedWebhookEvent_eventId_idx" ON "ProcessedWebhookEvent"("eventId");
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "ProcessedWebhookEvent"("processedAt");
