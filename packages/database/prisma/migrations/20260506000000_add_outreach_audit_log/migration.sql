-- CAN-SPAM Compliance: Add OutreachAuditLog model and enum for audit trail
-- Tracks SENT, OPENED, CLICKED, BOUNCED, OPTED_OUT, SUPPRESSED events
-- Required to prove opt-outs are honored within 10 business days

-- Create enum type for OutreachAuditEvent
CREATE TYPE "OutreachAuditEvent" AS ENUM ('SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'OPTED_OUT', 'SUPPRESSED');

-- Create OutreachAuditLog table
CREATE TABLE "OutreachAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizerId" TEXT NOT NULL,
    "event" "OutreachAuditEvent" NOT NULL,
    "touchNumber" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutreachAuditLog_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX "OutreachAuditLog_organizerId_idx" ON "OutreachAuditLog"("organizerId");
CREATE INDEX "OutreachAuditLog_createdAt_idx" ON "OutreachAuditLog"("createdAt");
CREATE INDEX "OutreachAuditLog_organizerId_event_idx" ON "OutreachAuditLog"("organizerId", "event");
