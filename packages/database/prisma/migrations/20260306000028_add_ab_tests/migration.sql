-- CreateTable ABTestAssignment
CREATE TABLE "ABTestAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTestAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ABTestAssignment_sessionId_testName_key" ON "ABTestAssignment"("sessionId", "testName");

-- CreateTable ABTestEvent
CREATE TABLE "ABTestEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ABTestEvent_testName_variant_event_idx" ON "ABTestEvent"("testName", "variant", "event");
