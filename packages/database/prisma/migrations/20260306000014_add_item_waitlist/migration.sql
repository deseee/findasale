-- Add ItemWaitlist table for "Notify Me" / waitlist feature
CREATE TABLE "ItemWaitlist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "notified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemWaitlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemWaitlist_userId_itemId_key" ON "ItemWaitlist"("userId", "itemId");

ALTER TABLE "ItemWaitlist" ADD CONSTRAINT "ItemWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemWaitlist" ADD CONSTRAINT "ItemWaitlist_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
