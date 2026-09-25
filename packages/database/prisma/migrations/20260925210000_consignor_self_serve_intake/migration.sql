-- Consignor Self-Serve Intake (2026-09-25): self-serve "request to bring items in" form
-- plus lightweight appointment scheduling for intake. Approve-then-create: a real
-- Consignor is only ever created when the organizer clicks Approve on a
-- ConsignorIntakeRequest -- this migration is entirely additive (new nullable columns,
-- new tables), safe on populated tables.

-- AlterTable: WorkspaceSettings -- permanent, rotatable per-workspace intake link
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "intakeLinkToken" TEXT,
ADD COLUMN     "intakeLinkEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_intakeLinkToken_key" ON "WorkspaceSettings"("intakeLinkToken");

-- CreateTable: ConsignorIntakeRequest
CREATE TABLE "ConsignorIntakeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "requestedStartsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "resultingConsignorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignorIntakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsignorIntakeRequest_resultingConsignorId_key" ON "ConsignorIntakeRequest"("resultingConsignorId");
CREATE INDEX "ConsignorIntakeRequest_workspaceId_idx" ON "ConsignorIntakeRequest"("workspaceId");
CREATE INDEX "ConsignorIntakeRequest_status_idx" ON "ConsignorIntakeRequest"("status");

-- AddForeignKey
ALTER TABLE "ConsignorIntakeRequest" ADD CONSTRAINT "ConsignorIntakeRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsignorIntakeRequest" ADD CONSTRAINT "ConsignorIntakeRequest_resultingConsignorId_fkey" FOREIGN KEY ("resultingConsignorId") REFERENCES "Consignor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ConsignorIntakeAppointment
CREATE TABLE "ConsignorIntakeAppointment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "consignorId" TEXT,
    "intakeRequestId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsignorIntakeAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsignorIntakeAppointment_intakeRequestId_key" ON "ConsignorIntakeAppointment"("intakeRequestId");
CREATE INDEX "ConsignorIntakeAppointment_workspaceId_idx" ON "ConsignorIntakeAppointment"("workspaceId");
CREATE INDEX "ConsignorIntakeAppointment_startsAt_idx" ON "ConsignorIntakeAppointment"("startsAt");
CREATE INDEX "ConsignorIntakeAppointment_status_idx" ON "ConsignorIntakeAppointment"("status");

-- AddForeignKey
ALTER TABLE "ConsignorIntakeAppointment" ADD CONSTRAINT "ConsignorIntakeAppointment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsignorIntakeAppointment" ADD CONSTRAINT "ConsignorIntakeAppointment_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsignorIntakeAppointment" ADD CONSTRAINT "ConsignorIntakeAppointment_intakeRequestId_fkey" FOREIGN KEY ("intakeRequestId") REFERENCES "ConsignorIntakeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
