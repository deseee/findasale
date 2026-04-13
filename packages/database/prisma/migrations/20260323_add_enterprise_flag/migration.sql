-- Add isEnterpriseAccount flag to Organizer model (D-007: Teams Tier Member Cap)
ALTER TABLE "Organizer" ADD COLUMN "isEnterpriseAccount" BOOLEAN NOT NULL DEFAULT false;
