-- Add haul post fields to UGCPhoto
ALTER TABLE "UGCPhoto" ADD COLUMN IF NOT EXISTS "isHaulPost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UGCPhoto" ADD COLUMN IF NOT EXISTS "linkedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create UGCPhotoReaction table
CREATE TABLE IF NOT EXISTS "UGCPhotoReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UGCPhotoReaction_pkey" PRIMARY KEY ("id")
);

-- Create indexes for UGCPhotoReaction
CREATE UNIQUE INDEX IF NOT EXISTS "UGCPhotoReaction_userId_photoId_type_key" ON "UGCPhotoReaction"("userId", "photoId", "type");
CREATE INDEX IF NOT EXISTS "UGCPhotoReaction_photoId_idx" ON "UGCPhotoReaction"("photoId");
CREATE INDEX IF NOT EXISTS "UGCPhotoReaction_userId_idx" ON "UGCPhotoReaction"("userId");

-- Add foreign key constraints for UGCPhotoReaction
ALTER TABLE "UGCPhotoReaction" ADD CONSTRAINT "UGCPhotoReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UGCPhotoReaction" ADD CONSTRAINT "UGCPhotoReaction_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "UGCPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
