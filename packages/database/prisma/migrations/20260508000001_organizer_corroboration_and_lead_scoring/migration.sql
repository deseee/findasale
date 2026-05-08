-- Organizer model schema expansion: corroboration fields + lead scoring fields
ALTER TABLE "Organizer" ADD COLUMN "sourceCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organizer" ADD COLUMN "sourcesJson" JSONB;
ALTER TABLE "Organizer" ADD COLUMN "corroborationScore" DECIMAL(3,2) NOT NULL DEFAULT 0.5;
ALTER TABLE "Organizer" ADD COLUMN "dedupeKey" VARCHAR(255);

-- Lead scoring fields
ALTER TABLE "Organizer" ADD COLUMN "leadScore" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN "leadTier" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "lastScoredAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "annualSalesEstimate" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN "hasPhysicalOffice" BOOLEAN;
ALTER TABLE "Organizer" ADD COLUMN "isStateLicensed" BOOLEAN;
ALTER TABLE "Organizer" ADD COLUMN "licenseState" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "licenseNumber" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "staffSizeEstimate" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN "reviewCount" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN "reviewVelocity" DOUBLE PRECISION;

-- Indexes for corroboration and lead scoring queries
CREATE INDEX "Organizer_dedupeKey_idx" ON "Organizer"("dedupeKey");
CREATE INDEX "Organizer_corroborationScore_idx" ON "Organizer"("corroborationScore");
CREATE INDEX "Organizer_sourceCount_idx" ON "Organizer"("sourceCount");
