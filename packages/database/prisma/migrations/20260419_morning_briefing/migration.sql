-- Morning Briefing: Add cashFloat to Sale, create SaleAssignment and PrepTask models

-- Add cashFloat to Sale (cents, nullable with default 0)
ALTER TABLE "Sale" ADD COLUMN "cashFloat" INTEGER DEFAULT 0;

-- SaleAssignment: per-sale team member day-of context
CREATE TABLE "SaleAssignment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CREW',
    "ownsArea" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "eta" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleAssignment_saleId_teamMemberId_key" ON "SaleAssignment"("saleId", "teamMemberId");
CREATE INDEX "SaleAssignment_saleId_idx" ON "SaleAssignment"("saleId");
CREATE INDEX "SaleAssignment_teamMemberId_idx" ON "SaleAssignment"("teamMemberId");

ALTER TABLE "SaleAssignment" ADD CONSTRAINT "SaleAssignment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleAssignment" ADD CONSTRAINT "SaleAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PrepTask: day-of operational checklist with urgency, assignment, and SaleChecklist sync
CREATE TABLE "PrepTask" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT NOT NULL DEFAULT 'pre',
    "checklistItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrepTask_saleId_idx" ON "PrepTask"("saleId");
CREATE INDEX "PrepTask_saleId_done_idx" ON "PrepTask"("saleId", "done");
CREATE INDEX "PrepTask_assigneeId_idx" ON "PrepTask"("assigneeId");

ALTER TABLE "PrepTask" ADD CONSTRAINT "PrepTask_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
