-- CreateTable
CREATE TABLE "EmailQuotaLog" (
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "alertSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailQuotaLog_pkey" PRIMARY KEY ("date")
);
