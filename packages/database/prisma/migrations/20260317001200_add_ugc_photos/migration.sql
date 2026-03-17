-- Feature #47: UGC Photo Tags — user-generated content tables
DROP TABLE IF EXISTS "UGCPhotoLike";
DROP TABLE IF EXISTS "UGCPhoto";
CREATE TABLE "UGCPhoto" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "saleId" TEXT,
    "photoUrl" TEXT NOT NULL,
    "caption" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UGCPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "UGCPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL,
    CONSTRAINT "UGCPhoto_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL
);

CREATE INDEX "UGCPhoto_userId_idx" ON "UGCPhoto"("userId");
CREATE INDEX "UGCPhoto_itemId_idx" ON "UGCPhoto"("itemId");
CREATE INDEX "UGCPhoto_saleId_idx" ON "UGCPhoto"("saleId");

CREATE TABLE "UGCPhotoLike" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "photoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UGCPhotoLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "UGCPhotoLike_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "UGCPhoto" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "UGCPhotoLike_userId_photoId_key" ON "UGCPhotoLike"("userId", "photoId");
CREATE INDEX "UGCPhotoLike_userId_idx" ON "UGCPhotoLike"("userId");
CREATE INDEX "UGCPhotoLike_photoId_idx" ON "UGCPhotoLike"("photoId");
