-- CreateTable "SaleShareLink"
CREATE TABLE "SaleShareLink" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "totalXpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable "SaleShareLinkClick"
CREATE TABLE "SaleShareLinkClick" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "clickerId" TEXT,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleShareLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleShareLink_code_key" ON "SaleShareLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SaleShareLink_saleId_userId_key" ON "SaleShareLink"("saleId", "userId");

-- CreateIndex
CREATE INDEX "SaleShareLink_code_idx" ON "SaleShareLink"("code");

-- CreateIndex
CREATE INDEX "SaleShareLink_userId_idx" ON "SaleShareLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleShareLinkClick_shareLinkId_clickerId_key" ON "SaleShareLinkClick"("shareLinkId", "clickerId");

-- CreateIndex
CREATE INDEX "SaleShareLinkClick_shareLinkId_idx" ON "SaleShareLinkClick"("shareLinkId");

-- AddForeignKey
ALTER TABLE "SaleShareLink" ADD CONSTRAINT "SaleShareLink_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleShareLink" ADD CONSTRAINT "SaleShareLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleShareLinkClick" ADD CONSTRAINT "SaleShareLinkClick_shareLinkId_fkey"
    FOREIGN KEY ("shareLinkId") REFERENCES "SaleShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleShareLinkClick" ADD CONSTRAINT "SaleShareLinkClick_clickerId_fkey"
    FOREIGN KEY ("clickerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
