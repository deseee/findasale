-- Feature #455: SearchNotification — anonymous search-query email alerts
CREATE TABLE "SearchNotification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchNotification_email_searchQuery_key" ON "SearchNotification"("email", "searchQuery");
CREATE INDEX "SearchNotification_searchQuery_isActive_idx" ON "SearchNotification"("searchQuery", "isActive");
CREATE INDEX "SearchNotification_email_idx" ON "SearchNotification"("email");
