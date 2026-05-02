-- AddColumn esnOrgId
ALTER TABLE "Organizer" ADD COLUMN "esnOrgId" INTEGER;

-- AddColumn linkedInUrl
ALTER TABLE "Organizer" ADD COLUMN "linkedInUrl" TEXT;

-- AddColumn esnMemberships
ALTER TABLE "Organizer" ADD COLUMN "esnMemberships" JSONB;

-- AddColumn esnPackageType
ALTER TABLE "Organizer" ADD COLUMN "esnPackageType" TEXT;
