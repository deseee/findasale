-- CreateTable
CREATE TABLE "CrawlerVisit" (
    "id" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "crawlerName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "saleId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlerVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlerVisit_crawlerName_idx" ON "CrawlerVisit"("crawlerName");

-- CreateIndex
CREATE INDEX "CrawlerVisit_saleId_idx" ON "CrawlerVisit"("saleId");

-- CreateIndex
CREATE INDEX "CrawlerVisit_createdAt_idx" ON "CrawlerVisit"("createdAt");
