-- CreateTable BuyingPool
CREATE TABLE "BuyingPool" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "targetAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyingPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable PoolParticipant
CREATE TABLE "PoolParticipant" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pledgeAmount" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyingPool_itemId_idx" ON "BuyingPool"("itemId");

-- CreateIndex
CREATE INDEX "BuyingPool_creatorId_idx" ON "BuyingPool"("creatorId");

-- CreateIndex
CREATE INDEX "BuyingPool_status_idx" ON "BuyingPool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PoolParticipant_poolId_userId_key" ON "PoolParticipant"("poolId", "userId");

-- CreateIndex
CREATE INDEX "PoolParticipant_userId_idx" ON "PoolParticipant"("userId");

-- AddForeignKey
ALTER TABLE "BuyingPool" ADD CONSTRAINT "BuyingPool_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyingPool" ADD CONSTRAINT "BuyingPool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolParticipant" ADD CONSTRAINT "PoolParticipant_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "BuyingPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolParticipant" ADD CONSTRAINT "PoolParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
