-- Reconcile remaining production db-push drift (2026-08-09 DB space pass + earlier ad-hoc
-- additions) that has no migration file. All six columns below already exist in production;
-- this migration is a no-op there. On a fresh database (CI, disaster recovery) it creates them
-- for the first time, matching schema.prisma's declared types/defaults, verified against the
-- live production column definitions.

-- User.roles (schema.prisma:18)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roles" TEXT[] NOT NULL DEFAULT ARRAY['USER']::TEXT[];

-- Sale.scrapedMetadataR2Key (schema.prisma:999 -- same 2026-08-09 R2-offload pass as the two
-- Organizer columns fixed in the prior migration)
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "scrapedMetadataR2Key" TEXT;

-- Item.catalogSuggestions (schema.prisma:1312)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "catalogSuggestions" JSONB;

-- Item.isPrivate (schema.prisma)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Message.itemId + FK + index (schema.prisma -- ADR-097)
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "itemId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Message_itemId_fkey'
  ) THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Message_itemId_idx" ON "Message"("itemId");

-- ReferralReward.createdAt (schema.prisma)
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
