-- ST4: Stripe webhook event deduplication table
CREATE TABLE "StripeEvent" (
  "id" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- Index for cleanup queries (deleting events older than 24 hours)
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");
