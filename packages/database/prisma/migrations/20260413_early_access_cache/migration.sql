-- Early Access Cache: replaces Lucky Roll
-- Shoppers spend 100 XP to unlock 48-hour early access to new items in a category
-- No randomness, guaranteed access to items published during the window

CREATE TABLE "EarlyAccessCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "itemsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EarlyAccessCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX "EarlyAccessCache_userId_expiresAt_idx" ON "EarlyAccessCache"("userId", "expiresAt");
CREATE INDEX "EarlyAccessCache_category_expiresAt_idx" ON "EarlyAccessCache"("category", "expiresAt");
