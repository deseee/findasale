-- Feature #51: Sale Ripples — social proof via activity tracking
CREATE TABLE "SaleRipple" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VIEW',
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleRipple_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE,
    CONSTRAINT "SaleRipple_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX "SaleRipple_saleId_idx" ON "SaleRipple"("saleId");
CREATE INDEX "SaleRipple_userId_idx" ON "SaleRipple"("userId");
CREATE INDEX "SaleRipple_type_idx" ON "SaleRipple"("type");
CREATE INDEX "SaleRipple_createdAt_idx" ON "SaleRipple"("createdAt");

-- Add relations to Sale and User models
ALTER TABLE "Sale" ADD COLUMN "ripples" JSONB[] DEFAULT ARRAY[]::JSONB[];
