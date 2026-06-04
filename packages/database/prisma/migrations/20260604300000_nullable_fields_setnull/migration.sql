-- Migration: 20260604300000_nullable_fields_setnull
-- Purpose: Make Review.userId, Message.senderId, EncyclopediaEntry.authorId,
--          EncyclopediaRevision.authorId nullable so deleted users don't cascade-delete
--          reviews, messages, or encyclopedia content.
-- Depends on: 20260604200000_schema_fk_cascade_restrict (must run first)

-- Review.userId → nullable (reviews survive user account deletion)
ALTER TABLE "Review" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_userId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Message.senderId → nullable (conversation history survives sender account deletion)
ALTER TABLE "Message" ALTER COLUMN "senderId" DROP NOT NULL;
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_senderId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EncyclopediaEntry.authorId → nullable (articles survive author account deletion)
ALTER TABLE "EncyclopediaEntry" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "EncyclopediaEntry" DROP CONSTRAINT IF EXISTS "EncyclopediaEntry_authorId_fkey";
ALTER TABLE "EncyclopediaEntry" ADD CONSTRAINT "EncyclopediaEntry_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EncyclopediaRevision.authorId → nullable (revision history survives author deletion)
ALTER TABLE "EncyclopediaRevision" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "EncyclopediaRevision" DROP CONSTRAINT IF EXISTS "EncyclopediaRevision_authorId_fkey";
ALTER TABLE "EncyclopediaRevision" ADD CONSTRAINT "EncyclopediaRevision_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
