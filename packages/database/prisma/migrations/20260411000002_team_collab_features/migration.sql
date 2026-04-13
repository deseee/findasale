-- Create WorkspaceSettings table
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL UNIQUE,
    "enableAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "enableLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "enableTeamChat" BOOLEAN NOT NULL DEFAULT true,
    "commissionOverride" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE
);

-- Create index on WorkspaceSettings
CREATE INDEX "WorkspaceSettings_workspaceId_idx" ON "WorkspaceSettings"("workspaceId");

-- Create WorkspaceSalesActivity table
CREATE TABLE "WorkspaceSalesActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceSalesActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceSalesActivity_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE
);

-- Create indexes on WorkspaceSalesActivity
CREATE INDEX "WorkspaceSalesActivity_workspaceId_saleId_idx" ON "WorkspaceSalesActivity"("workspaceId", "saleId");
CREATE INDEX "WorkspaceSalesActivity_workspaceId_createdAt_idx" ON "WorkspaceSalesActivity"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceSalesActivity_saleId_idx" ON "WorkspaceSalesActivity"("saleId");

-- Create WorkspaceSaleChat table
CREATE TABLE "WorkspaceSaleChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceSaleChat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceSaleChat_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE
);

-- Create unique constraint on WorkspaceSaleChat
CREATE UNIQUE INDEX "WorkspaceSaleChat_workspaceId_saleId_key" ON "WorkspaceSaleChat"("workspaceId", "saleId");

-- Create index on WorkspaceSaleChat
CREATE INDEX "WorkspaceSaleChat_workspaceId_saleId_idx" ON "WorkspaceSaleChat"("workspaceId", "saleId");

-- Create WorkspaceChatMessage table
CREATE TABLE "WorkspaceChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WorkspaceSaleChat" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceChatMessage_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE CASCADE
);

-- Create indexes on WorkspaceChatMessage
CREATE INDEX "WorkspaceChatMessage_chatId_idx" ON "WorkspaceChatMessage"("chatId");
CREATE INDEX "WorkspaceChatMessage_organizerId_idx" ON "WorkspaceChatMessage"("organizerId");
CREATE INDEX "WorkspaceChatMessage_chatId_createdAt_idx" ON "WorkspaceChatMessage"("chatId", "createdAt");

-- Create WorkspaceTask table
CREATE TABLE "WorkspaceTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceTask_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE
);

-- Create indexes on WorkspaceTask
CREATE INDEX "WorkspaceTask_workspaceId_saleId_idx" ON "WorkspaceTask"("workspaceId", "saleId");
CREATE INDEX "WorkspaceTask_workspaceId_status_idx" ON "WorkspaceTask"("workspaceId", "status");
CREATE INDEX "WorkspaceTask_assignedTo_idx" ON "WorkspaceTask"("assignedTo");

-- Create WorkspaceLeaderboardEntry table
CREATE TABLE "WorkspaceLeaderboardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceLeaderboardEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceLeaderboardEntry_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE
);

-- Create unique constraint on WorkspaceLeaderboardEntry
CREATE UNIQUE INDEX "WorkspaceLeaderboardEntry_workspaceId_staffMemberId_week_key" ON "WorkspaceLeaderboardEntry"("workspaceId", "staffMemberId", "week");

-- Create indexes on WorkspaceLeaderboardEntry
CREATE INDEX "WorkspaceLeaderboardEntry_workspaceId_week_idx" ON "WorkspaceLeaderboardEntry"("workspaceId", "week");
CREATE INDEX "WorkspaceLeaderboardEntry_staffMemberId_week_idx" ON "WorkspaceLeaderboardEntry"("staffMemberId", "week");

-- Create WorkspaceRevenueSnapshot table
CREATE TABLE "WorkspaceRevenueSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "completedSales" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceRevenueSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE
);

-- Create unique constraint on WorkspaceRevenueSnapshot
CREATE UNIQUE INDEX "WorkspaceRevenueSnapshot_workspaceId_date_key" ON "WorkspaceRevenueSnapshot"("workspaceId", "date");

-- Create index on WorkspaceRevenueSnapshot
CREATE INDEX "WorkspaceRevenueSnapshot_workspaceId_date_idx" ON "WorkspaceRevenueSnapshot"("workspaceId", "date");

-- Create WorkspaceAlert table
CREATE TABLE "WorkspaceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "saleId" TEXT,
    "alertType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceAlert_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL
);

-- Create indexes on WorkspaceAlert
CREATE INDEX "WorkspaceAlert_workspaceId_idx" ON "WorkspaceAlert"("workspaceId");
CREATE INDEX "WorkspaceAlert_workspaceId_severity_idx" ON "WorkspaceAlert"("workspaceId", "severity");
CREATE INDEX "WorkspaceAlert_saleId_idx" ON "WorkspaceAlert"("saleId");
