-- CreateTable "TreasureHunt"
CREATE TABLE "TreasureHunt" (
  "id" SERIAL NOT NULL,
  "date" TEXT NOT NULL,
  "clue" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "keywords" TEXT[],
  "pointReward" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasureHunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable "TreasureHuntFind"
CREATE TABLE "TreasureHuntFind" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "huntId" INTEGER NOT NULL,
  "itemId" TEXT NOT NULL,
  "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasureHuntFind_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreasureHunt_date_key" ON "TreasureHunt"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TreasureHuntFind_userId_huntId_key" ON "TreasureHuntFind"("userId", "huntId");

-- AddForeignKey
ALTER TABLE "TreasureHuntFind" ADD CONSTRAINT "TreasureHuntFind_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasureHuntFind" ADD CONSTRAINT "TreasureHuntFind_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "TreasureHunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasureHuntFind" ADD CONSTRAINT "TreasureHuntFind_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
