-- Feature #314 Part B: Create PriceOverrideLog table to track organizer price overrides

CREATE TABLE "PriceOverrideLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "aiSuggestedPrice" DOUBLE PRECISION,
    "organizerPrice" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceOverrideLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE,
    CONSTRAINT "PriceOverrideLog_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX "PriceOverrideLog_itemId_idx" ON "PriceOverrideLog"("itemId");
CREATE INDEX "PriceOverrideLog_organizerId_idx" ON "PriceOverrideLog"("organizerId");
CREATE INDEX "PriceOverrideLog_createdAt_idx" ON "PriceOverrideLog"("createdAt");
