-- CreateTable "BrandFollow"
CREATE TABLE "BrandFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandFollow_userId_brandName_key" ON "BrandFollow"("userId", "brandName");

-- CreateIndex
CREATE INDEX "BrandFollow_userId_idx" ON "BrandFollow"("userId");

-- AddForeignKey
ALTER TABLE "BrandFollow" ADD CONSTRAINT "BrandFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
