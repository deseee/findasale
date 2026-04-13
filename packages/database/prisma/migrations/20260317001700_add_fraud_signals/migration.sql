-- CreateTable "FraudSignal"
DROP TABLE IF EXISTS "FraudSignal";
CREATE TABLE "FraudSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "saleId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ,
    "reviewedByAdminId" TEXT,
    "reviewOutcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id"),
    CONSTRAINT "FraudSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id"),
    CONSTRAINT "FraudSignal_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id"),
    CONSTRAINT "FraudSignal_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User" ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FraudSignal_userId_itemId_signalType_key" ON "FraudSignal"("userId", "itemId", "signalType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FraudSignal_saleId_idx" ON "FraudSignal"("saleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FraudSignal_userId_idx" ON "FraudSignal"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FraudSignal_confidenceScore_idx" ON "FraudSignal"("confidenceScore");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FraudSignal_reviewOutcome_idx" ON "FraudSignal"("reviewOutcome");
